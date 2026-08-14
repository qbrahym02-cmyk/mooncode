/**
 * Secret redaction: scan strings for common secret patterns and replace them
 * with [REDACTED:TYPE] before logging or returning in API responses.
 *
 * Patterns are deliberately conservative — false positives (redacting
 * non-secrets) are safer than false negatives (leaking real secrets).
 */
export const SECRET_PATTERNS = [
  { type: "api_key_openai", pattern: /sk-proj-[a-zA-Z0-9]{20,}/g, replacement: "[REDACTED:OPENAI_KEY]" },
  { type: "api_key_openai_legacy", pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[REDACTED:OPENAI_KEY]" },
  { type: "api_key_anthropic", pattern: /sk-ant-[a-zA-Z0-9-_]{20,}/g, replacement: "[REDACTED:ANTHROPIC_KEY]" },
  { type: "github_token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g, replacement: "[REDACTED:GITHUB_TOKEN]" },
  // Bearer tokens must be checked BEFORE JWT (JWTs often appear after "Bearer ").
  { type: "bearer_token", pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/g, replacement: "[REDACTED:BEARER_TOKEN]" },
  { type: "jwt", pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, replacement: "[REDACTED:JWT]" },
  { type: "aws_access_key", pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED:AWS_ACCESS_KEY]" },
  { type: "aws_secret", pattern: /aws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi, replacement: "[REDACTED:AWS_SECRET]" },
  { type: "private_key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, replacement: "[REDACTED:PRIVATE_KEY]" },
  { type: "google_api_key", pattern: /AIza[0-9A-Za-z_-]{35}/g, replacement: "[REDACTED:GOOGLE_API_KEY]" },
  { type: "generic_password", pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi, replacement: "[REDACTED:PASSWORD]" },
];

/**
 * Redact all known secret patterns from a string.
 * Returns the redacted string. The `found` array lists what was removed
 * (without the actual values) so callers can audit.
 */
export function redactSecrets(input) {
  const text = String(input ?? "");
  const found = [];
  let redacted = text;
  for (const entry of SECRET_PATTERNS) {
    const matches = redacted.match(entry.pattern);
    if (matches && matches.length) {
      for (const match of matches) {
        found.push({ type: entry.type, length: match.length });
      }
      redacted = redacted.replaceAll(entry.pattern, entry.replacement);
    }
  }
  return { redacted, found };
}

/**
 * Check whether a string CONTAINS what looks like a secret. Returns the list
 * of detected types (empty if no secrets detected).
 */
export function detectSecrets(input) {
  const text = String(input ?? "");
  const types = new Set();
  for (const entry of SECRET_PATTERNS) {
    if (entry.pattern.test(text)) {
      types.add(entry.type);
    }
    // Reset lastIndex for global regexes
    entry.pattern.lastIndex = 0;
  }
  return [...types];
}

/**
 * Middleware-style wrapper: runs a function and redacts the result.
 * Useful for wrapping log writers.
 */
export function withRedaction(fn) {
  return async (...args) => {
    const result = await fn(...args);
    if (typeof result === "string") return redactSecrets(result).redacted;
    if (result && typeof result === "object") {
      const json = JSON.stringify(result);
      const { redacted } = redactSecrets(json);
      return JSON.parse(redacted);
    }
    return result;
  };
}
