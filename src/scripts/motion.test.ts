import { test } from "node:test";
import assert from "node:assert/strict";
import { lerp, clampUnit, pointerUnit, glarePercent, wordTokens } from "./motion.ts";

test("lerp moves a fraction toward the target", () => {
  assert.equal(lerp(0, 100, 0.18), 18);
  assert.equal(lerp(50, 50, 0.06), 50);
});

test("clampUnit clamps to [-1, 1] and rejects bad input", () => {
  assert.equal(clampUnit(2), 1);
  assert.equal(clampUnit(-2), -1);
  assert.equal(clampUnit(0.25), 0.25);
  assert.equal(clampUnit(Number.NaN), 0);
});

test("pointerUnit maps the viewport center to 0 and corners to +/-1", () => {
  assert.deepEqual(pointerUnit(720, 450, 1440, 900), { x: 0, y: 0 });
  assert.deepEqual(pointerUnit(0, 0, 1440, 900), { x: -1, y: -1 });
  assert.deepEqual(pointerUnit(1440, 900, 1440, 900), { x: 1, y: 1 });
  assert.deepEqual(pointerUnit(10, 10, 0, 0), { x: 0, y: 0 });
});

test("glarePercent returns clamped percent strings", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(glarePercent(100, 50, rect), { gx: "0%", gy: "0%" });
  assert.deepEqual(glarePercent(200, 100, rect), { gx: "50%", gy: "50%" });
  assert.deepEqual(glarePercent(400, 300, rect), { gx: "100%", gy: "100%" });
});

test("wordTokens keeps whitespace separate from words", () => {
  assert.deepEqual(wordTokens("Hi, I’m Serge."), [
    { word: true, text: "Hi," },
    { word: false, text: " " },
    { word: true, text: "I’m" },
    { word: false, text: " " },
    { word: true, text: "Serge." },
  ]);
  assert.deepEqual(wordTokens(""), []);
});
