import { test } from "node:test";
import assert from "node:assert/strict";
import {
  particleCount,
  cappedDpr,
  depthFor,
  swayX,
  twinkle,
  parallaxOffset,
  wrap,
  tintToward,
} from "./ambient.ts";

test("particleCount scales with area and caps at 70", () => {
  assert.equal(particleCount(1440, 900), 45);
  assert.equal(particleCount(390, 844), 12);
  assert.equal(particleCount(4000, 3000), 70);
  assert.equal(particleCount(0, 900), 0);
  assert.equal(particleCount(Number.NaN, 900), 0);
});

test("cappedDpr caps at 1.5 and falls back to 1", () => {
  assert.equal(cappedDpr(2), 1.5);
  assert.equal(cappedDpr(1.25), 1.25);
  assert.equal(cappedDpr(0), 1);
  assert.equal(cappedDpr(Number.NaN), 1);
});

test("depthFor puts bokeh deeper than motes", () => {
  assert.equal(depthFor(false, 0), 4);
  assert.equal(depthFor(false, 1), 14);
  assert.equal(depthFor(true, 0), 14);
  assert.equal(depthFor(true, 1), 24);
});

test("swayX oscillates within the amplitude", () => {
  assert.ok(Math.abs(swayX(0, 12, 8, 0)) < 1e-9);
  assert.ok(Math.abs(swayX(2, 12, 8, 0) - 12) < 1e-9);
  assert.ok(Math.abs(swayX(4, 12, 8, 0)) < 1e-9);
  assert.equal(swayX(1, 12, 0, 0), 0);
});

test("twinkle stays in [0.35, 1]", () => {
  for (let t = 0; t < 20; t += 0.37) {
    const v = twinkle(t, 5, 1.2);
    assert.ok(v >= 0.35 && v <= 1, `twinkle ${v} out of range at t=${t}`);
  }
});

test("parallaxOffset clamps the unit value and negates it", () => {
  assert.equal(parallaxOffset(1, 10), -10);
  assert.equal(parallaxOffset(-0.5, 10), 5);
  assert.equal(parallaxOffset(3, 10), -10);
});

test("wrap handles overflow and negative values", () => {
  assert.equal(wrap(105, 100), 5);
  assert.equal(wrap(-5, 100), 95);
  assert.equal(wrap(50, 0), 0);
});

test("tintToward mixes white toward the accent", () => {
  assert.deepEqual(tintToward(0, 0, 0, 0.25), [191, 191, 191]);
  assert.deepEqual(tintToward(255, 255, 255, 0.25), [255, 255, 255]);
  assert.deepEqual(tintToward(100, 150, 200, 0), [255, 255, 255]);
});
