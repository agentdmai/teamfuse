import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAgent, isAgentId } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Max bytes returned per poll. Covers a busy tick + a couple cycles of idle
// chatter. Client treats this as a soft cap and keeps polling for the tail.
const MAX_CHUNK = 256 * 1024;

function parseOffset(raw: string | null): number {
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export async function GET(
  req: Request,
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
  const logPath = path.join(agent.workingDir, ".orchestrator", "agent-loop.log");
  const url = new URL(req.url);
  const requestedOffset = parseOffset(url.searchParams.get("offset"));

  let size = 0;
  try {
    const stat = await fs.stat(logPath);
    size = stat.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return NextResponse.json({
        ok: true,
        agent: id,
        path: logPath,
        size: 0,
        offset: 0,
        nextOffset: 0,
        content: "",
        missing: true,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        agent: id,
        path: logPath,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // File was rotated or truncated since the client last polled.
  const rotated = requestedOffset > size;
  let start = rotated ? 0 : requestedOffset;

  // Cap: if the slice would exceed MAX_CHUNK, move start forward so we
  // return only the tail of the pending range. The client keeps polling.
  if (size - start > MAX_CHUNK) {
    start = size - MAX_CHUNK;
  }

  const length = size - start;
  let content = "";
  if (length > 0) {
    const fh = await fs.open(logPath, "r");
    try {
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      content = buf.toString("utf8");
    } finally {
      await fh.close();
    }
  }

  return NextResponse.json({
    ok: true,
    agent: id,
    path: logPath,
    size,
    offset: start,
    nextOffset: size,
    content,
    rotated,
  });
}
