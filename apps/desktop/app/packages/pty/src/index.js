import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";

const DEFAULT_SHELL = process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/bash");
const MAX_OUTPUT_BYTES = 512 * 1024;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * A persistent interactive shell session. Unlike the one-shot `Workspace.run`
 * helper, a `PtySession` keeps a single child shell alive between commands so
 * the cwd, environment and shell history all persist across sends.
 *
 * This implementation deliberately avoids native PTY bindings. It uses Node's
 * built-in `child_process.spawn` with a TTY-aware shell invocation. Real PTY
 * resize (TIOCSWINSZ) requires native bindings and is left as a future
 * enhancement; meanwhile we send `stty cols/rows` so the shell believes the
 * terminal resized, which is sufficient for most CLI tools.
 */
export class PtySession extends EventEmitter {
  constructor({ cwd, shell = DEFAULT_SHELL, env = {}, cols = 80, rows = 24, id } = {}) {
    super();
    this.id = id || crypto.randomUUID();
    this.cwd = path.resolve(cwd);
    this.shell = shell;
    this.cols = cols;
    this.rows = rows;
    this.env = { ...process.env, ...env, TERM: "xterm-256color", COLUMNS: String(cols), LINES: String(rows) };
    this.child = null;
    this.buffer = "";
    this.lastOutput = "";
    this.idleTimer = null;
    this.pending = null;
    this.closed = false;
  }

  async start() {
    if (this.child) return;
    // Use a non-interactive login-less shell so we don't get prompt noise.
    // We disable job control and history expansion for cleaner output.
    const args = [];
    if (this.shell.endsWith("bash")) args.push("--norc", "--noprofile", "--noediting", "+o", "histexpand");
    this.child = spawn(this.shell, args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      detached: false,
    });
    // Detach the child from our event loop reference so the process can exit
    // even if a shell lingers. We track liveness via stdout/stderr instead.
    this.child.unref();
    // Suppress prompts entirely and set the terminal size.
    this.child.stdin.write(`PS1=''; PS2=''; set +o emacs 2>/dev/null; stty cols ${this.cols} rows ${this.rows} 2>/dev/null\n`);
    this.child.stdout.on("data", (chunk) => this.#onData(chunk, "stdout"));
    this.child.stderr.on("data", (chunk) => this.#onData(chunk, "stderr"));
    this.child.once("exit", (code, signal) => {
      this.closed = true;
      this.emit("exit", { code, signal });
      if (this.pending) {
        this.pending.resolve({ stdout: this.lastOutput, code, signal, closed: true });
        this.pending = null;
      }
    });
    this.child.once("error", (error) => {
      this.closed = true;
      this.emit("error", error);
      if (this.pending) {
        this.pending.reject(error);
        this.pending = null;
      }
    });
    this.#armIdle();
  }

  #onData(chunk, channel) {
    this.lastOutput += chunk.toString("utf8");
    if (this.lastOutput.length > MAX_OUTPUT_BYTES) {
      this.lastOutput = this.lastOutput.slice(-MAX_OUTPUT_BYTES);
    }
    this.emit("data", { chunk: chunk.toString("utf8"), channel });
    if (this.pending) {
      // Reset the per-command watchdog every time we receive more output.
      if (this.pending.timer) this.pending.timer.refresh();
    }
    this.#armIdle();
  }

  #armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close("idle"), SESSION_IDLE_TIMEOUT_MS).unref();
  }

  resize(cols, rows) {
    this.cols = Math.max(1, Number(cols) || 80);
    this.rows = Math.max(1, Number(rows) || 24);
    if (this.child && !this.closed) {
      this.child.stdin.write(`stty cols ${this.cols} rows ${this.rows}\n`);
    }
    this.emit("resize", { cols: this.cols, rows: this.rows });
  }

  /**
   * Run a command in the persistent shell and resolve when the sentinel marker
   * appears on stdout, indicating the command completed. Returns the captured
   * output (everything between the command and the marker).
   */
  send(command, options = {}) {
    if (!this.child || this.closed) return Promise.reject(new Error("PtySession is closed"));
    if (this.pending) return Promise.reject(new Error("Another command is still running on this session"));
    const sentinel = `__MOONCODE_DONE_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}__`;
    const echoCode = `echo "${sentinel}.$?"`;
    return new Promise((resolve, reject) => {
      const timeout = Math.min(Number(options.timeout ?? 30_000), 180_000);
      this.lastOutput = "";
      this.pending = {
        resolve: (value) => { clearTimeout(this.pending.timer); this.pending = null; resolve(value); },
        reject: (error) => { clearTimeout(this.pending.timer); this.pending = null; reject(error); },
        sentinel,
        timer: setTimeout(() => {
          if (this.pending) {
            this.pending.reject(new Error("Command timed out"));
          }
        }, timeout).unref(),
      };
      // Suppress command echo by prefixing with a space (bash history) — this also
      // makes it easier to extract the actual command output.
      this.child.stdin.write(`${command}\n${echoCode}\n`);
      // Poll for sentinel arrival.
      const watcher = setInterval(() => {
        if (!this.pending) { clearInterval(watcher); return; }
        const text = this.lastOutput;
        const index = text.indexOf(sentinel);
        if (index >= 0) {
          clearInterval(watcher);
          const afterSentinel = text.slice(index + sentinel.length);
          const codeMatch = afterSentinel.match(/^\.(\d+)/);
          const exitCode = codeMatch ? Number(codeMatch[1]) : 0;
          // Strip the echoed command line and the sentinel line from the output.
          const cleaned = text.slice(0, index).replace(new RegExp(`${escapeRegex(command)}\\s*$`), "").trimEnd();
          const result = { stdout: cleaned, code: exitCode, sentinel };
          this.lastOutput = "";
          this.pending.resolve(result);
        }
      }, 30);
      watcher.unref();
      this.pending.cleanup = () => clearInterval(watcher);
    });
  }

  /**
   * Stream raw bytes to the shell without waiting for completion. Used for
   * interactive prompts (e.g. y/n confirmations from a long-running command).
   */
  write(data) {
    if (!this.child || this.closed) return false;
    return this.child.stdin.write(data);
  }

  /**
   * Send Ctrl+C / SIGINT to the running command.
   */
  interrupt() {
    if (!this.child || this.closed) return false;
    return this.child.stdin.write("\x03");
  }

  close(reason = "manual") {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.idleTimer);
    if (this.pending) {
      this.pending.reject(new Error(`Session closed (${reason})`));
      this.pending = null;
    }
    if (this.child) {
      try { this.child.stdin.end("exit\n"); } catch (error) {
        // v0.9.1: log instead of silent swallow. EPIPE is expected (shell already exited).
        if (error?.code !== "EPIPE") this.emit("error", new Error(`stdin.end failed: ${error.message}`));
      }
      // Give the shell 200ms to exit gracefully, then force-kill.
      setTimeout(() => {
        try { this.child?.kill("SIGKILL"); }
        catch (error) {
          // ESRCH = process already exited; anything else is worth logging.
          if (error?.code !== "ESRCH") this.emit("error", new Error(`SIGKILL failed: ${error.message}`));
        }
      }, 200).unref();
    }
    this.emit("close", { reason });
  }
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Registry of active PTY sessions, keyed by id. Used by the server to keep
 * terminal sessions alive between HTTP requests.
 */
export class PtyRegistry {
  constructor() { this.sessions = new Map(); }

  async create(options) {
    const session = new PtySession(options);
    await session.start();
    this.sessions.set(session.id, session);
    session.once("close", () => this.sessions.delete(session.id));
    session.once("exit", () => this.sessions.delete(session.id));
    return session;
  }

  get(id) { return this.sessions.get(id); }

  list() {
    return [...this.sessions.values()].map((session) => ({
      id: session.id, cwd: session.cwd, cols: session.cols, rows: session.rows, closed: session.closed,
    }));
  }

  closeAll() {
    for (const session of this.sessions.values()) session.close("shutdown");
    this.sessions.clear();
  }
}
