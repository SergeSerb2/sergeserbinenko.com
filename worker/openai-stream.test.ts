import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChatStreamAccumulator,
  MAX_REPLY_CHARS,
  MAX_TOOL_ARGS_CHARS,
  SseDataParser,
  truncateReplyDelta,
} from "./openai-stream.ts";

function chunk(content: string | null, extra: Record<string, unknown> = {}): unknown {
  return {
    id: "resp_1",
    object: "chat.completion.chunk",
    model: "gpt-6-luna",
    choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
    ...extra,
  };
}

test("parser handles splits at arbitrary points, including mid-line", () => {
  const payload = JSON.stringify(chunk("Hi"));
  const raw = `data: ${payload}\n\n`;
  const parser = new SseDataParser();
  const out: unknown[] = [];
  for (const piece of [raw.slice(0, 3), raw.slice(3, 17), raw.slice(17)]) {
    out.push(...parser.feed(piece));
  }
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], JSON.parse(payload));
});

test("parser handles CRLF line endings and a split between CR and LF", () => {
  const parser = new SseDataParser();
  assert.deepEqual(parser.feed('data: {"a":1}\r'), []);
  assert.deepEqual(parser.feed("\n\r\n"), [{ a: 1 }]);
});

test("parser recognizes [DONE] and ignores comments and other fields", () => {
  const parser = new SseDataParser();
  const out = parser.feed(": keep-alive\nevent: x\nid: 1\ndata: {\"a\":1}\n\ndata: [DONE]\n\n");
  assert.deepEqual(out, [{ a: 1 }]);
  assert.equal(parser.done, true);
});

test("parser skips unparsable JSON and joins multi-line data", () => {
  const parser = new SseDataParser();
  const out = parser.feed('data: {nope\n\ndata: {"a":\ndata: 1}\n\n');
  assert.deepEqual(out, [{ a: 1 }]);
});

test("parser flush dispatches a trailing event without a blank line", () => {
  const parser = new SseDataParser();
  assert.deepEqual(parser.feed('data: {"a":2}'), []);
  assert.deepEqual(parser.flush(), [{ a: 2 }]);
});

test("accumulator concatenates text deltas and reports each delta", () => {
  const acc = new ChatStreamAccumulator();
  assert.equal(acc.apply(chunk("Hel")).textDelta, "Hel");
  assert.equal(acc.apply(chunk("lo")).textDelta, "lo");
  assert.equal(acc.apply(chunk(null)).textDelta, "");
  assert.equal(acc.text, "Hello");
});

test("accumulator assembles tool call argument fragments across chunks", () => {
  const acc = new ChatStreamAccumulator();
  acc.apply({
    choices: [{
      index: 0, finish_reason: null,
      delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "open_page", arguments: "" } }] },
    }],
  });
  acc.apply({
    choices: [{
      index: 0, finish_reason: null,
      delta: { tool_calls: [{ index: 0, function: { arguments: '{"pa' } }] },
    }],
  });
  acc.apply({
    choices: [{
      index: 0, finish_reason: "tool_calls",
      delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"/resume"}' } }] },
    }],
  });
  const call = acc.firstValidToolCall();
  assert.equal(call?.id, "call_1");
  assert.equal(call?.name, "open_page");
  assert.equal(call?.arguments, '{"path":"/resume"}');
  assert.equal(acc.finishReason, "tool_calls");
});

test("accumulator keeps multiple tool indices apart and picks the first valid", () => {
  const acc = new ChatStreamAccumulator();
  acc.apply({
    choices: [{
      index: 0, finish_reason: null,
      delta: {
        tool_calls: [
          { index: 1, function: { name: "show_scenery", arguments: "{}" } },
          { index: 0, function: { name: "open_page", arguments: "{}" } },
        ],
      },
    }],
  });
  assert.deepEqual(acc.sortedToolCalls().map((c) => c.index), [0, 1]);
  assert.equal(acc.firstValidToolCall()?.name, "open_page");
});

test("accumulator marks tool arguments over the cap invalid and stops appending", () => {
  const acc = new ChatStreamAccumulator();
  acc.apply({
    choices: [{
      index: 0, finish_reason: null,
      delta: { tool_calls: [{ index: 0, function: { name: "draft_email", arguments: "x".repeat(MAX_TOOL_ARGS_CHARS) } }] },
    }],
  });
  acc.apply({
    choices: [{
      index: 0, finish_reason: null,
      delta: { tool_calls: [{ index: 0, function: { arguments: "y" } }] },
    }],
  });
  const call = acc.toolCalls.get(0);
  assert.equal(call?.invalid, true);
  assert.equal(call?.arguments.length, MAX_TOOL_ARGS_CHARS);
  assert.equal(acc.firstValidToolCall(), null);
});

test("accumulator reads usage from a final chunk with no choices", () => {
  const acc = new ChatStreamAccumulator();
  acc.apply(chunk("Hi"));
  acc.apply({
    choices: [],
    usage: {
      prompt_tokens: 91,
      completion_tokens: 19,
      total_tokens: 110,
      prompt_tokens_details: { cached_tokens: 12 },
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  });
  assert.deepEqual(acc.usage, { prompt_tokens: 91, completion_tokens: 19, cached_tokens: 12 });
});

test("accumulator tracks refusal text and content_filter finish reason", () => {
  const acc = new ChatStreamAccumulator();
  const applied = acc.apply({
    choices: [{ index: 0, delta: { refusal: "No." }, finish_reason: "content_filter" }],
  });
  assert.equal(applied.refusalDelta, "No.");
  assert.equal(acc.refusal, "No.");
  assert.equal(acc.finishReason, "content_filter");
});

test("accumulator marks a top-level error event as failed and ignores later chunks", () => {
  const acc = new ChatStreamAccumulator();
  acc.apply(chunk("Serge is"));
  assert.equal(acc.failed, false);
  const applied = acc.apply({ error: { message: "upstream stream closed", type: "server_error" } });
  assert.equal(applied.textDelta, "");
  assert.equal(acc.failed, true);
  acc.apply(chunk(" more text"));
  assert.equal(acc.text, "Serge is");
  assert.equal(new ChatStreamAccumulator().apply({ error: null }).textDelta, "");
});

test("accumulator never throws on odd shapes", () => {
  const acc = new ChatStreamAccumulator();
  for (const junk of [null, 42, "x", [], {}, { choices: "no" }, { choices: [null, { delta: 3 }] }, { usage: "x" }]) {
    assert.doesNotThrow(() => acc.apply(junk));
  }
  assert.equal(acc.text, "");
  assert.equal(acc.usage, null);
});

test("truncateReplyDelta passes deltas that fit", () => {
  assert.deepEqual(truncateReplyDelta(0, "hello"), { emit: "hello", capped: false });
  assert.deepEqual(truncateReplyDelta(MAX_REPLY_CHARS - 5, "12345"), { emit: "12345", capped: false });
});

test("truncateReplyDelta caps, trims to the last whitespace, and adds an ellipsis", () => {
  const result = truncateReplyDelta(0, "word ".repeat(300));
  assert.equal(result.capped, true);
  assert.ok(result.emit.endsWith("…"));
  assert.ok(result.emit.length <= MAX_REPLY_CHARS);
  assert.ok(!result.emit.slice(0, -1).endsWith(" "));
});

test("truncateReplyDelta caps text without whitespace inside the cap", () => {
  const result = truncateReplyDelta(0, "x".repeat(2000));
  assert.equal(result.capped, true);
  assert.equal(result.emit, `${"x".repeat(MAX_REPLY_CHARS - 1)}…`);
  assert.deepEqual(truncateReplyDelta(MAX_REPLY_CHARS, "more"), { emit: "", capped: true });
});
