import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// Single SQLite connection, reused across requests. The control plane runs
// on 127.0.0.1 only, so a single-writer sqlite is a fine fit.

function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? "./data/control-plane.db";
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_lifecycle_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('start','stop')),
      result TEXT NOT NULL CHECK (result IN ('noop','ok','error')),
      message TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_agent_at
      ON agent_lifecycle_events (agent_id, at DESC);
    CREATE TABLE IF NOT EXISTS agent_processes (
      agent_id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      log_path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

declare global {
  // eslint-disable-next-line no-var
  var __controlPlaneDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __controlPlaneRawDb: Database.Database | undefined;
}

export function getDb() {
  if (!globalThis.__controlPlaneDb) {
    const dbPath = resolveDbPath();
    ensureDirFor(dbPath);
    const raw = new Database(dbPath);
    raw.pragma("journal_mode = WAL");
    ensureSchema(raw);
    globalThis.__controlPlaneRawDb = raw;
    globalThis.__controlPlaneDb = drizzle(raw, { schema });
  }
  return globalThis.__controlPlaneDb!;
}

export { schema };
