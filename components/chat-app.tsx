"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fileSizeLimitMessage,
  isAcceptedFile,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
} from "@/lib/attachments";
import type { ComposerAttachment } from "@/lib/composer-attachments";
import { attachmentsReady, isExtractingStatus } from "@/lib/composer-attachments";
import { extractAttachment, isExtractAborted } from "@/lib/extract-client";
import { DEFAULT_MODEL_ID, isAllowedChatModel } from "@/lib/models";
import { readChatSse } from "@/lib/sse";
import type {
  AgentInfo,
  ChatMessagePayload,
  CostSource,
  StreamEvent,
} from "@/lib/types";
import { ChatComposer } from "./chat-composer";
import { ChatSidebar } from "./chat-sidebar";
import { ChatThread, type ThreadMessage } from "./chat-thread";

const FALLBACK_AGENTS: AgentInfo[] = [
  {
    id: "criminalista",
    name: "Criminalista",
    description: "Direito penal brasileiro com RAG sobre o corpus Arquivos",
  },
];

type StoredMessage = ThreadMessage & {
  payload?: ChatMessagePayload;
};

export function ChatApp() {
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK_AGENTS);
  const [agentId, setAgentId] = useState("criminalista");
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const extractAborts = useRef(new Map<string, () => void>());
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  attachmentsRef.current = attachments;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/agents")
      .then((response) => response.json())
      .then((data: { agents?: AgentInfo[] }) => {
        if (!cancelled && data.agents?.length) {
          setAgents(data.agents);
          setAgentId((current) =>
            data.agents!.some((agent) => agent.id === current)
              ? current
              : data.agents![0].id,
          );
        }
      })
      .catch(() => {
        // keep fallback Criminalista
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAllowedChatModel(model)) {
      setModel(DEFAULT_MODEL_ID);
    }
  }, [model]);

  useEffect(() => {
    const aborts = extractAborts.current;
    return () => {
      for (const abort of aborts.values()) {
        abort();
      }
      aborts.clear();
    };
  }, []);

  useEffect(() => {
    const pane = threadRef.current;
    if (!pane) {
      return;
    }
    pane.scrollTo({ top: pane.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const totals = useMemo(() => {
    let promptTokens = 0;
    let completionTokens = 0;
    let embeddingTokens = 0;
    let embeddingCalls = 0;
    let chatCostUsd = 0;
    let embeddingCostUsd = 0;
    let costUsd = 0;
    let costSource: CostSource | null = null;
    let turns = 0;
    const ragSources = new Set<string>();
    let ragMode: "hybrid" | "bm25" | "vector" | "excerpt" | null = null;

    for (const message of messages) {
      if (!message.usage) {
        continue;
      }
      turns += 1;
      promptTokens += message.usage.promptTokens;
      completionTokens += message.usage.completionTokens;
      embeddingTokens += message.usage.embeddingTokens ?? 0;
      embeddingCalls += message.usage.embeddingCalls ?? 0;
      chatCostUsd += message.usage.chatCostUsd ?? message.usage.costUsd;
      embeddingCostUsd += message.usage.embeddingCostUsd ?? 0;
      costUsd += message.usage.costUsd;
      costSource = message.usage.costSource;
      ragMode = message.usage.ragMode ?? ragMode;
      for (const source of message.usage.ragSources ?? []) {
        ragSources.add(source);
      }
    }

    return {
      promptTokens,
      completionTokens,
      embeddingTokens,
      embeddingCalls,
      chatCostUsd,
      embeddingCostUsd,
      costUsd,
      costSource,
      turns,
      ragSources: [...ragSources],
      ragMode,
    };
  }, [messages]);

  function abortAllExtracts() {
    for (const abort of extractAborts.current.values()) {
      abort();
    }
    extractAborts.current.clear();
  }

  function resetSession() {
    abortAllExtracts();
    setMessages([]);
    setDraft("");
    setAttachments([]);
    setError(null);
    setStreaming(false);
  }

  function updateAttachment(
    id: string,
    patch: Partial<ComposerAttachment>,
  ) {
    setAttachments((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeAttachment(id: string) {
    extractAborts.current.get(id)?.();
    extractAborts.current.delete(id);
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  function addFiles(list: FileList | null) {
    if (!list) {
      return;
    }

    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (!isAcceptedFile(file)) {
        setError(`Tipo não suportado: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(fileSizeLimitMessage(file.name, MAX_FILE_BYTES));
        continue;
      }
      if (file.type.startsWith("image/") && file.size > MAX_IMAGE_BYTES) {
        setError(fileSizeLimitMessage(file.name, MAX_IMAGE_BYTES));
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      return;
    }

    setError(null);
    const room = Math.max(0, 6 - attachmentsRef.current.length);
    const created: ComposerAttachment[] = accepted.slice(0, room).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "preparing",
      extractedChars: 0,
    }));
    if (created.length === 0) {
      return;
    }
    setAttachments((current) => [...current, ...created]);
    for (const item of created) {
      startExtract(item.id, item.file);
    }
  }

  function startExtract(id: string, file: File) {
    const { promise, abort } = extractAttachment(file, (progress) => {
      updateAttachment(id, {
        status: progress.phase,
        page: progress.page,
        pages: progress.pages,
        extractedChars: progress.chars,
        error: progress.error,
      });
    });
    extractAborts.current.set(id, abort);
    void promise
      .then((payload) => {
        extractAborts.current.delete(id);
        updateAttachment(id, {
          status: "ready",
          payload,
          extractedChars:
            payload.kind === "text" ? payload.text.length : undefined,
          error: undefined,
        });
      })
      .catch((err: unknown) => {
        extractAborts.current.delete(id);
        if (isExtractAborted(err)) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Falha ao ler anexos.";
        updateAttachment(id, {
          status: "error",
          error: message,
        });
        setError(message);
      });
  }

  async function sendMessage() {
    const content = draft.trim();
    if (streaming || (!content && attachments.length === 0)) {
      return;
    }
    if (attachments.some((item) => isExtractingStatus(item.status))) {
      return;
    }
    if (attachments.some((item) => item.status === "error")) {
      setError(
        attachments.find((item) => item.error)?.error ??
          "Remova o anexo com falha antes de enviar.",
      );
      return;
    }
    if (attachments.length > 0 && !attachmentsReady(attachments)) {
      return;
    }

    const payloads = [];
    for (const item of attachments) {
      if (!item.payload) {
        setError("A extração ainda não terminou.");
        return;
      }
      payloads.push(item.payload);
    }

    setError(null);
    setStreaming(true);

    const userPayload: ChatMessagePayload = {
      role: "user",
      content,
      attachments: payloads,
    };

    const userMessage: StoredMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      attachments: attachments.map((item) => ({
        name: item.file.name,
        kind:
          item.payload?.kind === "image"
            ? "image"
            : item.payload?.kind === "text"
              ? "text"
              : "file",
        extractedChars:
          item.payload?.kind === "text" ? item.payload.text.length : undefined,
        fileBytes: item.file.size,
      })),
      payload: userPayload,
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: StoredMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);
    setDraft("");
    setAttachments([]);

    const requestMessages: ChatMessagePayload[] = history.map((message) => {
      if (message.payload) {
        return message.payload;
      }
      return { role: message.role, content: message.content };
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          agentId,
          messages: requestMessages,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || `Erro ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Resposta sem corpo.");
      }

      await readChatSse(response.body, (event) => applyStreamEvent(assistantId, event));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar.";
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, error: message, content: item.content || "" }
            : item,
        ),
      );
    } finally {
      setStreaming(false);
    }
  }

  function applyStreamEvent(assistantId: string, event: StreamEvent) {
    if (event.type === "delta") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, content: item.content + event.text }
            : item,
        ),
      );
      return;
    }

    if (event.type === "usage") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                usage: {
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                  costUsd: event.costUsd,
                  chatCostUsd: event.chatCostUsd,
                  embeddingTokens: event.embeddingTokens,
                  embeddingCostUsd: event.embeddingCostUsd,
                  embeddingCalls: event.embeddingCalls,
                  costSource: event.costSource,
                  ragSources: event.ragSources,
                  ragMode: event.ragMode,
                },
              }
            : item,
        ),
      );
      return;
    }

    if (event.type === "error") {
      setError(event.error);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, error: event.error } : item,
        ),
      );
    }
  }

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-[#f4efe6] text-stone-900">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200/80 bg-[#f4efe6]/95 px-4 py-3 backdrop-blur sm:px-6">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-amber-800/80 uppercase">
              Suits MVP
            </p>
            <h1 className="font-serif text-xl text-stone-900">
              Chat de custo · sessão local
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-stone-600 sm:block">
              {totals.costUsd > 0 ? (
                <span className="font-medium text-stone-900">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  }).format(totals.costUsd)}
                </span>
              ) : (
                "$0.00"
              )}
            </p>
            <button
              type="button"
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/20 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              Custo e modelo
            </button>
          </div>
        </header>

        <div
          ref={threadRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <ChatThread
            messages={messages}
            streaming={streaming}
            onPickPrompt={setDraft}
          />
        </div>

        {error ? (
          <div className="shrink-0 px-4 pb-1 sm:px-6">
            <p className="mx-auto max-w-3xl rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          </div>
        ) : null}

        <div className="shrink-0">
          <ChatComposer
            value={draft}
            attachments={attachments}
            disabled={streaming}
            sendBlocked={
              (!draft.trim() && attachments.length === 0) ||
              attachments.some((item) => item.status !== "ready")
            }
            onChange={setDraft}
            onFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            onSubmit={() => {
              void sendMessage();
            }}
          />
        </div>
      </div>

      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        agents={agents}
        agentId={agentId}
        onAgentChange={setAgentId}
        model={model}
        onModelChange={(id) => {
          if (isAllowedChatModel(id)) {
            setModel(id);
          }
        }}
        promptTokens={totals.promptTokens}
        completionTokens={totals.completionTokens}
        embeddingTokens={totals.embeddingTokens}
        embeddingCalls={totals.embeddingCalls}
        chatCostUsd={totals.chatCostUsd}
        embeddingCostUsd={totals.embeddingCostUsd}
        costUsd={totals.costUsd}
        costSource={totals.costSource}
        ragSources={totals.ragSources}
        ragMode={totals.ragMode}
        turns={totals.turns}
        onReset={resetSession}
      />
    </div>
  );
}
