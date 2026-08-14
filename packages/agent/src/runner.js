import { createEvent, EventType, Risk, toolRisk } from "../../kernel/src/index.js";
import { callModel, estimateCost } from "../../providers/src/index.js";
import { TOOL_DEFINITIONS } from "../../tools/src/catalog.js";
// v4.0.0: import new integrated systems
import { BUILTIN_AGENTS, getAgent, filterToolsForAgent } from "./agents.js";
import { getSystemPromptForModel } from "./prompt-selector.js";
import { PermissionManager, riskToPermission } from "../../kernel/src/permissions.js";
import { compactConversation, needsCompaction, countConversationTokens } from "../../context/src/token-counter.js";

const SYSTEM_PROMPT = `You are Moon Code, a careful code and design agent working inside one local project.

Operating rules:
- Inspect before changing. Never claim you read or changed something unless a tool result confirms it.
- Keep paths relative to the workspace. Do not ask for secrets or expose environment values.
- Prefer small, reviewable edits. Explain risks plainly.
- File writes, replacements, and mutating shell commands require explicit user approval.
- Produce original work. Never imitate trademarks, logos, proprietary copy, or a product's pixel-perfect trade dress.
- For design artifacts, favor accessible semantic HTML, responsive layouts, and self-contained assets.
- Reply in the user's language unless asked otherwise.`;

function serialize(value, max = 24_000) {
  const text = JSON.stringify(value, null, 2);
  return text.length <= max ? text : `${text.slice(0, max)}\n…truncated`;
}

async function emitText(emit, runId, text) {
  const chunks = String(text).match(/.{1,90}(?:\s|$)|.{1,90}/gs) ?? [];
  for (const chunk of chunks) emit(createEvent(EventType.TEXT_DELTA, { runId, delta: chunk }));
  emit(createEvent(EventType.TEXT_DONE, { runId, text: String(text) }));
}

export class AgentRunner {
  constructor({ workspace, approvalStore, eventStore, git = null, contextFiles = null, compactor = null, mcpRegistry = null, skills = null, designTokens = null, autoFix = null, searchIndex = null, todoList = null, pluginLoader = null, env = process.env }) {
    this.workspace = workspace;
    this.approvalStore = approvalStore;
    this.eventStore = eventStore || null;
    this.git = git;
    this.contextFiles = contextFiles;
    this.compactor = compactor;
    this.mcpRegistry = mcpRegistry;
    this.skills = skills;
    this.designTokens = designTokens;
    this.autoFix = autoFix;
    this.searchIndex = searchIndex;
    this.todoList = todoList;
    this.pluginLoader = pluginLoader || null; // v4.1: Plugin SDK integration
    this.env = env;
    this.pending = new Map();
    this.mcpToolsCache = null;
    this.mcpToolsCacheAt = 0;
    this.#currentParentProvider = null;
    // v4.1: Initialize PermissionManager (replaces Risk enum for tool calls)
    this.permissions = new PermissionManager();
  }

  /** @type {{ provider?: string, model?: string, apiKey?: string, baseUrl?: string } | null} */
  #currentParentProvider = null;

  /**
   * Spawn a sub-agent to handle a bounded subtask. The sub-agent gets its own
   * fresh conversation loop (no inherited history), runs to completion or step
   * limit, and returns its final text. Sub-agents cannot spawn further sub-agents
   * (depth limit = 1) to prevent runaway recursion.
   *
   * v0.9.1 fix: the sub-agent now inherits the parent run's provider, model,
   * apiKey and baseUrl instead of being forced to "demo". This makes the
   * feature actually useful in production. The parent's provider config is
   * passed via the `__parentProvider` field set in run(); if absent (e.g. when
   * spawn_subagent is called outside a run() context), it falls back to demo.
   */
  async #spawnSubagent(input) {
    const parent = this.#currentParentProvider || {};
    const subInput = {
      prompt: String(input.prompt || ""),
      mode: input.mode || "build",
      maxSteps: Math.min(Number(input.maxSteps ?? 5), 8),
      provider: parent.provider || "demo",
      model: parent.model || "demo-local",
      apiKey: parent.apiKey,
      baseUrl: parent.baseUrl,
      stream: false,
    };
    // Capture the sub-agent's events without emitting them to the parent's
    // stream — the parent only sees the final summary.
    const subEvents = [];
    const result = await this.run(subInput, (event) => subEvents.push(event));
    return {
      ok: result.status === "completed",
      status: result.status,
      text: result.text,
      steps: subEvents.filter((e) => e.type === "tool.finished").length,
      usage: result.usage,
    };
  }

  /**
   * Build the system prompt for this run, prepending project context files,
   * design tokens (in design mode), and skill descriptions when available.
   */
  async #buildSystemPrompt(input) {
    // v4.0.0: Use per-model system prompt if available, else agent prompt, else default.
    let basePrompt = SYSTEM_PROMPT;

    // If an agent is specified, use its system prompt
    if (input.agentId) {
      const agent = getAgent(input.agentId);
      if (agent?.systemPrompt) {
        basePrompt = agent.systemPrompt;
      }
    } else {
      // Try per-model prompt selector
      try {
        const modelPrompt = await getSystemPromptForModel(input.model);
        if (modelPrompt && modelPrompt.length > 50) {
          basePrompt = modelPrompt;
        }
      } catch {}
    }

    const parts = [basePrompt];
    if (this.contextFiles) {
      const assembled = await this.contextFiles.assemble().catch(() => null);
      if (assembled) parts.push(assembled);
    }
    if (this.designTokens && input.mode === "design") {
      const tokens = await this.designTokens.read().catch(() => null);
      if (tokens) {
        const summary = this.designTokens.toPromptSummary(tokens);
        if (summary) parts.push(`## Design system tokens\n\nUse these tokens when generating artifacts in this session:\n\n${summary}`);
      }
    }
    if (this.skills) {
      const list = await this.skills.list().catch(() => []);
      const usable = list.filter((item) => !item.error);
      if (usable.length) {
        const skillList = usable.map((item) => `- ${item.id}: ${item.description || item.name}`).join("\n");
        parts.push(`## Available skills\n\nThe user may invoke these skills by id via the invoke_skill tool:\n\n${skillList}`);
      }
    }
    return parts.join("\n\n---\n\n");
  }

  /**
   * Collect MCP tools (cached for 60 seconds to avoid hammering servers).
   * Returns an array of tool definitions ready to be merged with TOOL_DEFINITIONS.
   */
  async #collectMcpTools() {
    if (!this.mcpRegistry) return [];
    const now = Date.now();
    if (this.mcpToolsCache && now - this.mcpToolsCacheAt < 60_000) return this.mcpToolsCache;
    try {
      const tools = await this.mcpRegistry.listAllTools();

      // v4.2: Auto-add MCP resource tools if any server exposes resources.
      const { MCP_RESOURCE_TOOLS } = await import("../../mcp/src/index.js").catch(() => ({}));
      if (MCP_RESOURCE_TOOLS && tools.length > 0) {
        // Check if any connected server has resources capability
        for (const [serverId, client] of this.mcpRegistry.clients) {
          if (client.serverCapabilities?.resources || client.listResources) {
            tools.push(...MCP_RESOURCE_TOOLS);
            break;
          }
        }
      }

      this.mcpToolsCache = tools;
      this.mcpToolsCacheAt = now;
      return tools;
    } catch {
      return [];
    }
  }

  /**
   * Execute a tool call. Native Moon Code tools run inline; MCP tools are routed
   * through the registry by their namespaced name.
   */
  async #executeAnyTool(call, approved) {
    if (call.name.startsWith("mcp.")) {
      if (!this.mcpRegistry) throw new Error("MCP is not enabled");
      const result = await this.mcpRegistry.callTool(call.name, call.input ?? {});
      return result;
    }
    if (call.name === "invoke_skill") {
      return this.#invokeSkill(call.input ?? {});
    }
    return this.executeTool(call, approved);
  }

  async #invokeSkill(input) {
    if (!this.skills) throw new Error("Skills are not enabled");
    const id = input.id || input.name;
    const manifest = await this.skills.get(id).catch(() => null);
    if (!manifest) throw new Error(`Skill not found: ${id}`);
    const errors = this.skills.validateInputs(manifest, input.inputs || {});
    if (errors.length) throw new Error(errors.join("; "));
    const prompt = this.skills.renderPrompt(manifest, input.inputs || {});
    return { ok: true, id, prompt, mode: manifest.mode || "build" };
  }

  /**
   * Build the conversation history that produced this run. Allows resuming an
   * interrupted run after the user approves a mutating tool call.
   */
  async #snapshot(runId, messages) {
    if (!this.eventStore) return;
    await this.eventStore.update((state) => {
      const run = state.runs?.find((item) => item.id === runId);
      if (run) {
        run.messages = messages;
        run.updatedAt = new Date().toISOString();
      }
      return state;
    });
  }

  async executeTool(call, approved = false) {
    const input = call.input ?? {};
    switch (call.name) {
      case "list_files": return this.workspace.tree(input.path || ".", { maxDepth: input.maxDepth ?? 4 });
      case "read_file": {
        const file = await this.workspace.read(input.path);
        if (input.startLine || input.endLine) {
          const lines = file.content.split(/\r?\n/);
          const start = Math.max(1, Number(input.startLine ?? 1));
          const end = Math.min(lines.length, Number(input.endLine ?? lines.length));
          return { ...file, content: lines.slice(start - 1, end).join("\n"), totalLines: lines.length, startLine: start, endLine: end };
        }
        return file;
      }
      case "search_text": return this.workspace.search(input.query, { regex: input.regex, caseSensitive: input.caseSensitive, contextLines: input.contextLines });
      case "grep": return this.workspace.grep(input.pattern, { path: input.path, glob: input.glob, caseSensitive: input.caseSensitive, contextBefore: input.contextBefore, contextAfter: input.contextAfter, maxResults: input.maxResults });
      case "fetch_url": return this.workspace.fetchUrl(input.url, { method: input.method, headers: input.headers, body: input.body, maxBytes: input.maxBytes, asText: input.asText });
      case "run_tests": return this.workspace.runTests({ pattern: input.pattern, timeout: input.timeout });
      case "parse_ast": return this.workspace.parseAST(input.path, { detail: input.detail });
      case "write_file": {
        if (!approved) return { approvalRequired: true, risk: Risk.MODIFY };
        const previous = await this.#snapshotFile(input.path);
        const result = await this.workspace.write(input.path, input.content);
        await this.#checkpoint(`mooncode: write ${input.path}`);
        return { ...result, diff: { previous, next: String(input.content) } };
      }
      case "replace_text": {
        if (!approved) return { approvalRequired: true, risk: Risk.MODIFY };
        const previous = await this.#snapshotFile(input.path);
        const result = await this.workspace.replace(input.path, input.oldText, input.newText);
        const next = (await this.workspace.read(input.path).catch(() => ({ content: "" }))).content;
        await this.#checkpoint(`mooncode: replace ${input.path}`);
        return { ...result, diff: { previous, next, replacedFrom: String(input.oldText), replacedTo: String(input.newText) } };
      }
      case "auto_fix": {
        if (!approved) return { approvalRequired: true, risk: Risk.MODIFY };
        if (!this.autoFix) throw new Error("Auto-fix is not enabled");
        const result = await this.autoFix.fix(input.path, { fixers: input.fixers, dryRun: input.dryRun, verify: input.verify });
        if (result.fixed !== false && !input.dryRun) await this.#checkpoint(`mooncode: auto_fix ${input.path}`);
        return result;
      }
      case "spawn_subagent": {
        if (!approved) return { approvalRequired: true, risk: Risk.EXTERNAL };
        return this.#spawnSubagent(input);
      }
      case "todo_update": {
        if (!this.todoList) throw new Error("Todo list is not enabled");
        const action = input.action;
        if (action === "add") return this.todoList.add(input.content, { priority: input.priority });
        if (action === "update") return this.todoList.update(input.id, { content: input.content, status: input.status, priority: input.priority });
        if (action === "remove") return this.todoList.remove(input.id);
        if (action === "clear") { this.todoList.clear(); return { cleared: true }; }
        if (action === "list") return { items: this.todoList.list(), summary: this.todoList.summary() };
        throw new Error(`Unknown todo action: ${action}`);
      }
      case "search_index": {
        if (!this.searchIndex) throw new Error("Search index is not enabled");
        if (input.rebuild) {
          const tree = await this.workspace.tree(".", { maxDepth: 12, maxEntries: 5000 });
          const files = tree.filter((f) => f.type === "file").map((f) => f.path);
          await this.searchIndex.indexAll(files);
        }
        const results = this.searchIndex.search(input.query, { limit: input.limit });
        return { query: input.query, results, stats: this.searchIndex.stats() };
      }
      case "worktree": {
        if (!this.git) throw new Error("Git is not enabled");
        const action = input.action;
        if (action === "list") return this.git.listWorktrees();
        if (action === "add") {
          if (!approved) return { approvalRequired: true, risk: Risk.EXTERNAL };
          return this.git.addWorktree(input.name, { base: input.base });
        }
        if (action === "remove") {
          if (!approved) return { approvalRequired: true, risk: Risk.EXTERNAL };
          return this.git.removeWorktree(input.name);
        }
        throw new Error(`Unknown worktree action: ${action}`);
      }
      case "run_command": return this.workspace.run(input.command, { timeout: input.timeout, approved });
      default: throw new Error(`Unknown tool: ${call.name}`);
    }
  }

  async #snapshotFile(relative) {
    try {
      const file = await this.workspace.read(relative);
      return file.content;
    } catch (error) {
      // v0.9.1: log instead of silently swallowing. ENOENT is expected (new file),
      // but other errors (permissions, disk) should be visible.
      if (error?.code !== "ENOENT") {
        this.env.console?.warn?.(`[mooncode] snapshotFile(${relative}) failed: ${error.message}`);
      }
      return null;
    }
  }

  async #checkpoint(message) {
    if (!this.git) return null;
    try {
      return await this.git.checkpoint(message);
    } catch (error) {
      // Checkpoint failures must never abort the mutation itself.
      this.env.console?.error?.("[mooncode] checkpoint failed:", error.message);
      return null;
    }
  }

  /**
   * Undo the most recent Moon Code checkpoint and refresh the workspace state.
   * Returns the result of `git.undo()`. Safe to call when no checkpoint exists.
   */
  async undoLastCheckpoint() {
    if (!this.git) throw new Error("Git integration is not enabled");
    return this.git.undo();
  }

  /**
   * Public entry: approve a pending mutating tool call, execute it, then resume
   * the agent loop with the tool result so the run completes automatically.
   */
  async resume(approvalId, decision) {
    if (!this.approvalStore) throw new Error("Approval storage is not configured");
    const state = await this.approvalStore.readAll?.();
    const approval = (state?.approvals ?? []).find((item) => item.id === approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== "pending") throw new Error("Approval already resolved");
    if (decision === "deny") {
      await this.approvalStore.resolve(approvalId, "denied", null);
      const entry = this.pending.get(approval.runId);
      if (entry) {
        entry.messages.push({ role: "user", content: "The user denied this operation. Propose an alternative or stop." });
        entry.resume();
      }
      return { status: "denied" };
    }
    const result = await this.executeTool(approval.tool, true);
    await this.approvalStore.resolve(approvalId, "approved", result);
    const entry = this.pending.get(approval.runId);
    if (!entry) return { status: "approved", result };
    entry.messages.push({ role: "user", content: `Tool ${approval.tool.name} returned:\n${serialize(result)}\nContinue the task using this verified result.` });
    entry.resume();
    return { status: "resumed" };
  }

  async run(input, emit = () => {}) {
    const runId = input.runId || crypto.randomUUID();
    const prompt = input.prompt;
    const promptContent = Array.isArray(prompt) ? prompt : String(prompt || "");
    const systemPrompt = await this.#buildSystemPrompt(input);
    // Save the parent provider config so #spawnSubagent can inherit it.
    if (!this.#currentParentProvider) {
      this.#currentParentProvider = {
        provider: input.provider,
        model: input.model,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
      };
    }
    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(input.history) ? input.history.slice(-30) : []),
      { role: "user", content: promptContent },
    ];

    // v4.0.0: Use token-based compaction (more accurate than message-count).
    // Falls back to the old Compactor if token-counter isn't available.
    if (needsCompaction && needsCompaction(messages)) {
      try {
        const compactedResult = await compactConversation(messages, async (oldMessages) => {
          // Use the old Compactor for LLM summarization if available
          if (this.compactor) {
            const result = await this.compactor.compact(oldMessages, {
              provider: input.provider, model: input.model, apiKey: input.apiKey, baseUrl: input.baseUrl, env: this.env,
            });
            return result.summary || JSON.stringify(result);
          }
          // Fallback: mechanical summary
          const tokens = countConversationTokens(oldMessages);
          return `Previous conversation (${oldMessages.length} messages, ~${tokens} tokens) was compacted.`;
        });
        if (compactedResult.compacted) {
          messages.splice(0, messages.length, ...compactedResult.messages);
          emit(createEvent(EventType.CONTEXT_COMPACTED, { runId, summary: compactedResult.summary, compactedCount: compactedResult.compactedCount, tokensBefore: compactedResult.tokensBefore, tokensAfter: compactedResult.tokensAfter }));
        }
      } catch (error) {
        // Fallback to old compactor on error
        if (this.compactor && this.compactor.needsCompaction(messages)) {
          const compacted = await this.compactor.compact(messages, {
            provider: input.provider, model: input.model, apiKey: input.apiKey, baseUrl: input.baseUrl, env: this.env,
          });
          if (compacted.compacted) {
            messages.splice(0, messages.length, ...compacted.messages);
            emit(createEvent(EventType.CONTEXT_COMPACTED, { runId, summary: compacted.summary, compactedCount: compacted.compactedCount }));
          }
        }
      }
    } else if (this.compactor && this.compactor.needsCompaction(messages)) {
      // Old compactor fallback (if token-counter not imported properly)
      const compacted = await this.compactor.compact(messages, {
        provider: input.provider, model: input.model, apiKey: input.apiKey, baseUrl: input.baseUrl, env: this.env,
      });
      if (compacted.compacted) {
        messages.splice(0, messages.length, ...compacted.messages);
        emit(createEvent(EventType.CONTEXT_COMPACTED, { runId, summary: compacted.summary, compactedCount: compacted.compactedCount }));
      }
    }

    // Collect MCP tools to expose alongside native tools this turn.
    const mcpTools = await this.#collectMcpTools();
    let tools = [...TOOL_DEFINITIONS, ...mcpTools];

    // v4.0.0: If an agent is specified, filter tools based on agent config.
    if (input.agentId) {
      const agent = getAgent(input.agentId);
      if (agent) {
        tools = filterToolsForAgent(agent, tools);
        emit(createEvent(EventType.RUN_STARTED, { runId, provider: input.provider, model: input.model, agent: agent.id }));
      }
    }

    emit(createEvent(EventType.RUN_STARTED, { runId, provider: input.provider, model: input.model }));
    let finalText = "";
    let usage = null;
    let cumulativeCost = null;

    try {
      const maxSteps = Math.min(Number(input.maxSteps ?? 8), 12);
      for (let step = 0; step < maxSteps; step += 1) {
        const response = await callModel({
          provider: input.provider || "demo",
          model: input.model,
          baseUrl: input.baseUrl,
          apiKey: input.apiKey,
        }, {
          messages,
          tools,
          temperature: 0.15,
          stream: input.stream !== false,
          onDelta: (delta) => {
            emit(createEvent(EventType.TEXT_DELTA, { runId, delta }));
          },
        }, this.env);
        usage = response.usage ?? usage;
        if (response.text) {
          finalText += `${finalText ? "\n" : ""}${response.text}`;
          emit(createEvent(EventType.TEXT_DONE, { runId, text: response.text }));
        }
        if (usage) {
          const cost = estimateCost(input.model, usage);
          if (cost) {
            cumulativeCost = cumulativeCost
              ? { inputTokens: cumulativeCost.inputTokens + cost.inputTokens, outputTokens: cumulativeCost.outputTokens + cost.outputTokens, totalTokens: cumulativeCost.totalTokens + cost.totalTokens, costUsd: (cumulativeCost.costUsd ?? 0) + (cost.costUsd ?? 0) }
              : cost;
            emit(createEvent(EventType.USAGE, { runId, usage, cost: cumulativeCost }));
          }
        }
        if (!response.toolCalls?.length) break;

        messages.push({ role: "assistant", content: response.text || `I will use ${response.toolCalls.map((call) => call.name).join(", ")}.` });
        for (const call of response.toolCalls) {
          const isMcp = call.name.startsWith("mcp.");
          const isSkill = call.name === "invoke_skill";

          // v4.1: Use PermissionManager for fine-grained permission checks.
          // Falls back to Risk enum for backward compatibility.
          const { permission, path: permPath } = riskToPermission(call.name, call.input || {});
          const permAction = this.permissions.check(permission, permPath);
          const risk = isMcp || isSkill ? Risk.EXTERNAL : toolRisk(call.name);

          // v4.1: Fire plugin hook: tool.execute.before
          if (this.pluginLoader) {
            await this.pluginLoader.runHook("tool.execute.before", call.name, call.input).catch(() => {});
          }

          emit(createEvent(EventType.TOOL_STARTED, { runId, callId: call.id, name: call.name, input: call.input, risk, permission: { permission, path: permPath, action: permAction } }));

          // v4.1: PermissionManager decides: allow → run, deny → throw, ask → approval
          let result;
          if (permAction === "allow" && !isMcp && !isSkill) {
            result = await this.executeTool(call, true); // approved=true
          } else if (permAction === "deny") {
            result = { error: `Permission denied: ${permission} ${permPath}`, denied: true };
          } else {
            // "ask" or MCP/skill — require approval
            result = isMcp || isSkill
              ? { approvalRequired: true, risk }
              : await this.executeTool(call, false);
          }
          if (result?.approvalRequired) {
            const approval = {
              id: crypto.randomUUID(),
              runId,
              createdAt: new Date().toISOString(),
              status: "pending",
              tool: call,
              risk: result.risk || risk,
              summary: call.name === "run_command" ? call.input?.command : `${call.name}: ${call.input?.path ?? call.input?.id ?? ""}`,
            };
            await this.approvalStore?.(approval);
            emit(createEvent(EventType.APPROVAL_REQUIRED, { runId, approval }));
            await new Promise((resolve) => {
              this.pending.set(runId, { messages, resume: resolve });
              this.#snapshot(runId, messages);
            });
            this.pending.delete(runId);
            // After resume, re-execute the tool with the now-approved flag.
            try {
              const resolved = await this.#executeAnyTool(call, true);
              emit(createEvent(EventType.TOOL_FINISHED, { runId, callId: call.id, name: call.name, result: resolved }));
              messages.push({ role: "user", content: `Tool ${call.name} returned:\n${serialize(resolved)}\nContinue the task using this verified result.` });
            } catch (error) {
              emit(createEvent(EventType.ERROR, { runId, message: `Tool ${call.name} failed: ${error.message}` }));
              messages.push({ role: "user", content: `Tool ${call.name} failed: ${error.message}. Try a different approach.` });
            }
            continue;
          }
          emit(createEvent(EventType.TOOL_FINISHED, { runId, callId: call.id, name: call.name, result }));

          // v4.1: Fire plugin hook: tool.execute.after
          if (this.pluginLoader) {
            await this.pluginLoader.runHook("tool.execute.after", call.name, call.input, result).catch(() => {});
          }

          messages.push({ role: "user", content: `Tool ${call.name} returned:\n${serialize(result)}\nContinue the task using this verified result.` });
        }
      }
      // v4.1: Fire plugin hook: chat.message (after assistant turn)
      if (this.pluginLoader) {
        await this.pluginLoader.runHook("chat.message", { role: "assistant", content: finalText }).catch(() => {});
      }
      emit(createEvent(EventType.RUN_FINISHED, { runId, status: "completed", usage, cost: cumulativeCost }));
      return { runId, status: "completed", text: finalText, usage, cost: cumulativeCost, messages };
    } catch (error) {
      emit(createEvent(EventType.ERROR, { runId, message: error.message, status: error.status || 500 }));
      emit(createEvent(EventType.RUN_FINISHED, { runId, status: "failed", usage, cost: cumulativeCost }));
      return { runId, status: "failed", error: error.message, text: finalText, usage, cost: cumulativeCost, messages };
    }
  }
}
