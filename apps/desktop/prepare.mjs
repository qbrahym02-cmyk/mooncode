#!/usr/bin/env node
/**
 * Prepare the desktop app for packaging.
 *
 * Copies all required source files from the monorepo into apps/desktop/app/
 * so that electron-builder can package them without traversing ../../
 * (which electron-builder does not support well).
 *
 * Run this before `electron-builder`.
 */
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// here = apps/desktop/
const desktopDir = here;
const monorepoRoot = path.resolve(desktopDir, "../..");
const appDir = path.join(desktopDir, "app");

console.log("→ Preparing desktop app...");
console.log(`  monorepo: ${monorepoRoot}`);
console.log(`  app dir:  ${appDir}`);

// Clean previous build.
if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

// Helper to copy if exists.
function copyIfExists(src, dest) {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    return true;
  }
  return false;
}

// Copy the desktop main process.
cpSync(path.join(desktopDir, "src"), path.join(appDir, "src"), { recursive: true });

// Copy the web client (static files served by the server).
copyIfExists(path.join(monorepoRoot, "apps/web/public"), path.join(appDir, "web", "public"));

// Copy the server source.
cpSync(path.join(monorepoRoot, "apps/server/src"), path.join(appDir, "server", "src"), { recursive: true });

// Fix import paths in server.js for the packaged app structure.
// In dev: server.js is at apps/server/src/, imports use ../../../packages/
// In packaged app: server.js is at app/server/src/, imports need ../../packages/
const serverJsPath = path.join(appDir, "server", "src", "server.js");
if (existsSync(serverJsPath)) {
  let serverSrc = readFileSync(serverJsPath, "utf8");
  // Replace ../../../packages/ with ../../packages/ (packaged structure is flatter)
  serverSrc = serverSrc.replace(/from "\.\.\/\.\.\/\.\.\/packages\//g, 'from "../../packages/');
  // Replace ../../../apps/ with ../../ (if any)
  serverSrc = serverSrc.replace(/from "\.\.\/\.\.\/\.\.\/apps\//g, 'from "../../');
  writeFileSync(serverJsPath, serverSrc, "utf8");
  console.log("  ✓ Fixed import paths in server.js");
}

// Also fix import paths in the TUI cli.js (same issue).
const tuiCliPath = path.join(appDir, "tui", "src", "cli.js");
if (existsSync(tuiCliPath)) {
  let tuiSrc = readFileSync(tuiCliPath, "utf8");
  tuiSrc = tuiSrc.replace(/from "\.\.\/\.\.\/\.\.\/packages\//g, 'from "../../packages/');
  writeFileSync(tuiCliPath, tuiSrc, "utf8");
  console.log("  ✓ Fixed import paths in tui/cli.js");
}

// Fix import paths in CLI cli.js.
const cliJsPath = path.join(appDir, "cli", "src", "cli.js");
if (existsSync(cliJsPath)) {
  let cliSrc = readFileSync(cliJsPath, "utf8");
  cliSrc = cliSrc.replace(/from "\.\.\/\.\.\/\.\.\/packages\//g, 'from "../../packages/');
  cliSrc = cliSrc.replace(/from "\.\.\/\.\.\/\.\.\/apps\//g, 'from "../../');
  writeFileSync(cliJsPath, cliSrc, "utf8");
  console.log("  ✓ Fixed import paths in cli/cli.js");
}

// Copy the TUI source.
cpSync(path.join(monorepoRoot, "apps/tui/src"), path.join(appDir, "tui", "src"), { recursive: true });

// Copy the CLI source.
cpSync(path.join(monorepoRoot, "apps/cli/src"), path.join(appDir, "cli", "src"), { recursive: true });

// Copy all packages.
cpSync(path.join(monorepoRoot, "packages"), path.join(appDir, "packages"), { recursive: true });

// Copy root-level files needed at runtime.
for (const file of ["package.json", "brand.json", ".env.example"]) {
  copyIfExists(path.join(monorepoRoot, file), path.join(appDir, file));
}

// Copy docs as extra resources.
copyIfExists(path.join(monorepoRoot, "docs"), path.join(appDir, "docs"));

// Create a minimal package.json for the app dir (electron needs it).
// CRITICAL: "type": "module" is required because server.js and all packages
// use ES modules (import/export). Without this, Node treats .js files as
// CommonJS and the server fails to start inside the packaged app.
const appPkg = {
  name: "mooncode-desktop-app",
  version: "5.0.0",
  private: true,
  description: "Moon Code — local-first agentic workspace for code and design",
  author: {
    name: "Brahim",
    email: "qbrahym02-cmyk@users.noreply.github.com",
  },
  homepage: "https://github.com/qbrahym02-cmyk/mooncode",
  main: "src/main.cjs",
  type: "module",
};
writeFileSync(path.join(appDir, "package.json"), JSON.stringify(appPkg, null, 2) + "\n", "utf8");

// Count files for verification.
function countFiles(dir) {
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) count += countFiles(full);
      else count += 1;
    }
  } catch {}
  return count;
}

console.log("✓ Desktop app prepared.");
console.log(`  Files in app/: ${countFiles(appDir)} files`);
