import { cn } from "@/lib/utils";

// Known state styles. Orchestrator-owned transitions plus a few well-known
// agent-reported states. Anything else falls back to `unknown`.
const stateStyles: Record<string, string> = {
  stopped: "bg-muted text-muted-foreground ring-1 ring-border",
  starting: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  running: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
  sleeping: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  errored: "bg-red-100 text-red-900 ring-1 ring-red-200",
  idle: "bg-sky-50 text-sky-900 ring-1 ring-sky-100",
  triaging: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100",
  auditing: "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100",
  "gmail-pass": "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100",
  blocked: "bg-red-50 text-red-900 ring-1 ring-red-100",
};
const fallback = "bg-slate-100 text-slate-700 ring-1 ring-slate-200";

export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        stateStyles[state] ?? fallback,
      )}
    >
      {state}
    </span>
  );
}

export function SourceBadge({
  source,
}: {
  source: "file" | "missing" | "invalid";
}) {
  const styles: Record<typeof source, string> = {
    file: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100",
    missing: "bg-muted text-muted-foreground ring-1 ring-border",
    invalid: "bg-red-50 text-red-800 ring-1 ring-red-100",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono",
        styles[source],
      )}
    >
      {source}
    </span>
  );
}

export function ProcessBadge({
  running,
  pid,
}: {
  running: boolean;
  pid: number | null;
}) {
  return running ? (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
      pid {pid}
    </span>
  ) : (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground ring-1 ring-border">
      no process
    </span>
  );
}
