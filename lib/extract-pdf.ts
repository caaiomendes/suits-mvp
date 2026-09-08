import { normalizeExtractedText } from "./extracted-text";

export type PdfExtractProgress = {
  page: number;
  pages: number;
  chars: number;
};

/**
 * Full-text PDF extract. Never truncates. Reports page/char progress.
 * Safe to call from a dedicated Web Worker or a main-thread fallback.
 */
export async function extractPdfFromData(
  data: Uint8Array,
  onProgress?: (info: PdfExtractProgress) => void,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const pdf = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
  }).promise;

  const pages: string[] = [];

  try {
    const total = pdf.numPages;
    if (total > 0) {
      onProgress?.({ page: 1, pages: total, chars: 0 });
    }

    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
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
      onProgress?.({
        page: pageNumber,
        pages: total,
        chars: normalizeExtractedText(pages.join("\n\n")).length,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    await pdf.destroy();
  }

  return normalizeExtractedText(pages.join("\n\n"));
}
