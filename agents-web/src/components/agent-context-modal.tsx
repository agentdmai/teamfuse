"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, RefreshCw, FileText, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentId } from "@/lib/agents";

type LoadMode =
  | "auto-cwd"
  | "policy"
  | "skill-desc"
  | "mcp-config"
  | "synthetic"
  | "referenced";

interface ContextEntry {
  id: string;
  label: string;
  category: string;
  loadMode: LoadMode;
  size: number;
  exists: boolean;
  description?: string;
}

interface ListResponse {
  ok: boolean;
  entries?: ContextEntry[];
  message?: string;
}

interface FileResponse {
  ok: boolean;
  entry?: ContextEntry;
  path?: string | null;
  content?: string;
  size?: number;
  truncated?: boolean;
  missing?: boolean;
  message?: string;
}

interface Props {
  agentId: AgentId;
  agentAlias: string;
  onClose: () => void;
}

const LOAD_MODE_LABEL: Record<LoadMode, { label: string; tone: string }> = {
  "auto-cwd":   { label: "auto",       tone: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  "policy":     { label: "every tick", tone: "bg-sky-100 text-sky-800 ring-sky-200" },
  "mcp-config": { label: "mcp schema", tone: "bg-violet-100 text-violet-800 ring-violet-200" },
  "skill-desc": { label: "name only",  tone: "bg-amber-100 text-amber-800 ring-amber-200" },
  "synthetic":  { label: "wrapper",    tone: "bg-slate-200 text-slate-800 ring-slate-300" },
  "referenced": { label: "lazy",       tone: "bg-stone-100 text-stone-700 ring-stone-200" },
};

export function AgentContextModal({ agentId, agentAlias, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [entries, setEntries] = useState<ContextEntry[] | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileData, setFileData] = useState<FileResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

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

  async function loadList() {
    setListLoading(true);
    setListErr(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/context`, { cache: "no-store" });
      const data = (await res.json()) as ListResponse;
      if (!data.ok || !data.entries) {
        setListErr(data.message ?? "context fetch failed");
        setEntries(null);
      } else {
        setEntries(data.entries);
        // Auto-select the primary instructions file on first load.
        if (selectedId == null && data.entries.length > 0) {
          const first =
            data.entries.find((e) => e.id === "instructions-md") ?? data.entries[0];
          setSelectedId(first.id);
        }
      }
    } catch (err) {
      setListErr(err instanceof Error ? err.message : "network error");
    } finally {
      setListLoading(false);
    }
  }

  async function loadFile(entryId: string) {
    setFileLoading(true);
    setFileData(null);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/context?entry=${encodeURIComponent(entryId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as FileResponse;
      setFileData(data);
    } catch (err) {
      setFileData({
        ok: false,
        message: err instanceof Error ? err.message : "network error",
      });
    } finally {
      setFileLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  useEffect(() => {
    if (selectedId) loadFile(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, agentId]);

  // Group entries by category, preserving the server's list order within each.
  const grouped = useMemo(() => {
    if (!entries) return [];
    const order: string[] = [];
    const map = new Map<string, ContextEntry[]>();
    for (const e of entries) {
      if (!map.has(e.category)) {
        map.set(e.category, []);
        order.push(e.category);
      }
      map.get(e.category)!.push(e);
    }
    return order.map((cat) => ({ category: cat, items: map.get(cat)! }));
  }, [entries]);

  const totalBytes = useMemo(
    () => (entries ?? []).reduce((a, e) => a + (e.exists ? e.size : 0), 0),
    [entries],
  );

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(1100px,94vw)] h-[min(760px,88vh)] rounded-lg p-0 bg-background text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold font-mono">
              {agentAlias} · context window
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {entries
                ? `${entries.length} entries · ~${fmtBytes(totalBytes)} on disk`
                : listLoading
                  ? "loading…"
                  : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadList();
                if (selectedId) loadFile(selectedId);
              }}
              disabled={listLoading || fileLoading}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3 w-3 ${listLoading || fileLoading ? "animate-spin" : ""}`}
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

        <div className="flex-1 flex min-h-0">
          {/* Left pane — file list */}
          <aside className="w-[320px] shrink-0 border-r border-border overflow-auto text-[12px]">
            {listErr && (
              <div className="m-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                {listErr}
              </div>
            )}
            {grouped.map(({ category, items }) => (
              <div key={category} className="py-1">
                <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/40 border-y border-border">
                  {category}
                </div>
                <ul>
                  {items.map((e) => {
                    const active = e.id === selectedId;
                    const badge = LOAD_MODE_LABEL[e.loadMode];
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(e.id)}
                          className={[
                            "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted",
                            active ? "bg-muted" : "",
                          ].join(" ")}
                          title={e.description ?? e.label}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {e.exists ? (
                              <FileText className="h-3 w-3 text-slate-500 shrink-0" />
                            ) : (
                              <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                            )}
                            <span className="font-mono text-[12px] truncate">
                              {e.label}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <span
                              className={`rounded-sm px-1 py-0.5 text-[9px] font-mono ring-1 ${badge.tone}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono w-10 text-right">
                              {e.exists ? fmtBytes(e.size) : "—"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </aside>

          {/* Right pane — content viewer */}
          <section className="flex-1 min-w-0 flex flex-col">
            <FileHeader data={fileData} loading={fileLoading} />
            <div className="flex-1 overflow-auto">
              {fileLoading && (
                <div className="p-4 text-xs text-muted-foreground">loading…</div>
              )}
              {!fileLoading && fileData && !fileData.ok && (
                <div className="m-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                  {fileData.message ?? "read failed"}
                </div>
              )}
              {!fileLoading && fileData?.ok && fileData.missing && (
                <div className="m-3 rounded border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  File is referenced but doesn&apos;t exist on disk. The agent
                  would fail if it tried to read it.
                </div>
              )}
              {!fileLoading && fileData?.ok && !fileData.missing && (
                <ContentViewer data={fileData} />
              )}
            </div>
            {fileData?.ok && fileData.truncated && (
              <div className="border-t border-border bg-amber-50 px-4 py-1 text-[11px] text-amber-800 font-mono">
                truncated — showing first 512 KB of {fmtBytes(fileData.size ?? 0)}
              </div>
            )}
          </section>
        </div>
      </div>
    </dialog>
  );
}

function FileHeader({
  data,
  loading,
}: {
  data: FileResponse | null;
  loading: boolean;
}) {
  if (loading || !data || !data.ok || !data.entry) {
    return (
      <header className="border-b border-border px-4 py-2 text-[11px] text-muted-foreground font-mono">
        {loading ? "…" : "select a file"}
      </header>
    );
  }
  const e = data.entry;
  return (
    <header className="border-b border-border px-4 py-2 flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="font-mono text-[13px] font-semibold truncate">
          {e.label}
        </div>
        {data.path && (
          <div className="font-mono text-[10px] text-muted-foreground truncate">
            {data.path}
          </div>
        )}
      </div>
      <div className="shrink-0 text-[10px] font-mono text-muted-foreground flex items-center gap-2">
        <span className={`rounded-sm px-1 py-0.5 ring-1 ${LOAD_MODE_LABEL[e.loadMode].tone}`}>
          {LOAD_MODE_LABEL[e.loadMode].label}
        </span>
        <span>{fmtBytes(data.size ?? 0)}</span>
      </div>
    </header>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Decide how to render the file body: markdown for .md, pretty-printed for
// .json, plain text for everything else (shell-embedded tick prompt, etc).
type ViewMode = "markdown" | "json" | "plain";

function detectMode(entryLabel?: string, entryId?: string): ViewMode {
  if (!entryLabel) return "plain";
  const lower = entryLabel.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (entryId === "tick-prompt") return "plain";
  return "plain";
}

function ContentViewer({ data }: { data: FileResponse }) {
  const [rawMode, setRawMode] = useState(false);
  const mode = detectMode(data.entry?.label, data.entry?.id);
  const content = data.content ?? "";

  if (mode === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // leave as-is if not valid JSON
    }
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5] px-4 py-3">
        {pretty}
      </pre>
    );
  }

  if (mode === "markdown" && !rawMode) {
    return (
      <div className="px-4 py-3 text-[13px] leading-[1.6]">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setRawMode(true)}
            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            view raw
          </button>
        </div>
        <MarkdownBody source={content} />
      </div>
    );
  }

  // Plain or raw markdown
  return (
    <div className="px-4 py-3">
      {mode === "markdown" && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setRawMode(false)}
            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            view rendered
          </button>
        </div>
      )}
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.5]">
        {content}
      </pre>
    </div>
  );
}

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => (
            <h1 className="text-[18px] font-bold mt-4 mb-2 pb-1 border-b border-border" {...p} />
          ),
          h2: (p) => (
            <h2 className="text-[15px] font-bold mt-4 mb-2 pb-0.5 border-b border-border" {...p} />
          ),
          h3: (p) => <h3 className="text-[14px] font-bold mt-3 mb-1.5" {...p} />,
          h4: (p) => <h4 className="text-[13px] font-semibold mt-2 mb-1" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="list-disc pl-6 my-2 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-6 my-2 space-y-1" {...p} />,
          li: (p) => <li className="leading-snug" {...p} />,
          a: (p) => (
            <a
              className="text-sky-600 hover:underline"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          em: (p) => <em className="italic" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="border-l-4 border-border pl-3 my-2 text-muted-foreground italic"
              {...p}
            />
          ),
          hr: (p) => <hr className="my-3 border-border" {...p} />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code
                  className={`${className ?? ""} font-mono text-[12px]`}
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1 py-[1px] font-mono text-[11.5px] text-foreground"
                {...rest}
              >
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre
              className="rounded bg-muted/60 border border-border p-2 my-2 overflow-auto font-mono text-[11.5px] leading-[1.5]"
              {...p}
            />
          ),
          table: (p) => (
            <div className="overflow-auto my-2">
              <table className="w-full border-collapse text-[12px]" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-muted/40" {...p} />,
          th: (p) => (
            <th className="border border-border px-2 py-1 text-left font-semibold" {...p} />
          ),
          td: (p) => <td className="border border-border px-2 py-1 align-top" {...p} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
