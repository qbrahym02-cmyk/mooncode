import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".jsonc", ".md", ".markdown", ".css", ".scss", ".html", ".yml", ".yaml", ".toml", ".xml"]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES_PER_RUN = 50;

/**
 * AutoFix detects and repairs common issues in source files without external
 * dependencies. Each fixer is a pure function that takes file content and
 * returns fixed content plus a list of applied changes. When ESLint or
 * Prettier binaries are available in the workspace, they are invoked too.
 *
 * All fixes are applied atomically: if verification fails after a fix, the
 * original content is restored.
 */
export class AutoFix {
  constructor(workspaceRoot) {
    this.root = path.resolve(workspaceRoot);
  }

  async fix(targetPath, options = {}) {
    const target = path.resolve(this.root, targetPath);
    if (!target.startsWith(this.root)) throw new Error("Path escapes the workspace");
    const info = await stat(target);
    if (info.isDirectory()) return this.#fixDirectory(target, options);
    return this.#fixFile(target, options);
  }

  async #fixDirectory(dir, options) {
    const files = await this.#collectFiles(dir);
    const results = [];
    for (const file of files.slice(0, MAX_FILES_PER_RUN)) {
      const result = await this.#fixFile(file, options).catch((error) => ({ path: file, error: error.message }));
      results.push(result);
    }
    return {
      directory: path.relative(this.root, dir),
      filesScanned: files.length,
      filesFixed: results.filter((r) => r.fixed).length,
      results,
    };
  }

  async #collectFiles(dir) {
    const output = [];
    const walk = async (folder) => {
      const entries = await readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "out", "target", ".cache", ".mooncode"].includes(entry.name)) continue;
        const abs = path.join(folder, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else {
          const ext = path.extname(entry.name).toLowerCase();
          if (TEXT_EXTENSIONS.has(ext)) {
            const info = await stat(abs);
            if (info.size <= MAX_FILE_BYTES) output.push(abs);
          }
        }
      }
    };
    await walk(dir);
    return output;
  }

  async #fixFile(absolutePath, options) {
    const relPath = path.relative(this.root, absolutePath);
    const original = await readFile(absolutePath, "utf8");
    const ext = path.extname(absolutePath).toLowerCase();
    const fixers = options.fixers || this.#pickFixers(ext);
    const changes = [];
    let content = original;

    // Apply each enabled fixer in sequence.
    for (const fixerName of fixers) {
      const fixer = FIXERS[fixerName];
      if (!fixer) continue;
      if (fixer.applies && !fixer.applies(ext, content)) continue;
      const result = fixer.fix(content, { filePath: absolutePath });
      if (result.changed) {
        changes.push({ fixer: fixerName, description: result.description });
        content = result.content;
      }
    }

    // If ESLint or Prettier is installed, delegate to them for deeper fixes.
    if (fixers.includes("eslint") && ext.match(/^\.(js|mjs|cjs|ts|tsx|jsx)$/)) {
      const eslintResult = await this.#runEslint(absolutePath, options.dryRun);
      if (eslintResult.fixed) {
        changes.push({ fixer: "eslint", description: eslintResult.output || "ESLint auto-fixes applied" });
        content = await readFile(absolutePath, "utf8");
      }
    }
    if (fixers.includes("prettier") && TEXT_EXTENSIONS.has(ext)) {
      const prettierResult = await this.#runPrettier(absolutePath);
      if (prettierResult.changed) {
        changes.push({ fixer: "prettier", description: "Prettier formatting applied" });
        content = prettierResult.content;
      }
    }

    if (!changes.length) {
      return { path: relPath, fixed: false, reason: "no_issues_found" };
    }
    if (options.dryRun) {
      return { path: relPath, fixed: false, wouldFix: true, changes };
    }

    // Write the fixed content.
    const tmp = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, content, "utf8");
    const { rename } = await import("node:fs/promises");
    await rename(tmp, absolutePath);

    // Verify: run `node --check` for JS/TS files to ensure we didn't break syntax.
    let verified = true;
    let verifyError = null;
    if (options.verify !== false && ext.match(/^\.(js|mjs|cjs)$/)) {
      const check = await this.#runCommand(process.execPath, ["--check", absolutePath], this.root);
      if (!check.ok) {
        verified = false;
        verifyError = check.stderr || check.stdout;
        // Roll back to the original content.
        await writeFile(absolutePath, original, "utf8");
        changes.push({ fixer: "rollback", description: "Rolled back: verification failed" });
      }
    }

    return { path: relPath, fixed: true, changes, verified, verifyError, bytesBefore: Buffer.byteLength(original), bytesAfter: Buffer.byteLength(content) };
  }

  #pickFixers(ext) {
    const fixers = [];
    if (ext.match(/^\.(js|mjs|cjs|ts|tsx|jsx)$/)) fixers.push("trailing-newline", "tabs-to-spaces", "eslint", "prettier");
    else if (ext === ".json") fixers.push("json", "trailing-newline");
    else if (ext.match(/^\.(md|markdown)$/)) fixers.push("trailing-newline", "prettier");
    else if (TEXT_EXTENSIONS.has(ext)) fixers.push("trailing-newline", "tabs-to-spaces");
    return fixers;
  }

  async #runEslint(filePath, dryRun) {
    // Check if eslint is available locally.
    const eslintBin = path.join(this.root, "node_modules", ".bin", "eslint");
    try { await stat(eslintBin); }
    catch (error) {
      // v0.9.1: ENOENT is expected (ESLint not installed); log others.
      if (error?.code !== "ENOENT") console.warn(`[mooncode] autofix: stat(eslint) failed: ${error.message}`);
      return { fixed: false };
    }
    const args = ["--fix", "--format", "json", filePath];
    if (dryRun) args.splice(1, 1, "--dry-run");
    const result = await this.#runCommand(eslintBin, args, this.root);
    if (!result.ok && result.code !== 0 && result.code !== 1) return { fixed: false, error: result.stderr };
    try {
      const data = JSON.parse(result.stdout);
      const file = Array.isArray(data) ? data[0] : null;
      if (file && file.output) return { fixed: true, output: `${file.messages?.length || 0} messages` };
      if (file && file.errorCount === 0) return { fixed: false };
    } catch (error) {
      // v0.9.1: ESLint output was not valid JSON. Log to help debugging instead
      // of silently returning "no fixes". This usually means ESLint crashed or
      // the config is broken.
      console.warn(`[mooncode] autofix: ESLint output was not valid JSON: ${error.message}`);
    }
    return { fixed: false };
  }

  async #runPrettier(filePath) {
    const prettierBin = path.join(this.root, "node_modules", ".bin", "prettier");
    try { await stat(prettierBin); }
    catch (error) {
      // v0.9.1: ENOENT is expected (Prettier not installed); log others.
      if (error?.code !== "ENOENT") console.warn(`[mooncode] autofix: stat(prettier) failed: ${error.message}`);
      return { changed: false };
    }
    const result = await this.#runCommand(prettierBin, ["--write", "--log-level", "error", filePath], this.root);
    if (!result.ok) return { changed: false };
    const after = await readFile(filePath, "utf8");
    return { changed: true, content: after };
  }

  #runCommand(command, args, cwd) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
      child.once("error", () => resolve({ ok: false, stdout, stderr: stderr || "spawn failed", code: -1 }));
      child.once("close", (code) => resolve({ ok: code === 0, stdout, stderr, code }));
    });
  }
}

/**
 * Built-in fixers. Each is a pure function: input content -> output content +
 * a human-readable description of what changed. No fixer depends on an
 * external binary; ESLint/Prettier integration happens in the AutoFix class.
 */
export const FIXERS = {
  "trailing-newline": {
    fix(content) {
      if (content.endsWith("\n")) return { changed: false };
      return { changed: true, content: `${content}\n`, description: "Added trailing newline" };
    },
  },
  "tabs-to-spaces": {
    applies(ext) { return [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".scss", ".yml", ".yaml", ".json"].includes(ext); },
    fix(content) {
      if (!content.includes("\t")) return { changed: false };
      const fixed = content.replaceAll("\t", "  ");
      return { changed: true, content: fixed, description: "Converted tabs to 2 spaces" };
    },
  },
  json: {
    applies(ext) { return [".json", ".jsonc"].includes(ext); },
    fix(content) {
      try {
        const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        const parsed = JSON.parse(stripped);
        const pretty = JSON.stringify(parsed, null, 2);
        if (pretty === content.trim() + "\n") return { changed: false };
        return { changed: true, content: `${pretty}\n`, description: "Pretty-printed JSON with 2-space indent" };
      } catch (error) {
        return { changed: false };
      }
    },
  },
};

/**
 * Error pattern matcher: scans a command's stderr/stdout for known error
 * patterns and returns actionable hints the agent can use to self-correct.
 *
 * Patterns are intentionally flexible — they match with or without quotes,
 * with different capitalizations, and across line boundaries.
 */
export const ERROR_PATTERNS = [
  {
    pattern: /(?:Cannot find|could not find|cannot resolve|can't resolve|can not resolve)\s+(?:module\s+)?['"]?([a-z0-9@_\-/.]+)['"]?/i,
    fix: "Install the missing package: `npm install $1` or check the import path.",
    category: "missing_dependency",
  },
  {
    pattern: /SyntaxError:\s*(?:Unexpected token|Unexpected identifier)\s*['"]?([^\s'"]+)?['"]?/i,
    fix: "Check for unmatched brackets, missing commas, or invalid syntax near the token.",
    category: "syntax_error",
  },
  {
    pattern: /TypeError:\s*(\w+)\s+is not a function/i,
    fix: "Verify the function exists on the object. It may be undefined or misnamed.",
    category: "type_error",
  },
  {
    pattern: /ReferenceError:\s*(\w+)\s+is not defined/i,
    fix: "The variable is not in scope. Check the spelling or add an import/declaration.",
    category: "reference_error",
  },
  {
    pattern: /ENOENT:\s*no such file or directory,?\s*(?:open|stat|access)\s*['"]?([^'"\n]+)['"]?/i,
    fix: "The file does not exist. Create it or fix the path: $1",
    category: "missing_file",
  },
  {
    pattern: /(?:EACCES|EPERM).*permission denied|Permission denied/i,
    fix: "Check file permissions. You may need to chmod or run with appropriate privileges.",
    category: "permission",
  },
  {
    pattern: /(?:EADDRINUSE|listen).*port (\d+)|Port (\d+)(?:\s+is)?\s+already in use|address already in use.*[:\s](\d+)/i,
    fix: "Another process is using the port. Kill it or use a different port: $1$2$3",
    category: "port_conflict",
  },
  {
    pattern: /(\d+)\s+(?:failing|failed)\s*(?:test|spec)s?|test[s]?\s+failed:\s*(\d+)\s+failing/i,
    fix: "$1$2 test(s) failed. Read the failure output above for details and fix the broken assertions.",
    category: "test_failure",
  },
  {
    pattern: /(?:npm ERR!|yarn error|pnpm).*404\s+Not Found\s*-\s*(\S+)/i,
    fix: "Package not found in registry: $1. Check the name or use a different registry.",
    category: "package_not_found",
  },
  {
    pattern: /(?:sh:|command not found:)\s*(\w+)/i,
    fix: "Command not found: $1. Install it or check your PATH.",
    category: "command_not_found",
  },
  {
    pattern: /(?:ECONNREFUSED|connect ECONNREFUSED).*?(\d+\.\d+\.\d+\.\d+)?[:\s]*(\d+)/i,
    fix: "Connection refused to $1:$2. Is the server running?",
    category: "connection_refused",
  },
  {
    pattern: /(?:timeout|ETIMEDOUT)\s+(?:after\s+\d+\s*ms)?/i,
    fix: "Operation timed out. The server may be slow or unreachable. Increase the timeout or retry.",
    category: "timeout",
  },
  {
    pattern: /(?:out of memory|Allocation failed|JavaScript heap)/i,
    fix: "Out of memory. Reduce the input size or increase Node's heap with --max-old-space-size=4096.",
    category: "out_of_memory",
  },
];

export function diagnoseError(output) {
  const text = String(output);
  const matches = [];
  for (const entry of ERROR_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match) {
      // Substitute all capture groups ($1, $2, $3) into the fix template.
      let fix = entry.fix;
      for (let i = 1; i <= 3; i += 1) {
        fix = fix.replaceAll(`$${i}`, match[i] || "");
      }
      matches.push({
        category: entry.category,
        fix,
        match: match[0].slice(0, 200),
      });
    }
  }
  return matches;
}
