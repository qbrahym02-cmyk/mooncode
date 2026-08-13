import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Git } from "../packages/git/src/index.js";

test("git worktree add/list/remove", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-wt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = new Git(root);
  await git.init();
  writeFileSync(path.join(root, "a.txt"), "v1\n");
  await git.checkpoint("initial");

  const added = await git.addWorktree("feature-x");
  assert.equal(added.name, "feature-x");
  assert.ok(added.path);

  const list = await git.listWorktrees();
  assert.ok(list.worktrees.length >= 2);

  const removed = await git.removeWorktree("feature-x");
  assert.equal(removed.removed, "feature-x");
});

test("git graph returns commits and edges", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-graph-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = new Git(root);
  await git.init();
  writeFileSync(path.join(root, "a.txt"), "1\n");
  await git.checkpoint("c1");
  writeFileSync(path.join(root, "a.txt"), "2\n");
  await git.checkpoint("c2");

  const graph = await git.graph({ limit: 10 });
  assert.ok(graph.commits.length >= 2);
  assert.ok(graph.edges.length >= 1);
  // The most recent commit should be first.
  assert.match(graph.commits[0].message, /c2/);
});
