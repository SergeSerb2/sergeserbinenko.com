import { test } from "node:test";
import assert from "node:assert/strict";
import { lerp, clampUnit, pointerUnit, localPoint, glareOffset, wordTokens } from "./motion.ts";

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

test("glareOffset returns pixel strings clamped to the rect", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(glareOffset(100, 50, rect), { gx: "0px", gy: "0px" });
  assert.deepEqual(glareOffset(237.4, 112.6, rect), { gx: "137px", gy: "63px" });
  assert.deepEqual(glareOffset(400, 300, rect), { gx: "200px", gy: "100px" });
  assert.deepEqual(glareOffset(0, 0, rect), { gx: "0px", gy: "0px" });
  assert.deepEqual(glareOffset(10, 10, { left: 0, top: 0, width: 0, height: 0 }), { gx: "0px", gy: "0px" });
});

test("localPoint undoes zoom: on-screen offsets map back to layout pixels", () => {
  // A 200x100 element drawn at 1.2x zoom covers 240x120 on screen.
  const rect = { left: 100, top: 50, width: 240, height: 120 };
  assert.deepEqual(localPoint(220, 110, rect, 200, 100), { x: 100, y: 50 });
  assert.deepEqual(glareOffset(340, 170, rect, 200, 100), { gx: "200px", gy: "100px" });
  assert.deepEqual(glareOffset(400, 300, rect, 200, 100), { gx: "200px", gy: "100px" });
  // Without a layout size, it falls back to the on-screen box.
  assert.deepEqual(localPoint(150, 60, rect), { x: 50, y: 10 });
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
