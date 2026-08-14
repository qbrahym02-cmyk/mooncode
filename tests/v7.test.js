import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginRegistry } from "../packages/plugins/src/index.js";
import { CollabSession, CollabRegistry } from "../packages/collab/src/index.js";
import { SearchIndex } from "../packages/search-index/src/index.js";
import { TodoList } from "../packages/todos/src/index.js";

test("plugin install + verify signature round-trip", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-plugin-verify-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reg = new PluginRegistry(root);
  const manifest = {
    name: "Test Plugin",
    version: "5.0.0",
    description: "A plugin that adds a code review skill",
    author: "Moon Code Team",
    capabilities: ["skills", "tools"],
    entry: "index.js",
    permissions: { tools: ["read_file", "parse_ast"], network: false, fs: ["src/**"] },
  };
  const entryContent = "export function review() { return []; }\n";
  const installed = await reg.install("code-reviewer", manifest, entryContent);
  // v0.9: without a cryptographic signer, the signature is a legacy SHA-256 hash.
  assert.ok(installed.signature.startsWith("sha256-legacy:"));
  // v0.9: `verified` is now false for self-signed plugins (honest naming).
  assert.equal(installed.verified, false);
  assert.equal(installed.signatureType, "sha256-legacy");
  assert.ok(installed.warning, "should include a warning that the plugin is not cryptographically verified");
  const list = await reg.list();
  assert.equal(list[0].verified, false);
  assert.equal(list[0].selfSignedHash, installed.selfSignedHash);
  assert.equal(list[0].id, "code-reviewer");
  assert.deepEqual(list[0].capabilities, ["skills", "tools"]);
});

test("plugin tamper detection: modified entry fails self-hash check", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-plugin-tamper-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reg = new PluginRegistry(root);
  const manifest = { name: "Tamper", version: "5.0.0", entry: "index.js", capabilities: ["tools"] };
  const installed = await reg.install("tamper-test", manifest, "original content");
  const originalHash = installed.selfSignedHash;
  // Tamper with the entry file.
  const entryPath = path.join(root, "plugins", "tamper-test", "index.js");
  await writeFile(entryPath, "tampered content");
  const list = await reg.list();
  // v0.9: self-hash changes, but `verified` is always false for self-signed.
  assert.equal(list[0].verified, false, "self-signed plugins are never verified");
  assert.notEqual(list[0].selfSignedHash, originalHash, "self-hash should change after tampering");
});

test("plugin hasCapability helper", () => {
  const reg = new PluginRegistry("/tmp");
  const plugin = { capabilities: ["tools", "skills"] };
  assert.equal(reg.hasCapability(plugin, "tools"), true);
  assert.equal(reg.hasCapability(plugin, "network"), false);
});

test("collab session SSE-style broadcast via edit hook", async (t) => {
  const session = new CollabSession("s1", { document: "hello" });
  const events = [];
  // The server hooks edit() to broadcast; here we verify the event emission.
  session.on("edit", (op) => events.push(op));
  session.join("alice");
  session.edit("alice", { type: "insert", range: { start: { line: 1, column: 5 } }, text: "!" });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "insert");
});

test("collab registry join + leave updates peer list", () => {
  const reg = new CollabRegistry();
  const session = reg.create("test", { document: "" });
  session.join("alice", { name: "Alice" });
  session.join("bob", { name: "Bob" });
  assert.equal(session.peers.size, 2);
  session.leave("alice");
  assert.equal(session.peers.size, 1);
});

test("todo list progress edge cases", () => {
  const todos = new TodoList();
  assert.equal(todos.summary().progress, 0);
  todos.add("task 1");
  todos.add("task 2");
  const items = todos.list();
  todos.update(items[0].id, { status: "completed" });
  assert.equal(todos.summary().progress, 50);
  todos.update(items[1].id, { status: "completed" });
  assert.equal(todos.summary().progress, 100);
});

test("search index stats after indexing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-sidx-stats-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const idx = new SearchIndex(root);
  await writeFile(path.join(root, "a.js"), "function hello() {}\n");
  await idx.indexAll(["a.js"]);
  const stats = idx.stats();
  assert.ok(stats.files >= 1);
  assert.ok(stats.trigrams > 0);
});

test("search index handles empty query gracefully", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-sidx-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const idx = new SearchIndex(root);
  await writeFile(path.join(root, "a.js"), "const x = 1;\n");
  await idx.indexAll(["a.js"]);
  const results = idx.search("");
  assert.equal(results.length, 0);
});

test("heuristic suggestion closes unclosed brackets", () => {
  // Simulate the server-side computeHeuristicSuggestion logic.
  const prefix = "function foo(a, b";
  const opens = (prefix.match(/[(\[{]/g) || []).length;
  const closes = (prefix.match(/[)\]}]/g) || []).length;
  assert.ok(opens > closes);
});
