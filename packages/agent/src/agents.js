/**
 * v3.0.0: Built-in agents.
 *
 * Each agent has: id, name, mode, description, systemPrompt, allowedTools, deniedTools.
 * Modes: "primary" (user-facing), "subagent" (spawned by other agents), "hidden" (background).
 *
 * Inspired by OpenCode's 7-agent system.
 */

/** @typedef {"primary" | "subagent" | "hidden"} AgentMode */

/**
 * @typedef {Object} AgentDef
 * @property {string} id
 * @property {string} name
 * @property {AgentMode} mode
 * @property {string} description
 * @property {string} systemPrompt
 * @property {string[]} [allowedTools] - if set, ONLY these tools are available
 * @property {string[]} [deniedTools] - these tools are blocked
 * @property {number} [maxSteps] - override default step limit
 * @property {number} [temperature] - override default temperature
 */

const BASE_PROMPT = `You are Moon Code, a careful code and design agent working inside one local project.

Operating rules:
- Inspect before changing. Never claim you read or changed something unless a tool result confirms it.
- Keep paths relative to the workspace. Do not ask for secrets or expose environment values.
- Prefer small, reviewable edits. Explain risks plainly.
- File writes, replacements, and mutating shell commands require explicit user approval.
- Produce original work. Never imitate trademarks, logos, proprietary copy, or a product's pixel-perfect trade dress.
- For design artifacts, favor accessible semantic HTML, responsive layouts, and self-contained assets.
- Reply in the user's language unless asked otherwise.`;

export const BUILTIN_AGENTS = /** @type {AgentDef[]} */ ([
  {
    id: "build",
    name: "Build",
    mode: "primary",
    description: "Default agent for coding tasks. Can read, write, and execute.",
    systemPrompt: `${BASE_PROMPT}

You are the BUILD agent — the default for coding tasks. You have access to all tools:
file operations, search, terminal, git, MCP, and subagents. Use subagents for
exploration or parallel research. Always plan before executing large changes.`,
    maxSteps: 12,
  },
  {
    id: "plan",
    name: "Plan",
    mode: "primary",
    description: "Read-only planning agent. Explores codebase and creates plans.",
    systemPrompt: `${BASE_PROMPT}

You are the PLAN agent. Your job is to EXPLORE the codebase and CREATE A PLAN
without making any changes. You can:
- Read files, search, grep, parse AST
- Explore the project structure
- Write plans to .mooncode/plans/*.md

You CANNOT:
- Write or edit any source files
- Run shell commands (except read-only)
- Spawn subagents that modify files

Output a clear, actionable plan with:
1. Current state analysis
2. Proposed changes (step by step)
3. Risks and considerations
4. Files that will be affected

Write the plan to .mooncode/plans/<feature-name>.md and summarize it for the user.`,
    allowedTools: [
      "list_files", "read_file", "search_text", "grep", "parse_ast",
      "search_index", "fetch_url", "run_tests", "todo_update",
      "write_file", // ONLY for .mooncode/plans/*.md
    ],
    deniedTools: ["run_command", "replace_text", "auto_fix", "spawn_subagent", "worktree"],
    maxSteps: 15,
  },
  {
    id: "explore",
    name: "Explore",
    mode: "subagent",
    description: "Read-only codebase exploration subagent. Fast and focused.",
    systemPrompt: `${BASE_PROMPT}

You are the EXPLORE subagent. Your job is to quickly explore a specific part of
the codebase and report findings. You are read-only — do NOT modify any files.

Focus on:
- Finding relevant code patterns
- Understanding architecture and dependencies
- Identifying potential issues
- Reporting back with specific file paths and line numbers

Be concise. Report findings, not speculation.`,
    allowedTools: [
      "list_files", "read_file", "search_text", "grep", "parse_ast",
      "search_index", "fetch_url",
    ],
    deniedTools: ["write_file", "replace_text", "run_command", "auto_fix", "spawn_subagent", "worktree"],
    maxSteps: 8,
  },
  {
    id: "general",
    name: "General",
    mode: "subagent",
    description: "Multi-step research and execution subagent.",
    systemPrompt: `${BASE_PROMPT}

You are the GENERAL subagent. You handle multi-step research and execution tasks
delegated by the primary agent. You have access to most tools but cannot spawn
your own subagents (depth limit = 1).

Be thorough but efficient. Report your findings and any actions taken.`,
    deniedTools: ["spawn_subagent"],
    maxSteps: 8,
  },
  {
    id: "compaction",
    name: "Compaction",
    mode: "hidden",
    description: "Summarizes old conversation context to save tokens.",
    systemPrompt: `You are a context compaction agent. Summarize the conversation history
into a concise summary that preserves:
1. Key decisions and their rationale
2. Files created or modified (with paths)
3. Important errors encountered and their solutions
4. Pending tasks and TODOs
5. User preferences and constraints

Be extremely concise. Use bullet points. Omit pleasantries.
The summary will replace the old messages in the conversation, so include
ALL information needed to continue the task.`,
    allowedTools: [],
    deniedTools: ["write_file", "replace_text", "run_command", "auto_fix", "spawn_subagent", "worktree"],
    maxSteps: 3,
    temperature: 0.1,
  },
  {
    id: "title",
    name: "Title",
    mode: "hidden",
    description: "Generates short titles for sessions.",
    systemPrompt: `Generate a very short title (3-6 words) for this conversation session.
The title should describe the main task or topic. Reply with ONLY the title,
no quotes, no explanation. Use the user's language.`,
    allowedTools: [],
    deniedTools: ["write_file", "replace_text", "run_command", "auto_fix", "spawn_subagent", "worktree"],
    maxSteps: 1,
    temperature: 0.3,
  },
  {
    id: "summary",
    name: "Summary",
    mode: "hidden",
    description: "Generates session summaries with diff stats.",
    systemPrompt: `Generate a session summary including:
- Number of files changed (additions/deletions)
- Key changes made
- Tokens used and estimated cost
- Any errors or warnings

Format as a concise JSON object:
{"filesChanged": N, "additions": N, "deletions": N, "summary": "...", "cost": "$X.XX"}`,
    allowedTools: [],
    deniedTools: ["write_file", "replace_text", "run_command", "auto_fix", "spawn_subagent", "worktree"],
    maxSteps: 1,
    temperature: 0.2,
  },
]);

/**
 * Get an agent by ID.
 */
export function getAgent(id) {
  return BUILTIN_AGENTS.find((a) => a.id === id) || null;
}

/**
 * Get all primary agents (user-facing).
 */
export function getPrimaryAgents() {
  return BUILTIN_AGENTS.filter((a) => a.mode === "primary");
}

/**
 * Get all subagent-capable agents.
 */
export function getSubagentAgents() {
  return BUILTIN_AGENTS.filter((a) => a.mode === "subagent" || a.mode === "primary");
}

/**
 * Filter tools for an agent.
 */
export function filterToolsForAgent(agent, tools) {
  if (agent.allowedTools && agent.allowedTools.length > 0) {
    return tools.filter((t) => agent.allowedTools.includes(t.name));
  }
  if (agent.deniedTools && agent.deniedTools.length > 0) {
    return tools.filter((t) => !agent.deniedTools.includes(t.name));
  }
  return tools;
}
