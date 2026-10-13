// Gate: one global Durable Object that owns sessions, per-IP counters,
// and the global daily token meter. All limit decisions use the pure
// functions in limits.ts. IP addresses arrive over RPC, are hashed with
// a per-day salt, and are never stored or logged in plain form.

import { DurableObject } from "cloudflare:workers";
import {
  ALARM_INTERVAL_MS,
  appendHistory,
  checkBeginTurn,
  checkCreateSession,
  remainingTurns,
  SESSION_TTL_MS,
  settleTokens,
  utcDay,
  utcDayMinus,
} from "./limits.ts";
import type {
  BeginTurnArgs,
  BeginTurnResult,
  CreateSessionArgs,
  CreateSessionResult,
  EndTurnArgs,
  Env,
  GateApi,
  HistoryMessage,
} from "./types.ts";

type SessionRow = {
  id: string;
  ip_hash: string;
  created_at: number;
  expires_at: number;
  user_turns: number;
  busy: number | null;
  reserved_tokens: number;
  history: string;
};

type IpDayRow = {
  sessions: number;
  messages: number;
};

type GlobalDayRow = {
  messages: number;
  tokens: number;
  reserved_tokens: number;
};

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseHistory(raw: string): HistoryMessage[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const history: HistoryMessage[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        (item as { role?: unknown }).role !== undefined &&
        ((item as { role: unknown }).role === "user" ||
          (item as { role: unknown }).role === "assistant") &&
        typeof (item as { content?: unknown }).content === "string"
      ) {
        history.push(item as HistoryMessage);
      }
    }
    return history;
  } catch {
    return [];
  }
}

export class Gate extends DurableObject<Env> implements GateApi {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    // One-time migration to the token meter. Sessions live 30 minutes and
    // day counters are disposable, so drop the old tables. ip_days and the
    // meta salts keep their schema and are not dropped.
    const versionRows = sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", "schema_version")
      .toArray();
    if (versionRows[0]?.value !== "2") {
      this.ctx.storage.transactionSync(() => {
        sql.exec("DROP TABLE IF EXISTS sessions");
        sql.exec("DROP TABLE IF EXISTS global_days");
        sql.exec(
          "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          "schema_version",
          "2",
        );
      });
    }
    sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        ip_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_turns INTEGER NOT NULL DEFAULT 0,
        busy INTEGER,
        reserved_tokens INTEGER NOT NULL DEFAULT 0,
        history TEXT NOT NULL DEFAULT '[]'
      )`,
    );
    sql.exec(
      `CREATE TABLE IF NOT EXISTS ip_days (
        ip_hash TEXT NOT NULL,
        day TEXT NOT NULL,
        sessions INTEGER NOT NULL DEFAULT 0,
        messages INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ip_hash, day)
      )`,
    );
    sql.exec(
      `CREATE TABLE IF NOT EXISTS global_days (
        day TEXT PRIMARY KEY,
        messages INTEGER NOT NULL DEFAULT 0,
        tokens INTEGER NOT NULL DEFAULT 0,
        reserved_tokens INTEGER NOT NULL DEFAULT 0
      )`,
    );
  }

  /** Hash an IP with the salt for the given UTC day, creating the salt once. */
  private async hashIp(ip: string, day: string): Promise<string> {
    const sql = this.ctx.storage.sql;
    const key = `salt:${day}`;
    sql.exec("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)", key, randomHex(16));
    const rows = sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray();
    const salt = rows[0]?.value ?? "";
    return sha256Hex(`${ip}:${salt}`);
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  async createSession(args: CreateSessionArgs): Promise<CreateSessionResult> {
    const day = utcDay(args.now);
    const ipHash = await this.hashIp(args.ip, day);
    const sessionId = randomHex(16);
    const expiresAt = args.now + SESSION_TTL_MS;
    const result = this.ctx.storage.transactionSync((): CreateSessionResult => {
      const sql = this.ctx.storage.sql;
      const ipRows = sql
        .exec<IpDayRow>("SELECT sessions, messages FROM ip_days WHERE ip_hash = ? AND day = ?", ipHash, day)
        .toArray();
      const check = checkCreateSession({
        enabled: args.enabled,
        ipSessionsToday: ipRows[0]?.sessions ?? 0,
      });
      if (!check.ok) return check;
      sql.exec(
        "INSERT INTO sessions (id, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
        sessionId,
        ipHash,
        args.now,
        expiresAt,
      );
      sql.exec(
        `INSERT INTO ip_days (ip_hash, day, sessions, messages) VALUES (?, ?, 1, 0)
         ON CONFLICT (ip_hash, day) DO UPDATE SET sessions = sessions + 1`,
        ipHash,
        day,
      );
      return { ok: true, sessionId, expiresAt, remaining: remainingTurns(0) };
    });
    if (result.ok) await this.ensureAlarm();
    return result;
  }

  async beginTurn(args: BeginTurnArgs): Promise<BeginTurnResult> {
    const day = utcDay(args.now);
    const ipHash = await this.hashIp(args.ip, day);
    const result = this.ctx.storage.transactionSync((): BeginTurnResult => {
      const sql = this.ctx.storage.sql;
      const sessionRows = sql
        .exec<SessionRow>("SELECT * FROM sessions WHERE id = ?", args.sessionId)
        .toArray();
      const session = sessionRows[0];
      const ipRows = sql
        .exec<IpDayRow>("SELECT sessions, messages FROM ip_days WHERE ip_hash = ? AND day = ?", ipHash, day)
        .toArray();
      const globalRows = sql
        .exec<GlobalDayRow>(
          "SELECT messages, tokens, reserved_tokens FROM global_days WHERE day = ?",
          day,
        )
        .toArray();
      const global = globalRows[0] ?? { messages: 0, tokens: 0, reserved_tokens: 0 };
      const check = checkBeginTurn({
        now: args.now,
        enabled: args.enabled,
        session:
          session === undefined
            ? null
            : { expiresAt: session.expires_at, userTurns: session.user_turns, busySince: session.busy },
        ipMessagesToday: ipRows[0]?.messages ?? 0,
        globalMessagesToday: global.messages,
        globalTokens: global.tokens,
        globalReservedTokens: global.reserved_tokens,
        reservationTokens: args.reservationTokens,
        dailyMessageCap: args.dailyMessageCap,
        dailyTokenCap: args.dailyTokenCap,
      });
      if (!check.ok) return check;
      if (session === undefined) return { ok: false, code: "session_expired" };
      // Taking over a stale lock: its reservation never settled.
      this.releaseReservation(session);
      const userTurns = session.user_turns + 1;
      sql.exec(
        "UPDATE sessions SET busy = ?, user_turns = ?, reserved_tokens = ? WHERE id = ?",
        args.now,
        userTurns,
        args.reservationTokens,
        args.sessionId,
      );
      sql.exec(
        `INSERT INTO ip_days (ip_hash, day, sessions, messages) VALUES (?, ?, 0, 1)
         ON CONFLICT (ip_hash, day) DO UPDATE SET messages = messages + 1`,
        ipHash,
        day,
      );
      sql.exec(
        `INSERT INTO global_days (day, messages, tokens, reserved_tokens) VALUES (?, 1, 0, ?)
         ON CONFLICT (day) DO UPDATE SET messages = messages + 1, reserved_tokens = reserved_tokens + ?`,
        day,
        args.reservationTokens,
        args.reservationTokens,
      );
      return {
        ok: true,
        history: parseHistory(session.history),
        remaining: remainingTurns(userTurns),
      };
    });
    if (result.ok) await this.ensureAlarm();
    return result;
  }

  async endTurn(args: EndTurnArgs): Promise<{ remaining: number }> {
    return this.ctx.storage.transactionSync((): { remaining: number } => {
      const sql = this.ctx.storage.sql;
      const sessionRows = sql
        .exec<SessionRow>("SELECT * FROM sessions WHERE id = ?", args.sessionId)
        .toArray();
      const session = sessionRows[0];
      if (session === undefined) return { remaining: 0 };
      const remaining = remainingTurns(session.user_turns);
      // Settle once only: a repeated endTurn for the same turn is a no-op.
      if (session.busy === null && session.reserved_tokens === 0) return { remaining };
      // The reservation was booked on the day the turn began.
      const day = utcDay(session.busy ?? args.now);
      const globalRows = sql
        .exec<GlobalDayRow>(
          "SELECT messages, tokens, reserved_tokens FROM global_days WHERE day = ?",
          day,
        )
        .toArray();
      const global = globalRows[0] ?? { messages: 0, tokens: 0, reserved_tokens: 0 };
      const settled = settleTokens(
        global.tokens,
        global.reserved_tokens,
        session.reserved_tokens,
        args.actualTokens,
      );
      sql.exec(
        `INSERT INTO global_days (day, messages, tokens, reserved_tokens) VALUES (?, 0, ?, ?)
         ON CONFLICT (day) DO UPDATE SET tokens = ?, reserved_tokens = ?`,
        day,
        settled.settledTokens,
        settled.reservedTokens,
        settled.settledTokens,
        settled.reservedTokens,
      );
      const history = appendHistory(parseHistory(session.history), args.userText, args.assistantText);
      sql.exec(
        "UPDATE sessions SET busy = NULL, reserved_tokens = 0, history = ? WHERE id = ?",
        JSON.stringify(history),
        args.sessionId,
      );
      return { remaining };
    });
  }

  /**
   * Give back a reservation that never settled (the Worker died mid-turn), so it
   * stops counting against the daily token cap. Charged to the day it was made.
   */
  private releaseReservation(session: Pick<SessionRow, "busy" | "reserved_tokens">): void {
    if (session.reserved_tokens <= 0 || session.busy === null) return;
    this.ctx.storage.sql.exec(
      "UPDATE global_days SET reserved_tokens = MAX(0, reserved_tokens - ?) WHERE day = ?",
      session.reserved_tokens,
      utcDay(session.busy),
    );
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      const expired = sql
        .exec<Pick<SessionRow, "busy" | "reserved_tokens">>(
          "SELECT busy, reserved_tokens FROM sessions WHERE expires_at <= ? AND reserved_tokens > 0",
          now,
        )
        .toArray();
      for (const session of expired) this.releaseReservation(session);
      sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
    });
    const cutoffDay = utcDayMinus(now, 2);
    sql.exec("DELETE FROM ip_days WHERE day < ?", cutoffDay);
    sql.exec("DELETE FROM global_days WHERE day < ?", cutoffDay);
    sql.exec("DELETE FROM meta WHERE key LIKE 'salt:%' AND key < ?", `salt:${cutoffDay}`);
    await this.ctx.storage.setAlarm(now + ALARM_INTERVAL_MS);
  }
}
