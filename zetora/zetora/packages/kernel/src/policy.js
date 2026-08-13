export const Risk = Object.freeze({
  OBSERVE: "observe",
  MODIFY: "modify",
  EXECUTE: "execute",
  EXTERNAL: "external",
  BLOCKED: "blocked",
});

const destructive = [
  /(^|\s)rm\s+(-[^\s]*[rf][^\s]*\s+)*\/?($|\s)/i,
  /(^|\s)(mkfs|fdisk|parted|shutdown|reboot|halt)\b/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
  /(^|\s)dd\s+.*\bof=\/dev\//i,
  /(^|\s)chmod\s+-R\s+777\s+\//i,
];

const readonly = [
  /^\s*(pwd|ls|find|cat|head|tail|sed|grep|rg|wc|git\s+(status|diff|log|show)|npm\s+(test|run\s+test)|node\s+--test)\b/i,
];

export function classifyCommand(command) {
  const value = String(command || "").trim();
  if (!value) return { risk: Risk.BLOCKED, reason: "Empty command" };
  if (value.includes("\0") || destructive.some((rule) => rule.test(value))) {
    return { risk: Risk.BLOCKED, reason: "Command matches a destructive safety rule" };
  }
  if (readonly.some((rule) => rule.test(value)) && !/[>|]\s*[^&]/.test(value)) {
    return { risk: Risk.OBSERVE, reason: "Read-only command" };
  }
  return { risk: Risk.EXECUTE, reason: "Command can change the system and requires approval" };
}

export function toolRisk(name) {
  if (["list_files", "read_file", "search_text", "grep", "fetch_url", "run_tests", "parse_ast", "search_index", "todo_update"].includes(name)) return Risk.OBSERVE;
  if (["write_file", "replace_text", "auto_fix"].includes(name)) return Risk.MODIFY;
  if (name === "run_command") return Risk.EXECUTE;
  if (["spawn_subagent", "worktree"].includes(name)) return Risk.EXTERNAL;
  return Risk.BLOCKED;
}
