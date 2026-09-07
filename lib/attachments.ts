import type { AttachmentPayload } from "./types";
import { truncateExtractedText } from "./extract-limits";

export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

/** Hard cap for PDF/TXT/DOCX (extracted to text before POST). */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Images still go as dataUrl; keep them well under the Vercel body limit. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/**
 * Only small binaries may be sent as base64. Larger PDFs/DOCX must be
 * extracted in the browser so POST /api/chat stays under Vercel's ~4.5 MB body.
 */
const MAX_BINARY_FALLBACK_BYTES = 3 * 1024 * 1024;

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type === "text/plain" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".pdf") ||
    name.endsWith(".txt") ||
    name.endsWith(".docx") ||
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif")
  );
}

export function fileSizeLimitMessage(name: string, limitBytes: number): string {
  return `O arquivo ${name} excede ${Math.round(limitBytes / (1024 * 1024))} MB.`;
}

export async function filesToAttachments(
  files: File[],
): Promise<AttachmentPayload[]> {
  const attachments: AttachmentPayload[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(fileSizeLimitMessage(file.name, MAX_FILE_BYTES));
    }

    if (!isAcceptedFile(file)) {
      throw new Error(`Tipo não suportado: ${file.name}`);
    }

    attachments.push(await fileToAttachment(file));
  }

  return attachments;
}

export async function fileToAttachment(file: File): Promise<AttachmentPayload> {
  const name = file.name;
  const mimeType = file.type || guessMime(name);
  const lower = name.toLowerCase();

  if (mimeType.startsWith("image/")) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(fileSizeLimitMessage(name, MAX_IMAGE_BYTES));
    }

    return {
      name,
      mimeType,
      kind: "image",
      dataUrl: await readAsDataUrl(file),
    };
  }

  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    return {
      name,
      mimeType: "text/plain",
      kind: "text",
      text: await file.text(),
    };
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return extractDocumentAttachment(file, name, mimeType || "application/pdf");
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return extractDocumentAttachment(
      file,
      name,
      mimeType ||
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  }

  throw new Error(`Tipo não suportado: ${name}`);
}

async function extractDocumentAttachment(
  file: File,
  name: string,
  mimeType: string,
): Promise<AttachmentPayload> {
  const lower = name.toLowerCase();
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");

  try {
    const text = isPdf
      ? await extractPdfText(file)
      : await extractDocxText(file);

    return {
      name,
      mimeType,
      kind: "text",
      text: truncateExtractedText(text || "(sem texto extraído)"),
    };
  } catch (error) {
    if (file.size <= MAX_BINARY_FALLBACK_BYTES) {
      return {
        name,
        mimeType,
        kind: "binary",
        dataBase64: await readAsBase64(file),
      };
    }

    const detail = error instanceof Error ? error.message : "falha na extração";
    throw new Error(
      `Não foi possível extrair o texto de ${name} (${detail}). Envie um arquivo com texto selecionável de até 200 MB.`,
    );
  }
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      if (line) {
        pages.push(line);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n\n").replace(/\u0000/g, "").trim();
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return result.value.trim();
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
