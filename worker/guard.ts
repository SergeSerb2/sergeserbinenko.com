// Pure input guards for the site agent. No I/O, no globals beyond RegExp.
// Node tests import this file with type stripping, so keep the syntax erasable.

import type { ErrorCode } from "./types.ts";

export const MAX_MESSAGE_CHARS = 280;
export const MAX_BODY_BYTES = 2048;
export const PASTE_MESSAGE =
  "Keep it short — this agent only answers questions about Serge and his work.";

const PRODUCTION_ORIGINS: ReadonlySet<string> = new Set([
  "https://sergeserbinenko.com",
  "https://www.sergeserbinenko.com",
]);

const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
const DEV_ORIGIN_PATTERN = /^http:\/\/localhost(:\d+)?$/;
// Control characters to strip. Keeps tab (\t) and newline (\n); \r is
// normalized to \n before this runs.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export type NormalizeResult =
  | { ok: true; message: string }
  | { ok: false; code: ErrorCode; message: string };

function fail(code: ErrorCode, message: string): NormalizeResult {
  return { ok: false, code, message };
}

/**
 * True when the text looks like a pasted document or code rather than a
 * short question: many lines, a fenced code block, or mostly symbols.
 * The symbol ratio only applies to longer texts so short inputs like
 * "???" still pass.
 */
export function looksLikePaste(raw: string): boolean {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const newlineCount = normalized.split("\n").length - 1;
  if (newlineCount > 6) return true;
  if (normalized.includes("```")) return true;
  const nonSpace = normalized.replace(/\s/g, "");
  if (nonSpace.length >= 20) {
    const lettersOrDigits = nonSpace.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    const symbols = nonSpace.length - lettersOrDigits;
    if (symbols / nonSpace.length > 0.4) return true;
  }
  return false;
}

/** Validate and normalize one visitor message. */
export function normalizeMessage(value: unknown): NormalizeResult {
  if (typeof value !== "string") {
    return fail("bad_request", "Send a short text question.");
  }
  if (looksLikePaste(value)) {
    return fail("too_long", PASTE_MESSAGE);
  }
  const message = value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (message.length === 0) {
    return fail("bad_request", "Send a short text question.");
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return fail("too_long", PASTE_MESSAGE);
  }
  return { ok: true, message };
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

export function isValidTurnstileToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048;
}

/** Same-origin check. Localhost origins count only in dev. */
export function isOriginAllowed(origin: string | null, dev: boolean): boolean {
  if (origin === null || origin === "") return false;
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  return dev && DEV_ORIGIN_PATTERN.test(origin);
}

/** Reject cross-site requests when the browser sends Sec-Fetch-Site. */
export function isSecFetchSiteOk(value: string | null): boolean {
  return value === null || value === "" || value === "same-origin";
}

/**
 * Resolve the upstream model base URL. Returns the value without trailing
 * slashes, or null when it is missing, unparsable, or not https (http is
 * allowed in dev only, for a local proxy).
 */
export function resolveUpstreamBase(value: string | undefined, dev: boolean): string | null {
  if (value === undefined) return null;
  const stripped = value.trim().replace(/\/+$/, "");
  if (stripped === "") return null;
  let url: URL;
  try {
    url = new URL(stripped);
  } catch {
    return null;
  }
  if (url.protocol === "https:") return stripped;
  if (url.protocol === "http:" && dev) return stripped;
  return null;
}

/**
 * Read the valid page paths from knowledge text lines in the form
 * `PAGE <path> | <title>`. Duplicates are removed, order is kept.
 */
export function parseSitePaths(knowledge: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const line of knowledge.split("\n")) {
    if (!line.startsWith("PAGE ")) continue;
    const rest = line.slice("PAGE ".length);
    const separator = rest.indexOf(" | ");
    const path = (separator === -1 ? rest : rest.slice(0, separator)).trim();
    if (path.startsWith("/") && !seen.has(path)) {
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}
