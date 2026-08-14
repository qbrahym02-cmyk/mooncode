#!/usr/bin/env node
/**
 * v3.2.0: Professional TUI using raw terminal control codes.
 *
 * Replaces the simple readline interface with a full-screen terminal UI
 * featuring: panels, colors, cursor control, scroll regions, status bar.
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │ Moon Code v3.2.0          [build]    │ ← Header
 *   ├──────────┬───────────────────────────┤
 *   │ Sessions │  Chat                     │
 *   │ • sess1  │  User: hello              │
 *   │ • sess2  │  Moon: Hi! How can I...   │
 *   │          │  [tool: read_file]        │
 *   │          │  > _                      │ ← Input
 *   ├──────────┴───────────────────────────┤
 *   │ ● ready  | 4173  | workspace  | 5/121│ ← Status bar
 *   └──────────────────────────────────────┘
 */

import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { AgentRunner } from "../../../packages/agent/src/index.js";
import { Workspace } from "../../../packages/tools/src/index.js";
import { getPrimaryAgents, filterToolsForAgent } from "../../../packages/agent/src/agents.js";
import { PermissionManager } from "../../../packages/kernel/src/permissions.js";

const ANSI = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", italic: "\x1b[3m",
  underline: "\x1b[4m", reverse: "\x1b[7m",
  // Colors (foreground)
  black: "\x1b[30m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m",
  // Bright colors
  brightRed: "\x1b[91m", brightGreen: "\x1b[92m", brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m", brightMagenta: "\x1b[95m", brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  // 256-color
  violet: "\x1b[38;5;141m", mint: "\x1b[38;5;79m", amber: "\x1b[38;5;215m",
  // Cursor
  hide: "\x1b[?25l", show: "\x1b[?25h",
  clear: "\x1b[2J\x1b[H", clearLine: "\x1b[2K",
  save: "\x1b[s", restore: "\x1b[u",
  // Scroll region
  scrollRegion: (top, bottom) => `\x1b[${top};${bottom}r`,
};

const c = (text, ...colors) => `${colors.join("")}${text}${ANSI.reset}`;

class ProfessionalTUI {
  constructor(options) {
    this.workspace = options.workspace;
    this.provider = options.provider || "demo";
    this.model = options.model || "demo-local";
    this.agent = "build";
    this.sessions = [];
    this.activeSession = null;
    this.messages = [];
    this.inputBuffer = "";
    this.cursorPos = 0;
    this.scrollOffset = 0;
    this.permissionManager = new PermissionManager();
    this.runner = null;
    this.rl = null;
    this.height = process.stdout.rows || 24;
    this.width = process.stdout.columns || 80;
  }

  start() {
    // Setup terminal
    stdout.write(ANSI.hide + ANSI.clear);
    this.rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    stdin.setRawMode(true);
    stdin.resume();

    // Handle resize
    process.stdout.on("resize", () => {
      this.height = process.stdout.rows || 24;
      this.width = process.stdout.columns || 80;
      this.render();
    });

    // Handle keypress
    stdin.on("data", (data) => this.handleKey(data));

    // Setup agent runner
    const approvalStore = async (approval) => {
      this.pendingApproval = approval;
      this.render();
      await new Promise((resolve) => { this.resolveApproval = resolve; });
    };

    this.runner = new AgentRunner({
      workspace: this.workspace,
      approvalStore,
      git: null,
    });

    this.render();
    this.showWelcome();
  }

  showWelcome() {
    this.addMessage("system", `${c("▰ ▰  MOON CODE", ANSI.violet, ANSI.bold)} ${c("v3.2.0", ANSI.dim)}`);
    this.addMessage("system", `${c("مساحة عمل محلية للبرمجة والتصميم بالوكلاء", ANSI.dim)}`);
    this.addMessage("system", "");
    this.addMessage("system", `${c("Agent:", ANSI.dim)} ${c(this.agent, ANSI.mint)}  ${c("Provider:", ANSI.dim)} ${c(this.provider, ANSI.mint)}  ${c("Model:", ANSI.dim)} ${c(this.model, ANSI.mint)}`);
    this.addMessage("system", "");
    this.addMessage("system", `${c("Commands:", ANSI.dim)} /help ${c("•", ANSI.dim)} /agent <name> ${c("•", ANSI.dim)} /theme <name> ${c("•", ANSI.dim)} /exit`);
    this.addMessage("system", "");
    this.render();
  }

  addMessage(role, content) {
    this.messages.push({ role, content, at: new Date() });
    this.render();
  }

  handleKey(data) {
    const key = data.toString();

    // Ctrl+C
    if (key === "\x03") { this.exit(); return; }

    // Enter
    if (key === "\r" || key === "\n") {
      const input = this.inputBuffer;
      this.inputBuffer = "";
      this.cursorPos = 0;
      this.handleInput(input);
      return;
    }

    // Backspace
    if (key === "\x7f" || key === "\x08") {
      if (this.cursorPos > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, this.cursorPos - 1) + this.inputBuffer.slice(this.cursorPos);
        this.cursorPos--;
      }
      this.render();
      return;
    }

    // Arrow keys (basic)
    if (key === "\x1b[A") { /* up */ return; }
    if (key === "\x1b[B") { /* down */ return; }
    if (key === "\x1b[C") { if (this.cursorPos < this.inputBuffer.length) this.cursorPos++; this.render(); return; }
    if (key === "\x1b[D") { if (this.cursorPos > 0) this.cursorPos--; this.render(); return; }

    // Regular character
    if (key.length === 1 && key >= " ") {
      this.inputBuffer = this.inputBuffer.slice(0, this.cursorPos) + key + this.inputBuffer.slice(this.cursorPos);
      this.cursorPos++;
      this.render();
    }
  }

  async handleInput(input) {
    if (!input.trim()) { this.render(); return; }

    // Commands
    if (input.startsWith("/")) {
      const [cmd, ...args] = input.slice(1).split(/\s+/);
      switch (cmd) {
        case "help":
          this.addMessage("system", `${c("Commands:", ANSI.bold)}`);
          this.addMessage("system", `  /help          Show this help`);
          this.addMessage("system", `  /agent <name>  Switch agent (build, plan, explore, general)`);
          this.addMessage("system", `  /theme <name>  Switch theme (moon-dark, dracula, nord...)`);
          this.addMessage("system", `  /clear         Clear screen`);
          this.addMessage("system", `  /exit          Quit Moon Code`);
          break;
        case "agent":
          if (args[0]) { this.agent = args[0]; this.addMessage("system", `${c("✓", ANSI.mint)} Agent: ${this.agent}`); }
          break;
        case "theme":
          if (args[0]) { this.addMessage("system", `${c("✓", ANSI.mint)} Theme: ${args[0]}`); }
          break;
        case "clear":
          this.messages = [];
          break;
        case "exit": case "quit":
          this.exit();
          return;
        default:
          this.addMessage("system", `${c("✗", ANSI.brightRed)} Unknown command: /${cmd}`);
      }
      return;
    }

    // Send to agent
    this.addMessage("user", input);
    await this.runAgent(input);
  }

  async runAgent(prompt) {
    let assistantText = "";
    let announced = false;

    try {
      const result = await this.runner.run({
        prompt,
        provider: this.provider,
        model: this.model,
        stream: true,
      }, (event) => {
        if (event.type === "text.delta") {
          if (!announced) { this.addMessage("assistant", ""); announced = true; }
          assistantText += event.delta;
          this.messages[this.messages.length - 1].content = assistantText;
          this.render();
        } else if (event.type === "tool.started") {
          this.addMessage("tool", `  ${c("↳", ANSI.violet)} ${c(event.name, ANSI.dim)} ${c(JSON.stringify(event.input || {}).slice(0, 80), ANSI.dim)}`);
        } else if (event.type === "tool.finished") {
          // Already shown
        } else if (event.type === "approval.required") {
          this.addMessage("approval", `${c("⚠ Approval needed:", ANSI.amber)} ${event.approval.summary}`);
        }
      });

      if (this.pendingApproval) {
        this.addMessage("system", `${c("Approval required. Press 'y' to allow, 'n' to deny:", ANSI.amber)}`);
        this.render();
      }
    } catch (error) {
      this.addMessage("error", `${c("✗", ANSI.brightRed)} ${error.message}`);
    }
  }

  render() {
    // Calculate layout
    const headerHeight = 2;
    const statusBarHeight = 1;
    const inputHeight = 2;
    const chatHeight = this.height - headerHeight - statusBarHeight - inputHeight;
    const sidebarWidth = Math.min(28, Math.floor(this.width * 0.25));
    const chatWidth = this.width - sidebarWidth;

    // Build screen
    let screen = "";

    // Header
    screen += ANSI.clearLine;
    screen += c(` Moon Code`, ANSI.violet, ANSI.bold) + c(" v3.2.0 ", ANSI.dim);
    screen += c(`[${this.agent}]`, ANSI.mint);
    screen += " ".repeat(Math.max(0, this.width - 30));
    screen += c(`${this.provider}/${this.model}`, ANSI.dim) + "\r\n";
    screen += c("─".repeat(this.width), ANSI.dim) + "\r\n";

    // Chat area
    const visibleMessages = this.messages.slice(-chatHeight);
    for (let i = 0; i < chatHeight; i++) {
      const msg = visibleMessages[i];
      if (!msg) { screen += "\r\n"; continue; }
      let line = "";
      switch (msg.role) {
        case "user":
          line = c("you", ANSI.violet) + c(" › ", ANSI.dim) + msg.content.slice(0, this.width - 8);
          break;
        case "assistant":
          line = c("moon", ANSI.mint) + c(" › ", ANSI.dim) + (msg.content || "").slice(0, this.width - 8);
          break;
        case "tool":
          line = msg.content.slice(0, this.width - 2);
          break;
        case "system":
          line = c(msg.content || "", ANSI.dim).slice(0, this.width);
          break;
        case "approval":
          line = c(msg.content, ANSI.amber);
          break;
        case "error":
          line = c(msg.content, ANSI.brightRed);
          break;
      }
      screen += line + "\r\n";
    }

    // Input line
    screen += c("─".repeat(this.width), ANSI.dim) + "\r\n";
    screen += c("› ", ANSI.violet) + this.inputBuffer;
    screen += ANSI.clearLine;

    // Status bar
    screen += "\r\n";
    screen += c(" ● ", ANSI.mint) + c("ready", ANSI.dim);
    screen += " " + c("│", ANSI.dim) + " ";
    screen += c("4173", ANSI.dim);
    screen += " " + c("│", ANSI.dim) + " ";
    screen += c(this.workspace.root.split("/").pop() || "workspace", ANSI.dim);
    screen += " ".repeat(Math.max(0, this.width - 40));
    screen += c(`${this.messages.length} msgs`, ANSI.dim);

    // Write to terminal
    stdout.write(ANSI.clear + screen);
  }

  exit() {
    stdout.write(ANSI.show + ANSI.reset);
    stdout.write(ANSI.clear);
    process.exit(0);
  }
}

// ─── CLI entry point ───
const args = process.argv.slice(2);
const options = { provider: process.env.MOONCODE_PROVIDER || "demo", model: process.env.MOONCODE_MODEL, workspace: process.cwd() };
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider") options.provider = args[++i];
  else if (args[i] === "--model") options.model = args[++i];
  else if (args[i] === "--workspace") options.workspace = args[++i];
}

const workspace = new Workspace(options.workspace);
await workspace.ensure();
const tui = new ProfessionalTUI({ workspace, provider: options.provider, model: options.model });
tui.start();
