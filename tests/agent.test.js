import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentRunner } from "../packages/agent/src/index.js";
import { Workspace } from "../packages/tools/src/index.js";
import { estimateCost } from "../packages/providers/src/index.js";

/**
 * In-memory approval store used to test the resume flow without persistence.
 * Mirrors the shape of the server-side store: __call records a pending item,
 * readAll returns the list, resolve updates an item in place.
 */
function fakeApprovalStore() {
  const approvals = [];
  return {
    approvals,
    async __call(approval) { approvals.unshift(approval); },
    async readAll() { return { approvals }; },
    async resolve(id, status, result) {
      const item = approvals.find((entry) => entry.id === id);
      if (item) { item.status = status; item.result = result; }
    },
  };
}

test("demo agent streams text deltas in order", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-stream-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const events = [];
  const runner = new AgentRunner({ workspace: new Workspace(root), approvalStore: fakeApprovalStore() });
  await runner.run(
    { prompt: "مرحبا", provider: "demo", model: "demo-local", stream: true },
    (event) => events.push(event),
  );
  const deltas = events.filter((event) => event.type === "text.delta");
  assert.ok(deltas.length > 1, "demo streaming should emit multiple deltas");
  const reassembled = deltas.map((event) => event.delta).join("");
  assert.match(reassembled, /الوضع التجريبي/);
});

test("runner pauses on write_file and resumes after approval", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  const store = fakeApprovalStore();
  const events = [];
  const runner = new AgentRunner({ workspace, approvalStore: store });

  // Force a tool call by faking the provider through a custom prompt only works
  // with real models. Instead, simulate directly: call executeTool(false) then
  // resume. This still exercises the approval + diff snapshot path.
  const call = { id: "call-1", name: "write_file", input: { path: "notes/hello.md", content: "# مرحبا\n" } };
  const initial = await runner.executeTool(call, false);
  assert.equal(initial.approvalRequired, true);

  // Build an approval record manually, mirroring what the runner would emit.
  const approval = { id: "ap-1", runId: "run-1", status: "pending", tool: call, risk: "modify", summary: "write_file: notes/hello.md", createdAt: new Date().toISOString() };
  await store.__call(approval);

  // Deny path
  const denied = await runner.resume(approval.id, "deny");
  assert.equal(denied.status, "denied");
  const stillMissing = await workspace.exists("notes/hello.md");
  assert.equal(stillMissing, false);

  // Approve path (new approval). No active runner is parked on this run, so
  // resume returns "approved" and the tool still executes the side effect.
  const approval2 = { id: "ap-2", runId: "run-2", status: "pending", tool: { ...call, id: "call-2" }, risk: "modify", summary: "write_file: notes/hello.md", createdAt: new Date().toISOString() };
  await store.__call(approval2);
  const approved = await runner.resume(approval2.id, "approve");
  assert.equal(approved.status, "approved");
  const written = await workspace.read("notes/hello.md");
  assert.match(written.content, /مرحبا/);
});

test("write_file returns a diff snapshot for the inspector", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-diff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("config.json", "{\n  \"name\": \"old\"\n}\n");
  const runner = new AgentRunner({ workspace, approvalStore: fakeApprovalStore() });
  const result = await runner.executeTool({ name: "write_file", input: { path: "config.json", content: "{\n  \"name\": \"new\"\n}\n" } }, true);
  assert.equal(result.diff.previous, "{\n  \"name\": \"old\"\n}\n");
  assert.equal(result.diff.next, "{\n  \"name\": \"new\"\n}\n");
});

test("estimateCost normalizes unknown models to null cost", () => {
  const unknown = estimateCost("totally-made-up-model", { inputTokens: 100, outputTokens: 50 });
  assert.equal(unknown.costUsd, null);
  assert.equal(unknown.totalTokens, 150);
  const known = estimateCost("gpt-4o-mini", { inputTokens: 1000, outputTokens: 500 });
  assert.ok(known.costUsd > 0);
});
