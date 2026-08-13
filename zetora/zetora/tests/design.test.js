import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DesignTokens } from "../packages/design/src/index.js";

test("design tokens read returns null when no file exists", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-design-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tokens = new DesignTokens(root);
  assert.equal(await tokens.read(), null);
});

test("design tokens write then read round-trips", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-design-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tokens = new DesignTokens(root);
  const payload = {
    colors: { primary: "#8b7cff", bg: "#0b0c10" },
    typography: { heading: { family: "Inter", size: "24px", weight: 700 } },
    spacing: { sm: "8px", md: "16px", lg: "24px" },
    radii: { card: "12px" },
    shadows: { card: "0 12px 36px rgba(0,0,0,.4)" },
  };
  await tokens.write(payload);
  const stored = await tokens.read();
  assert.deepEqual(stored, payload);
});

test("toCss emits a root block with all token groups", () => {
  const tokens = new DesignTokens("/tmp");
  const css = tokens.toCss({
    colors: { primary: "#8b7cff" },
    typography: { body: { family: "Inter", size: "14px", weight: 400 } },
    spacing: { md: "16px" },
    radii: { card: "12px" },
    shadows: { card: "0 12px 36px" },
  });
  assert.match(css, /--color-primary: #8b7cff/);
  assert.match(css, /--font-body-family: Inter/);
  assert.match(css, /--space-md: 16px/);
  assert.match(css, /--radius-card: 12px/);
  assert.match(css, /--shadow-card: 0 12px 36px/);
});

test("toReferenceHtml includes every token group", () => {
  const tokens = new DesignTokens("/tmp");
  const html = tokens.toReferenceHtml({
    colors: { primary: "#8b7cff" },
    typography: { body: { family: "Inter", size: "14px", weight: 400 } },
    spacing: { md: "16px" },
  });
  assert.match(html, /<title>Design tokens<\/title>/);
  assert.match(html, /--color-primary: #8b7cff/);
  assert.match(html, /Design tokens/);
});

test("toPromptSummary emits compact text for the system prompt", () => {
  const tokens = new DesignTokens("/tmp");
  const summary = tokens.toPromptSummary({
    colors: { primary: "#8b7cff" },
    spacing: { md: "16px" },
  });
  assert.match(summary, /Colors: primary=#8b7cff/);
  assert.match(summary, /Spacing: md=16px/);
});
