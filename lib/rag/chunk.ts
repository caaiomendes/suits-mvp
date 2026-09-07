import type { RagChunk } from "./types";

export const DEFAULT_CHUNK_CHARS = 3600;
export const DEFAULT_CHUNK_OVERLAP = 180;

const HEADING_RE =
  /^(PARTE\s+\w+|T[IÍ]TULO\s+[IVXLCDM0-9]+|CAP[IÍ]TULO\s+[IVXLCDM0-9]+|SE[CÇ][AÃ]O\s+[IVXLCDM0-9]+|LIVRO\s+[IVXLCDM0-9]+|DISPOSI[CÇ][OÕ]ES\b|Art(?:igo)?\.?\s*\d+)/i;
const ARTICLE_SPLIT_RE = /(?=\n\s*Art(?:igo)?\.?\s*\d+)/i;
const PAGE_RE = /(\d+)\s*\/\s*\d+\s*$/;

export function chunkDocument(
  source: string,
  raw: string,
  options?: { chunkChars?: number; overlap?: number },
): RagChunk[] {
  const chunkChars = options?.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const text = normalizeCorpusText(raw);
  const windows = splitToWindows(text, chunkChars, overlap);

  return windows.map((window, chunkIndex) => ({
    id: `${source}:${String(chunkIndex).padStart(4, "0")}`,
    source,
    chunkIndex,
    heading: detectHeading(window.text),
    page: window.page,
    text: window.text,
  }));
}

export function normalizeCorpusText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitToWindows(
  text: string,
  chunkChars: number,
  overlap: number,
): Array<{ text: string; page?: number }> {
  const units = text
    .split(ARTICLE_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  const windows: Array<{ text: string; page?: number }> = [];
  let buffer = "";
  let page = detectPage(text);

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      return;
    }
    windows.push({ text: trimmed, page });
    if (overlap > 0 && trimmed.length > overlap) {
      buffer = trimmed.slice(-overlap);
    } else {
      buffer = "";
    }
  };

  for (const unit of units) {
    page = detectPage(unit) ?? page;
    if (buffer && buffer.length + unit.length + 2 > chunkChars) {
      flush();
    }

    if (unit.length > chunkChars) {
      for (const piece of hardWrap(unit, chunkChars, overlap)) {
        if (buffer && buffer.length + piece.length + 2 > chunkChars) {
          flush();
        }
        buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      }
      continue;
    }

    buffer = buffer ? `${buffer}\n\n${unit}` : unit;
  }

  flush();
  return windows;
}

function hardWrap(text: string, chunkChars: number, overlap: number): string[] {
  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkChars, text.length);
    pieces.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }

  return pieces.filter(Boolean);
}

function detectHeading(text: string): string | undefined {
  for (const line of text.split("\n").slice(0, 8)) {
    const trimmed = line.trim();
    if (HEADING_RE.test(trimmed)) {
      return trimmed.slice(0, 160);
    }
  }
  return undefined;
}

function detectPage(text: string): number | undefined {
  const lines = text.split("\n");
  for (const line of lines.slice(0, 4).concat(lines.slice(-3))) {
    const match = line.trim().match(PAGE_RE);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}
