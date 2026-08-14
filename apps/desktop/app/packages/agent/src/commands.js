/**
 * v3.5.0: Command system — slash commands with templates.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, "templates");

export const BUILTIN_COMMANDS = [
  { name: "review", description: "Review code changes in the workspace", template: "review.txt" },
  { name: "init", description: "Initialize a new project with Moon Code conventions", template: "initialize.txt" },
  { name: "test", description: "Run tests and analyze failures", template: "test.txt" },
  { name: "fix", description: "Auto-fix common issues", template: "fix.txt" },
  { name: "docs", description: "Generate documentation", template: "docs.txt" },
  { name: "refactor", description: "Suggest refactoring improvements", template: "refactor.txt" },
  { name: "security", description: "Security audit of the codebase", template: "security.txt" },
  { name: "deploy", description: "Prepare for deployment", template: "deploy.txt" },
];

export async function getCommandTemplate(commandName) {
  const cmd = BUILTIN_COMMANDS.find((c) => c.name === commandName);
  if (!cmd) return null;
  try { return await readFile(path.join(templatesDir, cmd.template), "utf8"); }
  catch { return null; }
}

export async function executeCommand(commandName, context = {}) {
  const template = await getCommandTemplate(commandName);
  if (!template) return { error: `Unknown command: /${commandName}` };
  let prompt = template;
  for (const [key, value] of Object.entries(context)) {
    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return { prompt, command: commandName };
}

export function listCommands() {
  return BUILTIN_COMMANDS.map((c) => ({ name: c.name, description: c.description }));
}
