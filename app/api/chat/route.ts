import { loadAgentSystemPrompt } from "@/lib/agents";
import {
  OPENROUTER_CHAT_URL,
  buildOpenRouterMessages,
  usageFromChunk,
  type OpenRouterUsage,
} from "@/lib/openrouter";
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

  let systemPrompt: string;
  try {
    systemPrompt = await loadAgentSystemPrompt(agentId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao carregar o agente.";
    return Response.json({ error: message }, { status: 400 });
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
            const handled = handleSseFrame(frame, model, emit);
            if (handled === "usage") {
              emittedUsage = true;
            }
          }
        }

        if (buffer.trim()) {
          const handled = handleSseFrame(buffer, model, emit);
          if (handled === "usage") {
            emittedUsage = true;
          }
        }

        if (!emittedUsage) {
          emit({
            type: "usage",
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            costSource: "unknown",
            model,
          });
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
      emit({
        type: "usage",
        ...usage,
        model,
      });
      return "usage";
    }
  }

  return "other";
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
