import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AGENTS, type AgentId, type AgentDefinition } from "@/lib/agents";
import { getUiEpoch } from "@/lib/ui-state";

// Estimated subscription caps (total tokens incl. cache-read) used as the
// upper bound for the global progress bars. Not official — observed on Max 5x
// Opus usage. Override via env if needed. 5h is the rolling rate-limit window;
// 7d is Anthropic's weekly window that caps sustained Opus usage.
const CAP_5H_TOKENS = Number(process.env.USAGE_CAP_5H ?? 100_000_000);
const CAP_7D_TOKENS = Number(process.env.USAGE_CAP_7D ?? 2_000_000_000);

// Claude Code stores session transcripts at:
//   ~/.claude/projects/<slug>/<session-uuid>.jsonl
// where <slug> is the agent's cwd with `/` replaced by `-`.
// Each line is a JSON event; assistant turns include a `message.usage` block
// with input/output/cache token counts and the model used.
//
// We aggregate per agent, per day, per model, and extract rate-limit hits
// from the wrapper's agent-loop.log (the "You've hit your limit · resets …"
// messages that Claude Code surfaces when the subscription cap is reached).

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  messages: number;
}

export interface PerDay extends UsageTotals {
  date: string; // YYYY-MM-DD (UTC)
}

export interface PerModel extends UsageTotals {
  model: string;
}

export interface RateLimitEvent {
  at: string; // ISO8601 from log line
  raw: string; // exact log line, e.g. "You've hit your limit · resets 1am (America/New_York)"
  resetsAt?: string; // parsed, best effort
}

// One assistant turn recorded in a session JSONL file. Used for precise
// window queries (since-start, since-reset) that can't be done at day
// granularity. Kept minimal so millions of events fit in RAM comfortably.
export interface UsageEvent {
  tsMs: number;
  model: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  costUsd: number; // from the 'result' event when available; 0 otherwise
}

// Window-scoped totals used for the dashboard bars.
export interface WindowTotals {
  tokens: number;     // input + output + cacheCreate + cacheRead
  messages: number;
  costUsd: number;
  windowStartMs: number;
  windowEndMs: number; // == now
}

export interface AgentUsage {
  agentId: AgentId;
  sessionFiles: number;
  sessions: number; // distinct session uuids
  lastActivity: string | null; // ISO timestamp of most recent message
  totals: UsageTotals; // all-time
  last24h: UsageTotals;
  byDay: PerDay[]; // sorted recent → old, truncated to 14 days
  byModel: PerModel[];
  rateLimits: RateLimitEvent[]; // most recent first, capped at 10
  sessionDir: string;
  // NEW: precise "since last Start" window. startedAtMs is read from
  // <workingDir>/.orchestrator/last-start.json which the supervisor writes
  // on every startAgent(). Null if the agent has never been started in
  // this deployment.
  startedAtMs: number | null;
  sinceStart: WindowTotals | null;
  error?: string;
}

export interface UsageReport {
  generatedAt: string;
  agents: AgentUsage[];
  totals: UsageTotals;
  last24h: UsageTotals;
  activeRateLimits: Array<{ agentId: AgentId; event: RateLimitEvent }>;
  // NEW: global windowed totals, baselined against user-set reset times
  // (falls back to rolling windows when no reset has been recorded).
  global: {
    fiveHour: WindowTotals;
    weekly: WindowTotals;
    fiveHourResetAt: number | null; // epoch ms, null = never reset
    weeklyResetAt: number | null;
    caps: { fiveHour: number; weekly: number };
  };
  // NEW: the peak "since start" tokens across agents. UI uses this to scale
  // per-agent bars relative to the heaviest-loaded agent.
  peakSinceStart: number;
}

function slugFor(agent: AgentDefinition): string {
  return agent.workingDir.replace(/\//g, "-");
}

function sessionDirFor(agent: AgentDefinition): string {
  return path.join(os.homedir(), ".claude", "projects", slugFor(agent));
}

function emptyTotals(): UsageTotals {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    messages: 0,
  };
}

function addUsage(dst: UsageTotals, src: Record<string, unknown>) {
  dst.input_tokens += Number(src.input_tokens) || 0;
  dst.output_tokens += Number(src.output_tokens) || 0;
  dst.cache_creation_input_tokens += Number(src.cache_creation_input_tokens) || 0;
  dst.cache_read_input_tokens += Number(src.cache_read_input_tokens) || 0;
  dst.messages += 1;
}

// Cheap module-scope cache keyed by (path, mtime, size). JSONL session files
// grow over time; when unchanged we return the last parsed aggregate without
// re-reading from disk. Keeps dashboard polls cheap.
interface FileCache {
  mtimeMs: number;
  size: number;
  totals: UsageTotals;
  byDay: Map<string, UsageTotals>;
  byModel: Map<string, UsageTotals>;
  lastTsMs: number;
  // Flat per-event list, sorted by tsMs, for precise window queries.
  events: UsageEvent[];
}
const fileCache = new Map<string, FileCache>();

function parseSessionFile(
  filePath: string,
): FileCache {
  const stat = fs.statSync(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const totals = emptyTotals();
  const byDay = new Map<string, UsageTotals>();
  const byModel = new Map<string, UsageTotals>();
  const events: UsageEvent[] = [];
  let lastTsMs = 0;

  // Stream-read not worth the complexity yet; session files are a few MB at
  // most and node reads are fast. Revisit if bigger corpora emerge.
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!obj || typeof obj !== "object") continue;
    const ev = obj as Record<string, unknown>;
    const msg = ev.message as Record<string, unknown> | undefined;
    const usage = msg?.usage as Record<string, unknown> | undefined;
    if (!usage) continue;

    addUsage(totals, usage);

    const ts = (ev.timestamp ?? ev.time) as string | undefined;
    let tMs = 0;
    let day: string | null = null;
    if (ts) {
      const t = Date.parse(ts);
      if (Number.isFinite(t)) {
        tMs = t;
        if (t > lastTsMs) lastTsMs = t;
        day = new Date(t).toISOString().slice(0, 10);
      }
    }
    if (day) {
      let bucket = byDay.get(day);
      if (!bucket) {
        bucket = emptyTotals();
        byDay.set(day, bucket);
      }
      addUsage(bucket, usage);
    }

    const model = (msg?.model as string | undefined) ?? "unknown";
    let mb = byModel.get(model);
    if (!mb) {
      mb = emptyTotals();
      byModel.set(model, mb);
    }
    addUsage(mb, usage);

    // Per-event record for precise window queries. Claude Code stamps
    // `total_cost_usd` only on the final `result` event of each turn; we
    // capture it where present, otherwise 0.
    if (tMs > 0) {
      const costRaw =
        (ev.total_cost_usd as number | undefined) ??
        (ev.cost_usd as number | undefined) ??
        0;
      events.push({
        tsMs: tMs,
        model,
        input: Number(usage.input_tokens) || 0,
        output: Number(usage.output_tokens) || 0,
        cacheCreate: Number(usage.cache_creation_input_tokens) || 0,
        cacheRead: Number(usage.cache_read_input_tokens) || 0,
        costUsd: Number(costRaw) || 0,
      });
    }
  }

  events.sort((a, b) => a.tsMs - b.tsMs);

  const entry: FileCache = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    totals,
    byDay,
    byModel,
    lastTsMs,
    events,
  };
  fileCache.set(filePath, entry);
  return entry;
}

// Sum all events for this agent with tsMs >= sinceMs into a WindowTotals.
// Cheap: each file's events array is pre-sorted, so we could binary-search,
// but linear scan is fine given typical file counts.
function windowTotalsFor(events: UsageEvent[], sinceMs: number): WindowTotals {
  let tokens = 0;
  let messages = 0;
  let costUsd = 0;
  for (const e of events) {
    if (e.tsMs < sinceMs) continue;
    tokens += e.input + e.output + e.cacheCreate + e.cacheRead;
    messages += 1;
    costUsd += e.costUsd;
  }
  return {
    tokens,
    messages,
    costUsd,
    windowStartMs: sinceMs,
    windowEndMs: Date.now(),
  };
}

function mergeTotals(into: UsageTotals, from: UsageTotals) {
  into.input_tokens += from.input_tokens;
  into.output_tokens += from.output_tokens;
  into.cache_creation_input_tokens += from.cache_creation_input_tokens;
  into.cache_read_input_tokens += from.cache_read_input_tokens;
  into.messages += from.messages;
}

// Very loose parser for Claude Code's rate-limit message.
//   "You've hit your limit · resets 1am (America/New_York)"
// The exact timestamp of the limit hit is taken from the wrapper's
// `[ISO] ...` prefix of the surrounding line (agent-loop.log emits its own
// ISO timestamp on each echo; claude stdout is interleaved).
function parseRateLimits(logPath: string): RateLimitEvent[] {
  let text: string;
  try {
    text = fs.readFileSync(logPath, "utf8");
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const events: RateLimitEvent[] = [];
  // Walk lines; when we see "You've hit your limit", look backward for the
  // most recent "[ISO] ..." line to stamp it.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/You've hit your limit[^·\n]*(?:· resets ([^)]+?\))?)?/);
    if (!m) continue;
    // Find the nearest preceding wrapper timestamp.
    let stamp = "";
    for (let j = i; j >= 0 && j > i - 30; j--) {
      const s = lines[j].match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+Z)\]/);
      if (s) {
        stamp = s[1];
        break;
      }
    }
    events.push({
      at: stamp || new Date().toISOString(),
      raw: line.trim(),
      resetsAt: m[1] ? m[1].trim() : undefined,
    });
  }
  return events;
}

function recentBuckets(byDay: Map<string, UsageTotals>, keep: number): PerDay[] {
  const entries = Array.from(byDay.entries())
    .map(([date, totals]) => ({ date, ...totals }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return entries.slice(0, keep);
}

// Read the supervisor-written last-start marker so we can compute "since
// last Start" per-agent totals. Survives the agent being Stopped (the
// supervisor keeps the file on stop and overwrites it on next start).
function readLastStartMs(agent: AgentDefinition): number | null {
  const p = path.join(agent.workingDir, ".orchestrator", "last-start.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    const obj = JSON.parse(raw) as { epoch_ms?: unknown };
    const n = Number(obj?.epoch_ms);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Flatten all parsed events for an agent across session files. Returned
// sorted by tsMs ascending. Attached to the AgentUsage via a WeakMap so
// buildGlobalWindow() can re-use it without re-parsing.
const agentEventsCache = new WeakMap<AgentUsage, UsageEvent[]>();

function readAgent(agent: AgentDefinition): AgentUsage {
  const dir = sessionDirFor(agent);
  const out: AgentUsage = {
    agentId: agent.id,
    sessionFiles: 0,
    sessions: 0,
    lastActivity: null,
    totals: emptyTotals(),
    last24h: emptyTotals(),
    byDay: [],
    byModel: [],
    rateLimits: [],
    sessionDir: dir,
    startedAtMs: readLastStartMs(agent),
    sinceStart: null,
  };

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => path.join(dir, f));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      // No sessions yet — agent never ran. Not an error; just zeros.
      return out;
    }
    out.error = err instanceof Error ? err.message : String(err);
    return out;
  }

  const byDay = new Map<string, UsageTotals>();
  const byModel = new Map<string, UsageTotals>();
  const sessionUuids = new Set<string>();
  const allEvents: UsageEvent[] = [];
  let lastTsMs = 0;
  for (const f of files) {
    try {
      const parsed = parseSessionFile(f);
      mergeTotals(out.totals, parsed.totals);
      for (const [day, t] of parsed.byDay) {
        let b = byDay.get(day);
        if (!b) {
          b = emptyTotals();
          byDay.set(day, b);
        }
        mergeTotals(b, t);
      }
      for (const [model, t] of parsed.byModel) {
        let b = byModel.get(model);
        if (!b) {
          b = emptyTotals();
          byModel.set(model, b);
        }
        mergeTotals(b, t);
      }
      if (parsed.lastTsMs > lastTsMs) lastTsMs = parsed.lastTsMs;
      sessionUuids.add(path.basename(f, ".jsonl"));
      for (const e of parsed.events) allEvents.push(e);
    } catch {
      // Skip a broken file rather than fail the whole report.
    }
  }
  allEvents.sort((a, b) => a.tsMs - b.tsMs);

  out.sessionFiles = files.length;
  out.sessions = sessionUuids.size;
  if (lastTsMs > 0) out.lastActivity = new Date(lastTsMs).toISOString();
  out.byDay = recentBuckets(byDay, 14);
  out.byModel = Array.from(byModel.entries())
    .map(([model, t]) => ({ model, ...t }))
    .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens));

  // Last 24h rollup from byDay buckets — approximate (day-level resolution).
  const dayCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (const [day, t] of byDay) {
    if (day >= dayCutoff) mergeTotals(out.last24h, t);
  }

  // Rate-limit events from the wrapper's agent-loop.log (most recent first).
  const logPath = path.join(agent.workingDir, ".orchestrator", "agent-loop.log");
  const limits = parseRateLimits(logPath);
  limits.sort((a, b) => (a.at < b.at ? 1 : -1));
  out.rateLimits = limits.slice(0, 10);

  // Since-start window (null if the agent has never been Started — which
  // means no last-start.json was written by the supervisor).
  if (out.startedAtMs != null) {
    out.sinceStart = windowTotalsFor(allEvents, out.startedAtMs);
  }

  agentEventsCache.set(out, allEvents);
  return out;
}

export function readUsageReport(): UsageReport {
  const agents = AGENTS.map(readAgent);
  const totals = emptyTotals();
  const last24h = emptyTotals();
  for (const a of agents) {
    mergeTotals(totals, a.totals);
    mergeTotals(last24h, a.last24h);
  }

  // "Active" rate limits = any event where the reset timestamp hasn't passed
  // yet, or any event within the last hour if we couldn't parse a reset time.
  const activeRateLimits: Array<{ agentId: AgentId; event: RateLimitEvent }> = [];
  for (const a of agents) {
    if (a.rateLimits.length === 0) continue;
    const latest = a.rateLimits[0];
    const hitMs = Date.parse(latest.at);
    if (!Number.isFinite(hitMs)) continue;
    // Consider "active" if the hit is within the last 4 hours — the wrapper
    // will have tried and failed since, but the agent may be recovering.
    if (Date.now() - hitMs < 4 * 60 * 60 * 1000) {
      activeRateLimits.push({ agentId: a.agentId, event: latest });
    }
  }

  // Global windowed totals. Window start = max(naturalRollingStart, userReset).
  // If the user has never hit Reset, naturalRollingStart wins.
  const now = Date.now();
  const fiveHourReset = getUiEpoch("five_hour_reset_at");
  const weeklyReset = getUiEpoch("weekly_reset_at");

  const fiveHourNaturalStart = now - 5 * 60 * 60 * 1000;
  const weeklyNaturalStart   = now - 7 * 24 * 60 * 60 * 1000;

  const fiveHourWindowStart = Math.max(
    fiveHourNaturalStart,
    fiveHourReset ?? 0,
  );
  const weeklyWindowStart = Math.max(
    weeklyNaturalStart,
    weeklyReset ?? 0,
  );

  const globalFiveHour: WindowTotals = {
    tokens: 0, messages: 0, costUsd: 0,
    windowStartMs: fiveHourWindowStart, windowEndMs: now,
  };
  const globalWeekly: WindowTotals = {
    tokens: 0, messages: 0, costUsd: 0,
    windowStartMs: weeklyWindowStart, windowEndMs: now,
  };

  for (const a of agents) {
    const events = agentEventsCache.get(a);
    if (!events) continue;
    for (const e of events) {
      if (e.tsMs >= fiveHourWindowStart) {
        globalFiveHour.tokens += e.input + e.output + e.cacheCreate + e.cacheRead;
        globalFiveHour.messages += 1;
        globalFiveHour.costUsd += e.costUsd;
      }
      if (e.tsMs >= weeklyWindowStart) {
        globalWeekly.tokens += e.input + e.output + e.cacheCreate + e.cacheRead;
        globalWeekly.messages += 1;
        globalWeekly.costUsd += e.costUsd;
      }
    }
  }

  // Peak "since start" tokens across agents — UI uses it as the bar max.
  let peakSinceStart = 0;
  for (const a of agents) {
    if (a.sinceStart && a.sinceStart.tokens > peakSinceStart) {
      peakSinceStart = a.sinceStart.tokens;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    agents,
    totals,
    last24h,
    activeRateLimits,
    global: {
      fiveHour: globalFiveHour,
      weekly: globalWeekly,
      fiveHourResetAt: fiveHourReset,
      weeklyResetAt: weeklyReset,
      caps: { fiveHour: CAP_5H_TOKENS, weekly: CAP_7D_TOKENS },
    },
    peakSinceStart,
  };
}
