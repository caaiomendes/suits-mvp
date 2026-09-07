import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chunkDocument, DEFAULT_CHUNK_CHARS, DEFAULT_CHUNK_OVERLAP } from "../lib/rag/chunk";
import { embedTexts } from "../lib/rag/embed";
import {
  defaultEmbeddingModel,
  writeChunks,
  writeEmbeddings,
} from "../lib/rag/store";
import type { RagChunk } from "../lib/rag/types";

const CORPUS_DIR = path.join(
  process.cwd(),
  "prompts",
  "criminalista",
  "arquivos",
);

async function main() {
  const embed =
    process.argv.includes("--embed") ||
    process.env.RAG_INGEST_EMBED === "1";
  const files = (await readdir(CORPUS_DIR))
    .filter((name) => name.toLowerCase().endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    throw new Error(`Nenhum .txt em ${CORPUS_DIR}`);
  }

  const chunks: RagChunk[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(CORPUS_DIR, file), "utf8");
    const docChunks = chunkDocument(file, raw, {
      chunkChars: DEFAULT_CHUNK_CHARS,
      overlap: DEFAULT_CHUNK_OVERLAP,
    });
    chunks.push(...docChunks);
    console.log(`${file}: ${docChunks.length} chunks`);
  }

  const model = defaultEmbeddingModel();
  let embeddingsPresent = false;
  let dimensions = 1536;

  if (embed) {
    console.log(`Embedding ${chunks.length} chunks with ${model}…`);
    const { vectors, usage } = await embedTexts(
      chunks.map((chunk) => chunk.text),
      { model },
    );
    dimensions = vectors[0]?.length ?? 1536;
    await writeEmbeddings(vectors, dimensions);
    embeddingsPresent = true;
    console.log(
      `Embeddings salvos (${dimensions}d). tokens=${usage.tokens} cost=${usage.costUsd.toFixed(6)} ${usage.costSource}`,
    );
  } else {
    console.log(
      "Pulando embeddings (passe --embed ou RAG_INGEST_EMBED=1 com OPENROUTER_API_KEY).",
    );
  }

  await writeChunks(chunks, {
    agentId: "criminalista",
    embeddingModel: model,
    embeddingDimensions: dimensions,
    chunkChars: DEFAULT_CHUNK_CHARS,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
    sources: files,
    createdAt: new Date().toISOString(),
    embeddingsPresent,
  });

  console.log(`Índice gravado: ${chunks.length} chunks de ${files.length} arquivos.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
