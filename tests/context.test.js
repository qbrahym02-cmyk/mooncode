import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ContextFiles } from "../packages/context/src/index.js";
import { Compactor } from "../packages/context/src/compactor.js";
import { Workspace } from "../packages/tools/src/index.js";

test("context files assemble into a single system-prompt prefix", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-ctx-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("CONVENTIONS.md", "# Conventions\n\nUse 2-space indent.\n");
  const dataRoot = path.join(root, ".mooncode");
  const ctx = new ContextFiles(workspace, dataRoot);
  await ctx.add("CONVENTIONS.md", "coding standards");
  const assembled = await ctx.assemble();
  assert.ok(assembled);
  assert.match(assembled, /Project context/);
  assert.match(assembled, /2-space indent/);
});

test("context files skip missing files and prune the manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-ctx-prune-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("a.md", "alpha\n");
  await workspace.write("b.md", "beta\n");
  const dataRoot = path.join(root, ".mooncode");
  const ctx = new ContextFiles(workspace, dataRoot);
  await ctx.add("a.md");
  await ctx.add("b.md");
  await rm(path.join(root, "a.md"), { force: true });
  const assembled = await ctx.assemble();
  assert.match(assembled, /beta/);
  // After assemble the missing entry should be pruned from the manifest.
  const manifest = await ctx.readManifest();
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].path, "b.md");
});

test("compactor leaves short histories untouched", async () => {
  const compactor = new Compactor({ threshold: 10, keepRecent: 4 });
  const messages = Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const result = await compactor.compact(messages);
  assert.equal(result.compacted, false);
  assert.equal(result.messages.length, 5);
});

test("compactor replaces older messages with a summary", async () => {
  const compactor = new Compactor({ threshold: 4, keepRecent: 2 });
  const messages = [
    { role: "user", content: "first" },
    { role: "assistant", content: "response 1" },
    { role: "user", content: "second" },
    { role: "assistant", content: "response 2" },
    { role: "user", content: "third" },
    { role: "assistant", content: "response 3" },
  ];
  const result = await compactor.compact(messages);
  assert.equal(result.compacted, true);
  assert.equal(result.compactedCount, 4);
  assert.ok(result.messages[0].compacted);
  assert.equal(result.messages.length, 3); // summary + 2 recent
  assert.match(result.messages[0].content, /Compacted history/);
  // The last two messages must be preserved verbatim.
  assert.equal(result.messages[1].content, "third");
  assert.equal(result.messages[2].content, "response 3");
});
