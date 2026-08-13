export const Risk = Object.freeze({
  OBSERVE: "observe",
  MODIFY: "modify",
  EXECUTE: "execute",
  EXTERNAL: "external",
  BLOCKED: "blocked",
});

/**
 * Destructive command patterns. Each rule is a RegExp that, if matched,
 * classifies the command as BLOCKED — it will not run even with approval.
 *
 * v0.9.1 hardening (addresses weaknesses documented in the security audit):
 * - Added: `rm` with variable expansion targets ($HOME, ~, ${...}).
 * - Added: Windows destructive commands (rmdir /s, del /f /s, format, diskpart).
 * - Added: Network-to-execution pipes (`curl ... | sh`, `wget ... | bash`).
 * - Added: Writing to block devices via redirection (`> /dev/sda`).
 * - Added: Modifying system files (`/etc/`, `/boot/`, `/usr/`).
 * - Added: Killing critical processes (`kill -9 1`, `killall systemd`).
 * - Added: Cron/at injection (`crontab`, `at`).
 * - Added: SSH/RDP tunneling that could exfiltrate data.
 * - Kept: original fork-bomb pattern.
 * - Kept: `mkfs`, `fdisk`, `parted`, `shutdown`, `reboot`, `halt`.
 * - Kept: `dd of=/dev/...`.
 * - Kept: `chmod -R 777 /`.
 *
 * NOTE: A denylist is never sufficient on its own. Production deployments
 * should additionally use container isolation (seccomp, namespaces) for
 * agent-initiated commands. This list is a defense-in-depth layer.
 */
const destructive = [
  // rm with recursive/force flags targeting root, home, or variable expansions
  /(^|\s|;|&&|\|\|)rm\s+(-[^\s]*[rRf][^\s]*\s+)+(\/|~|\$HOME|\$\{?[A-Z_]+\}?|\*|\.)/i,
  /(^|\s|;|&&|\|\|)rm\s+(-[^\s]*[rRf][^\s]*\s+)+\.\./i,
  // Windows: rmdir /s /q, del /f /s, format, diskpart
  /(^|\s|;|&)(rmdir|rd)\s+\/[sS]\b/i,
  /(^|\s|;|&)del\s+\/[fF]/i,
  /(^|\s|;|&)format\s+[a-z]:/i,
  /(^|\s|;|&)diskpart\b/i,
  // Disk/filesystem destruction
  /(^|\s)(mkfs|fdisk|parted|shutdown|reboot|halt|poweroff)\b/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/, // fork bomb
  /(^|\s)dd\s+.*\bof=\/dev\//i,
  // Writing to block devices via redirection
  />\s*\/dev\/(?:sd|nvme|hd|vd|xvd)[a-z]/i,
  // chmod 777 on root or system dirs
  /(^|\s)chmod\s+-R\s+[0-7]{3,4}\s+\/(etc|boot|usr|var|sys|proc|dev)\b/i,
  /(^|\s)chmod\s+-R\s+777\s+\//i,
  // Network-to-execution pipes (remote code execution)
  /\b(?:curl|wget|fetch)\b[^|]*\|\s*(?:sh|bash|zsh|fish|python|perl|ruby|node)\b/i,
  // Modifying system files directly
  /(^|\s|;|&&|\|\|)>\s*\/etc\//i,
  /(^|\s|;|&&|\|\|)>\s*\/boot\//i,
  /(^|\s|;|&&|\|\|)>\s*\/usr\//i,
  // Killing init/systemd (PID 1 or systemd by name)
  /(^|\s)kill\s+-9\s+1\b/i,
  /(^|\s)killall\s+(systemd|init|launchd)\b/i,
  // Cron/at injection (persistence)
  /(^|\s)crontab\b/i,
  /(^|\s)\bat\s+\b/i,
  // SSH reverse tunnels that could exfiltrate (sudo ssh -R with arbitrary host)
  /(^|\s)ssh\s+.*-R\s+\*:/i,
];

/**
 * Read-only command patterns. Matched commands are classified as OBSERVE
 * and run without approval. The pipeline guard rejects read-only commands
 * that pipe to other commands (e.g. `cat file | sh`).
 */
const readonly = [
  /^\s*(pwd|ls|find|cat|head|tail|sed|grep|rg|wc|git\s+(status|diff|log|show)|npm\s+(test|run\s+test)|node\s+--test)\b/i,
];

/**
 * Classify a shell command by risk level.
 *
 * Returns { risk, reason }. Risk is one of:
 *   - BLOCKED:  never runs (destructive or empty)
 *   - OBSERVE:  read-only, runs without approval
 *   - EXECUTE:  can change the system, requires approval
 *
 * The classifier is intentionally conservative: any command it cannot
 * confidently classify as OBSERVE is treated as EXECUTE.
 */
export function classifyCommand(command) {
  const value = String(command || "").trim();
  if (!value) return { risk: Risk.BLOCKED, reason: "Empty command" };
  // Null bytes are always blocked (could be used to truncate command parsing).
  if (value.includes("\0")) return { risk: Risk.BLOCKED, reason: "Null byte in command" };
  // Check destructive patterns first.
  for (const rule of destructive) {
    if (rule.test(value)) {
      return { risk: Risk.BLOCKED, reason: `Command matches a destructive safety rule: ${rule.source.slice(0, 60)}` };
    }
  }
  // Read-only commands are only safe if they don't pipe to other commands.
  // `cat file | sh` would be EXECUTE despite `cat` being read-only.
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
