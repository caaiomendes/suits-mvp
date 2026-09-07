import { MODEL_PRICING } from "./models";
import type { CostSource } from "./types";

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  const rates = MODEL_PRICING[model];
  if (!rates) {
    return null;
  }

  return (
    (promptTokens / 1_000_000) * rates.inputUsdPerMillion +
    (completionTokens / 1_000_000) * rates.outputUsdPerMillion
  );
}

export function resolveTurnCost(input: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  openRouterCost?: number;
}): { costUsd: number; costSource: CostSource } {
  if (
    typeof input.openRouterCost === "number" &&
    Number.isFinite(input.openRouterCost)
  ) {
    return { costUsd: input.openRouterCost, costSource: "openrouter" };
  }

  const estimated = estimateCostUsd(
    input.model,
    input.promptTokens,
    input.completionTokens,
  );

  if (estimated == null) {
    return { costUsd: 0, costSource: "unknown" };
  }

  return { costUsd: estimated, costSource: "estimate" };
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return "$0.00";
  }

  if (amount < 0.01) {
    return `$${amount.toFixed(6)}`;
  }

  return `$${amount.toFixed(4)}`;
}

export function formatTokens(count: number): string {
  return count.toLocaleString("pt-BR");
}
