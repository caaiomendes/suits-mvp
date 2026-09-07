import type { ModelOption } from "./types";

export const OPENROUTER_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** USD per 1M embedding tokens. */
export const EMBEDDING_PRICING: Record<string, number> = {
  "openai/text-embedding-3-small": 0.02,
};

/** USD per 1M tokens. Update when OpenRouter list prices change. */
export const MODEL_PRICING: Record<
  string,
  { inputUsdPerMillion: number; outputUsdPerMillion: number }
> = {
  "tencent/hy4-preview": {
    inputUsdPerMillion: 0.834,
    outputUsdPerMillion: 2.501,
  },
  "openai/gpt-5.6-luna": {
    inputUsdPerMillion: 0.20,
    outputUsdPerMillion: 1.20,
  },
  "z-ai/glm-5.3-flash": {
    inputUsdPerMillion: 0.075,
    outputUsdPerMillion: 0.25,
  },
  "deepseek/deepseek-v4-flash-0731": {
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
  },
};

export const DEFAULT_MODELS: ModelOption[] = [
  {
    id: "tencent/hy4-preview",
    label: "Hy4 preview",
    supportsVision: false,
    ...MODEL_PRICING["tencent/hy4-preview"],
  },
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    supportsVision: true,
    ...MODEL_PRICING["openai/gpt-5.6-luna"],
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    supportsVision: true,
    ...MODEL_PRICING["z-ai/glm-5.3-flash"],
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    label: "DeepSeek V4 Flash",
    supportsVision: false,
    ...MODEL_PRICING["deepseek/deepseek-v4-flash-0731"],
  },
];

export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";

const ALLOWED_CHAT_MODEL_IDS = new Set(DEFAULT_MODELS.map((model) => model.id));

/** This MVP calls OpenRouter only. No Ollama, vLLM, or other self-hosted runtime. */

export function getModelOption(modelId: string): ModelOption | undefined {
  return DEFAULT_MODELS.find((model) => model.id === modelId);
}

export function isAllowedChatModel(modelId: string): boolean {
  return ALLOWED_CHAT_MODEL_IDS.has(modelId);
}
