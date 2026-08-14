export * from "./json-store.js";

// v4.1: Re-export SqliteStore (graceful — if node:sqlite unavailable, it throws on instantiation).
export async function createStorage(dataDir, options = {}) {
  if (options.preferSqlite) {
    try {
      const { SqliteStore, isSqliteAvailable } = await import("./sqlite.js");
      if (isSqliteAvailable()) {
        const dbPath = options.sqlitePath || `${dataDir}/mooncode.db`;
        return new SqliteStore(dbPath);
      }
    } catch {}
  }
  // Fallback to JsonStore
  const { JsonStore } = await import("./json-store.js");
  return new JsonStore(options.jsonPath || `${dataDir}/state.json`, options.defaultValue || {});
}
