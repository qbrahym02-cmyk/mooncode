import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SkillRegistry, BUILTIN_SKILLS } from "../packages/skills/src/index.js";

test("skill registry lists empty when no skills directory exists", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  const skills = await registry.list();
  assert.deepEqual(skills, []);
});

test("skill registry lists manifests from workspace/skills/", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("design-landing", {
    name: "design-landing",
    description: "Generate a landing page",
    mode: "design",
    inputs: [{ name: "brief", type: "string", required: true }],
    prompt: "Build a landing page for: {{brief}}",
  });
  const skills = await registry.list();
  assert.equal(skills.length, 1);
  assert.equal(skills[0].id, "design-landing");
  assert.equal(skills[0].mode, "design");
});

test("create skill writes a manifest file", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-create-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  const skill = await registry.create("my-skill", {
    name: "my-skill",
    description: "test",
    mode: "build",
    prompt: "do the thing",
  });
  assert.equal(skill.id, "my-skill");
  // Reading it back returns the same manifest.
  const fetched = await registry.get("my-skill");
  assert.equal(fetched.prompt, "do the thing");
});

test("create skill rejects duplicate id", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-dup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("dup", { prompt: "first" });
  await assert.rejects(() => registry.create("dup", { prompt: "second" }), /already exists/);
});

test("create skill rejects invalid id", async () => {
  const registry = new SkillRegistry("/tmp");
  await assert.rejects(() => registry.create("UPPER", { prompt: "x" }), /lowercase/);
  await assert.rejects(() => registry.create("with space", { prompt: "x" }), /lowercase/);
});

test("create skill rejects invalid manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await assert.rejects(() => registry.create("ok-id", { name: "x" }), /prompt/);
  await assert.rejects(() => registry.create("ok-id", { prompt: "x", mode: "bad" }), /mode/);
});

test("update skill overwrites manifest", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-update-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("upd", { prompt: "v1" });
  await registry.update("upd", { prompt: "v2", description: "updated" });
  const fetched = await registry.get("upd");
  assert.equal(fetched.prompt, "v2");
  assert.equal(fetched.description, "updated");
});

test("update rejects builtin skill", async () => {
  const registry = new SkillRegistry("/tmp");
  await assert.rejects(() => registry.update("analyze-project", { prompt: "x" }), /built-in/);
});

test("delete skill removes directory", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-delete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("del", { prompt: "x" });
  const result = await registry.delete("del");
  assert.equal(result.deleted, "del");
  const skills = await registry.list();
  assert.equal(skills.length, 0);
});

test("delete rejects builtin skill", async () => {
  const registry = new SkillRegistry("/tmp");
  await assert.rejects(() => registry.delete("analyze-project"), /built-in/);
});

test("renderPrompt substitutes {{name}} and {{inputs.name}}", () => {
  const registry = new SkillRegistry("/tmp");
  const prompt = registry.renderPrompt({ prompt: "Hello {{name}}, {{inputs.name}}!" }, { name: "Moon Code" });
  assert.equal(prompt, "Hello Moon Code, Moon Code!");
});

test("renderPrompt uses default fallback {{name|fallback}}", () => {
  const registry = new SkillRegistry("/tmp");
  const prompt = registry.renderPrompt({ prompt: "Tone: {{tone|friendly}}" }, {});
  assert.equal(prompt, "Tone: friendly");
});

test("renderPrompt strips unsubstituted {{...}} tokens", () => {
  const registry = new SkillRegistry("/tmp");
  const prompt = registry.renderPrompt({ prompt: "Hello {{name}}, missing {{missing}}" }, { name: "X" });
  assert.equal(prompt, "Hello X, missing ");
});

test("recordInvocation stores history entries", () => {
  const registry = new SkillRegistry("/tmp");
  registry.recordInvocation("test", { brief: "x" }, { ok: true, prompt: "rendered" });
  const history = registry.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, "test");
  assert.equal(history[0].inputs.brief, "x");
});

test("resolveComposition chains dependent skills", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-compose-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("parent", { prompt: "parent step", compose: ["child-a", "child-b"] });
  await registry.create("child-a", { prompt: "child A" });
  await registry.create("child-b", { prompt: "child B" });
  const parent = await registry.get("parent");
  const chain = await registry.resolveComposition(parent);
  assert.equal(chain.length, 2);
  assert.equal(chain[0].id, "child-a");
  assert.equal(chain[1].id, "child-b");
});

test("resolveComposition prevents cycles", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-cycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("a", { prompt: "a", compose: ["b"] });
  await registry.create("b", { prompt: "b", compose: ["a"] });
  const a = await registry.get("a");
  const chain = await registry.resolveComposition(a);
  // Should not infinite-loop. Chain includes b but b's reference to a is skipped.
  assert.ok(chain.length <= 2);
  const ids = chain.map((c) => c.id);
  assert.ok(!ids.includes("a") || ids.indexOf("a") === ids.lastIndexOf("a"));
});

test("builtin skills include auto-fix and explain-code", () => {
  const ids = BUILTIN_SKILLS.map((s) => s.id);
  assert.ok(ids.includes("auto-fix"));
  assert.ok(ids.includes("explain-code"));
  assert.ok(BUILTIN_SKILLS.length >= 5);
});

test("listAll merges builtins with user skills", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-skills-listall-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registry = new SkillRegistry(root);
  await registry.create("custom", { prompt: "x" });
  const all = await registry.listAll();
  const ids = all.map((s) => s.id);
  assert.ok(ids.includes("analyze-project"));
  assert.ok(ids.includes("custom"));
});
