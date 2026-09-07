"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filesToAttachments, isAcceptedFile } from "@/lib/attachments";
import { DEFAULT_MODEL_ID } from "@/lib/models";
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
  const [files, setFiles] = useState<File[]>([]);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    let ragMode: "hybrid" | "bm25" | "vector" | null = null;

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

  function resetSession() {
    setMessages([]);
    setDraft("");
    setFiles([]);
    setError(null);
    setStreaming(false);
  }

  function addFiles(list: FileList | null) {
    if (!list) {
      return;
    }

    const next = Array.from(list).filter((file) => {
      if (!isAcceptedFile(file)) {
        setError(`Tipo não suportado: ${file.name}`);
        return false;
      }
      return true;
    });

    setFiles((current) => [...current, ...next].slice(0, 6));
  }

  async function sendMessage() {
    const content = draft.trim();
    if (streaming || (!content && files.length === 0)) {
      return;
    }

    setError(null);
    setStreaming(true);

    let attachments;
    try {
      attachments = await filesToAttachments(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler anexos.");
      setStreaming(false);
      return;
    }

    const userPayload: ChatMessagePayload = {
      role: "user",
      content,
      attachments,
    };

    const userMessage: StoredMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      attachments: attachments.map((attachment) => ({
        name: attachment.name,
        kind:
          attachment.kind === "image"
            ? "image"
            : attachment.kind === "text"
              ? "text"
              : "file",
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
    setFiles([]);

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
    <div className="flex min-h-dvh bg-[#f4efe6] text-stone-900">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-stone-200 bg-[#f4efe6]/90 px-4 py-3 backdrop-blur sm:px-6">
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
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              Custo e modelo
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ChatThread messages={messages} streaming={streaming} />
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className="px-4 sm:px-6">
            <p className="mx-auto max-w-3xl rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          </div>
        ) : null}

        <ChatComposer
          value={draft}
          files={files}
          disabled={streaming}
          onChange={setDraft}
          onFiles={addFiles}
          onRemoveFile={(name) =>
            setFiles((current) => current.filter((file) => file.name !== name))
          }
          onSubmit={() => {
            void sendMessage();
          }}
        />
      </div>

      <ChatSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        agents={agents}
        agentId={agentId}
        onAgentChange={setAgentId}
        model={model}
        onModelChange={setModel}
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
