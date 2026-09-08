import {
  ExtractionEmptyError,
  isNearlyEmptyExtract,
  normalizeExtractedText,
} from "./extracted-text";
import { extractPdfFromData } from "./extract-pdf";
import type { ExtractWorkerEvent, ExtractWorkerRequest } from "./extract-protocol";

type PdfjsWorkerGlobal = {
  pdfjsWorker?: { WorkerMessageHandler: unknown };
};

function post(event: ExtractWorkerEvent) {
  self.postMessage(event);
}

async function setupPdfjsFakeWorker() {
  const globalWorker = self as unknown as PdfjsWorkerGlobal;
  if (!globalWorker.pdfjsWorker) {
    const workerMod = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    globalWorker.pdfjsWorker = {
      WorkerMessageHandler: workerMod.WorkerMessageHandler,
    };
  }
}

async function extractDocxFromBuffer(buffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return normalizeExtractedText(result.value);
}

self.onmessage = async (event: MessageEvent<ExtractWorkerRequest>) => {
  const { id, name, mimeType, file } = event.data;

  try {
    post({ type: "progress", id, phase: "preparing", chars: 0 });

    const lower = name.toLowerCase();
    const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
    const buffer = await file.arrayBuffer();

    let text: string;
    if (isPdf) {
      await setupPdfjsFakeWorker();
      text = await extractPdfFromData(new Uint8Array(buffer), (info) => {
        post({
          type: "progress",
          id,
          phase: "extracting",
          page: info.page,
          pages: info.pages,
          chars: info.chars,
        });
      });
    } else {
      text = await extractDocxFromBuffer(buffer);
      post({
        type: "progress",
        id,
        phase: "extracting",
        page: 1,
        pages: 1,
        chars: text.length,
      });
    }

    if (isNearlyEmptyExtract(text)) {
      post({
        type: "error",
        id,
        code: "empty",
        message: new ExtractionEmptyError(name).message,
      });
      return;
    }

    post({ type: "done", id, text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "falha na extração";
    post({ type: "error", id, code: "failed", message });
  }
};
