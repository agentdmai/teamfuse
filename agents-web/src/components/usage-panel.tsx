"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  messages: number;
}
interface WindowTotals {
  tokens: number;
  messages: number;
  costUsd: number;
  windowStartMs: number;
  windowEndMs: number;
}
interface RateLimitEvent {
  at: string;
  raw: string;
  resetsAt?: string;
}
interface AgentRow {
  agentId: string;
  totals: UsageTotals;
  lastActivity: string | null;
  startedAtMs: number | null;
  sinceStart: WindowTotals | null;
  rateLimits: RateLimitEvent[];
}
interface UsageReport {
  ok: boolean;
  generatedAt: string;
  agents: AgentRow[];
  activeRateLimits: Array<{ agentId: string; event: RateLimitEvent }>;
  global: {
    fiveHour: WindowTotals;
    weekly: WindowTotals;
    fiveHourResetAt: number | null;
    weeklyResetAt: number | null;
    caps: { fiveHour: number; weekly: number };
  };
  peakSinceStart: number;
}

const POLL_MS = 15_000;

export function UsagePanel() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [resetting, setResetting] = useState<"5h" | "7d" | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      const data = (await res.json()) as UsageReport;
      if (data.ok) {
        setReport(data);
        setError(null);
        setLoadedAt(Date.now());
      } else setError("usage endpoint returned not-ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    const poll = setInterval(() => {
      if (alive) load();
    }, POLL_MS);
    const clock = setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resetBar(win: "5h" | "7d") {
    if (resetting) return;
    setResetting(win);
    try {
      await fetch("/api/usage/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ window: win }),
      });
      await load();
    } finally {
      setResetting(null);
    }
  }

  const ageSec =
    loadedAt != null ? Math.max(0, Math.floor((nowTick - loadedAt) / 1000)) : 0;
  const active = report?.activeRateLimits ?? [];

  return (
    <section className="rounded-lg border border-border bg-background text-foreground p-4 space-y-4">
      <header className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span>Claude usage · from session files</span>
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw
            className={`h-3 w-3 ${loading ? "animate-spin text-emerald-600" : ""}`}
          />
          {loadedAt == null
            ? "loading…"
            : `updated ${ageSec}s ago · polls every ${POLL_MS / 1000}s`}
        </span>
      </header>

      {active.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            Rate limit hit
          </div>
          {active.map((a, i) => (
            <div key={i}>
              <span className="font-semibold">@{a.agentId}</span>: {a.event.raw}
              <span className="ml-1 text-amber-700">
                · {fmtRelative(a.event.at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-2">
          <GlobalBar
            label="5-hour window"
            sub="estimated cap · resets auto on Master ON"
            win={report.global.fiveHour}
            cap={report.global.caps.fiveHour}
            resetAt={report.global.fiveHourResetAt}
            onReset={() => resetBar("5h")}
            resetting={resetting === "5h"}
            nowMs={nowTick}
          />
          <GlobalBar
            label="7-day window"
            sub="estimated cap · weekly"
            win={report.global.weekly}
            cap={report.global.caps.weekly}
            resetAt={report.global.weeklyResetAt}
            onReset={() => resetBar("7d")}
            resetting={resetting === "7d"}
            nowMs={nowTick}
          />
        </div>
      )}
    </section>
  );
}

function GlobalBar({
  label, sub, win, cap, resetAt, onReset, resetting, nowMs,
}: {
  label: string;
  sub: string;
  win: WindowTotals;
  cap: number;
  resetAt: number | null;
  onReset: () => void;
  resetting: boolean;
  nowMs: number;
}) {
  const pct = cap > 0 ? Math.min(100, (win.tokens / cap) * 100) : 0;
  const severity =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const resetLabel = resetAt
    ? `since ${fmtRelativeMs(resetAt, nowMs)}`
    : "natural rolling window";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12px] font-semibold">{label}</span>
          <span className="text-[10px] font-mono text-muted-foreground truncate">
            {sub}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono">
            {fmtTokens(win.tokens)} / {fmtTokens(cap)}
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={resetting}
            title="Zero this bar and start counting from now"
            className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw
              className={`h-2.5 w-2.5 ${resetting ? "animate-spin" : ""}`}
            />
            reset
          </button>
        </div>
      </div>
      <div className="h-2.5 rounded bg-muted overflow-hidden">
        <div
          className={`h-full ${severity} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>{resetLabel}</span>
        <span>
          {win.messages.toLocaleString()} msgs · ${win.costUsd.toFixed(2)} · {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function AgentBars({
  agents, peak, nowMs,
}: {
  agents: AgentRow[];
  peak: number;
  nowMs: number;
}) {
  return (
    <ul className="space-y-1.5">
      {agents.map((a) => {
        const used = a.sinceStart?.tokens ?? 0;
        const msgs = a.sinceStart?.messages ?? 0;
        const cost = a.sinceStart?.costUsd ?? 0;
        const hasStart = a.startedAtMs != null;
        const pct = peak > 0 ? (used / peak) * 100 : 0;
        const startedRel = hasStart
          ? fmtRelativeMs(a.startedAtMs!, nowMs)
          : "never";
        return (
          <li key={a.agentId} className="space-y-0.5">
            <div className="flex items-baseline justify-between text-[11px] gap-2">
              <span className="font-mono font-semibold truncate">
                @{a.agentId}
              </span>
              <span className="font-mono text-muted-foreground shrink-0">
                {hasStart ? fmtTokens(used) : "— not started"}
                {hasStart && (
                  <span className="ml-2">
                    · {msgs.toLocaleString()} msgs · ${cost.toFixed(2)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all"
                style={{ width: hasStart ? `${pct}%` : "0%" }}
              />
            </div>
            <div className="text-[9px] font-mono text-muted-foreground">
              started {startedRel}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function fmtTokens(n: number): string {
  if (n < 1000) return `${n} tok`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K tok`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M tok`;
  return `${(n / 1_000_000_000).toFixed(2)}B tok`;
}

function fmtRelative(ts: string): string {
  const d = Date.parse(ts);
  if (!Number.isFinite(d)) return ts;
  return fmtRelativeMs(d, Date.now());
}

function fmtRelativeMs(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
