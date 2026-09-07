import { CRIMINALISTA_SYSTEM_FILES, loadAgentSystemPrompt } from "../lib/agents";

async function main() {
  const prompt = await loadAgentSystemPrompt("criminalista");
  const markers = [
    "PROMPT PRINCIPAL",
    "DIREITO PENAL E PROCESSO PENAL",
    "PROTOCOLO SUITS DE ATUALIZAÇÃO LEGISLATIVA E JURISPRUDENCIAL",
    "Rufem os tambores",
    "Protocolo Anti-Alucinações",
    "Documento Suplementar",
    "Desculpe, amigo! Não é possível.",
  ];

  let last = -1;
  for (const marker of markers) {
    const index = prompt.indexOf(marker);
    if (index < 0) {
      throw new Error(`Marcador ausente no system prompt: ${marker}`);
    }
    if (index < last) {
      throw new Error(`Ordem errada em torno de: ${marker}`);
    }
    last = index;
  }

  if (CRIMINALISTA_SYSTEM_FILES.length !== 7) {
    throw new Error("Lista Criminalista deve ter 7 arquivos.");
  }

  console.log("ok", CRIMINALISTA_SYSTEM_FILES.join(" → "));
}

void main();
