import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSseBytes, encodeSseEvent } from "./sse.ts";

test("encodeSseEvent writes event and single-line JSON data", () => {
  assert.equal(encodeSseEvent("text", { delta: "Hi" }), 'event: text\ndata: {"delta":"Hi"}\n\n');
  assert.equal(
    encodeSseEvent("done", { remaining: 7, stop: "end_turn" }),
    'event: done\ndata: {"remaining":7,"stop":"end_turn"}\n\n',
  );
  assert.equal(
    encodeSseEvent("action", { type: "open_page", path: "/projects/t3-pretty" }),
    'event: action\ndata: {"type":"open_page","path":"/projects/t3-pretty"}\n\n',
  );
});

test("encodeSseEvent escapes newlines inside text deltas", () => {
  const encoded = encodeSseEvent("text", { delta: "one\ntwo" });
  assert.equal(encoded, 'event: text\ndata: {"delta":"one\\ntwo"}\n\n');
  // Exactly one blank-line terminator: the delta cannot split the event.
  assert.equal(encoded.split("\n\n").length, 2);
});

test("encodeSseBytes returns UTF-8 bytes", () => {
  const bytes = encodeSseBytes("error", { code: "resting", message: "Résumé later" });
  assert.equal(
    new TextDecoder().decode(bytes),
    'event: error\ndata: {"code":"resting","message":"Résumé later"}\n\n',
  );
});
