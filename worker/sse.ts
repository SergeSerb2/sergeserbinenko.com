// Server-sent event encoding for /api/agent/chat. Data is JSON on one
// line, so clients never need to join multi-line data for our events
// (the browser parser still handles that case).

export type SseEventName = "text" | "action" | "done" | "error";

export function encodeSseEvent(event: SseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function encodeSseBytes(event: SseEventName, data: unknown): Uint8Array {
  return new TextEncoder().encode(encodeSseEvent(event, data));
}
