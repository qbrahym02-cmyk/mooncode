import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../packages/storage/src/index.js";

test("JSON store writes atomically and updates state", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-store-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "state.json");
  const store = new JsonStore(file, { count: 0 });
  assert.deepEqual(await store.read(), { count: 0 });
  await store.update((value) => { value.count += 1; return value; });
  assert.equal((await store.read()).count, 1);
  assert.equal(JSON.parse(await readFile(file, "utf8")).count, 1);
});
