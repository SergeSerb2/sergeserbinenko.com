import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendHistory,
  checkBeginTurn,
  checkCreateSession,
  parseDailyMessageCap,
  parseDailyTokenCap,
  remainingTurns,
  settleTokens,
  utcDay,
  utcDayMinus,
  MAX_USER_TURNS_PER_SESSION,
  type BeginTurnCheck,
} from "./limits.ts";
import type { HistoryMessage } from "./types.ts";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

function baseCheck(overrides: Partial<BeginTurnCheck> = {}): BeginTurnCheck {
  return {
    now: NOW,
    enabled: true,
    session: { expiresAt: NOW + 60_000, userTurns: 0, busySince: null },
    ipMessagesToday: 0,
    globalMessagesToday: 0,
    globalTokens: 0,
    globalReservedTokens: 0,
    reservationTokens: 1000,
    dailyMessageCap: 1500,
    dailyTokenCap: 1_500_000,
    ...overrides,
  };
}

test("checkCreateSession enforces the kill switch and per-IP session cap", () => {
  assert.deepEqual(checkCreateSession({ enabled: true, ipSessionsToday: 0 }), { ok: true });
  assert.deepEqual(checkCreateSession({ enabled: true, ipSessionsToday: 5 }), { ok: true });
  assert.deepEqual(checkCreateSession({ enabled: true, ipSessionsToday: 6 }), {
    ok: false,
    code: "daily_limit",
  });
  assert.deepEqual(checkCreateSession({ enabled: false, ipSessionsToday: 0 }), {
    ok: false,
    code: "resting",
  });
});

test("checkBeginTurn accepts a normal turn", () => {
  assert.deepEqual(checkBeginTurn(baseCheck()), { ok: true });
});

test("checkBeginTurn rejects missing and expired sessions", () => {
  assert.deepEqual(checkBeginTurn(baseCheck({ session: null })), {
    ok: false,
    code: "session_expired",
  });
  assert.deepEqual(
    checkBeginTurn(baseCheck({ session: { expiresAt: NOW, userTurns: 0, busySince: null } })),
    { ok: false, code: "session_expired" },
  );
});

test("checkBeginTurn enforces the session turn cap", () => {
  const full = { expiresAt: NOW + 60_000, userTurns: MAX_USER_TURNS_PER_SESSION, busySince: null };
  assert.deepEqual(checkBeginTurn(baseCheck({ session: full })), {
    ok: false,
    code: "session_limit",
  });
  const almost = { ...full, userTurns: MAX_USER_TURNS_PER_SESSION - 1 };
  assert.deepEqual(checkBeginTurn(baseCheck({ session: almost })), { ok: true });
});

test("checkBeginTurn allows one in-flight turn and reclaims stale locks", () => {
  const busy = { expiresAt: NOW + 60_000, userTurns: 1, busySince: NOW - 1000 };
  assert.deepEqual(checkBeginTurn(baseCheck({ session: busy })), {
    ok: false,
    code: "rate_limited",
    retryAfter: 5,
  });
  const stale = { ...busy, busySince: NOW - 61_000 };
  assert.deepEqual(checkBeginTurn(baseCheck({ session: stale })), { ok: true });
});

test("checkBeginTurn enforces per-IP and global caps with distinct codes", () => {
  assert.deepEqual(checkBeginTurn(baseCheck({ ipMessagesToday: 30 })), {
    ok: false,
    code: "daily_limit",
  });
  assert.deepEqual(checkBeginTurn(baseCheck({ globalMessagesToday: 1500 })), {
    ok: false,
    code: "resting",
  });
  assert.deepEqual(checkBeginTurn(baseCheck({ enabled: false })), {
    ok: false,
    code: "resting",
  });
});

test("checkBeginTurn counts reservations against the token cap", () => {
  // Settled 1,499,500 + reserved 0 + new 1000 exceeds the 1,500,000 cap.
  assert.deepEqual(checkBeginTurn(baseCheck({ globalTokens: 1_499_500 })), {
    ok: false,
    code: "resting",
  });
  // In-flight reservations from other turns also count.
  assert.deepEqual(
    checkBeginTurn(baseCheck({ globalTokens: 1_000_000, globalReservedTokens: 499_500 })),
    { ok: false, code: "resting" },
  );
  // Exactly at the cap still fits.
  assert.deepEqual(checkBeginTurn(baseCheck({ globalTokens: 1_499_000 })), { ok: true });
});

test("settleTokens moves reservation to settled actual tokens", () => {
  assert.deepEqual(settleTokens(100, 50, 50, 30), { settledTokens: 130, reservedTokens: 0 });
  assert.deepEqual(settleTokens(100, 50, 50, 80), { settledTokens: 180, reservedTokens: 0 });
  assert.deepEqual(settleTokens(100, 50, 50, 0), { settledTokens: 100, reservedTokens: 0 });
  // Reserved never goes negative if state drifted.
  assert.deepEqual(settleTokens(100, 10, 50, 30), { settledTokens: 130, reservedTokens: 0 });
});

test("utcDay rolls over at UTC midnight", () => {
  assert.equal(utcDay(Date.UTC(2026, 9, 13, 23, 59, 59)), "2026-10-13");
  assert.equal(utcDay(Date.UTC(2026, 9, 14, 0, 0, 0)), "2026-10-14");
  assert.equal(utcDay(Date.UTC(2026, 0, 1, 0, 0, 0)), "2026-01-01");
  assert.equal(utcDayMinus(Date.UTC(2026, 9, 14, 12, 0, 0), 2), "2026-10-12");
});

test("cap parsers fall back to defaults on bad input", () => {
  assert.equal(parseDailyMessageCap("1500"), 1500);
  assert.equal(parseDailyMessageCap("0"), 0);
  assert.equal(parseDailyMessageCap(undefined), 1500);
  assert.equal(parseDailyMessageCap("nope"), 1500);
  assert.equal(parseDailyMessageCap("-5"), 1500);
  assert.equal(parseDailyTokenCap("4000000"), 4_000_000);
  assert.equal(parseDailyTokenCap("0"), 0);
  assert.equal(parseDailyTokenCap(undefined), 4_000_000);
  assert.equal(parseDailyTokenCap("nope"), 4_000_000);
  assert.equal(parseDailyTokenCap("-5"), 4_000_000);
});

test("appendHistory keeps the last 8 messages and caps assistant text", () => {
  let history: HistoryMessage[] = [];
  for (let i = 0; i < 6; i += 1) {
    history = appendHistory(history, `q${i}`, `a${i}`);
  }
  assert.equal(history.length, 8);
  assert.deepEqual(history[0], { role: "user", content: "q2" });
  assert.deepEqual(history[7], { role: "assistant", content: "a5" });

  const capped = appendHistory([], "q", "x".repeat(2000));
  assert.equal(capped[1]?.content.length, 1200);

  // Empty assistant text appends nothing, so roles still alternate.
  assert.deepEqual(appendHistory([], "q", ""), []);
});

test("remainingTurns counts down and floors at zero", () => {
  assert.equal(remainingTurns(0), 10);
  assert.equal(remainingTurns(9), 1);
  assert.equal(remainingTurns(10), 0);
  assert.equal(remainingTurns(25), 0);
});
