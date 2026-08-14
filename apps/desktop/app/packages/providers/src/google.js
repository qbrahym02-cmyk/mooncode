/**
 * Google Generative Language API adapter (Gemini models).
 *
 * Supports both non-streaming (`generateContent`) and streaming
 * (`streamGenerateContent?alt=sse`) modes. Tool calls arrive as
 * `functionCall` parts inside the candidate's content.
 *
 * The system prompt is extracted into `systemInstruction` (Google's
 * equivalent of Anthropic's top-level `system` field). Assistant role
 * maps to "model"; everything else maps to "user".
 */
import { ProviderError, withTimeout, jsonRequest, toGoogleMessages } from "./shared.js";

export async function callGoogle(config, request) {
  const system = request.messages
    .filter((m) => m.role === "system")
    .map((m) => typeof m.content === "string"
      ? m.content
      : (m.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n") ?? ""))
    .join("\n\n");
  const contents = toGoogleMessages(request.messages.filter((m) => m.role !== "system"));
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: {
      temperature: request.temperature ?? 0.2,
      maxOutputTokens: request.maxTokens ?? 8_192,
    },
    ...(request.tools?.length ? {
      tools: [{ functionDeclarations: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      })) }],
    } : {}),
  };

  const base = String(config.baseUrl).replace(/\/$/, "");

  // --- Non-streaming path ---
  if (!request.stream) {
    const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const data = await jsonRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.filter((part) => part.text).map((part) => part.text).join("\n"),
      toolCalls: parts
        .filter((part) => part.functionCall)
        .map((part) => ({ id: crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args ?? {} })),
      stopReason: data?.candidates?.[0]?.finishReason,
      usage: data.usageMetadata
        ? { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount }
        : null,
    };
  }

  // --- SSE streaming path (Google streamGenerateContent with alt=sse) ---
  const url = `${base}/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
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
  const toolCalls = [];

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
      if (!payload || payload === "[DONE]") continue;
      let event;
      try { event = JSON.parse(payload); } catch { continue; }
      const parts = event?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          textBuffer += part.text;
          request.onDelta?.(part.text);
        }
        if (part.functionCall) {
          toolCalls.push({ id: crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args ?? {} });
        }
      }
      if (event?.candidates?.[0]?.finishReason) stopReason = event.candidates[0].finishReason;
      if (event?.usageMetadata) {
        usage = { inputTokens: event.usageMetadata.promptTokenCount, outputTokens: event.usageMetadata.candidatesTokenCount };
      }
    }
  }

  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls };
}
