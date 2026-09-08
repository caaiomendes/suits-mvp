import {
  ExtractionEmptyError,
  isNearlyEmptyExtract,
  normalizeExtractedText,
} from "./extracted-text";

export async function extractBinaryAttachment(
  mimeType: string,
  name: string,
  dataBase64: string,
): Promise<string> {
  const bytes = Buffer.from(dataBase64, "base64");
  const lowerName = name.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return requireUsefulExtract(name, await extractPdfText(bytes));
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return requireUsefulExtract(name, await extractDocxText(bytes));
  }

  throw new Error(`Tipo de anexo não suportado: ${name}`);
}

function requireUsefulExtract(name: string, text: string): string {
  const normalized = normalizeExtractedText(text);
  if (isNearlyEmptyExtract(normalized)) {
    throw new ExtractionEmptyError(name);
  }
  return normalized;
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(bytes), { mergePages: true });
  return normalizeExtractedText(result.text);
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: bytes });
  return normalizeExtractedText(result.value);
}
