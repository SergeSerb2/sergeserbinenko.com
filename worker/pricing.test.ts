import { test } from "node:test";
import assert from "node:assert/strict";
import { costMicroUsd, estimateTokens, resolveModel, worstCaseMicroUsd } from "./pricing.ts";

test("resolveModel accepts only the two allowed models", () => {
  assert.equal(resolveModel("claude-haiku-5-5"), "claude-haiku-5-5");
  assert.equal(resolveModel("claude-sonnet-5-5"), "claude-sonnet-5-5");
  assert.equal(resolveModel("gpt-4"), "claude-haiku-5-5");
  assert.equal(resolveModel(undefined), "claude-haiku-5-5");
  assert.equal(resolveModel(""), "claude-haiku-5-5");
});

test("costMicroUsd prices Haiku input and output tokens", () => {
  // 1,000,000 input at $0.10/M = $0.10 = 100,000 micro.
  // 1,000,000 output at $0.50/M = $0.50 = 500,000 micro.
  assert.equal(costMicroUsd("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 100_000);
  assert.equal(costMicroUsd("claude-haiku-5-5", { input_tokens: 0, output_tokens: 1_000_000 }), 500_000);
  assert.equal(costMicroUsd("claude-haiku-5-5", { input_tokens: 1000, output_tokens: 100 }), 150);
});

test("costMicroUsd prices Sonnet and cache tokens", () => {
  assert.equal(costMicroUsd("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 100 }), 3000);
  // Cache write: 1000 * 0.10 * 1.25 = 125 micro. Cache read: 1000 * 0.10 * 0.1 = 10 micro.
  assert.equal(
    costMicroUsd("claude-haiku-5-5", { cache_creation_input_tokens: 1000, output_tokens: 0 }),
    125,
  );
  assert.equal(
    costMicroUsd("claude-haiku-5-5", { cache_read_input_tokens: 1000, output_tokens: 0 }),
    10,
  );
});

test("costMicroUsd treats null usage as zero and rounds up", () => {
  assert.equal(costMicroUsd("claude-haiku-5-5", {}), 0);
  assert.equal(
    costMicroUsd("claude-haiku-5-5", { input_tokens: null, output_tokens: null }),
    0,
  );
  // 1 input token at $0.10/M = 0.1 micro, rounded up to 1.
  assert.equal(costMicroUsd("claude-haiku-5-5", { input_tokens: 1, output_tokens: 0 }), 1);
});

test("worstCaseMicroUsd bills all input at the cache-write price", () => {
  // Haiku: 10,000 input * 0.125 + 450 output * 0.5 = 1250 + 225 = 1475 micro.
  assert.equal(worstCaseMicroUsd("claude-haiku-5-5", 10_000, 450), 1475);
  // Sonnet: 10,000 input * 2.5 + 450 output * 10 = 25,000 + 4,500 = 29,500 micro.
  assert.equal(worstCaseMicroUsd("claude-sonnet-5-5", 10_000, 450), 29_500);
  assert.equal(worstCaseMicroUsd("claude-haiku-5-5", -5, -5), 0);
});

test("estimateTokens is a rough chars-per-token estimate", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 2);
  assert.equal(estimateTokens("a".repeat(3500)), 1000);
});
