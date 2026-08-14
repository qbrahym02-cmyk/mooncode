/**
 * v3.0.0: Token counting and advanced context compaction.
 *
 * Replaces the simple "30 messages → summarize" with real token-based
 * compaction inspired by OpenCode:
 *   - PRUNE_MINIMUM: don't compact below this token count
 *   - PRUNE_PROTECT: start compacting when exceeding this
 *   - Inline tool output cap: 2KB (larger outputs → temp files)
 *   - Preserve recent messages (MIN/MAX preserve recent tokens)
 */

const PRUNE_MINIMUM = 20_000;
const PRUNE_PROTECT = 40_000;
const MIN_PRESERVE_RECENT = 2_000;
const MAX_PRESERVE_RECENT = 15_000;
const TOOL_OUTPUT_MAX_CHARS = 2_000;

/**
 * Estimate token count for a string.
 * Uses a simple heuristic: ~4 chars per token (good enough for decisions).
 * For production, replace with tiktoken or @anthropic-ai/tokenizer.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === "string" ? text : JSON.stringify(text);
  return Math.ceil(str.length / 4);
}

/**
 * Count tokens in a message.
 */
export function countMessageTokens(message) {
  if (!message) return 0;
  let content = message.content || "";
  if (Array.isArray(content)) {
    content = content.map((p) => p.text || p.image_url?.url || "").join("");
  }
  // Include role overhead (~4 tokens per message)
  return estimateTokens(content) + 4;
}

/**
 * Count total tokens in a message array.
 */
export function countConversationTokens(messages) {
  return messages.reduce((sum, m) => sum + countMessageTokens(m), 0);
}

/**
 * Truncate tool output to save tokens.
 * If output exceeds TOOL_OUTPUT_MAX_CHARS, store in a temp file reference.
 */
export function truncateToolOutput(output) {
  const text = String(output || "");
  if (text.length <= TOOL_OUTPUT_MAX_CHARS) {
    return { content: text, truncated: false };
  }
  return {
    content: text.slice(0, TOOL_OUTPUT_MAX_CHARS) + `\n…[truncated, ${text.length - TOOL_OUTPUT_MAX_CHARS} more chars]`,
    truncated: true,
    fullLength: text.length,
  };
}

/**
 * Check if compaction is needed.
 */
export function needsCompaction(messages) {
  const tokens = countConversationTokens(messages);
  return tokens > PRUNE_PROTECT;
}

/**
 * Compact a conversation: summarize old messages, preserve recent ones.
 *
 * Algorithm:
 * 1. Count total tokens.
 * 2. If under PRUNE_PROTECT, return as-is.
 * 3. Find the split point: keep recent messages until we have
 *    between MIN_PRESERVE_RECENT and MAX_PRESERVE_RECENT tokens.
 * 4. Summarize everything before the split point.
 * 5. Return [summary_message, ...recent_messages].
 *
 * @param {Array} messages - the full conversation
 * @param {Function} summarize - async (messages) => string
 * @returns {Promise<{ messages: Array, compacted: boolean, summary: string, tokensBefore: number, tokensAfter: number }>}
 */
export async function compactConversation(messages, summarize) {
  const tokensBefore = countConversationTokens(messages);

  if (tokensBefore <= PRUNE_PROTECT) {
    return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore };
  }

  // Find the split point: walk backwards from the end, accumulating tokens
  // until we reach MIN_PRESERVE_RECENT (but don't exceed MAX_PRESERVE_RECENT).
  let recentTokens = 0;
  let splitIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = countMessageTokens(messages[i]);
    if (recentTokens + msgTokens > MAX_PRESERVE_RECENT) break;
    recentTokens += msgTokens;
    splitIndex = i;

    if (recentTokens >= MIN_PRESERVE_RECENT && i > 0) {
      // Check if we have enough old messages to compact
      if (splitIndex > 2) break;
    }
  }

  // Don't compact if we can't preserve enough recent context
  if (splitIndex < 2) {
    return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore };
  }

  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // Truncate tool outputs in old messages before summarizing
  const truncatedOld = oldMessages.map((m) => {
    if (typeof m.content === "string" && m.content.includes("Tool ") && m.content.includes("returned:")) {
      const truncated = truncateToolOutput(m.content);
      return { ...m, content: truncated.content };
    }
    return m;
  });

  // Summarize the old messages
  let summary;
  try {
    summary = await summarize(truncatedOld);
  } catch (error) {
    // Fallback: mechanical summary
    summary = mechanicalSummary(truncatedOld);
  }

  const summaryMessage = {
    role: "system",
    content: `[Context Compaction — Previous conversation summarized]\n\n${summary}\n\n[End of summary — recent messages follow]`,
  };

  const newMessages = [summaryMessage, ...recentMessages];
  const tokensAfter = countConversationTokens(newMessages);

  return {
    messages: newMessages,
    compacted: true,
    summary,
    tokensBefore,
    tokensAfter,
    compactedCount: oldMessages.length,
  };
}

/**
 * Mechanical fallback summary (no LLM needed).
 */
function mechanicalSummary(messages) {
  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant").length;
  const toolMessages = messages.filter((m) => m.content?.includes("Tool ") && m.content?.includes("returned:")).length;
  const tokens = countConversationTokens(messages);

  // Extract file paths mentioned
  const filePaths = new Set();
  for (const m of messages) {
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    const matches = content.match(/[\w-]+\.(js|ts|tsx|jsx|py|go|rs|java|c|cpp|md|json|css|html)/g);
    if (matches) matches.forEach((f) => filePaths.add(f));
  }

  return `Previous conversation (${userMessages} user, ${assistantMessages} assistant, ${toolMessages} tool messages, ~${tokens} tokens):
${filePaths.size > 0 ? `Files mentioned: ${[...filePaths].slice(0, 20).join(", ")}` : "No specific files mentioned."}
The user was working on a coding task. Continue from where the conversation left off.`;
}

export const COMPACTION_CONFIG = {
  PRUNE_MINIMUM,
  PRUNE_PROTECT,
  MIN_PRESERVE_RECENT,
  MAX_PRESERVE_RECENT,
  TOOL_OUTPUT_MAX_CHARS,
};
