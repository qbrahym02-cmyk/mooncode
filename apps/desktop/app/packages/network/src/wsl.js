/**
 * v3.2.0: WSL integration — spawn Moon Code server inside WSL distros.
 * Only active on Windows (checks for wsl.exe).
 */
import { spawn, spawnSync } from "node:child_process";

export function isWSLAvailable() {
  if (process.platform !== "win32") return false;
  try {
    spawnSync("wsl", ["--list"], { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function listWSLDistros() {
  if (!isWSLAvailable()) return [];
  try {
    const result = spawnSync("wsl", ["--list", "--quiet"], { encoding: "utf8" });
    return result.stdout.split("\n").map((d) => d.trim()).filter(Boolean);
  } catch { return []; }
}

export function spawnWSLSidecar(distro, workspacePath, port = 4173) {
  if (!isWSLAvailable()) throw new Error("WSL not available");
  const cmd = `cd ${workspacePath} && MOONCODE_PORT=${port} node apps/server/src/server.js`;
  return spawn("wsl", ["-d", distro, "bash", "-c", cmd], { stdio: "pipe" });
}
