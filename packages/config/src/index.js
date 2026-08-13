/**
 * Environment configuration and validation.
 *
 * v0.9.1: centralizes all environment-variable access so the rest of the
 * codebase never reads process.env directly. This gives us:
 *   1. Type coercion (numbers, booleans, URLs).
 *   2. Validation at startup (fail fast on misconfiguration).
 *   3. A single source of truth for what env vars the app uses.
 *   4. Redaction in logs (secrets are never printed).
 *   5. Easy testing (inject a fake env in tests).
 *
 * Usage:
 *   import { config } from "./packages/config/src/index.js";
 *   await config.load();          // validate + load .env file
 *   config.server.port             // 4173 (number, not string)
 *   config.providers.openai.key    // the API key (or null)
 */

import { readFile } from "node:fs/promises";

/** @typedef {{ type: "string"|"number"|"boolean"|"url", default?: any, secret?: boolean, min?: number, max?: number, required?: boolean, enum?: string[] }} FieldSpec */

/** @type {Record<string, FieldSpec>} */
const SCHEMA = {
  // --- Server ---
  ZETORA_PORT:          { type: "number", default: 4173, min: 1, max: 65535 },
  ZETORA_HOST:          { type: "string", default: "127.0.0.1" },
  ZETORA_ALLOW_REMOTE:  { type: "boolean", default: false },
  ZETORA_WORKSPACE:     { type: "string", default: "./workspace" },
  ZETORA_DATA:          { type: "string", default: "./.zetora" },
  ZETORA_LOG_LEVEL:     { type: "string", default: "info", enum: ["debug", "info", "warn", "error"] },

  // --- Security ---
  ZETORA_RATE_LIMIT_MAX:    { type: "number", default: 200, min: 1 },
  ZETORA_RATE_LIMIT_WINDOW: { type: "number", default: 60_000, min: 1000 },
  ZETORA_AUDIT_MAX_BYTES:   { type: "number", default: 10_485_760, min: 1024 },
  ZETORA_AUDIT_MAX_FILES:   { type: "number", default: 5, min: 1, max: 100 },
  ZETORA_SESSION_SECRET:    { type: "string", secret: true, required: false },

  // --- Provider API keys (all secret) ---
  OPENAI_API_KEY:      { type: "string", secret: true },
  ANTHROPIC_API_KEY:   { type: "string", secret: true },
  GOOGLE_API_KEY:      { type: "string", secret: true },
  OPENROUTER_API_KEY:  { type: "string", secret: true },
  CUSTOM_API_KEY:      { type: "string", secret: true },
  CUSTOM_BASE_URL:     { type: "url" },

  // --- Provider defaults ---
  ZETORA_PROVIDER:     { type: "string", default: "demo" },
  ZETORA_MODEL:        { type: "string" },

  // --- Desktop / Electron ---
  ZETORA_DESKTOP:      { type: "boolean", default: false },

  // --- Node environment ---
  NODE_ENV:            { type: "string", default: "development", enum: ["development", "production", "test"] },
};

class Config {
  constructor() {
    this.server = {};
    this.security = {};
    this.providers = {};
    this.desktop = {};
    this.node = {};
    this._loaded = false;
    this._raw = {};
  }

  /**
   * Load and validate the environment. Reads `.env` if present (without
   * requiring an external dependency), then validates every field in SCHEMA.
   * Throws on the first invalid required field.
   */
  async load(env = process.env, envPath = ".env") {
    // 1. Read .env file (optional, best-effort).
    const fileVars = await this.#readDotEnv(envPath);
    const merged = { ...fileVars, ...env };

    // 2. Parse each field according to SCHEMA.
    const errors = [];
    for (const [key, spec] of Object.entries(SCHEMA)) {
      const raw = merged[key];
      try {
        this._raw[key] = raw;
        const value = this.#coerce(key, spec, raw);
        this.#assign(key, value);
      } catch (error) {
        if (spec.required) errors.push(`${key}: ${error.message}`);
        else if (raw !== undefined && raw !== "") errors.push(`${key}: ${error.message} (using default)`);
      }
    }

    // 3. Fail fast on required-field errors.
    if (errors.length) {
      throw new Error(`Environment validation failed:\n  ${errors.join("\n  ")}`);
    }

    this._loaded = true;
    return this;
  }

  /**
   * Read a .env file and return a key/value map. Lines starting with # are
   * comments. Values may be quoted ("..." or '...'). No shell expansion.
   */
  async #readDotEnv(envPath) {
    try {
      const content = await readFile(envPath, "utf8");
      const vars = {};
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        // Strip surrounding quotes.
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        vars[key] = value;
      }
      return vars;
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw error;
    }
  }

  /**
   * Coerce a raw string value into the type specified by the field spec.
   */
  #coerce(key, spec, raw) {
    // Missing value → use default (or undefined for optional fields).
    if (raw === undefined || raw === "") {
      if (spec.required) throw new Error("is required but not set");
      return spec.default;
    }

    switch (spec.type) {
      case "string":
        if (spec.enum && !spec.enum.includes(raw)) {
          throw new Error(`must be one of: ${spec.enum.join(", ")}`);
        }
        return raw;

      case "number": {
        const num = Number(raw);
        if (Number.isNaN(num)) throw new Error(`must be a number, got "${raw}"`);
        if (spec.min !== undefined && num < spec.min) throw new Error(`must be >= ${spec.min}`);
        if (spec.max !== undefined && num > spec.max) throw new Error(`must be <= ${spec.max}`);
        return num;
      }

      case "boolean": {
        const lower = raw.toLowerCase();
        if (["1", "true", "yes", "on"].includes(lower)) return true;
        if (["0", "false", "no", "off", ""].includes(lower)) return false;
        throw new Error(`must be a boolean (1/0/true/false), got "${raw}"`);
      }

      case "url":
        try { return new URL(raw).href; }
        catch { throw new Error(`must be a valid URL, got "${raw}"`); }

      default:
        return raw;
    }
  }

  /**
   * Assign a parsed value to the correct namespace in the config object.
   */
  #assign(key, value) {
    if (key === "ZETORA_PORT" || key === "ZETORA_HOST" || key === "ZETORA_ALLOW_REMOTE" || key === "ZETORA_WORKSPACE" || key === "ZETORA_DATA" || key === "ZETORA_LOG_LEVEL") {
      const prop = key.replace("ZETORA_", "").toLowerCase();
      this.server[prop] = value;
    } else if (key.startsWith("ZETORA_RATE_LIMIT") || key.startsWith("ZETORA_AUDIT") || key === "ZETORA_SESSION_SECRET") {
      const prop = key.replace("ZETORA_", "").toLowerCase();
      this.security[prop] = value;
    } else if (key.startsWith("OPENAI_") || key.startsWith("ANTHROPIC_") || key.startsWith("GOOGLE_") || key.startsWith("OPENROUTER_") || key.startsWith("CUSTOM_") || key === "ZETORA_PROVIDER" || key === "ZETORA_MODEL") {
      const prop = key.replace(/^(OPENAI|ANTHROPIC|GOOGLE|OPENROUTER|CUSTOM|ZETORA)_/, "").toLowerCase();
      this.providers[prop] = value;
    } else if (key === "ZETORA_DESKTOP") {
      this.desktop.enabled = value;
    } else if (key === "NODE_ENV") {
      this.node.env = value;
    }
  }

  /**
   * Return a redacted summary of the config for logging. Secrets are replaced
   * with "[SET]" or "[UNSET]" — never the actual value.
   */
  toRedactedString() {
    const lines = [];
    for (const [key, spec] of Object.entries(SCHEMA)) {
      const raw = this._raw[key];
      const display = spec.secret
        ? (raw ? "[SET]" : "[UNSET]")
        : (raw ?? spec.default ?? "[UNSET]");
      lines.push(`  ${key}=${display}`);
    }
    return lines.join("\n");
  }

  /** True if running in production mode. */
  get isProduction() { return this.node.env === "production"; }
  /** True if running in development mode. */
  get isDevelopment() { return this.node.env === "development"; }
  /** True if running in test mode. */
  get isTest() { return this.node.env === "test"; }
}

/** Singleton config instance. */
export const config = new Config();

/** Schema (exported for introspection / docs generation). */
export const ENV_SCHEMA = SCHEMA;
