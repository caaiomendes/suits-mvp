import { EMBEDDING_PRICING, OPENROUTER_EMBEDDING_MODEL } from "@/lib/models";
import type { EmbeddingUsage } from "./types";

export const OPENROUTER_EMBEDDINGS_URL =
  "https://openrouter.ai/api/v1/embeddings";

const DEFAULT_BATCH = 64;

export async function embedTexts(
  texts: string[],
  options?: { apiKey?: string; model?: string; batchSize?: number },
): Promise<{ vectors: number[][]; usage: EmbeddingUsage }> {
  if (texts.length === 0) {
    return {
      vectors: [],
      usage: { tokens: 0, costUsd: 0, costSource: "estimate", calls: 0 },
    };
  }

  const apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY é necessária para embeddings.");
  }

  const model = options?.model ?? OPENROUTER_EMBEDDING_MODEL;
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const vectors: number[][] = new Array(texts.length);
  let tokens = 0;
  let costUsd = 0;
  let sawOpenRouterCost = false;
  let calls = 0;

  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
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
        input: batch,
        encoding_format: "float",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenRouter embeddings ${response.status}: ${detail.slice(0, 400)}`,
      );
    }

    const json = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
      usage?: { prompt_tokens?: number; total_tokens?: number; cost?: number };
    };

    calls += 1;
    const batchTokens = json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0;
    tokens += batchTokens;
    if (typeof json.usage?.cost === "number") {
      costUsd += json.usage.cost;
      sawOpenRouterCost = true;
    }

    for (const item of json.data ?? []) {
      if (!item.embedding) {
        continue;
      }
      const index = offset + (item.index ?? 0);
      vectors[index] = item.embedding;
    }
  }

  if (vectors.some((vector) => !vector)) {
    throw new Error("OpenRouter não devolveu embeddings para todos os textos.");
  }

  if (!sawOpenRouterCost) {
    const rate = EMBEDDING_PRICING[model] ?? 0.02;
    costUsd = (tokens / 1_000_000) * rate;
  }

  return {
    vectors,
    usage: {
      tokens,
      costUsd,
      costSource: sawOpenRouterCost ? "openrouter" : "estimate",
      calls,
    },
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
