import { grepCorpusExcerpts, shouldInjectCorpusExcerpts } from "./excerpts";
import type { RetrievalResult, RetrievedChunk } from "./types";

export async function retrieveCriminalistaContext(
  query: string,
): Promise<RetrievalResult> {
  const empty: RetrievalResult = {
    chunks: [],
    mode: "excerpt",
    embeddingUsage: { tokens: 0, costUsd: 0, costSource: "estimate", calls: 0 },
  };

  const trimmed = query.trim();
  if (!trimmed || !shouldInjectCorpusExcerpts(trimmed)) {
    return empty;
  }

  const chunks = await grepCorpusExcerpts(trimmed);
  return {
    ...empty,
    chunks,
  };
}

export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const blocks = chunks.map((chunk, index) => {
    const heading = chunk.heading ? ` · ${chunk.heading}` : "";
    return `[${index + 1}] Fonte: ${chunk.source}${heading}\n${chunk.text}`;
  });

  return [
    "===== BASE LEGAL (trechos curtos) =====",
    "Trechos opcionais do corpus Arquivos, injetados só porque a pergunta cita artigo/lei.",
    "Não é o corpus inteiro. Peças anexadas pelo usuário têm prioridade.",
    "Cite o arquivo-fonte. Não invente artigo que não esteja abaixo.",
    "",
    ...blocks,
    "===== FIM DA BASE LEGAL =====",
  ].join("\n");
}
