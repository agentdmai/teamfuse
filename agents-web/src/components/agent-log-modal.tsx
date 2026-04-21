"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { AgentId } from "@/lib/agents";

interface Props {
  agentId: AgentId;
  agentAlias: string;
  onClose: () => void;
}

interface LogResponse {
  ok: boolean;
  size: number;
  offset: number;
  nextOffset: number;
  content: string;
  rotated?: boolean;
  missing?: boolean;
  path?: string;
  message?: string;
}

const POLL_MS = 1000;

export function AgentLogModal({ agentId, agentAlias, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const offsetRef = useRef<number>(0);
  const stickyRef = useRef<boolean>(true);
  const [text, setText] = useState<string>("");
  const [size, setSize] = useState<number>(0);
  const [missing, setMissing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Open the native dialog imperatively so ESC-to-close works and the
  // browser handles the backdrop / focus-trap for us.
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

  // Polling loop. Uses a ref for the current offset so the interval keeps
  // running across re-renders instead of tearing down/up on every chunk.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!alive) return;
      if (paused) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch(
          `/api/agents/${agentId}/logs?offset=${offsetRef.current}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as LogResponse;
        if (!alive) return;

        if (!data.ok) {
          setError(data.message ?? "log fetch failed");
        } else {
          setError(null);
          setSize(data.size);
          setMissing(Boolean(data.missing));
          if (data.rotated) {
            setText(data.content);
          } else if (data.content) {
            setText((t) => t + data.content);
          } else if (offsetRef.current === 0 && data.size === 0) {
            // empty file: show nothing, keep polling
          }
          offsetRef.current = data.nextOffset;
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "network error");
      }
      timer = setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [agentId, paused]);

  // Auto-scroll when new content arrives, unless the user scrolled up.
  useEffect(() => {
    if (!autoScroll || !stickyRef.current) return;
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = pre.scrollHeight;
  }, [text, autoScroll]);

  function onScroll() {
    const pre = preRef.current;
    if (!pre) return;
    // "sticky" means the user is within ~40px of the bottom.
    const nearBottom =
      pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
    stickyRef.current = nearBottom;
    if (nearBottom && !autoScroll) setAutoScroll(true);
    if (!nearBottom && autoScroll) setAutoScroll(false);
  }

  function jumpToBottom() {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = pre.scrollHeight;
    stickyRef.current = true;
    setAutoScroll(true);
  }

  // Clear the modal's visible buffer only (file on disk is untouched). We
  // advance the offset to the current file size so the next poll returns
  // only bytes written *after* the click — existing content stays hidden.
  function clearBuffer() {
    offsetRef.current = size;
    setText("");
    setError(null);
    stickyRef.current = true;
    setAutoScroll(true);
  }

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(1000px,92vw)] h-[min(720px,84vh)] rounded-lg p-0 bg-background text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold font-mono">
              {agentAlias} · agent-loop.log
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {missing
                ? "no log yet"
                : `${formatBytes(size)} · polling ${POLL_MS}ms`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={!paused}
                onChange={(e) => setPaused(!e.target.checked)}
              />
              live
            </label>
            <button
              type="button"
              onClick={clearBuffer}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
              aria-label="Clear logs shown in this modal"
              title="Clear modal buffer (file on disk is not touched; new lines will still stream in)"
            >
              <Trash2 className="h-3 w-3" />
              clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded border border-border px-2 py-1 text-xs hover:bg-muted"
              aria-label="Close logs"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </header>
        <div className="relative flex-1 overflow-hidden">
          <pre
            ref={preRef}
            onScroll={onScroll}
            className="h-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 text-slate-100 font-mono text-[12px] leading-[1.45] px-4 py-3"
          >
            {error && (
              <div className="text-red-300 mb-2">[log error] {error}</div>
            )}
            {missing && !text && (
              <div className="text-slate-400">
                No log file yet. Start the agent to generate{" "}
                <code>.orchestrator/agent-loop.log</code>.
              </div>
            )}
            {splitIntoTickSegments(text).map((seg, i) => (
              <div
                key={i}
                className={
                  i > 0
                    ? "mt-4 pt-3 border-t border-dashed border-slate-700"
                    : ""
                }
              >
                {seg}
              </div>
            ))}
          </pre>
          {!autoScroll && (
            <button
              type="button"
              onClick={jumpToBottom}
              className="absolute bottom-3 right-4 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white shadow hover:bg-emerald-700"
            >
              ↓ jump to live
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Split accumulated log text into one segment per tick. Ticks are framed by
// the wrapper's `[ISO] tick begin (continue=N)` line, so we split using a
// positive lookahead that keeps that line as the first line of each segment.
// Anything that appears before the first "tick begin" (sourcing .env,
// agent-loop start, etc.) becomes the leading segment with no top border.
const TICK_BEGIN_SPLITTER =
  /(?=^\[\d{4}-\d{2}-\d{2}T[^\]]+Z\] tick begin)/m;

function splitIntoTickSegments(text: string): string[] {
  if (!text) return [];
  return text.split(TICK_BEGIN_SPLITTER).filter((s) => s.length > 0);
}
