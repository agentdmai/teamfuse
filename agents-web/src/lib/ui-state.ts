import "server-only";
import { getDb } from "@/db/client";

// Tiny typed wrapper around the `ui_state` KV table. Currently holds the
// user-controlled reset baselines for the usage panel (five_hour_reset_at,
// weekly_reset_at). Values are stringified epoch-ms so the storage format
// stays JSON-serialisable and inspectable.

export type UiStateKey =
  | "five_hour_reset_at"
  | "weekly_reset_at";

function rawDb() {
  // Drizzle is initialised as a side effect of getDb(); the raw handle lives
  // on globalThis so we can use simple prepared statements for KV.
  void getDb();
  return globalThis.__controlPlaneRawDb!;
}

export function getUiEpoch(key: UiStateKey): number | null {
  const row = rawDb()
    .prepare("SELECT value FROM ui_state WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) ? n : null;
}

export function setUiEpoch(key: UiStateKey, epochMs: number): void {
  rawDb()
    .prepare(
      "INSERT OR REPLACE INTO ui_state (key, value, updated_at) VALUES (?, ?, ?)",
    )
    .run(key, String(Math.floor(epochMs)), Date.now());
}

export function clearUiKey(key: UiStateKey): void {
  rawDb().prepare("DELETE FROM ui_state WHERE key = ?").run(key);
}
