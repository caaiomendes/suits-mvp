import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OPENROUTER_EMBEDDING_MODEL } from "@/lib/models";
import type { RagChunk, RagMeta } from "./types";

export const RAG_DIR = path.join(process.cwd(), "data", "rag");
export const CHUNKS_PATH = path.join(RAG_DIR, "criminalista.chunks.jsonl");
export const META_PATH = path.join(RAG_DIR, "criminalista.meta.json");
export const EMBEDDINGS_PATH = path.join(
  RAG_DIR,
  "criminalista.embeddings.bin",
);
const TMP_EMBEDDINGS_PATH = path.join(
  "/tmp",
  "suits-rag",
  "criminalista.embeddings.bin",
);

const MAGIC = Buffer.from("SRAG");

export function ragDir(): string {
  return RAG_DIR;
}

export async function writeChunks(
  chunks: RagChunk[],
  meta: Omit<RagMeta, "chunkCount" | "embeddingsPresent"> & {
    embeddingsPresent?: boolean;
  },
): Promise<void> {
  await mkdir(RAG_DIR, { recursive: true });
  const lines = chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n";
  await writeFile(CHUNKS_PATH, lines, "utf8");
  await writeFile(
    META_PATH,
    JSON.stringify(
      {
        ...meta,
        chunkCount: chunks.length,
        embeddingsPresent: Boolean(meta.embeddingsPresent),
      } satisfies RagMeta,
      null,
      2,
    ),
    "utf8",
  );
}

export async function loadChunks(): Promise<RagChunk[]> {
  const raw = await readFile(CHUNKS_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RagChunk);
}

export async function loadMeta(): Promise<RagMeta | null> {
  try {
    return JSON.parse(await readFile(META_PATH, "utf8")) as RagMeta;
  } catch {
    return null;
  }
}

export async function writeEmbeddings(
  vectors: number[][],
  dimensions: number,
  dest = EMBEDDINGS_PATH,
): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  const header = Buffer.alloc(16);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(dimensions, 8);
  header.writeUInt32LE(vectors.length, 12);

  const body = Buffer.alloc(vectors.length * dimensions * 4);
  for (let i = 0; i < vectors.length; i += 1) {
    const vector = vectors[i];
    if (vector.length !== dimensions) {
      throw new Error("Dimensão de embedding inconsistente.");
    }
    for (let d = 0; d < dimensions; d += 1) {
      body.writeFloatLE(vector[d], (i * dimensions + d) * 4);
    }
  }

  await writeFile(dest, Buffer.concat([header, body]));
}

export async function loadEmbeddings(
  expectedCount: number,
): Promise<number[][] | null> {
  try {
    const buffer = await readFile(EMBEDDINGS_PATH);
    const parsed = parseEmbeddingsBinary(buffer, expectedCount);
    if (parsed) {
      return parsed;
    }
  } catch {
    // committed embeddings are optional
  }

  try {
    const buffer = await readFile(/* turbopackIgnore: true */ TMP_EMBEDDINGS_PATH);
    return parseEmbeddingsBinary(buffer, expectedCount);
  } catch {
    return null;
  }
}

export function writableEmbeddingsPath(): string {
  return process.env.VERCEL ? TMP_EMBEDDINGS_PATH : EMBEDDINGS_PATH;
}

export function defaultEmbeddingModel(): string {
  return process.env.OPENROUTER_EMBEDDING_MODEL ?? OPENROUTER_EMBEDDING_MODEL;
}

function parseEmbeddingsBinary(
  buffer: Buffer,
  expectedCount: number,
): number[][] | null {
  if (buffer.length < 16 || buffer.subarray(0, 4).toString() !== "SRAG") {
    return null;
  }

  const dimensions = buffer.readUInt32LE(8);
  const count = buffer.readUInt32LE(12);
  if (count !== expectedCount || dimensions <= 0) {
    return null;
  }

  const expectedBytes = 16 + count * dimensions * 4;
  if (buffer.length < expectedBytes) {
    return null;
  }

  const vectors: number[][] = [];
  for (let i = 0; i < count; i += 1) {
    const vector = new Array<number>(dimensions);
    for (let d = 0; d < dimensions; d += 1) {
      vector[d] = buffer.readFloatLE(16 + (i * dimensions + d) * 4);
    }
    vectors.push(vector);
  }

  return vectors;
}
