/**
 * Moon Code provider adapters — unified entry point.
 *
 * v0.9.1 refactor: the monolithic 551-line index.js has been split into
 * focused files per provider. This file now serves as the public API
 * surface, re-exporting the shared helpers and routing `callModel` to
 * the correct adapter based on the provider's `kind`.
 *
 * File layout:
 *   shared.js    — ProviderError, jsonRequest, message converters, price table
 *   openai.js    — OpenAI + OpenRouter + custom OpenAI-compatible endpoints
 *   anthropic.js — Anthropic Messages API
 *   google.js    — Google Generative Language API (Gemini)
 *   ollama.js    — Ollama local models
 *   demo.js      — offline simulation provider (default for new installs)
 *
 * Public API (unchanged from v0.9.0):
 *   - providerCatalog(env)
 *   - callModel(options, request, env)
 *   - estimateCost(model, usage)
 *   - ProviderError
 */
import { ProviderError, estimateCost } from "./shared.js";
import { callOpenAI } from "./openai.js";
import { callAnthropic } from "./anthropic.js";
import { callGoogle } from "./google.js";
import { callOllama } from "./ollama.js";
import { demo } from "./demo.js";

export { ProviderError, estimateCost };

/**
 * Provider preset table. Each entry maps a Moon Code provider id to its
 * configuration: label, default model, env var holding the API key,
 * base URL, and `kind` (which adapter to route to).
 *
 * `kind` values:
 *   - "demo"      → demo.js (offline simulation)
 *   - "openai"    → openai.js (OpenAI / OpenRouter / custom)
 *   - "anthropic" → anthropic.js
 *   - "google"    → google.js
 *   - "ollama"    → ollama.js
 */
const PROVIDERS = Object.freeze({
  demo: { label: "Moon Code Demo", defaultModel: "demo-local", env: null, kind: "demo" },
  openai: { label: "OpenAI", defaultModel: "gpt-5-mini", env: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1", kind: "openai" },
  anthropic: { label: "Anthropic", defaultModel: "claude-sonnet-4-5", env: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1", kind: "anthropic" },
  google: { label: "Google", defaultModel: "gemini-2.5-flash", env: "GOOGLE_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta", kind: "google" },
  openrouter: { label: "OpenRouter", defaultModel: "openai/gpt-5-mini", env: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1", kind: "openai" },
  ollama: { label: "Ollama", defaultModel: "qwen3-coder", env: null, baseUrl: "http://127.0.0.1:11434", kind: "ollama" },
  // v3.0.0: new providers
  azure: { label: "Azure OpenAI", defaultModel: "gpt-4o", env: "AZURE_API_KEY", kind: "openai" },
  bedrock: { label: "AWS Bedrock", defaultModel: "anthropic.claude-sonnet-4-5", env: "AWS_ACCESS_KEY_ID", kind: "openai" },
  xai: { label: "xAI (Grok)", defaultModel: "grok-3", env: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1", kind: "openai" },
  cloudflare: { label: "Cloudflare AI", defaultModel: "@cf/meta/llama-3.1-70b-instruct", env: "CLOUDFLARE_API_KEY", kind: "openai" },
  mistral: { label: "Mistral AI", defaultModel: "mistral-large-latest", env: "MISTRAL_API_KEY", baseUrl: "https://api.mistral.ai/v1", kind: "openai" },
  groq: { label: "Groq", defaultModel: "llama-3.3-70b-versatile", env: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1", kind: "openai" },
  deepseek: { label: "DeepSeek", defaultModel: "deepseek-coder", env: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1", kind: "openai" },
  custom: { label: "Custom provider", defaultModel: "custom-model", env: "CUSTOM_API_KEY", kind: "openai" },
});

/**
 * Return a catalog of available providers with their configured status.
 * Used by the UI to show which providers have API keys set.
 */
export function providerCatalog(env = process.env) {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    label: provider.label,
    defaultModel: provider.defaultModel,
    configured: id === "demo"
      || id === "ollama"
      || Boolean(provider.env && env[provider.env])
      || (id === "custom" && Boolean(env.CUSTOM_BASE_URL)),
  }));
}

/**
 * Route a model call to the correct provider adapter.
 *
 * Options:
 *   - provider: provider id (demo / openai / anthropic / google / openrouter / ollama / custom)
 *   - model:    model name (falls back to the provider's defaultModel)
 *   - apiKey:   API key (falls back to the provider's env var)
 *   - baseUrl:  override the provider's default base URL
 *   - headers:  extra request headers
 *
 * Request:
 *   - messages:  unified message array (string or multimodal content)
 *   - tools:     tool definitions (optional)
 *   - stream:    enable SSE/NDJSON streaming (optional)
 *   - onDelta:   streaming text callback (optional)
 *   - signal:    AbortSignal to cancel the request (optional)
 *   - temperature, maxTokens: optional generation params
 */
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
  if (preset.kind !== "ollama" && options.provider !== "custom" && !config.apiKey) {
    throw new ProviderError(`API key is not configured for ${preset.label}`, 400);
  }

  // Route to the correct adapter based on the provider kind.
  switch (preset.kind) {
    case "anthropic": return callAnthropic(config, request);
    case "google":    return callGoogle(config, request);
    case "ollama":    return callOllama(config, request);
    case "openai":
    default:          return callOpenAI(config, request);
  }
}
