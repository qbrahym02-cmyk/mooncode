import test from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, Risk, toolRisk } from "../packages/kernel/src/index.js";

test("read-only commands are observable", () => {
  assert.equal(classifyCommand("git status").risk, Risk.OBSERVE);
  assert.equal(classifyCommand("find . -maxdepth 2").risk, Risk.OBSERVE);
});

test("mutating commands require execution approval", () => {
  assert.equal(classifyCommand("npm install left-pad").risk, Risk.EXECUTE);
});

test("destructive commands are blocked", () => {
  assert.equal(classifyCommand("rm -rf /").risk, Risk.BLOCKED);
  assert.equal(classifyCommand("mkfs.ext4 /dev/sda").risk, Risk.BLOCKED);
});

test("tool risks are explicit", () => {
  assert.equal(toolRisk("read_file"), Risk.OBSERVE);
  assert.equal(toolRisk("write_file"), Risk.MODIFY);
  assert.equal(toolRisk("missing"), Risk.BLOCKED);
});
