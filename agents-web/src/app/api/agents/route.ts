import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { readAllAgentStatuses } from "@/lib/status";
import { getAllAgentProcesses } from "@/lib/supervisor";

export const dynamic = "force-dynamic";

export async function GET() {
  const statuses = await readAllAgentStatuses();
  const procs = getAllAgentProcesses(AGENTS.map((a) => a.id));
  const byId = new Map(statuses.map((s) => [s.agent, s]));
  const items = AGENTS.map((a) => {
    const s = byId.get(a.id);
    const proc = procs[a.id];
    return {
      id: a.id,
      alias: a.alias,
      role: a.role,
      workingDir: a.workingDir,
      chrome: a.chrome,
      status: s?.status ?? null,
      statusSource: s?.source ?? "missing",
      statusPath: s?.path ?? null,
      process: proc,
    };
  });
  return NextResponse.json({ agents: items });
}
