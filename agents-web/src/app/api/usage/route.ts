import { NextResponse } from "next/server";
import { readUsageReport } from "@/lib/usage";

export const dynamic = "force-dynamic";

// Aggregates Claude Code usage per agent by scanning ~/.claude/projects/<slug>/*.jsonl.
// Also pulls recent rate-limit hits from each agent-loop.log. Results are
// lightly cached (per file, by mtime+size) inside the usage module, so
// frequent dashboard polls stay cheap.
export async function GET() {
  try {
    const report = readUsageReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
