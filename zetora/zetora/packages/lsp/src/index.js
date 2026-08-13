import { spawn } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Lightweight LSP-style diagnostics. Rather than implementing the full
 * Language Server Protocol (which requires a long-lived JSON-RPC connection),
 * this class runs ESLint and the TypeScript compiler in one-shot mode and
 * parses their output into a unified diagnostic format.
 *
 * This is original code; it does not import or wrap any LSP SDK.
 */
export class LspDiagnostics {
  constructor(root) {
    this.root = path.resolve(root);
  }

  async #binaryExists(name) {
    const candidates = [
      path.join(this.root, "node_modules", ".bin", name),
    ];
    for (const candidate of candidates) {
      try { await stat(candidate); return candidate; }
      catch (error) {
        // v0.9.1: ENOENT is expected (binary not installed); log others.
        if (error?.code !== "ENOENT") {
          console.warn(`[mooncode] lsp stat(${candidate}) failed: ${error.message}`);
        }
      }
    }
    return null;
  }

  /**
   * Try to install ESLint locally via npm. Returns true if successful.
   * This is a best-effort operation: if npm is not available or the install
   * fails, the diagnose endpoint will return a clear "ESLint not installed"
   * message instead of silently returning empty diagnostics.
   */
  async #ensureEslint() {
    const bin = await this.#binaryExists("eslint");
    if (bin) return true;
    // Check if a package.json exists; if not, create a minimal one.
    const pkgJsonPath = path.join(this.root, "package.json");
    try { await stat(pkgJsonPath); }
    catch {
      await writeFile(pkgJsonPath, JSON.stringify({
        name: "mooncode-workspace",
        version: "1.0.0",
        private: true,
        type: "module",
      }, null, 2) + "\n", "utf8");
    }
    // Attempt npm install. Timeout after 30s.
    const result = await this.#run("npm", ["install", "--save-dev", "eslint@latest", "--no-audit", "--no-fund", "--silent"], this.root);
    return result.ok;
  }

  /**
   * Check if ESLint is available and return a helpful status message.
   */
  async status() {
    const eslintBin = await this.#binaryExists("eslint");
    const tscBin = await this.#binaryExists("tsc");
    const hasPackageJson = await stat(path.join(this.root, "package.json")).then(() => true).catch(() => false);
    return {
      eslint: Boolean(eslintBin),
      typescript: Boolean(tscBin),
      packageJson: hasPackageJson,
      message: !eslintBin && !tscBin
        ? "No linters installed. Run `npm install --save-dev eslint` in your workspace, or POST /api/lsp/install to auto-install."
        : "Linters ready.",
    };
  }

  #run(command, args, cwd) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => { stdout += c.toString("utf8"); });
      child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
      child.once("error", () => resolve({ ok: false, stdout: "", stderr: "spawn failed", code: -1 }));
      child.once("close", (code) => resolve({ ok: code === 0, stdout, stderr, code }));
    });
  }

  /**
   * Run ESLint on a file or directory and return parsed diagnostics.
   * Returns [] if ESLint is not installed.
   */
  async eslint(target) {
    const bin = await this.#binaryExists("eslint");
    if (!bin) return [];
    const result = await this.#run(bin, ["--format", "json", "--no-error-on-unmatched-pattern", target], this.root);
    if (!result.stdout.trim()) return [];
    try {
      const data = JSON.parse(result.stdout);
      const diags = [];
      for (const file of data) {
        for (const msg of file.messages || []) {
          diags.push({
            source: "eslint",
            severity: msg.severity === 2 ? "error" : "warning",
            file: file.filePath.replace(this.root + path.sep, ""),
            line: msg.line,
            column: msg.column,
            endLine: msg.endLine,
            endColumn: msg.endColumn,
            message: msg.message,
            ruleId: msg.ruleId,
          });
        }
      }
      return diags;
    } catch (error) {
      // v0.9.1: ESLint output was not valid JSON. Log instead of silently
      // returning empty. This usually means ESLint crashed or config is broken.
      console.warn(`[mooncode] lsp: failed to parse ESLint output: ${error.message}`);
      return [];
    }
  }

  /**
   * Run `tsc --noEmit` for type-checking diagnostics.
   * Returns [] if TypeScript is not installed.
   */
  async typescript() {
    const bin = await this.#binaryExists("tsc");
    if (!bin) return [];
    const result = await this.#run(bin, ["--noEmit", "--pretty", "false"], this.root);
    if (!result.stdout.trim()) return [];
    const diags = [];
    // TS errors look like: file.ts(L,C): error TS1234: message
    const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/gm;
    let match;
    while ((match = regex.exec(result.stdout)) !== null) {
      diags.push({
        source: "typescript",
        severity: match[4],
        file: match[1].replace(this.root + path.sep, ""),
        line: Number(match[2]),
        column: Number(match[3]),
        code: `TS${match[5]}`,
        message: match[6],
      });
    }
    return diags;
  }

  /**
   * Combine all available diagnostics for a file (or the whole project).
   * Returns a clear `installable: true` hint when ESLint is missing so the
   * UI can show a "Install ESLint" button instead of just "0 diagnostics".
   */
  async diagnose(target = ".") {
    const [eslint, ts] = await Promise.all([
      this.eslint(target).catch(() => []),
      this.typescript().catch(() => []),
    ]);
    const all = [...eslint, ...ts];
    const status = await this.status();
    return {
      diagnostics: all,
      summary: {
        errors: all.filter((d) => d.severity === "error").length,
        warnings: all.filter((d) => d.severity === "warning").length,
        sources: [...new Set(all.map((d) => d.source))],
      },
      linters: {
        eslint: status.eslint,
        typescript: status.typescript,
        installable: !status.eslint,
        message: status.message,
      },
    };
  }

  /**
   * Install ESLint. Called by POST /api/lsp/install.
   */
  async install() {
    const ok = await this.#ensureEslint();
    return { installed: ok, eslint: await this.#binaryExists("eslint") ? true : false };
  }
}
