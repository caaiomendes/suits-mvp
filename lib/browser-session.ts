const SESSION_STORAGE_KEY = "suits-openrouter-session-id";

/** Stable OpenRouter session id for this browser tab (`sessionStorage`). */
export function getBrowserSessionId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)?.trim();
    if (existing && existing.length <= 256) {
      return existing;
    }

    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
