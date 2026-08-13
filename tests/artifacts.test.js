import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderArtifact, detectKind, renderMarkdown } from "../packages/artifacts/src/index.js";

test("detectKind recognises common types", () => {
  assert.equal(detectKind("notes/hello.md").kind, "markdown");
  assert.equal(detectKind("logo.svg").kind, "image");
  assert.equal(detectKind("photo.png").kind, "image");
  assert.equal(detectKind("data.json").kind, "code");
  assert.equal(detectKind("binary.bin").kind, "binary");
});

test("renderArtifact passes HTML through unchanged", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-art-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "page.html");
  writeFileSync(file, "<!doctype html><p>hello</p>");
  const html = await renderArtifact(file);
  assert.match(html, /hello/);
});

test("renderArtifact wraps markdown in a styled shell", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-md-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "notes.md");
  writeFileSync(file, "# Heading\n\nSome **bold** text.");
  const html = await renderArtifact(file);
  assert.match(html, /<h1 class="md-h">Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("renderArtifact exposes images via data URI", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-img-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Build a tiny valid PNG (1x1 transparent).
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000000000050001005e9272d80000000049454e44ae426082", "hex");
  const file = path.join(root, "tiny.png");
  writeFileSync(file, png);
  const html = await renderArtifact(file);
  assert.match(html, /data:image\/png;base64,/);
});

test("renderMarkdown escapes raw HTML in body", () => {
  const html = renderMarkdown("<script>alert(1)</script>");
  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("&lt;script&gt;"));
});
