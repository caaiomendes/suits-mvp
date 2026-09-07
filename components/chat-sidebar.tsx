import { formatTokens, formatUsd } from "@/lib/cost";
import { DEFAULT_MODELS } from "@/lib/models";
import type { AgentInfo, CostSource } from "@/lib/types";

export function ChatSidebar({
  open,
  onClose,
  agents,
  agentId,
  onAgentChange,
  model,
  onModelChange,
  promptTokens,
  completionTokens,
  embeddingTokens,
  embeddingCalls,
  chatCostUsd,
  embeddingCostUsd,
  costUsd,
  costSource,
  ragSources,
  ragMode,
  turns,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  agentId: string;
  onAgentChange: (id: string) => void;
  model: string;
  onModelChange: (id: string) => void;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
  embeddingCalls: number;
  chatCostUsd: number;
  embeddingCostUsd: number;
  costUsd: number;
  costSource: CostSource | null;
  ragSources: string[];
  ragMode: "hybrid" | "bm25" | "vector" | "excerpt" | null;
  turns: number;
  onReset: () => void;
}) {
  const selectedModel = DEFAULT_MODELS.find((item) => item.id === model);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-stone-900/30 lg:hidden"
          aria-label="Fechar painel"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(22rem,100%)] flex-col border-l border-stone-200 bg-stone-50 transition-transform lg:static lg:z-0 lg:w-80 lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-start justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              Custo da sessão
            </p>
            <p className="mt-1 font-serif text-3xl text-stone-900">
              {formatUsd(costUsd)}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              {costLabel(costSource)} · {turns}{" "}
              {turns === 1 ? "turno" : "turnos"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-200 lg:hidden"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-3 px-5 py-4 text-sm">
          <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">Prompt</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatTokens(promptTokens)}
            </dd>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">Completion</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatTokens(completionTokens)}
            </dd>
          </div>
          <div className="col-span-2 rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">Chat USD</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatUsd(chatCostUsd)}
            </dd>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">Embeddings</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatUsd(embeddingCostUsd)}
            </dd>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <dt className="text-xs text-stone-500">Embed tokens</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatTokens(embeddingTokens)}
              {embeddingCalls > 0 ? (
                <span className="block text-[11px] font-normal text-stone-500">
                  {embeddingCalls} chamada{embeddingCalls === 1 ? "" : "s"}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
          <label className="block text-sm">
            <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              Agente
            </span>
            <select
              value={agentId}
              onChange={(event) => onAgentChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-stone-500">
              {agents.find((agent) => agent.id === agentId)?.description}
            </span>
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium tracking-wide text-stone-500 uppercase">
              Modelo
            </span>
            <select
              value={selectedModel?.id ?? DEFAULT_MODELS[0].id}
              onChange={(event) => onModelChange(event.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {DEFAULT_MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {selectedModel ? (
              <span className="mt-1 block text-xs text-stone-500">
                Tabela local: ${selectedModel.inputUsdPerMillion}/M in · $
                {selectedModel.outputUsdPerMillion}/M out
                {selectedModel.supportsVision ? " · visão" : ""}
              </span>
            ) : null}
          </label>

          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Nova sessão
          </button>

          {ragSources.length > 0 ? (
            <div className="text-xs text-stone-600">
              <p className="font-medium tracking-wide text-stone-500 uppercase">
                Trechos do corpus {ragMode ? `(${ragMode})` : ""}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {ragSources.map((source) => (
                  <li key={source} className="break-all">
                    {source}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs leading-5 text-stone-500">
            Sem login e sem banco. Só OpenRouter (modelos comerciais). O
            total soma chat + embeddings da consulta. O corpus Arquivos é
            buscado no servidor; só trechos curtos entram no contexto.
          </p>
        </div>
      </aside>
    </>
  );
}

function costLabel(source: CostSource | null): string {
  if (source === "openrouter") return "USD OpenRouter";
  if (source === "estimate") return "USD estimado";
  if (source === "unknown") return "USD indisponível";
  return "Aguardando o primeiro turno";
}
