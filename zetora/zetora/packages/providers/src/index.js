const PROVIDERS = Object.freeze({
  demo: { label: "Zetora Demo", defaultModel: "demo-local", env: null, kind: "demo" },
  openai: { label: "OpenAI", defaultModel: "gpt-5-mini", env: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", kind: "openai" },
  anthropic: { label: "Anthropic", defaultModel: "claude-sonnet-4-5", env: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", kind: "anthropic" },
  google: { label: "Google", defaultModel: "gemini-2.5-flash", env: "GOOGLE_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta", kind: "google" },
  openrouter: { label: "OpenRouter", defaultModel: "openai/gpt-5-mini", env: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", kind: "openai" },
  ollama: { label: "Ollama", defaultModel: "qwen3-coder", env: null, baseUrl: "http://127.0.0.1:11434", kind: "ollama" },
  custom: { label: "Custom provider", defaultModel: "custom-model", env: "CUSTOM_API_KEY", kind: "openai" },
});

/**
 * Rough per-1K-token cost in USD. Used only for live display, never for billing.
 * Missing entries default to zero so unknown models do not break the UI.
 */
const PRICE_TABLE_USD_PER_1K = {
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

export function providerCatalog(env = process.env) {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    label: provider.label,
    defaultModel: provider.defaultModel,
    configured: id === "demo" || id === "ollama" || Boolean(provider.env && env[provider.env]) || (id === "custom" && Boolean(env.CUSTOM_BASE_URL)),
  }));
}

export function estimateCost(model, usage) {
  if (!usage) return null;
  const inputTokens = Number(usage.inputTokens ?? usage.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage.outputTokens ?? usage.output_tokens ?? 0) || 0;
  const price = PRICE_TABLE_USD_PER_1K[String(model).toLowerCase()];
  if (!price) return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd: null };
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1000;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, costUsd };
}

function withTimeout(timeout = 120_000) {
  return AbortSignal.timeout(Math.min(Math.max(Number(timeout), 1_000), 300_000));
}

async function jsonRequest(url, init) {
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

function openAITools(tools = []) {
  return tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }));
}

function normalizeOpenAI(data) {
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
 * Convert the internal message format to OpenAI's multimodal content schema.
 * Internal messages can be either `{ role, content: string }` or
 * `{ role, content: [{ type: "text", text }, { type: "image_url", image_url: { url } }] }`.
 * String content passes through unchanged.
 */
function toOpenAIMessages(messages = []) {
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

function toAnthropicMessages(messages = []) {
  return messages.map((message) => {
    if (typeof message.content === "string") {
      return { ...message, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content) };
    }
    if (Array.isArray(message.content)) {
      const parts = message.content.map((part) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") {
          const url = part.image_url?.url ?? part.url ?? "";
          // Anthropic expects base64-encoded image data with explicit source.
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

function toGoogleMessages(messages = []) {
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

async function callOpenAI(config, request) {
  const baseUrl = String(config.baseUrl).replace(/\/$/, "");
  const body = {
    model: config.model,
    messages: toOpenAIMessages(request.messages),
    temperature: request.temperature ?? 0.2,
    stream: Boolean(request.stream),
    ...(request.tools?.length ? { tools: openAITools(request.tools), tool_choice: "auto" } : {}),
  };
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
  // SSE streaming path
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
  const assembled = [...toolCalls.values()].map((entry) => {
    let input = {};
    try { input = JSON.parse(entry.arguments || "{}"); } catch { input = { _raw: entry.arguments }; }
    return { id: entry.id, name: entry.name, input };
  });
  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls: assembled };
}

async function callAnthropic(config, request) {
  const system = request.messages.filter((m) => m.role === "system").map((m) => typeof m.content === "string" ? m.content : (m.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n") ?? "")).join("\n\n");
  const messages = toAnthropicMessages(request.messages.filter((m) => m.role !== "system"));
  const body = {
    model: config.model,
    max_tokens: request.maxTokens ?? 8_192,
    system,
    messages,
    stream: Boolean(request.stream),
    ...(request.tools?.length ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })) } : {}),
  };
  if (!request.stream) {
    const data = await jsonRequest(`${String(config.baseUrl).replace(/\/$/, "")}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    return {
      text: (data.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n"),
      toolCalls: (data.content ?? []).filter((part) => part.type === "tool_use").map((part) => ({ id: part.id, name: part.name, input: part.input ?? {} })),
      stopReason: data.stop_reason,
      usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : null,
    };
  }
  // SSE streaming path
  const response = await fetch(`${String(config.baseUrl).replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", accept: "text/event-stream" },
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
        // Anthropic sends `type` inside data
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
          if (payload.usage) usage = { inputTokens: usage?.inputTokens ?? 0, outputTokens: payload.usage.output_tokens ?? usage?.outputTokens ?? 0 };
        } else if (payload.type === "message_start" && payload.message?.usage) {
          usage = { inputTokens: payload.message.usage.input_tokens, outputTokens: payload.message.usage.output_tokens };
        }
      } else if (eventType === "message_stop") {
        // No-op
      }
    }
  }
  const assembled = [...toolCalls.values()].map((entry) => {
    let input = {};
    try { input = JSON.parse(entry.arguments || "{}"); } catch { input = { _raw: entry.arguments }; }
    return { id: entry.id, name: entry.name, input };
  });
  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls: assembled };
}

async function callGoogle(config, request) {
  const system = request.messages.filter((m) => m.role === "system").map((m) => typeof m.content === "string" ? m.content : (m.content?.filter((p) => p.type === "text").map((p) => p.text).join("\n") ?? "")).join("\n\n");
  const contents = toGoogleMessages(request.messages.filter((m) => m.role !== "system"));
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { temperature: request.temperature ?? 0.2, maxOutputTokens: request.maxTokens ?? 8_192 },
    ...(request.tools?.length ? { tools: [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }] } : {}),
  };
  const base = String(config.baseUrl).replace(/\/$/, "");
  if (!request.stream) {
    const url = `${base}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const data = await jsonRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    return {
      text: parts.filter((part) => part.text).map((part) => part.text).join("\n"),
      toolCalls: parts.filter((part) => part.functionCall).map((part) => ({ id: crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args ?? {} })),
      stopReason: data?.candidates?.[0]?.finishReason,
      usage: data.usageMetadata ? { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount } : null,
    };
  }
  // SSE streaming path (Google streamGenerateContent with alt=sse)
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
        if (part.functionCall) toolCalls.push({ id: crypto.randomUUID(), name: part.functionCall.name, input: part.functionCall.args ?? {} });
      }
      if (event?.candidates?.[0]?.finishReason) stopReason = event.candidates[0].finishReason;
      if (event?.usageMetadata) usage = { inputTokens: event.usageMetadata.promptTokenCount, outputTokens: event.usageMetadata.candidatesTokenCount };
    }
  }
  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls: toolCalls };
}

async function callOllama(config, request) {
  const base = String(config.baseUrl).replace(/\/$/, "");
  if (!request.stream) {
    const data = await jsonRequest(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, stream: false, messages: request.messages, tools: request.tools?.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }),
    });
    return {
      text: data?.message?.content || "",
      toolCalls: (data?.message?.tool_calls ?? []).map((call) => ({ id: crypto.randomUUID(), name: call.function?.name, input: call.function?.arguments ?? {} })),
      stopReason: data.done_reason ?? "stop",
      usage: { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count },
    };
  }
  // NDJSON streaming path
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.model, stream: true, messages: request.messages, tools: request.tools?.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }),
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
        for (const call of event.message.tool_calls) toolCalls.push({ id: crypto.randomUUID(), name: call.function?.name, input: call.function?.arguments ?? {} });
      }
      if (event.done) {
        stopReason = event.done_reason ?? "stop";
        usage = { inputTokens: event.prompt_eval_count, outputTokens: event.eval_count };
      }
    }
  }
  return { text: textBuffer, stopReason: stopReason || "stop", usage, toolCalls: toolCalls };
}

function demo(request) {
  const prompt = request.messages.at(-1)?.content || "";
  const promptText = typeof prompt === "string" ? prompt : (Array.isArray(prompt) ? prompt.find((p) => p.type === "text")?.text || "" : "");
  const arabic = /[\u0600-\u06ff]/.test(promptText);

  // Context-aware demo responses: simulate real agent behavior based on intent.
  let text = "";
  let toolCalls = [];

  if (/تحليل|analyze|بنية|structure/i.test(promptText)) {
    // Intent: project analysis — simulate list_files + parse_ast calls.
    toolCalls = [
      { id: crypto.randomUUID(), name: "list_files", input: { path: ".", maxDepth: 3 } },
      { id: crypto.randomUUID(), name: "parse_ast", input: { path: "src/index.js" } },
    ];
    text = arabic
      ? "سأحلّل بنية المشروع. دعني أولًا أستعرض الملفات ثم أفحص بنية الكود.\n\n**الخطوات المخططة:**\n1. عرض شجرة الملفات\n2. تحليل الـAST لكل ملف JS\n3. تقديم ملخص بالبنية والمخاطر"
      : "I'll analyze the project structure. First, let me list the files and then examine the AST.\n\n**Planned steps:**\n1. List file tree\n2. Parse AST for each JS file\n3. Summarize structure and risks";
  } else if (/أصلح|fix|lint|eslint|أخطاء|errors/i.test(promptText)) {
    // Intent: auto-fix — simulate auto_fix tool call.
    toolCalls = [
      { id: crypto.randomUUID(), name: "auto_fix", input: { path: ".", dryRun: true } },
    ];
    text = arabic
      ? "سأفحص المشروع بحثًا عن مشاكل قابلة للإصلاح التلقائي. سأبدأ بـ dry run لعرض التغييرات المقترحة قبل التطبيق.\n\n**الإصلاحات الممكنة:**\n- trailing newlines\n- tabs → spaces\n- JSON pretty-printing"
      : "I'll scan the project for auto-fixable issues. Starting with a dry run to preview changes before applying.\n\n**Possible fixes:**\n- Trailing newlines\n- Tabs → spaces\n- JSON pretty-printing";
  } else if (/صمّم|design|artifact|واجهة|landing/i.test(promptText)) {
    // Intent: design — simulate write_file for an HTML artifact.
    toolCalls = [
      { id: crypto.randomUUID(), name: "write_file", input: { path: "designs/generated.html", content: "<!-- generated artifact -->" } },
    ];
    text = arabic
      ? "سأصمّم واجهة أصلية متجاوبة كـ HTML artifact. سأنشئ ملفًا ذاتي الاحتواء مع CSS inline ودعم RTL.\n\n**المواصفات:**\n- متجاوب من 360px إلى 1440px\n- دعم RTL والعربية\n- لا أصول خارجية"
      : "I'll design a responsive native interface as an HTML artifact. Creating a self-contained file with inline CSS and RTL support.\n\n**Specs:**\n- Responsive 360px–1440px\n- RTL and Arabic support\n- No external assets";
  } else if (/ابحث|search|grep|find|بحث/i.test(promptText)) {
    // Intent: search — simulate grep tool call.
    toolCalls = [
      { id: crypto.randomUUID(), name: "grep", input: { pattern: "function", glob: "*.js", contextBefore: 1, contextAfter: 1 } },
    ];
    text = arabic
      ? "سأبحث في المشروع باستخدام grep متقدم مع context lines. سأعرض النتائج مرتبة حسب الصلة."
      : "I'll search the project using advanced grep with context lines. Results will be ranked by relevance.";
  } else {
    // Default: general response explaining capabilities.
    text = arabic
      ? "أنا أعمل الآن في الوضع التجريبي المحلي. ربط مزوّد من الإعدادات يفعّل التنفيذ الحقيقي.\n\n**ما يمكنني فعله في demo mode:**\n- تحليل بنية المشروع (اكتب: «حلّل المشروع»)\n- اقتراح إصلاحات (اكتب: «أصلح الأخطاء»)\n- تصميم artifacts (اكتب: «صمّم واجهة»)\n- البحث في الكود (اكتب: «ابحث عن ...»)\n\nجرّب أحد هذه الأوامر لأرى محاكاة استدعاءات الأدوات!"
      : "I'm running in local demo mode. Connect a provider in Settings for live execution.\n\n**What I can do in demo mode:**\n- Analyze project structure (type: \"analyze project\")\n- Suggest fixes (type: \"fix errors\")\n- Design artifacts (type: \"design a landing page\")\n- Search code (type: \"search for ...\")\n\nTry one of these commands to see simulated tool calls!";
  }

  // Simulate streaming in demo mode so the UI exercises the same path as live providers.
  if (request.stream && request.onDelta) {
    const words = text.split(/(\s+)/);
    return new Promise((resolve) => {
      let index = 0;
      const tick = () => {
        if (index >= words.length) {
          return resolve({ text, toolCalls, stopReason: "stop", usage: { inputTokens: 12, outputTokens: Math.ceil(text.length / 4) } });
        }
        const chunk = words.slice(index, index + 2).join("");
        index += 2;
        request.onDelta(chunk);
        setTimeout(tick, 18);
      };
      tick();
    });
  }
  return Promise.resolve({ text, toolCalls, stopReason: "stop", usage: { inputTokens: 12, outputTokens: Math.ceil(text.length / 4) } });
}

export async function callModel(options, request, env = process.env) {
  const preset = PROVIDERS[options.provider] ?? PROVIDERS.custom;
  const config = {
    ...preset,
    model: options.model || preset.defaultModel,
    baseUrl: options.baseUrl || (options.provider === "custom" ? env.CUSTOM_BASE_URL : preset.baseUrl),
    apiKey: options.apiKey || (preset.env ? env[preset.env] : undefined),
    headers: options.headers,
  };
  if (preset.kind === "demo") return demo(request);
  if (!config.baseUrl) throw new ProviderError("Provider base URL is required", 400);
  if (preset.kind !== "ollama" && options.provider !== "custom" && !config.apiKey) throw new ProviderError(`API key is not configured for ${preset.label}`, 400);
  if (preset.kind === "anthropic") return callAnthropic(config, request);
  if (preset.kind === "google") return callGoogle(config, request);
  if (preset.kind === "ollama") return callOllama(config, request);
  return callOpenAI(config, request);
}
