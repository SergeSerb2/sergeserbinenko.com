import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNTER_SHOW_AFTER,
  MAX_MESSAGE_CHARS,
  MAX_TRANSCRIPT_ENTRIES,
  RESTING_NOTE_TEXT,
  SESSION_EXPIRY_MARGIN_MS,
  TEST_SITE_KEY,
  appendTranscript,
  counterState,
  draftClipboardText,
  errorText,
  errorWantsEmailLink,
  isNavigablePath,
  mailtoHref,
  modelLabel,
  noteSegments,
  noteText,
  parseAction,
  parseNote,
  parseStoredSession,
  parseTranscript,
  remainingWord,
  resolveSiteKey,
  serializeNote,
  serializeSession,
  serializeTranscript,
  titleForPath,
  toFailure,
  type TranscriptEntry,
} from "./agent-ui-model.ts";

const ROWS = [
  { path: "/", title: "About" },
  { path: "/resume", title: "Résumé" },
  { path: "/projects/t3-pretty", title: "T3 Pretty" },
];

function entries(count: number): TranscriptEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("agent" as const),
    text: `m${i}`,
  }));
}

test("constants match the server limits and the copy", () => {
  assert.equal(MAX_MESSAGE_CHARS, 280);
  assert.equal(COUNTER_SHOW_AFTER, 220);
  assert.equal(MAX_TRANSCRIPT_ENTRIES, 24);
  assert.equal(TEST_SITE_KEY, "1x00000000000000000000AA");
  assert.equal(
    RESTING_NOTE_TEXT,
    "The agent is resting right now — your message will open in your mail app.",
  );
});

test("resolveSiteKey uses the test key only on local hosts", () => {
  assert.equal(resolveSiteKey("localhost", "0xREAL"), TEST_SITE_KEY);
  assert.equal(resolveSiteKey("127.0.0.1", "0xREAL"), TEST_SITE_KEY);
  assert.equal(resolveSiteKey("sergeserbinenko.com", "0xREAL"), "0xREAL");
  assert.equal(resolveSiteKey("localhost.evil.com", "0xREAL"), "0xREAL");
});

test("counterState shows after 220 and flags over 280", () => {
  assert.deepEqual(counterState(0), { text: "0/280", visible: false, over: false });
  assert.deepEqual(counterState(220), { text: "220/280", visible: false, over: false });
  assert.deepEqual(counterState(221), { text: "221/280", visible: true, over: false });
  assert.deepEqual(counterState(280), { text: "280/280", visible: true, over: false });
  assert.deepEqual(counterState(281), { text: "281/280", visible: true, over: true });
});

test("modelLabel names known models and passes others through", () => {
  assert.equal(modelLabel("claude-haiku-5-5"), "Claude Haiku 5.5");
  assert.equal(modelLabel("claude-sonnet-5-5"), "Claude Sonnet 5.5");
  assert.equal(modelLabel("some-other-model"), "some-other-model");
});

test("remainingWord is singular only for one", () => {
  assert.equal(remainingWord(1), "message");
  assert.equal(remainingWord(0), "messages");
  assert.equal(remainingWord(9), "messages");
});

test("errorText gives friendly text per code", () => {
  assert.equal(
    errorText({ code: "rate_limited", retryAfter: 60 }),
    "You're going a little fast — try again in 60s.",
  );
  assert.equal(
    errorText({ code: "rate_limited" }),
    "You're going a little fast — try again in a moment.",
  );
  assert.equal(
    errorText({ code: "session_limit" }),
    "That's the end of this chat. Start a new chat, or email Serge.",
  );
  assert.equal(
    errorText({ code: "daily_limit" }),
    "The agent is resting for today. You can still email Serge.",
  );
  assert.equal(errorText({ code: "resting" }), errorText({ code: "daily_limit" }));
  assert.equal(errorText({ code: "too_long", message: "Keep it short." }), "Keep it short.");
  assert.equal(errorText({ code: "too_long" }), "That message is too long. Keep it short.");
  assert.equal(
    errorText({ code: "bot_check_failed" }),
    "I couldn't confirm you're a person. Please try again.",
  );
  const fallback = "Something went wrong on my side. Please try again in a moment.";
  assert.equal(errorText({ code: "upstream_error" }), fallback);
  assert.equal(errorText({ code: "network" }), fallback);
  assert.equal(errorText({ code: "forbidden", message: "raw server text" }), fallback);
});

test("errorWantsEmailLink only for the out-of-messages codes", () => {
  assert.equal(errorWantsEmailLink("session_limit"), true);
  assert.equal(errorWantsEmailLink("daily_limit"), true);
  assert.equal(errorWantsEmailLink("resting"), true);
  assert.equal(errorWantsEmailLink("rate_limited"), false);
  assert.equal(errorWantsEmailLink("upstream_error"), false);
});

test("titleForPath finds the sidebar title or falls back to the path", () => {
  assert.equal(titleForPath("/projects/t3-pretty", ROWS), "T3 Pretty");
  assert.equal(titleForPath("/", ROWS), "About");
  assert.equal(titleForPath("/projects/unknown", ROWS), "/projects/unknown");
  assert.equal(titleForPath("/resume", []), "/resume");
});

test("isNavigablePath allows sidebar rows and the fixed pages only", () => {
  assert.equal(isNavigablePath("/projects/t3-pretty", ROWS), true);
  for (const path of ["/", "/projects", "/resume", "/contact"]) {
    assert.equal(isNavigablePath(path, []), true, path);
  }
  assert.equal(isNavigablePath("/projects/unknown", ROWS), false);
  assert.equal(isNavigablePath("https://evil.example/", ROWS), false);
  assert.equal(isNavigablePath("//evil.example", ROWS), false);
});

test("parseAction keeps valid actions and drops everything else", () => {
  assert.deepEqual(parseAction({ type: "show_scenery", extra: 1 }), { type: "show_scenery" });
  assert.deepEqual(parseAction({ type: "open_page", path: "/resume" }), {
    type: "open_page",
    path: "/resume",
  });
  assert.deepEqual(parseAction({ type: "draft_email", subject: "Hi", body: "Hello" }), {
    type: "draft_email",
    subject: "Hi",
    body: "Hello",
  });
  assert.equal(parseAction({ type: "open_page" }), null);
  assert.equal(parseAction({ type: "draft_email", subject: "Hi" }), null);
  assert.equal(parseAction({ type: "run_code" }), null);
  assert.equal(parseAction([]), null);
  assert.equal(parseAction(null), null);
  assert.equal(parseAction("show_scenery"), null);
});

test("appendTranscript appends without mutating and keeps the newest 24", () => {
  const start = entries(2);
  const next = appendTranscript(start, { role: "user", text: "new" });
  assert.equal(start.length, 2);
  assert.equal(next.length, 3);
  assert.deepEqual(next[2], { role: "user", text: "new" });

  const full = appendTranscript(entries(24), { role: "agent", text: "last" });
  assert.equal(full.length, MAX_TRANSCRIPT_ENTRIES);
  assert.equal(full[0]?.text, "m1");
  assert.equal(full[23]?.text, "last");
});

test("serializeTranscript round-trips through parseTranscript, capped", () => {
  const list: TranscriptEntry[] = [
    { role: "user", text: "Show me Spotiurge" },
    { role: "agent", text: "Opening it.", actions: [{ type: "open_page", path: "/projects/spotiurge" }] },
  ];
  assert.deepEqual(parseTranscript(serializeTranscript(list)), list);
  const long = entries(30);
  const parsed = parseTranscript(serializeTranscript(long));
  assert.equal(parsed.length, MAX_TRANSCRIPT_ENTRIES);
  assert.equal(parsed[0]?.text, "m6");
});

test("parseTranscript rejects bad input and cleans bad entries", () => {
  assert.deepEqual(parseTranscript(null), []);
  assert.deepEqual(parseTranscript(""), []);
  assert.deepEqual(parseTranscript("{not json"), []);
  assert.deepEqual(parseTranscript('{"role":"user"}'), []);
  const raw = JSON.stringify([
    { role: "user", text: "ok" },
    { role: "system", text: "nope" },
    { role: "agent" },
    null,
    { role: "agent", text: "with junk actions", actions: [{ type: "evil" }, { type: "show_scenery" }] },
    { role: "agent", text: "only junk", actions: [{ type: "evil" }] },
  ]);
  assert.deepEqual(parseTranscript(raw), [
    { role: "user", text: "ok" },
    { role: "agent", text: "with junk actions", actions: [{ type: "show_scenery" }] },
    { role: "agent", text: "only junk" },
  ]);
  assert.equal(parseTranscript(JSON.stringify(entries(40))).length, MAX_TRANSCRIPT_ENTRIES);
});

test("serializeSession and parseStoredSession round-trip a live session", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const session = { id: "a".repeat(32), expiresAt: "2026-10-13T13:00:00.000Z" };
  assert.deepEqual(parseStoredSession(serializeSession(session), now), session);
});

test("parseStoredSession drops expired, nearly expired, and bad sessions", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const at = (ms: number) => JSON.stringify({ id: "abc", expiresAt: new Date(now + ms).toISOString() });
  assert.equal(parseStoredSession(at(-1000), now), null);
  assert.equal(parseStoredSession(at(SESSION_EXPIRY_MARGIN_MS), now), null);
  assert.notEqual(parseStoredSession(at(SESSION_EXPIRY_MARGIN_MS + 1000), now), null);
  assert.equal(parseStoredSession(null, now), null);
  assert.equal(parseStoredSession("", now), null);
  assert.equal(parseStoredSession("nope", now), null);
  assert.equal(parseStoredSession("[]", now), null);
  assert.equal(parseStoredSession(JSON.stringify({ id: "", expiresAt: "2099-01-01T00:00:00Z" }), now), null);
  assert.equal(parseStoredSession(JSON.stringify({ id: "abc", expiresAt: "soon" }), now), null);
  assert.equal(parseStoredSession(JSON.stringify({ id: "abc" }), now), null);
});

test("noteSegments and noteText build the chat note", () => {
  assert.deepEqual(noteSegments({ model: "claude-haiku-5-5", remaining: 9 }), {
    lead: "Site agent · Claude Haiku 5.5 · ",
    count: "9",
    tail: " messages left in this chat",
  });
  assert.equal(
    noteText({ model: "claude-haiku-5-5", remaining: 1 }),
    "Site agent · Claude Haiku 5.5 · 1 message left in this chat",
  );
  assert.deepEqual(noteSegments({ model: "claude-sonnet-5-5", remaining: null }), {
    lead: "Site agent · Claude Sonnet 5.5",
    count: null,
    tail: "",
  });
  assert.equal(noteText({ model: "claude-sonnet-5-5", remaining: null }), "Site agent · Claude Sonnet 5.5");
});

test("serializeNote and parseNote round-trip and reject bad input", () => {
  const note = { model: "claude-haiku-5-5", remaining: 0 };
  assert.deepEqual(parseNote(serializeNote(note)), note);
  assert.deepEqual(parseNote(serializeNote({ model: "m", remaining: null })), { model: "m", remaining: null });
  assert.deepEqual(parseNote('{"model":"m"}'), { model: "m", remaining: null });
  assert.equal(parseNote(null), null);
  assert.equal(parseNote(""), null);
  assert.equal(parseNote("nope"), null);
  assert.equal(parseNote("[]"), null);
  assert.equal(parseNote('{"model":""}'), null);
  assert.equal(parseNote('{"model":"m","remaining":-1}'), null);
  assert.equal(parseNote('{"model":"m","remaining":1.5}'), null);
  assert.equal(parseNote('{"model":"m","remaining":"3"}'), null);
});

test("mailtoHref encodes subject and body", () => {
  assert.equal(
    mailtoHref("hello@sergeserbinenko.com", "Contract role & rates", "Hi Serge,\nLine two?"),
    "mailto:hello@sergeserbinenko.com?subject=Contract%20role%20%26%20rates&body=Hi%20Serge%2C%0ALine%20two%3F",
  );
});

test("draftClipboardText puts the subject line above the body", () => {
  assert.equal(draftClipboardText("Hi", "Body\ntext"), "Subject: Hi\n\nBody\ntext");
});

test("toFailure keeps server codes and maps everything else to network", () => {
  assert.deepEqual(toFailure({ code: "rate_limited", message: "Slow down", retryAfter: 60 }), {
    code: "rate_limited",
    message: "Slow down",
    retryAfter: 60,
  });
  const thrown = Object.assign(new Error("x"), { code: "session_limit" });
  assert.deepEqual(toFailure(thrown), { code: "session_limit", message: "x" });
  assert.deepEqual(toFailure(new TypeError("Failed to fetch")), { code: "network" });
  assert.deepEqual(toFailure({ code: "" }), { code: "network" });
  assert.deepEqual(toFailure("boom"), { code: "network" });
  assert.deepEqual(toFailure(null), { code: "network" });
});
