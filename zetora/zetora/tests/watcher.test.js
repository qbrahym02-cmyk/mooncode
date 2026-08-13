import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FileWatcher } from "../packages/watcher/src/index.js";

test("file watcher emits change events when files are written", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-watch-"));
  t.after(async () => {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  });
  const watcher = new FileWatcher(root);
  await watcher.start();
  // Give the watcher a tick to attach.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const events = [];
  watcher.on("change", (event) => events.push(event));
  const target = path.join(root, "test.txt");
  await writeFile(target, "hello\n");
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(events.some((event) => event.path === "test.txt" && event.type === "file"), "expected a change event for test.txt");
});

test("file watcher skips ignored directories", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-watch-skip-"));
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  const watcher = new FileWatcher(root);
  await watcher.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  t.after(async () => {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  });

  const events = [];
  watcher.on("change", (event) => events.push(event));
  await writeFile(path.join(root, "node_modules", "pkg.txt"), "ignored\n");
  await writeFile(path.join(root, "real.txt"), "tracked\n");
  await new Promise((resolve) => setTimeout(resolve, 250));
  const paths = events.map((event) => event.path);
  assert.ok(paths.some((p) => p === "real.txt"), `expected real.txt in ${JSON.stringify(paths)}`);
  assert.ok(!paths.some((p) => p.startsWith("node_modules/")), `node_modules should be skipped: ${JSON.stringify(paths)}`);
});
