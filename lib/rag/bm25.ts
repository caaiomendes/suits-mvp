import type { RagChunk } from "./types";

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "que",
  "se",
  "ao",
  "à",
  "ou",
]);

const KEEP = new Set(["art", "artigo", "cp", "cpp", "stf", "stj", "lei", "hc"]);

export type Bm25Index = {
  chunks: RagChunk[];
  avgdl: number;
  df: Map<string, number>;
  tf: Array<Map<string, number>>;
  lengths: number[];
};

export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[a-z0-9ºª]+/g)
    ?.filter((token) => KEEP.has(token) || (!STOPWORDS.has(token) && token.length > 1)) ?? [];
}

export function buildBm25Index(chunks: RagChunk[]): Bm25Index {
  const tf: Array<Map<string, number>> = [];
  const df = new Map<string, number>();
  const lengths: number[] = [];
  let totalLen = 0;

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const freq = new Map<string, number>();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    for (const token of freq.keys()) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
    tf.push(freq);
    lengths.push(tokens.length);
    totalLen += tokens.length;
  }

  return {
    chunks,
    avgdl: chunks.length ? totalLen / chunks.length : 0,
    df,
    tf,
    lengths,
  };
}

export function bm25Search(
  index: Bm25Index,
  query: string,
  limit = 20,
): Array<{ index: number; score: number }> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || index.chunks.length === 0) {
    return [];
  }

  const k1 = 1.5;
  const b = 0.75;
  const n = index.chunks.length;
  const scores = new Array<number>(n).fill(0);
  const unique = [...new Set(queryTokens)];

  for (const token of unique) {
    const df = index.df.get(token);
    if (!df) {
      continue;
    }
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < n; i += 1) {
      const freq = index.tf[i].get(token);
      if (!freq) {
        continue;
      }
      const dl = index.lengths[i] || 1;
      const denom = freq + k1 * (1 - b + (b * dl) / (index.avgdl || 1));
      scores[i] += idf * ((freq * (k1 + 1)) / denom);
    }
  }

  return scores
    .map((score, indexValue) => ({ index: indexValue, score }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function extractLegalCitations(query: string): string[] {
  const citations = new Set<string>();
  const article = query.matchAll(
    /\b(?:art(?:igo)?\.?\s*)(\d+[a-z]?)(?:\s*(?:ao|a|e|-|–)\s*(\d+[a-z]?))?/gi,
  );

  for (const match of article) {
    citations.add(`art. ${match[1].toLowerCase()}`);
    if (match[2]) {
      citations.add(`art. ${match[2].toLowerCase()}`);
    }
  }

  for (const match of query.matchAll(/\b(cp|cpp|cpm|stf|stj|hc|sumula|súmula)\b/gi)) {
    citations.add(match[1].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
  }

  for (const match of query.matchAll(/\blei\s+(n[ºo.]?\s*)?(\d+\.?\d*\/\d+)/gi)) {
    citations.add(`lei ${match[2]}`);
  }

  return [...citations];
}

export function citationBoost(
  chunk: { text: string; source: string },
  citations: string[],
): number {
  if (citations.length === 0) {
    return 0;
  }

  const haystack = chunk.text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const source = chunk.source.toLowerCase();
  let boost = 0;

  for (const citation of citations) {
    const compact = citation.replace(/\s+/g, " ");
    const article = compact.match(/^art\.\s*(\d+[a-z]?)$/);
    if (article) {
      const number = article[1];
      if (
        new RegExp(`art(?:igo)?\\.?\\s*${number}\\b`, "i").test(haystack)
      ) {
        boost += 3;
      }
      continue;
    }

    if (compact.startsWith("lei ") && haystack.includes(compact)) {
      boost += 2;
      continue;
    }

    if (compact === "cp" && /codigo-penal|codigo_penal/.test(source)) {
      boost += 0.4;
    }
    if (compact === "cpp" && /processo-penal|cpp-/.test(source)) {
      boost += 0.4;
    }
    if (compact === "stj" && /stj|jurisprudencia/.test(source)) {
      boost += 0.3;
    }
  }

  return boost;
}
