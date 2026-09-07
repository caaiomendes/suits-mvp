import type { StreamEvent } from "./types";

export async function readChatSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      dispatchFrame(frame, onEvent);
    }
  }

  if (buffer.trim()) {
    dispatchFrame(buffer, onEvent);
  }
}

function dispatchFrame(
  frame: string,
  onEvent: (event: StreamEvent) => void,
): void {
  for (const line of frame.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }

    const data = trimmed.slice(5).trim();
    if (!data) {
      continue;
    }

    try {
      onEvent(JSON.parse(data) as StreamEvent);
    } catch {
      // ignore keep-alives or partial JSON
    }
  }
}
