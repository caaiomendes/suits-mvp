export type ExtractPhase = "preparing" | "extracting" | "ready" | "error";

export type ExtractProgress = {
  phase: ExtractPhase;
  page?: number;
  pages?: number;
  chars?: number;
  error?: string;
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} MB`;
}

export function formatCharCount(chars: number): string {
  return chars.toLocaleString("pt-BR");
}

export function formatExtractChipStatus(progress: ExtractProgress): string {
  if (progress.phase === "preparing") {
    return "Preparando…";
  }
  if (progress.phase === "extracting") {
    const pagePart =
      progress.page && progress.pages
        ? `página ${progress.page} de ${progress.pages}`
        : "extraindo texto";
    const chars =
      typeof progress.chars === "number"
        ? ` · ${formatCharCount(progress.chars)} caracteres`
        : "";
    return `${pagePart}${chars}`;
  }
  if (progress.phase === "ready") {
    return typeof progress.chars === "number"
      ? `${formatCharCount(progress.chars)} caracteres`
      : "Pronto";
  }
  return progress.error ?? "Falha na extração";
}

export function formatExtractHeadline(progress: ExtractProgress, name?: string): string {
  if (progress.phase === "preparing") {
    return name
      ? `Preparando documento… ${name}`
      : "Preparando documento…";
  }
  if (progress.phase === "extracting") {
    const pagePart =
      progress.page && progress.pages
        ? `página ${progress.page} de ${progress.pages}`
        : "extraindo texto";
    const chars =
      typeof progress.chars === "number"
        ? ` · ${formatCharCount(progress.chars)} caracteres`
        : "";
    return `Preparando documento… ${pagePart}${chars}`;
  }
  if (progress.phase === "ready") {
    return typeof progress.chars === "number"
      ? `Documento pronto · ${formatCharCount(progress.chars)} caracteres`
      : "Documento pronto";
  }
  return progress.error ?? "Falha na extração";
}
