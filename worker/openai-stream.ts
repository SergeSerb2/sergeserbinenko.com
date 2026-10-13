// Pure parsing for the OpenAI-compatible Chat Completions stream.
// No I/O, so node:test can drive it with arbitrary chunk splits.

export const MAX_TOOL_ARGS_CHARS = 2000;
export const MAX_REPLY_CHARS = 900;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Incremental SSE parser. Feed decoded text in arbitrary chunks and get
 * back the parsed JSON payload of each finished `data:` event.
 * Unparsable payloads are skipped, never thrown on.
 */
export class SseDataParser {
  done = false;
  private buffer = "";
  private dataLines: string[] = [];

  feed(chunk: string): unknown[] {
    this.buffer += chunk;
    const payloads: unknown[] = [];
    let newline = this.buffer.indexOf("\n");
    while (newline !== -1) {
      let line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.handleLine(line, payloads);
      newline = this.buffer.indexOf("\n");
    }
    return payloads;
  }

  /** Dispatch any pending event when the stream ends without a blank line. */
  flush(): unknown[] {
    const payloads: unknown[] = [];
    if (this.buffer !== "") {
      let line = this.buffer;
      this.buffer = "";
      if (line.endsWith("\r")) line = line.slice(0, -1);
      this.handleLine(line, payloads);
    }
    this.dispatch(payloads);
    return payloads;
  }

  private handleLine(line: string, payloads: unknown[]): void {
    if (line === "") {
      this.dispatch(payloads);
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    if (line.startsWith("data:")) {
      let value = line.slice("data:".length);
      if (value.startsWith(" ")) value = value.slice(1);
      this.dataLines.push(value);
      return;
    }
    // event:, id:, retry:, and unknown fields carry no payload for us.
  }

  private dispatch(payloads: unknown[]): void {
    if (this.dataLines.length === 0) return;
    const raw = this.dataLines.join("\n");
    this.dataLines = [];
    if (raw.trim() === "[DONE]") {
      this.done = true;
      return;
    }
    try {
      payloads.push(JSON.parse(raw));
    } catch {
      // Skip unparsable payloads.
    }
  }
}

export interface ToolCallState {
  index: number;
  id: string;
  name: string;
  arguments: string;
  invalid: boolean;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
}

export interface AppliedDelta {
  textDelta: string;
  refusalDelta: string;
}

/** Reducer over parsed Chat Completions chunks. Unknown shapes never throw. */
export class ChatStreamAccumulator {
  text = "";
  refusal = "";
  toolCalls = new Map<number, ToolCallState>();
  finishReason: string | null = null;
  usage: ChatUsage | null = null;
  /** True after a top-level `{"error": ...}` event; the turn has failed. */
  failed = false;

  apply(chunk: unknown): AppliedDelta {
    const applied: AppliedDelta = { textDelta: "", refusalDelta: "" };
    if (!isRecord(chunk)) return applied;
    // CLIProxyAPI can report a failure after a 200 as a top-level error event,
    // even after partial output. Nothing after it counts.
    if (this.failed) return applied;
    if (chunk.error !== undefined && chunk.error !== null) {
      this.failed = true;
      return applied;
    }

    if (isRecord(chunk.usage)) {
      const details = isRecord(chunk.usage.prompt_tokens_details)
        ? chunk.usage.prompt_tokens_details
        : null;
      this.usage = {
        prompt_tokens: toTokenCount(chunk.usage.prompt_tokens),
        completion_tokens: toTokenCount(chunk.usage.completion_tokens),
        cached_tokens: toTokenCount(details?.cached_tokens),
      };
    }

    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      if (typeof choice.finish_reason === "string" && choice.finish_reason !== "") {
        this.finishReason = choice.finish_reason;
      }
      const delta = isRecord(choice.delta) ? choice.delta : null;
      if (delta === null) continue;
      if (typeof delta.content === "string" && delta.content !== "") {
        this.text += delta.content;
        applied.textDelta += delta.content;
      }
      if (typeof delta.refusal === "string" && delta.refusal !== "") {
        this.refusal += delta.refusal;
        applied.refusalDelta += delta.refusal;
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const entry of delta.tool_calls) this.applyToolCall(entry);
      }
    }
    return applied;
  }

  private applyToolCall(entry: unknown): void {
    if (!isRecord(entry)) return;
    const index =
      typeof entry.index === "number" && Number.isFinite(entry.index)
        ? Math.floor(entry.index)
        : 0;
    let call = this.toolCalls.get(index);
    if (call === undefined) {
      call = { index, id: "", name: "", arguments: "", invalid: false };
      this.toolCalls.set(index, call);
    }
    if (typeof entry.id === "string" && entry.id !== "") call.id = entry.id;
    const fn = isRecord(entry.function) ? entry.function : null;
    if (fn === null) return;
    if (typeof fn.name === "string" && fn.name !== "") call.name = fn.name;
    if (typeof fn.arguments === "string" && fn.arguments !== "" && !call.invalid) {
      if (call.arguments.length + fn.arguments.length > MAX_TOOL_ARGS_CHARS) {
        call.invalid = true;
        return;
      }
      call.arguments += fn.arguments;
    }
  }

  /** Tool calls ordered by index. */
  sortedToolCalls(): ToolCallState[] {
    return [...this.toolCalls.values()].sort((a, b) => a.index - b.index);
  }

  /** The first complete, non-invalid tool call, or null. */
  firstValidToolCall(): ToolCallState | null {
    for (const call of this.sortedToolCalls()) {
      if (!call.invalid && call.name !== "") return call;
    }
    return null;
  }
}

export interface ReplyCapResult {
  /** Text to forward to the client for this delta. */
  emit: string;
  /** True when the cap was hit and the upstream stream should stop. */
  capped: boolean;
}

/**
 * Apply the reply cap to one text delta. `sentChars` is the length already
 * forwarded. When the delta would pass the cap, only the fitting part is
 * kept, trimmed back to its last whitespace when one exists, and an
 * ellipsis is appended inside the cap.
 */
export function truncateReplyDelta(
  sentChars: number,
  delta: string,
  cap: number = MAX_REPLY_CHARS,
): ReplyCapResult {
  const sent = Math.max(0, Math.floor(sentChars));
  const limit = Math.max(0, Math.floor(cap));
  if (sent + delta.length <= limit) return { emit: delta, capped: false };
  const room = limit - sent;
  if (room <= 0) return { emit: "", capped: true };
  if (room === 1) return { emit: "…", capped: true };
  let fitting = delta.slice(0, room - 1);
  const lastWhitespace = Math.max(
    fitting.lastIndexOf(" "),
    fitting.lastIndexOf("\n"),
    fitting.lastIndexOf("\t"),
    fitting.lastIndexOf("\r"),
  );
  if (lastWhitespace !== -1) fitting = fitting.slice(0, lastWhitespace).trimEnd();
  return { emit: `${fitting}…`, capped: true };
}
