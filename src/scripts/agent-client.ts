// Browser client for the site agent. No chat UI lives here: this module
// only talks to /api/agent/*, parses the SSE stream, and loads Turnstile.
// The SSE parser is a pure factory so tests can drive it with strings.

export interface SseEvent {
  type: string;
  data: unknown;
}

export interface AgentStatus {
  enabled: boolean;
  model: string;
}

export interface AgentSession {
  sessionId: string;
  expiresAt: string;
  remaining: number;
}

export interface AgentErrorData {
  code: string;
  message: string;
  retryAfter?: number;
}

export interface AgentClientOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
}

const FALLBACK_ERROR: AgentErrorData = {
  code: "upstream_error",
  message: "The agent hit a snag. Try again in a moment.",
};

/** Parse one SSE block (the text between blank lines). Null means no event. */
export function parseSseBlock(block: string): SseEvent | null {
  let type = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") type = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const rawData = dataLines.join("\n");
  try {
    return { type, data: JSON.parse(rawData) };
  } catch {
    return { type, data: rawData };
  }
}

export interface SseParser {
  push(chunk: string): void;
  end(): void;
}

/**
 * Incremental SSE parser. Handles events split across chunks, CRLF or
 * LF line endings (including a CRLF split between chunks), multi-line
 * data, comments, and unknown event types (passed through as-is).
 */
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = "";
  let heldCr = false;

  function emit(block: string): void {
    const event = parseSseBlock(block);
    if (event !== null) onEvent(event);
  }

  function drain(): void {
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      emit(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      index = buffer.indexOf("\n\n");
    }
  }

  return {
    push(chunk: string): void {
      let text = heldCr ? `\r${chunk}` : chunk;
      heldCr = false;
      if (text.endsWith("\r")) {
        heldCr = true;
        text = text.slice(0, -1);
      }
      buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      drain();
    },
    end(): void {
      if (heldCr) {
        buffer += "\n";
        heldCr = false;
      }
      drain();
      if (buffer.trim() !== "") emit(buffer);
      buffer = "";
    },
  };
}

async function readErrorData(response: Response): Promise<AgentErrorData> {
  try {
    const value: unknown = await response.json();
    if (typeof value === "object" && value !== null && "error" in value) {
      const error = (value as { error: unknown }).error;
      if (typeof error === "object" && error !== null) {
        const code = (error as { code?: unknown }).code;
        const message = (error as { message?: unknown }).message;
        const retryAfter = (error as { retryAfter?: unknown }).retryAfter;
        if (typeof code === "string" && typeof message === "string") {
          return typeof retryAfter === "number" ? { code, message, retryAfter } : { code, message };
        }
      }
    }
  } catch {
    // Fall through to the generic error.
  }
  return FALLBACK_ERROR;
}

function toError(data: AgentErrorData): Error & AgentErrorData {
  return Object.assign(new Error(data.message), data);
}

export async function getStatus(options: AgentClientOptions = {}): Promise<AgentStatus> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(`${options.baseUrl ?? ""}/api/agent/status`, {
    signal: options.signal,
  });
  if (!response.ok) throw toError(await readErrorData(response));
  return (await response.json()) as AgentStatus;
}

export async function startSession(
  turnstileToken: string,
  options: AgentClientOptions = {},
): Promise<AgentSession> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(`${options.baseUrl ?? ""}/api/agent/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turnstileToken }),
    signal: options.signal,
  });
  if (!response.ok) throw toError(await readErrorData(response));
  return (await response.json()) as AgentSession;
}

/**
 * Send one message and stream events to onEvent. HTTP errors before the
 * stream starts are also reported as an "error" event, so callers only
 * need one path for failures. Resolves when the stream ends.
 */
export async function send(
  sessionId: string,
  message: string,
  onEvent: (event: SseEvent) => void,
  options: AgentClientOptions = {},
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(`${options.baseUrl ?? ""}/api/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
    signal: options.signal,
  });
  if (!response.ok) {
    onEvent({ type: "error", data: await readErrorData(response) });
    return;
  }
  if (response.body === null) {
    onEvent({ type: "error", data: FALLBACK_ERROR });
    return;
  }
  const parser = createSseParser(onEvent);
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  execution?: string;
  appearance?: string;
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScript: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (turnstileScript !== null) return turnstileScript;
  turnstileScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      turnstileScript = null;
      reject(new Error("The bot check failed to load."));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}

async function waitForTurnstileApi(): Promise<TurnstileApi> {
  await loadTurnstileScript();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (window.turnstile !== undefined) return window.turnstile;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The bot check failed to load.");
}

/**
 * Load Turnstile once and return getToken(). Each getToken() call runs
 * the challenge again in a hidden container and resolves with a fresh
 * token. It rejects after 15 seconds. Concurrent calls share one run.
 */
export async function loadTurnstile(siteKey: string): Promise<() => Promise<string>> {
  const api = await waitForTurnstileApi();
  let container: HTMLDivElement | null = null;
  let widgetId: string | null = null;
  let pendingPromise: Promise<string> | null = null;
  let settleOk: ((token: string) => void) | null = null;
  let settleErr: ((error: Error) => void) | null = null;

  function finishOk(token: string): void {
    const settle = settleOk;
    settleOk = null;
    settleErr = null;
    pendingPromise = null;
    settle?.(token);
  }

  function finishErr(error: Error): void {
    const settle = settleErr;
    settleOk = null;
    settleErr = null;
    pendingPromise = null;
    settle?.(error);
  }

  return function getToken(): Promise<string> {
    if (pendingPromise !== null) return pendingPromise;
    pendingPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        finishErr(new Error("The bot check timed out. Try again."));
      }, 15_000);
      settleOk = (token) => {
        clearTimeout(timer);
        resolve(token);
      };
      settleErr = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      try {
        // The container lives on <html>, outside the <body> that
        // ClientRouter replaces on navigation, so a challenge survives page
        // changes. If it was detached anyway, a detached widget cannot run
        // again: drop it and render a fresh one.
        if (widgetId !== null && container !== null && !container.isConnected) {
          try {
            api.remove(widgetId);
          } catch {
            // Already gone with its container.
          }
          widgetId = null;
          container = null;
        }
        if (container === null || widgetId === null) {
          container = document.createElement("div");
          container.style.display = "none";
          document.documentElement.appendChild(container);
          widgetId = api.render(container, {
            sitekey: siteKey,
            action: "agent",
            execution: "execute",
            appearance: "interaction-only",
            callback: (token) => finishOk(token),
            "error-callback": () => finishErr(new Error("The bot check failed. Try again.")),
            "timeout-callback": () => finishErr(new Error("The bot check timed out. Try again.")),
            "expired-callback": () => finishErr(new Error("The bot check expired. Try again.")),
          });
        } else {
          api.reset(widgetId);
        }
        api.execute(widgetId);
      } catch {
        finishErr(new Error("The bot check failed. Try again."));
      }
    });
    return pendingPromise;
  };
}
