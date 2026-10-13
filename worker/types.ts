// Shared types for the site-agent Worker. Keep this file free of runtime
// imports so pure modules and tests can use it with type-only imports.

export type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "bot_check_failed"
  | "rate_limited"
  | "session_expired"
  | "session_limit"
  | "daily_limit"
  | "resting"
  | "too_long"
  | "upstream_error";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export type CreateSessionResult =
  | { ok: true; sessionId: string; expiresAt: number; remaining: number }
  | { ok: false; code: ErrorCode; retryAfter?: number };

export type BeginTurnResult =
  | { ok: true; history: HistoryMessage[]; remaining: number }
  | { ok: false; code: ErrorCode; retryAfter?: number };

export interface CreateSessionArgs {
  ip: string;
  now: number;
  enabled: boolean;
}

export interface BeginTurnArgs {
  sessionId: string;
  ip: string;
  now: number;
  enabled: boolean;
  dailyMessageCap: number;
  dailySpendCapMicro: number;
  reservationMicro: number;
}

export interface EndTurnArgs {
  sessionId: string;
  now: number;
  userText: string;
  assistantText: string;
  actualMicro: number;
}

/** The RPC surface of the Gate Durable Object. */
export interface GateApi {
  createSession(args: CreateSessionArgs): Promise<CreateSessionResult>;
  beginTurn(args: BeginTurnArgs): Promise<BeginTurnResult>;
  endTurn(args: EndTurnArgs): Promise<{ remaining: number }>;
}

export interface Env {
  ASSETS: Fetcher;
  GATE: DurableObjectNamespace;
  RL_CHAT: RateLimit;
  RL_SESSION: RateLimit;
  MODEL?: string;
  TURNSTILE_SITE_KEY?: string;
  DAILY_MESSAGE_CAP?: string;
  DAILY_SPEND_CAP_USD?: string;
  AGENT_ENABLED?: string;
  DEV?: string;
  ANTHROPIC_API_KEY?: string;
  TURNSTILE_SECRET?: string;
}
