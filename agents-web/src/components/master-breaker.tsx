"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface AgentRow {
  id: string;
  process?: { running: boolean };
}

export function MasterBreaker() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [running, setRunning] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as { agents: AgentRow[] };
      setRunning(data.agents.filter((a) => a.process?.running).length);
      setTotal(data.agents.length);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const on = running > 0;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const action = on ? "stop" : "start";
    try {
      const res = await fetch("/api/agents/master", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        changed: number;
        failed: number;
      };
      setMsg(
        data.ok
          ? `${action} · ${data.changed} flipped`
          : `${action} · ${data.changed} flipped · ${data.failed} failed`,
      );
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "network error");
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-md bg-slate-800/80 ring-1 ring-slate-700 px-3 py-2 w-[140px] shrink-0">
      <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400">
        Main
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || isPending}
        aria-pressed={on}
        aria-label={on ? "Cut main power" : "Energize main"}
        className={[
          "relative h-16 w-10 rounded-[3px] border-2 border-black/70",
          "shadow-[inset_0_-6px_8px_rgba(0,0,0,0.5),inset_0_3px_4px_rgba(255,255,255,0.12)]",
          "transition-[filter] disabled:opacity-60",
          on
            ? "bg-gradient-to-b from-red-500 to-red-700"
            : "bg-gradient-to-b from-red-700 to-red-900",
          "hover:brightness-110 active:brightness-95",
        ].join(" ")}
      >
        <span
          className={[
            "absolute left-1/2 -translate-x-1/2 h-5 w-7 rounded-sm",
            "flex items-center justify-center",
            "bg-gradient-to-b from-red-200 to-red-500 border border-red-900",
            "shadow-[0_2px_3px_rgba(0,0,0,0.55)]",
            "transition-all duration-300",
            on ? "top-1" : "bottom-1",
          ].join(" ")}
        >
          <span className="pointer-events-none text-[7px] font-bold leading-none text-white/95">
            {on ? "ON" : "OFF"}
          </span>
        </span>
      </button>
      <span className="text-[11px] font-mono text-slate-100">
        {on ? `${running}/${total} on` : "all off"}
      </span>
      {msg && (
        <span className="text-[9px] font-mono text-emerald-400 text-center leading-tight">
          {msg}
        </span>
      )}
    </div>
  );
}
