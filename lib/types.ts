export type AttachmentKind = "text" | "image" | "binary";

export type AttachmentPayload =
  | {
      name: string;
      mimeType: string;
      kind: "text";
      text: string;
    }
  | {
      name: string;
      mimeType: string;
      kind: "image";
      dataUrl: string;
    }
  | {
      name: string;
      mimeType: string;
      kind: "binary";
      dataBase64: string;
    };

export type ChatMessagePayload = {
  role: "user" | "assistant";
  content: string;
  attachments?: AttachmentPayload[];
};

export type ChatRequestBody = {
  model: string;
  agentId: string;
  messages: ChatMessagePayload[];
};

export type CostSource = "openrouter" | "estimate" | "unknown";

export type UsageEvent = {
  type: "usage";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  costSource: CostSource;
  model: string;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | UsageEvent
  | { type: "error"; error: string }
  | { type: "done" };

export type AgentInfo = {
  id: string;
  name: string;
  description: string;
};

export type ModelOption = {
  id: string;
  label: string;
  supportsVision: boolean;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};
