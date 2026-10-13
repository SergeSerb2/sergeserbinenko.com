import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  REPLY_TOKEN_ALLOWANCE,
  estimateTokens,
  reservationTokens,
  resolveModel,
  turnTokens,
  usageTokens,
} from "./budget.ts";

test("resolveModel accepts only the allowed models", () => {
  assert.deepEqual([...ALLOWED_MODELS], ["gpt-6-luna", "gpt-5.6-luna"]);
  assert.equal(DEFAULT_MODEL, "gpt-6-luna");
  assert.equal(resolveModel("gpt-6-luna"), "gpt-6-luna");
  assert.equal(resolveModel("gpt-5.6-luna"), "gpt-5.6-luna");
  assert.equal(resolveModel("gpt-4"), "gpt-6-luna");
  assert.equal(resolveModel(undefined), "gpt-6-luna");
  assert.equal(resolveModel(""), "gpt-6-luna");
});

test("estimateTokens is a rough chars-per-token estimate", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 2);
  assert.equal(estimateTokens("a".repeat(3500)), 1000);
});

test("reservationTokens adds the reply allowance to a non-negative input estimate", () => {
  assert.equal(REPLY_TOKEN_ALLOWANCE, 700);
  assert.equal(reservationTokens(1000), 1700);
  assert.equal(reservationTokens(0), 700);
  assert.equal(reservationTokens(-5), 700);
  assert.equal(reservationTokens(Number.NaN), 700);
  assert.equal(reservationTokens(10.9), 710);
});

test("usageTokens sums prompt and completion tokens defensively", () => {
  assert.equal(usageTokens({ prompt_tokens: 91, completion_tokens: 19 }), 110);
  assert.equal(usageTokens(null), 0);
  assert.equal(usageTokens(undefined), 0);
  assert.equal(usageTokens({}), 0);
  assert.equal(usageTokens({ prompt_tokens: null, completion_tokens: null }), 0);
  assert.equal(usageTokens({ prompt_tokens: -3, completion_tokens: Number.NaN }), 0);
});

test("turnTokens charges real usage, else the reservation after any stream output", () => {
  assert.equal(turnTokens({ prompt_tokens: 4000, completion_tokens: 20 }, true, 6000), 4020);
  // Zero or missing usage after a tool-only or refusal-only reply.
  assert.equal(turnTokens({ prompt_tokens: 0, completion_tokens: 0 }, true, 6000), 6000);
  assert.equal(turnTokens(null, true, 6000), 6000);
  // Clean failure before any stream event.
  assert.equal(turnTokens(null, false, 6000), 0);
});
