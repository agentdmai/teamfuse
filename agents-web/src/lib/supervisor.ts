import "server-only";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getAgent, type AgentId } from "@/lib/agents";

// Resolve the `agentdm` CLI binary. All loop logic lives in the CLI now;
// this supervisor just spawns it once per agent with AGENTDM_SUPERVISED=1
// and observes the .orchestrator/ control files the CLI writes.
//
// Lookup order:
//   1. AGENTDM_BIN env var (for local dev against an unpublished CLI checkout)
//   2. node_modules/.bin/agentdm (resolved via `agentdm/package.json`)
//   3. PATH (assumes the user `npm i -g agentdm` or has `npx agentdm` available)
const requireFromHere = createRequire(import.meta.url);

function resolveAgentdmBin(): { command: string; baseArgs: string[] } {
  const fromEnv = process.env.AGENTDM_BIN;
  if (fromEnv && fromEnv.trim().length > 0) {
    return { command: fromEnv, baseArgs: [] };
  }
  try {
    // require.resolve gives us the path to package.json's main file —
    // we walk up to .bin/agentdm, the symlink npm installs.
    const pkgJson = requireFromHere.resolve("agentdm/package.json");
    const pkgRoot = path.dirname(pkgJson);
    const localBin = path.resolve(pkgRoot, "..", ".bin", "agentdm");
    if (fs.existsSync(localBin)) {
      return { command: localBin, baseArgs: [] };
    }
    // Fall back to invoking the entrypoint directly via node.
    return { command: process.execPath, baseArgs: [path.join(pkgRoot, "src", "index.js")] };
  } catch {
    // Not installed locally; fall back to npx (slower, requires network on first run).
    return { command: "npx", baseArgs: ["-y", "agentdm"] };
  }
}

const AGENTDM = resolveAgentdmBin();

export interface AgentSleepInfo {
  state: "sleeping" | "tick";
  currentSleepSeconds: number;
  reason: string;
  sleepUntilEpoch: number | null; // null when state=tick
  updatedAtEpoch: number;
}

export interface AgentProcessInfo {
  agentId: AgentId;
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  logPath: string | null;
  sleep: AgentSleepInfo | null;
}

function stopped(agentId: AgentId, logPath: string | null = null): AgentProcessInfo {
  return {
    agentId,
    running: false,
    pid: null,
    startedAt: null,
    logPath,
    sleep: null,
  };
}

function readSleep(workingDir: string): AgentSleepInfo | null {
  try {
    const p = path.join(workingDir, ".orchestrator", "sleep.json");
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    const state = j.state === "sleeping" ? "sleeping" : "tick";
    return {
      state,
      currentSleepSeconds: Number(j.current_sleep_seconds ?? 0),
      reason: typeof j.reason === "string" ? j.reason : "",
      sleepUntilEpoch:
        state === "sleeping" && typeof j.sleep_until_epoch === "number"
          ? j.sleep_until_epoch
          : null,
      updatedAtEpoch: Number(j.updated_at_epoch ?? 0),
    };
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function rawDb() {
  // Drizzle has no direct equivalent to a simple delete-by-pk without an
  // imported column ref, so we use both Drizzle for reads and raw SQL where
  // it's shorter. Both talk to the same better-sqlite3 instance.
  void getDb();
  return globalThis.__controlPlaneRawDb!;
}

export function getAgentProcess(id: AgentId): AgentProcessInfo {
  const db = getDb();
  const row = db
    .select()
    .from(schema.agentProcesses)
    .where(eq(schema.agentProcesses.agentId, id))
    .get();
  if (!row) return stopped(id);
  if (!isAlive(row.pid)) {
    // Reconcile: pid is gone, clean the row.
    rawDb().prepare("DELETE FROM agent_processes WHERE agent_id = ?").run(id);
    return stopped(id, row.logPath);
  }
  const agent = getAgent(id);
  return {
    agentId: id,
    running: true,
    pid: row.pid,
    startedAt: row.startedAt.getTime(),
    logPath: row.logPath,
    sleep: agent ? readSleep(agent.workingDir) : null,
  };
}

export function getAllAgentProcesses(
  ids: AgentId[],
): Record<AgentId, AgentProcessInfo> {
  const out = {} as Record<AgentId, AgentProcessInfo>;
  for (const id of ids) out[id] = getAgentProcess(id);
  return out;
}

export interface StartResult {
  process: AgentProcessInfo;
  alreadyRunning: boolean;
}

export function startAgent(id: AgentId): StartResult {
  const agent = getAgent(id);
  if (!agent) throw new Error(`unknown agent: ${id}`);

  const existing = getAgentProcess(id);
  if (existing.running) return { process: existing, alreadyRunning: true };

  if (!fs.existsSync(agent.workingDir)) {
    throw new Error(`workingDir does not exist: ${agent.workingDir}`);
  }
  // Each runtime has a canonical instructions file.
  // Claude agents require CLAUDE.md (auto-loaded natively by Claude Code).
  // Copilot agents use AGENTS.md (auto-loaded natively by the Copilot CLI).
  const instructionsFile = agent.instructionsFile
    ?? (agent.runtime === "copilot" ? "AGENTS.md" : "CLAUDE.md");
  const primaryInstructions = path.join(agent.workingDir, instructionsFile);
  const fallbackInstructions = path.join(agent.workingDir, "CLAUDE.md");
  if (!fs.existsSync(primaryInstructions) && !fs.existsSync(fallbackInstructions)) {
    throw new Error(
      `missing instructions file (${instructionsFile}) in ${agent.workingDir}`,
    );
  }
  const logDir = path.join(agent.workingDir, ".orchestrator");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "agent-loop.log");
  const out = fs.openSync(logPath, "a");

  // detached:true gives the child its own session (setsid), so child.pid is
  // also the pgid — lets stop() kill the wrapper + any running `claude`
  // with a single process.kill(-pid, ...).
  // AGENTDM_SUPERVISED=1 puts the CLI in the long-lived per-agent mode
  // (persistent claude session, /clear between tasks, .orchestrator/* control
  // files, SIGUSR1 wake, adaptive backoff). CHROME=1 enables Claude-in-Chrome.
  const child = spawn(AGENTDM.command, [...AGENTDM.baseArgs, "start", agent.workingDir], {
    cwd: agent.workingDir,
    detached: true,
    stdio: ["ignore", out, out],
    env: {
      ...process.env,
      AGENTDM_SUPERVISED: "1",
      RUNTIME: agent.runtime,
      ...(agent.chrome && agent.runtime === "claude" ? { CHROME: "1" } : {}),
    },
  });
  child.unref();

  if (!child.pid) {
    throw new Error("failed to spawn agentdm CLI (no pid)");
  }

  const startedAt = Date.now();
  rawDb()
    .prepare(
      "INSERT OR REPLACE INTO agent_processes (agent_id, pid, started_at, log_path) VALUES (?, ?, ?, ?)",
    )
    .run(id, child.pid, startedAt, logPath);

  // Persist a last-start marker so the dashboard can compute per-agent "since
  // start" token usage even after the agent is stopped. Supervisor keeps the
  // DB row only while alive; this marker survives Stop.
  try {
    fs.writeFileSync(
      path.join(logDir, "last-start.json"),
      JSON.stringify({ epoch_ms: startedAt, pid: child.pid }, null, 2),
    );
  } catch {
    /* best-effort; dashboard falls back to rolling window */
  }

  return {
    process: {
      agentId: id,
      running: true,
      pid: child.pid,
      startedAt: Date.now(),
      logPath,
      sleep: null,
    },
    alreadyRunning: false,
  };
}

export interface StopResult {
  process: AgentProcessInfo; // post-stop state (running=false on success)
  killed: boolean; // true if we sent a signal
  forced: boolean; // true if SIGKILL was required
  wasRunning: boolean;
}

export async function stopAgent(id: AgentId): Promise<StopResult> {
  const existing = getAgentProcess(id);
  if (!existing.running || !existing.pid) {
    return { process: existing, killed: false, forced: false, wasRunning: false };
  }

  const pid = existing.pid;
  // Signal the group first; fall back to the single pid if the group signal
  // fails (e.g. process already exited between the liveness check and now).
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isAlive(pid)) {
    await new Promise((r) => setTimeout(r, 100));
  }

  let forced = false;
  if (isAlive(pid)) {
    forced = true;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    // brief wait after SIGKILL
    const hardDeadline = Date.now() + 2000;
    while (Date.now() < hardDeadline && isAlive(pid)) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  rawDb().prepare("DELETE FROM agent_processes WHERE agent_id = ?").run(id);

  return {
    process: stopped(id, existing.logPath),
    killed: true,
    forced,
    wasRunning: true,
  };
}

export interface WakeResult {
  sent: boolean;
  pid: number | null;
  reason?: string;
}

// Wake a sleeping agent by sending SIGUSR1 to the wrapper process (NOT the
// process group — we don't want to disturb an in-flight `claude` tick). The
// wrapper traps USR1 and kills its own `sleep`, which lets the next tick
// start immediately. No-op if the wrapper isn't currently sleeping.
export function wakeAgent(id: AgentId): WakeResult {
  const existing = getAgentProcess(id);
  if (!existing.running || !existing.pid) {
    return { sent: false, pid: null, reason: "not running" };
  }
  try {
    process.kill(existing.pid, "SIGUSR1");
    return { sent: true, pid: existing.pid };
  } catch (err) {
    return {
      sent: false,
      pid: existing.pid,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

