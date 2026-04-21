import { AGENTS } from "@/lib/agents";
import { readAllAgentStatuses } from "@/lib/status";
import { getAllAgentProcesses } from "@/lib/supervisor";
import { AgentBreaker } from "@/components/agent-breaker";

// Renamed mentally from "table" to "breaker panel" — same server entry point,
// but each agent is now a card in a 2-column grid instead of a table row.
// Kept the exported name so page.tsx and any other callers don't change.

export async function AgentTable() {
  const [rows, procs] = await Promise.all([
    readAllAgentStatuses(),
    Promise.resolve(getAllAgentProcesses(AGENTS.map((a) => a.id))),
  ]);
  const byId = new Map(rows.map((r) => [r.agent, r]));

  return (
    <section>
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">
        Branch circuits
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {AGENTS.map((agent) => {
          const row = byId.get(agent.id);
          if (!row) return null;
          return (
            <AgentBreaker
              key={agent.id}
              agent={{
                id: agent.id,
                alias: agent.alias,
                role: agent.role,
                workingDir: agent.workingDir,
                chrome: agent.chrome,
              }}
              status={row.status}
              source={row.source}
              statusPath={row.path || null}
              proc={procs[agent.id]}
            />
          );
        })}
      </div>
    </section>
  );
}
