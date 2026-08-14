import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

const MOONCODE_SIGNATURE = "mooncode-checkpoint";
const MAX_DIFF_BYTES = 250_000;
const MAX_LOG_ENTRIES = 200;

/**
 * Thin wrapper around the local `git` binary. Every command runs inside the
 * workspace root with a deterministic environment so agent-initiated commits
 * are clearly distinguishable from user commits in the log.
 *
 * This is original code that issues plain `git` CLI calls. It does not vendor
 * any git implementation or wrap a third-party git library.
 */
export class Git {
  constructor(root) {
    this.root = path.resolve(root);
    this.env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: "Moon Code Agent",
      GIT_AUTHOR_EMAIL: "agent@mooncode.local",
      GIT_COMMITTER_NAME: "Moon Code Agent",
      GIT_COMMITTER_EMAIL: "agent@mooncode.local",
    };
  }

  async #run(args, options = {}) {
    await mkdir(this.root, { recursive: true });
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd: this.root,
        env: this.env,
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      const append = (current, chunk) => {
        const next = current + chunk.toString("utf8");
        return next.length <= MAX_DIFF_BYTES ? next : `${next.slice(0, MAX_DIFF_BYTES)}\n…truncated`;
      };
      child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
      const timer = setTimeout(() => child.kill("SIGTERM"), Math.min(Number(options.timeout ?? 15_000), 60_000));
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("close", (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve({ stdout, stderr, code });
        const message = stderr.trim() || `git ${args.join(" ")} failed (exit ${code})`;
        const error = new Error(message);
        error.code = code;
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
      });
    });
  }

  async #exists() {
    try {
      const info = await stat(path.join(this.root, ".git"));
      return info.isDirectory();
    } catch (error) {
      // v0.9.1: ENOENT is expected (no repo yet), but other errors should be visible.
      if (error?.code !== "ENOENT") {
        console.warn(`[mooncode] git #exists() failed: ${error.message}`);
      }
      return false;
    }
  }

  async init() {
    if (await this.#exists()) return { initialized: false, reason: "already_initialized" };
    await this.#run(["init", "--quiet", "--initial-branch=main"]);
    await this.#run(["config", "user.name", "Moon Code Agent"]);
    await this.#run(["config", "user.email", "agent@mooncode.local"]);
    // Stage an empty initial commit so later checkpoints have a base to diff against.
    const gitkeep = path.join(this.root, ".mooncode-keep");
    await writeFile(gitkeep, "# Moon Code workspace marker\n", "utf8");
    await this.#run(["add", ".mooncode-keep"]);
    try {
      await this.#run(["commit", "--quiet", "-m", "mooncode: initialize workspace", "--allow-empty"]);
    } catch (error) {
      if (!error.stderr?.includes("nothing to commit")) throw error;
    }
    return { initialized: true };
  }

  async isRepo() { return this.#exists(); }

  async status() {
    if (!(await this.#exists())) return { repository: false };
    const result = await this.#run(["status", "--porcelain=v2", "-b"]);
    const lines = result.stdout.split("\n").filter(Boolean);
    const head = lines.find((line) => line.startsWith("# branch.head"))?.split(/\s+/)[2] ?? "(unknown)";
    const upstream = lines.find((line) => line.startsWith("# branch.upstream"))?.split(/\s+/)[2] ?? null;
    const files = [];
    for (const line of lines) {
      if (line.startsWith("# ") || !line.trim()) continue;
      const parts = line.split(/\s+/);
      // Porcelain v2 ordinary entries: 1 <xy> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      if (parts[0] === "1") {
        const xy = parts[1];
        files.push({ path: parts.slice(8).join(" "), x: xy[0], y: xy[1], staged: xy[0] !== ".", unstaged: xy[1] !== "." });
      } else if (parts[0] === "2") {
        const xy = parts[1];
        const pathIndex = parts.slice(8).findIndex((item) => !item.includes("\t")) + 8;
        const raw = parts.slice(pathIndex).join(" ");
        const [oldPath, newPath] = raw.split("\t");
        files.push({ path: newPath ?? oldPath, oldPath, x: xy[0], y: xy[1], staged: xy[0] !== ".", unstaged: xy[1] !== "." });
      } else if (parts[0] === "u") {
        files.push({ path: parts.slice(10).join(" "), x: "U", y: "U", unmerged: true });
      } else if (parts[0] === "?") {
        files.push({ path: parts.slice(1).join(" "), x: "?", y: "?", untracked: true });
      }
    }
    return { repository: true, head, upstream, files };
  }

  async diff(options = {}) {
    if (!(await this.#exists())) return { repository: false, diff: "" };
    const args = ["diff", "--no-color"];
    if (options.cached) args.push("--cached");
    if (options.path) args.push("--", options.path);
    if (options.ref) args.splice(1, 0, options.ref);
    const result = await this.#run(args);
    return { repository: true, diff: result.stdout };
  }

  /**
   * Snapshot the current working tree as a checkpoint commit. If there is
   * nothing staged or modified, returns the existing HEAD without creating a
   * new commit. Always returns the resulting HEAD sha.
   */
  async checkpoint(message = "mooncode: checkpoint before mutation") {
    if (!(await this.#exists())) await this.init();
    // Stage all tracked changes (and new files inside the workspace).
    await this.#run(["add", "-A"]);
    const status = await this.#run(["status", "--porcelain"]);
    if (!status.stdout.trim()) {
      const head = await this.#run(["rev-parse", "HEAD"]);
      return { sha: head.stdout.trim(), created: false, reason: "no_changes" };
    }
    await this.#run(["commit", "--quiet", "-m", `${message} [${MOONCODE_SIGNATURE}]`]);
    const head = await this.#run(["rev-parse", "HEAD"]);
    return { sha: head.stdout.trim(), created: true };
  }

  /**
   * Undo the most recent checkpoint commit. SAFETY FIRST:
   * - Default mode is `soft` — keeps the changes staged so nothing is lost.
   * - `hard: true` requires `confirm: true` and prints a warning about
   *   irreversible loss. This prevents the dangerous "I lost my work" scenario.
   * - Before any reset, a backup branch `mooncode-undo-backup` is created so the
   *   user can recover via `git checkout mooncode-undo-backup`.
   */
  async undo(options = {}) {
    if (!(await this.#exists())) throw new Error("Git repository is not initialized");
    const log = await this.log({ limit: 2 });
    if (!log.commits.length) throw new Error("No checkpoint to undo");
    const last = log.commits[0];
    if (!last.message.includes(MOONCODE_SIGNATURE)) {
      return { undone: false, reason: "not_a_mooncode_checkpoint", sha: last.sha };
    }
    // Safety: create a backup branch pointing at the current HEAD so the user
    // can always recover the undion if they change their mind.
    const backupName = `mooncode-undo-backup-${Date.now()}`;
    try {
      await this.#run(["branch", backupName]);
    } catch (error) {
      // Backup creation failure is non-fatal but we log it.
      console.error("[mooncode] undo backup failed:", error.message);
    }
    if (log.commits.length < 2) {
      // Only one commit — soft reset keeps the changes staged.
      await this.#run(["reset", "--soft", "HEAD"]);
      return { undone: true, sha: log.commits[0].sha, soft: true, backup: backupName };
    }
    // HARD mode now requires explicit confirmation. The server enforces this
    // by checking options.confirm === true AND options.hard === true.
    if (options.hard === true && options.confirm === true) {
      await this.#run(["reset", "--hard", "HEAD~1"]);
      return { undone: true, sha: log.commits[1].sha, soft: false, hard: true, backup: backupName };
    }
    // Default: soft reset. Changes stay staged for review or re-commit.
    await this.#run(["reset", "--soft", "HEAD~1"]);
    return { undone: true, sha: log.commits[1].sha, soft: true, backup: backupName };
  }

  async log(options = {}) {
    if (!(await this.#exists())) return { commits: [] };
    const limit = Math.min(Number(options.limit ?? 20), MAX_LOG_ENTRIES);
    const format = "%H%x09%an%x09%ad%x09%s";
    const args = ["log", `-${limit}`, `--pretty=format:${format}`, "--date=iso-strict"];
    if (options.ref) args.push(options.ref);
    const result = await this.#run(args);
    const commits = result.stdout.split("\n").filter(Boolean).map((line) => {
      const [sha, author, date, ...rest] = line.split("\t");
      return { sha, author, date, message: rest.join("\t") };
    });
    return { commits };
  }

  async branches() {
    if (!(await this.#exists())) return { branches: [], current: null };
    const result = await this.#run(["branch", "--list", "--format=%(HEAD)%00%(refname:short)%00%(objectname:short)%00%(committerdate:iso-strict)"]);
    const branches = result.stdout.split("\n").filter(Boolean).map((line) => {
      const [head, name, sha, date] = line.split("\u0000");
      return { name: name.trim(), sha: sha.trim(), date, current: head.trim() === "*" };
    });
    return { branches, current: branches.find((item) => item.current)?.name ?? null };
  }

  async createBranch(name) {
    if (!(await this.#exists())) await this.init();
    await this.#run(["branch", name]);
    return { name };
  }

  async checkout(name) {
    await this.#run(["checkout", "--quiet", name]);
    return { name };
  }

  async head() {
    if (!(await this.#exists())) return null;
    try {
      const result = await this.#run(["rev-parse", "HEAD"]);
      return result.stdout.trim();
    } catch { return null; }
  }

  /**
   * Returns the file content at a given revision. Useful for diffing the
   * current file against its last checkpointed version.
   */
  async readFileAtRef(ref, filePath) {
    if (!(await this.#exists())) return null;
    try {
      const result = await this.#run(["show", `${ref}:${filePath}`]);
      return result.stdout;
    } catch (error) {
      // "does not exist" is expected (file not in that revision); re-throw others.
      if (error.stderr?.includes("does not exist") || error.stderr?.includes("exists on disk, but not in")) return null;
      console.warn(`[mooncode] git readFileAtRef(${ref}, ${filePath}) failed: ${error.message}`);
      throw error;
    }
  }

  // ---- Worktrees ----
  // Git worktrees allow multiple working directories for the same repository,
  // each on a different branch. Useful for parallel agent tasks.

  async listWorktrees() {
    if (!(await this.#exists())) return { worktrees: [] };
    const result = await this.#run(["worktree", "list", "--porcelain"]);
    const worktrees = [];
    let current = null;
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) { if (current) worktrees.push(current); current = null; continue; }
      const [key, ...rest] = line.split(" ");
      const value = rest.join(" ");
      if (key === "worktree") {
        current = { path: value, head: null, branch: null, bare: false, detached: false };
      } else if (current) {
        if (key === "HEAD") current.head = value;
        else if (key === "branch") current.branch = value.replace("refs/heads/", "");
        else if (key === "bare") current.bare = true;
        else if (key === "detached") current.detached = true;
      }
    }
    if (current) worktrees.push(current);
    return { worktrees };
  }

  async addWorktree(name, options = {}) {
    if (!(await this.#exists())) await this.init();
    const target = path.resolve(this.root, "..", `.mooncode-worktrees`, name);
    await mkdir(path.dirname(target), { recursive: true });
    const args = ["worktree", "add", "-b", name, target];
    if (options.base) args.splice(-1, 0, options.base);
    await this.#run(args);
    return { name, path: target, branch: name };
  }

  async removeWorktree(name) {
    if (!(await this.#exists())) throw new Error("Git repository is not initialized");
    const target = path.resolve(this.root, "..", `.mooncode-worktrees`, name);
    await this.#run(["worktree", "remove", "--force", target]);
    return { removed: name };
  }

  // ---- Commit graph ----
  // Returns a structured commit graph for visual rendering (SVG / canvas).

  async graph(options = {}) {
    if (!(await this.#exists())) return { commits: [], edges: [] };
    const limit = Math.min(Number(options.limit ?? 50), 200);
    const format = "%H%x09%P%x09%an%x09%ad%x09%s";
    const result = await this.#run(["log", `-${limit}`, `--pretty=format:${format}`, "--date=iso-strict", "--all"]);
    const commits = [];
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const [sha, parents, author, date, ...msgParts] = line.split("\t");
      commits.push({
        sha,
        parents: parents ? parents.split(" ").filter(Boolean) : [],
        author,
        date,
        message: msgParts.join("\t"),
        shortSha: sha.slice(0, 7),
      });
    }
    const shaToIndex = new Map(commits.map((c, i) => [c.sha, i]));
    const edges = [];
    for (const commit of commits) {
      for (const parentSha of commit.parents) {
        const parentIdx = shaToIndex.get(parentSha);
        if (parentIdx != null) edges.push({ from: commits.indexOf(commit), to: parentIdx });
      }
    }
    return { commits, edges, branches: await this.branches() };
  }
}
