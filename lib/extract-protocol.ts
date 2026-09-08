export type ExtractWorkerRequest = {
  id: string;
  name: string;
  mimeType: string;
  file: File;
};

export type ExtractWorkerEvent =
  | {
      type: "progress";
      id: string;
      phase: "preparing" | "extracting";
      page?: number;
      pages?: number;
      chars: number;
    }
  | {
      type: "done";
      id: string;
      text: string;
    }
  | {
      type: "error";
      id: string;
      code: "empty" | "failed";
      message: string;
    };
