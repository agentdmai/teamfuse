import { NextResponse } from "next/server";
import { getAgent, isAgentId } from "@/lib/agents";
import { getDb, schema } from "@/db/client";
import { startAgent } from "@/lib/supervisor";

export const dynamic = "force-dynamic";

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
  const agent = getAgent(id)!;
  const db = getDb();

  try {
    const { process: proc, alreadyRunning } = startAgent(id);
    await db.insert(schema.agentLifecycleEvents).values({
      agentId: id,
      action: "start",
      result: "ok",
      message: alreadyRunning
        ? `already running pid=${proc.pid}`
        : `spawned pid=${proc.pid} in ${agent.workingDir}`,
      at: new Date(),
    });
    return NextResponse.json({
      ok: true,
      action: "start",
      agent: id,
      result: "ok",
      alreadyRunning,
      process: proc,
      message: alreadyRunning
        ? `already running (pid ${proc.pid})`
        : `started (pid ${proc.pid})`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(schema.agentLifecycleEvents).values({
      agentId: id,
      action: "start",
      result: "error",
      message,
      at: new Date(),
    });
    return NextResponse.json(
      {
        ok: false,
        action: "start",
        agent: id,
        result: "error",
        message,
      },
      { status: 500 },
    );
  }
}
