/**
 * Shared helpers for the Zetora HTTP server.
 *
 * v0.9.1 refactor: extracted from server.js to reduce its size and improve
 * readability. These helpers are pure (or close to pure) functions that
 * don't depend on the server's runtime state, making them easy to test
 * in isolation.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * MIME type map for static file serving.
 */
export const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Send a JSON response with standard headers.
 */
export function json(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    ...headers,
  });
  response.end(body);
}

/**
 * Read and parse a JSON request body, enforcing a max size.
 * Returns {} for empty bodies. Throws 413 if too large, 400 if invalid JSON.
 */
export async function body(request, maxBytes = 5_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Body must be valid JSON"), { status: 400 }); }
}

/**
 * Resolve a pathname to a file inside the public directory, or null if it
 * escapes. Used by serveStatic.
 */
export function publicPath(pathname, publicDir) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(publicDir, requested);
  if (target !== publicDir && !target.startsWith(`${publicDir}${path.sep}`)) return null;
  return target;
}

/**
 * Serve a static file from the public directory with appropriate MIME type,
 * cache headers, and a Content-Security-Policy header.
 * Returns true if a file was served, false if not found.
 */
export async function serveStatic(request, response, pathname, publicDir) {
  let target = publicPath(pathname, publicDir);
  if (!target) return false;
  try {
    let info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
    info = await stat(target);
    const extension = path.extname(target).toLowerCase();
    const content = await readFile(target);
    response.writeHead(200, {
      "content-type": mime[extension] || "application/octet-stream",
      "content-length": content.length,
      "cache-control": extension === ".html" ? "no-store" : "public, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'",
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return false;
  }
}

/**
 * Persist an agent event to the session's event log in the state store.
 * Used by the /api/chat and /api/agent/run endpoints.
 */
export async function persistSessionEvent(sessionId, event, stateStore) {
  await stateStore.update((state) => {
    let session = (state.sessions ?? []).find((item) => item.id === sessionId);
    if (!session) {
      session = {
        id: sessionId,
        title: `Session ${sessionId.slice(0, 6)}`,
        updatedAt: new Date().toISOString(),
        mode: "build",
        messages: [],
        events: [],
        usage: null,
      };
      state.sessions.unshift(session);
    }
    session.events = [...(session.events ?? []), event].slice(-500);
    session.updatedAt = new Date().toISOString();
    if (event.type === "usage" && event.cost) session.usage = event.cost;
    return state;
  });
}

/**
 * Record a user or assistant message in the session's message log.
 * Also updates the session title from the first user message.
 */
export async function recordMessage(sessionId, role, content, stateStore) {
  await stateStore.update((state) => {
    let session = (state.sessions ?? []).find((item) => item.id === sessionId);
    if (!session) {
      session = {
        id: sessionId,
        title: role === "user" ? String(content).slice(0, 56) : `Session ${sessionId.slice(0, 6)}`,
        updatedAt: new Date().toISOString(),
        mode: "build",
        messages: [],
        events: [],
        usage: null,
      };
      state.sessions.unshift(session);
    }
    session.messages = [...(session.messages ?? []), { role, content, at: new Date().toISOString() }].slice(-100);
    session.updatedAt = new Date().toISOString();
    if (role === "user" && (!session.title || session.title === "البدء مع Zetora")) {
      const preview = typeof content === "string"
        ? content
        : (Array.isArray(content) ? content.find((p) => p.type === "text")?.text ?? "Image session" : "Session");
      session.title = String(preview).slice(0, 56) || session.title;
    }
    return state;
  });
}

/**
 * Minimal multipart/form-data parser sufficient for image uploads.
 * Extracts the first file part and returns its filename, content-type,
 * and buffer. Returns null when the body cannot be parsed.
 */
export function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=("?)([^";\s]+)\1/);
  if (!boundaryMatch) return null;
  const boundary = Buffer.from(`--${boundaryMatch[2]}`);
  const parts = [];
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(boundary, start);
    if (idx < 0) break;
    if (start > 0) parts.push(buffer.slice(start, idx - 2)); // -2 for trailing CRLF
    start = idx + boundary.length + 2; // skip boundary + CRLF
  }
  for (const part of parts) {
    if (part.length === 0) continue;
    // Skip the closing boundary marker.
    if (part[0] === 0x2d && part[1] === 0x2d) continue; // starts with "--"
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd).toString("utf8");
    const body = part.slice(headerEnd + 4);
    const trimmed = body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a
      ? body.slice(0, -2)
      : body;
    const dispositionMatch = headerText.match(/Content-Disposition:\s*form-data;[^\r\n]*filename="([^"]+)"/i);
    const typeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
    if (dispositionMatch) {
      return {
        filename: dispositionMatch[1],
        contentType: typeMatch ? typeMatch[1].trim() : guessMimeFromName(dispositionMatch[1]),
        buffer: trimmed,
      };
    }
  }
  return null;
}

/**
 * Guess a MIME type from a filename extension.
 */
export function guessMimeFromName(name) {
  const ext = path.extname(name).toLowerCase();
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Extract the MIME type (without parameters) from a Content-Type header.
 */
export function guessMimeFromContentType(contentType) {
  return String(contentType).split(";")[0].trim();
}

/**
 * Build a fill-in-the-middle prompt for inline code completion.
 * The model is asked to output only the code that should appear between
 * prefix and suffix — no markdown, no explanation, no code fences.
 */
export function buildFillInMiddlePrompt(prefix, suffix, language, filePath) {
  return `You are a code completion engine. Complete the code between the prefix and suffix.
Output ONLY the code that should be inserted between them. No markdown, no explanation, no code fences.

File: ${filePath || "untitled"}
Language: ${language}

=== PREFIX (before cursor) ===
${prefix}

=== SUFFIX (after cursor) ===
${suffix}

=== INSERT (output only this, no preamble) ===`;
}

/**
 * Heuristic suggestion for the demo provider. Closes common patterns:
 * unclosed brackets, incomplete function signatures, console.log snippets.
 */
export function computeHeuristicSuggestion(prefix, suffix, language) {
  const last = prefix.slice(-50);
  // Close unclosed brackets.
  const opens = (last.match(/[(\[{]/g) || []).length;
  const closes = (last.match(/[)\]}]/g) || []).length;
  if (opens > closes) {
    const stack = [];
    for (const ch of last) {
      if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
      else if (ch === ")" && stack[stack.length - 1] === "(") stack.pop();
      else if (ch === "]" && stack[stack.length - 1] === "[") stack.pop();
      else if (ch === "}" && stack[stack.length - 1] === "{") stack.pop();
    }
    const closeMap = { "(": ")", "[": "]", "{": "}" };
    return stack.reverse().map((ch) => closeMap[ch]).join("");
  }
  // Suggest function body opener.
  if (/\bfunction\s+\w+\s*\([^)]*\)\s*\{?\s*$/.test(last) && !last.endsWith("{")) {
    return "{\n  \n}";
  }
  // Suggest console.log for debugging.
  if (/\bconsole\b\.?$/.test(last)) return ".log()";
  if (/\breturn\s*$/.test(last)) return " ";
  return "";
}
