/**
 * v3.5.0: Native LLM runtime — bypass the AI SDK for direct HTTP calls.
 *
 * When MOONCODE_NATIVE_LLM=1, uses raw fetch() instead of provider adapters.
 * This reduces overhead and gives full control over the request/response cycle.
 */

export async function nativeCallModel(config, request, env = process.env) {
  if (!env.MOONCODE_NATIVE_LLM) return null; // Not enabled — fall back to normal path

  const baseUrl = String(config.baseUrl).replace(/\/$/, "");
  const body = {
    model: config.model,
    messages: request.messages,
    temperature: request.temperature ?? 0.2,
    stream: Boolean(request.stream),
    ...(request.tools?.length ? { tools: request.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
  };

  const headers = {
    "content-type": "application/json",
    ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    ...(config.headers || {}),
  };

  if (!request.stream) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: request.signal ?? AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Native LLM failed: ${response.status}`);
    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};
    return {
      text: message.content || "",
      stopReason: data?.choices?.[0]?.finish_reason || "stop",
      usage: data?.usage ?? null,
      toolCalls: (message.tool_calls || []).map((c) => {
        let input = {};
        try { input = JSON.parse(c.function?.arguments || "{}"); } catch { input = { _raw: c.function?.arguments }; }
        return { id: c.id || crypto.randomUUID(), name: c.function?.name, input };
      }),
    };
  }

  // Streaming via SSE
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...headers, accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal: request.signal ?? AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Native LLM stream failed: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let textBuffer = "";
  let usage = null;
  const toolCalls = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        if (event.usage) usage = { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens };
        const choice = event.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (delta.content) { textBuffer += delta.content; request.onDelta?.(delta.content); }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const id = tc.id || `call_${toolCalls.size}`;
            if (!toolCalls.has(id)) toolCalls.set(id, { id, name: tc.function?.name, arguments: "" });
            const entry = toolCalls.get(id);
            if (tc.function?.name && !entry.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.arguments += tc.function.arguments;
          }
        }
      } catch {}
    }
  }

  return {
    text: textBuffer,
    stopReason: "stop",
    usage,
    toolCalls: [...toolCalls.values()].map((e) => {
      let input = {};
      try { input = JSON.parse(e.arguments || "{}"); } catch { input = { _raw: e.arguments }; }
      return { id: e.id, name: e.name, input };
    }),
  };
}

export function isNativeRuntimeEnabled(env = process.env) {
  return Boolean(env.MOONCODE_NATIVE_LLM);
}
