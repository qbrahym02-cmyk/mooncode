import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PtyRegistry } from "../packages/pty/src/index.js";

test("pty session persists cwd and env across commands", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "zetora-ptytest-"));
  const registry = new PtyRegistry();
  const session = await registry.create({ cwd: root, cols: 80, rows: 24 });
  t.after(async () => {
    registry.closeAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
    rmSync(root, { recursive: true, force: true });
  });

  const first = await session.send("echo hello");
  assert.equal(first.stdout.trim(), "hello");

  const pwd = await session.send("pwd");
  assert.equal(pwd.stdout.trim(), root);

  await session.send("FOO=persistent_value");
  const echo = await session.send("echo $FOO");
  assert.equal(echo.stdout.trim(), "persistent_value");
});

test("pty session supports resize", async (t) => {
  const registry = new PtyRegistry();
  const session = await registry.create({ cwd: os.tmpdir(), cols: 80, rows: 24 });
  t.after(async () => {
    registry.closeAll();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  session.resize(120, 40);
  assert.equal(session.cols, 120);
  assert.equal(session.rows, 40);
});
