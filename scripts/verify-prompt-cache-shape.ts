import {
  DEEPSEEK_IGNORED_PROVIDERS,
  DEEPSEEK_PREFERRED_PROVIDERS,
  GLM_IGNORED_PROVIDERS,
  GLM_PREFERRED_PROVIDERS,
  buildOpenRouterMessages,
  cacheTokensFromUsage,
  providerRoutingForModel,
  resolveOpenRouterSessionId,
} from "../lib/openrouter";
import type { ChatMessagePayload } from "../lib/types";

const PDF =
  "CONTRARRAZÕES\n".repeat(80) +
  "Art. 302 do CPP. Texto integral do processo, sem corte.";

function userWithPdf(question: string): ChatMessagePayload {
  return {
    role: "user",
    content: question,
    attachments: [
      {
        name: "processo.pdf",
        mimeType: "application/pdf",
        kind: "text",
        text: PDF,
      },
    ],
  };
}

async function main() {
  const systemPrompt = "SYSTEM STABLE v1";
  const ragTurn1 = "===== BASE LEGAL =====\nArt. 302";
  const ragTurn2 = "===== BASE LEGAL =====\nArt. 310 (outro trecho)";

  const turn1 = await buildOpenRouterMessages({
    systemPrompt,
    messages: [userWithPdf("Resuma o auto de prisão.")],
    retrievedContext: ragTurn1,
  });

  const turn2 = await buildOpenRouterMessages({
    systemPrompt,
    messages: [
      userWithPdf("Resuma o auto de prisão."),
      { role: "assistant", content: "Há flagrante." },
      { role: "user", content: "E a liberdade provisória?" },
    ],
    retrievedContext: ragTurn2,
  });

  if (turn1[0]?.role !== "system" || turn1[0].content !== systemPrompt) {
    throw new Error("System prompt deve ser a primeira mensagem e permanecer estável.");
  }
  if (turn2[0]?.content !== turn1[0]?.content) {
    throw new Error("System prompt mudou entre turnos.");
  }
  if (typeof turn1[0].content === "string" && turn1[0].content.includes("BASE LEGAL")) {
    throw new Error("RAG não pode entrar no system prompt (quebra o prefixo).");
  }

  const doc1 = turn1[1];
  const doc2 = turn2[1];
  if (!doc1 || doc1.role !== "user" || typeof doc1.content !== "string") {
    throw new Error("Bloco do documento deve ser a segunda mensagem (user).");
  }
  if (doc1.content !== doc2?.content) {
    throw new Error("Bloco do PDF foi reordenado ou alterado entre turnos.");
  }
  if (!doc1.content.includes(PDF)) {
    throw new Error("Documento foi truncado.");
  }
  if (!doc1.content.includes("texto integral extraído")) {
    throw new Error("Bloco do anexo sem marcador de texto integral.");
  }

  const last1 = turn1[turn1.length - 1];
  const last2 = turn2[turn2.length - 1];
  if (last1?.role !== "user" || typeof last1.content !== "string") {
    throw new Error("A última mensagem do turno 1 deve ser a pergunta do usuário.");
  }
  if (!last1.content.includes("Resuma o auto de prisão.")) {
    throw new Error("Pergunta do turno 1 não está no final.");
  }
  if (!last1.content.includes(ragTurn1)) {
    throw new Error("RAG do turno deve ir só na última mensagem.");
  }
  if (last2?.role !== "user" || typeof last2.content !== "string") {
    throw new Error("A última mensagem do turno 2 deve ser a pergunta nova.");
  }
  if (!last2.content.includes("E a liberdade provisória?")) {
    throw new Error("Pergunta do turno 2 não está no final.");
  }
  if (typeof last2.content === "string" && last2.content.includes(PDF)) {
    throw new Error("PDF não deve ser repetido na pergunta final.");
  }

  const parsed = cacheTokensFromUsage({
    prompt_tokens: 100,
    prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 12 },
  });
  if (parsed.cachedTokens !== 80 || parsed.cacheWriteTokens !== 12) {
    throw new Error("Falha ao ler cached_tokens / cache_write_tokens.");
  }

  const session = resolveOpenRouterSessionId("abc-123", "header-ignored");
  if (session !== "abc-123") {
    throw new Error("session_id do body deve ter precedência.");
  }
  const fromHeader = resolveOpenRouterSessionId("  ", "hdr-1");
  if (fromHeader !== "hdr-1") {
    throw new Error("session_id deve cair no header x-session-id.");
  }
  const generated = resolveOpenRouterSessionId(undefined, null);
  if (!generated) {
    throw new Error("session_id deve ser gerado quando o cliente omite.");
  }

  const glmRouting = providerRoutingForModel("z-ai/glm-5.3-flash");
  if (
    !glmRouting ||
    glmRouting.order.join(",") !== GLM_PREFERRED_PROVIDERS.join(",") ||
    glmRouting.allow_fallbacks !== true ||
    glmRouting.ignore.join(",") !== GLM_IGNORED_PROVIDERS.join(",")
  ) {
    throw new Error("GLM deve pinar Z.AI / Novita / GMICloud e ignorar Wafer.");
  }
  if (providerRoutingForModel("z-ai/glm-4.6")?.order[0] !== "Z.AI") {
    throw new Error("Qualquer modelo z-ai/* deve usar o mesmo provider.order.");
  }

  const deepseekRouting = providerRoutingForModel(
    "deepseek/deepseek-v4-flash-0731",
  );
  if (
    !deepseekRouting ||
    deepseekRouting.order.join(",") !== DEEPSEEK_PREFERRED_PROVIDERS.join(",") ||
    deepseekRouting.allow_fallbacks !== true ||
    deepseekRouting.ignore.join(",") !== DEEPSEEK_IGNORED_PROVIDERS.join(",")
  ) {
    throw new Error(
      "DeepSeek deve pinar OpenInference / DeepInfra / Sail Research / DeepSeek e ignorar DigitalOcean.",
    );
  }
  if (providerRoutingForModel("deepseek/deepseek-chat")?.order[0] !== "OpenInference") {
    throw new Error("Qualquer modelo deepseek/* deve usar o mesmo provider.order.");
  }
  if (!deepseekRouting.ignore.includes("DigitalOcean")) {
    throw new Error("DeepSeek deve ignorar DigitalOcean.");
  }
  if (providerRoutingForModel("openai/gpt-5.6-luna") !== undefined) {
    throw new Error("Modelos sem pin não devem enviar provider routing.");
  }

  console.log(
    "ok prompt-cache shape + session_id + usage details + glm/deepseek routing",
  );
}

void main();
