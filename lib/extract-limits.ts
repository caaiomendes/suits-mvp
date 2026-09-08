export const MAX_EXTRACTED_CHARS = 80_000;

export function truncateExtractedText(text: string): string {
  if (text.length <= MAX_EXTRACTED_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Texto truncado para o limite da sessão.]`;
}
