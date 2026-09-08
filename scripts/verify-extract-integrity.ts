import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { extractPdfFromData } from "../lib/extract-pdf";
import {
  formatExtractChipStatus,
  formatExtractHeadline,
} from "../lib/extract-progress";
import { isNearlyEmptyExtract, normalizeExtractedText } from "../lib/extracted-text";

const require = createRequire(import.meta.url);

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildMultipagePdf(pageTexts: string[]): Uint8Array {
  const objects: string[] = [];
  const kids: string[] = [];
  let nextId = 3;

  const fontId = 3;
  nextId = 4;
  objects.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );

  const pageIds: number[] = [];
  const contentIds: number[] = [];
  for (const text of pageTexts) {
    const contentId = nextId++;
    const pageId = nextId++;
    contentIds.push(contentId);
    pageIds.push(pageId);
    const stream = `BT /F1 12 Tf 72 720 Td (${escapePdfText(text)}) Tj ET`;
    objects.push(
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>\nendobj\n`,
    );
    kids.push(`${pageId} 0 R`);
  }

  const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageTexts.length} >>\nendobj\n`;
  const catalog = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  const bodyParts = [catalog, pagesObj, ...objects];
  let offset = "%PDF-1.4\n".length;
  const xref = ["xref", `0 ${3 + objects.length}`, "0000000000 65535 f "];
  const offsets = [0];
  for (const part of bodyParts) {
    offsets.push(offset);
    offset += part.length;
  }
  xref.push(
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, "0")} 00000 n `),
  );

  const xrefStart = offset;
  const xrefBlock = `${xref.join("\n")}\n`;
  const trailer = `trailer\n<< /Size ${3 + objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const pdf = `%PDF-1.4\n${bodyParts.join("")}${xrefBlock}${trailer}`;
  return new TextEncoder().encode(pdf);
}

async function main() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/build/pdf.worker.mjs"),
  ).href;

  const pageCount = 48;
  const pageTexts = Array.from(
    { length: pageCount },
    (_, index) => `Pagina ${index + 1} do anexo integral SUITS-MARKER-${index + 1}.`,
  );
  const uniqueMarker = "SUITS-FULL-TEXT-INTEGRITY-9f3c";
  pageTexts[pageTexts.length - 1] += ` ${uniqueMarker}`;

  const progress: Array<{ page: number; pages: number; chars: number }> = [];
  const pdf = buildMultipagePdf(pageTexts);
  const text = await extractPdfFromData(pdf, (info) => {
    progress.push(info);
  });

  if (isNearlyEmptyExtract(text)) {
    throw new Error("Extracted text was treated as empty.");
  }
  if (!text.includes(uniqueMarker)) {
    throw new Error("Extracted text was truncated — integrity marker missing.");
  }
  for (const pageText of pageTexts) {
    const token = pageText.match(/SUITS-MARKER-\d+/)?.[0];
    if (token && !text.includes(token)) {
      throw new Error(`Missing page token ${token}`);
    }
  }
  if (progress.length < pageCount) {
    throw new Error(`Expected progress for ${pageCount} pages, got ${progress.length}`);
  }
  if (progress[progress.length - 1]?.page !== pageCount) {
    throw new Error("Last progress event did not report the final page.");
  }
  if (text.length !== normalizeExtractedText(text).length) {
    throw new Error("Returned text was not normalized.");
  }

  const headline = formatExtractHeadline({
    phase: "extracting",
    page: 12,
    pages: 48,
    chars: 123456,
  });
  if (!headline.includes("página 12 de 48") || !headline.includes("123.456")) {
    throw new Error(`Unexpected headline: ${headline}`);
  }
  const chip = formatExtractChipStatus({
    phase: "ready",
    chars: 1024331,
  });
  if (chip !== "1.024.331 caracteres") {
    throw new Error(`Unexpected ready chip: ${chip}`);
  }

  console.log(
    `ok pages=${pageCount} chars=${text.length} progress=${progress.length} bytes=${pdf.byteLength}`,
  );
}

void main();
