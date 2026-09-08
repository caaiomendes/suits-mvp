import type { CostSource } from "@/lib/types";
import { MarkdownMessage } from "./markdown-message";

export type ThreadAttachment = {
  name: string;
  kind: "text" | "image" | "file";
  extractedChars?: number;
};

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ThreadAttachment[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    chatCostUsd?: number;
    embeddingTokens?: number;
    embeddingCostUsd?: number;
    embeddingCalls?: number;
    costSource: CostSource;
    ragSources?: string[];
    ragMode?: "hybrid" | "bm25" | "vector" | "excerpt";
  };
  error?: string;
};

const SUGGESTIONS = [
  "Quais os requisitos da prisão em flagrante no art. 302 do CPP?",
  "Diferença entre flagrante próprio, impróprio e presumido.",
  "Como impugnar um auto de prisão em flagrante?",
];

export function ChatThread({
  messages,
  streaming,
  onPickPrompt,
}: {
  messages: ThreadMessage[];
  streaming: boolean;
  onPickPrompt?: (prompt: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-lg text-center">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-amber-800/80 uppercase">
            Sessão de teste
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900">
            Converse com o Criminalista
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Envie uma pergunta (por exemplo um artigo do CP/CPP), anexe uma
            peça e acompanhe o custo no painel. O servidor busca trechos do
            corpus Arquivos — a sessão some ao atualizar a página.
          </p>
          {onPickPrompt ? (
            <ul className="mt-6 flex flex-col gap-2 text-left">
              {SUGGESTIONS.map((prompt) => (
                <li key={prompt}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-stone-200 bg-white/80 px-3.5 py-2.5 text-left text-sm leading-5 text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-white hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/20"
                    onClick={() => onPickPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"
      aria-live="polite"
      aria-busy={streaming}
    >
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        const showCursor =
          streaming && isLast && message.role === "assistant" && !message.error;
        const isUser = message.role === "user";
        const waitingForFirstToken = showCursor && !message.content;

        return (
          <article
            key={message.id}
            className={
              isUser
                ? "ml-auto w-fit max-w-[min(36rem,88%)] rounded-2xl bg-stone-900 px-4 py-3 text-stone-50"
                : "mr-auto w-full rounded-2xl border border-stone-200/90 bg-white px-4 py-3.5 text-stone-800 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_rgba(28,25,23,0.04)]"
            }
          >
            <p
              className={
                isUser
                  ? "text-[11px] font-medium tracking-[0.14em] text-stone-300 uppercase"
                  : "text-[11px] font-medium tracking-[0.14em] text-stone-400 uppercase"
              }
            >
              {isUser ? "Usuário" : "Assistente"}
            </p>
            {message.attachments && message.attachments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {message.attachments.map((attachment) => (
                  <li
                    key={attachment.name}
                    className={
                      isUser
                        ? "rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-stone-200"
                        : "rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600"
                    }
                  >
                    {attachmentChipLabel(attachment)}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2">
              {waitingForFirstToken ? (
                <p className="flex items-center gap-2 text-sm text-stone-500">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-800" />
                  Redigindo análise…
                </p>
              ) : message.content ? (
                <MarkdownMessage
                  content={message.content}
                  variant={message.role}
                  showCursor={showCursor}
                />
              ) : (
                <p className="text-sm text-stone-400">…</p>
              )}
            </div>
            {message.error ? (
              <p className="mt-2 text-sm text-red-700">{message.error}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function attachmentChipLabel(attachment: ThreadAttachment): string {
  const prefix = attachmentLabel(attachment.kind);
  if (
    attachment.kind === "text" &&
    typeof attachment.extractedChars === "number"
  ) {
    const count = attachment.extractedChars.toLocaleString("pt-BR");
    return `${prefix} ${attachment.name} · ${count} caracteres (integral)`;
  }
  return `${prefix} ${attachment.name}`;
}

function attachmentLabel(kind: ThreadAttachment["kind"]): string {
  if (kind === "image") return "Imagem:";
  if (kind === "text") return "Texto:";
  return "Arquivo:";
}
