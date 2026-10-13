import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMode, resolveDaylight, resolveTone, sceneFor } from "./daylight.ts";

test("parseMode accepts known modes and defaults to auto", () => {
  assert.equal(parseMode("auto"), "auto");
  assert.equal(parseMode("day"), "day");
  assert.equal(parseMode("night"), "night");
  assert.equal(parseMode("off"), "off");
  assert.equal(parseMode("bogus"), "auto");
  assert.equal(parseMode(""), "auto");
  assert.equal(parseMode(null), "auto");
  assert.equal(parseMode(undefined), "auto");
  assert.equal(parseMode(42), "auto");
  assert.equal(parseMode("DAY"), "auto");
});

test("resolveDaylight auto boundaries 5/6/18/19", () => {
  assert.equal(resolveDaylight("auto", 5), "night");
  assert.equal(resolveDaylight("auto", 6), "day");
  assert.equal(resolveDaylight("auto", 18), "day");
  assert.equal(resolveDaylight("auto", 19), "night");
  assert.equal(resolveDaylight("auto", 0), "night");
  assert.equal(resolveDaylight("auto", 12), "day");
  assert.equal(resolveDaylight("auto", 23), "night");
});

test("resolveDaylight off follows auto clock", () => {
  assert.equal(resolveDaylight("off", 5), "night");
  assert.equal(resolveDaylight("off", 6), "day");
  assert.equal(resolveDaylight("off", 18), "day");
  assert.equal(resolveDaylight("off", 19), "night");
});

test("resolveDaylight fixed modes ignore hour", () => {
  for (const h of [0, 5, 6, 12, 18, 19, 23]) {
    assert.equal(resolveDaylight("day", h), "day");
    assert.equal(resolveDaylight("night", h), "night");
  }
});

test("resolveTone matrix", () => {
  assert.equal(resolveTone("auto", "night", false), "dark");
  assert.equal(resolveTone("auto", "night", true), "dark");
  assert.equal(resolveTone("auto", "day", false), "light");
  assert.equal(resolveTone("auto", "day", true), "dark");
  assert.equal(resolveTone("day", "day", false), "light");
  assert.equal(resolveTone("day", "day", true), "dark");
  assert.equal(resolveTone("night", "night", false), "dark");
  assert.equal(resolveTone("night", "night", true), "dark");
  assert.equal(resolveTone("off", "night", false), "light");
  assert.equal(resolveTone("off", "night", true), "dark");
  assert.equal(resolveTone("off", "day", false), "light");
  assert.equal(resolveTone("off", "day", true), "dark");
});

test("sceneFor picks night variant only at night when present", () => {
  assert.equal(sceneFor("tofino", "night", "jasper-sky"), "jasper-sky");
  assert.equal(sceneFor("tofino", "day", "jasper-sky"), "tofino");
  assert.equal(sceneFor("kyoto", "night", undefined), "kyoto");
  assert.equal(sceneFor("kyoto", "day", undefined), "kyoto");
  assert.equal(sceneFor("kyoto", "night", ""), "kyoto");
});
