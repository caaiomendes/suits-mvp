import { resolveTurnCost } from "./cost";
import { extractBinaryAttachment } from "./extract";
import {
  EXTRACTION_FAILED_MODEL_NOTE,
  isNearlyEmptyExtract,
} from "./extracted-text";
import type { AttachmentPayload, ChatMessagePayload, CostSource } from "./types";

const FULL_DOCUMENT_TURN_REMINDER =
  "O usuário anexou o(s) arquivo(s) completo(s). O texto extraído nesta mensagem é integral — " +
  "não há corte por limite de caracteres. Não trate o anexo como incompleto, ilegível ou não enviado. " +
  "Analise o conteúdo fornecido. Só declare falha de leitura se o bloco do anexo indicar extração vazia " +
  "(PDF escaneado sem OCR).";

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

  let latestUserHasFullExtract = false;

  for (const message of input.messages) {
    if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
      continue;
    }

    const { content, hasFullExtract } = await buildUserContent(message);
    latestUserHasFullExtract = hasFullExtract;
    result.push({
      role: "user",
      content,
    });
  }

  if (latestUserHasFullExtract) {
    let lastUserIndex = -1;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index]?.role === "user") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex >= 0) {
      result.splice(lastUserIndex, 0, {
        role: "system",
        content: FULL_DOCUMENT_TURN_REMINDER,
      });
    }
  }

  return result;
}

async function buildUserContent(message: ChatMessagePayload): Promise<{
  content: string | OpenRouterContentPart[];
  hasFullExtract: boolean;
}> {
  const attachments = message.attachments ?? [];
  const textParts: string[] = [];
  const imageParts: OpenRouterContentPart[] = [];
  let hasFullExtract = false;

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

    if (isNearlyEmptyExtract(extracted.text)) {
      textParts.push(
        `--- Anexo: ${attachment.name} ---\n${EXTRACTION_FAILED_MODEL_NOTE}`,
      );
      continue;
    }

    hasFullExtract = true;
    textParts.push(
      `--- Anexo: ${attachment.name} (texto integral extraído) ---\n${extracted.text}`,
    );
  }

  const text = textParts.join("\n\n");
  const content =
    imageParts.length === 0
      ? text || "(mensagem vazia)"
      : [{ type: "text" as const, text: text || "Analise os anexos." }, ...imageParts];

  return { content, hasFullExtract };
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
