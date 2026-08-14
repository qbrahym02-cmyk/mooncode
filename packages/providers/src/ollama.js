/**
 * Ollama local-model provider adapter.
 *
 * Ollama runs models locally and exposes an OpenAI-like chat API at
 * `/api/chat`. Unlike cloud providers, it requires no API key and
 * uses NDJSON (newline-delimited JSON) for streaming instead of SSE.
 *
 * Supports both non-streaming (single JSON) and streaming (NDJSON) modes.
 */
import { ProviderError, withTimeout, jsonRequest } from "./shared.js";

export async function callOllama(config, request) {
  const base = String(config.baseUrl).replace(/\/$/, "");
  const tools = request.tools?.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));

  // --- Non-streaming path ---
  if (!request.stream) {
    const data = await jsonRequest(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: request.messages,
        tools,
      }),
    });
    return {
      text: data?.message?.content || "",
      toolCalls: (data?.message?.tool_calls ?? []).map((call) => ({
        id: crypto.randomUUID(),
        name: call.function?.name,
        input: call.function?.arguments ?? {},
      })),
      stopReason: data.done_reason ?? "stop",
      usage: { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count },
    };
  }

  // --- NDJSON streaming path ---
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: request.messages,
      tools,
    }),
    signal: request.signal ?? withTimeout(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ProviderError(`Ollama request failed (${response.status})`, response.status, { raw: text.slice(0, 4_000) });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textBuffer = "";
  let usage = null;
  let stopReason = null;
  const toolCalls = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value || new Uint8Array(), { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.message?.content) {
        textBuffer += event.message.content;
        request.onDelta?.(event.message.content);
      }
      if (Array.isArray(event.message?.tool_calls)) {
        for (const call of event.message.tool_calls) {
          toolCalls.push({
            id: crypto.randomUUID(),
            name: call.function?.name,
            input: call.function?.arguments ?? {},
          });
        }
      }
      if (event.done) {
        stopReason = event.done_reason ?? "stop";
        usage = { inputTokens: event.prompt_eval_count, outputTokens: event.eval_count };
      }
    }
  }

  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls };
}
