import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Registry of artifact renderers. Each renderer takes raw file content (Bytes
 * or text) and returns an HTML document suitable for display inside the
 * inspector iframe. HTML files pass through unchanged; everything else gets
 * wrapped in a styled viewer.
 */

const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const RENDERERS = [
  { id: "html", extensions: [".html", ".htm"], kind: "passthrough" },
  { id: "svg", extensions: [".svg"], kind: "image" },
  { id: "image", extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"], kind: "image" },
  { id: "markdown", extensions: [".md", ".markdown"], kind: "markdown" },
  { id: "json", extensions: [".json", ".jsonc"], kind: "code" },
  { id: "text", extensions: [".txt", ".log"], kind: "code" },
  { id: "code", extensions: [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".scss", ".py", ".go", ".rs", ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".sh", ".sql", ".yml", ".yaml", ".toml", ".xml", ".env"], kind: "code" },
];

export function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const renderer = RENDERERS.find((item) => item.extensions.includes(ext));
  return renderer ? { id: renderer.id, kind: renderer.kind, ext } : { id: "binary", kind: "binary", ext };
}

export function supportedExtensions() {
  return [...new Set(RENDERERS.flatMap((item) => item.extensions))];
}

/**
 * Build a self-contained HTML document that renders the given file. The
 * returned string is meant to be assigned to `iframe.srcdoc` with the sandbox
 * `allow-scripts` flag. No network access is required.
 */
export async function renderArtifact(filePath, options = {}) {
  const { id, kind } = detectKind(filePath);
  if (kind === "binary") {
    return binaryShell(filePath);
  }
  const buffer = await readFile(filePath);
  const isText = kind !== "image";

  if (kind === "passthrough") {
    return buffer.toString("utf8");
  }

  if (kind === "image") {
    const mime = path.extname(filePath).toLowerCase() === ".svg" ? "image/svg+xml" : `image/${path.extname(filePath).slice(1).toLowerCase()}`;
    const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
    return imageShell(filePath, dataUri, mime);
  }

  const text = buffer.toString("utf8");
  if (kind === "markdown") {
    return markdownShell(filePath, renderMarkdown(text));
  }
  if (id === "json") {
    return codeShell(filePath, prettyJson(text), "json");
  }
  return codeShell(filePath, escapeHtml(text), id);
}

function prettyJson(text) {
  try { return escapeHtml(JSON.stringify(JSON.parse(text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), null, 2)); }
  catch {
    // v0.9.1: JSON is invalid — fall back to escaped raw text. This is expected
    // for partial/truncated JSON files and is not an error worth logging.
    return escapeHtml(text);
  }
}

/**
 * Minimal, safe Markdown renderer that produces a styled HTML document.
 * Supports: headings, fenced code blocks, lists, paragraphs, inline code,
 * bold, https links. All non-code text is escaped before being placed in HTML.
 */
export function renderMarkdown(input) {
  const text = String(input ?? "");
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const blocks = [];
  let i = 0;
  const lines = text.split(/\r?\n/);
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(`<pre class="md-pre"${lang ? ` data-lang="${escape(lang)}"` : ''}><code>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push(`<h${level} class="md-h">${escape(line.slice(level + 1))}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li>${inlineMd(escape(lines[i].replace(/^[-*]\s+/, '')))}</li>`); i += 1; }
      blocks.push(`<ul class="md-ul">${items.join('')}</ul>`);
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^[-*]\s+/.test(lines[i])) {
      paragraph.push(lines[i]); i += 1;
    }
    blocks.push(`<p class="md-p">${inlineMd(escape(paragraph.join('\n')))}</p>`);
  }
  return blocks.join('');
}

function inlineMd(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

const SHELL_STYLE = `<style>
  html{margin:0;padding:0;background:#0b0c10;color:#c7c9cf;font-family:"Inter","Segoe UI","Noto Sans Arabic",Arial,sans-serif}
  body{margin:0;padding:18px;line-height:1.65;direction:ltr;text-align:left}
  pre.code{background:#0c0e11;border:1px solid #1a1d23;border-radius:8px;padding:14px;overflow:auto;font:12px/1.55 ui-monospace,"JetBrains Mono",monospace;white-space:pre-wrap;word-break:break-word;color:#9ea2ad}
  pre.code code{background:none;border:0;padding:0;color:inherit;font:inherit}
  .image-wrap{display:flex;align-items:center;justify-content:center;min-height:60vh;background:repeating-conic-gradient(#1a1c22 0 25%,#13151a 0 50%) 50% / 24px 24px;border-radius:8px;padding:18px}
  .image-wrap img{max-width:100%;max-height:80vh;border-radius:4px;box-shadow:0 12px 36px rgba(0,0,0,.5)}
  .md-h{font-size:18px;margin:18px 0 8px;color:#f5f3ff}
  .md-p{margin:0 0 12px;color:#c7c9cf}
  .md-ul{margin:0 0 12px;padding-left:22px;color:#c7c9cf}
  .md-ul li{margin:0 0 6px;list-style:disc}
  .md-pre{background:#0c0e11;border:1px solid #1a1d23;border-radius:8px;padding:12px;overflow:auto;font:12px/1.55 ui-monospace,monospace;color:#9ea2ad}
  .md-pre code{background:none;border:0;padding:0;color:inherit;font:inherit}
  .md-code{font:12px ui-monospace,monospace;background:#181a20;border:1px solid #1a1d23;border-radius:4px;padding:2px 5px;color:#b8adff}
  a{color:#b8adff;text-decoration:none;border-bottom:1px solid rgba(184,173,255,.3)}
  .binary{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;color:#747781;text-align:center;gap:12px}
  .binary svg{width:48px;height:48px;color:#5445c1}
</style>`;

function codeShell(filePath, content, lang) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(path.basename(filePath))}</title>${SHELL_STYLE}
<pre class="code"><code>${content}</code></pre>`;
}

function markdownShell(filePath, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(path.basename(filePath))}</title>${SHELL_STYLE}
<main>${body}</main>`;
}

function imageShell(filePath, dataUri, mime) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(path.basename(filePath))}</title>${SHELL_STYLE}
<div class="image-wrap"><img src="${dataUri}" alt="${escapeHtml(path.basename(filePath))}"></div>`;
}

function binaryShell(filePath) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(path.basename(filePath))}</title>${SHELL_STYLE}
<div class="binary">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/></svg>
<h3>Binary preview unavailable</h3>
<p>${escapeHtml(path.basename(filePath))} cannot be rendered inline.</p>
</div>`;
}
