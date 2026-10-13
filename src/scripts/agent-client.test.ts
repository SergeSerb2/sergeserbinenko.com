import { test } from "node:test";
import assert from "node:assert/strict";
import { createSseParser, parseSseBlock, send, type SseEvent } from "./agent-client.ts";

function collect(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = createSseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return events;
}

test("parser reads complete events in one chunk", () => {
  const events = collect([
    'event: text\ndata: {"delta":"Hi"}\n\nevent: done\ndata: {"remaining":9,"stop":"end_turn"}\n\n',
  ]);
  assert.deepEqual(events, [
    { type: "text", data: { delta: "Hi" } },
    { type: "done", data: { remaining: 9, stop: "end_turn" } },
  ]);
});

test("parser handles events split across chunk boundaries", () => {
  const wire = 'event: text\ndata: {"delta":"Hello world"}\n\n';
  const events = collect([wire.slice(0, 7), wire.slice(7, 20), wire.slice(20, 31), wire.slice(31)]);
  assert.deepEqual(events, [{ type: "text", data: { delta: "Hello world" } }]);
});

test("parser handles one character at a time", () => {
  const wire = 'event: action\ndata: {"type":"open_page","path":"/resume"}\n\n';
  const events = collect(wire.split(""));
  assert.deepEqual(events, [{ type: "action", data: { type: "open_page", path: "/resume" } }]);
});

test("parser accepts CRLF line endings, even split across chunks", () => {
  const events = collect(['event: text\r\ndata: {"delta":"a"}\r\n\r\n']);
  assert.deepEqual(events, [{ type: "text", data: { delta: "a" } }]);

  const split = collect(['event: text\r', '\ndata: {"delta":"b"}\r', "\n\r", "\n"]);
  assert.deepEqual(split, [{ type: "text", data: { delta: "b" } }]);
});

test("parser joins multi-line data and skips comments", () => {
  const events = collect([': heartbeat\nevent: text\ndata: {"delta":\ndata: "joined"}\n\n']);
  assert.deepEqual(events, [{ type: "text", data: { delta: "joined" } }]);
});

test("parser passes unknown events and non-JSON data through", () => {
  const events = collect(["event: custom\ndata: plain text\n\n"]);
  assert.deepEqual(events, [{ type: "custom", data: "plain text" }]);
});

test("parser flushes a trailing event without a blank line on end()", () => {
  const events = collect(['event: done\ndata: {"remaining":0,"stop":"max_tokens"}']);
  assert.deepEqual(events, [{ type: "done", data: { remaining: 0, stop: "max_tokens" } }]);
});

test("parseSseBlock returns null for data-less blocks", () => {
  assert.equal(parseSseBlock(": only a comment"), null);
  assert.equal(parseSseBlock(""), null);
  assert.deepEqual(parseSseBlock('data: {"a":1}'), { type: "message", data: { a: 1 } });
});

test("send streams parsed events from a chunked response", async () => {
  const wire = 'event: text\ndata: {"delta":"Yo"}\n\nevent: done\ndata: {"remaining":8,"stop":"end_turn"}\n\n';
  const bytes = new TextEncoder().encode(wire);
  const fetchFn = async (): Promise<Response> =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 10));
          controller.enqueue(bytes.slice(10));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  const events: SseEvent[] = [];
  await send("a".repeat(32), "hi", (event) => events.push(event), { fetchFn });
  assert.deepEqual(events, [
    { type: "text", data: { delta: "Yo" } },
    { type: "done", data: { remaining: 8, stop: "end_turn" } },
  ]);
});

test("send reports HTTP errors as an error event", async () => {
  const fetchFn = async (): Promise<Response> =>
    new Response(
      JSON.stringify({ error: { code: "rate_limited", message: "Slow down.", retryAfter: 60 } }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  const events: SseEvent[] = [];
  await send("a".repeat(32), "hi", (event) => events.push(event), { fetchFn });
  assert.deepEqual(events, [
    { type: "error", data: { code: "rate_limited", message: "Slow down.", retryAfter: 60 } },
  ]);
});
