/**
 * v3.3.0: Per-model system prompt selector.
 * Chooses the best system prompt based on the model being used.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const promptsDir = path.join(here, "prompts");

const PROMPT_MAP = {
  // Anthropic models
  "claude-": "anthropic.txt",
  // OpenAI GPT models
  "gpt-5": "beast.txt",
  "gpt-4o": "gpt.txt",
  "gpt-4.1": "gpt.txt",
  "gpt-4": "gpt.txt",
  "o1": "beast.txt",
  "o3": "beast.txt",
  // Google Gemini
  "gemini-": "gemini.txt",
  // Kimi
  "kimi": "kimi.txt",
  // Codex
  "codex": "codex.txt",
  "trinity": "trinity.txt",
  "meta": "meta.txt",
};

const promptCache = new Map();

/**
 * Get the system prompt for a specific model.
 */
export async function getSystemPromptForModel(modelId) {
  if (!modelId) return loadPrompt("default.txt");

  // Find matching prompt file
  let promptFile = "default.txt";
  for (const [prefix, file] of Object.entries(PROMPT_MAP)) {
    if (modelId.toLowerCase().includes(prefix.toLowerCase())) {
      promptFile = file;
      break;
    }
  }

  return loadPrompt(promptFile);
}

async function loadPrompt(filename) {
  if (promptCache.has(filename)) return promptCache.get(filename);
  try {
    const content = await readFile(path.join(promptsDir, filename), "utf8");
    promptCache.set(filename, content);
    return content;
  } catch {
    const fallback = "You are Moon Code, a careful code and design agent.";
    promptCache.set(filename, fallback);
    return fallback;
  }
}

/**
 * List all available prompt files.
 */
export function listPromptFiles() {
  return Object.values(PROMPT_MAP);
}
