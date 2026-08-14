import { callModel } from "../../providers/src/index.js";

const DEFAULT_THRESHOLD_MESSAGES = 30;
const DEFAULT_KEEP_RECENT = 8;
const MAX_SUMMARY_TOKENS = 800;

/**
 * Compaction reduces a long conversation to a compact summary so the agent
 * loop can continue past the provider's context window without losing the
 * gist of earlier turns. The summary is stored as the first user message and
 * the original messages are dropped from the active history (they remain in
 * the session's event log on disk for replay).
 *
 * Original implementation. No external summarizer library is used.
 */
export class Compactor {
  constructor(options = {}) {
    this.threshold = Number(options.threshold ?? DEFAULT_THRESHOLD_MESSAGES);
    this.keepRecent = Number(options.keepRecent ?? DEFAULT_KEEP_RECENT);
    this.summarizerModel = options.summarizerModel;
    this.summarizerProvider = options.summarizerProvider;
  }

  needsCompaction(messages = []) {
    return messages.length > this.threshold;
  }

  /**
   * Returns a new messages array where the older slice has been replaced by a
   * compact system-authored summary. Always preserves the most recent
   * `keepRecent` messages verbatim so the model retains immediate context.
   */
  async compact(messages = [], options = {}) {
    if (!this.needsCompaction(messages)) return { messages, compacted: false };
    const splitIndex = Math.max(1, messages.length - this.keepRecent);
    const older = messages.slice(0, splitIndex);
    const recent = messages.slice(splitIndex);
    const summary = await this.#summarize(older, options);
    if (!summary) return { messages, compacted: false };
    const summaryMessage = {
      role: "system",
      content: `## Compacted history\n\nThe following is a compact summary of the previous ${older.length} messages in this session. Treat it as background context.\n\n${summary}`,
      compacted: true,
      compactedAt: new Date().toISOString(),
      compactedCount: older.length,
    };
    return {
      messages: [summaryMessage, ...recent],
      compacted: true,
      summary,
      compactedCount: older.length,
    };
  }

  async #summarize(older, options) {
    const transcript = older.map((message, index) => {
      const role = message.role || "user";
      const content = typeof message.content === "string" ? message.content : "[multimodal message]";
      return `[${index + 1}] ${role}: ${content.slice(0, 1200)}`;
    }).join("\n");
    const prompt = `Summarize the following conversation between a user and an agent. Capture:
- The user's main goals and constraints.
- Decisions made and tools used.
- Files created or modified (with paths).
- Any unresolved questions or open tasks.

Be concise (under ${MAX_SUMMARY_TOKENS} tokens). Output only the summary, no preamble.

Conversation:
${transcript}`;
    try {
      const result = await callModel({
        provider: options.provider || this.summarizerProvider || "demo",
        model: options.model || this.summarizerModel || "demo-local",
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
      }, {
        messages: [{ role: "user", content: prompt }],
        tools: [],
        temperature: 0.1,
      }, options.env || process.env);
      return result.text?.trim() || null;
    } catch (error) {
      // Fall back to a mechanical summary that captures role transitions.
      const toolCount = older.filter((m) => m.role === "user" && m.content?.startsWith?.("Tool ")).length;
      const userCount = older.filter((m) => m.role === "user" && !m.content?.startsWith?.("Tool ")).length;
      return `Compaction failed (${error.message}). Mechanical summary: ${userCount} user messages, ${toolCount} tool results, ${older.filter((m) => m.role === "assistant").length} assistant messages across ${older.length} turns.`;
    }
  }
}
