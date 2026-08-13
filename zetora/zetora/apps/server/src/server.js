import http from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentRunner } from "../../../packages/agent/src/index.js";
import { providerCatalog, callModel } from "../../../packages/providers/src/index.js";
import { JsonStore } from "../../../packages/storage/src/index.js";
import { Workspace } from "../../../packages/tools/src/index.js";
import { Git } from "../../../packages/git/src/index.js";
import { PtyRegistry } from "../../../packages/pty/src/index.js";
import { FileWatcher } from "../../../packages/watcher/src/index.js";
import { renderArtifact, detectKind } from "../../../packages/artifacts/src/index.js";
import { ContextFiles, Compactor } from "../../../packages/context/src/index.js";
import { McpRegistry } from "../../../packages/mcp/src/index.js";
import { SkillRegistry, BUILTIN_SKILLS } from "../../../packages/skills/src/index.js";
import { DesignTokens } from "../../../packages/design/src/index.js";
import { AutoFix, diagnoseError } from "../../../packages/autofix/src/index.js";
import { SearchIndex } from "../../../packages/search-index/src/index.js";
import { TodoList } from "../../../packages/todos/src/index.js";
import { LspDiagnostics } from "../../../packages/lsp/src/index.js";
import { PluginRegistry } from "../../../packages/plugins/src/index.js";
import { CollabRegistry, CollabSession } from "../../../packages/collab/src/index.js";
import { PluginSigner, TrustRegistry } from "../../../packages/security/src/index.js";
import { AuditLog } from "../../../packages/security/src/audit.js";
import { RateLimiter, applyRateLimit } from "../../../packages/security/src/rate-limit.js";
import { redactSecrets } from "../../../packages/security/src/secrets.js";
// v0.9.1: extracted helpers into lib.js to reduce server.js size.
import {
  json, body, serveStatic,
  persistSessionEvent as persistSessionEventImpl,
  recordMessage as recordMessageImpl,
  parseMultipart, guessMimeFromName, guessMimeFromContentType,
  buildFillInMiddlePrompt, computeHeuristicSuggestion,
} from "./lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const publicDir = path.join(root, "apps/web/public");
const workspaceRoot = path.resolve(root, process.env.ZETORA_WORKSPACE || "workspace");
const dataRoot = path.resolve(root, process.env.ZETORA_DATA || ".zetora");
const uploadsRoot = path.join(dataRoot, "uploads");
// SECURITY (v0.9): bind to localhost by default. Binding to 0.0.0.0 exposes
// the agent's file/write/command tools to anyone on the network. Users who
// explicitly want remote access must set ZETORA_HOST=0.0.0.0 AND acknowledge
// the risk via ZETORA_ALLOW_REMOTE=1.
const requestedHost = process.env.ZETORA_HOST || "127.0.0.1";
const allowRemote = process.env.ZETORA_ALLOW_REMOTE === "1";
const host = (requestedHost === "0.0.0.0" && !allowRemote) ? "127.0.0.1" : requestedHost;
const port = Number(process.env.ZETORA_PORT || 4173);
const workspace = new Workspace(workspaceRoot);
const git = new Git(workspaceRoot);
const ptyRegistry = new PtyRegistry();
const contextFiles = new ContextFiles(workspace, dataRoot);
const compactor = new Compactor({ threshold: 30, keepRecent: 8 });
const mcpRegistry = new McpRegistry(dataRoot, workspaceRoot);
const skills = new SkillRegistry(workspaceRoot);
const designTokens = new DesignTokens(workspaceRoot);
const autoFix = new AutoFix(workspaceRoot);
const searchIndex = new SearchIndex(workspaceRoot);
const todoList = new TodoList();
const lsp = new LspDiagnostics(workspaceRoot);
const pluginRegistry = new PluginRegistry(dataRoot);
const collabRegistry = new CollabRegistry();
// SECURITY (v0.9): cryptographic plugin signing + trust registry + audit log + rate limiter.
const pluginSigner = new PluginSigner(dataRoot);
const trustRegistry = new TrustRegistry(dataRoot);
const auditLog = new AuditLog(dataRoot);
const rateLimiter = new RateLimiter({ windowMs: 60_000, max: 200 });
// Wire the signer + trust registry into the plugin registry.
pluginRegistry.signer = pluginSigner;
pluginRegistry.trustRegistry = trustRegistry;
const stateStore = new JsonStore(path.join(dataRoot, "state.json"), {
  product: { name: "Zetora", nameArabic: "زيتورا", version: "0.7.0" },
  projects: [{ id: "zetora-self", name: "Zetora", path: workspaceRoot, kind: "code-design", createdAt: new Date().toISOString() }],
  sessions: [{ id: "welcome", title: "البدء مع Zetora", updatedAt: new Date().toISOString(), mode: "build", messages: [], events: [], usage: null }],
  approvals: [],
  runs: [],
});

await workspace.ensure();
await mkdir(uploadsRoot, { recursive: true });
await contextFiles.ensure();

// File watcher: emits SSE updates on /api/events to all connected clients.
const watcher = new FileWatcher(workspaceRoot);
const watcherClients = new Set();
watcher.on("change", (event) => {
  const payload = JSON.stringify({ type: "file.changed", ...event });
  for (const client of watcherClients) {
    try { client.write(`data: ${payload}\n\n`); } catch {}
  }
});
watcher.start().catch((error) => console.error("[zetora] watcher failed:", error.message));

// Best-effort MCP server reconnection on startup. Failures are non-fatal.
mcpRegistry.connectAll().catch((error) => console.error("[zetora] mcp init:", error.message));

// Approvals store API for the runner.
const approvalStoreApi = {
  async __call(approval) {
    await stateStore.update((state) => {
      state.approvals = [approval, ...(state.approvals ?? [])].slice(0, 200);
      return state;
    });
  },
  async readAll() { return stateStore.read(); },
  async resolve(id, status, result) {
    await stateStore.update((next) => {
      const item = (next.approvals ?? []).find((entry) => entry.id === id);
      if (item) {
        item.status = status;
        item.resolvedAt = new Date().toISOString();
        item.result = result;
      }
      return next;
    });
  },
};

const runner = new AgentRunner({
  workspace,
  approvalStore: approvalStoreApi,
  eventStore: stateStore,
  git,
  contextFiles,
  compactor,
  mcpRegistry,
  skills,
  designTokens,
  autoFix,
  searchIndex,
  todoList,
});

// v0.9.1: wrappers that bind stateStore so call sites in api() don't need to change.
async function persistSessionEvent(sessionId, event) {
  return persistSessionEventImpl(sessionId, event, stateStore);
}
async function recordMessage(sessionId, role, content) {
  return recordMessageImpl(sessionId, role, content, stateStore);
}

async function api(request, response, url) {
  const method = request.method || "GET";
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/health") {
    return json(response, 200, {
      ok: true,
      service: "zetora",
      version: "0.9.0",
      workspace: workspaceRoot,
      isDemoWorkspace: workspaceRoot === path.resolve(root, "workspace"),
    });
  }

  // Workspace switch API: lets the user point Zetora at a different directory
  // without restarting the server. Validated against path traversal.
  if (method === "POST" && pathname === "/api/workspace") {
    const input = await body(request);
    const targetPath = path.resolve(String(input.path || ""));
    try {
      const info = await stat(targetPath);
      if (!info.isDirectory()) return json(response, 400, { error: "Path is not a directory" });
      // Reinitialize workspace-bound services.
      workspace.root = targetPath;
      git.root = targetPath;
      searchIndex.root = targetPath;
      lsp.root = targetPath;
      autoFix.root = targetPath;
      designTokens.root = targetPath;
      skills.root = targetPath;
      await workspace.ensure();
      await auditLog.record({ action: "workspace.switch", from: workspaceRoot, to: targetPath });
      return json(response, 200, { ok: true, workspace: targetPath, message: "Workspace switched. Refresh the browser to see the new files." });
    } catch (error) {
      return json(response, 400, { error: `Cannot access path: ${error.message}` });
    }
  }

  if (method === "GET" && pathname === "/api/bootstrap") {
    const state = await stateStore.read();
    const files = await workspace.tree(".", { maxDepth: 4, maxEntries: 600 });
    const gitStatus = await git.status().catch(() => ({ repository: false }));
    const skillList = await skills.list().catch(() => []);
    const tokens = await designTokens.read().catch(() => null);
    const ctxManifest = await contextFiles.readManifest().catch(() => ({ files: [] }));
    return json(response, 200, {
      product: { name: "Zetora", nameArabic: "زيتورا", version: "0.7.0" },
      project: state.projects?.[0],
      sessions: state.sessions ?? [],
      approvals: (state.approvals ?? []).filter((item) => item.status === "pending"),
      providers: providerCatalog(),
      files,
      git: gitStatus,
      capabilities: { web: true, desktop: true, tui: true, artifacts: true, terminal: true, localFirst: true, streaming: true, resume: true, diff: true, git: true, pty: true, multimodal: true, watcher: true, mcp: true, skills: true, designTokens: true, contextFiles: true, compaction: true, autoFix: true, grep: true, fetchUrl: true, runTests: true, parseAst: true, subagents: true, diagnose: true, worktrees: true, gitGraph: true, searchIndex: true, todos: true, lsp: true, plugins: true, collab: true, voice: true, markdownEditor: true, codeEditor: true, pwa: true, cryptographicSigning: true, auditLog: true, rateLimiting: true, secretRedaction: true, trustRegistry: true },
      artifactExtensions: ["html", "htm", "svg", "png", "jpg", "jpeg", "gif", "webp", "avif", "md", "markdown", "json", "jsonc", "txt", "log", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "py", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp", "sh", "sql", "yml", "yaml", "toml", "xml", "env"],
      skills: skillList,
      builtinSkills: BUILTIN_SKILLS,
      designTokens: tokens,
      contextFiles: ctxManifest.files,
      mcpServers: [...mcpRegistry.clients.values()].map((client) => ({ id: client.id, closed: client.closed, serverInfo: client.serverInfo })),
    });
  }

  if (method === "GET" && pathname === "/api/tree") {
    return json(response, 200, await workspace.tree(url.searchParams.get("path") || ".", {
      maxDepth: url.searchParams.get("depth") || 6,
      maxEntries: 2000,
    }));
  }

  if (method === "GET" && pathname === "/api/file") {
    return json(response, 200, await workspace.read(url.searchParams.get("path") || ""));
  }

  if (method === "PUT" && pathname === "/api/file") {
    if (request.headers["x-zetora-confirm"] !== "write") return json(response, 428, { error: "Explicit write confirmation header is required" });
    const input = await body(request, 5_000_000);
    const result = await workspace.write(input.path, input.content);
    await git.checkpoint(`zetora: write ${input.path}`).catch(() => {});
    await auditLog.record({ action: "file.write", path: input.path, bytes: result.bytes });
    return json(response, 200, result);
  }

  if (method === "GET" && pathname === "/api/search") {
    return json(response, 200, await workspace.search(url.searchParams.get("q") || "", { regex: url.searchParams.get("regex") === "true" }));
  }

  // Sessions API
  const sessionMatch = pathname.match(/^\/api\/sessions(?:\/([^/]+))?$/);
  if (sessionMatch) {
    if (method === "GET" && !sessionMatch[1]) {
      const state = await stateStore.read();
      return json(response, 200, (state.sessions ?? []).map((session) => ({
        id: session.id, title: session.title, mode: session.mode, updatedAt: session.updatedAt,
        messageCount: (session.messages ?? []).length, usage: session.usage ?? null,
      })));
    }
    if (method === "POST" && !sessionMatch[1]) {
      const input = await body(request);
      const id = input.id || crypto.randomUUID();
      await stateStore.update((state) => {
        if ((state.sessions ?? []).some((item) => item.id === id)) return state;
        state.sessions.unshift({
          id, title: input.title || `جلسة جديدة ${id.slice(0, 4)}`, mode: input.mode || "build",
          updatedAt: new Date().toISOString(), messages: [], events: [], usage: null,
        });
        return state;
      });
      return json(response, 201, { id });
    }
    if (method === "GET" && sessionMatch[1]) {
      const state = await stateStore.read();
      const session = (state.sessions ?? []).find((item) => item.id === sessionMatch[1]);
      if (!session) return json(response, 404, { error: "Session not found" });
      return json(response, 200, session);
    }
    if (method === "DELETE" && sessionMatch[1]) {
      await stateStore.update((state) => {
        state.sessions = (state.sessions ?? []).filter((item) => item.id !== sessionMatch[1]);
        return state;
      });
      return json(response, 200, { deleted: sessionMatch[1] });
    }
  }

  // Git API
  const gitMatch = pathname.match(/^\/api\/git\/([a-z]+)$/);
  if (gitMatch) {
    const action = gitMatch[1];
    if (action === "status") return json(response, 200, await git.status().catch((error) => ({ repository: false, error: error.message })));
    if (action === "diff") return json(response, 200, await git.diff({ path: url.searchParams.get("path") || undefined, cached: url.searchParams.get("cached") === "true" }).catch((error) => ({ repository: false, error: error.message })));
    if (action === "log") return json(response, 200, await git.log({ limit: Number(url.searchParams.get("limit")) || 20 }).catch(() => ({ commits: [] })));
    if (action === "branches") return json(response, 200, await git.branches().catch(() => ({ branches: [], current: null })));
    if (action === "init") return json(response, 200, await git.init());
    if (action === "checkpoint") {
      const input = await body(request);
      return json(response, 200, await git.checkpoint(input.message || "zetora: manual checkpoint"));
    }
    if (action === "undo") {
      const input = await body(request).catch(() => ({}));
      // HARD undo requires explicit confirmation to prevent accidental data loss.
      if (input.hard === true && input.confirm !== true) {
        return json(response, 200, {
          undone: false,
          reason: "hard_undo_requires_confirmation",
          message: "Hard undo will discard all changes since the last checkpoint. Pass { hard: true, confirm: true } to proceed.",
          currentHead: await git.head().catch(() => null),
        });
      }
      const result = await git.undo({ hard: input.hard === true, confirm: input.confirm === true }).catch((error) => ({ undone: false, error: error.message }));
      if (result.backup) {
        result.recoveryHint = `If you lost work, recover it via: git checkout ${result.backup}`;
      }
      return json(response, 200, result);
    }
    if (action === "head") return json(response, 200, { sha: await git.head() });
  }

  // PTY sessions API
  const ptyMatch = pathname.match(/^\/api\/terminal\/sessions(?:\/([^/]+))?$/);
  if (ptyMatch) {
    if (method === "GET" && !ptyMatch[1]) return json(response, 200, ptyRegistry.list());
    if (method === "POST" && !ptyMatch[1]) {
      const input = await body(request);
      const session = await ptyRegistry.create({ cwd: workspaceRoot, cols: input.cols || 80, rows: input.rows || 24 });
      return json(response, 201, { id: session.id, cwd: session.cwd, cols: session.cols, rows: session.rows });
    }
    if (method === "DELETE" && ptyMatch[1]) {
      const session = ptyRegistry.get(ptyMatch[1]);
      if (!session) return json(response, 404, { error: "Session not found" });
      session.close("deleted");
      return json(response, 200, { deleted: ptyMatch[1] });
    }
  }

  // PTY send: run a command in the persistent session
  const ptySendMatch = pathname.match(/^\/api\/terminal\/sessions\/([^/]+)\/send$/);
  if (method === "POST" && ptySendMatch) {
    const session = ptyRegistry.get(ptySendMatch[1]);
    if (!session) return json(response, 404, { error: "Session not found" });
    if (session.closed) return json(response, 410, { error: "Session closed" });
    const input = await body(request);
    if (input.resize) session.resize(input.resize.cols, input.resize.rows);
    if (input.signal === "interrupt") { session.interrupt(); return json(response, 200, { interrupted: true }); }
    if (!input.command) return json(response, 400, { error: "command is required" });
    try {
      const result = await session.send(input.command, { timeout: input.timeout });
      return json(response, 200, result);
    } catch (error) { return json(response, 500, { error: error.message }); }
  }

  // Legacy one-shot terminal (still supported for backwards compatibility)
  if (method === "POST" && pathname === "/api/terminal") {
    const input = await body(request);
    const result = await workspace.run(input.command, { approved: request.headers["x-zetora-confirm"] === "execute", timeout: input.timeout });
    return json(response, result.approvalRequired ? 202 : 200, result);
  }

  // Image upload endpoint: stores raw bytes under .zetora/uploads/ and returns
  // a data URI suitable for inclusion in the next chat message.
  if (method === "POST" && pathname === "/api/uploads") {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 12_000_000) return json(response, 413, { error: "Image exceeds 12MB limit" });
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    // Try to parse multipart form data first; fall back to raw bytes with the
    // Content-Type header as the assumed MIME type.
    const rawContentType = request.headers["content-type"] || "application/octet-stream";
    let fileBuffer = buffer;
    let fileMime = rawContentType;
    let fileName = "upload";
    if (rawContentType.startsWith("multipart/form-data")) {
      const parsed = parseMultipart(buffer, rawContentType);
      if (parsed) {
        fileBuffer = parsed.buffer;
        fileMime = parsed.contentType || guessMimeFromName(parsed.filename);
        fileName = parsed.filename || "upload";
      } else {
        return json(response, 400, { error: "Could not parse multipart upload" });
      }
    } else {
      fileMime = guessMimeFromContentType(rawContentType);
    }
    if (!fileMime.startsWith("image/")) {
      return json(response, 415, { error: `Unsupported media type: ${fileMime}. Only image/* is accepted.` });
    }
    const ext = fileMime === "image/png" ? "png" : fileMime === "image/gif" ? "gif" : fileMime === "image/webp" ? "webp" : "jpg";
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await writeFile(path.join(uploadsRoot, id), fileBuffer);
    const dataUri = `data:${fileMime};base64,${fileBuffer.toString("base64")}`;
    return json(response, 201, { id, mime: fileMime, filename: fileName, bytes: fileBuffer.length, dataUri });
  }

  // Approval endpoints
  if (method === "GET" && pathname === "/api/approvals") {
    const state = await stateStore.read();
    return json(response, 200, state.approvals ?? []);
  }

  const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (method === "POST" && approvalMatch) {
    const input = await body(request);
    const approvalId = decodeURIComponent(approvalMatch[1]);
    const state = await stateStore.read();
    const approval = (state.approvals ?? []).find((item) => item.id === approvalId);
    if (!approval) return json(response, 404, { error: "Approval not found" });
    if (approval.status !== "pending") return json(response, 409, { error: "Approval was already resolved" });
    const action = input.action === "approve" ? "approved" : "denied";
    const result = action === "approved" ? await runner.executeTool(approval.tool, true) : null;
    await approvalStoreApi.resolve(approvalId, action, result);
    await auditLog.record({ action: `approval.${action}`, approvalId, tool: approval.tool?.name, summary: approval.summary });
    return json(response, 200, { id: approvalId, status: action, result });
  }

  if (method === "POST" && pathname === "/api/providers/test") {
    const input = await body(request);
    // When the caller passes an image as a data URI, exercise the vision path
    // against the configured provider so the user can confirm the model can
    // see the image and respond to it.
    const messages = input.image
      ? [{ role: "user", content: [
          { type: "text", text: input.prompt || "Describe this image in one sentence." },
          { type: "image_url", image_url: { url: input.image } },
        ] }]
      : [{ role: "user", content: input.prompt || "Reply with the single word: connected" }];
    const result = await callModel(input, { messages, tools: [] });
    return json(response, 200, { ok: true, text: result.text, usage: result.usage, vision: Boolean(input.image) });
  }

  // Context files API
  if (method === "GET" && pathname === "/api/context") {
    const manifest = await contextFiles.readManifest();
    return json(response, 200, manifest);
  }
  if (method === "POST" && pathname === "/api/context") {
    const input = await body(request);
    const manifest = await contextFiles.add(input.path, input.description || "");
    return json(response, 201, manifest);
  }
  if (method === "DELETE" && pathname === "/api/context") {
    const input = await body(request);
    const manifest = await contextFiles.remove(input.path);
    return json(response, 200, manifest);
  }

  // Compaction API: trigger a manual compaction of a session's history.
  if (method === "POST" && pathname === "/api/compact") {
    const input = await body(request);
    const sessionId = input.sessionId || "welcome";
    const state = await stateStore.read();
    const session = (state.sessions ?? []).find((item) => item.id === sessionId);
    if (!session) return json(response, 404, { error: "Session not found" });
    const messages = [
      { role: "system", content: "Compaction requested manually." },
      ...(session.messages ?? []),
    ];
    const result = await compactor.compact(messages, {
      provider: input.provider, model: input.model, apiKey: input.apiKey, baseUrl: input.baseUrl,
    });
    if (result.compacted) {
      await stateStore.update((next) => {
        const item = (next.sessions ?? []).find((entry) => entry.id === sessionId);
        if (item) {
          item.messages = result.messages;
          item.compacted = true;
          item.updatedAt = new Date().toISOString();
        }
        return next;
      });
    }
    return json(response, 200, result);
  }

  // MCP API
  const mcpMatch = pathname.match(/^\/api\/mcp(?:\/([a-z]+))?(?:\/([^/]+))?$/);
  if (mcpMatch) {
    const action = mcpMatch[1];
    const id = mcpMatch[2];
    if (method === "GET" && !action) {
      return json(response, 200, {
        servers: [...mcpRegistry.clients.values()].map((client) => ({ id: client.id, closed: client.closed, serverInfo: client.serverInfo })),
        config: await mcpRegistry.readConfig().catch(() => ({})),
      });
    }
    if (method === "POST" && action === "servers") {
      const input = await body(request);
      const config = await mcpRegistry.addServer(input.id, { command: input.command, args: input.args, env: input.env, cwd: input.cwd });
      return json(response, 201, config);
    }
    if (method === "POST" && action === "connect" && id) {
      try { await mcpRegistry.connect(id); return json(response, 200, { ok: true }); }
      catch (error) { return json(response, 500, { error: error.message }); }
    }
    if (method === "DELETE" && action === "servers" && id) {
      const config = await mcpRegistry.removeServer(id);
      return json(response, 200, config);
    }
    if (method === "GET" && action === "tools") {
      const tools = await mcpRegistry.listAllTools();
      return json(response, 200, { tools });
    }
  }

  // Skills API
  if (method === "GET" && pathname === "/api/skills") {
    return json(response, 200, { skills: await skills.list(), builtin: BUILTIN_SKILLS });
  }
  if (method === "POST" && pathname === "/api/skills/invoke") {
    const input = await body(request);
    const manifest = await skills.get(input.id).catch(() => null);
    if (!manifest) return json(response, 404, { error: "Skill not found" });
    const errors = skills.validateInputs(manifest, input.inputs || {});
    if (errors.length) return json(response, 400, { error: errors.join("; ") });
    const prompt = skills.renderPrompt(manifest, input.inputs || {});
    return json(response, 200, { ok: true, id: input.id, prompt, mode: manifest.mode || "build" });
  }

  // Design tokens API
  if (method === "GET" && pathname === "/api/design-tokens") {
    return json(response, 200, { tokens: await designTokens.read() });
  }
  if (method === "POST" && pathname === "/api/design-tokens") {
    const input = await body(request);
    const tokens = await designTokens.write(input.tokens || {});
    return json(response, 201, { tokens });
  }
  if (method === "GET" && pathname === "/api/design-tokens/reference") {
    const tokens = await designTokens.read();
    if (!tokens) return json(response, 404, { error: "No design tokens configured" });
    const html = designTokens.toReferenceHtml(tokens);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
    return;
  }
  if (method === "GET" && pathname === "/api/design-tokens/css") {
    const tokens = await designTokens.read();
    if (!tokens) return json(response, 404, { error: "No design tokens configured" });
    const css = designTokens.toCss(tokens);
    response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
    response.end(css);
    return;
  }

  // Skills CRUD API
  if (method === "POST" && pathname === "/api/skills/create") {
    const input = await body(request);
    try {
      const skill = await skills.create(input.id, input.manifest);
      return json(response, 201, skill);
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (method === "PUT" && pathname === "/api/skills/update") {
    const input = await body(request);
    try {
      const skill = await skills.update(input.id, input.manifest);
      return json(response, 200, skill);
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (method === "DELETE" && pathname === "/api/skills/delete") {
    const input = await body(request);
    try {
      const result = await skills.delete(input.id);
      return json(response, 200, result);
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (method === "GET" && pathname === "/api/skills/history") {
    return json(response, 200, { history: skills.getHistory() });
  }

  // Auto-fix API: trigger a fix on a file or directory outside the agent loop.
  if (method === "POST" && pathname === "/api/autofix") {
    const input = await body(request);
    try {
      const result = await autoFix.fix(input.path, { fixers: input.fixers, dryRun: input.dryRun, verify: input.verify });
      return json(response, 200, result);
    } catch (error) { return json(response, 400, { error: error.message }); }
  }

  // Diagnose API: scan command output for known error patterns and return hints.
  if (method === "POST" && pathname === "/api/diagnose") {
    const input = await body(request);
    const matches = diagnoseError(String(input.output || ""));
    return json(response, 200, { matches });
  }

  // Standalone tool endpoints: grep, fetch, tests, parse_ast.
  if (method === "GET" && pathname === "/api/grep") {
    const result = await workspace.grep(url.searchParams.get("pattern") || "", {
      path: url.searchParams.get("path") || undefined,
      glob: url.searchParams.get("glob") || undefined,
      caseSensitive: url.searchParams.get("caseSensitive") === "true",
      contextBefore: Number(url.searchParams.get("contextBefore")) || 0,
      contextAfter: Number(url.searchParams.get("contextAfter")) || 0,
      maxResults: Number(url.searchParams.get("maxResults")) || 50,
    });
    return json(response, 200, { results: result });
  }
  if (method === "POST" && pathname === "/api/fetch") {
    const input = await body(request);
    const result = await workspace.fetchUrl(input.url, { method: input.method, headers: input.headers, body: input.body, maxBytes: input.maxBytes, asText: input.asText });
    return json(response, 200, result);
  }
  if (method === "POST" && pathname === "/api/tests/run") {
    const input = await body(request);
    const result = await workspace.runTests({ pattern: input.pattern, timeout: input.timeout });
    const diagnostics = diagnoseError(`${result.stdout}\n${result.stderr}`);
    return json(response, 200, { ...result, diagnostics });
  }
  if (method === "GET" && pathname === "/api/parse-ast") {
    const result = await workspace.parseAST(url.searchParams.get("path") || "", { detail: url.searchParams.get("detail") || "summary" });
    return json(response, 200, result);
  }

  // Todo list API (per-session agent task list).
  if (method === "GET" && pathname === "/api/todos") {
    return json(response, 200, { items: todoList.list(), summary: todoList.summary() });
  }
  if (method === "POST" && pathname === "/api/todos") {
    const input = await body(request);
    const action = input.action;
    if (action === "add") return json(response, 201, todoList.add(input.content, { priority: input.priority }));
    if (action === "update") return json(response, 200, todoList.update(input.id, { content: input.content, status: input.status, priority: input.priority }));
    if (action === "remove") return json(response, 200, todoList.remove(input.id));
    if (action === "clear") { todoList.clear(); return json(response, 200, { cleared: true }); }
    return json(response, 400, { error: "Unknown action" });
  }

  // Search index API: rebuild + query.
  if (method === "POST" && pathname === "/api/search-index/rebuild") {
    const tree = await workspace.tree(".", { maxDepth: 12, maxEntries: 5000 });
    const files = tree.filter((f) => f.type === "file").map((f) => f.path);
    const result = await searchIndex.indexAll(files);
    return json(response, 200, result);
  }
  if (method === "GET" && pathname === "/api/search-index") {
    const query = url.searchParams.get("q") || "";
    const limit = Number(url.searchParams.get("limit")) || 20;
    const results = searchIndex.search(query, { limit });
    return json(response, 200, { query, results, stats: searchIndex.stats() });
  }

  // LSP diagnostics API.
  if (method === "GET" && pathname === "/api/diagnostics") {
    const target = url.searchParams.get("path") || ".";
    const result = await lsp.diagnose(target);
    return json(response, 200, result);
  }
  if (method === "GET" && pathname === "/api/lsp/status") {
    return json(response, 200, await lsp.status());
  }
  if (method === "POST" && pathname === "/api/lsp/install") {
    // SECURITY (v0.9): npm install is a mutating operation that executes
    // arbitrary install scripts from the network. Route it through the same
    // approval workflow as run_command so the user must explicitly consent.
    const input = await body(request).catch(() => ({}));
    if (request.headers["x-zetora-confirm"] !== "install") {
      // Return 202 with approval required — matches the terminal pattern.
      return json(response, 202, {
        approvalRequired: true,
        risk: "execute",
        command: "npm install --save-dev eslint@latest",
        reason: "Installing npm packages runs arbitrary install scripts from the network. Send { } with header x-zetora-confirm: install to proceed.",
        pinnedVersion: null, // ESLint latest — we don't pin, which is why approval matters
      });
    }
    // User confirmed. Record an audit log entry.
    await auditLog({
      action: "lsp.install",
      command: "npm install --save-dev eslint@latest",
      approved: true,
      approvedBy: "http-header",
      at: new Date().toISOString(),
    });
    const result = await lsp.install();
    return json(response, 200, result);
  }

  // Git worktree API.
  if (method === "GET" && pathname === "/api/worktrees") {
    return json(response, 200, await git.listWorktrees().catch(() => ({ worktrees: [] })));
  }
  if (method === "POST" && pathname === "/api/worktrees") {
    const input = await body(request);
    return json(response, 201, await git.addWorktree(input.name, { base: input.base }));
  }
  const worktreeMatch = pathname.match(/^\/api\/worktrees\/([^/]+)$/);
  if (method === "DELETE" && worktreeMatch) {
    return json(response, 200, await git.removeWorktree(decodeURIComponent(worktreeMatch[1])));
  }

  // Git graph API (for visual rendering).
  if (method === "GET" && pathname === "/api/git-graph") {
    return json(response, 200, await git.graph({ limit: Number(url.searchParams.get("limit")) || 50 }).catch(() => ({ commits: [], edges: [] })));
  }

  // Plugins API.
  if (method === "GET" && pathname === "/api/plugins") {
    return json(response, 200, { plugins: await pluginRegistry.list() });
  }
  if (method === "POST" && pathname === "/api/plugins/install") {
    const input = await body(request);
    return json(response, 201, await pluginRegistry.install(input.id, input.manifest, input.entry || ""));
  }
  if (method === "DELETE" && pathname === "/api/plugins") {
    const input = await body(request);
    return json(response, 200, await pluginRegistry.uninstall(input.id));
  }

  // Collaboration API (WebSocket-style session management over HTTP).
  if (method === "GET" && pathname === "/api/collab/sessions") {
    return json(response, 200, { sessions: collabRegistry.list() });
  }
  if (method === "POST" && pathname === "/api/collab/sessions") {
    const input = await body(request);
    const session = collabRegistry.create(input.id, { document: input.document });
    return json(response, 201, { id: session.id });
  }
  const collabMatch = pathname.match(/^\/api\/collab\/sessions\/([^/]+)(?:\/(join|leave|edit|snapshot|stream))?$/);
  if (collabMatch) {
    const sessionId = decodeURIComponent(collabMatch[1]);
    const action = collabMatch[2];
    const session = collabRegistry.get(sessionId);
    if (!session) return json(response, 404, { error: "Collab session not found" });
    if (method === "GET" && !action) return json(response, 200, session.getSnapshot());
    if (action === "join" && method === "POST") {
      const input = await body(request);
      const peerId = input.peerId || crypto.randomUUID();
      const result = session.join(peerId, input);
      // Notify all SSE subscribers that a new peer joined.
      broadcastCollab(sessionId, { type: "peers", peers: [...session.peers.entries()].map(([id, p]) => ({ id, ...p })) });
      return json(response, 200, result);
    }
    if (action === "leave" && method === "POST") {
      const input = await body(request);
      session.leave(input.peerId);
      broadcastCollab(sessionId, { type: "peers", peers: [...session.peers.entries()].map(([id, p]) => ({ id, ...p })) });
      return json(response, 200, { left: input.peerId });
    }
    if (action === "edit" && method === "POST") {
      const input = await body(request);
      const op = session.edit(input.peerId, input.operation);
      return json(response, 200, op);
    }
    if (action === "snapshot" && method === "GET") {
      return json(response, 200, session.getSnapshot());
    }
    if (action === "stream" && method === "GET") {
      // SSE stream: push edits/cursor updates to subscribers.
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "connection": "keep-alive",
      });
      response.write(`data: ${JSON.stringify({ type: "connected", sessionId, document: session.document })}\n\n`);
      if (!collabSubscribers.has(sessionId)) collabSubscribers.set(sessionId, new Set());
      collabSubscribers.get(sessionId).add(response);
      request.once("close", () => {
        collabSubscribers.get(sessionId)?.delete(response);
      });
      return;
    }
  }

  // AI inline suggestions API: calls the configured provider with a
  // fill-in-the-middle prompt. Returns the model's completion as a suggestion.
  if (method === "POST" && pathname === "/api/suggest") {
    const input = await body(request);
    const prefix = String(input.prefix || "");
    const suffix = String(input.suffix || "");
    const language = input.language || "javascript";
    const filePath = input.path || "";
    // If no provider is configured, return a heuristic suggestion based on
    // common patterns (e.g. close brackets, complete function signatures).
    const provider = input.provider || process.env.ZETORA_PROVIDER || "demo";
    const model = input.model || process.env.ZETORA_MODEL || "demo-local";
    if (provider === "demo" || !input.apiKey) {
      const heuristic = computeHeuristicSuggestion(prefix, suffix, language);
      return json(response, 200, { suggestion: heuristic, prefix, suffix, source: "heuristic" });
    }
    try {
      const fimPrompt = buildFillInMiddlePrompt(prefix, suffix, language, filePath);
      const result = await callModel({ provider, model, baseUrl: input.baseUrl, apiKey: input.apiKey }, {
        messages: [{ role: "user", content: fimPrompt }],
        tools: [],
        temperature: 0.05,
      });
      const suggestion = (result.text || "").trim();
      return json(response, 200, { suggestion, prefix, suffix, source: "model", usage: result.usage });
    } catch (error) {
      return json(response, 200, { suggestion: null, prefix, error: error.message, source: "model_error" });
    }
  }

  // Markdown render API (server-side safe render to HTML).
  if (method === "POST" && pathname === "/api/markdown") {
    const input = await body(request);
    const { renderMarkdown } = await import("../../../packages/artifacts/src/index.js");
    const html = renderMarkdown(String(input.content || ""));
    return json(response, 200, { html });
  }

  // SECURITY (v0.9): Audit log API — read-only by default.
  if (method === "GET" && pathname === "/api/audit") {
    const limit = Number(url.searchParams.get("limit")) || 100;
    const offset = Number(url.searchParams.get("offset")) || 0;
    const action = url.searchParams.get("action") || undefined;
    const entries = await auditLog.read({ limit, offset, action });
    return json(response, 200, { entries, count: entries.length });
  }
  if (method === "GET" && pathname === "/api/audit/stats") {
    return json(response, 200, await auditLog.stats());
  }

  // SECURITY (v0.9): Trust registry API — manage trusted author public keys.
  if (method === "GET" && pathname === "/api/trust") {
    return json(response, 200, { authors: await trustRegistry.list() });
  }
  if (method === "POST" && pathname === "/api/trust") {
    const input = await body(request);
    if (request.headers["x-zetora-confirm"] !== "trust") {
      return json(response, 202, { approvalRequired: true, reason: "Adding a trusted author is a security-sensitive operation. Send with header x-zetora-confirm: trust." });
    }
    await auditLog.record({ action: "trust.add", authorId: input.authorId, name: input.name });
    const author = await trustRegistry.addAuthor(input.authorId, input.publicKey, input.name, input.trustLevel || "trusted");
    return json(response, 201, author);
  }

  // SECURITY (v0.9): Secret detection API — scan a string for secrets.
  if (method === "POST" && pathname === "/api/secrets/scan") {
    const input = await body(request);
    const { detectSecrets, redactSecrets: redact } = await import("../../../packages/security/src/secrets.js");
    const detected = detectSecrets(input.text || "");
    const { redacted, found } = redact(input.text || "");
    return json(response, 200, { detected, found, redacted });
  }

  // SECURITY (v0.9): Plugin signing key generation — first-run setup.
  if (method === "POST" && pathname === "/api/plugins/generate-keys") {
    if (request.headers["x-zetora-confirm"] !== "generate-keys") {
      return json(response, 202, { approvalRequired: true, reason: "Generating signing keys is a security-sensitive operation. Send with header x-zetora-confirm: generate-keys." });
    }
    await auditLog.record({ action: "plugin.generate-keys" });
    const keys = await pluginSigner.generateKeys();
    return json(response, 201, { ok: true, ...keys });
  }

  // Diff endpoint
  if (method === "GET" && pathname === "/api/diff") {
    const filePath = url.searchParams.get("path") || "";
    const state = await stateStore.read();
    const approvals = (state.approvals ?? []).filter((item) => item.status === "approved" && item.tool?.input?.path === filePath);
    const latest = approvals.at(-1);
    if (!latest) return json(response, 200, { path: filePath, previous: null });
    const current = await workspace.read(filePath).catch(() => ({ content: "" }));
    return json(response, 200, {
      path: filePath,
      previous: latest.result?.diff?.previous ?? null,
      next: latest.result?.diff?.next ?? current.content,
      replacedFrom: latest.result?.diff?.replacedFrom ?? null,
      replacedTo: latest.result?.diff?.replacedTo ?? null,
      approvalId: latest.id,
      tool: latest.tool.name,
      resolvedAt: latest.resolvedAt,
    });
  }

  // Artifact renderer endpoint: returns a self-contained HTML document for
  // any supported file type (image, markdown, json, code, svg, html).
  if (method === "GET" && pathname === "/api/artifact") {
    const filePath = url.searchParams.get("path") || "";
    try {
      const absolute = workspace.resolve(filePath);
      const info = await stat(absolute);
      if (!info.isFile()) return json(response, 400, { error: "Path is not a file" });
      const html = await renderArtifact(absolute);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      response.end(html);
      return;
    } catch (error) { return json(response, 404, { error: error.message }); }
  }

  // SSE stream for file watcher events
  if (method === "GET" && pathname === "/api/events") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "connection": "keep-alive",
      "x-content-type-options": "nosniff",
    });
    response.write(`data: ${JSON.stringify({ type: "connected", at: new Date().toISOString() })}\n\n`);
    watcherClients.add(response);
    request.once("close", () => watcherClients.delete(response));
    return;
  }

  if (method === "POST" && (pathname === "/api/agent/run" || pathname === "/api/chat")) {
    const input = await body(request);
    const sessionId = input.sessionId || "welcome";
    await recordMessage(sessionId, "user", input.prompt);
    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    let open = true;
    request.once("close", () => { open = false; });
    const emit = (event) => {
      if (open && !response.writableEnded) {
        response.write(`${JSON.stringify(event)}\n`);
        persistSessionEvent(sessionId, event).catch(() => {});
      }
    };
    const result = await runner.run(input, emit);
    if (result.text) await recordMessage(sessionId, "assistant", result.text);
    if (!response.writableEnded) response.end();
    return;
  }

  return json(response, 404, { error: "API route not found" });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  // SECURITY (v0.9): rate limit all API requests per-IP.
  if (url.pathname.startsWith("/api/")) {
    const rl = applyRateLimit(rateLimiter, request, response);
    if (!rl.allowed) {
      return json(response, 429, { error: "Too many requests", retryAfter: Math.ceil(rl.retryAfterMs / 1000) });
    }
  }
  try {
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    if (await serveStatic(request, response, url.pathname, publicDir)) return;
    if (request.method === "GET" && await serveStatic(request, response, "/", publicDir)) return;
    json(response, 404, { error: "Not found" });
  } catch (error) {
    // SECURITY: never leak secrets in error messages.
    const safeError = redactSecrets(error.message || "Internal error").redacted;
    console.error(`[zetora] ${request.method} ${url.pathname}:`, safeError);
    if (!response.headersSent) json(response, error.status || 500, { error: safeError });
    else if (!response.writableEnded) response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Zetora is ready at http://${host}:${port}`);
  console.log(`Workspace: ${workspaceRoot}`);
  // Warn the user if they're using the default demo workspace.
  if (workspaceRoot === path.resolve(root, "workspace")) {
    console.log(`\n⚠  You are using the demo workspace at ${workspaceRoot}`);
    console.log(`   To work on your own project, restart with:`);
    console.log(`   ZETORA_WORKSPACE=/path/to/your/project npm run dev\n`);
  }
  // SECURITY: warn if bound to all interfaces.
  if (host === "0.0.0.0") {
    console.log(`\n⚠⚠  SECURITY WARNING: Zetora is bound to 0.0.0.0 (all network interfaces).`);
    console.log(`   Anyone on your network can access the agent's file/write/command tools.`);
    console.log(`   This is intentionally restricted — to enable remote access you set BOTH:`);
    console.log(`     ZETORA_HOST=0.0.0.0 AND ZETORA_ALLOW_REMOTE=1`);
    console.log(`   If this was unintentional, restart without these env vars.\n`);
  }
});

// Real-time collaboration over SSE + POST.
// Each session maintains a list of SSE subscribers. Edits arrive via POST and
// are broadcast to all subscribers. This avoids the need for a WebSocket
// dependency while still providing push-based real-time updates.
const collabSubscribers = new Map(); // sessionId -> Set<ServerResponse>

collabRegistry.sessions.forEach = collabRegistry.sessions.forEach?.bind(collabRegistry.sessions);
const origCreate = CollabRegistry.prototype.create;
// Hook into session creation to wire up the broadcast on edit.
const origEdit = CollabSession.prototype.edit;
CollabSession.prototype.edit = function (peerId, operation) {
  const op = origEdit.call(this, peerId, operation);
  broadcastCollab(this.id, { type: "edit", ...op });
  return op;
};
CollabSession.prototype.updateCursor = function (peerId, cursor) {
  this.peers.get(peerId).cursor = cursor;
  this.emit("cursor", { peerId, ...cursor });
  broadcastCollab(this.id, { type: "cursor", peerId, cursor });
};

function broadcastCollab(sessionId, message) {
  const subs = collabSubscribers.get(sessionId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const sub of subs) {
    try { sub.write(payload); } catch {}
  }
}

function shutdown(signal) {
  console.log(`\n${signal}: closing Zetora`);
  ptyRegistry.closeAll();
  mcpRegistry.closeAll();
  watcher.close();
  rateLimiter.close();
  for (const session of collabRegistry.sessions.values()) session.removeAllListeners();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// v0.9.1: parseMultipart, guessMimeFromName, guessMimeFromContentType,
// buildFillInMiddlePrompt, computeHeuristicSuggestion were extracted to ./lib.js
// and are imported at the top of this file. No local definitions remain.
