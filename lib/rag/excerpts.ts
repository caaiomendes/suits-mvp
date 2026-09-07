import { extractLegalCitations } from "./bm25";
import { loadChunks } from "./store";
import type { RetrievedChunk } from "./types";

const WINDOW_CHARS = 1100;
const MAX_EXCERPTS = 3;

const LEGAL_TOPIC_RE =
  /\b(art(?:igo)?\.?|lei\s+n?[ºo.]?\s*\d+|c[oó]digo penal|c[oó]digo de processo penal|\bcp\b|\bcpp\b|s[uú]mula|jurisprud[eê]ncia|homic[ií]dio|tr[aá]fico|habeas corpus)\b/i;

export function shouldInjectCorpusExcerpts(query: string): boolean {
  return (
    extractLegalCitations(query).length > 0 || LEGAL_TOPIC_RE.test(query)
  );
}

export async function grepCorpusExcerpts(
  query: string,
): Promise<RetrievedChunk[]> {
  if (!shouldInjectCorpusExcerpts(query)) {
    return [];
  }

  const citations = extractLegalCitations(query);
  const patterns = buildSearchPatterns(query, citations);
  if (patterns.length === 0) {
    return [];
  }

  const chunks = await loadChunks();
  const hits: RetrievedChunk[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    for (const chunk of chunks) {
      const match = pattern.exec(chunk.text);
      pattern.lastIndex = 0;
      if (!match || match.index == null) {
        continue;
      }

      const excerpt = windowAround(chunk.text, match.index, WINDOW_CHARS);
      const key = `${chunk.source}:${excerpt.slice(0, 80)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hits.push({
        ...chunk,
        text: excerpt,
        score: 1,
      });
      if (hits.length >= MAX_EXCERPTS) {
        return hits;
      }
      break;
    }
  }

  return hits;
}

function buildSearchPatterns(query: string, citations: string[]): RegExp[] {
  const patterns: RegExp[] = [];

  for (const citation of citations) {
    const article = citation.match(/^art\.\s*(\d+[a-z]?)$/i);
    if (article) {
      patterns.push(
        new RegExp(`art(?:igo)?\\.?\\s*${article[1]}\\b`, "i"),
      );
      continue;
    }
    if (citation.startsWith("lei ")) {
      const number = citation.slice(4).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push(new RegExp(`lei\\s+(n[ºo.]?\\s*)?${number}`, "i"));
    }
  }

  if (patterns.length === 0 && LEGAL_TOPIC_RE.test(query)) {
    const token = query.match(LEGAL_TOPIC_RE)?.[0];
    if (token && token.length > 3) {
      patterns.push(
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      );
    }
  }

  return patterns;
}

function windowAround(text: string, index: number, size: number): string {
  const articleStart = text.lastIndexOf("\nArt", index);
  const start =
    articleStart >= 0 && index - articleStart < size
      ? articleStart + 1
      : Math.max(0, index - Math.floor(size * 0.15));
  const slice = text.slice(start, start + size).trim();
  return slice;
}
