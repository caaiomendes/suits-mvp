import type { ModelOption } from "./types";

/** USD per 1M tokens. Update when OpenRouter list prices change. */
export const MODEL_PRICING: Record<
  string,
  { inputUsdPerMillion: number; outputUsdPerMillion: number }
> = {
  "anthropic/claude-sonnet-4": {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  },
  "openai/gpt-4o": {
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10,
  },
  "google/gemini-2.5-pro": {
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
  },
};

export const DEFAULT_MODELS: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    supportsVision: true,
    ...MODEL_PRICING["anthropic/claude-sonnet-4"],
  },
  {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    supportsVision: true,
    ...MODEL_PRICING["openai/gpt-4o"],
  },
  {
    id: "google/gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    supportsVision: true,
    ...MODEL_PRICING["google/gemini-2.5-pro"],
  },
];

export const DEFAULT_MODEL_ID = DEFAULT_MODELS[0].id;

export function getModelOption(modelId: string): ModelOption | undefined {
  return DEFAULT_MODELS.find((model) => model.id === modelId);
}
