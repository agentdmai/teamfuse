import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Start/stop history. v0 just records intents; actual process spawning comes later.
export const agentLifecycleEvents = sqliteTable("agent_lifecycle_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentId: text("agent_id").notNull(),
  action: text("action", { enum: ["start", "stop"] }).notNull(),
  // "noop" in v0, "ok" / "error" once real spawning is wired up
  result: text("result", { enum: ["noop", "ok", "error"] }).notNull(),
  message: text("message"),
  at: integer("at", { mode: "timestamp_ms" }).notNull(),
});

export type AgentLifecycleEvent = typeof agentLifecycleEvents.$inferSelect;
export type NewAgentLifecycleEvent = typeof agentLifecycleEvents.$inferInsert;

// Live process registry. One row per agent while a wrapper loop is running.
// Orchestrator writes on spawn, deletes on stop. Liveness is verified via
// process.kill(pid, 0) on every read to reconcile after crashes or restarts.
export const agentProcesses = sqliteTable("agent_processes", {
  agentId: text("agent_id").primaryKey(),
  pid: integer("pid").notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  logPath: text("log_path").notNull(),
});

export type AgentProcess = typeof agentProcesses.$inferSelect;
export type NewAgentProcess = typeof agentProcesses.$inferInsert;

// Simple KV for dashboard UI state. Currently holds reset baselines for the
// usage panel (e.g. `five_hour_reset_at`, `weekly_reset_at`) so users can
// zero-out the 5h / 7d bars independently of the natural rolling window.
export const uiState = sqliteTable("ui_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type UiStateRow = typeof uiState.$inferSelect;
