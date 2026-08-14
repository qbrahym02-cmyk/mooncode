import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PROTOCOL_VERSION = "2024-11-05";
const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_GRACE_MS = 1_500;

/**
 * Minimal Model Context Protocol (MCP) client over stdio transport.
 *
 * The MCP spec defines a JSON-RPC 2.0 protocol where a server exposes tools,
 * resources, and prompts. This client implements the subset needed by Moon Code:
 * `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`,
 * and `prompts/list`. It deliberately avoids any third-party SDK so the agent
 * runtime stays dependency-free.
 *
 * Servers are spawned as child processes via stdio. Their config lives in
 * `.mooncode/mcp.json` so users can opt into servers per workspace.
 */
export class McpClient extends EventEmitter {
  constructor({ id, command, args = [], env = {}, cwd } = {}) {
    super();
    this.id = id;
    this.command = command;
    this.args = Array.isArray(args) ? args : [];
    this.env = { ...process.env, ...env };
    this.cwd = cwd;
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.serverInfo = null;
    this.serverCapabilities = null;
    this.initialized = false;
    this.closed = false;
  }

  async start() {
    if (this.child) return;
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.unref();
    this.child.stdout.on("data", (chunk) => this.#onData(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.emit("log", chunk.toString("utf8"));
    });
    this.child.once("exit", (code, signal) => {
      this.closed = true;
      this.emit("exit", { code, signal });
      // Reject any in-flight requests.
      for (const entry of this.pending.values()) {
        entry.reject(new Error(`MCP server exited (code=${code}, signal=${signal})`));
      }
      this.pending.clear();
    });
    this.child.once("error", (error) => {
      this.closed = true;
      this.emit("error", error);
    });
    await this.#initialize();
    this.initialized = true;
  }

  async #initialize() {
    const result = await this.#request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: "mooncode", version: "5.0.0" },
    });
    this.serverInfo = result.serverInfo;
    this.serverCapabilities = result.capabilities;
    await this.#notify("notifications/initialized", {});
  }

  #onData(chunk) {
    this.buffer += chunk.toString("utf8");
    // JSON-RPC messages are separated by newlines in stdio transport.
    const messages = this.buffer.split("\n");
    this.buffer = messages.pop() || "";
    for (const raw of messages) {
      if (!raw.trim()) continue;
      let message;
      try { message = JSON.parse(raw); } catch { continue; }
      this.#dispatch(message);
    }
  }

  #dispatch(message) {
    if (message.id != null && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new McpError(message.error));
      else entry.resolve(message.result);
    } else if (message.method) {
      // Server-initiated notification or request. We don't currently handle
      // server requests, just emit notifications.
      this.emit("notification", message);
    }
  }

  #request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const payload = { jsonrpc: "2.0", id, method, params };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS).unref();
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async #notify(method, params) {
    const payload = { jsonrpc: "2.0", method, params };
    if (!this.child || this.closed) return;
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async listTools() {
    if (!this.initialized) throw new Error("MCP client not initialized");
    const result = await this.#request("tools/list", {});
    return result.tools ?? [];
  }

  async callTool(name, args = {}) {
    if (!this.initialized) throw new Error("MCP client not initialized");
    const result = await this.#request("tools/call", { name, arguments: args });
    return result;
  }

  async listResources() {
    if (!this.initialized) throw new Error("MCP client not initialized");
    if (!this.serverCapabilities?.resources) return [];
    const result = await this.#request("resources/list", {});
    return result.resources ?? [];
  }

  async readResource(uri) {
    if (!this.initialized) throw new Error("MCP client not initialized");
    if (!this.serverCapabilities?.resources) throw new Error("Server does not expose resources");
    const result = await this.#request("resources/read", { uri });
    return result;
  }

  async listPrompts() {
    if (!this.initialized) throw new Error("MCP client not initialized");
    if (!this.serverCapabilities?.prompts) return [];
    const result = await this.#request("prompts/list", {});
    return result.prompts ?? [];
  }

  async close() {
    if (this.closed || !this.child) return;
    this.closed = true;
    try {
      await this.#notify("notifications/cancelled", {});
    } catch (error) {
      // v0.9.1: log instead of silently swallowing. The server may have already
      // exited, but other errors (broken pipe) are worth seeing.
      this.emit("log", `close: notify failed: ${error.message}`);
    }
    try { this.child.stdin.end(); } catch (error) {
      this.emit("log", `close: stdin.end failed: ${error.message}`);
    }
    setTimeout(() => {
      try { this.child?.kill("SIGKILL"); }
      catch (error) { this.emit("log", `close: SIGKILL failed: ${error.message}`); }
    }, SHUTDOWN_GRACE_MS).unref();
  }
}

export class McpError extends Error {
  constructor(error) {
    super(error?.message || "MCP error");
    this.name = "McpError";
    this.code = error?.code;
    this.data = error?.data;
  }
}

/**
 * Registry of running MCP clients, configured via `.mooncode/mcp.json`.
 * The schema is an object whose keys are server ids and values are
 * `{ command, args, env, cwd }` entries.
 */
export class McpRegistry extends EventEmitter {
  constructor(dataRoot, workspaceRoot) {
    super();
    this.dataRoot = path.resolve(dataRoot);
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.configPath = path.join(this.dataRoot, "mcp.json");
    this.clients = new Map();
  }

  async readConfig() {
    try {
      const text = await readFile(this.configPath, "utf8");
      const data = JSON.parse(text);
      return data.servers || data;
    } catch (error) {
      if (error?.code === "ENOENT") return {};
      throw error;
    }
  }

  async writeConfig(servers) {
    const { mkdir, writeFile, rename } = await import("node:fs/promises");
    await mkdir(this.dataRoot, { recursive: true });
    const tmp = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    // v0.9.1: include schemaVersion for future migration support.
    await writeFile(tmp, JSON.stringify({ schemaVersion: 1, servers }, null, 2), { mode: 0o600 });
    await rename(tmp, this.configPath);
  }

  async addServer(id, config) {
    const servers = await this.readConfig();
    servers[id] = { command: config.command, args: config.args || [], env: config.env || {}, cwd: config.cwd };
    await this.writeConfig(servers);
    return servers;
  }

  async removeServer(id) {
    const servers = await this.readConfig();
    delete servers[id];
    await this.writeConfig(servers);
    const client = this.clients.get(id);
    if (client) {
      await client.close();
      this.clients.delete(id);
    }
    return servers;
  }

  /**
   * Connect to a single configured server. Safe to call repeatedly — already
   * running clients are returned as-is.
   */
  async connect(id) {
    const existing = this.clients.get(id);
    if (existing && !existing.closed) return existing;
    const servers = await this.readConfig();
    const config = servers[id];
    if (!config) throw new Error(`Unknown MCP server: ${id}`);
    const client = new McpClient({
      id,
      command: config.command,
      args: config.args || [],
      env: config.env || {},
      cwd: config.cwd || this.workspaceRoot,
    });
    client.on("exit", () => this.clients.delete(id));
    client.on("error", (error) => this.emit("error", { id, error }));
    await client.start();
    this.clients.set(id, client);
    return client;
  }

  /**
   * Connect to all configured servers in parallel.
   * v0.9.1: previously sequential, now uses Promise.allSettled for parallelism.
   * Independent servers should not block each other on connect.
   */
  async connectAll() {
    const servers = await this.readConfig();
    const ids = Object.keys(servers);
    const settled = await Promise.allSettled(ids.map((id) => this.connect(id)));
    const results = {};
    settled.forEach((outcome, index) => {
      const id = ids[index];
      results[id] = outcome.status === "fulfilled"
        ? { ok: true }
        : { ok: false, error: outcome.reason?.message || String(outcome.reason) };
    });
    return results;
  }

  /**
   * Aggregate every tool exposed by every connected server. Tools are namespaced
   * as `mcp.<serverId>.<toolName>` to avoid collisions with workspace tools.
   */
  async listAllTools() {
    const tools = [];
    for (const [id, client] of this.clients) {
      if (client.closed) continue;
      try {
        const serverTools = await client.listTools();
        for (const tool of serverTools) {
          tools.push({
            ...tool,
            name: `mcp.${id}.${tool.name}`,
            serverId: id,
            originalName: tool.name,
          });
        }
      } catch (error) {
        this.emit("error", { id, error });
      }
    }
    return tools;
  }

  async callTool(namespacedName, args) {
    const match = namespacedName.match(/^mcp\.([^.)]+)\.(.+)$/);
    if (!match) throw new Error(`Not an MCP tool: ${namespacedName}`);
    const [, serverId, toolName] = match;
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server not connected: ${serverId}`);
    return client.callTool(toolName, args);
  }

  async closeAll() {
    const closes = [...this.clients.values()].map((client) => client.close().catch(() => {}));
    await Promise.all(closes);
    this.clients.clear();
  }
}
