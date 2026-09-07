export type RagChunk = {
  id: string;
  source: string;
  chunkIndex: number;
  heading?: string;
  page?: number;
  text: string;
};

export type RagMeta = {
  agentId: string;
  embeddingModel: string;
  embeddingDimensions: number;
  chunkChars: number;
  chunkOverlap: number;
  chunkCount: number;
  sources: string[];
  createdAt: string;
  embeddingsPresent: boolean;
};

export type EmbeddingUsage = {
  tokens: number;
  costUsd: number;
  costSource: "openrouter" | "estimate";
  calls: number;
};

export type RetrievedChunk = RagChunk & {
  score: number;
  vectorScore?: number;
  bm25Score?: number;
};

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  mode: "hybrid" | "bm25" | "vector";
  embeddingUsage: EmbeddingUsage;
};
