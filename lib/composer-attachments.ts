import type { ExtractPhase } from "./extract-progress";
import type { AttachmentPayload } from "./types";

export type ComposerAttachment = {
  id: string;
  file: File;
  status: ExtractPhase;
  page?: number;
  pages?: number;
  extractedChars?: number;
  error?: string;
  payload?: AttachmentPayload;
};

export function isExtractingStatus(status: ExtractPhase): boolean {
  return status === "preparing" || status === "extracting";
}

export function attachmentsReady(items: ComposerAttachment[]): boolean {
  return (
    items.length > 0 &&
    items.every((item) => item.status === "ready" && item.payload)
  );
}
