import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const MAX_CONTEXT_BYTES = 64_000;
const MAX_FILES = 8;

/**
 * Context files are workspace files the agent should always be aware of,
 * regardless of the current prompt. They get prepended to the system prompt
 * at every model call. Typical usage: project conventions, coding standards,
 * design system reference, build instructions.
 *
 * The set is stored as `.mooncode/context.json` listing relative paths and an
 * optional description. The actual files live in the workspace so they can
 * be edited with normal tools.
 */
export class ContextFiles {
  constructor(workspace, dataRoot) {
    this.workspace = workspace;
    this.dataRoot = path.resolve(dataRoot);
    this.manifestPath = path.join(this.dataRoot, "context.json");
  }

  async ensure() {
    await mkdir(this.dataRoot, { recursive: true });
  }

  async readManifest() {
    await this.ensure();
    try {
      const data = JSON.parse(await readFile(this.manifestPath, "utf8"));
      return { files: Array.isArray(data.files) ? data.files : [], version: 1 };
    } catch (error) {
      if (error?.code === "ENOENT") return { files: [], version: 1 };
      throw error;
    }
  }

  async writeManifest(manifest) {
    await this.ensure();
    const payload = JSON.stringify(manifest, null, 2);
    const tmp = `${this.manifestPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, payload, { mode: 0o600 });
    const { rename } = await import("node:fs/promises");
    await rename(tmp, this.manifestPath);
  }

  async add(relativePath, description = "") {
    const clean = String(relativePath).replaceAll("\\", "/").replace(/^\/+/, "");
    if (!clean) throw new Error("Path is required");
    // Verify the file exists and is readable inside the workspace.
    const resolved = this.workspace.resolve(clean);
    const info = await stat(resolved);
    if (!info.isFile()) throw new Error("Path is not a file");
    if (info.size > MAX_CONTEXT_BYTES) throw new Error(`Context file exceeds ${MAX_CONTEXT_BYTES} bytes`);
    const manifest = await this.readManifest();
    if (!manifest.files.some((entry) => entry.path === clean)) {
      manifest.files.push({ path: clean, description, addedAt: new Date().toISOString() });
      if (manifest.files.length > MAX_FILES) {
        // Drop the oldest entry to stay within the cap.
        manifest.files.shift();
      }
      await this.writeManifest(manifest);
    }
    return manifest;
  }

  async remove(relativePath) {
    const clean = String(relativePath).replaceAll("\\", "/").replace(/^\/+/, "");
    const manifest = await this.readManifest();
    manifest.files = manifest.files.filter((entry) => entry.path !== clean);
    await this.writeManifest(manifest);
    return manifest;
  }

  /**
   * Resolve and concatenate every registered context file into a single
   * string suitable for prepending to the system prompt. Files that no longer
   * exist are silently skipped (and pruned from the manifest lazily).
   */
  async assemble() {
    const manifest = await this.readManifest();
    const blocks = [];
    const survivors = [];
    for (const entry of manifest.files) {
      try {
        const resolved = this.workspace.resolve(entry.path);
        const content = await readFile(resolved, "utf8");
        if (content.length > MAX_CONTEXT_BYTES) {
          blocks.push(`### ${entry.path}\n\n(Truncated to ${MAX_CONTEXT_BYTES} bytes)\n\n${content.slice(0, MAX_CONTEXT_BYTES)}`);
        } else {
          blocks.push(`### ${entry.path}${entry.description ? ` — ${entry.description}` : ""}\n\n${content}`);
        }
        survivors.push(entry);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          blocks.push(`### ${entry.path}\n\n(unreadable: ${error.message})`);
          survivors.push(entry);
        }
        // ENOENT: file was deleted; drop from manifest silently.
      }
    }
    // Lazily prune missing entries.
    if (survivors.length !== manifest.files.length) {
      manifest.files = survivors;
      await this.writeManifest(manifest);
    }
    if (!blocks.length) return null;
    return `## Project context\n\nThe following files are part of the standing project context. Treat them as background that applies to every prompt in this session.\n\n${blocks.join("\n\n")}`;
  }
}

export { Compactor } from "./compactor.js";

