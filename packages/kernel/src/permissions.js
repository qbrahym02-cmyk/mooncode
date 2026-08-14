/**
 * v3.0.0: Pattern-based permission system.
 *
 * Inspired by OpenCode's permission model: rules are {permission, pattern, action}
 * where action ∈ {allow, ask, deny}. Patterns are wildcard-glob. Later rules
 * override earlier ones. Default action is "ask".
 *
 * This replaces the simple 5-level risk system with a fine-grained,
 * per-pattern permission model that supports:
 *   - File-specific rules: read: {"*.env": "ask", "*": "allow"}
 *   - "always" approval: saved rules auto-apply to future requests
 *   - Cascade rejection: one deny cascades to all pending in session
 *   - Plugin override: hooks can modify permission decisions
 */

/** @typedef {"allow" | "ask" | "deny"} Action */
/** @typedef {"read" | "write" | "edit" | "execute" | "external" | "bash" | "mcp" | "web"} Permission */

/**
 * @typedef {Object} Rule
 * @property {Permission} permission
 * @property {string} pattern - wildcard glob (e.g. "*.env", "*.ts", "*", "src/**")
 * @property {Action} action
 */

/**
 * @typedef {Object} PermissionRequest
 * @property {string} id
 * @property {Permission} permission
 * @property {string} pattern - the specific pattern being requested
 * @property {string} [summary] - human-readable description
 * @property {string} [tool] - which tool is requesting
 * @property {string} [path] - file path if applicable
 * @property {string} [command] - command if applicable
 * @property {number} createdAt
 */

/**
 * @typedef {Object} PermissionReply
 * @property {"once" | "always" | "reject"} type
 * @property {Action} [action] - the action to save if "always"
 */

/**
 * Convert a glob pattern to a RegExp.
 * Supports: * (any chars except /), ** (any path), ? (single char).
 */
function globToRegex(pattern) {
  // Special case: "*" matches everything (including slashes)
  if (pattern === "*") return /^.*$/i;
  let p = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  p = p.replace(/\*\*/g, "::DOUBLESTAR::");
  p = p.replace(/\*/g, "[^/]*");
  p = p.replace(/::DOUBLESTAR::/g, ".*");
  p = p.replace(/\?/g, ".");
  return new RegExp(`^${p}$`, "i");
}

/**
 * Match a path against a glob pattern.
 */
function matchPattern(pattern, path) {
  try {
    return globToRegex(pattern).test(path);
  } catch {
    return false;
  }
}

/**
 * Evaluate permissions against a set of rulesets.
 * Finds the LAST matching rule (later rules override earlier).
 * @param {Permission} permission
 * @param {string} path - the path/command being evaluated
 * @param {Rule[][]} rulesets - array of rulesets (merged in order)
 * @returns {Action} - "allow", "ask", or "deny"
 */
export function evaluate(permission, path, ...rulesets) {
  const allRules = rulesets.flat();
  let result = "ask"; // default
  let bestSpecificity = -1;

  for (const rule of allRules) {
    // Rule matches if permission matches (or is "*") AND pattern matches.
    const permMatches = rule.permission === permission || rule.permission === "*";
    const patternMatches = matchPattern(rule.pattern, path);
    if (permMatches && patternMatches) {
      // v4.2: Use specificity — more specific patterns win over wildcards.
      // A pattern is more specific if it has fewer wildcards.
      const specificity = rule.pattern === "*" ? 0 : (rule.pattern.match(/\*/g)?.length || 0) === 0 ? 100 : (10 - (rule.pattern.match(/\*/g)?.length || 0));
      if (specificity >= bestSpecificity) {
        result = rule.action;
        bestSpecificity = specificity;
      }
    }
  }

  return result;
}

/**
 * Default permission ruleset for Moon Code.
 * Balances security with usability:
 *   - Read: allow everything except .env files (ask)
 *   - Write/Edit: ask by default, allow in workspace
 *   - Execute: ask always
 *   - External: ask always
 *   - Web: allow (read-only)
 */
export const DEFAULT_RULESET = /** @type {Rule[]} */ ([
  // Read: allow everything except secrets
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*.env", action: "ask" },
  { permission: "read", pattern: "*.env.*", action: "ask" },
  { permission: "read", pattern: "*.env.example", action: "allow" },
  { permission: "read", pattern: "*.key", action: "ask" },
  { permission: "read", pattern: "*.pem", action: "ask" },

  // Write/Edit: ask by default (safer than allow)
  { permission: "write", pattern: "*", action: "ask" },
  { permission: "edit", pattern: "*", action: "ask" },

  // Execute (shell commands): ask always
  { permission: "execute", pattern: "*", action: "ask" },

  // External (subagents, worktrees, MCP): ask always
  { permission: "external", pattern: "*", action: "ask" },

  // Web fetch: allow (read-only)
  { permission: "web", pattern: "*", action: "allow" },

  // Bash: allow read-only commands, ask for everything else
  { permission: "bash", pattern: "ls *", action: "allow" },
  { permission: "bash", pattern: "cat *", action: "allow" },
  { permission: "bash", pattern: "grep *", action: "allow" },
  { permission: "bash", pattern: "find *", action: "allow" },
  { permission: "bash", pattern: "git status", action: "allow" },
  { permission: "bash", pattern: "git diff *", action: "allow" },
  { permission: "bash", pattern: "git log *", action: "allow" },
  { permission: "bash", pattern: "npm test", action: "allow" },
  { permission: "bash", pattern: "node --test *", action: "allow" },
  { permission: "bash", pattern: "*", action: "ask" },
]);

/**
 * Permission Manager — manages rulesets, pending requests, and approvals.
 *
 * v3.0.0: replaces the simple Risk enum with a full pattern-based system.
 */
export class PermissionManager {
  constructor() {
    /** @type {Rule[]} */
    this.rules = [...DEFAULT_RULESET];
    /** @type {Map<string, PermissionRequest>} */
    this.pending = new Map();
    /** @type {Set<string>} */
    this.sessionDenied = new Set();
    /** @type {Function[]} */
    this.hooks = [];
  }

  /**
   * Add a hook that can modify permission decisions.
   * @param {Function} hook - (permission, path, action) => action | null
   */
  addHook(hook) {
    this.hooks.push(hook);
  }

  /**
   * Merge additional rules into the current ruleset.
   * @param {Rule[]} rules
   */
  addRules(rules) {
    this.rules.push(...rules);
  }

  /**
   * Check if an action is allowed for a given permission + path.
   * Returns "allow" | "ask" | "deny".
   */
  check(permission, path = "*") {
    let action = evaluate(permission, path, this.rules);

    // Run hooks — they can override the decision.
    for (const hook of this.hooks) {
      const override = hook(permission, path, action);
      if (override) action = override;
    }

    return action;
  }

  /**
   * Create a permission request (if action is "ask").
   * @returns {PermissionRequest | null} - null if auto-allowed
   */
  request(permission, path = "*", meta = {}) {
    const action = this.check(permission, path);

    if (action === "allow") return null;
    if (action === "deny") {
      const error = new Error(`Permission denied: ${permission} ${path}`);
      error.code = "PERMISSION_DENIED";
      throw error;
    }

    // "ask" — create a pending request
    const id = crypto.randomUUID();
    /** @type {PermissionRequest} */
    const req = {
      id,
      permission,
      pattern: path,
      summary: meta.summary || `${permission}: ${path}`,
      tool: meta.tool,
      path: meta.path,
      command: meta.command,
      createdAt: Date.now(),
    };
    this.pending.set(id, req);
    return req;
  }

  /**
   * Reply to a permission request.
   * @param {string} id - request ID
   * @param {PermissionReply} reply
   */
  reply(id, reply) {
    const req = this.pending.get(id);
    if (!req) throw new Error(`Permission request not found: ${id}`);

    this.pending.delete(id);

    if (reply.type === "reject") {
      // Cascade rejection: reject ALL pending requests in this session.
      this.sessionDenied.add(req.permission);
      const rejected = [...this.pending.keys()];
      this.pending.clear();
      return { rejected: [id, ...rejected] };
    }

    if (reply.type === "always" && reply.action) {
      // Save the rule so future requests auto-resolve.
      this.rules.push({
        permission: req.permission,
        pattern: req.pattern,
        action: reply.action,
      });

      // Auto-resolve other pending requests that now match.
      const autoResolved = [];
      for (const [pendingId, pendingReq] of this.pending) {
        if (this.check(pendingReq.permission, pendingReq.pattern) !== "ask") {
          this.pending.delete(pendingId);
          autoResolved.push(pendingId);
        }
      }
      return { resolved: [id, ...autoResolved] };
    }

    // "once" — just resolve this one
    return { resolved: [id] };
  }

  /**
   * Get all pending requests.
   */
  listPending() {
    return [...this.pending.values()];
  }

  /**
   * Clear all pending requests and session state.
   */
  reset() {
    this.pending.clear();
    this.sessionDenied.clear();
  }

  /**
   * Check if a permission was denied in this session.
   */
  isDenied(permission) {
    return this.sessionDenied.has(permission);
  }

  /**
   * Export the current ruleset (for persistence).
   */
  exportRules() {
    return [...this.rules];
  }

  /**
   * Import a ruleset (from persistence).
   */
  importRules(rules) {
    this.rules = [...DEFAULT_RULESET, ...rules];
  }
}

/**
 * Map Moon Code's old Risk levels to the new permission system.
 * This provides backward compatibility with existing tools.
 */
export function riskToPermission(toolName, input = {}) {
  if (["list_files", "read_file", "search_text", "grep", "fetch_url", "run_tests", "parse_ast", "search_index", "todo_update"].includes(toolName)) {
    return { permission: "read", path: input.path || input.query || "*" };
  }
  if (["write_file", "replace_text", "auto_fix"].includes(toolName)) {
    return { permission: "write", path: input.path || "*" };
  }
  if (toolName === "run_command") {
    return { permission: "bash", path: input.command || "*" };
  }
  if (["spawn_subagent", "worktree"].includes(toolName)) {
    return { permission: "external", path: "*" };
  }
  if (toolName.startsWith("mcp.")) {
    return { permission: "external", path: toolName };
  }
  return { permission: "execute", path: "*" };
}
