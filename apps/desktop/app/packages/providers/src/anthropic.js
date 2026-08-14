/**
 * Anthropic Messages API adapter.
 *
 * Supports both non-streaming (JSON) and streaming (SSE) modes. Tool calls
 * arrive as `tool_use` content blocks; their JSON arguments are streamed as
 * `input_json_delta` events that must be concatenated before parsing.
 *
 * Anthropic separates the system prompt from the message list — `system`
 * is a top-level field, and the messages array must not contain role:"system".
 */
import { ProviderError, withTimeout, jsonRequest, toAnthropicMessages, parseToolArguments } from "./shared.js";

export async function callAnthropic(config, request) {
  const base = String(config.baseUrl).replace(/\/$/, "");

  // Extract system messages into the top-level `system` field (Anthropic API requirement).
  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => typeof m.content === "string"
      ? m.content
      : (m.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n") ?? ""))
    .join("\n\n");
  const messages = toAnthropicMessages(request.messages.filter((m) => m.role !== "system"));

  const body = {
    model: config.model,
    max_tokens: request.maxTokens ?? 8_192,
    system,
    messages,
    stream: Boolean(request.stream),
    ...(request.tools?.length ? {
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    } : {}),
  };

  // --- Non-streaming path ---
  if (!request.stream) {
    const data = await jsonRequest(`${base}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    return {
      text: (data.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n"),
      toolCalls: (data.content ?? [])
        .filter((part) => part.type === "tool_use")
        .map((part) => ({ id: part.id, name: part.name, input: part.input ?? {} })),
      stopReason: data.stop_reason,
      usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : null,
    };
  }

  // --- SSE streaming path ---
  const response = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      accept: "text/event-stream",
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
  let textBuffer = "";
  let usage = null;
  let stopReason = null;
  const toolCalls = new Map();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value || new Uint8Array(), { stream: true });
    // Anthropic SSE events are separated by blank lines, each with `event:` and `data:` lines.
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const block of events) {
      const lines = block.split("\n");
      const dataLine = lines.find((line) => line.startsWith("data:"));
      const eventLine = lines.find((line) => line.startsWith("event:"));
      if (!dataLine) continue;
      const eventType = eventLine ? eventLine.slice(6).trim() : "message";
      let payload;
      try { payload = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

      if (payload.type) {
        if (payload.type === "content_block_delta" && payload.delta?.text) {
          textBuffer += payload.delta.text;
          request.onDelta?.(payload.delta.text);
        } else if (payload.type === "content_block_start" && payload.content_block?.type === "tool_use") {
          toolCalls.set(payload.index, { id: payload.content_block.id, name: payload.content_block.name, arguments: "" });
        } else if (payload.type === "content_block_delta" && payload.delta?.type === "input_json_delta") {
          const entry = toolCalls.get(payload.index);
          if (entry) entry.arguments += payload.delta.partial_json;
        } else if (payload.type === "message_delta") {
          if (payload.delta?.stop_reason) stopReason = payload.delta.stop_reason;
          if (payload.usage) usage = {
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: payload.usage.output_tokens ?? usage?.outputTokens ?? 0,
          };
        } else if (payload.type === "message_start" && payload.message?.usage) {
          usage = { inputTokens: payload.message.usage.input_tokens, outputTokens: payload.message.usage.output_tokens };
        }
      } else if (eventType === "message_stop") {
        // No-op: the final message_stop event carries no data we need.
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
