import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(here, "..", "assets", "audio");

function generateWAV(frequencies, durationMs, sampleRate = 44100, volume = 0.15) {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  const freqStep = Math.max(1, Math.floor(numSamples / frequencies.length));
  for (let i = 0; i < numSamples; i++) {
    const freqIdx = Math.min(Math.floor(i / freqStep), frequencies.length - 1);
    const freq = frequencies[freqIdx];
    const t = (i % freqStep) / sampleRate;
    const env = Math.min(1, (i % freqStep) / (sampleRate * 0.01)) * Math.max(0, 1 - (i % freqStep) / freqStep);
    const sample = Math.sin(2 * Math.PI * freq * t) * volume * env;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

const CUES = [
  { name: "alert-1", freqs: [880], dur: 200 }, { name: "alert-2", freqs: [660, 880], dur: 250 },
  { name: "alert-3", freqs: [440, 660, 880], dur: 300 }, { name: "alert-soft", freqs: [523], dur: 150 },
  { name: "alert-urgent", freqs: [880, 880, 880], dur: 300 }, { name: "alert-chime", freqs: [523, 659, 784], dur: 400 },
  { name: "alert-bell", freqs: [784, 988], dur: 350 }, { name: "alert-ding", freqs: [1047], dur: 150 },
  { name: "alert-dong", freqs: [392], dur: 300 }, { name: "alert-notify", freqs: [659, 880], dur: 200 },
  { name: "yup", freqs: [659, 880], dur: 150 }, { name: "confirm-1", freqs: [523, 659], dur: 150 },
  { name: "confirm-2", freqs: [523, 659, 784], dur: 200 }, { name: "confirm-soft", freqs: [659], dur: 100 },
  { name: "confirm-success", freqs: [659, 784, 1047], dur: 300 }, { name: "confirm-done", freqs: [784, 1047], dur: 200 },
  { name: "confirm-ok", freqs: [880], dur: 100 }, { name: "confirm-yes", freqs: [523, 659, 523], dur: 200 },
  { name: "confirm-positive", freqs: [587, 784], dur: 150 }, { name: "confirm-complete", freqs: [523, 659, 784, 1047], dur: 400 },
  { name: "nope", freqs: [220, 196], dur: 200 }, { name: "error-1", freqs: [330, 247], dur: 250 },
  { name: "error-2", freqs: [196, 165], dur: 300 }, { name: "error-buzz", freqs: [110, 110], dur: 300 },
  { name: "error-fail", freqs: [247, 196, 165], dur: 350 }, { name: "error-denied", freqs: [196, 165, 131], dur: 300 },
  { name: "error-wrong", freqs: [330, 277, 220], dur: 250 }, { name: "error-cancel", freqs: [247, 196], dur: 150 },
  { name: "error-reject", freqs: [165, 131], dur: 250 }, { name: "error-negative", freqs: [220, 196, 165], dur: 300 },
  { name: "tool-start", freqs: [880, 988], dur: 100 }, { name: "tool-end", freqs: [988, 880], dur: 100 },
  { name: "tool-read", freqs: [659], dur: 80 }, { name: "tool-write", freqs: [784], dur: 80 },
  { name: "tool-search", freqs: [698, 784], dur: 120 }, { name: "tool-grep", freqs: [587, 698], dur: 100 },
  { name: "tool-run", freqs: [440, 554], dur: 150 }, { name: "tool-fix", freqs: [659, 784, 880], dur: 200 },
  { name: "tool-parse", freqs: [880], dur: 60 }, { name: "tool-build", freqs: [523, 659, 784], dur: 250 },
  { name: "tool-test", freqs: [659, 880], dur: 150 }, { name: "tool-git", freqs: [698], dur: 80 },
  { name: "tool-mcp", freqs: [587, 880], dur: 120 }, { name: "tool-spawn", freqs: [523, 659, 784, 880], dur: 200 },
  { name: "tool-fetch", freqs: [784, 880], dur: 100 }, { name: "tool-ast", freqs: [698, 880], dur: 80 },
  { name: "staplebops", freqs: [523, 587, 659, 698], dur: 200 }, { name: "bip-bop", freqs: [880, 659], dur: 150 },
  { name: "bip-bop-bip", freqs: [880, 659, 880], dur: 200 }, { name: "click", freqs: [1200], dur: 30 },
  { name: "ui-hover", freqs: [1200], dur: 20 }, { name: "ui-click", freqs: [880], dur: 30 },
  { name: "ui-tab", freqs: [784, 880], dur: 50 }, { name: "ui-switch", freqs: [659, 784], dur: 60 },
  { name: "ui-open", freqs: [523, 659, 784], dur: 100 }, { name: "ui-close", freqs: [784, 659, 523], dur: 100 },
  { name: "ui-expand", freqs: [659, 880], dur: 80 }, { name: "ui-collapse", freqs: [880, 659], dur: 80 },
  { name: "ui-scroll", freqs: [988], dur: 20 }, { name: "ui-select", freqs: [784], dur: 40 },
  { name: "ui-deselect", freqs: [659], dur: 40 }, { name: "ui-focus", freqs: [880, 988], dur: 50 },
  { name: "ui-blur", freqs: [988, 880], dur: 50 }, { name: "ui-drag", freqs: [587], dur: 30 },
  { name: "ui-drop", freqs: [784, 880], dur: 60 }, { name: "message-in", freqs: [659, 880], dur: 100 },
  { name: "message-out", freqs: [880, 659], dur: 100 }, { name: "message-user", freqs: [523, 659], dur: 80 },
  { name: "message-assistant", freqs: [659, 784], dur: 80 }, { name: "message-system", freqs: [440], dur: 60 },
  { name: "message-tool", freqs: [587], dur: 50 }, { name: "message-error", freqs: [330, 247], dur: 150 },
  { name: "message-approval", freqs: [659, 523, 659], dur: 200 }, { name: "message-typing", freqs: [880, 880, 880], dur: 100 },
  { name: "message-sent", freqs: [784, 1047], dur: 80 }, { name: "session-start", freqs: [523, 659, 784, 1047], dur: 300 },
  { name: "session-end", freqs: [1047, 784, 659, 523], dur: 300 }, { name: "session-pause", freqs: [659], dur: 200 },
  { name: "session-resume", freqs: [659, 880], dur: 150 }, { name: "session-fork", freqs: [523, 659, 523], dur: 200 },
];

async function main() {
  await mkdir(outputDir, { recursive: true });
  console.log(`Generating ${CUES.length} audio cues...`);
  for (const cue of CUES) {
    const wav = generateWAV(cue.freqs, cue.dur);
    await writeFile(path.join(outputDir, `${cue.name}.wav`), wav);
  }
  console.log(`✅ Generated ${CUES.length} audio files.`);
}
main().catch(console.error);
