"use client";

import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import type { AgentId } from "@/lib/agents";

interface Props {
  agentId: AgentId;
  agentAlias: string;
  onClose: () => void;
}

interface ToolsDoc {
  generated_at?: string;
  total_tools?: number;
  servers?: Array<{
    name: string;
    tools?: Array<{ name: string; description?: string }>;
  }>;
}

interface ToolsResponse {
  ok: boolean;
  tools: ToolsDoc | null;
  missing?: boolean;
  path?: string;
  message?: string;
}

export function AgentMcpModal({ agentId, agentAlias, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<ToolsDoc | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener("cancel", handleCancel);
    return () => dlg.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ToolsResponse;
      if (!data.ok) {
        setError(data.message ?? "tools fetch failed");
        setDoc(null);
      } else {
        setDoc(data.tools);
        setMissing(Boolean(data.missing));
        // Expand any server we don't already have a preference for. Preserves
        // the user's collapse/expand choices across auto-refreshes.
        if (data.tools?.servers) {
          setExpanded((prev) => {
            const next = { ...prev };
            for (const s of data.tools!.servers ?? []) {
              if (!(s.name in next)) next[s.name] = true;
            }
            return next;
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 5s while the modal is open so a freshly-written
    // tools.json (agent's first tick) surfaces without user action. Cheap:
    // the endpoint is a single fs.readFile of a few KB.
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const ageText = (() => {
    if (!doc?.generated_at) return null;
    const t = new Date(doc.generated_at).getTime();
    if (!Number.isFinite(t)) return null;
    const mins = Math.round((Date.now() - t) / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs}h ago`;
  })();

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(820px,92vw)] h-[min(700px,84vh)] rounded-lg p-0 bg-background text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold font-mono">
              {agentAlias} · MCP servers & tools
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {doc?.total_tools != null
                ? `${doc.total_tools} tools across ${doc.servers?.length ?? 0} servers`
                : missing
                  ? "not yet reported"
                  : loading
                    ? "…"
                    : ""}
              {ageText && ` · generated ${ageText}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
              />
              reload
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded border border-border px-2 py-1 text-xs hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-4 py-3 text-[13px]">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
              {error}
            </div>
          )}
          {missing && !doc && (
            <div className="rounded border border-dashed border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">
                  No tools snapshot yet.
                </strong>
              </p>
              <p>
                The agent writes{" "}
                <code className="font-mono">.orchestrator/tools.json</code> on
                its first tick (and refreshes it hourly). Start the agent and
                wait one tick, then reload.
              </p>
            </div>
          )}
          {doc?.servers && doc.servers.length > 0 && (
            <ul className="space-y-2">
              {doc.servers.map((s) => {
                const open = !!expanded[s.name];
                const toolCount = s.tools?.length ?? 0;
                return (
                  <li
                    key={s.name}
                    className="rounded border border-border overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [s.name]: !open }))
                      }
                      className="flex w-full items-center justify-between gap-2 bg-muted/30 px-3 py-2 text-left hover:bg-muted/60"
                    >
                      <span className="flex items-center gap-2">
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span className="font-mono text-[13px] font-semibold">
                          {s.name}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {toolCount} {toolCount === 1 ? "tool" : "tools"}
                      </span>
                    </button>
                    {open && (
                      <ul className="divide-y divide-border">
                        {(s.tools ?? []).map((t) => (
                          <li
                            key={t.name}
                            className="px-3 py-1.5 font-mono text-[12px]"
                            title={t.description ?? t.name}
                          >
                            {shortToolName(t.name, s.name)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {doc?.servers && doc.servers.length === 0 && (
            <div className="text-xs text-muted-foreground">
              Agent reported zero MCP tools. Either no MCP servers are loading,
              or the agent didn&apos;t enumerate them yet.
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

// Strip the mcp__<server>__ prefix for display.
function shortToolName(full: string, server: string): string {
  const prefix = `mcp__${server}__`;
  if (full.startsWith(prefix)) return full.slice(prefix.length);
  return full;
}
