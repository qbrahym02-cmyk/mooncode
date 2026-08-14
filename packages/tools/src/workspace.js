import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { classifyCommand, Risk } from "../../kernel/src/policy.js";

// Convert a glob pattern into a RegExp. Supports `*` (no slash), `**` (any
// path segments), and `?` (single char). Examples: "*.js", "src/​**/​*.test.js".
function globToRegex(glob) {
  let pattern = String(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  pattern = pattern.replace(/\*\*/g, "::DOUBLESTAR::").replace(/\*/g, "[^/]*").replace(/::DOUBLESTAR::/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`, "i");
}

/**
 * Strip HTML tags and collapse whitespace for a readable plain-text version.
 * Used by fetchUrl when the response is HTML and the caller wants text.
 */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".jsonc", ".md", ".txt",
  ".css", ".scss", ".html", ".svg", ".yml", ".yaml", ".toml", ".xml", ".py", ".go",
  ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".sh", ".sql", ".env",
]);
const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", "out", "target", ".cache"]);

export class Workspace {
  constructor(root) {
    this.root = path.resolve(root);
  }

  resolve(relative = ".") {
    const input = String(relative).replaceAll("\\", "/").replace(/^\/+/, "");
    if (input.includes("\0")) throw Object.assign(new Error("Invalid path"), { status: 400 });
    const candidate = path.resolve(this.root, input || ".");
    // v0.9.1 hardening: use path.relative() to detect escapes more reliably
    // than startsWith. This correctly handles edge cases like:
    //   - workspace = "/home/user/project"
    //   - input     = "../project-evil"  → startsWith would pass, but relative() reveals ".."
    //   - input     = "/home/user/project-evil" (absolute, sibling) → startsWith would pass
    // On Windows, path.sep is "\\", so this also handles drive-letter confusion.
    if (candidate !== this.root) {
      const rel = path.relative(this.root, candidate);
      // If relative path starts with ".." or is absolute, it escapes the workspace.
      if (rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) {
        throw Object.assign(new Error("Path escapes the selected workspace"), { status: 403 });
      }
    }
    return candidate;
  }

  relative(absolute) {
    return path.relative(this.root, absolute).replaceAll(path.sep, "/") || ".";
  }

  async ensure() {
    await mkdir(this.root, { recursive: true });
  }

  async tree(relative = ".", options = {}) {
    const maxDepth = Math.min(Number(options.maxDepth ?? 5), 12);
    const maxEntries = Math.min(Number(options.maxEntries ?? 1200), 5000);
    const output = [];
    const walk = async (folder, depth) => {
      if (depth > maxDepth || output.length >= maxEntries) return;
      let entries = await readdir(folder, { withFileTypes: true });
      entries = entries
        .filter((entry) => !SKIP.has(entry.name) && !entry.name.startsWith(".DS_Store"))
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (output.length >= maxEntries) break;
        const absolute = path.join(folder, entry.name);
        const item = { path: this.relative(absolute), name: entry.name, type: entry.isDirectory() ? "directory" : "file", depth };
        if (!entry.isDirectory()) {
          const info = await stat(absolute);
          item.size = info.size;
        }
        output.push(item);
        if (entry.isDirectory()) await walk(absolute, depth + 1);
      }
    };
    const target = this.resolve(relative);
    await walk(target, 0);
    return output;
  }

  async read(relative, options = {}) {
    const target = this.resolve(relative);
    const info = await stat(target);
    const maxBytes = Math.min(Number(options.maxBytes ?? 1_000_000), 5_000_000);
    if (!info.isFile()) throw new Error("Path is not a file");
    if (info.size > maxBytes) throw new Error(`File is larger than ${maxBytes} bytes`);
    const content = await readFile(target, "utf8");
    return { path: this.relative(target), content, size: info.size, modifiedAt: info.mtime.toISOString() };
  }

  async write(relative, content) {
    const target = this.resolve(relative);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, String(content), "utf8");
    await rename(temporary, target);
    return { path: this.relative(target), bytes: Buffer.byteLength(String(content)) };
  }

  async replace(relative, oldText, newText) {
    const current = await this.read(relative, { maxBytes: 5_000_000 });
    const index = current.content.indexOf(String(oldText));
    if (index < 0) throw new Error("Text to replace was not found");
    if (current.content.indexOf(String(oldText), index + String(oldText).length) >= 0) {
      throw new Error("Text to replace is not unique");
    }
    const next = `${current.content.slice(0, index)}${newText}${current.content.slice(index + String(oldText).length)}`;
    return this.write(relative, next);
  }

  async search(query, options = {}) {
    const needle = String(query ?? "").trim();
    if (!needle) return [];
    const limit = Math.min(Number(options.limit ?? 100), 500);
    const isRegex = Boolean(options.regex);
    const contextLines = Math.min(Number(options.contextLines ?? 0), 5);
    const matcher = isRegex ? new RegExp(needle, options.caseSensitive ? "g" : "gi") : null;
    const normalized = options.caseSensitive ? needle : needle.toLowerCase();
    const files = (await this.tree(".", { maxDepth: 12, maxEntries: 5000 })).filter((entry) => entry.type === "file");
    const results = [];
    for (const file of files) {
      if (results.length >= limit) break;
      const extension = path.extname(file.path).toLowerCase();
      if (file.size > 750_000 || (!TEXT_EXTENSIONS.has(extension) && path.basename(file.path) !== "Dockerfile")) continue;
      let content;
      try { content = (await this.read(file.path, { maxBytes: 750_000 })).content; } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length && results.length < limit; index += 1) {
        const haystack = options.caseSensitive ? lines[index] : lines[index].toLowerCase();
        const matched = matcher ? (matcher.lastIndex = 0, matcher.test(lines[index])) : haystack.includes(normalized);
        if (matched) {
          const start = Math.max(0, index - contextLines);
          const end = Math.min(lines.length - 1, index + contextLines);
          const context = [];
          for (let i = start; i <= end; i += 1) {
            context.push({ line: i + 1, content: lines[i], match: i === index });
          }
          results.push({ path: file.path, line: index + 1, preview: lines[index].slice(0, 300), context });
        }
      }
    }
    return results;
  }

  /**
   * Advanced grep with regex, glob filtering, and configurable context.
   * Returns matches with surrounding lines for richer tool output.
   */
  async grep(pattern, options = {}) {
    const regexPattern = String(pattern ?? "");
    if (!regexPattern) return [];
    const maxResults = Math.min(Number(options.maxResults ?? 50), 200);
    const contextBefore = Math.min(Number(options.contextBefore ?? 0), 5);
    const contextAfter = Math.min(Number(options.contextAfter ?? 0), 5);
    const flags = options.caseSensitive ? "g" : "gi";
    let regex;
    try { regex = new RegExp(regexPattern, flags); }
    catch (error) { throw new Error(`Invalid regex: ${error.message}`); }
    const searchPath = options.path || ".";
    const glob = options.glob || null;
    const globRegex = glob ? globToRegex(glob) : null;
    const files = (await this.tree(searchPath, { maxDepth: 12, maxEntries: 5000 })).filter((entry) => entry.type === "file");
    const results = [];
    for (const file of files) {
      if (results.length >= maxResults) break;
      if (globRegex && !globRegex.test(file.path)) continue;
      const extension = path.extname(file.path).toLowerCase();
      if (file.size > 750_000 || (!TEXT_EXTENSIONS.has(extension) && path.basename(file.path) !== "Dockerfile")) continue;
      let content;
      try { content = (await this.read(file.path, { maxBytes: 750_000 })).content; } catch { continue; }
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length && results.length < maxResults; index += 1) {
        regex.lastIndex = 0;
        if (regex.test(lines[index])) {
          const start = Math.max(0, index - contextBefore);
          const end = Math.min(lines.length - 1, index + contextAfter);
          const context = [];
          for (let i = start; i <= end; i += 1) {
            context.push({ line: i + 1, content: lines[i], match: i === index });
          }
          results.push({ path: file.path, line: index + 1, preview: lines[index].slice(0, 300), context });
        }
      }
    }
    return results;
  }

  /**
   * Fetch a URL and return its content. HTML responses are stripped to text
   * unless `asText` is false. Bounded by maxBytes to prevent runaway downloads.
   */
  async fetchUrl(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    if (!/^https?:\/\//.test(url)) throw new Error("Only http(s) URLs are allowed");
    const maxBytes = Math.min(Number(options.maxBytes ?? 500_000), 2_000_000);
    const headers = { "user-agent": "mooncode/5.0.0", ...(options.headers || {}) };
    const init = { method, headers, signal: AbortSignal.timeout(30_000) };
    if (options.body && ["POST", "PUT", "PATCH"].includes(method)) {
      init.body = options.body;
      if (!headers["content-type"]) headers["content-type"] = "application/json";
    }
    const response = await fetch(url, init);
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder().decode(buffer.slice(0, maxBytes));
    const asText = options.asText !== false;
    if (asText && contentType.includes("text/html")) {
      text = htmlToText(text);
    }
    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType,
      bytes: Math.min(buffer.byteLength, maxBytes),
      truncated: buffer.byteLength > maxBytes,
      content: text,
    };
  }

  /**
   * Run the project's test suite. Auto-detects the test runner from
   * package.json scripts, or falls back to `node --test` for `.test.js` files.
   */
  async runTests(options = {}) {
    const timeout = Math.min(Number(options.timeout ?? 60_000), 300_000);
    const pattern = options.pattern;
    // Try to detect the test runner from package.json.
    let command;
    const pkgJsonPath = path.join(this.root, "package.json");
    try {
      const pkg = JSON.parse(await readFile(pkgJsonPath, "utf8"));
      if (pattern && pkg.scripts?.test) {
        command = `npm test -- ${pattern}`;
      } else if (pkg.scripts?.test && pkg.scripts.test !== "echo \"Error: no test specified\" && exit 1") {
        command = "npm test";
      } else if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
        command = pattern ? `npx vitest run ${pattern}` : "npx vitest run";
      } else if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
        command = pattern ? `npx jest ${pattern}` : "npx jest";
      } else {
        // Fall back to node --test on .test.js files.
        const target = pattern || "tests/*.test.js";
        command = `node --test ${target}`;
      }
    } catch {
      // No package.json — use node --test directly.
      command = pattern ? `node --test ${pattern}` : "node --test tests/*.test.js";
    }
    const result = await this.run(command, { timeout, approved: true });
    return { ...result, command, runner: "auto-detected" };
  }

  /**
   * Parse a JS/TS source file and return a summary of its structure:
   * imports, exports, functions, classes, with their line positions.
   *
   * v0.9.1: improved regex coverage for:
   *   - TypeScript generics (`function foo<T>(...)`, `class Foo<T>`)
   *   - Arrow functions without parens (`const f = x => ...`)
   *   - Object methods (`{ foo() {} }`)
   *   - Class fields and methods (`class { bar() {} baz = 1 }`)
   *   - Decorators (`@Component class Foo {}`)
   *   - TypeScript type-only imports/exports (`import type`, `export type`)
   *   - Multi-specifier imports (`import { a, b as c } from "..."`)
   *   - Default + named re-exports (`export { default, name } from "..."`)
   *
   * Still regex-based (no external dependency). For production-grade AST
   * analysis, consider migrating to `acorn` or `@babel/parser` (planned
   * for a future release).
   */
  async parseAST(filePath, options = {}) {
    const file = await this.read(filePath);
    const content = file.content;
    const detail = options.detail || "summary";
    const nodes = [];
    const lines = content.split(/\r?\n/);

    // --- Imports ---
    // Matches: import defaultName from 'mod'
    //          import { a, b as c } from 'mod'
    //          import * as ns from 'mod'
    //          import 'mod'  (side-effect only)
    //          import type { T } from 'mod'  (TypeScript)
    //          const x = require('mod')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const importMatch = line.match(/^\s*import\s+(?:type\s+)?(?:([^;]+?)\s+from\s+)?['"]([^'"]+)['"]\s*;?/);
      if (importMatch) {
        nodes.push({ type: "import", line: i + 1, source: importMatch[2], specifiers: importMatch[1]?.trim() || null });
        continue;
      }
      const requireMatch = line.match(/(?:const|let|var)\s+(\{[^}]+\}|\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        nodes.push({ type: "import", line: i + 1, source: requireMatch[2], specifiers: requireMatch[1].trim() });
      }
    }

    // --- Exports ---
    // Matches: export default ...
    //          export const/let/var/function/class/async function ...
    //          export type { T }  (TypeScript)
    //          export { a, b } [from '...']
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const defaultExport = line.match(/^\s*export\s+default\s+(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|(\w+))?/);
      if (defaultExport) {
        nodes.push({ type: "export", line: i + 1, kind: "default", name: defaultExport[1] || defaultExport[2] || defaultExport[3] || "anonymous" });
        continue;
      }
      const namedExport = line.match(/^\s*export\s+(?:type\s+)?(?:const|let|var|function|async\s+function|class|abstract\s+class|enum|interface)\s+(\w+)/);
      if (namedExport) {
        nodes.push({ type: "export", line: i + 1, kind: "named", name: namedExport[1] });
        continue;
      }
      // Re-export: export { a, b } from 'mod'
      const reExport = line.match(/^\s*export\s+\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?/);
      if (reExport) {
        const names = reExport[1].split(",").map((s) => s.trim()).filter(Boolean);
        for (const name of names) {
          nodes.push({ type: "export", line: i + 1, kind: "re-export", name: name.replace(/\s+as\s+.+$/, ""), source: reExport[2] || null });
        }
      }
    }

    // --- Functions ---
    // Matches: function name(params) {
    //          async function name(params) {
    //          function name<T>(params) {  (TypeScript generic)
    //          const name = (params) => {  (arrow with parens)
    //          const name = async (params) => {
    //          const name = x => ...  (arrow without parens)
    //          const name = async x => ...
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Function declaration (with optional TypeScript generic <T>)
      const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/);
      if (funcMatch) {
        nodes.push({
          type: "function", line: i + 1, name: funcMatch[1],
          params: detail === "full" ? funcMatch[2].split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        });
        continue;
      }
      // Arrow function with parens: const name = (params) => {
      const arrowMatch = line.match(/(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
      if (arrowMatch) {
        nodes.push({
          type: "function", line: i + 1, name: arrowMatch[1], kind: "arrow",
          params: detail === "full" ? arrowMatch[2].split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        });
        continue;
      }
      // Arrow function without parens: const name = x => {
      const arrowNoParens = line.match(/(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(\w+)\s*=>/);
      if (arrowNoParens) {
        nodes.push({
          type: "function", line: i + 1, name: arrowNoParens[1], kind: "arrow",
          params: detail === "full" ? [arrowNoParens[2]] : undefined,
        });
      }
    }

    // --- Classes ---
    // Matches: class Name { ... }
    //          abstract class Name { ... }
    //          class Name<T> extends Base<T> { ... }  (TypeScript)
    //          @Decorator class Name { ... }
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Skip decorator-only lines (we still capture the class on its line).
      const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s*<[^>]+>)?(?:\s+extends\s+([\w.]+)(?:\s*<[^>]+>)?)?(?:\s+implements\s+[\w.,\s<>]+)?/);
      if (classMatch) {
        nodes.push({ type: "class", line: i + 1, name: classMatch[1], extends: classMatch[2] || null });
        continue;
      }
      // Class methods: method(params) {  or  async method(params) {
      //   or  abstract method(params): T;  or  get/set/static method() {
      // This is a heuristic — it may match object literals too. We only treat
      // indented lines as methods to reduce false positives.
      const methodMatch = line.match(/^\s+(?:async\s+|get\s+|set\s+|static\s+|abstract\s+|public\s+|private\s+|protected\s+|readonly\s+)*(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{;]+)?[{\n;]/);
      if (methodMatch && !methodMatch[1].match(/^(if|for|while|switch|catch|return|throw|new|typeof|void|delete|in|of|do|else|constructor|class|function|super|import|export)$/)) {
        nodes.push({
          type: "method", line: i + 1, name: methodMatch[1],
          params: detail === "full" ? methodMatch[2].split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        });
      }
    }

    return {
      path: filePath,
      bytes: file.size,
      lines: lines.length,
      nodes: nodes.sort((a, b) => a.line - b.line),
      summary: {
        imports: nodes.filter((n) => n.type === "import").length,
        exports: nodes.filter((n) => n.type === "export").length,
        functions: nodes.filter((n) => n.type === "function").length,
        classes: nodes.filter((n) => n.type === "class").length,
        methods: nodes.filter((n) => n.type === "method").length,
      },
    };
  }

  async run(command, options = {}) {
    const classification = classifyCommand(command);
    if (classification.risk === Risk.BLOCKED) throw new Error(classification.reason);
    if (classification.risk !== Risk.OBSERVE && !options.approved) {
      return { approvalRequired: true, command, ...classification };
    }
    const timeout = Math.min(Number(options.timeout ?? 30_000), 120_000);
    return new Promise((resolve, reject) => {
      const child = spawn(command, { cwd: this.root, shell: true, env: { ...process.env, MOONCODE_AGENT: "1" } });
      let stdout = "";
      let stderr = "";
      let truncated = false;
      const append = (current, chunk) => {
        const next = current + chunk.toString("utf8");
        if (next.length <= 250_000) return next;
        truncated = true;
        return next.slice(0, 250_000);
      };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        resolve({ command, code, signal, stdout, stderr, truncated });
      });
    });
  }

  async exists(relative) {
    try { await access(this.resolve(relative), constants.F_OK); return true; }
    catch (error) {
      // v0.9.1: ENOENT is the expected "does not exist" case. Other errors
      // (EACCES, EBUSY) should ideally be surfaced, but exists() must never
      // throw — callers rely on a boolean. Log to stderr for visibility.
      if (error?.code !== "ENOENT") console.warn(`[mooncode] exists(${relative}) failed: ${error.message}`);
      return false;
    }
  }
}
