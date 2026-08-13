import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const TRIGRAM_SIZE = 3;
const MAX_FILE_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".txt", ".css", ".html", ".yml", ".yaml", ".py", ".go", ".rs", ".java", ".sh", ".sql"]);

/**
 * In-memory trigram search index. Builds a map of 3-character substrings to
 * the set of files that contain them. Search returns ranked results where
 * files with more matching trigrams rank higher. No external dependency.
 *
 * The index is rebuilt on demand or incrementally updated via the file
 * watcher. It is intentionally simple — production use would swap in SQLite
 * FTS5 or similar, but this gives instant symbol search without setup.
 */
export class SearchIndex {
  constructor(root) {
    this.root = path.resolve(root);
    /** trigram -> Set<filePath> */
    this.trigrams = new Map();
    /** filePath -> { size, mtime, symbols, trigramCount } */
    this.files = new Map();
    /** symbol name -> Set<filePath> (for fast identifier lookup) */
    this.symbols = new Map();
  }

  async indexFile(relativePath) {
    const absolute = path.resolve(this.root, relativePath);
    try {
      const info = await stat(absolute);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
      const ext = path.extname(absolute).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) return null;
      const content = await readFile(absolute, "utf8");
      this.#add(relativePath, content, info.size, info.mtimeMs, ext);
      return { path: relativePath, size: info.size, trigrams: this.files.get(relativePath)?.trigramCount || 0 };
    } catch (error) {
      // v0.9.1: ENOENT is expected (file deleted between walk and index), but
      // other errors (permissions, encoding) should be visible in logs.
      if (error?.code !== "ENOENT") {
        console.warn(`[mooncode] search-index failed to index ${relativePath}: ${error.message}`);
      }
      return null;
    }
  }

  async indexAll(fileList) {
    this.clear();
    const files = fileList || await this.#walk();
    let indexed = 0;
    for (const file of files) {
      const result = await this.indexFile(file);
      if (result) indexed += 1;
    }
    return { indexed, total: files.length };
  }

  #add(filePath, content, size, mtime, ext) {
    // Remove old trigrams for this file before re-adding.
    this.#remove(filePath);
    const lower = content.toLowerCase();
    const seen = new Set();
    for (let i = 0; i <= lower.length - TRIGRAM_SIZE; i += 1) {
      const tri = lower.slice(i, i + TRIGRAM_SIZE);
      seen.add(tri);
    }
    for (const tri of seen) {
      if (!this.trigrams.has(tri)) this.trigrams.set(tri, new Set());
      this.trigrams.get(tri).add(filePath);
    }
    // Extract symbols (identifiers) for fast lookup.
    const symbols = new Set();
    const identifierRegex = ext === ".py" ? /\b[a-z_][a-z0-9_]{2,}\b/gi : /\b[a-zA-Z_$][a-zA-Z0-9_$]{2,}\b/g;
    const matches = lower.match(identifierRegex) || [];
    for (const match of new Set(matches)) {
      if (match.length < 3 || KEYWORDS.has(match)) continue;
      symbols.add(match);
      if (!this.symbols.has(match)) this.symbols.set(match, new Set());
      this.symbols.get(match).add(filePath);
    }
    this.files.set(filePath, { size, mtime, symbols: symbols.size, trigramCount: seen.size });
  }

  #remove(filePath) {
    const existing = this.files.get(filePath);
    if (!existing) return;
    // Remove from trigram index (lazy: only when we rebuild).
    for (const [tri, set] of this.trigrams) {
      set.delete(filePath);
      if (set.size === 0) this.trigrams.delete(tri);
    }
    for (const [sym, set] of this.symbols) {
      set.delete(filePath);
      if (set.size === 0) this.symbols.delete(sym);
    }
    this.files.delete(filePath);
  }

  async #walk() {
    const { readdir } = await import("node:fs/promises");
    const SKIP = new Set([".git", "node_modules", "dist", "build", ".mooncode"]);
    const out = [];
    const walk = async (dir) => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (SKIP.has(entry.name)) continue;
        const abs = path.join(dir, entry.name);
        const rel = path.relative(this.root, abs).replaceAll(path.sep, "/");
        if (entry.isDirectory()) await walk(abs);
        else out.push(rel);
      }
    };
    await walk(this.root);
    return out;
  }

  /**
   * Search the index. Returns ranked results: files matching more query
   * trigrams rank higher. Exact symbol matches get a boost.
   */
  search(query, options = {}) {
    const limit = Math.min(Number(options.limit ?? 20), 100);
    const q = String(query || "").toLowerCase().trim();
    if (q.length < TRIGRAM_SIZE) {
      // For short queries, fall back to symbol lookup.
      const symbolFiles = this.symbols.get(q);
      if (symbolFiles) return [...symbolFiles].slice(0, limit).map((p) => ({ path: p, score: 100, reason: "exact_symbol" }));
      return [];
    }
    const queryTrigrams = new Set();
    for (let i = 0; i <= q.length - TRIGRAM_SIZE; i += 1) {
      queryTrigrams.add(q.slice(i, i + TRIGRAM_SIZE));
    }
    const scores = new Map();
    for (const tri of queryTrigrams) {
      const files = this.trigrams.get(tri);
      if (!files) continue;
      for (const file of files) {
        scores.set(file, (scores.get(file) || 0) + 1);
      }
    }
    // Boost: if the query matches a symbol name exactly, boost those files.
    const symbolFiles = this.symbols.get(q.replace(/[^a-z0-9_$]/gi, ""));
    if (symbolFiles) {
      for (const file of symbolFiles) {
        scores.set(file, (scores.get(file) || 0) + 10);
      }
    }
    const ranked = [...scores.entries()]
      .map(([path, score]) => ({ path, score, normalized: score / queryTrigrams.size }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return ranked;
  }

  stats() {
    return {
      files: this.files.size,
      trigrams: this.trigrams.size,
      symbols: this.symbols.size,
      memoryEstimate: this.files.size * 200 + this.trigrams.size * 40,
    };
  }

  clear() {
    this.trigrams.clear();
    this.files.clear();
    this.symbols.clear();
  }
}

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
  "class", "extends", "super", "this", "new", "try", "catch", "finally", "throw",
  "import", "export", "from", "default", "async", "await", "yield", "typeof",
  "instanceof", "in", "of", "delete", "void", "null", "undefined", "true", "false",
  "def", "elif", "lambda", "pass", "with", "as", "not", "and", "or", "is", "None",
  "public", "private", "protected", "static", "readonly", "interface", "type",
  "enum", "namespace", "module", "declare", "abstract", "get", "set", "switch",
  "case", "break", "continue", "goto", "struct", "union", "impl", "trait", "fn",
  "let", "mut", "ref", "move", "where", "self", "crate", "use", "pub", "mod",
]);
