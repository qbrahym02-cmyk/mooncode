import test from "node:test";
import assert from "node:assert/strict";
import { PermissionManager, evaluate, DEFAULT_RULESET, riskToPermission } from "../packages/kernel/src/permissions.js";

test("PermissionManager: allow read for normal files", () => {
  const pm = new PermissionManager();
  const action = pm.check("read", "src/index.js");
  assert.equal(action, "allow");
});

test("PermissionManager: ask for .env files", () => {
  const pm = new PermissionManager();
  const action = pm.check("read", ".env");
  assert.equal(action, "ask");
});

test("PermissionManager: deny after explicit deny rule", () => {
  const pm = new PermissionManager();
  pm.addRules([{ permission: "write", pattern: "*.lock", action: "deny" }]);
  const action = pm.check("write", "package.lock");
  assert.equal(action, "deny");
});

test("PermissionManager: 'always' approval auto-resolves future requests", () => {
  const pm = new PermissionManager();
  const req1 = pm.request("write", "src/test.js");
  assert.ok(req1, "should create a request");
  pm.reply(req1.id, { type: "always", action: "allow" });
  // Future write to same path should auto-allow
  const req2 = pm.request("write", "src/test.js");
  assert.equal(req2, null, "should auto-allow after 'always'");
});

test("PermissionManager: cascade rejection denies all pending", () => {
  const pm = new PermissionManager();
  const req1 = pm.request("write", "a.js");
  const req2 = pm.request("write", "b.js");
  const result = pm.reply(req1.id, { type: "reject" });
  assert.ok(result.rejected?.length >= 2, "should reject both");
  assert.equal(pm.listPending().length, 0);
});

test("PermissionManager: bash allows read-only commands", () => {
  const pm = new PermissionManager();
  assert.equal(pm.check("bash", "ls -la"), "allow");
  assert.equal(pm.check("bash", "git status"), "allow");
  assert.equal(pm.check("bash", "npm test"), "allow");
  assert.equal(pm.check("bash", "rm -rf /"), "ask"); // falls through to default
});

test("riskToPermission: maps tools correctly", () => {
  assert.deepEqual(riskToPermission("read_file", { path: "src.js" }), { permission: "read", path: "src.js" });
  assert.deepEqual(riskToPermission("write_file", { path: "out.js" }), { permission: "write", path: "out.js" });
  assert.deepEqual(riskToPermission("run_command", { command: "ls" }), { permission: "bash", path: "ls" });
  assert.deepEqual(riskToPermission("spawn_subagent", {}), { permission: "external", path: "*" });
});

test("evaluate: later rules override earlier", () => {
  const rules = [
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "read", pattern: "*.env", action: "ask" },
  ];
  assert.equal(evaluate("read", "src.js", rules), "allow");
  assert.equal(evaluate("read", ".env", rules), "ask");
});
