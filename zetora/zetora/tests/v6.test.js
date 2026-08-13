import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SearchIndex } from "../packages/search-index/src/index.js";
import { TodoList } from "../packages/todos/src/index.js";
import { CollabSession, CollabRegistry } from "../packages/collab/src/index.js";
import { PluginRegistry } from "../packages/plugins/src/index.js";

test("search index builds and queries trigrams", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-sidx-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const idx = new SearchIndex(root);
  await writeFile(path.join(root, "a.js"), "function helloWorld() { return 1; }\n");
  await writeFile(path.join(root, "b.js"), "const greeting = 'hello';\n");
  const result = await idx.indexAll(["a.js", "b.js"]);
  assert.equal(result.indexed, 2);
  const hits = idx.search("helloWorld");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].path, "a.js");
});

test("search index ranks by trigram overlap", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-sidx-rank-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const idx = new SearchIndex(root);
  await writeFile(path.join(root, "exact.js"), "function fetchUser() {}\n");
  await writeFile(path.join(root, "partial.js"), "const f = 'fetchUser-ish';\n");
  await idx.indexAll(["exact.js", "partial.js"]);
  const hits = idx.search("fetchUser");
  assert.ok(hits.length >= 1);
});

test("todo list add/update/remove", () => {
  const todos = new TodoList();
  const item = todos.add("Fix bug in parser");
  assert.equal(item.status, "pending");
  todos.update(item.id, { status: "in_progress" });
  assert.equal(todos.get(item.id).status, "in_progress");
  todos.update(item.id, { status: "completed" });
  assert.equal(todos.summary().completed, 1);
  todos.remove(item.id);
  assert.equal(todos.list().length, 0);
});

test("todo list summary computes progress", () => {
  const todos = new TodoList();
  todos.add("task 1");
  const t2 = todos.add("task 2");
  todos.add("task 3");
  todos.update(t2.id, { status: "completed" });
  const summary = todos.summary();
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.progress, 33);
});

test("collab session join/edit/snapshot", () => {
  const session = new CollabSession("s1", { document: "hello\nworld" });
  session.join("alice", { name: "Alice" });
  session.edit("alice", { type: "insert", range: { start: { line: 1, column: 6 } }, text: "!" });
  const snap = session.getSnapshot();
  assert.equal(snap.document, "hello!\nworld");
  assert.equal(snap.peers.length, 1);
});

test("collab registry create/list/close", () => {
  const reg = new CollabRegistry();
  const s1 = reg.create("session-1");
  const s2 = reg.create("session-2");
  assert.equal(reg.list().length, 2);
  reg.close("session-1");
  assert.equal(reg.list().length, 1);
});

test("plugin registry install/list/uninstall", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-plugins-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reg = new PluginRegistry(root);
  const manifest = {
    name: "Test Plugin",
    version: "1.0.0",
    description: "test",
    author: "test",
    capabilities: ["tools"],
    entry: "index.js",
    permissions: { tools: ["read_file"] },
  };
  const installed = await reg.install("test-plugin", manifest, "module.exports = {};");
  // v0.9: legacy self-hash (no cryptographic signer configured).
  assert.ok(installed.signature.startsWith("sha256-legacy:"));
  assert.equal(installed.verified, false, "self-signed plugins are never verified in v0.9+");
  const list = await reg.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "test-plugin");
  assert.equal(list[0].verified, false);
  await reg.uninstall("test-plugin");
  assert.equal((await reg.list()).length, 0);
});
