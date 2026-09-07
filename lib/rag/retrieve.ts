import { OPENROUTER_EMBEDDING_MODEL } from "@/lib/models";
import { cosineSimilarity, embedTexts } from "./embed";
import {
  bm25Search,
  buildBm25Index,
  citationBoost,
  extractLegalCitations,
  type Bm25Index,
} from "./bm25";
import {
  defaultEmbeddingModel,
  loadChunks,
  loadEmbeddings,
  loadMeta,
} from "./store";
import type { RagChunk, RetrievalResult, RetrievedChunk } from "./types";

const TOP_K = 10;
const CANDIDATE_POOL = 24;
const RRF_K = 60;

type IndexCache = {
  chunks: RagChunk[];
  bm25: Bm25Index;
  embeddings: number[][] | null;
  model: string;
};

let cache: IndexCache | null = null;
let loading: Promise<IndexCache> | null = null;

export async function retrieveCriminalistaContext(
  query: string,
): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      chunks: [],
      mode: "bm25",
      embeddingUsage: { tokens: 0, costUsd: 0, costSource: "estimate", calls: 0 },
    };
  }

  const index = await getIndex();
  const citations = extractLegalCitations(trimmed);
  const bm25Hits = bm25Search(index.bm25, trimmed, CANDIDATE_POOL);

  let vectorHits: Array<{ index: number; score: number }> = [];
  let embeddingUsage: RetrievalResult["embeddingUsage"] = {
    tokens: 0,
    costUsd: 0,
    costSource: "estimate",
    calls: 0,
  };

  if (index.embeddings) {
    const embedded = await embedTexts([trimmed], {
      model: index.model,
    });
    embeddingUsage = embedded.usage;
    const queryVector = embedded.vectors[0];
    vectorHits = index.embeddings
      .map((vector, i) => ({
        index: i,
        score: cosineSimilarity(queryVector, vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, CANDIDATE_POOL);
  }

  const merged = reciprocalRankFusion(
    index.chunks,
    bm25Hits,
    vectorHits,
    citations,
  ).slice(0, TOP_K);

  const mode = index.embeddings
    ? "hybrid"
    : ("bm25" as RetrievalResult["mode"]);

  return { chunks: merged, mode, embeddingUsage };
}

export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const blocks = chunks.map((chunk, index) => {
    const heading = chunk.heading ? ` · ${chunk.heading}` : "";
    const page = chunk.page ? ` · p. ${chunk.page}` : "";
    return `[${index + 1}] Fonte: ${chunk.source}${heading}${page}\n${chunk.text}`;
  });

  return [
    "===== BASE LEGAL (trechos recuperados) =====",
    "Use exclusivamente estes trechos como base normativa/jurisprudencial recuperada.",
    "Cite o arquivo-fonte. Não invente artigo, ementa ou tese que não esteja abaixo.",
    "O corpus completo NÃO está neste contexto — apenas os trechos ranqueados.",
    "",
    ...blocks,
    "===== FIM DA BASE LEGAL =====",
  ].join("\n");
}

async function getIndex(): Promise<IndexCache> {
  if (cache) {
    return cache;
  }
  if (!loading) {
    loading = loadIndex().finally(() => {
      loading = null;
    });
  }
  cache = await loading;
  return cache;
}

async function loadIndex(): Promise<IndexCache> {
  const chunks = await loadChunks();
  const meta = await loadMeta();
  const embeddings = await loadEmbeddings(chunks.length);
  return {
    chunks,
    bm25: buildBm25Index(chunks),
    embeddings,
    model: meta?.embeddingModel ?? defaultEmbeddingModel() ?? OPENROUTER_EMBEDDING_MODEL,
  };
}

function reciprocalRankFusion(
  chunks: RagChunk[],
  bm25Hits: Array<{ index: number; score: number }>,
  vectorHits: Array<{ index: number; score: number }>,
  citations: string[],
): RetrievedChunk[] {
  const scores = new Map<
    number,
    { score: number; vectorScore?: number; bm25Score?: number }
  >();

  const add = (
    hits: Array<{ index: number; score: number }>,
    kind: "vector" | "bm25",
  ) => {
    hits.forEach((hit, rank) => {
      const current = scores.get(hit.index) ?? { score: 0 };
      current.score += 1 / (RRF_K + rank + 1);
      if (kind === "vector") {
        current.vectorScore = hit.score;
      } else {
        current.bm25Score = hit.score;
      }
      scores.set(hit.index, current);
    });
  };

  add(bm25Hits, "bm25");
  add(vectorHits, "vector");

  if (citations.length > 0) {
    chunks.forEach((chunk, index) => {
      const boost = citationBoost(chunk, citations);
      if (boost <= 0) {
        return;
      }
      const current = scores.get(index) ?? { score: 0 };
      current.score += boost;
      scores.set(index, current);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([index, value]) => ({
      ...chunks[index],
      score: value.score,
      vectorScore: value.vectorScore,
      bm25Score: value.bm25Score,
    }));
}

export function resetRagCache(): void {
  cache = null;
}
