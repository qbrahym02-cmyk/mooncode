import { writeFile, readFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

const MAX_ENTRIES = 10_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per log file before rotation
const MAX_ROTATED_FILES = 5; // keep up to 5 rotated files (audit.ndjson.1 .. .5)

/**
 * Persistent audit log for security-sensitive operations: file writes,
 * command execution, plugin installs, approvals, workspace switches, etc.
 *
 * Every entry is immutable and timestamped. The log is stored as NDJSON at
 * `.mooncode/audit.log` so it can be inspected with standard tools (grep, jq).
 *
 * v0.9.1: added log rotation. When the log file exceeds `maxBytes` (default
 * 10MB), it is renamed to `audit.ndjson.1` and a new file is started. Up to
 * `maxRotatedFiles` rotated copies are kept; older ones are deleted. This
 * prevents unbounded growth on long-running deployments.
 */
export class AuditLog {
  constructor(dataRoot, options = {}) {
    this.logPath = path.join(path.resolve(dataRoot), "audit.ndjson");
    this.buffer = [];
    this.flushTimer = null;
    this.maxBuffer = 50; // flush after 50 entries or 2s
    this.maxBytes = Number(options.maxBytes ?? DEFAULT_MAX_BYTES);
    this.maxRotatedFiles = Number(options.maxRotatedFiles ?? MAX_ROTATED_FILES);
    this.lastRotationCheck = 0;
  }

  async #ensure() {
    await mkdir(path.dirname(this.logPath), { recursive: true });
  }

  async record(entry) {
    await this.#ensure();
    const record = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...entry,
    };
    this.buffer.push(record);
    if (this.buffer.length >= this.maxBuffer) {
      await this.#flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => { this.#flush(); this.flushTimer = null; }, 2000).unref();
    }
    return record;
  }

  async #flush() {
    if (!this.buffer.length) return;
    const entries = this.buffer.splice(0);
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await this.#ensure();
    await writeFile(this.logPath, lines, { flag: "a" });
    // v0.9.1: check rotation at most once per second to avoid stat() spam.
    const now = Date.now();
    if (now - this.lastRotationCheck > 1000) {
      this.lastRotationCheck = now;
      await this.#maybeRotate().catch(() => {});
    }
  }

  /**
   * Rotate the log file if it exceeds maxBytes. Renames the current file to
   * `audit.ndjson.1`, shifts older rotations (`.1` → `.2`, etc.), and deletes
   * files beyond maxRotatedFiles. Errors are non-fatal — a failed rotation
   * must never prevent audit logging.
   */
  async #maybeRotate() {
    let info;
    try { info = await stat(this.logPath); }
    catch (error) { if (error?.code === "ENOENT") return; throw error; }
    if (info.size < this.maxBytes) return;
    // Shift existing rotations: .4 → .5, .3 → .4, ... .1 → .2
    for (let i = this.maxRotatedFiles - 1; i >= 1; i -= 1) {
      const from = `${this.logPath}.${i}`;
      const to = `${this.logPath}.${i + 1}`;
      try {
        await rename(from, to);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    // Rotate the current file to .1
    try {
      await rename(this.logPath, `${this.logPath}.1`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  async read(options = {}) {
    await this.#flush();
    try {
      const content = await readFile(this.logPath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      const limit = Number(options.limit ?? 100);
      const offset = Number(options.offset ?? 0);
      const action = options.action;
      const filtered = action ? lines.filter((l) => l.includes(`"action":"${action}"`)) : lines;
      return filtered.slice(-offset - limit, filtered.length - offset).map((l) => JSON.parse(l));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async stats() {
    const entries = await this.read({ limit: MAX_ENTRIES });
    const byAction = {};
    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    }
    return {
      total: entries.length,
      byAction,
      firstAt: entries[0]?.at,
      lastAt: entries[entries.length - 1]?.at,
    };
  }
}
