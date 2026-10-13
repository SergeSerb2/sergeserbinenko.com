// Pure helpers for the site-agent chat UI. No DOM lives here, so the
// wording, counter, and transcript rules can run under node:test.

export const MAX_MESSAGE_CHARS = 280;
export const COUNTER_SHOW_AFTER = 220;
export const MAX_TRANSCRIPT_ENTRIES = 24;
export const TEST_SITE_KEY = "1x00000000000000000000AA";
export const RESTING_NOTE_TEXT =
  "The agent is resting right now — your message will open in your mail app.";

export type TranscriptAction =
  | { type: "open_page"; path: string }
  | { type: "show_scenery" }
  | { type: "draft_email"; subject: string; body: string };

export interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  actions?: TranscriptAction[];
}

export interface PathTitle {
  path: string;
  title: string;
}

/** Local previews use Cloudflare's always-pass test site key. */
export function resolveSiteKey(hostname: string, configured: string): string {
  return hostname === "localhost" || hostname === "127.0.0.1" ? TEST_SITE_KEY : configured;
}

export interface CounterState {
  text: string;
  visible: boolean;
  over: boolean;
}

export function counterState(length: number): CounterState {
  return {
    text: `${length}/${MAX_MESSAGE_CHARS}`,
    visible: length > COUNTER_SHOW_AFTER,
    over: length > MAX_MESSAGE_CHARS,
  };
}

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
};

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

/** The noun for the note: "1 message left" vs "3 messages left". */
export function remainingWord(remaining: number): string {
  return remaining === 1 ? "message" : "messages";
}

export interface AgentFailure {
  code: string;
  message?: string;
  retryAfter?: number;
}

/** Friendly error text for a server code. Unknown codes read as our fault. */
export function errorText(failure: AgentFailure): string {
  switch (failure.code) {
    case "rate_limited":
      return typeof failure.retryAfter === "number"
        ? `You're going a little fast — try again in ${failure.retryAfter}s.`
        : "You're going a little fast — try again in a moment.";
    case "session_limit":
      return "That's the end of this chat. Start a new chat, or email Serge.";
    case "daily_limit":
    case "resting":
      return "The agent is resting for today. You can still email Serge.";
    case "too_long":
      return failure.message ?? "That message is too long. Keep it short.";
    case "bot_check_failed":
      return "I couldn't confirm you're a person. Please try again.";
    default:
      return "Something went wrong on my side. Please try again in a moment.";
  }
}

/** These failures also get an "Email Serge" link inside the message. */
export function errorWantsEmailLink(code: string): boolean {
  return code === "session_limit" || code === "daily_limit" || code === "resting";
}

/** Sidebar row title for a path, or the path itself when unknown. */
export function titleForPath(path: string, rows: PathTitle[]): string {
  return rows.find((row) => row.path === path)?.title ?? path;
}

const ALWAYS_NAVIGABLE: ReadonlySet<string> = new Set(["/projects", "/resume", "/contact", "/"]);

/** Only sidebar pages (and the fixed set) may be auto-navigated to. */
export function isNavigablePath(path: string, rows: PathTitle[]): boolean {
  return ALWAYS_NAVIGABLE.has(path) || rows.some((row) => row.path === path);
}

/** Validate an action from the stream or from storage. Null drops it. */
export function parseAction(value: unknown): TranscriptAction | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type === "show_scenery") return { type: "show_scenery" };
  if (record.type === "open_page" && typeof record.path === "string") {
    return { type: "open_page", path: record.path };
  }
  if (
    record.type === "draft_email" &&
    typeof record.subject === "string" &&
    typeof record.body === "string"
  ) {
    return { type: "draft_email", subject: record.subject, body: record.body };
  }
  return null;
}

function cleanEntry(value: unknown): TranscriptEntry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.role !== "user" && record.role !== "agent") return null;
  if (typeof record.text !== "string") return null;
  const entry: TranscriptEntry = { role: record.role, text: record.text };
  if (Array.isArray(record.actions)) {
    const actions = record.actions
      .map(parseAction)
      .filter((action): action is TranscriptAction => action !== null);
    if (actions.length > 0) entry.actions = actions;
  }
  return entry;
}

/** Append one entry, keeping only the newest MAX_TRANSCRIPT_ENTRIES. */
export function appendTranscript(
  entries: TranscriptEntry[],
  entry: TranscriptEntry,
): TranscriptEntry[] {
  return [...entries, entry].slice(-MAX_TRANSCRIPT_ENTRIES);
}

export function serializeTranscript(entries: TranscriptEntry[]): string {
  return JSON.stringify(entries.slice(-MAX_TRANSCRIPT_ENTRIES));
}

/** Parse stored JSON. Bad input of any shape yields an empty transcript. */
export function parseTranscript(raw: string | null): TranscriptEntry[] {
  if (raw === null || raw === "") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map(cleanEntry)
    .filter((entry): entry is TranscriptEntry => entry !== null)
    .slice(-MAX_TRANSCRIPT_ENTRIES);
}

/** The session kept in sessionStorage between page loads. */
export interface StoredSession {
  id: string;
  expiresAt: string;
}

/** Treat a session as expired this long before the server does. */
export const SESSION_EXPIRY_MARGIN_MS = 30_000;

export function serializeSession(session: StoredSession): string {
  return JSON.stringify({ id: session.id, expiresAt: session.expiresAt });
}

/** Parse a stored session. Bad, missing, or (nearly) expired yields null. */
export function parseStoredSession(raw: string | null, now: number): StoredSession | null {
  if (raw === null || raw === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id === "") return null;
  if (typeof record.expiresAt !== "string") return null;
  const expires = Date.parse(record.expiresAt);
  if (!Number.isFinite(expires) || expires - SESSION_EXPIRY_MARGIN_MS <= now) return null;
  return { id: record.id, expiresAt: record.expiresAt };
}

/** What the note under the composer says: model, and messages left once known. */
export interface ChatNote {
  model: string;
  remaining: number | null;
}

/** The note split around the bold count: `{lead}<b>{count}</b>{tail}`. */
export interface NoteSegments {
  lead: string;
  count: string | null;
  tail: string;
}

export function noteSegments(note: ChatNote): NoteSegments {
  const lead = `Site agent · ${modelLabel(note.model)}`;
  if (note.remaining === null) return { lead, count: null, tail: "" };
  return {
    lead: `${lead} · `,
    count: String(note.remaining),
    tail: ` ${remainingWord(note.remaining)} left in this chat`,
  };
}

export function noteText(note: ChatNote): string {
  const segments = noteSegments(note);
  return `${segments.lead}${segments.count ?? ""}${segments.tail}`;
}

export function serializeNote(note: ChatNote): string {
  return JSON.stringify({ model: note.model, remaining: note.remaining });
}

/** Parse a stored note. Bad input yields null. */
export function parseNote(raw: string | null): ChatNote | null {
  if (raw === null || raw === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.model !== "string" || record.model === "") return null;
  const remaining = record.remaining;
  if (remaining === null || remaining === undefined) return { model: record.model, remaining: null };
  if (typeof remaining !== "number" || !Number.isInteger(remaining) || remaining < 0) return null;
  return { model: record.model, remaining };
}

/** A mailto: link with an encoded subject and body. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** What "Copy" on a drafted email puts on the clipboard. */
export function draftClipboardText(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`;
}

/**
 * Turn anything thrown or streamed into a failure with a code. Server
 * errors carry a string code; anything else (a network error, a thrown
 * string) reads as "network", which errorText treats as our fault.
 */
export function toFailure(value: unknown): AgentFailure {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.code === "string" && record.code !== "") {
      const failure: AgentFailure = { code: record.code };
      if (typeof record.message === "string") failure.message = record.message;
      if (typeof record.retryAfter === "number") failure.retryAfter = record.retryAfter;
      return failure;
    }
  }
  return { code: "network" };
}
