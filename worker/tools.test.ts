import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTools, hasOnlyAllowedLinks, validateToolAction } from "./tools.ts";

const PATHS = ["/", "/projects", "/projects/t3-pretty", "/resume", "/contact"];

test("buildTools defines three strict tools with the path enum", () => {
  const tools = buildTools(PATHS);
  assert.equal(tools.length, 3);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["open_page", "show_scenery", "draft_email"],
  );
  for (const tool of tools) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.type, "object");
    assert.equal(tool.input_schema.additionalProperties, false);
  }
  const openPage = tools[0];
  assert.deepEqual(openPage?.input_schema.required, ["path"]);
  const properties = openPage?.input_schema.properties as { path: { enum: string[] } };
  assert.deepEqual(properties.path.enum, PATHS);
  const email = tools[2];
  assert.deepEqual(email?.input_schema.required, ["subject", "body"]);
});

test("buildTools falls back to the home path when no paths are known", () => {
  const tools = buildTools([]);
  const properties = tools[0]?.input_schema.properties as { path: { enum: string[] } };
  assert.deepEqual(properties.path.enum, ["/"]);
});

test("validateToolAction accepts allowed pages and drops unknown ones", () => {
  assert.deepEqual(validateToolAction("open_page", { path: "/projects/t3-pretty" }, PATHS), {
    type: "open_page",
    path: "/projects/t3-pretty",
  });
  assert.equal(validateToolAction("open_page", { path: "/admin" }, PATHS), null);
  assert.equal(validateToolAction("open_page", { path: "https://evil.example.com" }, PATHS), null);
  assert.equal(validateToolAction("open_page", { path: 42 }, PATHS), null);
  assert.equal(validateToolAction("open_page", null, PATHS), null);
});

test("validateToolAction accepts show_scenery with any input", () => {
  assert.deepEqual(validateToolAction("show_scenery", {}, PATHS), { type: "show_scenery" });
  assert.deepEqual(validateToolAction("show_scenery", null, PATHS), { type: "show_scenery" });
});

test("validateToolAction checks email lengths and links", () => {
  assert.deepEqual(
    validateToolAction("draft_email", { subject: "Hello", body: "Loved T3 Pretty!" }, PATHS),
    { type: "draft_email", subject: "Hello", body: "Loved T3 Pretty!" },
  );
  assert.equal(
    validateToolAction("draft_email", { subject: "s".repeat(81), body: "hi" }, PATHS),
    null,
  );
  assert.equal(
    validateToolAction("draft_email", { subject: "hi", body: "b".repeat(601) }, PATHS),
    null,
  );
  assert.equal(validateToolAction("draft_email", { subject: "  ", body: "hi" }, PATHS), null);
  assert.equal(
    validateToolAction(
      "draft_email",
      { subject: "hi", body: "see https://evil.example.com/x" },
      PATHS,
    ),
    null,
  );
  assert.deepEqual(
    validateToolAction(
      "draft_email",
      { subject: "hi", body: "see https://sergeserbinenko.com/resume" },
      PATHS,
    ),
    { type: "draft_email", subject: "hi", body: "see https://sergeserbinenko.com/resume" },
  );
});

test("validateToolAction drops unknown tools", () => {
  assert.equal(validateToolAction("run_code", { code: "x" }, PATHS), null);
  assert.equal(validateToolAction("", {}, PATHS), null);
});

test("hasOnlyAllowedLinks allows site links and plain text only", () => {
  assert.equal(hasOnlyAllowedLinks("No links here."), true);
  assert.equal(hasOnlyAllowedLinks("Visit sergeserbinenko.com today"), true);
  assert.equal(hasOnlyAllowedLinks("https://www.sergeserbinenko.com/projects"), true);
  assert.equal(hasOnlyAllowedLinks("www.sergeserbinenko.com"), true);
  assert.equal(hasOnlyAllowedLinks("http://sergeserbinenko.com.evil.com/"), false);
  assert.equal(hasOnlyAllowedLinks("https://github.com/SergeSerb2"), false);
  assert.equal(hasOnlyAllowedLinks("go to evil.example.com now"), false);
  assert.equal(hasOnlyAllowedLinks("Reply to me at visitor@gmail.com"), true);
  assert.equal(hasOnlyAllowedLinks("Email hello@sergeserbinenko.com"), true);
});
