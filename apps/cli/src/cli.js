#!/usr/bin/env node
/**
 * Zetora CLI — unified command-line interface.
 *
 * Usage:
 *   zetora                    Start TUI in current directory
 *   zetora tui                Start TUI (explicit)
 *   zetora serve              Start HTTP server
 *   zetora open               Open workspace in browser
 *   zetora version            Print version
 *   zetora health             Check server health
 *   zetora help               Show help
 *
 * Install globally:
 *   npm install -g zetora
 *   # or
 *   curl -fsSL https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.sh | bash
 *
 * @author Brahim <qbrahym02-cmyk@users.noreply.github.com>
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = "0.9.2";
const DEFAULT_PORT = 4173;

// ANSI colors for pretty output (disabled on Windows non-TTY).
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = supportsColor ? {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  violet: "\x1b[38;5;141m", mint: "\x1b[38;5;79m",
  amber: "\x1b[38;5;215m", red: "\x1b[38;5;203m",
} : { reset: "", bold: "", dim: "", violet: "", mint: "", amber: "", red: "" };

const color = (text, tone) => `${c[tone] || ""}${text}${c.reset}`;

// ─── Logo ───────────────────────────────────────────────────────────────────
const LOGO = `${c.violet}▰ ▰${c.reset}  ${c.bold}ZETORA${c.reset} ${c.dim}v${VERSION}${c.reset}`;

// ─── Help ───────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${LOGO}

${color("مساحة عمل محلية للبرمجة والتصميم بالوكلاء", "dim")}

${color("USAGE", "violet")}
  zetora <command> [options]

${color("COMMANDS", "violet")}
  ${color("tui", "mint")}             Start the terminal UI (default)
  ${color("serve", "mint")}           Start the HTTP server
  ${color("open", "mint")}            Open the workspace in your browser
  ${color("health", "mint")}          Check if a running server is healthy
  ${color("version", "mint")}         Print the version
  ${color("help", "mint")}            Show this help message

${color("OPTIONS", "violet")}
  ${color("--workspace <path>", "amber")}   Workspace directory (default: current directory)
  ${color("--port <number>", "amber")}      HTTP port (default: ${DEFAULT_PORT})
  ${color("--provider <name>", "amber")}    Provider: demo|openai|anthropic|google|openrouter|ollama|custom
  ${color("--model <name>", "amber")}       Model name (e.g. gpt-5-mini, claude-sonnet-4-5)
  ${color("--host <addr>", "amber")}        Bind address (default: 127.0.0.1)
  ${color("--version, -v", "amber")}        Print version
  ${color("--help, -h", "amber")}           Show help

${color("EXAMPLES", "violet")}
  ${color("# Start TUI in current directory", "dim")}
  zetora

  ${color("# Start server on port 3000 with OpenAI", "dim")}
  zetora serve --port 3000 --provider openai --model gpt-5-mini

  ${color("# Open workspace in browser", "dim")}
  zetora open --workspace ./my-project

  ${color("# Check server health", "dim")}
  zetora health --port 4173

${color("ENVIRONMENT", "violet")}
  OPENAI_API_KEY          OpenAI API key
  ANTHROPIC_API_KEY       Anthropic API key
  GOOGLE_API_KEY          Google API key
  OPENROUTER_API_KEY      OpenRouter API key
  ZETORA_PROVIDER         Default provider (default: demo)
  ZETORA_MODEL            Default model

${color("INSTALL", "violet")}
  ${color("# npm", "mint")}
  npm install -g zetora

  ${color("# curl (macOS/Linux)", "mint")}
  curl -fsSL https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.sh | bash

  ${color("# PowerShell (Windows)", "mint")}
  iwr -useb https://raw.githubusercontent.com/qbrahym02-cmyk/zetora/main/scripts/install/install.ps1 | iex

${color("DOCS", "violet")}
  https://github.com/qbrahym02-cmyk/zetora#readme

${color("COPYRIGHT", "dim")}
  Copyright © 2026 Brahim · MIT License
`);
}

// ─── Find the monorepo root ─────────────────────────────────────────────────
// When installed via npm, the CLI is bundled with the full Zetora source.
// When run from the dev monorepo, we walk up to find it.
function findMonorepoRoot() {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "apps", "server", "src", "server.js"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  // Fallback: assume we're at the monorepo root (dev mode).
  return path.resolve(__dirname, "../../..");
}

const root = findMonorepoRoot();
const serverEntry = path.join(root, "apps", "server", "src", "server.js");
const tuiEntry = path.join(root, "apps", "tui", "src", "cli.js");

// ─── Commands ───────────────────────────────────────────────────────────────
function startTui(args) {
  const opts = parseArgs(args);
  const workspace = opts.workspace || process.cwd();
  const tuiArgs = ["--workspace", workspace];
  if (opts.provider) tuiArgs.push("--provider", opts.provider);
  if (opts.model) tuiArgs.push("--model", opts.model);

  if (!existsSync(tuiEntry)) {
    console.error(color("✗ TUI entry not found. Are you running from the Zetora source?", "red"));
    console.error(color(`  Expected: ${tuiEntry}`, "dim"));
    process.exit(1);
  }

  spawn("node", [tuiEntry, ...tuiArgs], { stdio: "inherit", env: process.env })
    .on("close", (code) => process.exit(code ?? 0));
}

function startServer(args) {
  const opts = parseArgs(args);
  const env = {
    ...process.env,
    ZETORA_HOST: opts.host || "127.0.0.1",
    ZETORA_PORT: String(opts.port || DEFAULT_PORT),
    ZETORA_WORKSPACE: opts.workspace || process.cwd(),
  };
  if (opts.provider) env.ZETORA_PROVIDER = opts.provider;
  if (opts.model) env.ZETORA_MODEL = opts.model;

  console.log(color(`▰ ▰  ZETORA ${c.dim}v${VERSION}${c.reset}`, "violet"));
  console.log(color(`  workspace  ${env.ZETORA_WORKSPACE}`, "dim"));
  console.log(color(`  server     http://${env.ZETORA_HOST}:${env.ZETORA_PORT}`, "dim"));
  console.log(color(`  provider   ${env.ZETORA_PROVIDER || "demo"}`, "dim"));
  console.log();

  if (!existsSync(serverEntry)) {
    console.error(color("✗ Server entry not found.", "red"));
    process.exit(1);
  }

  spawn("node", [serverEntry], { stdio: "inherit", env })
    .on("close", (code) => process.exit(code ?? 0));
}

async function openWorkspace(args) {
  const opts = parseArgs(args);
  const port = opts.port || DEFAULT_PORT;
  const url = `http://127.0.0.1:${port}`;

  // Check if server is running.
  try {
    const response = await fetch(`${url}/api/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(color(`✓ Server is running at ${url}`, "mint"));
  } catch (error) {
    console.log(color("⚠ Server not running. Starting it now...", "amber"));
    // Start server in background, then open browser.
    const env = {
      ...process.env,
      ZETORA_HOST: "127.0.0.1",
      ZETORA_PORT: String(port),
      ZETORA_WORKSPACE: opts.workspace || process.cwd(),
    };
    const child = spawn("node", [serverEntry], {
      stdio: "ignore",
      env,
      detached: true,
    });
    child.unref();

    // Wait for server to be ready.
    for (let i = 0; i < 50; i += 1) {
      try {
        const response = await fetch(`${url}/api/health`);
        if (response.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // Open the browser.
  const openCommands = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", url]],
    linux: ["xdg-open", [url]],
  };
  const platform = os.platform();
  const [cmd, cmdArgs] = openCommands[platform] || openCommands.linux;
  console.log(color(`→ Opening ${url} in your browser...`, "violet"));
  spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).unref();
}

async function checkHealth(args) {
  const opts = parseArgs(args);
  const port = opts.port || DEFAULT_PORT;
  const host = opts.host || "127.0.0.1";
  const url = `http://${host}:${port}/api/health`;

  try {
    const start = Date.now();
    const response = await fetch(url);
    const elapsed = Date.now() - start;

    if (!response.ok) {
      console.error(color(`✗ Server returned HTTP ${response.status}`, "red"));
      process.exit(1);
    }

    const data = await response.json();
    console.log(color("▰ ▰  ZETORA HEALTH", "violet"));
    console.log(color("──────────────────────────────────────", "dim"));
    console.log(`  ${color("status", "mint")}      ${data.ok ? color("✓ healthy", "mint") : color("✗ unhealthy", "red")}`);
    console.log(`  ${color("version", "mint")}     ${data.version}`);
    console.log(`  ${color("uptime", "mint")}      ${data.uptime}s`);
    console.log(`  ${color("workspace", "mint")}   ${data.workspace}`);
    console.log(`  ${color("memory", "mint")}      RSS ${data.memory?.rssMb || "?"}MB · heap ${data.memory?.heapUsedMb || "?"}MB`);
    console.log(`  ${color("git", "mint")}         ${data.git?.repository ? color("initialized", "mint") : color("not initialized", "amber")} (${data.git?.head || "no branch"})`);
    console.log(`  ${color("sessions", "mint")}    ${data.sessions}`);
    console.log(`  ${color("pending", "mint")}     ${data.approvalsPending} approvals`);
    console.log(color("──────────────────────────────────────", "dim"));
    console.log(`  ${color("response", "dim")}     ${elapsed}ms`);
  } catch (error) {
    console.error(color(`✗ Cannot reach server at ${url}`, "red"));
    console.error(color(`  ${error.message}`, "dim"));
    process.exit(1);
  }
}

function showVersion() {
  console.log(`zetora v${VERSION}`);
}

// ─── Argument parsing ───────────────────────────────────────────────────────
function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--workspace" || arg === "-w") opts.workspace = path.resolve(args[++i]);
    else if (arg === "--port" || arg === "-p") opts.port = Number(args[++i]);
    else if (arg === "--provider") opts.provider = args[++i];
    else if (arg === "--model") opts.model = args[++i];
    else if (arg === "--host") opts.host = args[++i];
    else if (arg === "--help" || arg === "-h") { showHelp(); process.exit(0); }
    else if (arg === "--version" || arg === "-v") { showVersion(); process.exit(0); }
  }
  return opts;
}

// ─── Main ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || "tui";
const commandArgs = command === "tui" || command === "serve" || command === "open" || command === "health"
  ? args.slice(1)
  : args;

switch (command) {
  case "tui":
  case "ui":
    startTui(commandArgs);
    break;
  case "serve":
  case "server":
  case "start":
    startServer(commandArgs);
    break;
  case "open":
  case "browser":
    openWorkspace(commandArgs);
    break;
  case "health":
  case "status":
    checkHealth(commandArgs);
    break;
  case "version":
  case "--version":
  case "-v":
    showVersion();
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
  default:
    console.error(color(`Unknown command: ${command}`, "red"));
    console.error(color(`Run 'zetora help' for usage.`, "dim"));
    process.exit(1);
}
