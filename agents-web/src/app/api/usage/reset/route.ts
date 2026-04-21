import { NextResponse } from "next/server";
import { setUiEpoch, clearUiKey, type UiStateKey } from "@/lib/ui-state";

export const dynamic = "force-dynamic";

// POST /api/usage/reset
// Body: { window: "5h" | "7d", clear?: boolean }
//   clear=true  → remove the reset baseline entirely (bar falls back to
//                 the natural rolling 5h / 7d window)
//   default     → set the baseline to NOW, so the bar zeros out and begins
//                 accumulating from this moment. Bars bounded at the natural
//                 window duration still apply — resetting the weekly bar to
//                 now means it will cover up to 7 days from now (whichever
//                 is shorter of window-duration and time-since-reset).
export async function POST(req: Request) {
  let body: { window?: string; clear?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty / malformed body is fine — we'll error on the window check
  }

  const win = body.window;
  let key: UiStateKey;
  if (win === "5h") key = "five_hour_reset_at";
  else if (win === "7d") key = "weekly_reset_at";
  else {
    return NextResponse.json(
      { ok: false, message: `window must be "5h" or "7d"; got ${JSON.stringify(win)}` },
      { status: 400 },
    );
  }

  if (body.clear) {
    clearUiKey(key);
    return NextResponse.json({ ok: true, window: win, cleared: true });
  }

  const now = Date.now();
  setUiEpoch(key, now);
  return NextResponse.json({ ok: true, window: win, resetAt: now });
}
