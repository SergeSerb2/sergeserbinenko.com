// Pure limit math for the Gate Durable Object. The DO reads rows, calls
// these functions, then writes. Keep every limit constant in this file.

import type { ErrorCode, HistoryMessage } from "./types.ts";

export const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_USER_TURNS_PER_SESSION = 10;
export const BUSY_STALE_MS = 60 * 1000;
export const MAX_SESSIONS_PER_IP_PER_DAY = 6;
export const MAX_MESSAGES_PER_IP_PER_DAY = 30;
export const HISTORY_MAX_MESSAGES = 8;
export const ASSISTANT_STORE_MAX_CHARS = 1200;
export const DEFAULT_DAILY_MESSAGE_CAP = 1500;
export const DEFAULT_DAILY_SPEND_CAP_MICRO = 1_500_000; // $1.50
export const ALARM_INTERVAL_MS = 60 * 60 * 1000;
export const BUSY_RETRY_AFTER_SECONDS = 5;

/** UTC day key, for example "2026-10-13". */
export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** The UTC day key N days before the given time. */
export function utcDayMinus(nowMs: number, days: number): string {
  return utcDay(nowMs - days * 24 * 60 * 60 * 1000);
}

export function parseDailyMessageCap(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_MESSAGE_CAP;
}

/** Parse a dollar amount like "1.50" into micro-USD. */
export function parseDailySpendCapMicro(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DAILY_SPEND_CAP_MICRO;
  return Math.round(parsed * 1_000_000);
}

export interface SessionRowState {
  expiresAt: number;
  userTurns: number;
  busySince: number | null;
}

export interface CreateSessionCheck {
  enabled: boolean;
  ipSessionsToday: number;
}

export interface BeginTurnCheck {
  now: number;
  enabled: boolean;
  session: SessionRowState | null;
  ipMessagesToday: number;
  globalMessagesToday: number;
  globalSpendMicro: number;
  globalReservedMicro: number;
  reservationMicro: number;
  dailyMessageCap: number;
  dailySpendCapMicro: number;
}

export type CheckResult = { ok: true } | { ok: false; code: ErrorCode; retryAfter?: number };

const OK: CheckResult = { ok: true };

function deny(code: ErrorCode, retryAfter?: number): CheckResult {
  return retryAfter === undefined ? { ok: false, code } : { ok: false, code, retryAfter };
}

export function checkCreateSession(check: CreateSessionCheck): CheckResult {
  if (!check.enabled) return deny("resting");
  if (check.ipSessionsToday >= MAX_SESSIONS_PER_IP_PER_DAY) return deny("daily_limit");
  return OK;
}

export function checkBeginTurn(check: BeginTurnCheck): CheckResult {
  if (!check.enabled) return deny("resting");
  const session = check.session;
  if (session === null || session.expiresAt <= check.now) return deny("session_expired");
  if (session.userTurns >= MAX_USER_TURNS_PER_SESSION) return deny("session_limit");
  if (session.busySince !== null && check.now - session.busySince < BUSY_STALE_MS) {
    return deny("rate_limited", BUSY_RETRY_AFTER_SECONDS);
  }
  if (check.ipMessagesToday >= MAX_MESSAGES_PER_IP_PER_DAY) return deny("daily_limit");
  if (check.globalMessagesToday >= check.dailyMessageCap) return deny("resting");
  if (check.globalSpendMicro + check.globalReservedMicro + check.reservationMicro > check.dailySpendCapMicro) {
    return deny("resting");
  }
  return OK;
}

/** Settle one reservation against the real cost. Reserved never goes below 0. */
export function settleSpend(
  settledMicro: number,
  reservedMicro: number,
  reservationMicro: number,
  actualMicro: number,
): { settledMicro: number; reservedMicro: number } {
  return {
    settledMicro: settledMicro + Math.max(0, actualMicro),
    reservedMicro: Math.max(0, reservedMicro - Math.max(0, reservationMicro)),
  };
}

/** Messages left in a session after `userTurns` turns have been used. */
export function remainingTurns(userTurns: number): number {
  return Math.max(0, MAX_USER_TURNS_PER_SESSION - userTurns);
}

/**
 * Append one exchange to the stored history. Keeps only the last
 * HISTORY_MAX_MESSAGES messages and caps stored assistant text.
 * Empty assistant text appends nothing, so roles always alternate.
 */
export function appendHistory(
  history: HistoryMessage[],
  userText: string,
  assistantText: string,
): HistoryMessage[] {
  const assistant = assistantText.slice(0, ASSISTANT_STORE_MAX_CHARS);
  if (assistant.length === 0) return history.slice(-HISTORY_MAX_MESSAGES);
  return [
    ...history,
    { role: "user" as const, content: userText },
    { role: "assistant" as const, content: assistant },
  ].slice(-HISTORY_MAX_MESSAGES);
}
