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
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from "node:fs";
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
const appPkg = {
  name: "mooncode-desktop-app",
  version: "1.2.4",
  private: true,
  description: "Moon Code — local-first agentic workspace for code and design",
  author: {
    name: "Brahim",
    email: "qbrahym02-cmyk@users.noreply.github.com",
  },
  homepage: "https://github.com/qbrahym02-cmyk/mooncode",
  main: "src/main.cjs",
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
