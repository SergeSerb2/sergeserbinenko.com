import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOriginAllowed,
  isSecFetchSiteOk,
  isValidSessionId,
  looksLikePaste,
  normalizeMessage,
  parseSitePaths,
  PASTE_MESSAGE,
} from "./guard.ts";

test("normalizeMessage trims and collapses whitespace", () => {
  assert.deepEqual(normalizeMessage("  What   is\tT3 Pretty?  "), {
    ok: true,
    message: "What is T3 Pretty?",
  });
  assert.deepEqual(normalizeMessage("line one\r\nline two"), {
    ok: true,
    message: "line one\nline two",
  });
});

test("normalizeMessage strips control characters but keeps Unicode", () => {
  assert.deepEqual(normalizeMessage("Bonjour\u0000 Serge\u0007 — ça va?"), {
    ok: true,
    message: "Bonjour Serge — ça va?",
  });
});

test("normalizeMessage rejects non-strings and empty text", () => {
  assert.equal(normalizeMessage(42).ok, false);
  assert.equal(normalizeMessage(null).ok, false);
  assert.equal(normalizeMessage(undefined).ok, false);
  const empty = normalizeMessage("   ");
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.code, "bad_request");
});

test("normalizeMessage enforces the 280 character limit after normalization", () => {
  assert.equal(normalizeMessage("a".repeat(280)).ok, true);
  const tooLong = normalizeMessage("a".repeat(281));
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.code, "too_long");
  // Extra spaces collapse before counting, so this fits.
  assert.equal(normalizeMessage(`word${" ".repeat(300)}word`).ok, true);
});

test("looksLikePaste catches line floods, fences, and symbol soup", () => {
  assert.equal(looksLikePaste(Array(8).fill("line").join("\n")), true);
  assert.equal(looksLikePaste("run this:\n```\ncode\n```"), true);
  assert.equal(looksLikePaste("!@#$%^&*()_+-={}[]|;:,.<>?/~`!@#$%^&*()"), true);
  assert.equal(looksLikePaste("What did Serge build at PressReader?"), false);
  assert.equal(looksLikePaste("???"), false);
  assert.equal(looksLikePaste("one\ntwo\nthree"), false);
});

test("normalizeMessage rejects pastes with the short-question message", () => {
  const result = normalizeMessage("```js\nconsole.log(1)\n```");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "too_long");
    assert.equal(result.message, PASTE_MESSAGE);
  }
});

test("isValidSessionId accepts only 32 lowercase hex characters", () => {
  assert.equal(isValidSessionId("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isValidSessionId("0123456789ABCDEF0123456789abcdef"), false);
  assert.equal(isValidSessionId("0123456789abcdef"), false);
  assert.equal(isValidSessionId("g123456789abcdef0123456789abcdef"), false);
  assert.equal(isValidSessionId(123), false);
  assert.equal(isValidSessionId(null), false);
});

test("isOriginAllowed accepts production origins and dev localhost only in dev", () => {
  assert.equal(isOriginAllowed("https://sergeserbinenko.com", false), true);
  assert.equal(isOriginAllowed("https://www.sergeserbinenko.com", false), true);
  assert.equal(isOriginAllowed("https://evil.example.com", false), false);
  assert.equal(isOriginAllowed("http://sergeserbinenko.com", false), false);
  assert.equal(isOriginAllowed(null, false), false);
  assert.equal(isOriginAllowed("http://localhost:8787", false), false);
  assert.equal(isOriginAllowed("http://localhost:8787", true), true);
  assert.equal(isOriginAllowed("http://localhost", true), true);
  assert.equal(isOriginAllowed("http://localhost.evil.com", true), false);
  assert.equal(isOriginAllowed("https://localhost:8787", true), false);
});

test("isSecFetchSiteOk rejects cross-site values only when present", () => {
  assert.equal(isSecFetchSiteOk(null), true);
  assert.equal(isSecFetchSiteOk("same-origin"), true);
  assert.equal(isSecFetchSiteOk("cross-site"), false);
  assert.equal(isSecFetchSiteOk("same-site"), false);
});

test("parseSitePaths reads PAGE lines and deduplicates", () => {
  const knowledge = [
    "PAGE / | Home",
    "some other line",
    "PAGE /projects/t3-pretty | T3 Pretty",
    "PAGE / | Home again",
    "PAGE not-a-path | Broken",
    "PAGE /resume | Résumé",
  ].join("\n");
  assert.deepEqual(parseSitePaths(knowledge), ["/", "/projects/t3-pretty", "/resume"]);
  assert.deepEqual(parseSitePaths("no pages here"), []);
});
