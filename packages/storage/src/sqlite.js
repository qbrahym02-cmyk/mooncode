/**
 * v3.1.0: SQLite storage layer (node:sqlite — built into Node 22+).
 *
 * Replaces JsonStore for production use. Provides:
 * - Atomic transactions
 * - Indexed queries
 * - Schema migrations
 * - Event sequence numbers
 *
 * Falls back to JsonStore if node:sqlite is not available (Node < 22).
 */

let Database = null;
try {
  Database = (await import("node:sqlite")).DatabaseSync;
} catch {
  // node:sqlite not available — will use fallback
}

const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // v1: initial schema
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    mode TEXT DEFAULT 'build',
    directory TEXT,
    parent_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    archived INTEGER DEFAULT 0,
    metadata TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    type TEXT NOT NULL,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    tool TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    secret TEXT,
    snapshot TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS permissions (
    permission TEXT,
    pattern TEXT,
    action TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (permission, pattern)
  );`,
  `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);`,
  `INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});`,
];

export class SqliteStore {
  constructor(dbPath) {
    if (!Database) {
      throw new Error("node:sqlite not available. Use Node.js 22+ or JsonStore fallback.");
    }
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.#migrate();
  }

  #migrate() {
    const row = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get();
    const current = row?.version || 0;
    for (let i = current; i < MIGRATIONS.length; i++) {
      this.db.exec(MIGRATIONS[i]);
    }
  }

  // ─── Sessions ───
  createSession(id, title, mode = "build", directory = null, parentId = null) {
    this.db.prepare("INSERT INTO sessions (id, title, mode, directory, parent_id) VALUES (?, ?, ?, ?, ?)")
      .run(id, title, mode, directory, parentId);
    return this.getSession(id);
  }

  getSession(id) {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!row) return null;
    return this.#rowToSession(row);
  }

  listSessions(limit = 50, offset = 0) {
    const rows = this.db.prepare("SELECT * FROM sessions WHERE archived = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?").all(limit, offset);
    return rows.map((r) => this.#rowToSession(r));
  }

  updateSession(id, updates) {
    const sets = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      sets.push(`${col} = ?`);
      values.push(value);
    }
    sets.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  deleteSession(id) {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  forkSession(parentId, newId, fromMessageId = null) {
    const parent = this.getSession(parentId);
    if (!parent) throw new Error("Parent session not found");
    const fork = this.createSession(newId, `${parent.title} (fork)`, parent.mode, parent.directory, parentId);
    // Copy messages up to fromMessageId
    let messages = this.getMessages(parentId);
    if (fromMessageId) {
      const idx = messages.findIndex((m) => m.id === fromMessageId);
      if (idx >= 0) messages = messages.slice(0, idx + 1);
    }
    for (const msg of messages) {
      this.addMessage(crypto.randomUUID(), newId, msg.role, msg.content);
    }
    return fork;
  }

  // ─── Messages ───
  addMessage(id, sessionId, role, content) {
    this.db.prepare("INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)").run(id, sessionId, role, typeof content === "string" ? content : JSON.stringify(content));
  }

  getMessages(sessionId, limit = 100) {
    const rows = this.db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?").all(sessionId, limit);
    return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, at: r.created_at }));
  }

  // ─── Events ───
  addEvent(sessionId, type, data) {
    this.db.prepare("INSERT INTO events (session_id, type, data) VALUES (?, ?, ?)").run(sessionId, type, JSON.stringify(data || {}));
  }

  getEvents(sessionId, limit = 500) {
    const rows = this.db.prepare("SELECT * FROM events WHERE session_id = ? ORDER BY id ASC LIMIT ?").all(sessionId, limit);
    return rows.map((r) => ({ type: r.type, data: JSON.parse(r.data || "{}"), at: r.created_at }));
  }

  // ─── Shares ───
  createShare(id, sessionId, secret, snapshot, expiresAt = null) {
    this.db.prepare("INSERT INTO shares (id, session_id, secret, snapshot, expires_at) VALUES (?, ?, ?, ?, ?)").run(id, sessionId, secret, JSON.stringify(snapshot), expiresAt);
  }

  getShare(id) {
    const row = this.db.prepare("SELECT * FROM shares WHERE id = ?").get(id);
    if (!row) return null;
    return { ...row, snapshot: JSON.parse(row.snapshot || "{}") };
  }

  // ─── Permissions ───
  addPermissionRule(permission, pattern, action) {
    this.db.prepare("INSERT OR REPLACE INTO permissions (permission, pattern, action) VALUES (?, ?, ?)").run(permission, pattern, action);
  }

  getPermissionRules() {
    return this.db.prepare("SELECT * FROM permissions").all();
  }

  close() { this.db.close(); }

  #rowToSession(row) {
    return { id: row.id, title: row.title, mode: row.mode, directory: row.directory, parentID: row.parent_id, createdAt: row.created_at, updatedAt: row.updated_at, archived: Boolean(row.archived), metadata: row.metadata ? JSON.parse(row.metadata) : {} };
  }
}

export function isSqliteAvailable() { return Database !== null; }
