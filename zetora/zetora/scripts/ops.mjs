#!/usr/bin/env node
/**
 * Moon Code operations CLI — central entry point for all dev/build/test/release tasks.
 *
 * Usage:
 *   node scripts/ops.mjs <command> [args]
 *
 * Commands:
 *   dev          Start the dev server with auto-reload
 *   start        Start the production server
 *   test         Run the test suite
 *   check        Syntax-check all source files
 *   env          Print the current environment (secrets redacted)
 *   env:validate Validate the environment and exit non-zero on errors
 *   health       Check if the server is healthy
 *   release      Bump version, update changelog, create git tag
 *   docker:build Build the production Docker image
 *   docker:run   Run the production Docker image
 *   clean        Remove build artifacts and runtime data
 *
 * This script replaces ad-hoc npm scripts with a single, documented entry point.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const command = args[0] || "help";

/** Run a command in the foreground, inheriting stdio. */
function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: root, shell: false, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

/** Run a command and return its stdout as a string. */
function capture(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { cwd: root, shell: false, encoding: "utf8" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

const commands = {
  help() {
    console.log(`Moon Code operations CLI

Usage: node scripts/ops.mjs <command> [args]

Commands:
  dev            Start the dev server with --watch auto-reload
  start          Start the production server
  tui            Start the terminal UI
  test           Run the test suite (node --test tests/*.test.js)
  check          Syntax-check all source files
  env            Print the current environment (secrets redacted)
  env:validate   Validate the environment and exit non-zero on errors
  health         Check if the server is healthy (GET /api/health)
  release <ver>  Bump version to <ver>, update changelog, create git tag
  docker:build   Build the production Docker image
  docker:run     Run the production Docker image
  docker:dev     Run the development Docker image with hot-reload
  clean          Remove build artifacts and runtime data
  git:status     Show git status + recent commits
  git:push       Push current branch + tags to origin

Environment:
  All commands read .env automatically. Set NODE_ENV=production for prod mode.
`);
  },

  async dev() {
    console.log("[ops] starting dev server with --watch...");
    const child = spawn("node", ["--watch", "apps/server/src/server.js"], {
      stdio: "inherit", cwd: root, env: { ...process.env, NODE_ENV: "development" },
    });
    child.on("close", (code) => process.exit(code ?? 0));
  },

  async start() {
    console.log("[ops] starting production server...");
    run("node", ["apps/server/src/server.js"], { env: { ...process.env, NODE_ENV: "production" } });
  },

  async tui() {
    run("node", ["apps/tui/src/cli.js", "--workspace", process.env.MOONCODE_WORKSPACE || "./workspace"]);
  },

  async test() {
    console.log("[ops] running tests...");
    run("node", ["--test", "tests/*.test.js"], { env: { ...process.env, NODE_ENV: "test" } });
  },

  async check() {
    console.log("[ops] syntax-checking all source files...");
    run("npm", ["run", "check"]);
    // Also check the new config package and ops files.
    const extraFiles = [
      "packages/config/src/index.js",
      "scripts/ops.mjs",
    ];
    for (const file of extraFiles) {
      run("node", ["--check", file]);
      console.log(`  ✓ ${file}`);
    }
    console.log("[ops] all files OK");
  },

  async env() {
    const { config } = await import("../packages/config/src/index.js");
    await config.load();
    console.log("Moon Code environment (secrets redacted):\n");
    console.log(config.toRedactedString());
    console.log("\nLoaded:", config._loaded ? "yes" : "no");
    console.log("Mode:", config.node.env);
  },

  async "env:validate"() {
    try {
      const { config } = await import("../packages/config/src/index.js");
      await config.load();
      console.log("[ops] environment is valid");
      console.log(config.toRedactedString());
    } catch (error) {
      console.error("[ops] environment validation FAILED:\n");
      console.error(error.message);
      process.exit(1);
    }
  },

  async health() {
    const port = process.env.MOONCODE_PORT || 4173;
    const host = process.env.MOONCODE_HOST || "127.0.0.1";
    try {
      const response = await fetch(`http://${host}:${port}/api/health`);
      if (!response.ok) {
        console.error(`[ops] health check failed: HTTP ${response.status}`);
        process.exit(1);
      }
      const data = await response.json();
      console.log("[ops] server is healthy:");
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`[ops] cannot reach server at http://${host}:${port}: ${error.message}`);
      process.exit(1);
    }
  },

  async release() {
    const version = args[1];
    if (!version) {
      console.error("[ops] usage: node scripts/ops.mjs release <version>  (e.g. 0.9.2)");
      process.exit(1);
    }
    if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(version)) {
      console.error(`[ops] invalid version: "${version}". Expected format: X.Y.Z or X.Y.Z-label`);
      process.exit(1);
    }

    console.log(`[ops] preparing release v${version}...`);

    // 1. Bump version in package.json
    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    const oldVersion = pkg.version;
    pkg.version = version;
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    console.log(`[ops] package.json: ${oldVersion} → ${version}`);

    // 2. Bump version in kernel PRODUCT constant
    const kernelPath = path.join(root, "packages/kernel/src/index.js");
    let kernelSrc = await readFile(kernelPath, "utf8");
    kernelSrc = kernelSrc.replace(/version:\s*"[^"]+"/, `version: "${version}"`);
    await writeFile(kernelPath, kernelSrc, "utf8");
    console.log(`[ops] kernel PRODUCT.version updated`);

    // 3. Run tests to make sure everything still works
    console.log("[ops] running tests before release...");
    run("node", ["--test", "tests/*.test.js"], { env: { ...process.env, NODE_ENV: "test" } });

    // 4. Git commit + tag
    console.log("[ops] committing release...");
    run("git", ["add", "-A"]);
    run("git", ["commit", "-m", `release: v${version}`]);
    run("git", ["tag", "-a", `v${version}`, "-m", `Moon Code v${version}`]);
    console.log(`[ops] release v${version} prepared. Push with: node scripts/ops.mjs git:push`);
  },

  async "docker:build"() {
    const tag = args[1] || `mooncode:0.9.1`;
    console.log(`[ops] building Docker image: ${tag}`);
    run("docker", ["build", "-t", tag, "-f", "docker/Dockerfile", "."]);
    console.log(`[ops] image built: ${tag}`);
  },

  async "docker:run"() {
    const tag = args[1] || `mooncode:0.9.1`;
    const port = args[2] || "4173:4173";
    console.log(`[ops] running Docker image: ${tag} on port ${port}`);
    run("docker", ["run", "--rm", "-p", port, "-v", `${path.join(root, "workspace")}:/app/workspace`, "-v", `${path.join(root, ".mooncode")}:/app/.mooncode`, tag]);
  },

  async "docker:dev"() {
    console.log("[ops] starting Docker dev environment...");
    run("docker", ["compose", "-f", "docker/docker-compose.yml", "up", "dev"]);
  },

  async clean() {
    const targets = [
      "node_modules",
      ".mooncode",
      "dist",
      "build",
      "out",
      "coverage",
      "*.log",
    ];
    console.log("[ops] cleaning build artifacts and runtime data...");
    for (const target of targets) {
      const full = path.join(root, target);
      if (existsSync(full)) {
        rmSync(full, { recursive: true, force: true });
        console.log(`  ✓ removed ${target}`);
      }
    }
    // Also clean any .tmp files in workspace
    const workspaceDir = path.join(root, "workspace");
    if (existsSync(workspaceDir)) {
      for (const entry of spawnSync("find", [workspaceDir, "-name", "*.tmp", "-type", "f"]).stdout.split("\n").filter(Boolean)) {
        rmSync(entry, { force: true });
      }
    }
    console.log("[ops] clean done");
  },

  async "git:status"() {
    console.log("[ops] git status:");
    run("git", ["status", "--short"]);
    console.log("\n[ops] recent commits:");
    run("git", ["log", "--oneline", "-10"]);
  },

  async "git:push"() {
    console.log("[ops] pushing to origin...");
    run("git", ["push", "origin", "HEAD"]);
    run("git", ["push", "--tags"]);
    console.log("[ops] push complete");
  },
};

// Dispatch
if (commands[command]) {
  Promise.resolve(commands[command]()).catch((error) => {
    console.error(`[ops] ${command} failed:`, error.message);
    process.exit(1);
  });
} else {
  console.error(`[ops] unknown command: ${command}`);
  console.error("Run 'node scripts/ops.mjs help' for usage.");
  process.exit(1);
}
