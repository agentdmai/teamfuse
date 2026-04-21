import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { readAllAgentStatuses } from "@/lib/status";
import { getAllAgentProcesses } from "@/lib/supervisor";

export const dynamic = "force-dynamic";

// Platform-wide heartbeat. Counts how many agents the orchestrator believes
// are running (pid alive) vs. how many have recently written a status.json.
// Divergence between the two is useful: e.g. process alive but no heartbeat
// file means the agent is stuck before its first tick.

export async function GET() {
  const statuses = await readAllAgentStatuses();
  const procs = getAllAgentProcesses(AGENTS.map((a) => a.id));
  const now = Date.now();
  const HEARTBEAT_FRESH_MS = 10 * 60 * 1000; // 10 min — loop tick is 5 min

  const running = Object.values(procs).filter((p) => p.running).length;
  const fresh = statuses.filter((s) => {
    const ts = s.status.heartbeat_ts;
    if (!ts) return false;
    const t = new Date(ts).getTime();
    return Number.isFinite(t) && now - t < HEARTBEAT_FRESH_MS;
  }).length;

  return NextResponse.json({
    totalAgents: statuses.length,
    processesRunning: running,
    freshHeartbeats: fresh,
    agents: statuses.map((s) => ({
      id: s.agent,
      statusSource: s.source,
      agentState: s.status.state,
      heartbeat_ts: s.status.heartbeat_ts,
      process: procs[s.agent],
    })),
  });
}
