import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_AGENTS, getAgent, getPrimaryAgents, filterToolsForAgent } from "../packages/agent/src/agents.js";

test("BUILTIN_AGENTS: has 7 agents", () => {
  assert.equal(BUILTIN_AGENTS.length, 7);
});

test("BUILTIN_AGENTS: has build, plan, explore, general, compaction, title, summary", () => {
  const ids = BUILTIN_AGENTS.map((a) => a.id);
  assert.ok(ids.includes("build"));
  assert.ok(ids.includes("plan"));
  assert.ok(ids.includes("explore"));
  assert.ok(ids.includes("general"));
  assert.ok(ids.includes("compaction"));
  assert.ok(ids.includes("title"));
  assert.ok(ids.includes("summary"));
});

test("getAgent: returns agent by id", () => {
  const build = getAgent("build");
  assert.ok(build);
  assert.equal(build.id, "build");
  assert.equal(build.mode, "primary");
});

test("getAgent: returns null for unknown id", () => {
  assert.equal(getAgent("nonexistent"), null);
});

test("getPrimaryAgents: returns primary agents", () => {
  const primary = getPrimaryAgents();
  // build, plan are primary; compaction, title, summary are hidden
  assert.ok(primary.length >= 2, `expected at least 2 primary agents, got ${primary.length}`);
  assert.ok(primary.some((a) => a.id === "build"));
  assert.ok(primary.some((a) => a.id === "plan"));
});

test("filterToolsForAgent: plan agent denies write_file", () => {
  const tools = [
    { name: "read_file" },
    { name: "write_file" },
    { name: "run_command" },
    { name: "list_files" },
  ];
  const planAgent = getAgent("plan");
  const filtered = filterToolsForAgent(planAgent, tools);
  // plan agent denies run_command, replace_text, auto_fix, spawn_subagent, worktree
  // but has allowedTools that includes write_file (for .mooncode/plans/)
  const names = filtered.map((t) => t.name);
  assert.ok(!names.includes("run_command"), "plan should not have run_command");
});

test("filterToolsForAgent: explore agent only has read tools", () => {
  const tools = [
    { name: "read_file" },
    { name: "write_file" },
    { name: "run_command" },
    { name: "grep" },
    { name: "list_files" },
  ];
  const exploreAgent = getAgent("explore");
  const filtered = filterToolsForAgent(exploreAgent, tools);
  const names = filtered.map((t) => t.name);
  assert.ok(names.includes("read_file"));
  assert.ok(names.includes("grep"));
  assert.ok(names.includes("list_files"));
  assert.ok(!names.includes("write_file"), "explore should not have write_file");
  assert.ok(!names.includes("run_command"), "explore should not have run_command");
});

test("plan agent: has read-only system prompt", () => {
  const plan = getAgent("plan");
  assert.ok(plan.systemPrompt.includes("PLAN"), "plan prompt should mention PLAN");
  assert.ok(plan.deniedTools.includes("run_command"), "plan should deny run_command");
});
