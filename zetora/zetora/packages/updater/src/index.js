/**
 * Moon Code auto-updater — checks GitHub Releases for new versions.
 *
 * v1.1.0: enables updating from anywhere in the world.
 *
 * How it works:
 *   1. Query the GitHub API for the latest release.
 *   2. Compare the latest version with the current version (semver).
 *   3. If newer, download the appropriate asset for the platform.
 *   4. Extract and replace the current installation.
 *   5. Verify the new version works.
 *
 * Supports:
 *   - npm global installs (via `npm update -g mooncode`)
 *   - curl/PowerShell installs (re-runs the install script)
 *   - Source installs (pulls latest git tag)
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, renameSync, chmodSync } from "node:fs";
import { readFile, writeFile, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "qbrahym02-cmyk/mooncode";
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Compare two semver versions. Returns 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/** Fetch the latest release info from GitHub. */
export async function fetchLatestRelease() {
  try {
    const response = await fetch(GITHUB_API, {
      headers: { "user-agent": "mooncode-updater/1.1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`✗ Could not check for updates: ${error.message}`);
    return null;
  }
}

/** Detect the current platform identifier. */
export function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "linux") return `linux-${arch}`;
  if (platform === "darwin") return `macos-${arch}`;
  if (platform === "win32") return `windows-${arch}`;
  return `${platform}-${arch}`;
}

/** Find the matching asset for the current platform. */
export function findAssetForPlatform(release) {
  const platform = detectPlatform();
  return (release.assets || []).find((a) => a.name.includes(platform)) || null;
}

/** Detect how Moon Code was installed: "npm" | "curl" | "source" | "unknown". */
export function detectInstallMethod() {
  const cliPath = fileURLToPath(import.meta.url);
  if (cliPath.includes("node_modules")) return "npm";
  let dir = path.dirname(cliPath);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, ".git"))) return "source";
    dir = path.dirname(dir);
  }
  const localBin = path.join(homedir(), ".local", "bin");
  if (cliPath.startsWith(localBin)) return "curl";
  return "unknown";
}

async function downloadFile(url, destPath, label = "") {
  const response = await fetch(url, {
    headers: { "user-agent": "mooncode-updater/1.1.0" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length") || 0);
  let received = 0;
  const reader = response.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && label) {
      const pct = Math.round((received / total) * 100);
      process.stdout.write(`\r  ${label}: ${pct}% (${Math.round(received / 1024)}KB)`);
    }
  }
  if (label) process.stdout.write("\n");
  await writeFile(destPath, Buffer.concat(chunks));
}

async function extractArchive(archivePath, destDir) {
  const ext = path.extname(archivePath);
  if (ext === ".zip") {
    if (process.platform === "win32") {
      spawnSync("powershell", ["-Command", `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`], { stdio: "inherit" });
    } else {
      spawnSync("unzip", ["-q", "-o", archivePath, "-d", destDir], { stdio: "inherit" });
    }
  } else {
    spawnSync("tar", ["-xzf", archivePath, "-C", destDir], { stdio: "inherit" });
  }
}

async function findExecutable(dir) {
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (entry.name === "mooncode" || entry.name === "mooncode.cmd") {
        return full;
      }
    }
    return null;
  }
  return walk(dir);
}

/**
 * Main update function. Checks for a new version and installs it if available.
 */
export async function checkAndUpdate(currentVersion, options = {}) {
  const { force = false, quiet = false } = options;
  if (!quiet) console.log("→ Checking for updates...");
  const release = await fetchLatestRelease();
  if (!release) return { updated: false, reason: "Could not fetch release info" };

  const latestVersion = release.tag_name.replace(/^v/, "");
  if (!force && compareVersions(latestVersion, currentVersion) <= 0) {
    if (!quiet) console.log(`✓ You're on the latest version (${currentVersion})`);
    return { updated: false, current: currentVersion, latest: latestVersion, reason: "already up to date" };
  }

  if (!quiet) {
    console.log(`★ Update available: ${currentVersion} → ${latestVersion}`);
    console.log(`  ${release.name || ""}\n`);
  }

  const installMethod = detectInstallMethod();

  if (installMethod === "npm") {
    if (!quiet) console.log("→ Updating via npm...");
    const result = spawnSync("npm", ["update", "-g", "mooncode"], { stdio: "inherit" });
    return result.status === 0
      ? { updated: true, from: currentVersion, to: latestVersion, method: "npm" }
      : { updated: false, reason: "npm update failed" };
  }

  if (installMethod === "source") {
    if (!quiet) console.log("→ Updating via git...");
    const result = spawnSync("git", ["pull", "origin", "main"], { stdio: "inherit" });
    if (result.status === 0) {
      spawnSync("git", ["fetch", "--tags"], { stdio: "inherit" });
      return { updated: true, from: currentVersion, to: latestVersion, method: "git" };
    }
    return { updated: false, reason: "git pull failed" };
  }

  // curl/PowerShell install — download the binary asset
  const asset = findAssetForPlatform(release);
  if (!asset) {
    if (!quiet) console.log(`⚠ No pre-built binary for ${detectPlatform()}\n  Falling back to install script...`);
    return await runInstallScript(quiet);
  }

  if (!quiet) console.log(`→ Downloading ${asset.name}...`);
  const tmpDir = await mkdtemp(path.join(tmpdir(), "mooncode-update-"));
  const archivePath = path.join(tmpDir, asset.name);

  try {
    await downloadFile(asset.browser_download_url, archivePath, "Downloading");
    if (!quiet) console.log("→ Extracting...");
    const extractDir = path.join(tmpDir, "extracted");
    mkdirSync(extractDir, { recursive: true });
    await extractArchive(archivePath, extractDir);

    const executable = await findExecutable(extractDir);
    if (!executable) throw new Error("Could not find mooncode executable in the archive");

    const localBin = path.join(homedir(), ".local", "bin");
    const installDir = existsSync(localBin) ? localBin : path.dirname(process.execPath);
    const destPath = path.join(installDir, path.basename(executable));

    if (!quiet) console.log(`→ Installing to ${destPath}...`);
    if (existsSync(destPath)) renameSync(destPath, `${destPath}.bak`);
    renameSync(executable, destPath);
    chmodSync(destPath, 0o755);

    const verify = spawnSync(destPath, ["version"], { encoding: "utf8" });
    if (verify.status === 0 && verify.stdout.includes(latestVersion)) {
      if (existsSync(`${destPath}.bak`)) rmSync(`${destPath}.bak`, { force: true });
      if (!quiet) console.log(`✓ Updated to v${latestVersion}`);
      return { updated: true, from: currentVersion, to: latestVersion, method: "binary" };
    }
    if (existsSync(`${destPath}.bak`)) renameSync(`${destPath}.bak`, destPath);
    throw new Error("Verification failed — restored previous version");
  } catch (error) {
    console.error(`✗ Update failed: ${error.message}`);
    return { updated: false, reason: error.message };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function runInstallScript(quiet) {
  if (!quiet) console.log("→ Re-running install script...");
  if (process.platform === "win32") {
    spawnSync("powershell", ["-Command",
      `iwr -useb https://raw.githubusercontent.com/${REPO}/main/scripts/install/install.ps1 | iex`,
    ], { stdio: "inherit" });
  } else {
    spawnSync("bash", ["-c",
      `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install/install.sh | bash`,
    ], { stdio: "inherit" });
  }
  return { updated: true, method: "script" };
}

/** Check for updates without installing. Returns { version, release } or null. */
export async function checkForUpdates(currentVersion) {
  const release = await fetchLatestRelease();
  if (!release) return null;
  const latest = release.tag_name.replace(/^v/, "");
  if (compareVersions(latest, currentVersion) > 0) return { version: latest, release };
  return null;
}
