import { loadAgentSystemPrompt } from "@/lib/agents";
import { isAllowedChatModel } from "@/lib/models";
import {
  OPENROUTER_CHAT_URL,
  buildOpenRouterMessages,
  usageFromChunk,
  type OpenRouterUsage,
} from "@/lib/openrouter";
import { buildRetrievalQuery } from "@/lib/rag/query-text";
import {
  formatRetrievedContext,
  retrieveCriminalistaContext,
} from "@/lib/rag/retrieve";
import type { RetrievalResult } from "@/lib/rag/types";
import type { ChatRequestBody, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error:
          "OPENROUTER_API_KEY não configurada. Defina no arquivo .env.local e reinicie o servidor.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const model = body.model?.trim();
  const agentId = body.agentId?.trim();
  const messages = body.messages;

  if (!model || !agentId || !Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "Informe model, agentId e ao menos uma mensagem." },
      { status: 400 },
    );
  }

  if (!isAllowedChatModel(model)) {
    return Response.json(
      {
        error:
          "Modelo não permitido. Use um dos modelos comerciais da lista.",
      },
      { status: 400 },
    );
  }

  // System prompts stay on the server (regra 07). Never include them in the response.
  let systemPrompt: string;
  try {
    systemPrompt = await loadAgentSystemPrompt(agentId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar o agente.";
    return Response.json({ error: message }, { status: 400 });
  }

  const rag = await safeRetrieve(agentId, messages);
  if (rag.context) {
    systemPrompt = `${systemPrompt}\n\n${rag.context}`;
  }

  let openRouterMessages;
  try {
    openRouterMessages = await buildOpenRouterMessages({
      systemPrompt,
      messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao processar anexos.";
    return Response.json({ error: message }, { status: 400 });
  }

  // Commercial OpenRouter only — no Ollama / vLLM / self-hosted runtime.
  const upstream = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.OPENROUTER_HTTP_REFERER ?? "http://localhost:3000",
      "X-Title": "Suits MVP",
    },
    body: JSON.stringify({
      model,
      messages: openRouterMessages,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await safeReadError(upstream);
    return Response.json(
      { error: detail || `OpenRouter retornou ${upstream.status}.` },
      { status: upstream.status || 502 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedUsage = false;

      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const handled = handleSseFrame(frame, model, emit, rag);
            if (handled === "usage") {
              emittedUsage = true;
            }
          }
        }

        if (buffer.trim()) {
          const handled = handleSseFrame(buffer, model, emit, rag);
          if (handled === "usage") {
            emittedUsage = true;
          }
        }

        if (!emittedUsage) {
          emit(usageEvent(model, rag, {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            costSource: "unknown",
          }));
        }

        emit({ type: "done" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Falha no stream.";
        emit({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function handleSseFrame(
  frame: string,
  model: string,
  emit: (event: StreamEvent) => void,
  rag: RagTurn,
): "usage" | "other" {
  for (const line of frame.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    let parsed: {
      error?: { message?: string } | string;
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: OpenRouterUsage;
    };

    try {
      parsed = JSON.parse(data) as typeof parsed;
    } catch {
      continue;
    }

    if (parsed.error) {
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : parsed.error.message || "Erro no OpenRouter.";
      emit({ type: "error", error: message });
      continue;
    }

    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) {
      emit({ type: "delta", text: delta });
    }

    const usage = usageFromChunk(model, parsed.usage);
    if (usage) {
      emit(usageEvent(model, rag, usage));
      return "usage";
    }
  }

  return "other";
}

type RagTurn = {
  context: string;
  result: RetrievalResult | null;
};

async function safeRetrieve(
  agentId: string,
  messages: ChatRequestBody["messages"],
): Promise<RagTurn> {
  if (agentId !== "criminalista") {
    return { context: "", result: null };
  }

  try {
    const query = buildRetrievalQuery(messages);
    const result = await retrieveCriminalistaContext(query);
    return { context: formatRetrievedContext(result.chunks), result };
  } catch (error) {
    console.error("RAG skipped:", error);
    return { context: "", result: null };
  }
}

function usageEvent(
  model: string,
  rag: RagTurn,
  chat: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    costSource: "openrouter" | "estimate" | "unknown";
  },
): StreamEvent {
  const embeddingTokens = rag.result?.embeddingUsage.tokens ?? 0;
  const embeddingCostUsd = rag.result?.embeddingUsage.costUsd ?? 0;
  const embeddingCalls = rag.result?.embeddingUsage.calls ?? 0;
  const chatCostUsd = chat.costUsd;
  const embeddingSource = rag.result?.embeddingUsage.costSource;
  const costSource =
    chat.costSource === "unknown" && embeddingCostUsd > 0
      ? embeddingSource ?? "estimate"
      : chat.costSource;

  return {
    type: "usage",
    promptTokens: chat.promptTokens,
    completionTokens: chat.completionTokens,
    totalTokens: chat.totalTokens,
    chatCostUsd,
    embeddingTokens,
    embeddingCostUsd,
    embeddingCalls,
    costUsd: chatCostUsd + embeddingCostUsd,
    costSource,
    model,
    ragMode: rag.result?.mode,
    ragSources: rag.result
      ? [...new Set(rag.result.chunks.map((chunk) => chunk.source))]
      : [],
  };
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text) as {
        error?: { message?: string } | string;
      };
      if (typeof json.error === "string") {
        return json.error;
      }
      if (json.error?.message) {
        return json.error.message;
      }
    } catch {
      // keep raw text
    }
    return text.slice(0, 400);
  } catch {
    return "";
  }
}
