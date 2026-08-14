/**
 * v3.0.0: apply_patch tool — alternative to write_file/replace_text.
 *
 * Uses a custom diff format (inspired by OpenCode's apply_patch) that's
 * more efficient for LLMs to generate, especially for gpt-5+ models.
 *
 * Format:
 *   *** Begin Patch ***
 *   *** Add File: path/to/new.js ***
 *   +new content here
 *   +line by line
 *   *** End File ***
 *   *** Update File: path/to/existing.js ***
 *   @@ context line
 *   -old line to remove
 *   +new line to add
 *   @@ another context
 *   -another old
 *   +another new
 *   *** End File ***
 *   *** Delete File: path/to/old.js ***
 *   *** End Patch ***
 */

export function applyPatch(content, patch) {
  const lines = content.split("\n");
  const result = [];
  let lineIndex = 0;
  const patchLines = patch.split("\n");

  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];

    if (line.startsWith("@@")) {
      // Context line — find it in the remaining source
      const context = line.slice(2).trim();
      while (lineIndex < lines.length && lines[lineIndex].trim() !== context) {
        result.push(lines[lineIndex]);
        lineIndex++;
      }
      if (lineIndex < lines.length) {
        result.push(lines[lineIndex]);
        lineIndex++;
      }
    } else if (line.startsWith("-")) {
      // Remove line — skip matching source line
      const removeText = line.slice(1);
      if (lineIndex < lines.length && lines[lineIndex] === removeText) {
        lineIndex++;
      }
    } else if (line.startsWith("+")) {
      // Add line
      result.push(line.slice(1));
    } else if (line === "") {
      // Empty line in patch = preserve source line
      if (lineIndex < lines.length) {
        result.push(lines[lineIndex]);
        lineIndex++;
      }
    }
  }

  // Append remaining source lines
  while (lineIndex < lines.length) {
    result.push(lines[lineIndex]);
    lineIndex++;
  }

  return result.join("\n");
}

/**
 * Parse a full patch string with multiple file operations.
 * Returns array of { action, path, content, patch }.
 */
export function parsePatch(patchStr) {
  const operations = [];
  const lines = patchStr.split("\n");
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes("*** Begin Patch ***")) i++;
  i++;

  while (i < lines.length) {
    const line = lines[i];

    if (line.includes("*** End Patch ***")) break;

    if (line.includes("*** Add File:")) {
      const path = line.match(/\*\*\* Add File: (.+) \*\*\*/)?.[1]?.trim();
      if (!path) { i++; continue; }
      const content = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        if (lines[i].startsWith("+")) content.push(lines[i].slice(1));
        i++;
      }
      operations.push({ action: "add", path, content: content.join("\n") });
    } else if (line.includes("*** Update File:")) {
      const path = line.match(/\*\*\* Update File: (.+) \*\*\*/)?.[1]?.trim();
      if (!path) { i++; continue; }
      const patch = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        patch.push(lines[i]);
        i++;
      }
      operations.push({ action: "update", path, patch: patch.join("\n") });
    } else if (line.includes("*** Delete File:")) {
      const path = line.match(/\*\*\* Delete File: (.+) \*\*\*/)?.[1]?.trim();
      operations.push({ action: "delete", path });
      i++;
    } else {
      i++;
    }
  }

  return operations;
}

/**
 * External directories manager.
 * Allows read-only access to whitelisted directories outside the workspace.
 */
export class ExternalDirectories {
  constructor() {
    /** @type {Map<string, {path: string, description: string}>} */
    this.allowed = new Map();
  }

  add(id, path, description = "") {
    this.allowed.set(id, { path, description });
  }

  remove(id) {
    this.allowed.delete(id);
  }

  isAllowed(targetPath) {
    for (const { path } of this.allowed.values()) {
      if (targetPath.startsWith(path)) return true;
    }
    return false;
  }

  list() {
    return [...this.allowed.entries()].map(([id, info]) => ({ id, ...info }));
  }

  toPromptSummary() {
    if (this.allowed.size === 0) return null;
    const lines = [];
    for (const [id, { path, description }] of this.allowed) {
      lines.push(`- ${id}: ${path} — ${description}`);
    }
    return `## External directories (read-only access)\n\n${lines.join("\n")}`;
  }
}

/**
 * Doom loop detector.
 * Detects when the agent is repeating the same tool calls without progress.
 */
export class DoomLoopDetector {
  constructor(threshold = 3) {
    this.threshold = threshold;
    /** @type {Map<string, number>} — tool+input hash → count */
    this.history = new Map();
  }

  /**
   * Track a tool call. Returns true if doom loop detected.
   */
  track(toolName, input) {
    const hash = `${toolName}:${JSON.stringify(input).slice(0, 200)}`;
    const count = (this.history.get(hash) || 0) + 1;
    this.history.set(hash, count);
    return count >= this.threshold;
  }

  reset() {
    this.history.clear();
  }
}
