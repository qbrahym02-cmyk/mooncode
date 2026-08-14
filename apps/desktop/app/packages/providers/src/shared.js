/**
 * Shared helpers and types for provider adapters.
 *
 * v0.9.1: extracted from index.js to keep each provider file focused on its
 * own protocol. This module holds the ProviderError class, the request
 * helper, the timeout helper, and the price table used for cost estimation.
 */

/**
 * Per-1K-token cost in USD. Used only for live display, never for billing.
 * Missing entries default to zero so unknown models do not break the UI.
 */
export const PRICE_TABLE_USD_PER_1K = {
  "gpt-5-mini": { input: 0.00015, output: 0.0006 },
  "gpt-5": { input: 0.005, output: 0.015 },
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
  "gpt-4.1": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "claude-sonnet-4-5": { input: 0.003, output: 0.015 },
  "claude-opus-4-1": { input: 0.015, output: 0.075 },
  "claude-haiku-4-5": { input: 0.001, output: 0.005 },
  "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
  "gemini-2.5-pro": { input: 0.00125, output: 0.005 },
};

export class ProviderError extends Error {
  constructor(message, status = 500, detail = null) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.detail = detail;
  }
}

export function withTimeout(timeout = 120_000) {
  return AbortSignal.timeout(Math.min(Math.max(Number(timeout), 1_000), 300_000));
}

/**
 * Perform a JSON HTTP request and parse the response. Throws ProviderError
 * on non-2xx responses with the parsed error detail attached.
 */
export async function jsonRequest(url, init) {
  const response = await fetch(url, { ...init, signal: init.signal ?? withTimeout() });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 4_000) }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Provider request failed (${response.status})`;
    throw new ProviderError(message, response.status, data);
  }
  return data;
}

/**
 * Estimate the cost of a model call based on token usage and a price table.
 * Returns null if usage is missing. Unknown models degrade gracefully to
 * `costUsd: null` while still reporting token counts.
 */
export function estimateCost(model, usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0) || 0;
  const price = PRICE_TABLE_USD_PER_1K[String(model).toLowerCase()];
  if (!price) return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd: null };
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1000;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd };
}

/**
 * Convert the internal message format to OpenAI's multimodal content schema.
 * Internal messages can be either `{ role, content: string }` or
 * `{ role, content: [{ type: "text", text }, { type: "image_url", image_url: { url } }] }`.
 * String content passes through unchanged.
 */
export function toOpenAIMessages(messages = []) {
  return messages.map((message) => {
    if (typeof message.content === "string") return message;
    if (Array.isArray(message.content)) {
      return { ...message, content: message.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") return { type: "image_url", image_url: { url: part.image_url?.url ?? part.url } };
        return part;
      }) };
    }
    return message;
  });
}

/**
 * Convert internal messages to Anthropic's multimodal content schema.
 * Anthropic expects base64-encoded image data with explicit source.
 */
export function toAnthropicMessages(messages = []) {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return { ...message, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content) };
    }
    if (Array.isArray(message.content)) {
      const parts = message.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") {
          const url = part.image_url?.url ?? part.url ?? "";
          const match = url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            return { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } };
          }
          return { type: "text", text: `(image: ${url.slice(0, 80)})` };
        }
        return part;
      });
      return { ...message, content: parts };
    }
    return message;
  });
}

/**
 * Convert internal messages to Google's multimodal content schema.
 * Google uses `parts` with `text` or `inlineData` (base64-encoded).
 * Assistant role maps to "model"; everything else maps to "user".
 */
export function toGoogleMessages(messages = []) {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] };
    }
    if (Array.isArray(message.content)) {
      const parts = message.content.map((part) => {
        if (part.type === "text") return { text: part.text };
        if (part.type === "image_url") {
          const url = part.image_url?.url ?? part.url ?? "";
          const match = url.match(/^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/);
          if (match) {
            return { inlineData: { mimeType: match[1], data: match[3] } };
          }
          return { text: `(image: ${url.slice(0, 80)})` };
        }
        return { text: JSON.stringify(part) };
      });
      return { role: message.role === "assistant" ? "model" : "user", parts };
    }
    return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: String(message.content ?? "") }] };
  });
}

/**
 * Convert internal tool definitions to OpenAI's function-calling format.
 */
export function openAITools(tools = []) {
  return tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
}

/**
 * Normalize an OpenAI chat-completions response into the unified shape.
 */
export function normalizeOpenAI(data) {
  const message = data?.choices?.[0]?.message ?? {};
  return {
    text: message.content || "",
    stopReason: data?.choices?.[0]?.finish_reason || "stop",
    usage: data?.usage ?? null,
    toolCalls: (message.tool_calls ?? []).map((call) => {
      let input = {};
      try { input = JSON.parse(call.function?.arguments || "{}"); } catch { input = { _raw: call.function?.arguments }; }
      return { id: call.id || crypto.randomUUID(), name: call.function?.name, input };
    }),
  };
}

/**
 * Helper to parse a partial JSON tool-call arguments string.
 * Falls back to `{ _raw }` when the JSON is incomplete.
 *
 * v0.9.1: extracted as a shared helper because OpenAI, Anthropic, and Ollama
 * all need this. A future improvement (planned for v0.9.2) is true partial
 * JSON recovery that tolerates truncated input.
 */
export function parseToolArguments(raw) {
  try { return JSON.parse(raw || "{}"); }
  catch { return { _raw: raw }; }
}
