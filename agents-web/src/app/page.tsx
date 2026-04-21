import { AgentTable } from "@/components/agent-table";
import { UsagePanel } from "@/components/usage-panel";
import { MasterBreaker } from "@/components/master-breaker";
import { COMPANY_NAME } from "@/lib/agents";

// Force dynamic so the server re-reads status.json and pid liveness on every
// request. The dashboard polls by re-fetching the route.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-6 px-4">
      <main className="mx-auto max-w-6xl">
        {/* Outer cabinet: thick metallic bezel, recessed interior */}
        <div className="rounded-lg bg-gradient-to-b from-slate-300 to-slate-500 p-2 shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="rounded-md bg-slate-900/95 ring-1 ring-black/60 p-5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
            {/* Cabinet nameplate */}
            <header className="mb-5 flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/80">
                  {COMPANY_NAME.toLowerCase()} · control panel
                </div>
                <h1 className="font-mono text-lg font-semibold tracking-tight text-slate-100">
                  Main load center
                </h1>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                LIVE
              </div>
            </header>

            <div className="space-y-5">
              {/* Usage + master breaker share one row; master sits on the right */}
              <div className="flex gap-3 items-stretch">
                <div className="flex-1 min-w-0">
                  <UsagePanel />
                </div>
                <MasterBreaker />
              </div>

              <AgentTable />
            </div>

            <footer className="mt-5 border-t border-slate-700 pt-3 text-[10px] leading-relaxed text-slate-500 font-mono">
              <span className="text-slate-400">Legend:</span>{" "}
              <span className="text-emerald-300">●</span> running{" "}
              <span className="text-sky-300">●</span> idle/sleeping{" "}
              <span className="text-amber-300">●</span> starting{" "}
              <span className="text-red-300">●</span> errored/blocked{" "}
              <span className="text-slate-300">●</span> stopped · start/stop via
              mini breaker · wake interrupts sleep · chevron expands
              detail
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
