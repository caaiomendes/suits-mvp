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

const ANALYZE_ATTACHMENTS_FALLBACK = "Analise o(s) anexo(s).";

export const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/** OpenRouter `provider_name` slugs from `/api/v1/models/z-ai/glm-5.3-flash/endpoints`. */
export const GLM_PREFERRED_PROVIDERS = ["Z.AI", "Novita", "GMICloud"] as const;
export const GLM_IGNORED_PROVIDERS = ["Wafer"] as const;

export type OpenRouterProviderPreferences = {
  order: string[];
  allow_fallbacks: boolean;
  ignore: string[];
};

/**
 * Sticky promo+cache routing for GLM. Prefer Z.AI / Novita / GMICloud
 * ($0.075/$0.25 + input_cache_read). Skip Wafer ($0.10/$0.35, no promo).
 * `allow_fallbacks` still reaches other non-Wafer endpoints if those three fail.
 */
export function providerRoutingForModel(
  model: string,
): OpenRouterProviderPreferences | undefined {
  if (!model.startsWith("z-ai/")) {
    return undefined;
  }

  return {
    order: [...GLM_PREFERRED_PROVIDERS],
    allow_fallbacks: true,
    ignore: [...GLM_IGNORED_PROVIDERS],
  };
}

export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

export type OpenRouterPromptTokenDetails = {
  cached_tokens?: number;
  cache_write_tokens?: number;
};

export type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  cached_tokens?: number;
  cache_write_tokens?: number;
  native_tokens_cached?: number;
  prompt_tokens_details?: OpenRouterPromptTokenDetails;
};

export async function buildOpenRouterMessages(input: {
  systemPrompt: string;
  messages: ChatMessagePayload[];
  retrievedContext?: string;
}): Promise<OpenRouterMessage[]> {
  const result: OpenRouterMessage[] = [
    { role: "system", content: input.systemPrompt },
  ];

  const documentBlocks = await collectDocumentBlocks(input.messages);
  if (documentBlocks.length > 0) {
    result.push({
      role: "user",
      content: [FULL_DOCUMENT_TURN_REMINDER, ...documentBlocks].join("\n\n"),
    });
  }

  const conversation = await buildConversationWithoutDocuments(
    input.messages,
    documentBlocks.length > 0,
  );

  const lastUserIndex = lastIndexOfRole(conversation, "user");
  const history =
    lastUserIndex >= 0 ? conversation.slice(0, lastUserIndex) : conversation;
  const lastUser = lastUserIndex >= 0 ? conversation[lastUserIndex] : null;

  result.push(...history);

  if (lastUser) {
    result.push(
      prependTextToMessage(lastUser, input.retrievedContext?.trim() ?? ""),
    );
  } else if (input.retrievedContext?.trim()) {
    result.push({ role: "user", content: input.retrievedContext.trim() });
  }

  return result;
}

async function collectDocumentBlocks(
  messages: ChatMessagePayload[],
): Promise<string[]> {
  const blocks: string[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const attachment of message.attachments ?? []) {
      const block = await documentBlockFromAttachment(attachment);
      if (block) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}

async function documentBlockFromAttachment(
  attachment: AttachmentPayload,
): Promise<string | null> {
  if (attachment.kind === "image") {
    return null;
  }

  const extracted = await attachmentToTextOrImage(attachment);
  if (extracted.kind === "image") {
    return null;
  }

  if (isNearlyEmptyExtract(extracted.text)) {
    return `--- Anexo: ${attachment.name} ---\n${EXTRACTION_FAILED_MODEL_NOTE}`;
  }

  return `--- Anexo: ${attachment.name} (texto integral extraído) ---\n${extracted.text}`;
}

async function buildConversationWithoutDocuments(
  messages: ChatMessagePayload[],
  hasDocuments: boolean,
): Promise<OpenRouterMessage[]> {
  const result: OpenRouterMessage[] = [];
  const lastUserIndex = lastIndexOfRole(messages, "user");

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
      continue;
    }

    const { content, isEmpty } = await buildUserContentWithoutDocuments(message);
    if (isEmpty) {
      if (index === lastUserIndex && hasDocuments) {
        result.push({ role: "user", content: ANALYZE_ATTACHMENTS_FALLBACK });
      }
      continue;
    }

    result.push({
      role: "user",
      content,
    });
  }

  return result;
}

async function buildUserContentWithoutDocuments(
  message: ChatMessagePayload,
): Promise<{
  content: string | OpenRouterContentPart[];
  isEmpty: boolean;
}> {
  const attachments = message.attachments ?? [];
  const imageParts: OpenRouterContentPart[] = [];
  const text = message.content.trim();

  for (const attachment of attachments) {
    if (attachment.kind !== "image") {
      continue;
    }
    const extracted = await attachmentToTextOrImage(attachment);
    if (extracted.kind === "image") {
      imageParts.push({
        type: "image_url",
        image_url: { url: extracted.dataUrl },
      });
    }
  }

  if (!text && imageParts.length === 0) {
    return { content: "(mensagem vazia)", isEmpty: true };
  }

  if (imageParts.length === 0) {
    return { content: text, isEmpty: false };
  }

  const imageNotes = attachments
    .filter((attachment) => attachment.kind === "image")
    .map((attachment) => `Anexo de imagem: ${attachment.name}`);
  const combined = [text, ...imageNotes].filter(Boolean).join("\n\n");

  return {
    content: [
      { type: "text" as const, text: combined || "Analise os anexos." },
      ...imageParts,
    ],
    isEmpty: false,
  };
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

function lastIndexOfRole<T extends { role: string }>(
  items: T[],
  role: T["role"],
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.role === role) {
      return index;
    }
  }
  return -1;
}

function prependTextToMessage(
  message: OpenRouterMessage,
  prefix: string,
): OpenRouterMessage {
  if (!prefix) {
    return message;
  }

  const content = message.content;
  if (typeof content === "string") {
    return { ...message, content: `${prefix}\n\n${content}` };
  }

  const parts = [...content];
  const firstText = parts.findIndex((part) => part.type === "text");
  if (firstText >= 0 && parts[firstText]?.type === "text") {
    parts[firstText] = {
      type: "text",
      text: `${prefix}\n\n${parts[firstText].text}`,
    };
    return { ...message, content: parts };
  }

  return {
    ...message,
    content: [{ type: "text", text: prefix }, ...parts],
  };
}

export function cacheTokensFromUsage(usage: OpenRouterUsage | undefined): {
  cachedTokens: number;
  cacheWriteTokens: number;
} {
  if (!usage) {
    return { cachedTokens: 0, cacheWriteTokens: 0 };
  }

  const details = usage.prompt_tokens_details;
  const cachedTokens =
    details?.cached_tokens ??
    usage.cached_tokens ??
    usage.native_tokens_cached ??
    0;
  const cacheWriteTokens =
    details?.cache_write_tokens ?? usage.cache_write_tokens ?? 0;

  return {
    cachedTokens: finiteCount(cachedTokens),
    cacheWriteTokens: finiteCount(cacheWriteTokens),
  };
}

export function usageFromChunk(
  model: string,
  usage: OpenRouterUsage | undefined,
): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  costSource: CostSource;
} | null {
  if (!usage) {
    return null;
  }

  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  const { cachedTokens, cacheWriteTokens } = cacheTokensFromUsage(usage);
  const { costUsd, costSource } = resolveTurnCost({
    model,
    promptTokens,
    completionTokens,
    openRouterCost: usage.cost,
  });

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheWriteTokens,
    costUsd,
    costSource,
  };
}

function finiteCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function resolveOpenRouterSessionId(
  bodySessionId: string | undefined,
  headerSessionId: string | null,
): string {
  const fromBody = bodySessionId?.trim();
  if (fromBody && fromBody.length <= 256) {
    return fromBody;
  }

  const fromHeader = headerSessionId?.trim();
  if (fromHeader && fromHeader.length <= 256) {
    return fromHeader;
  }

  return crypto.randomUUID();
}
