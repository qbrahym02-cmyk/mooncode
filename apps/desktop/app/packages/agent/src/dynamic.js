/**
 * v3.3.0: Dynamic agent generation + subagent resume + background subagents.
 *
 * Dynamic: generates new agents from natural-language descriptions.
 * Resume: resumes a subagent session by task_id.
 * Background: runs subagents asynchronously without blocking the parent.
 */

import { randomUUID } from "node:crypto";
import { callModel } from "../../providers/src/index.js";
import { BUILTIN_AGENTS } from "./agents.js";

/**
 * Generate a new agent from a natural-language description.
 * Uses the LLM to create a structured agent definition.
 *
 * @param {string} description - "I need an agent that specializes in CSS animations"
 * @param {Object} options - { provider, model, apiKey }
 * @returns {Promise<AgentDef>}
 */
export async function generateAgent(description, options) {
  const prompt = `Based on this description, create a JSON agent definition:
${description}

Return JSON with these fields:
{
  "id": "kebab-case-id",
  "name": "Display Name",
  "description": "One-line description",
  "systemPrompt": "Detailed system prompt for this agent...",
  "allowedTools": ["tool1", "tool2"],
  "maxSteps": 8,
  "temperature": 0.2
}

Only return the JSON, no explanation.`;

  const response = await callModel({
    provider: options.provider || "openai",
    model: options.model || "gpt-4o-mini",
    apiKey: options.apiKey,
  }, {
    messages: [
      { role: "system", content: "You are an agent generator. Create structured agent definitions from descriptions." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    stream: false,
  });

  try {
    const agentDef = JSON.parse(response.text);
    return {
      id: agentDef.id || `custom-${randomUUID().slice(0, 8)}`,
      name: agentDef.name || "Custom Agent",
      mode: "subagent",
      description: agentDef.description || description,
      systemPrompt: agentDef.systemPrompt || `You are a specialized agent: ${description}`,
      allowedTools: agentDef.allowedTools || undefined,
      deniedTools: agentDef.deniedTools || ["spawn_subagent"],
      maxSteps: Math.min(agentDef.maxSteps || 8, 12),
      temperature: agentDef.temperature || 0.2,
      generated: true,
    };
  } catch {
    // Fallback: create a simple agent from the description
    return {
      id: `custom-${randomUUID().slice(0, 8)}`,
      name: "Custom Agent",
      mode: "subagent",
      description,
      systemPrompt: `You are a specialized agent. ${description}`,
      deniedTools: ["spawn_subagent"],
      maxSteps: 8,
      generated: true,
    };
  }
}

// ─── Subagent Resume ────────────────────────────────────────────────────────

/**
 * @typedef {Object} SubagentTask
 * @property {string} id - task ID
 * @property {string} parentId - parent session ID
 * @property {string} subagentId - subagent session ID
 * @property {string} prompt
 * @property {"running" | "completed" | "failed"} status
 * @property {string} [result]
 * @property {number} startedAt
 * @property {number} [completedAt]
 * @property {boolean} background
 */

/** @type {Map<string, SubagentTask>} */
const tasks = new Map();

/**
 * Start a subagent task. Can be foreground (blocking) or background (async).
 */
export function startSubagentTask(parentId, prompt, options = {}) {
  const taskId = randomUUID();
  const subagentId = randomUUID();

  /** @type {SubagentTask} */
  const task = {
    id: taskId,
    parentId,
    subagentId,
    prompt,
    status: "running",
    startedAt: Date.now(),
    background: options.background || false,
  };

  tasks.set(taskId, task);
  return task;
}

/**
 * Resume a subagent task by ID.
 * Returns the task state and any messages from the subagent session.
 */
export function resumeSubagentTask(taskId) {
  const task = tasks.get(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}

/**
 * Complete a subagent task.
 */
export function completeSubagentTask(taskId, result, status = "completed") {
  const task = tasks.get(taskId);
  if (!task) return;
  task.status = status;
  task.result = result;
  task.completedAt = Date.now();
}

/**
 * List all subagent tasks for a parent session.
 */
export function listSubagentTasks(parentId) {
  return [...tasks.values()].filter((t) => t.parentId === parentId);
}

/**
 * List background tasks (for polling).
 */
export function listBackgroundTasks() {
  return [...tasks.values()].filter((t) => t.background && t.status === "running");
}

// ─── Snapshot System ────────────────────────────────────────────────────────

/**
 * v3.3.0: Snapshot system using a separate git object database.
 * Allows message-level revert without affecting the user's git history.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const SNAPSHOT_DIR = path.join(homedir(), ".mooncode", "snapshots");
const MAX_SNAPSHOT_AGE_DAYS = 7;
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export class SnapshotStore {
  constructor(projectId) {
    this.dir = path.join(SNAPSHOT_DIR, projectId || "default");
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  /**
   * Track files before a change — returns a snapshot hash.
   */
  async track(filePaths) {
    const hash = randomUUID().slice(0, 12);
    const snapshotDir = path.join(this.dir, hash);
    mkdirSync(snapshotDir, { recursive: true });

    for (const filePath of filePaths) {
      try {
        const stat = await import("node:fs/promises").then((fs) => fs.stat(filePath));
        if (stat.size > MAX_FILE_SIZE) continue;
        const content = await import("node:fs/promises").then((fs) => fs.readFile(filePath));
        const relPath = path.relative(process.cwd(), filePath);
        const dest = path.join(snapshotDir, relPath);
        await import("node:fs/promises").then((fs) => fs.mkdir(path.dirname(dest), { recursive: true }));
        await import("node:fs/promises").then((fs) => fs.writeFile(dest, content));
      } catch { /* file doesn't exist — new file */ }
    }

    return hash;
  }

  /**
   * Restore files from a snapshot.
   */
  async restore(hash, filePaths) {
    const snapshotDir = path.join(this.dir, hash);
    if (!existsSync(snapshotDir)) throw new Error(`Snapshot not found: ${hash}`);

    for (const filePath of filePaths) {
      const relPath = path.relative(process.cwd(), filePath);
      const src = path.join(snapshotDir, relPath);
      if (existsSync(src)) {
        const content = await import("node:fs/promises").then((fs) => fs.readFile(src));
        await import("node:fs/promises").then((fs) => fs.writeFile(filePath, content));
      }
    }
  }

  /**
   * Prune old snapshots.
   */
  async prune() {
    try {
      const entries = await import("node:fs/promises").then((fs) => fs.readdir(this.dir, { withFileTypes: true }));
      const now = Date.now();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(this.dir, entry.name);
        const stat = await import("node:fs/promises").then((fs) => fs.stat(fullPath));
        if (now - stat.mtimeMs > MAX_SNAPSHOT_AGE_DAYS * 86400000) {
          await import("node:fs/promises").then((fs) => fs.rm(fullPath, { recursive: true, force: true }));
        }
      }
    } catch {}
  }
}
