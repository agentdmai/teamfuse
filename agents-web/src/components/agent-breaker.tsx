"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  ScrollText,
  Plug,
  BookOpen,
  FileText,
} from "lucide-react";
import { AgentLogModal } from "@/components/agent-log-modal";
import { AgentMcpModal } from "@/components/agent-mcp-modal";
import { AgentSkillsModal } from "@/components/agent-skills-modal";
import { AgentContextModal } from "@/components/agent-context-modal";
import type { AgentId } from "@/lib/agents";

interface SleepInfo {
  state: "sleeping" | "tick";
  currentSleepSeconds: number;
  reason: string;
  sleepUntilEpoch: number | null;
  updatedAtEpoch: number;
}
interface ProcessInfo {
  running: boolean;
  pid: number | null;
  startedAt: number | null;
  logPath: string | null;
  sleep: SleepInfo | null;
}
interface StatusInfo {
  state: string;
  current_card?: string | null;
  current_step?: string | null;
  last_tool?: string | null;
  last_action?: string | null;
  last_message_ts?: string | null;
  heartbeat_ts?: string | null;
}
interface AgentInfo {
  id: AgentId;
  alias: string;
  role: string;
  runtime: "claude" | "copilot";
  workingDir: string;
  chrome: boolean;
}

interface Props {
  agent: AgentInfo;
  status: StatusInfo;
  source: "file" | "missing" | "invalid";
  statusPath: string | null;
  proc: ProcessInfo;
}

export function AgentBreaker({
  agent,
  status,
  source,
  statusPath,
  proc,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [showMcp, setShowMcp] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [mcpCount, setMcpCount] = useState<number | null>(null);
  const [skillCount, setSkillCount] = useState<number | null>(null);
  const [tokens, setTokens] = useState<{
    used: number;
    peak: number;
    startedAtMs: number | null;
    messages: number;
  } | null>(null);

  useEffect(() => {
    if (!proc.running) return;
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [proc.running]);

  // Poll lightweight counts so the MCP/SKILLS buttons display a live number.
  // tools.json is rewritten on each tick after a gap; skills are filesystem,
  // change rarely. 20s is plenty for both without being wasteful. We also
  // refresh the token meter on the same cadence — /api/usage is cached by
  // file mtime so it's cheap.
  useEffect(() => {
    let alive = true;
    async function loadCounts() {
      try {
        const [tRes, sRes, uRes] = await Promise.all([
          fetch(`/api/agents/${agent.id}/tools`, { cache: "no-store" }),
          fetch(`/api/agents/${agent.id}/skills`, { cache: "no-store" }),
          fetch(`/api/usage`, { cache: "no-store" }),
        ]);
        const tData = await tRes.json();
        const sData = await sRes.json();
        const uData = await uRes.json();
        if (!alive) return;
        const servers = tData?.tools?.servers;
        setMcpCount(Array.isArray(servers) ? servers.length : 0);
        const ps = sData?.projectSkills;
        setSkillCount(Array.isArray(ps) ? ps.length : 0);
        const row = (uData?.agents ?? []).find(
          (a: { agentId: string }) => a.agentId === agent.id,
        );
        if (row) {
          setTokens({
            used: row.sinceStart?.tokens ?? 0,
            peak: Number(uData?.peakSinceStart) || 0,
            startedAtMs: row.startedAtMs ?? null,
            messages: row.sinceStart?.messages ?? 0,
          });
        }
      } catch {
        /* keep last values */
      }
    }
    loadCounts();
    const t = setInterval(loadCounts, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [agent.id]);

  async function act(action: "start" | "stop" | "wake") {
    if (busy) return;
    setBusy(true);
    setActMsg(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      setActMsg(data?.message ?? (res.ok ? "ok" : "error"));
    } catch (err) {
      setActMsg(err instanceof Error ? err.message : "network error");
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  const effectiveState = !proc.running
    ? "stopped"
    : source === "file"
      ? status.state
      : "starting";
  const ledColor = stateToLed(effectiveState, proc.running);

  // Backoff text (short form for the card)
  const backoff = (() => {
    if (!proc.running) return null;
    if (!proc.sleep) return "…";
    const s = proc.sleep;
    if (s.state === "sleeping" && s.sleepUntilEpoch) {
      const r = Math.max(0, s.sleepUntilEpoch - nowSec);
      return `${fmtSec(s.currentSleepSeconds)} · wakes ${fmtSec(r)}`;
    }
    return `${fmtSec(s.currentSleepSeconds)} · ticking`;
  })();

  const canStart = !proc.running;
  const canStop = proc.running;

  return (
    <article className="relative rounded-md bg-slate-100 ring-1 ring-slate-400/60 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_-1px_0_rgba(0,0,0,0.2)_inset] overflow-hidden">
      {/* Label strip at the top — mimics the paper label on a real breaker */}
      <header className="bg-slate-200/80 px-3 py-1.5 border-b border-slate-400/60 flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-slate-900">
          {agent.alias}
        </span>
        <span className="text-[11px] text-slate-600 truncate">
          {agent.role}
        </span>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <TitleTokenBadge
            used={tokens?.used ?? 0}
            peak={tokens?.peak ?? 0}
            startedAtMs={tokens?.startedAtMs ?? null}
          />
          {agent.chrome && (
            <span
              className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
              title="Launches claude --chrome: headed browser session via the Claude-in-Chrome extension"
            >
              chrome
            </span>
          )}
          <span
            className={[
              "rounded px-1 py-0.5 text-[9px] font-mono uppercase tracking-wider ring-1",
              agent.runtime === "copilot"
                ? "bg-sky-100 text-sky-800 ring-sky-200"
                : "bg-violet-100 text-violet-800 ring-violet-200",
            ].join(" ")}
            title={
              agent.runtime === "copilot"
                ? "GitHub Copilot runtime"
                : "Claude Code runtime"
            }
          >
            {agent.runtime}
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded p-0.5 text-slate-600 hover:bg-slate-300"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </header>

      <div className="p-3 flex gap-3 items-start">
        {/* Mini breaker toggle — the primary actionable control */}
        <MiniBreaker
          on={proc.running}
          busy={busy || isPending}
          onToggle={() => act(proc.running ? "stop" : "start")}
          disabled={
            (proc.running && !canStop) || (!proc.running && !canStart) || busy
          }
        />

        {/* Status column */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <StateLed color={ledColor} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-700">
              {effectiveState}
            </span>
            {proc.running && proc.pid && (
              <span className="ml-auto text-[10px] font-mono text-slate-500">
                pid {proc.pid}
              </span>
            )}
          </div>

          {backoff && (
            <div className="text-[11px] font-mono text-slate-600">
              backoff: {backoff}
            </div>
          )}

          {proc.running && source === "file" && status.current_card && (
            <div className="text-[11px] font-mono text-slate-700 truncate">
              card · {status.current_card}
              {status.current_step && (
                <span className="ml-1 text-slate-500">
                  / {status.current_step}
                </span>
              )}
            </div>
          )}

          {proc.running && source === "file" && status.last_tool && (
            <div className="text-[10px] font-mono text-slate-500 truncate">
              tool · {status.last_tool}
            </div>
          )}

          {actMsg && (
            <div className="text-[10px] font-mono text-emerald-700 truncate">
              {actMsg}
            </div>
          )}
        </div>

        {/* Right column: electrical-panel-style test-point buttons */}
        <div className="flex flex-col gap-1.5 items-stretch">
          <TestButton
            label="WAKE"
            icon={<Zap className="h-3 w-3" />}
            onClick={() => act("wake")}
            disabled={!canStop || busy || isPending}
            title="SIGUSR1: wake from sleep, run tick now"
            accent="amber"
          />
          <div className="flex gap-1">
            <TestButton
              label="LOGS"
              icon={<ScrollText className="h-3 w-3" />}
              onClick={() => setShowLogs(true)}
            />
            <TestButton
              label={mcpCount == null ? "MCP" : `MCP (${mcpCount})`}
              icon={<Plug className="h-3 w-3" />}
              onClick={() => setShowMcp(true)}
            />
            <TestButton
              label={skillCount == null ? "SKILLS" : `SKILLS (${skillCount})`}
              icon={<BookOpen className="h-3 w-3" />}
              onClick={() => setShowSkills(true)}
            />
            <TestButton
              label="CTX"
              icon={<FileText className="h-3 w-3" />}
              onClick={() => setShowContext(true)}
              title="Context window: files loaded into this agent's prompt"
            />
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-300 bg-slate-50 px-3 py-2 text-[12px]">
          <Details
            agent={agent}
            status={status}
            source={source}
            statusPath={statusPath}
            proc={proc}
          />
        </div>
      )}

      {showLogs && (
        <AgentLogModal
          agentId={agent.id}
          agentAlias={agent.alias}
          onClose={() => setShowLogs(false)}
        />
      )}
      {showMcp && (
        <AgentMcpModal
          agentId={agent.id}
          agentAlias={agent.alias}
          onClose={() => setShowMcp(false)}
        />
      )}
      {showSkills && (
        <AgentSkillsModal
          agentId={agent.id}
          agentAlias={agent.alias}
          onClose={() => setShowSkills(false)}
        />
      )}
      {showContext && (
        <AgentContextModal
          agentId={agent.id}
          agentAlias={agent.alias}
          onClose={() => setShowContext(false)}
        />
      )}
    </article>
  );
}

// A compact vertical breaker: click to flip, handle slides between UP (on)
// and DOWN (off). Deliberately small (~36×60) so it fits the card scale.
function MiniBreaker({
  on,
  busy,
  disabled,
  onToggle,
}: {
  on: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const tint = on
    ? "bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-900"
    : "bg-gradient-to-b from-slate-300 to-slate-500 border-slate-900";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || busy}
      aria-pressed={on}
      aria-label={on ? "Stop agent" : "Start agent"}
      className={[
        "relative h-16 w-9 rounded-[3px] shrink-0 border-2 border-slate-900",
        "bg-slate-800 shadow-[inset_0_-4px_6px_rgba(0,0,0,0.55),inset_0_2px_3px_rgba(255,255,255,0.1)]",
        "transition-[filter] disabled:opacity-60 hover:brightness-110 active:brightness-95",
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-1/2 -translate-x-1/2 h-5 w-7 rounded-sm border",
          "flex items-center justify-center",
          tint,
          "shadow-[0_1px_2px_rgba(0,0,0,0.5)]",
          "transition-all duration-300",
          on ? "top-1" : "bottom-1",
        ].join(" ")}
      >
        <span className="pointer-events-none text-[7px] font-bold leading-none text-white/90">
          {on ? "ON" : "OFF"}
        </span>
      </span>
    </button>
  );
}

type LedColor = "green" | "red" | "amber" | "gray" | "blue";

function stateToLed(state: string, running: boolean): LedColor {
  if (!running) return "gray";
  if (state === "starting") return "amber";
  if (state === "errored" || state === "blocked") return "red";
  if (state === "idle" || state === "sleeping") return "blue";
  return "green";
}

function StateLed({ color }: { color: LedColor }) {
  const map: Record<LedColor, string> = {
    green: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
    red: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]",
    amber: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]",
    blue: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]",
    gray: "bg-slate-400",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ring-1 ring-black/30 ${map[color]}`}
      aria-hidden
    />
  );
}

function TestButton({
  label,
  icon,
  onClick,
  disabled,
  title,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  accent?: "amber";
}) {
  const tone =
    accent === "amber"
      ? "bg-gradient-to-b from-amber-400 to-amber-600 text-amber-950 hover:from-amber-300 hover:to-amber-500 border-amber-800"
      : "bg-gradient-to-b from-slate-200 to-slate-400 text-slate-800 hover:from-slate-100 hover:to-slate-300 border-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        "inline-flex items-center justify-center gap-1 rounded-[3px] border px-2 py-1",
        "text-[9px] font-bold uppercase tracking-wider",
        "shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_-1px_1px_rgba(0,0,0,0.2)_inset]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        tone,
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function Details({
  agent,
  status,
  source,
  statusPath,
  proc,
}: Omit<Props, never>) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-slate-700">
      <K>current card</K>
      <V>
        <span className="font-mono">{status.current_card ?? "—"}</span>
        {status.current_step && (
          <span className="ml-1 text-slate-500">· {status.current_step}</span>
        )}
      </V>
      <K>last tool</K>
      <V>
        <span className="font-mono">{status.last_tool ?? "—"}</span>
      </V>
      <K>last action</K>
      <V>{status.last_action ?? "—"}</V>
      <K>status.json</K>
      <V>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          [{source}]
        </span>
        {statusPath && (
          <code className="ml-2 text-[10px] text-slate-500">{statusPath}</code>
        )}
      </V>
      <K>working dir</K>
      <V>
        <code className="text-[10px]">{agent.workingDir}</code>
      </V>
      <K>process</K>
      <V>
        {proc.running ? (
          <span className="font-mono">
            pid {proc.pid}
            {proc.startedAt && (
              <span className="text-slate-500">
                {" "}
                · started {fmtRelativeMs(proc.startedAt)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-slate-500">not running</span>
        )}
      </V>
      {proc.logPath && (
        <>
          <K>log</K>
          <V>
            <code className="text-[10px]">{proc.logPath}</code>
          </V>
        </>
      )}
      {proc.sleep && (
        <>
          <K>backoff</K>
          <V>{proc.sleep.reason}</V>
        </>
      )}
    </dl>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10px] uppercase tracking-wider text-slate-500">
      {children}
    </dt>
  );
}
function V({ children }: { children: React.ReactNode }) {
  return <dd>{children}</dd>;
}

// Compact inline token gauge that sits in the breaker's title strip — a thin
// bar + numeric readout, color-coded by share of the fleet peak. Lives in
// the header row so the card doesn't grow taller; the bar itself keeps the
// electric-panel aesthetic with a recessed dark rail, tick marks, and a
// glowing gradient fill that matches the readout text.
function TitleTokenBadge({
  used,
  peak,
  startedAtMs,
}: {
  used: number;
  peak: number;
  startedAtMs: number | null;
}) {
  const hasStart = startedAtMs != null;
  const pct = hasStart && peak > 0 ? Math.min(100, (used / peak) * 100) : 0;

  const textTone =
    !hasStart
      ? "text-slate-500"
      : pct >= 90
        ? "text-red-700"
        : pct >= 70
          ? "text-amber-700"
          : "text-emerald-700";

  const fillCls =
    pct >= 90
      ? "bg-gradient-to-r from-red-400 to-red-600 shadow-[0_0_4px_rgba(239,68,68,0.5)]"
      : pct >= 70
        ? "bg-gradient-to-r from-amber-300 to-amber-500 shadow-[0_0_4px_rgba(251,191,36,0.5)]"
        : "bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_4px_rgba(52,211,153,0.5)]";

  return (
    <span
      className="flex items-center gap-1.5"
      title={
        hasStart
          ? `${used.toLocaleString()} tokens · peak agent=${peak.toLocaleString()} (${pct.toFixed(0)}%)`
          : "agent has not been Started yet"
      }
    >
      {/* Mini recessed bar */}
      <span
        aria-hidden
        className="relative block h-1.5 w-16 rounded-[2px] bg-slate-900 ring-1 ring-black/40 overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
      >
        {[25, 50, 75].map((t) => (
          <span
            key={t}
            className="absolute top-0 bottom-0 w-px bg-slate-600/60"
            style={{ left: `${t}%` }}
          />
        ))}
        <span
          className={`block h-full transition-[width] duration-500 ${fillCls}`}
          style={{ width: hasStart ? `${pct}%` : "0%" }}
        />
      </span>
      {/* Numeric readout */}
      <span
        className={`font-mono text-[10px] tabular-nums font-semibold ${textTone}`}
      >
        {hasStart ? `${fmtTokensShort(used)} tok` : "— not started"}
      </span>
    </span>
  );
}

function fmtTokensShort(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

function fmtSec(n: number): string {
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h${mm}m`;
}
function fmtRelativeMs(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
