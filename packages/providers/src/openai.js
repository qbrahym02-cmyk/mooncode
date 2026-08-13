/**
 * OpenAI (and OpenAI-compatible) provider adapter.
 *
 * Handles: OpenAI, OpenRouter, and custom OpenAI-compatible endpoints.
 * All share the `/chat/completions` API shape, so they all route through
 * `callOpenAI`. The `kind: "openai"` flag in the PROVIDERS table selects
 * this adapter.
 *
 * Supports both non-streaming (JSON) and streaming (SSE) modes. Tool calls
 * are assembled incrementally from partial JSON deltas across SSE chunks.
 */
import {
  ProviderError, withTimeout, jsonRequest,
  toOpenAIMessages, openAITools, normalizeOpenAI, parseToolArguments,
} from "./shared.js";

export async function callOpenAI(config, request) {
  const baseUrl = String(config.baseUrl).replace(/\/$/, "");
  const body = {
    model: config.model,
    messages: toOpenAIMessages(request.messages),
    temperature: request.temperature ?? 0.2,
    stream: Boolean(request.stream),
    ...(request.tools?.length ? { tools: openAITools(request.tools), tool_choice: "auto" } : {}),
  };

  // --- Non-streaming path: single JSON request/response ---
  if (!request.stream) {
    const data = await jsonRequest(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        ...(config.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
    return normalizeOpenAI(data);
  }

  // --- SSE streaming path ---
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: request.signal ?? withTimeout(),
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = null;
    try { detail = JSON.parse(text); } catch { detail = { raw: text.slice(0, 4_000) }; }
    throw new ProviderError(detail?.error?.message || `Provider request failed (${response.status})`, response.status, detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  let stopReason = null;
  const toolCalls = new Map();
  let textBuffer = "";

  const ensureToolCall = (id, name) => {
    if (!toolCalls.has(id)) toolCalls.set(id, { id, name, arguments: "" });
    return toolCalls.get(id);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value || new Uint8Array(), { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let event;
      try { event = JSON.parse(payload); } catch { continue; }
      if (event.usage) usage = { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens };
      const choice = event.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) stopReason = choice.finish_reason;
      const delta = choice.delta ?? {};
      if (delta.content) {
        textBuffer += delta.content;
        request.onDelta?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const partial of delta.tool_calls) {
          const id = partial.id ?? `call_${toolCalls.size}`;
          const entry = ensureToolCall(id, partial.function?.name);
          if (partial.function?.name && !entry.name) entry.name = partial.function.name;
          if (partial.function?.arguments) entry.arguments += partial.function.arguments;
        }
      }
    }
  }

  const assembled = [...toolCalls.values()].map((entry) => ({
    id: entry.id,
    name: entry.name,
    input: parseToolArguments(entry.arguments),
  }));
  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls: assembled };
}
