import { resolveTurnCost } from "./cost";
import { extractBinaryAttachment } from "./extract";
import type { AttachmentPayload, ChatMessagePayload, CostSource } from "./types";

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

export type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
};

export async function buildOpenRouterMessages(input: {
  systemPrompt: string;
  messages: ChatMessagePayload[];
}): Promise<OpenRouterMessage[]> {
  const result: OpenRouterMessage[] = [
    { role: "system", content: input.systemPrompt },
  ];

  for (const message of input.messages) {
    if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
      continue;
    }

    result.push({
      role: "user",
      content: await buildUserContent(message),
    });
  }

  return result;
}

async function buildUserContent(
  message: ChatMessagePayload,
): Promise<string | OpenRouterContentPart[]> {
  const attachments = message.attachments ?? [];
  const textParts: string[] = [];
  const imageParts: OpenRouterContentPart[] = [];

  if (message.content.trim()) {
    textParts.push(message.content.trim());
  }

  for (const attachment of attachments) {
    const extracted = await attachmentToTextOrImage(attachment);
    if (extracted.kind === "image") {
      imageParts.push({
        type: "image_url",
        image_url: { url: extracted.dataUrl },
      });
      textParts.push(`Anexo de imagem: ${attachment.name}`);
      continue;
    }

    textParts.push(
      `--- Anexo: ${attachment.name} ---\n${extracted.text || "(sem texto extraído)"}`,
    );
  }

  const text = textParts.join("\n\n");

  if (imageParts.length === 0) {
    return text || "(mensagem vazia)";
  }

  return [{ type: "text", text: text || "Analise os anexos." }, ...imageParts];
}

async function attachmentToTextOrImage(
  attachment: AttachmentPayload,
): Promise<{ kind: "text"; text: string } | { kind: "image"; dataUrl: string }> {
  if (attachment.kind === "image") {
    return { kind: "image", dataUrl: attachment.dataUrl };
  }

  if (attachment.kind === "text") {
    return { kind: "text", text: attachment.text };
  }

  const text = await extractBinaryAttachment(
    attachment.mimeType,
    attachment.name,
    attachment.dataBase64,
  );

  return { kind: "text", text };
}

export function usageFromChunk(
  model: string,
  usage: OpenRouterUsage | undefined,
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  costSource: CostSource;
} | null {
  if (!usage) {
    return null;
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  const { costUsd, costSource } = resolveTurnCost({
    model,
    promptTokens,
    completionTokens,
    openRouterCost: usage.cost,
  });

  return { promptTokens, completionTokens, totalTokens, costUsd, costSource };
}
