import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentInfo } from "./types";

const AGENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

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

    try {
      await readFile(path.join(root, id, "system.md"), "utf8");
    } catch {
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
      // meta.json is optional
    }

    agents.push({ id, name, description });
  }

  return agents;
}

export async function loadAgentSystemPrompt(agentId: string): Promise<string> {
  if (!isAgentId(agentId)) {
    throw new Error("Agente inválido.");
  }

  const filePath = path.join(promptsRoot(), agentId, "system.md");

  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    throw new Error(`Prompt do agente "${agentId}" não encontrado.`);
  }
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
