// Gate: one global Durable Object that owns sessions, per-IP counters,
// and the global daily spend meter. All limit decisions use the pure
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
  settleSpend,
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
  reserved_micro: number;
  history: string;
};

type IpDayRow = {
  sessions: number;
  messages: number;
};

type GlobalDayRow = {
  messages: number;
  spend_microusd: number;
  reserved_microusd: number;
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
    sql.exec(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        ip_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        user_turns INTEGER NOT NULL DEFAULT 0,
        busy INTEGER,
        reserved_micro INTEGER NOT NULL DEFAULT 0,
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
        spend_microusd INTEGER NOT NULL DEFAULT 0,
        reserved_microusd INTEGER NOT NULL DEFAULT 0
      )`,
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
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
          "SELECT messages, spend_microusd, reserved_microusd FROM global_days WHERE day = ?",
          day,
        )
        .toArray();
      const global = globalRows[0] ?? { messages: 0, spend_microusd: 0, reserved_microusd: 0 };
      const check = checkBeginTurn({
        now: args.now,
        enabled: args.enabled,
        session:
          session === undefined
            ? null
            : { expiresAt: session.expires_at, userTurns: session.user_turns, busySince: session.busy },
        ipMessagesToday: ipRows[0]?.messages ?? 0,
        globalMessagesToday: global.messages,
        globalSpendMicro: global.spend_microusd,
        globalReservedMicro: global.reserved_microusd,
        reservationMicro: args.reservationMicro,
        dailyMessageCap: args.dailyMessageCap,
        dailySpendCapMicro: args.dailySpendCapMicro,
      });
      if (!check.ok) return check;
      if (session === undefined) return { ok: false, code: "session_expired" };
      const userTurns = session.user_turns + 1;
      sql.exec(
        "UPDATE sessions SET busy = ?, user_turns = ?, reserved_micro = ? WHERE id = ?",
        args.now,
        userTurns,
        args.reservationMicro,
        args.sessionId,
      );
      sql.exec(
        `INSERT INTO ip_days (ip_hash, day, sessions, messages) VALUES (?, ?, 0, 1)
         ON CONFLICT (ip_hash, day) DO UPDATE SET messages = messages + 1`,
        ipHash,
        day,
      );
      sql.exec(
        `INSERT INTO global_days (day, messages, spend_microusd, reserved_microusd) VALUES (?, 1, 0, ?)
         ON CONFLICT (day) DO UPDATE SET messages = messages + 1, reserved_microusd = reserved_microusd + ?`,
        day,
        args.reservationMicro,
        args.reservationMicro,
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
      if (session.busy === null && session.reserved_micro === 0) return { remaining };
      // The reservation was booked on the day the turn began.
      const day = utcDay(session.busy ?? args.now);
      const globalRows = sql
        .exec<GlobalDayRow>(
          "SELECT messages, spend_microusd, reserved_microusd FROM global_days WHERE day = ?",
          day,
        )
        .toArray();
      const global = globalRows[0] ?? { messages: 0, spend_microusd: 0, reserved_microusd: 0 };
      const settled = settleSpend(
        global.spend_microusd,
        global.reserved_microusd,
        session.reserved_micro,
        args.actualMicro,
      );
      sql.exec(
        `INSERT INTO global_days (day, messages, spend_microusd, reserved_microusd) VALUES (?, 0, ?, ?)
         ON CONFLICT (day) DO UPDATE SET spend_microusd = ?, reserved_microusd = ?`,
        day,
        settled.settledMicro,
        settled.reservedMicro,
        settled.settledMicro,
        settled.reservedMicro,
      );
      const history = appendHistory(parseHistory(session.history), args.userText, args.assistantText);
      sql.exec(
        "UPDATE sessions SET busy = NULL, reserved_micro = 0, history = ? WHERE id = ?",
        JSON.stringify(history),
        args.sessionId,
      );
      return { remaining };
    });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const sql = this.ctx.storage.sql;
    sql.exec("DELETE FROM sessions WHERE expires_at <= ?", now);
    const cutoffDay = utcDayMinus(now, 2);
    sql.exec("DELETE FROM ip_days WHERE day < ?", cutoffDay);
    sql.exec("DELETE FROM global_days WHERE day < ?", cutoffDay);
    sql.exec("DELETE FROM meta WHERE key LIKE 'salt:%' AND key < ?", `salt:${cutoffDay}`);
    await this.ctx.storage.setAlarm(now + ALARM_INTERVAL_MS);
  }
}
