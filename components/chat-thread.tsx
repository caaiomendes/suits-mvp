import type { CostSource } from "@/lib/types";

export type ThreadAttachment = {
  name: string;
  kind: "text" | "image" | "file";
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
    costSource: CostSource;
  };
  error?: string;
};

export function ChatThread({
  messages,
  streaming,
}: {
  messages: ThreadMessage[];
  streaming: boolean;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-lg text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-800/80 uppercase">
            Sessão de teste
          </p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight text-stone-900">
            Converse com o Criminalista
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Envie uma pergunta, anexe uma peça e acompanhe o custo da sessão no
            painel. Nada é salvo: atualizar a página começa uma sessão nova.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        const showCursor =
          streaming && isLast && message.role === "assistant" && !message.error;

        return (
          <article
            key={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-stone-900 px-4 py-3 text-stone-50"
                : "mr-auto max-w-[90%] rounded-2xl border border-stone-200 bg-white px-4 py-3 text-stone-800 shadow-sm"
            }
          >
            <p className="text-[11px] font-medium tracking-wide uppercase opacity-60">
              {message.role === "user" ? "Você" : "Assistente"}
            </p>
            {message.attachments && message.attachments.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {message.attachments.map((attachment) => (
                  <li
                    key={attachment.name}
                    className={
                      message.role === "user"
                        ? "rounded-full bg-white/10 px-2 py-0.5 text-[11px]"
                        : "rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600"
                    }
                  >
                    {attachmentLabel(attachment.kind)} {attachment.name}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {message.content || (showCursor ? "" : "…")}
              {showCursor ? (
                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-amber-700 align-middle" />
              ) : null}
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

function attachmentLabel(kind: ThreadAttachment["kind"]): string {
  if (kind === "image") return "Imagem:";
  if (kind === "text") return "Texto:";
  return "Arquivo:";
}
