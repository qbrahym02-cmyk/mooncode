import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const TOKENS_PATH = "design-tokens.json";
const MAX_TOKENS_BYTES = 64_000;

/**
 * Design-system tokens. A single JSON file at the workspace root defines
 * colors, typography, spacing, radii, and shadows. The agent can read it for
 * context when generating artifacts, and the renderer wraps it as a styled
 * reference sheet for the inspector.
 *
 * The schema is intentionally Moon Code-specific. It does not import or copy
 * any token system from the reference projects.
 */
export class DesignTokens {
  constructor(workspaceRoot) {
    this.root = path.resolve(workspaceRoot);
    this.path = path.join(this.root, TOKENS_PATH);
  }

  async read() {
    try {
      const text = await readFile(this.path, "utf8");
      return JSON.parse(text);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async write(tokens) {
    const payload = JSON.stringify(tokens, null, 2);
    if (Buffer.byteLength(payload) > MAX_TOKENS_BYTES) throw new Error(`Tokens exceed ${MAX_TOKENS_BYTES} bytes`);
    await mkdir(this.root, { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, payload);
    const { rename } = await import("node:fs/promises");
    await rename(tmp, this.path);
    return tokens;
  }

  /**
   * Render the tokens as a CSS `:root { --name: value }` string suitable for
   * injection into generated artifacts or the inspector iframe.
   */
  toCss(tokens) {
    const t = tokens || {};
    const lines = [];
    for (const [key, value] of Object.entries(t.colors || {})) {
      lines.push(`  --color-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(t.typography || {})) {
      if (typeof value === "string") lines.push(`  --font-${key}: ${value};`);
      else if (value && typeof value === "object") {
        for (const [prop, val] of Object.entries(value)) {
          lines.push(`  --font-${key}-${prop}: ${val};`);
        }
      }
    }
    for (const [key, value] of Object.entries(t.spacing || {})) {
      lines.push(`  --space-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(t.radii || {})) {
      lines.push(`  --radius-${key}: ${value};`);
    }
    for (const [key, value] of Object.entries(t.shadows || {})) {
      lines.push(`  --shadow-${key}: ${value};`);
    }
    return `:root {\n${lines.join("\n")}\n}`;
  }

  /**
   * Build a self-contained HTML reference sheet that visualizes every token.
   * Useful as an artifact in the inspector: the agent can refer to it when
   * discussing the design system with the user.
   */
  toReferenceHtml(tokens) {
    const t = tokens || {};
    const css = this.toCss(tokens);
    const swatches = Object.entries(t.colors || {}).map(([key, value]) => `
      <div class="swatch">
        <div class="swatch-color" style="background:${value}"></div>
        <div class="swatch-meta">
          <strong>${escapeHtml(key)}</strong>
          <code>${escapeHtml(String(value))}</code>
        </div>
      </div>`).join("");
    const fonts = Object.entries(t.typography || {}).map(([key, value]) => {
      const sample = typeof value === "string" ? value : (value?.family || "system-ui");
      const size = typeof value === "object" ? (value?.size || "14px") : "14px";
      const weight = typeof value === "object" ? (value?.weight || 400) : 400;
      return `<div class="font-row" style="font-family:${sample};font-size:${size};font-weight:${weight}">
        <strong>${escapeHtml(key)}</strong>
        <span>${escapeHtml(sample)} · ${size} · ${weight}</span>
      </div>`;
    }).join("");
    const spaces = Object.entries(t.spacing || {}).map(([key, value]) => `
      <div class="space-row">
        <div class="space-bar" style="width:${value};height:${value}"></div>
        <strong>${escapeHtml(key)}</strong>
        <code>${escapeHtml(String(value))}</code>
      </div>`).join("");
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design tokens</title>
<style>
${css}
html{background:#0b0c10;color:#f5f3ff;font-family:Inter,"Segoe UI",Arial,sans-serif;margin:0}
body{margin:0;padding:24px;display:grid;gap:22px;max-width:880px}
h2{font-size:14px;margin:0 0 12px;color:#8b7cff;font-family:ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.swatch{display:flex;align-items:center;gap:10px;background:#12141a;border:1px solid #1a1d23;border-radius:8px;padding:8px}
.swatch-color{width:36px;height:36px;border-radius:6px;flex:none;border:1px solid rgba(255,255,255,.1)}
.swatch-meta{display:grid;gap:2px;min-width:0}
.swatch-meta strong{font-size:11px;color:#f5f3ff}
.swatch-meta code{font:10px ui-monospace,monospace;color:#8e909a}
.fonts{display:grid;gap:8px;background:#12141a;border:1px solid #1a1d23;border-radius:8px;padding:14px}
.font-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-bottom:1px dashed #1a1d23;padding-bottom:6px}
.font-row:last-child{border-bottom:0}
.font-row strong{font-size:13px}
.font-row span{font:10px ui-monospace,monospace;color:#8e909a}
.spaces{display:grid;gap:6px;background:#12141a;border:1px solid #1a1d23;border-radius:8px;padding:14px}
.space-row{display:flex;align-items:center;gap:10px}
.space-bar{background:#8b7cff;border-radius:2px;min-width:2px;min-height:2px}
.space-row strong{font-size:11px;width:80px}
.space-row code{font:10px ui-monospace,monospace;color:#8e909a}
</style>
<h1 style="font-size:18px;margin:0">Design tokens</h1>
${(t.colors && Object.keys(t.colors).length) ? `<section><h2>Colors</h2><div class="swatches">${swatches}</div></section>` : ""}
${(t.typography && Object.keys(t.typography).length) ? `<section><h2>Typography</h2><div class="fonts">${fonts}</div></section>` : ""}
${(t.spacing && Object.keys(t.spacing).length) ? `<section><h2>Spacing</h2><div class="spaces">${spaces}</div></section>` : ""}
</div>`;
  }

  /**
   * Returns a compact plain-text summary of the tokens suitable for prepending
   * to the system prompt in design mode.
   */
  toPromptSummary(tokens) {
    const t = tokens || {};
    const parts = [];
    if (t.colors) parts.push(`Colors: ${Object.entries(t.colors).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (t.typography) parts.push(`Typography: ${Object.entries(t.typography).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")}`);
    if (t.spacing) parts.push(`Spacing: ${Object.entries(t.spacing).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (t.radii) parts.push(`Radii: ${Object.entries(t.radii).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    if (t.shadows) parts.push(`Shadows: ${Object.entries(t.shadows).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    return parts.length ? parts.join("\n") : null;
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
