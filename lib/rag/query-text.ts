import type { ChatMessagePayload } from "@/lib/types";

const ATTACHMENT_EXCERPT = 1800;

export function buildRetrievalQuery(messages: ChatMessagePayload[]): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  if (!latest) {
    return "";
  }

  const parts = [latest.content.trim()];

  for (const attachment of latest.attachments ?? []) {
    if (attachment.kind === "text" && attachment.text.trim()) {
      parts.push(attachment.text.trim().slice(0, ATTACHMENT_EXCERPT));
    }
  }

  return parts.filter(Boolean).join("\n\n").slice(0, 6000);
}
