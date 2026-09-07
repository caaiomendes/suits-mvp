import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentInfo } from "./types";

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

/**
 * Criminalista system prompts, server-side only (regra 07).
 * Never return these strings from an API or import them in client components.
 */
export const CRIMINALISTA_SYSTEM_FILES = [
  "01-prompt-principal.md",
  "02-direito-penal-e-processo-penal.md",
  "03-protocolo-atualizacao-legislativa-jurisprudencial.md",
  "04-prompt-ia-jurisprudencia.md",
  "05-prompt-anti-alucinacoes.md",
  "06-prompt-de-qualidade.md",
  "07-regra-nao-divulgar-prompt.md",
] as const;

export function isAgentId(value: string): boolean {
  return AGENT_ID_PATTERN.test(value);
}

function promptsRoot(): string {
  return path.join(process.cwd(), "prompts");
}

export async function listAgents(): Promise<AgentInfo[]> {
  const root = promptsRoot();
  let entries: string[] = [];

  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const agents: AgentInfo[] = [];

  for (const id of entries.sort()) {
    if (!isAgentId(id)) {
      continue;
    }

    const files = await listSystemPromptFiles(id);
    if (files.length === 0) {
      continue;
    }

    let name = titleFromId(id);
    let description = "";

    try {
      const raw = await readFile(path.join(root, id, "meta.json"), "utf8");
      const meta = JSON.parse(raw) as { name?: string; description?: string };
      if (meta.name?.trim()) {
        name = meta.name.trim();
      }
      if (meta.description?.trim()) {
        description = meta.description.trim();
      }
    } catch {
      // meta.json is optional — never fall back to prompt file contents
    }

    agents.push({ id, name, description });
  }

  return agents;
}

export async function loadAgentSystemPrompt(agentId: string): Promise<string> {
  if (!isAgentId(agentId)) {
    throw new Error("Agente inválido.");
  }

  const files = await listSystemPromptFiles(agentId);
  if (files.length === 0) {
    throw new Error(`Prompt do agente "${agentId}" não encontrado.`);
  }

  const parts: string[] = [];
  for (const file of files) {
    const contents = await readFile(
      path.join(promptsRoot(), agentId, file),
      "utf8",
    );
    parts.push(contents.trim());
  }

  return parts.join("\n\n-----\n\n");
}

async function listSystemPromptFiles(agentId: string): Promise<string[]> {
  const dir = path.join(promptsRoot(), agentId);

  if (agentId === "criminalista") {
    const files = [...CRIMINALISTA_SYSTEM_FILES];
    for (const file of files) {
      try {
        await readFile(path.join(dir, file));
      } catch {
        throw new Error(`Prompt obrigatório ausente: ${file}`);
      }
    }
    return files;
  }

  try {
    const files = await readdir(dir);
    const numbered = files
      .filter((file) => /^0[1-9].+\.md$/i.test(file))
      .sort();
    if (numbered.length > 0) {
      return numbered;
    }
    if (files.includes("system.md")) {
      return ["system.md"];
    }
    return [];
  } catch {
    return [];
  }
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
