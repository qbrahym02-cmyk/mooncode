import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Git } from "../packages/git/src/index.js";
import { diagnoseError } from "../packages/autofix/src/index.js";
import { CollabSession, CollabRegistry } from "../packages/collab/src/index.js";

// === Fix #1: Git undo is soft by default + backup branch ===
test("git undo defaults to soft (keeps changes staged)", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-undo-safe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = new Git(root);
  await git.init();
  writeFileSync(path.join(root, "a.txt"), "v1\n");
  await git.checkpoint("first");
  writeFileSync(path.join(root, "a.txt"), "v2\n");
  await git.checkpoint("second");
  const undo = await git.undo(); // no options = soft
  assert.equal(undo.soft, true, "undo should be soft by default");
  assert.ok(undo.backup, "a backup branch should be created");
  // After soft undo, the changes from the last commit should be staged.
  const status = await git.status();
  assert.ok(status.files.some((f) => f.path === "a.txt"), "a.txt should still be tracked");
});

test("git undo hard requires explicit confirm", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-undo-hard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = new Git(root);
  await git.init();
  writeFileSync(path.join(root, "a.txt"), "v1\n");
  await git.checkpoint("first");
  writeFileSync(path.join(root, "a.txt"), "v2\n");
  await git.checkpoint("second");
  // Hard without confirm should fall back to soft.
  const undo1 = await git.undo({ hard: true });
  assert.equal(undo1.soft, true, "hard without confirm should fall back to soft");
  // Recreate the checkpoint for the next undo.
  await git.checkpoint("second-again");
  // Hard with confirm should work.
  const undo2 = await git.undo({ hard: true, confirm: true });
  assert.equal(undo2.soft, false, "hard with confirm should be hard");
  assert.ok(undo2.backup, "backup should still be created");
});

test("git undo creates a recovery backup branch", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-undo-backup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = new Git(root);
  await git.init();
  writeFileSync(path.join(root, "x.txt"), "1\n");
  await git.checkpoint("c1");
  const undo = await git.undo({ hard: true, confirm: true });
  assert.ok(undo.backup.startsWith("zetora-undo-backup-"));
  // The backup branch should appear in the branches list.
  const branches = await git.branches();
  assert.ok(branches.branches.some((b) => b.name === undo.backup), "backup branch should exist");
});

// === Fix #2: diagnoseError is more flexible ===
test("diagnoseError matches missing module without quotes", () => {
  const matches = diagnoseError("Error: Cannot find module express");
  assert.ok(matches.length >= 1);
  const dep = matches.find((m) => m.category === "missing_dependency");
  assert.ok(dep, "should detect missing dependency without quotes");
  assert.match(dep.fix, /express/);
});

test("diagnoseError matches 'could not find' variant", () => {
  const matches = diagnoseError("Error: Could not find module 'react'");
  assert.ok(matches.some((m) => m.category === "missing_dependency"));
});

test("diagnoseError matches 'cannot resolve' variant", () => {
  const matches = diagnoseError("Module not found: Can't resolve 'lodash'");
  assert.ok(matches.some((m) => m.category === "missing_dependency"));
});

test("diagnoseError detects EADDRINUSE", () => {
  const matches = diagnoseError("Error: listen EADDRINUSE: address already in use 0.0.0.0:3000");
  assert.ok(matches.some((m) => m.category === "port_conflict"));
});

test("diagnoseError detects command not found", () => {
  const matches = diagnoseError("sh: tsc: command not found");
  assert.ok(matches.some((m) => m.category === "command_not_found"));
  assert.match(matches[0].fix, /tsc/);
});

test("diagnoseError detects ECONNREFUSED", () => {
  const matches = diagnoseError("Error: connect ECONNREFUSED 127.0.0.1:5432");
  assert.ok(matches.some((m) => m.category === "connection_refused"));
});

test("diagnoseError detects out of memory", () => {
  const matches = diagnoseError("FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory");
  assert.ok(matches.some((m) => m.category === "out_of_memory"));
});

test("diagnoseError detects npm 404", () => {
  const matches = diagnoseError("npm ERR! 404 Not Found - nonexistent-package-xyz");
  assert.ok(matches.some((m) => m.category === "package_not_found"));
});

// === Fix #6: Collab CRDT-style merge ===
test("collab session detects conflicts on overlapping ranges", () => {
  const session = new CollabSession("s1", { document: "hello world" });
  session.join("alice");
  session.join("bob");
  // Both edit the same region.
  session.edit("alice", { type: "replace", range: { start: { offset: 0 }, end: { offset: 5 } }, text: "HELLO" });
  session.edit("bob", { type: "replace", range: { start: { offset: 0 }, end: { offset: 5 } }, text: "Hello" });
  const snap = session.getSnapshot();
  assert.ok(snap.conflicts >= 1, "should detect at least 1 conflict");
});

test("collab session no conflict for non-overlapping edits", () => {
  const session = new CollabSession("s2", { document: "aaaaabbbbb" });
  session.join("alice");
  session.join("bob");
  // Alice edits chars 0-4, Bob edits chars 5-9 — no overlap.
  session.edit("alice", { type: "replace", range: { start: { offset: 0 }, end: { offset: 5 } }, text: "AAAAA" });
  session.edit("bob", { type: "replace", range: { start: { offset: 5 }, end: { offset: 10 } }, text: "BBBBB" });
  const snap = session.getSnapshot();
  assert.equal(snap.conflicts, 0, "non-overlapping edits should not conflict");
});

test("collab session uses Lamport timestamps", () => {
  const session = new CollabSession("s3", { document: "" });
  session.join("alice");
  const op1 = session.edit("alice", { type: "insert", range: { start: { offset: 0 } }, text: "a" });
  const op2 = session.edit("alice", { type: "insert", range: { start: { offset: 1 } }, text: "b" });
  assert.ok(op2.clock > op1.clock, "clock should be monotonically increasing");
});

test("collab session replay reconstructs document", () => {
  const session = new CollabSession("s4", { document: "" });
  session.join("alice");
  session.edit("alice", { type: "insert", range: { start: { offset: 0 } }, text: "hello " });
  session.edit("alice", { type: "insert", range: { start: { offset: 6 } }, text: "world" });
  const replayed = session.replay();
  assert.equal(replayed, "hello world");
});

test("collab snapshot includes vector clock", () => {
  const session = new CollabSession("s5", { document: "" });
  session.join("alice");
  session.join("bob");
  session.edit("alice", { type: "insert", range: { start: { offset: 0 } }, text: "a" });
  session.edit("bob", { type: "insert", range: { start: { offset: 1 } }, text: "b" });
  const snap = session.getSnapshot();
  assert.ok(snap.vectorClock.alice >= 1);
  assert.ok(snap.vectorClock.bob >= 1);
});
