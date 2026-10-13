import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeLuminance, isDarkColor, glassForColor, backdropWidth } from "./scene.ts";

test("relativeLuminance is 0 for black and 1 for white", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.ok(Math.abs(relativeLuminance("#ffffff") - 1) < 1e-9);
});

test("isDarkColor matches the mockup's dark scenes", () => {
  assert.equal(isDarkColor("#0c2626"), true); // Seoul
  assert.equal(isDarkColor("#262626"), true); // Hong Kong
  assert.equal(isDarkColor("#0c2659"), true); // Jasper night
  assert.equal(isDarkColor("#f3f3f3"), false); // Faroe
  assert.equal(isDarkColor("#738c8c"), false); // Tofino
});

test("glassForColor raises opacity as scenes get darker", () => {
  assert.deepEqual(glassForColor("#0c2626"), { glass: ".76", side: ".32" }); // Seoul
  assert.deepEqual(glassForColor("#738c8c"), { glass: ".64", side: ".28" }); // Tofino
  assert.deepEqual(glassForColor("#f3f3f3"), { glass: ".56", side: ".26" }); // Faroe
});

test("backdropWidth picks the smallest bucket that covers the viewport", () => {
  assert.equal(backdropWidth(390, 2), 1200);
  assert.equal(backdropWidth(1024, 1), 1200);
  assert.equal(backdropWidth(1440, 1), 1600);
  assert.equal(backdropWidth(1440, 2), 3200);
  assert.equal(backdropWidth(2560, 2), 3200);
  assert.equal(backdropWidth(0, 2), 2400);
  assert.equal(backdropWidth(Number.NaN, 1), 2400);
  assert.equal(backdropWidth(800, Number.NaN), 1200);
});
