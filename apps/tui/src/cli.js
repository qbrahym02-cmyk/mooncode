#!/usr/bin/env node
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRunner } from "../../../packages/agent/src/index.js";
import { Workspace } from "../../../packages/tools/src/index.js";

const ansi = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", violet: "\x1b[38;5;141m",
  mint: "\x1b[38;5;79m", amber: "\x1b[38;5;215m", red: "\x1b[38;5;203m", clear: "\x1b[2J\x1b[H",
};
const color = (value, tone) => `${ansi[tone] || ""}${value}${ansi.reset}`;

function args(argv) {
  const output = { provider: process.env.ZETORA_PROVIDER || "demo", model: process.env.ZETORA_MODEL || "demo-local", workspace: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--provider") output.provider = argv[++index];
    else if (argv[index] === "--model") output.model = argv[++index];
    else if (argv[index] === "--workspace") output.workspace = path.resolve(argv[++index]);
    else if (argv[index] === "--help" || argv[index] === "-h") output.help = true;
  }
  return output;
}

const options = args(process.argv.slice(2));
if (options.help) {
  console.log(`Zetora TUI\n\nUsage: zetora [--workspace PATH] [--provider NAME] [--model NAME]\n\nEnvironment: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY`);
  process.exit(0);
}

const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
const workspace = new Workspace(options.workspace);
await workspace.ensure();
let pendingApproval = null;
const runner = new AgentRunner({ workspace, approvalStore: async (approval) => { pendingApproval = approval; } });
const history = [];

function header() {
  console.log(`${color("▰ ▰", "violet")}  ${color("ZETORA", "bold")} ${color("TUI", "dim")}`);
  console.log(color(`workspace  ${workspace.root}`, "dim"));
  console.log(color(`model      ${options.provider} / ${options.model}`, "dim"));
  console.log(color("────────────────────────────────────────────────────────────", "dim"));
  console.log(`${color("/help", "violet")} للأوامر · ${color("Ctrl+C", "violet")} للخروج\n`);
}

async function command(value) {
  const [name, ...rest] = value.slice(1).split(/\s+/);
  if (name === "help") {
    console.log(`${color("/files", "violet")} عرض الملفات\n${color("/provider NAME", "violet")} تغيير المزوّد\n${color("/model NAME", "violet")} تغيير النموذج\n${color("/clear", "violet")} مسح الشاشة\n${color("/exit", "violet")} خروج`);
  } else if (name === "files") {
    const files = await workspace.tree(".", { maxDepth: 2, maxEntries: 100 });
    for (const item of files) console.log(`${"  ".repeat(item.depth)}${item.type === "directory" ? color("◆", "violet") : "·"} ${item.path}`);
  } else if (name === "provider" && rest[0]) {
    options.provider = rest[0]; console.log(color(`provider → ${options.provider}`, "mint"));
  } else if (name === "model" && rest.length) {
    options.model = rest.join(" "); console.log(color(`model → ${options.model}`, "mint"));
  } else if (name === "clear") {
    stdout.write(ansi.clear); header();
  } else if (["exit", "quit", "q"].includes(name)) {
    rl.close(); process.exit(0);
  } else console.log(color(`أمر غير معروف: /${name}`, "amber"));
}

stdout.write(ansi.clear); header();
while (true) {
  let inputValue;
  try { inputValue = (await rl.question(`${color("you", "violet")}  › `)).trim(); }
  catch { break; }
  if (!inputValue) continue;
  if (inputValue.startsWith("/")) { await command(inputValue); continue; }
  history.push({ role: "user", content: inputValue });
  let assistantText = "";
  let announced = false;
  pendingApproval = null;
  await runner.run({ prompt: inputValue, history: history.slice(0, -1), provider: options.provider, model: options.model }, (event) => {
    if (event.type === "text.delta") {
      if (!announced) { stdout.write(`\n${color("zetora", "mint")} › `); announced = true; }
      stdout.write(event.delta); assistantText += event.delta;
    } else if (event.type === "tool.started") {
      stdout.write(`\n  ${color("↳", "violet")} ${color(event.name, "dim")} ${color(JSON.stringify(event.input), "dim")}\n`);
    } else if (event.type === "tool.finished") {
      stdout.write(`  ${color("✓", "mint")} ${color(event.name, "dim")}\n`);
    } else if (event.type === "error") {
      stdout.write(`\n${color("error", "red")} ${event.message}\n`);
    }
  });
  stdout.write("\n");
  if (assistantText) history.push({ role: "assistant", content: assistantText });
  if (pendingApproval) {
    const answer = (await rl.question(`${color("approval", "amber")} › ${pendingApproval.summary}\nAllow once? [y/N] `)).trim().toLowerCase();
    if (["y", "yes", "نعم", "ن"].includes(answer)) {
      try {
        const result = await runner.executeTool(pendingApproval.tool, true);
        console.log(color(`✓ executed: ${JSON.stringify(result).slice(0, 500)}`, "mint"));
      } catch (error) { console.log(color(error.message, "red")); }
    } else console.log(color("denied", "amber"));
  }
  console.log();
}
rl.close();
