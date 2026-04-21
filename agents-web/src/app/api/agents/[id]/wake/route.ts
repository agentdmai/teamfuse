import { NextResponse } from "next/server";
import { isAgentId } from "@/lib/agents";
import { wakeAgent } from "@/lib/supervisor";

export const dynamic = "force-dynamic";

// Sends SIGUSR1 to the wrapper pid. The wrapper's trap kills its current
// `sleep`, so the next tick starts immediately. No-op if the agent isn't
// sleeping (mid-tick USR1 is ignored by the trap's `kill %1`).
// Intentionally not logged in agent_lifecycle_events — wake is transient
// orchestrator control, not a state transition worth a durable row.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isAgentId(id)) {
    return NextResponse.json(
      { ok: false, message: `unknown agent: ${id}` },
      { status: 404 },
    );
  }
  const res = wakeAgent(id);
  const message = res.sent
    ? `SIGUSR1 → pid ${res.pid}`
    : `wake not sent: ${res.reason ?? "unknown"}`;
  return NextResponse.json({
    ok: res.sent,
    action: "wake",
    agent: id,
    sent: res.sent,
    pid: res.pid,
    message,
  });
}
