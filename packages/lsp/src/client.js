/**
 * v3.2.0: Full LSP client — JSON-RPC 2.0 over stdio.
 *
 * Implements: hover, definition, references, implementation,
 * documentSymbol, workspaceSymbol, callHierarchy, completion, rename.
 *
 * Auto-detects and spawns language servers for:
 *   - TypeScript/JavaScript: typescript-language-server
 *   - Python: pyright / pyright-langserver
 *   - Go: gopls
 *   - Rust: rust-analyzer
 *   - Java: jdtls
 *
 * Falls back to the one-shot LspDiagnostics if no server is available.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ─── Language server registry ────────────────────────────────────────────────

const SERVER_REGISTRY = {
  typescript: {
    binary: "typescript-language-server",
    args: ["--stdio"],
    binPath: "node_modules/.bin/typescript-language-server",
    filePatterns: ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"],
    rootMarkers: ["tsconfig.json", "package.json", "jsconfig.json"],
    initOptions: { hostInfo: "mooncode" },
  },
  python: {
    binary: "pyright-langserver",
    args: ["--stdio"],
    binPath: "node_modules/.bin/pyright-langserver",
    filePatterns: ["*.py"],
    rootMarkers: ["pyproject.toml", "setup.py", "requirements.txt", ".pythonrc"],
    initOptions: {},
  },
  go: {
    binary: "gopls",
    args: ["-rpc.trace", "serve"],
    binPath: null,
    filePatterns: ["*.go"],
    rootMarkers: ["go.mod", "go.sum"],
    initOptions: {},
  },
  rust: {
    binary: "rust-analyzer",
    args: [],
    binPath: null,
    filePatterns: ["*.rs"],
    rootMarkers: ["Cargo.toml"],
    initOptions: {},
  },
};

/**
 * Detect which language server to use for a file.
 */
export function detectLanguageServer(filePath, workspaceRoot) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [id, server] of Object.entries(SERVER_REGISTRY)) {
    if (server.filePatterns.some((p) => p.includes(ext))) {
      // Check if the binary is available
      const binPath = server.binPath
        ? path.join(workspaceRoot, server.binPath)
        : null;
      const isAvailable = binPath ? existsSync(binPath) : Boolean(which(server.binary));
      if (isAvailable) return { id, ...server, resolvedBinPath: binPath || server.binary };
    }
  }
  return null;
}

/** Check if a binary exists in PATH (simple version). */
function which(cmd) {
  try {
    const { execSync } = require("node:child_process");
    execSync(`which ${cmd} 2>/dev/null`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── LSP Client ─────────────────────────────────────────────────────────────

/**
 * JSON-RPC 2.0 client over stdio for Language Server Protocol.
 */
export class LspClient {
  constructor(config) {
    this.id = config.id;
    this.command = config.resolvedBinPath || config.binary;
    this.args = config.args || [];
    this.initOptions = config.initOptions || {};
    this.process = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.initialized = false;
    this.capabilities = null;
    this.workspaceRoot = null;
  }

  /**
   * Start the language server and initialize the connection.
   */
  async start(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    return new Promise((resolve, reject) => {
      this.process = spawn(this.command, this.args, {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      this.process.stdout.on("data", (chunk) => this.#onData(chunk));
      this.process.stderr.on("data", (chunk) => {
        // Language servers often log to stderr — ignore
      });

      this.process.on("error", (err) => reject(new Error(`Failed to start ${this.command}: ${err.message}`)));
      this.process.on("exit", (code) => {
        this.initialized = false;
        // Reject pending requests
        for (const [, entry] of this.pending) {
          entry.reject(new Error(`Language server exited (code ${code})`));
        }
        this.pending.clear();
      });

      // Send initialize request
      this.#request("initialize", {
        processId: process.pid,
        rootUri: `file://${workspaceRoot}`,
        capabilities: {
          textDocument: {
            hover: { contentFormat: ["markdown", "plaintext"] },
            completion: { completionItem: { snippetSupport: true } },
            signatureHelp: {},
            definition: { linkSupport: false },
            references: {},
            implementation: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            callHierarchy: {},
            rename: { prepareSupport: true },
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: {
            symbol: {},
            workspaceFolders: true,
          },
        },
        initializationOptions: this.initOptions,
        workspaceFolders: [{ uri: `file://${workspaceRoot}`, name: path.basename(workspaceRoot) }],
      }).then((result) => {
        this.capabilities = result?.capabilities || {};
        this.initialized = true;
        // Send initialized notification
        this.#notify("initialized", {});
        resolve(result);
      }).catch(reject);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.initialized) reject(new Error("LSP initialization timeout"));
      }, 10_000).unref();
    });
  }

  /**
   * Send a request and wait for response.
   */
  #request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const payload = { jsonrpc: "2.0", id, method, params };
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, 30_000).unref();

      this.pending.set(id, { resolve, reject, timer });
      this.process.stdin.write(`Content-Length: ${Buffer.byteLength(JSON.stringify(payload))}\r\n\r\n${JSON.stringify(payload)}`);
    });
  }

  /**
   * Send a notification (no response expected).
   */
  #notify(method, params) {
    const payload = { jsonrpc: "2.0", method, params };
    const data = `Content-Length: ${Buffer.byteLength(JSON.stringify(payload))}\r\n\r\n${JSON.stringify(payload)}`;
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(data);
    }
  }

  /**
   * Parse LSP messages from the language server output.
   */
  #onData(chunk) {
    this.buffer += chunk.toString("utf8");
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) { this.buffer = ""; break; }
      const contentLength = parseInt(match[1], 10);
      const contentStart = headerEnd + 4;
      if (this.buffer.length < contentStart + contentLength) break;

      const content = this.buffer.slice(contentStart, contentStart + contentLength);
      this.buffer = this.buffer.slice(contentStart + contentLength);

      try {
        const message = JSON.parse(content);
        this.#dispatch(message);
      } catch {}
    }
  }

  /**
   * Dispatch a JSON-RPC message.
   */
  #dispatch(message) {
    if (message.id != null && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message || "LSP error"));
      else entry.resolve(message.result);
    } else if (message.method) {
      // Server notification or request
      if (message.method === "textDocument/publishDiagnostics") {
        this.#handleDiagnostics(message.params);
      } else if (message.method === "window/showMessage") {
        console.log(`[lsp:${this.id}] ${message.params.message}`);
      }
    }
  }

  #handleDiagnostics(params) {
    if (this.onDiagnostics) {
      this.onDiagnostics(params);
    }
  }

  // ─── LSP methods ──────────────────────────────────────────────────────────

  /** Open a document in the language server. */
  openDocument(filePath, content, version = 1) {
    this.#notify("textDocument/didOpen", {
      textDocument: {
        uri: `file://${path.resolve(filePath)}`,
        languageId: this.#getLanguageId(filePath),
        version,
        text: content,
      },
    });
  }

  /** Notify the server of a document change. */
  changeDocument(filePath, content, version) {
    this.#notify("textDocument/didChange", {
      textDocument: { uri: `file://${path.resolve(filePath)}`, version },
      contentChanges: [{ text: content }],
    });
  }

  /** Close a document. */
  closeDocument(filePath) {
    this.#notify("textDocument/didClose", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
    });
  }

  /** Get hover information at a position. */
  hover(filePath, line, character) {
    return this.#request("textDocument/hover", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
    });
  }

  /** Go to definition. */
  definition(filePath, line, character) {
    return this.#request("textDocument/definition", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
    });
  }

  /** Find references. */
  references(filePath, line, character) {
    return this.#request("textDocument/references", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
      context: { includeDeclaration: true },
    });
  }

  /** Go to implementation. */
  implementation(filePath, line, character) {
    return this.#request("textDocument/implementation", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
    });
  }

  /** Get document symbols (outline). */
  documentSymbols(filePath) {
    return this.#request("textDocument/documentSymbol", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
    });
  }

  /** Search workspace symbols. */
  workspaceSymbols(query) {
    return this.#request("workspace/symbol", { query });
  }

  /** Get completions at a position. */
  completion(filePath, line, character) {
    return this.#request("textDocument/completion", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
    });
  }

  /** Rename a symbol. */
  rename(filePath, line, character, newName) {
    return this.#request("textDocument/rename", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
      newName,
    });
  }

  /** Prepare call hierarchy. */
  prepareCallHierarchy(filePath, line, character) {
    return this.#request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: `file://${path.resolve(filePath)}` },
      position: { line, character },
    });
  }

  /** Get incoming calls. */
  incomingCalls(filePath, line, character) {
    return this.prepareCallHierarchy(filePath, line, character).then((items) => {
      if (!items || items.length === 0) return [];
      return this.#request("callHierarchy/incomingCalls", { item: items[0] });
    });
  }

  /** Get outgoing calls. */
  outgoingCalls(filePath, line, character) {
    return this.prepareCallHierarchy(filePath, line, character).then((items) => {
      if (!items || items.length === 0) return [];
      return this.#request("callHierarchy/outgoingCalls", { item: items[0] });
    });
  }

  /** Close the language server. */
  close() {
    if (this.process && !this.process.killed) {
      try { this.#notify("shutdown", {}); } catch {}
      setTimeout(() => { try { this.process.kill("SIGTERM"); } catch {} }, 1000).unref();
    }
    this.initialized = false;
  }

  /** Map file extension to LSP languageId. */
  #getLanguageId(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      ".ts": "typescript", ".tsx": "typescriptreact",
      ".js": "javascript", ".jsx": "javascriptreact",
      ".mjs": "javascript", ".cjs": "javascript",
      ".py": "python", ".go": "go", ".rs": "rust",
      ".java": "java", ".c": "c", ".cpp": "cpp",
      ".css": "css", ".html": "html", ".json": "json",
      ".md": "markdown",
    };
    return map[ext] || "plaintext";
  }
}

// ─── LSP Manager ────────────────────────────────────────────────────────────

/**
 * Manages multiple language servers (one per language).
 */
export class LspManager {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
    /** @type {Map<string, LspClient>} — languageId → client */
    this.clients = new Map();
    this.diagnostics = [];
  }

  /**
   * Ensure a language server is running for the given file.
   */
  async ensureServer(filePath) {
    const config = detectLanguageServer(filePath, this.workspaceRoot);
    if (!config) return null;

    if (this.clients.has(config.id)) {
      return this.clients.get(config.id);
    }

    const client = new LspClient(config);
    client.onDiagnostics = (params) => {
      this.diagnostics = (params.diagnostics || []).map((d) => ({
        source: config.id,
        severity: d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "info",
        file: params.uri.replace("file://", ""),
        line: d.range?.start?.line ?? 0,
        column: d.range?.start?.character ?? 0,
        endLine: d.range?.end?.line,
        endColumn: d.range?.end?.character,
        message: d.message,
        code: d.code,
      }));
    };

    try {
      await client.start(this.workspaceRoot);
      this.clients.set(config.id, client);
      return client;
    } catch (error) {
      console.error(`[lsp] Failed to start ${config.id}:`, error.message);
      return null;
    }
  }

  /**
   * Get hover info for a file at a position.
   */
  async hover(filePath, line, character) {
    const client = await this.ensureServer(filePath);
    if (!client) return null;
    // Open the document first
    const content = await this.#readFile(filePath);
    client.openDocument(filePath, content);
    return client.hover(filePath, line, character);
  }

  /**
   * Get all diagnostics for a file.
   */
  async getDiagnostics(filePath) {
    const client = await this.ensureServer(filePath);
    if (!client) return [];
    const content = await this.#readFile(filePath);
    client.openDocument(filePath, content);
    // Wait a bit for diagnostics to arrive
    await new Promise((r) => setTimeout(r, 500));
    return this.diagnostics;
  }

  async #readFile(filePath) {
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path.resolve(filePath), "utf8");
    } catch { return ""; }
  }

  /**
   * Close all language servers.
   */
  close() {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
  }
}
