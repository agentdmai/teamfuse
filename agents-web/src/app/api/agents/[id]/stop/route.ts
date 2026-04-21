import { NextResponse } from "next/server";
import { isAgentId } from "@/lib/agents";
import { getDb, schema } from "@/db/client";
import { stopAgent } from "@/lib/supervisor";

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
  const db = getDb();

  try {
    const res = await stopAgent(id);
    const msg = !res.wasRunning
      ? "not running"
      : res.forced
        ? "SIGKILL (SIGTERM timed out)"
        : "SIGTERM";
    await db.insert(schema.agentLifecycleEvents).values({
      agentId: id,
      action: "stop",
      result: "ok",
      message: msg,
      at: new Date(),
    });
    return NextResponse.json({
      ok: true,
      action: "stop",
      agent: id,
      result: "ok",
      wasRunning: res.wasRunning,
      forced: res.forced,
      process: res.process,
      message: msg,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(schema.agentLifecycleEvents).values({
      agentId: id,
      action: "stop",
      result: "error",
      message,
      at: new Date(),
    });
    return NextResponse.json(
      {
        ok: false,
        action: "stop",
        agent: id,
        result: "error",
        message,
      },
      { status: 500 },
    );
  }
}
