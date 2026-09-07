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
  costUsd,
  costSource,
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
  costUsd: number;
  costSource: CostSource | null;
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
            <dt className="text-xs text-stone-500">Total de tokens</dt>
            <dd className="mt-1 font-medium text-stone-900">
              {formatTokens(promptTokens + completionTokens)}
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
              value={
                DEFAULT_MODELS.some((item) => item.id === model)
                  ? model
                  : "__custom__"
              }
              onChange={(event) => {
                if (event.target.value !== "__custom__") {
                  onModelChange(event.target.value);
                }
              }}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              {DEFAULT_MODELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              <option value="__custom__">Outro (ID OpenRouter)</option>
            </select>
            <input
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-800"
              placeholder="provedor/modelo"
            />
            {selectedModel ? (
              <span className="mt-1 block text-xs text-stone-500">
                Tabela local: ${selectedModel.inputUsdPerMillion}/M in · $
                {selectedModel.outputUsdPerMillion}/M out
                {selectedModel.supportsVision ? " · visão" : ""}
              </span>
            ) : (
              <span className="mt-1 block text-xs text-stone-500">
                Sem preço local. O custo virá do `usage` do OpenRouter, se
                houver.
              </span>
            )}
          </label>

          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
          >
            Nova sessão
          </button>

          <p className="text-xs leading-5 text-stone-500">
            Sem login e sem banco. O histórico existe só nesta aba. Preferimos o
            campo <code className="font-mono">usage.cost</code> do OpenRouter;
            se não vier, usamos a tabela de preços dos modelos padrão.
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
