import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimeInZone, formatterFor } from "./time.ts";

test("formatTimeInZone gives numeric hour, 2-digit minute, lowercase am/pm", () => {
  // 2026-10-12T04:21:00Z is 2026-10-11 21:21 in America/Vancouver (PDT, UTC-7).
  const date = new Date("2026-10-12T04:21:00Z");
  assert.equal(formatTimeInZone(date, "America/Vancouver"), "9:21 pm");
  assert.equal(formatTimeInZone(date, "UTC"), "4:21 am");
  assert.equal(formatTimeInZone(date, "Asia/Tokyo"), "1:21 pm");
});

test("formatterFor reuses one formatter per time zone", () => {
  assert.equal(formatterFor("Europe/Oslo"), formatterFor("Europe/Oslo"));
  assert.notEqual(formatterFor("Europe/Oslo"), formatterFor("Asia/Seoul"));
});

test("formatTimeInZone throws on an unknown time zone", () => {
  assert.throws(() => formatTimeInZone(new Date(), "Nowhere/Special"), RangeError);
});
