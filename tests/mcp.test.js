import test from "node:test";
import assert from "node:assert/strict";
import { McpClient, McpRegistry, McpError } from "../packages/mcp/src/index.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A tiny MCP server script used only for testing the client. It speaks the
 * JSON-RPC 2.0 subset of MCP that Moon Code relies on.
 */
const TEST_SERVER = `
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
const tools = [{
  name: "echo",
  description: "Echo back the input text",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }
}];
rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0", id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "test-server", version: "5.0.0" },
        capabilities: { tools: {}, resources: {}, prompts: {} },
      },
    }) + "\\n");
  } else if (message.method === "notifications/initialized") {
    // No response needed for notifications.
  } else if (message.method === "tools/list") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools } }) + "\\n");
  } else if (message.method === "tools/call") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0", id: message.id,
      result: { content: [{ type: "text", text: "echo: " + (message.params?.arguments?.text || "") }] },
    }) + "\\n");
  }
});
`;

async function spawnTestServer(workdir) {
  const serverPath = path.join(workdir, "mcp-test-server.mjs");
  await writeFile(serverPath, TEST_SERVER);
  return serverPath;
}

test("mcp client initialize + listTools + callTool round trip", async (t) => {
  const workdir = await mkdtemp(path.join(os.tmpdir(), "mooncode-mcp-"));
  t.after(() => rm(workdir, { recursive: true, force: true }));
  const serverPath = await spawnTestServer(workdir);

  const client = new McpClient({
    id: "test",
    command: process.execPath,
    args: [serverPath],
  });
  t.after(() => client.close());
  await client.start();
  assert.ok(client.initialized);
  assert.equal(client.serverInfo.name, "test-server");

  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "echo");

  const result = await client.callTool("echo", { text: "hello mcp" });
  assert.ok(result.content);
  assert.match(result.content[0].text, /echo: hello mcp/);
});

test("mcp registry aggregates tools with namespaced names", async (t) => {
  const workdir = await mkdtemp(path.join(os.tmpdir(), "mooncode-mcp-reg-"));
  t.after(() => rm(workdir, { recursive: true, force: true }));
  const serverPath = await spawnTestServer(workdir);
  const registry = new McpRegistry(path.join(workdir, "data"), workdir);
  await registry.addServer("echo", { command: process.execPath, args: [serverPath] });
  await registry.connect("echo");
  const tools = await registry.listAllTools();
  assert.equal(tools.length, 1);
  assert.match(tools[0].name, /^mcp\.echo\.echo$/);

  const result = await registry.callTool("mcp.echo.echo", { text: "registry" });
  assert.match(result.content[0].text, /echo: registry/);

  await registry.closeAll();
});

test("mcp client rejects unknown server gracefully", async () => {
  const registry = new McpRegistry("/tmp/does-not-exist", "/tmp");
  await assert.rejects(() => registry.connect("nope"), /Unknown MCP server/);
});
