import { writeFile, readFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";

const MAX_ENTRIES = 10_000;

/**
 * Persistent audit log for security-sensitive operations: file writes,
 * command execution, plugin installs, approvals, workspace switches, etc.
 *
 * Every entry is immutable and timestamped. The log is stored as NDJSON at
 * `.zetora/audit.log` so it can be inspected with standard tools (grep, jq).
 */
export class AuditLog {
  constructor(dataRoot) {
    this.logPath = path.join(path.resolve(dataRoot), "audit.ndjson");
    this.buffer = [];
    this.flushTimer = null;
    this.maxBuffer = 50; // flush after 50 entries or 2s
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
