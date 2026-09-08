/** Minimum selectable text to treat an extract as successful (not a scan/empty file). */
export const MIN_USEFUL_EXTRACT_CHARS = 80;

export class ExtractionEmptyError extends Error {
  readonly attachmentName: string;

  constructor(attachmentName: string) {
    super(extractionFailedMessage(attachmentName));
    this.name = "ExtractionEmptyError";
    this.attachmentName = attachmentName;
  }
}

export function normalizeExtractedText(text: string): string {
  return text.replace(/\u0000/g, "").trim();
}

export function isNearlyEmptyExtract(text: string): boolean {
  return normalizeExtractedText(text).length < MIN_USEFUL_EXTRACT_CHARS;
}

export function extractionFailedMessage(name: string): string {
  return (
    `Não foi possível extrair texto de ${name}. O arquivo parece escaneado ou sem ` +
    "texto selecionável. Envie um PDF/DOCX com texto selecionável ou uma transcrição."
  );
}

export const EXTRACTION_FAILED_MODEL_NOTE =
  "(extração falhou: arquivo sem texto selecionável — possível PDF escaneado sem OCR. " +
  "Não invente conteúdo nem trate isto como truncamento técnico.)";
