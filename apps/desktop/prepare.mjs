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
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, "..");
const monorepoRoot = path.resolve(desktopDir, "../..");
const appDir = path.join(desktopDir, "app");

console.log("→ Preparing desktop app...");
console.log(`  monorepo: ${monorepoRoot}`);
console.log(`  app dir:  ${appDir}`);

// Clean previous build.
if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

// Copy the desktop main process.
cpSync(path.join(desktopDir, "src"), path.join(appDir, "src"), { recursive: true });

// Copy the web client (static files served by the server).
cpSync(path.join(monorepoRoot, "apps/web/public"), path.join(appDir, "web", "public"), { recursive: true });

// Copy the server source.
cpSync(path.join(monorepoRoot, "apps/server/src"), path.join(appDir, "server", "src"), { recursive: true });
cpSync(path.join(monorepoRoot, "apps/server/src/lib.js"), path.join(appDir, "server", "src", "lib.js"));

// Copy the TUI source.
cpSync(path.join(monorepoRoot, "apps/tui/src"), path.join(appDir, "tui", "src"), { recursive: true });

// Copy the CLI source.
cpSync(path.join(monorepoRoot, "apps/cli/src"), path.join(appDir, "cli", "src"), { recursive: true });

// Copy all packages.
cpSync(path.join(monorepoRoot, "packages"), path.join(appDir, "packages"), { recursive: true });

// Copy root-level files needed at runtime.
const rootFiles = ["package.json", "brand.json", ".env.example"];
for (const file of rootFiles) {
  const src = path.join(monorepoRoot, file);
  if (existsSync(src)) cpSync(src, path.join(appDir, file));
}

// Copy docs as extra resources.
cpSync(path.join(monorepoRoot, "docs"), path.join(appDir, "docs"), { recursive: true });

// Create a minimal package.json for the app dir (electron needs it).
import { writeFileSync } from "node:fs";
const appPkg = {
  name: "mooncode-desktop-app",
  version: "1.2.0",
  private: true,
  main: "src/main.cjs",
  type: "commonjs",
};
writeFileSync(path.join(appDir, "package.json"), JSON.stringify(appPkg, null, 2) + "\n", "utf8");

console.log("✓ Desktop app prepared.");
console.log(`  Files in app/: ${countFiles(appDir)} files`);

function countFiles(dir) {
  let count = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else count += 1;
    }
  };
  try { walk(dir); } catch {}
  return count;
}
function readdirSync(d) {
  try { return require("fs").readdirSync(d, { withFileTypes: true }); }
  catch { return []; }
}
