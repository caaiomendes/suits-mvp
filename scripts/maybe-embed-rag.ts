import { embedTexts } from "../lib/rag/embed";
import {
  defaultEmbeddingModel,
  loadChunks,
  loadEmbeddings,
  writableEmbeddingsPath,
  writeEmbeddings,
} from "../lib/rag/store";

async function main() {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return;
  }

  let chunks;
  try {
    chunks = await loadChunks();
  } catch {
    return;
  }

  const existing = await loadEmbeddings(chunks.length);
  if (existing) {
    return;
  }

  const model = defaultEmbeddingModel();
  console.log(`Gerando embeddings ausentes (${chunks.length} chunks, ${model})…`);
  const { vectors } = await embedTexts(
    chunks.map((chunk) => chunk.text),
    { model },
  );
  await writeEmbeddings(vectors, vectors[0]?.length ?? 1536, writableEmbeddingsPath());
}

main().catch((error) => {
  console.warn("maybe-embed-rag:", error instanceof Error ? error.message : error);
});
