import type { AttachmentPayload } from "./types";

export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
].join(",");

const MAX_FILE_BYTES = 4 * 1024 * 1024;

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

export async function filesToAttachments(
  files: File[],
): Promise<AttachmentPayload[]> {
  const attachments: AttachmentPayload[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`O arquivo ${file.name} excede 4 MB.`);
    }

    if (!isAcceptedFile(file)) {
      throw new Error(`Tipo não suportado: ${file.name}`);
    }

    attachments.push(await fileToAttachment(file));
  }

  return attachments;
}

async function fileToAttachment(file: File): Promise<AttachmentPayload> {
  const name = file.name;
  const mimeType = file.type || guessMime(name);

  if (mimeType.startsWith("image/")) {
    return {
      name,
      mimeType,
      kind: "image",
      dataUrl: await readAsDataUrl(file),
    };
  }

  if (mimeType === "text/plain" || name.toLowerCase().endsWith(".txt")) {
    return {
      name,
      mimeType: "text/plain",
      kind: "text",
      text: await file.text(),
    };
  }

  return {
    name,
    mimeType,
    kind: "binary",
    dataBase64: await readAsBase64(file),
  };
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
