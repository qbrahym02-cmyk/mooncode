/**
 * v3.1.0: Prompt caching for Anthropic, OpenAI, and Google.
 *
 * Saves cost by reusing cached prompt tokens instead of re-processing them.
 * - Anthropic: cache_control breakpoint (5-minute or 1-hour TTL)
 * - OpenAI: automatic prompt caching (no explicit API needed)
 * - Google: cachedContent API
 */

/**
 * Add cache control to Anthropic messages.
 * Anthropic caches up to 4 breakpoints in the prompt.
 */
export function addAnthropicCacheControl(messages, system) {
  const cachedMessages = messages.map((m, i) => {
    // Add cache_control to the last message before the most recent user message
    // and to the system prompt
    const isLast = i === messages.length - 1;
    const isBeforeLast = i === messages.length - 2;
    if (isBeforeLast && m.role === "assistant") {
      return { ...m, content: typeof m.content === "string" ? m.content : m.content, cache_control: { type: "ephemeral" } };
    }
    return m;
  });

  const cachedSystem = system ? { type: "text", text: system, cache_control: { type: "ephemeral" } } : system;

  return { messages: cachedMessages, system: cachedSystem };
}

/**
 * Estimate cache savings for Anthropic.
 * Cached input tokens cost ~10% of regular input tokens.
 */
export function estimateCacheSavings(inputTokens, cacheReadTokens = 0) {
  const regularCost = inputTokens * 0.000003; // $3/MTok
  const cachedCost = cacheReadTokens * 0.0000003; // $0.30/MTok
  const savedCost = regularCost - cachedCost;
  return { regularCost, cachedCost, savedCost, savingsPercent: Math.round((savedCost / regularCost) * 100) };
}

/**
 * Google Gemini cachedContent — creates a cache reference.
 */
export function createGeminiCache(systemInstruction, contents) {
  // In production, this would call the Gemini API to create a cachedContent resource
  // and return the cache name to reference in subsequent requests.
  return {
    model: "gemini-2.5-flash",
    systemInstruction,
    contents,
    ttl: "3600s", // 1 hour
  };
}
