import test from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, countMessageTokens, needsCompaction, compactConversation, truncateToolOutput, COMPACTION_CONFIG } from "../packages/context/src/token-counter.js";

test("estimateTokens: returns reasonable estimate", () => {
  assert.ok(estimateTokens("hello world") > 0);
  assert.ok(estimateTokens("hello world") <= 3);
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
});

test("countMessageTokens: includes role overhead", () => {
  const tokens = countMessageTokens({ role: "user", content: "hello world" });
  assert.ok(tokens > 2); // 11 chars / 4 = ~3 + 4 overhead
});

test("needsCompaction: false for small conversations", () => {
  const messages = [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ];
  assert.equal(needsCompaction(messages), false);
});

test("needsCompaction: true for large conversations", () => {
  // Create a conversation > PRUNE_PROTECT (40K tokens = ~160K chars)
  const bigContent = "x".repeat(200_000);
  const messages = [
    { role: "user", content: bigContent },
    { role: "assistant", content: bigContent },
  ];
  assert.equal(needsCompaction(messages), true);
});

test("truncateToolOutput: truncates large outputs", () => {
  const bigOutput = "x".repeat(5000);
  const result = truncateToolOutput(bigOutput);
  assert.equal(result.truncated, true);
  assert.ok(result.content.length < bigOutput.length);
  assert.ok(result.fullLength === 5000);
});

test("truncateToolOutput: keeps small outputs", () => {
  const smallOutput = "small output";
  const result = truncateToolOutput(smallOutput);
  assert.equal(result.truncated, false);
  assert.equal(result.content, smallOutput);
});

test("compactConversation: returns compacted=false for small convos", async () => {
  const messages = [{ role: "user", content: "hello" }];
  const result = await compactConversation(messages, async () => "summary");
  assert.equal(result.compacted, false);
});

test("COMPACTION_CONFIG: has correct thresholds", () => {
  assert.equal(COMPACTION_CONFIG.PRUNE_MINIMUM, 20_000);
  assert.equal(COMPACTION_CONFIG.PRUNE_PROTECT, 40_000);
  assert.equal(COMPACTION_CONFIG.TOOL_OUTPUT_MAX_CHARS, 2_000);
});
