import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { startAgent, stopAgent, getAgentProcess } from "@/lib/supervisor";
import { setUiEpoch } from "@/lib/ui-state";

export const dynamic = "force-dynamic";

// Master breaker: one request fans out to every agent. Start attempts on
// agents whose workingDir is missing return ok:false with a message; we
// don't abort the fan-out because the rest are still worth flipping.
export async function POST(req: Request) {
  let raw: string | undefined;
  try {
    const body = (await req.json()) as { action?: string };
    raw = body.action;
  } catch {
    /* parsing failed */
  }
  if (raw !== "start" && raw !== "stop") {
    return NextResponse.json(
      {
        ok: false,
        message: `master requires action to be "start" or "stop"; got ${JSON.stringify(raw)}`,
      },
      { status: 400 },
    );
  }
  const action: "start" | "stop" = raw;

  // If we're flipping the fleet ON, reset the 5h usage baseline so the
  // dashboard's global bar zero's out at the start of this session. The
  // weekly baseline is NOT reset automatically — it has its own button on
  // the dashboard, and weekly usage naturally spans multiple Start cycles.
  if (action === "start") {
    const anyRunning = AGENTS.some((a) => getAgentProcess(a.id).running);
    if (!anyRunning) {
      setUiEpoch("five_hour_reset_at", Date.now());
    }
  }

  const results = [] as Array<{
    agent: string;
    ok: boolean;
    changed: boolean;
    message: string;
    pid?: number | null;
  }>;

  for (const agent of AGENTS) {
    try {
      if (action === "start") {
        const { process: proc, alreadyRunning } = startAgent(agent.id);
        results.push({
          agent: agent.id,
          ok: true,
          changed: !alreadyRunning,
          message: alreadyRunning
            ? `already running pid=${proc.pid}`
            : `started pid=${proc.pid}`,
          pid: proc.pid,
        });
      } else {
        const pre = getAgentProcess(agent.id);
        if (!pre.running) {
          results.push({
            agent: agent.id,
            ok: true,
            changed: false,
            message: "not running",
            pid: null,
          });
          continue;
        }
        const res = await stopAgent(agent.id);
        results.push({
          agent: agent.id,
          ok: true,
          changed: res.wasRunning,
          message: res.forced ? "SIGKILL" : "SIGTERM",
          pid: null,
        });
      }
    } catch (err) {
      results.push({
        agent: agent.id,
        ok: false,
        changed: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const changed = results.filter((r) => r.changed).length;
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: failed === 0,
    action,
    changed,
    failed,
    results,
  });
}
