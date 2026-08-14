import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workspace } from "../packages/tools/src/index.js";

test("workspace confines paths and supports original file operations", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-workspace-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("src/hello.js", "const greeting = 'hello';\n");
  assert.match((await workspace.read("src/hello.js")).content, /greeting/);
  assert.equal((await workspace.search("hello"))[0].line, 1);
  await workspace.replace("src/hello.js", "hello", "مرحبا");
  assert.match((await workspace.read("src/hello.js")).content, /مرحبا/);
  assert.throws(() => workspace.resolve("../../etc/passwd"), /escapes/);
});

test("mutating commands do not execute without approval", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-command-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await new Workspace(root).run("touch unsafe.txt");
  assert.equal(result.approvalRequired, true);
});
