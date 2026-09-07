const MAX_EXTRACTED_CHARS = 80_000;

export async function extractBinaryAttachment(
  mimeType: string,
  name: string,
  dataBase64: string,
): Promise<string> {
  const bytes = Buffer.from(dataBase64, "base64");
  const lowerName = name.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    return truncate(await extractPdfText(bytes));
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return truncate(await extractDocxText(bytes));
  }

  throw new Error(`Tipo de anexo não suportado: ${name}`);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(bytes), { mergePages: true });
  const text = typeof result.text === "string" ? result.text : result.text.join("\n\n");
  return text.replace(/\u0000/g, "").trim();
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value.trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Texto truncado para o limite da sessão.]`;
}
