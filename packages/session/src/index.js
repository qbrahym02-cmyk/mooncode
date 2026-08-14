/**
 * v3.1.0: Session sharing, forking, and message-level revert.
 *
 * Share: generates a URL that shows a read-only snapshot of a session.
 * Fork: creates a new session branching from a specific message.
 * Revert: rolls back to the state before a specific message.
 */

import { randomUUID } from "node:crypto";

// ════════════════════════════════════════════════════════════════════════════
// Share Links
// ════════════════════════════════════════════════════════════════════════════

export async function createShareLink(sessionId, sessionData, options = {}) {
  const id = randomUUID();
  const secret = randomUUID().replace(/-/g, "").slice(0, 16);
  const url = `https://mooncode.dev/s/${id}#${secret}`;
  return {
    id, sessionId, secret, url,
    createdAt: Date.now(),
    expiresAt: options.expiresIn ? Date.now() + options.expiresIn : null,
    snapshot: {
      title: sessionData.title || "Shared session",
      messages: (sessionData.messages || []).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "[multimodal]", at: m.at })),
      events: (sessionData.events || []).slice(-50),
    },
  };
}

export function verifyShareLink(share, secret) {
  if (!share) return false;
  if (share.expiresAt && Date.now() > share.expiresAt) return false;
  return share.secret === secret;
}

// ════════════════════════════════════════════════════════════════════════════
// Session Forking
// ════════════════════════════════════════════════════════════════════════════

export function forkSession(session, messageId) {
  const forkId = randomUUID();
  let messages = session.messages || [];
  if (messageId) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0) messages = messages.slice(0, idx + 1);
  }
  return {
    id: forkId, title: `${session.title || "Session"} (fork)`, parentID: session.id,
    messages: messages.map((m) => ({ ...m, id: randomUUID() })),
    events: [], mode: session.mode || "build", model: session.model, provider: session.provider,
    usage: null, forkedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Message-level Revert
// ════════════════════════════════════════════════════════════════════════════

export async function takeSnapshot(workspace, filePaths = []) {
  const files = {};
  for (const filePath of filePaths) {
    try { const file = await workspace.read(filePath); files[filePath] = file.content; }
    catch { files[filePath] = null; }
  }
  return { id: randomUUID(), files, createdAt: Date.now() };
}

export async function revertToSnapshot(workspace, snapshot, currentFiles = {}) {
  const restored = []; const deleted = []; const diff = {};
  for (const [filePath, oldContent] of Object.entries(snapshot.files)) {
    const currentContent = currentFiles[filePath];
    if (oldContent === null) {
      if (currentContent != null) { diff[filePath] = { before: null, after: currentContent }; deleted.push(filePath); }
    } else {
      try { await workspace.write(filePath, oldContent); diff[filePath] = { before: oldContent, after: currentContent }; restored.push(filePath); }
      catch (e) { console.error(`[revert] ${filePath}:`, e.message); }
    }
  }
  return { restored, deleted, diff };
}

export async function unrevertFromDiff(workspace, diff) {
  const restored = [];
  for (const [filePath, change] of Object.entries(diff)) {
    if (change.after == null) continue;
    try { await workspace.write(filePath, change.after); restored.push(filePath); }
    catch (e) { console.error(`[unrevert] ${filePath}:`, e.message); }
  }
  return { restored };
}

// ════════════════════════════════════════════════════════════════════════════
// Session Summary
// ════════════════════════════════════════════════════════════════════════════

export function generateSessionSummary(session) {
  const messages = session.messages || [];
  const events = session.events || [];
  const fileWrites = events.filter((e) => e.type === "tool.finished" && e.name === "write_file");
  const fileReplaces = events.filter((e) => e.type === "tool.finished" && e.name === "replace_text");
  const commands = events.filter((e) => e.type === "tool.finished" && e.name === "run_command");
  const filesChanged = new Set();
  for (const e of [...fileWrites, ...fileReplaces]) { if (e.input?.path) filesChanged.add(e.input.path); }
  let additions = 0; let deletions = 0;
  for (const e of events) {
    if (e.type === "tool.finished" && e.result?.diff) {
      additions += (e.result.diff.next || "").split("\n").length;
      deletions += (e.result.diff.previous || "").split("\n").length;
    }
  }
  const usage = session.usage || {};
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  return {
    filesChanged: filesChanged.size, filePaths: [...filesChanged],
    additions, deletions, commandsRun: commands.length, messagesCount: messages.length,
    tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
    cost: usage.costUsd ? `$${usage.costUsd.toFixed(4)}` : null,
  };
}
