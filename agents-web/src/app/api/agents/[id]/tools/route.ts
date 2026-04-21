import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAgent, isAgentId } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Returns whatever the agent last wrote to .orchestrator/tools.json (see
// agent-loop.sh for the shape). Agents refresh this file on ticks where it's
// missing or >60min old, so freshness tracks the last tick cadence.
export async function GET(
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
  const agent = getAgent(id)!;
  const p = path.join(agent.workingDir, ".orchestrator", "tools.json");
  try {
    const text = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(text);
    return NextResponse.json({ ok: true, agent: id, path: p, tools: parsed });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return NextResponse.json({
        ok: true,
        agent: id,
        path: p,
        tools: null,
        missing: true,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        agent: id,
        path: p,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
