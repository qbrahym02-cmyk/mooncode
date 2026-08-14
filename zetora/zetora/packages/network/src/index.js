/**
 * v3.1.0: Network utilities — mDNS discovery + audio cues.
 */
import { createSocket } from "node:dgram";
import { existsSync, readFile } from "node:fs/promises";
import path from "node:path";

// ─── mDNS Discovery ───
const MDNS_PORT = 5353;
const MDNS_ADDRESS = "224.0.0.251";

export function startMDNS(serviceName = "Moon Code", port = 4173) {
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.on("message", (msg, rinfo) => {
    // Simple mDNS response — in production, parse DNS packets properly
    if (msg.includes("mooncode") || msg.includes("_http._tcp")) {
      const response = Buffer.from(`mooncode._http._tcp.local\n${serviceName}\nport=${port}`);
      socket.send(response, MDNS_PORT, rinfo.address);
    }
  });
  socket.bind(MDNS_PORT, () => {
    socket.addMembership(MDNS_ADDRESS);
    socket.setBroadcast(true);
  });
  return { stop: () => socket.close() };
}

// ─── Audio Cues ───
const AUDIO_DIR = path.join(process.cwd(), "packages", "network", "assets", "audio");

/** @type {Object<string, string>} */
const CUE_FILES = {
  "message-received": "alert.mp3",
  "task-complete": "yup.mp3",
  "error": "nope.mp3",
  "approval-needed": "bip-bop.mp3",
  "tool-started": "staplebops.mp3",
};

/**
 * Play an audio cue (if audio files are available).
 * In Electron, uses the Web Audio API. In terminal, silently skips.
 */
export async function playAudioCue(cueName) {
  const filename = CUE_FILES[cueName];
  if (!filename) return;
  const filePath = path.join(AUDIO_DIR, filename);
  if (!existsSync(filePath)) return; // No audio file — skip silently
  // In Electron, the renderer handles audio playback via IPC
  // In terminal, we can use a system command if available
  if (process.platform === "darwin") {
    const { exec } = await import("node:child_process");
    exec(`afplay "${filePath}"`, () => {});
  } else if (process.platform === "linux") {
    const { exec } = await import("node:child_process");
    exec(`aplay "${filePath}" 2>/dev/null || true`, () => {});
  }
  // Windows: requires media foundation, skip for now
}

export const AUDIO_CUES = Object.keys(CUE_FILES);
