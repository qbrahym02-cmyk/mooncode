import { watch as watchCb } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";

const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", "out", "target", ".cache", ".mooncode"]);
const DEBOUNCE_MS = 120;

/**
 * Recursive file watcher that emits `change` events when any file inside the
 * root changes. Uses Node's built-in `fs.watch` with recursive polling on each
 * directory (cross-platform; works on Linux where the native `recursive` flag
 * is not supported). The implementation is original and does not depend on
 * chokidar or any third-party watcher.
 */
export class FileWatcher extends EventEmitter {
  constructor(root, options = {}) {
    super();
    this.root = path.resolve(root);
    this.skip = new Set([...SKIP, ...(options.skip ?? [])]);
    this.watchers = new Map();
    this.debounce = new Map();
    this.closed = false;
  }

  async start() {
    await this.#watchDir(this.root);
  }

  async #watchDir(dir) {
    if (this.closed) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) {
      // v0.9.1: ENOENT/EACCES are expected (dir vanished or permissions); log others.
      if (error?.code !== "ENOENT" && error?.code !== "EACCES") {
        console.warn(`[mooncode] watcher readdir(${dir}) failed: ${error.message}`);
      }
      return;
    }
    // Subscribe to this directory before descending so we don't miss creates.
    if (!this.watchers.has(dir)) {
      try {
        const watcher = watchCb(dir, { persistent: true }, (event, filename) => {
          if (!filename) return;
          this.#onChange(path.join(dir, filename));
        });
        watcher.once("close", () => this.watchers.delete(dir));
        watcher.once("error", () => this.watchers.delete(dir));
        this.watchers.set(dir, watcher);
      } catch (error) {
        // Directory may have vanished between readdir and watch; non-fatal.
        if (error?.code !== "ENOENT") {
          console.warn(`[mooncode] watcher watch(${dir}) failed: ${error.message}`);
        }
      }
    }
    for (const entry of entries) {
      if (this.skip.has(entry.name) || entry.name.startsWith(".DS_Store")) continue;
      if (entry.isDirectory()) {
        await this.#watchDir(path.join(dir, entry.name));
      }
    }
  }

  #onChange(target) {
    if (this.closed) return;
    const relative = path.relative(this.root, target).replaceAll(path.sep, "/");
    if (!relative || relative.split("/").some((part) => this.skip.has(part))) return;
    // Debounce: collapse bursts of identical events.
    clearTimeout(this.debounce.get(relative));
    const timer = setTimeout(() => {
      this.debounce.delete(relative);
      stat(target).then((info) => {
        this.emit("change", { path: relative, type: info.isDirectory() ? "directory" : "file", size: info.size });
        // If a new directory appeared, attach a watcher to it now.
        if (info.isDirectory()) this.#watchDir(target);
      }).catch(() => {
        this.emit("change", { path: relative, type: "deleted" });
      });
    }, DEBOUNCE_MS);
    timer.unref();
    this.debounce.set(relative, timer);
  }

  async close() {
    this.closed = true;
    for (const watcher of this.watchers.values()) {
      try { watcher.close(); } catch (error) {
        // v0.9.1: log non-fatal close errors. Watchers may already be closed.
        if (error?.code !== "ENOENT") console.warn(`[mooncode] watcher close failed: ${error.message}`);
      }
    }
    this.watchers.clear();
    for (const timer of this.debounce.values()) clearTimeout(timer);
    this.debounce.clear();
  }
}
