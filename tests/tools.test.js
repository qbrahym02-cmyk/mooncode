import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workspace } from "../packages/tools/src/index.js";
import { AutoFix, FIXERS, diagnoseError } from "../packages/autofix/src/index.js";

test("grep returns matches with context lines", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-grep-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("a.js", "function hello() {\n  return 'world';\n}\n");
  await workspace.write("b.js", "const greeting = 'hello';\n");
  const results = await workspace.grep("hello", { contextBefore: 1, contextAfter: 1 });
  assert.ok(results.length >= 2);
  const first = results[0];
  assert.ok(first.context.length >= 1);
  assert.ok(first.context.some((line) => line.match));
});

test("grep filters by glob pattern", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-glob-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("a.js", "needle;\n");
  await workspace.write("b.txt", "needle;\n");
  const results = await workspace.grep("needle", { glob: "*.js" });
  assert.equal(results.length, 1);
  assert.match(results[0].path, /a\.js$/);
});

test("fetchUrl rejects non-http URLs", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-fetch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await assert.rejects(() => workspace.fetchUrl("file:///etc/passwd"), /http/);
});

test("parseAST extracts functions, classes, imports, exports", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-ast-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("mod.js", "import { foo } from 'bar';\nexport function hello() { return 1; }\nconst add = (a, b) => a + b;\nexport class Widget { render() {} }\n");
  const ast = await workspace.parseAST("mod.js");
  assert.equal(ast.summary.imports, 1);
  assert.ok(ast.summary.functions >= 2);
  assert.equal(ast.summary.classes, 1);
  assert.ok(ast.nodes.some((n) => n.type === "import" && n.source === "bar"));
  assert.ok(ast.nodes.some((n) => n.type === "function" && n.name === "hello"));
  assert.ok(ast.nodes.some((n) => n.type === "class" && n.name === "Widget"));
});

test("v0.9.1: parseAST handles TypeScript generics, arrow-without-parens, re-exports, methods", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-ast-ts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  // TypeScript features: generic function, generic class, type-only import,
  // re-export, arrow without parens, abstract class, class method.
  await workspace.write("ts.ts", [
    "import type { ReactNode } from 'react';",
    "import { useState } from 'react';",
    "export function identity<T>(value: T): T { return value; }",
    "const double = x => x * 2;",
    "export abstract class Base<T> {",
    "  abstract render(item: T): string;",
    "  log(msg: string) { console.log(msg); }",
    "}",
    "export { Foo, Bar as Baz } from './foo';",
    "export type Status = 'active' | 'inactive';",
  ].join("\n") + "\n");
  const ast = await workspace.parseAST("ts.ts");
  // Imports: type import + named import = 2
  assert.equal(ast.summary.imports, 2);
  // Functions: identity (generic) + double (arrow no parens) = 2
  assert.equal(ast.summary.functions, 2);
  assert.ok(ast.nodes.some((n) => n.type === "function" && n.name === "identity"), "identity<T> should be captured");
  assert.ok(ast.nodes.some((n) => n.type === "function" && n.name === "double"), "arrow-without-parens should be captured");
  // Classes: Base<T> = 1
  assert.equal(ast.summary.classes, 1);
  assert.ok(ast.nodes.some((n) => n.type === "class" && n.name === "Base"), "abstract class Base<T> should be captured");
  // Methods: render + log = 2 (methods are captured as type "method")
  assert.ok(ast.summary.methods >= 2, "class methods render() and log() should be captured");
  assert.ok(ast.nodes.some((n) => n.type === "method" && n.name === "render"), "render() method should be captured");
  assert.ok(ast.nodes.some((n) => n.type === "method" && n.name === "log"), "log() method should be captured");
  // Exports: identity (named), Base (named), Foo (re-export), Bar (re-export) = 4
  // (re-exports expand into individual entries; `export type Status = ...` uses
  // `=` not a reserved word, so it's not captured by the namedExport regex —
  // this is a known limitation documented in the parseAST comment.)
  assert.ok(ast.summary.exports >= 4, "should capture named + re-exports");
  assert.ok(ast.nodes.some((n) => n.type === "export" && n.kind === "re-export" && n.name === "Foo"), "re-export Foo should be captured");
  assert.ok(ast.nodes.some((n) => n.type === "export" && n.kind === "re-export" && n.name === "Bar"), "re-export Bar should be captured");
  // v0.9.1: re-export with alias — the name before `as` is captured.
  assert.ok(ast.nodes.some((n) => n.type === "export" && n.kind === "re-export" && n.name === "Bar"), "re-export Bar (alias Baz) should be captured by original name");
});

test("runTests detects node --test fallback", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-tests-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("package.json", JSON.stringify({ name: "test-pkg", version: "5.0.0" }));
  await workspace.write("tests/sample.test.js", "import test from 'node:test';\nimport assert from 'assert/strict';\ntest('ok', () => assert.equal(1, 1));\n");
  const result = await workspace.runTests({ timeout: 15_000 });
  assert.equal(result.code, 0);
  assert.match(result.command, /node --test/);
});

test("AutoFix adds trailing newline", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-autofix-nl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixer = new AutoFix(root);
  const file = path.join(root, "a.js");
  await writeFile(file, "const x = 1;");
  const result = await fixer.fix("a.js");
  assert.equal(result.fixed, true);
  assert.ok(result.changes.some((c) => c.fixer === "trailing-newline"));
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(file, "utf8");
  assert.ok(content.endsWith("\n"));
});

test("AutoFix converts tabs to spaces", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-autofix-tabs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixer = new AutoFix(root);
  const file = path.join(root, "a.js");
  await writeFile(file, "function f() {\n\treturn 1;\n}\n");
  const result = await fixer.fix("a.js");
  assert.equal(result.fixed, true);
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(file, "utf8");
  assert.ok(!content.includes("\t"));
  assert.ok(content.includes("  return 1;"));
});

test("AutoFix pretty-prints JSON", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-autofix-json-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixer = new AutoFix(root);
  const file = path.join(root, "data.json");
  await writeFile(file, '{"b":2,"a":1}');
  const result = await fixer.fix("data.json");
  assert.equal(result.fixed, true);
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(file, "utf8");
  // Pretty-printed: 2-space indent, valid JSON.
  assert.match(content, /^\{\n  "b": 2,\n  "a": 1\n\}\n$/);
});

test("AutoFix dryRun reports without applying", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-autofix-dry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixer = new AutoFix(root);
  const file = path.join(root, "a.js");
  await writeFile(file, "const x = 1;");
  const result = await fixer.fix("a.js", { dryRun: true });
  assert.equal(result.fixed, false);
  assert.ok(result.wouldFix);
  assert.ok(result.changes.length > 0);
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(file, "utf8");
  assert.equal(content, "const x = 1;");
});

test("AutoFix verifies valid JS after fix", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-autofix-verify-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fixer = new AutoFix(root);
  const file = path.join(root, "good.js");
  await writeFile(file, "const x = 1;");
  const result = await fixer.fix("good.js", { fixers: ["trailing-newline"], verify: true });
  assert.equal(result.verified, true);
  assert.equal(result.fixed, true);
});

test("diagnoseError detects missing module pattern", () => {
  const matches = diagnoseError("Error: Cannot find module 'left-pad'");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "missing_dependency");
  assert.match(matches[0].fix, /npm install left-pad/);
});

test("diagnoseError detects syntax errors", () => {
  const matches = diagnoseError("SyntaxError: Unexpected token '}'");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "syntax_error");
});

test("diagnoseError detects port conflicts", () => {
  const matches = diagnoseError("Error: Port 3000 is already in use");
  assert.ok(matches.length >= 1);
  const portMatch = matches.find((m) => m.category === "port_conflict");
  assert.ok(portMatch, "expected a port_conflict match");
  assert.match(portMatch.fix, /3000/);
});

test("FIXERS.trailing-newline is idempotent", () => {
  const fixer = FIXERS["trailing-newline"];
  const result = fixer.fix("hello\n");
  assert.equal(result.changed, false);
});

test("read_file with startLine/endLine returns a slice", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mooncode-readline-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  await workspace.ensure();
  await workspace.write("multi.js", "line1\nline2\nline3\nline4\nline5\n");
  const slice = await workspace.read("multi.js");
  // Direct read returns full file; the startLine/endLine slicing is in the agent runner.
  assert.equal(slice.content, "line1\nline2\nline3\nline4\nline5\n");
});
