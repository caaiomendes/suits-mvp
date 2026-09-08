"use client";

import {
  fileSizeLimitMessage,
  guessMime,
  isAcceptedFile,
  isDocxFile,
  isImageFile,
  isPdfFile,
  isPlainTextFile,
  MAX_BINARY_FALLBACK_BYTES,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  readAsBase64,
  readAsDataUrl,
} from "./attachments";
import {
  ExtractionEmptyError,
  isNearlyEmptyExtract,
  normalizeExtractedText,
} from "./extracted-text";
import type { ExtractProgress } from "./extract-progress";
import type { ExtractWorkerEvent, ExtractWorkerRequest } from "./extract-protocol";
import type { AttachmentPayload } from "./types";

class ExtractAbortedError extends Error {
  constructor() {
    super("Extração cancelada.");
    this.name = "ExtractAbortedError";
  }
}

export function isExtractAborted(error: unknown): boolean {
  return error instanceof ExtractAbortedError;
}

export function extractAttachment(
  file: File,
  onProgress?: (progress: ExtractProgress) => void,
): { promise: Promise<AttachmentPayload>; abort: () => void } {
  let aborted = false;
  let worker: Worker | null = null;

  const abort = () => {
    aborted = true;
    worker?.terminate();
    worker = null;
  };

  const promise = runExtract();
  return { promise, abort };

  async function runExtract(): Promise<AttachmentPayload> {
    throwIfAborted();
    onProgress?.({ phase: "preparing", chars: 0 });

    if (file.size > MAX_FILE_BYTES) {
      throw new Error(fileSizeLimitMessage(file.name, MAX_FILE_BYTES));
    }
    if (!isAcceptedFile(file)) {
      throw new Error(`Tipo não suportado: ${file.name}`);
    }
    if (isImageFile(file) && file.size > MAX_IMAGE_BYTES) {
      throw new Error(fileSizeLimitMessage(file.name, MAX_IMAGE_BYTES));
    }

    if (isImageFile(file)) {
      const dataUrl = await readAsDataUrl(file);
      throwIfAborted();
      onProgress?.({ phase: "ready" });
      return {
        name: file.name,
        mimeType: file.type || guessMime(file.name),
        kind: "image",
        dataUrl,
      };
    }

    if (isPlainTextFile(file)) {
      const text = normalizeExtractedText(await file.text());
      throwIfAborted();
      if (isNearlyEmptyExtract(text)) {
        throw new ExtractionEmptyError(file.name);
      }
      onProgress?.({ phase: "ready", chars: text.length });
      return {
        name: file.name,
        mimeType: "text/plain",
        kind: "text",
        text,
      };
    }

    if (isPdfFile(file) || isDocxFile(file)) {
      return extractDocument(file, onProgress, {
        isAborted: () => aborted,
        setWorker: (next) => {
          worker = next;
        },
        throwIfAborted,
      });
    }

    throw new Error(`Tipo não suportado: ${file.name}`);
  }

  function throwIfAborted() {
    if (aborted) {
      throw new ExtractAbortedError();
    }
  }
}

async function extractDocument(
  file: File,
  onProgress: ((progress: ExtractProgress) => void) | undefined,
  control: {
    isAborted: () => boolean;
    setWorker: (worker: Worker | null) => void;
    throwIfAborted: () => void;
  },
): Promise<AttachmentPayload> {
  const mimeType =
    file.type ||
    guessMime(file.name) ||
    (isPdfFile(file)
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  try {
    return await extractDocumentInWorker(file, mimeType, onProgress, control);
  } catch (error) {
    if (control.isAborted() || isExtractAborted(error)) {
      throw error instanceof ExtractAbortedError
        ? error
        : new ExtractAbortedError();
    }
    if (error instanceof ExtractionEmptyError) {
      throw error;
    }
    return extractDocumentFallback(file, mimeType, onProgress, control);
  }
}

function extractDocumentInWorker(
  file: File,
  mimeType: string,
  onProgress: ((progress: ExtractProgress) => void) | undefined,
  control: {
    isAborted: () => boolean;
    setWorker: (worker: Worker | null) => void;
    throwIfAborted: () => void;
  },
): Promise<AttachmentPayload> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./extract.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Falha ao iniciar worker."));
      return;
    }

    control.setWorker(worker);
    if (control.isAborted()) {
      worker.terminate();
      control.setWorker(null);
      reject(new ExtractAbortedError());
      return;
    }

    const finish = (fn: () => void) => {
      worker.terminate();
      control.setWorker(null);
      fn();
    };

    worker.onmessage = (event: MessageEvent<ExtractWorkerEvent>) => {
      if (control.isAborted()) {
        return;
      }
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.({
          phase: message.phase,
          page: message.page,
          pages: message.pages,
          chars: message.chars,
        });
        return;
      }
      if (message.type === "done") {
        finish(() => {
          onProgress?.({ phase: "ready", chars: message.text.length });
          resolve({
            name: file.name,
            mimeType,
            kind: "text",
            text: message.text,
          });
        });
        return;
      }
      finish(() => {
        if (message.code === "empty") {
          reject(new ExtractionEmptyError(file.name));
          return;
        }
        reject(new Error(message.message));
      });
    };

    worker.onerror = (event) => {
      finish(() => {
        reject(event.error ?? new Error(event.message || "Falha no worker de extração."));
      });
    };

    const request: ExtractWorkerRequest = {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType,
      file,
    };
    worker.postMessage(request);
  });
}

async function extractDocumentFallback(
  file: File,
  mimeType: string,
  onProgress: ((progress: ExtractProgress) => void) | undefined,
  control: { throwIfAborted: () => void },
): Promise<AttachmentPayload> {
  control.throwIfAborted();

  try {
    const lower = file.name.toLowerCase();
    const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
    const { extractPdfFromData } = await import("./extract-pdf");
    const text = isPdf
      ? await extractPdfFromData(
          new Uint8Array(await file.arrayBuffer()),
          (info) => {
            control.throwIfAborted();
            onProgress?.({
              phase: "extracting",
              page: info.page,
              pages: info.pages,
              chars: info.chars,
            });
          },
        )
      : await extractDocxOnMain(file);

    control.throwIfAborted();
    if (isNearlyEmptyExtract(text)) {
      throw new ExtractionEmptyError(file.name);
    }
    onProgress?.({ phase: "ready", chars: text.length });
    return {
      name: file.name,
      mimeType,
      kind: "text",
      text,
    };
  } catch (error) {
    if (isExtractAborted(error) || error instanceof ExtractionEmptyError) {
      throw error;
    }
    if (file.size <= MAX_BINARY_FALLBACK_BYTES) {
      control.throwIfAborted();
      onProgress?.({ phase: "ready" });
      return {
        name: file.name,
        mimeType,
        kind: "binary",
        dataBase64: await readAsBase64(file),
      };
    }
    const detail = error instanceof Error ? error.message : "falha na extração";
    throw new Error(
      `Não foi possível extrair o texto de ${file.name} (${detail}). Envie um arquivo com texto selecionável de até 200 MB.`,
    );
  }
}

async function extractDocxOnMain(file: File): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return normalizeExtractedText(result.value);
}
