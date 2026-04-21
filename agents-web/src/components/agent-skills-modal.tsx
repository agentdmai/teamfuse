"use client";

import { useEffect, useRef, useState } from "react";
import { X, RefreshCw } from "lucide-react";
import type { AgentId } from "@/lib/agents";

interface Props {
  agentId: AgentId;
  agentAlias: string;
  onClose: () => void;
}

interface SkillRef {
  name: string;
  description: string;
  scope: "project" | "user";
  path: string;
}
interface SkillsResponse {
  ok: boolean;
  projectSkills: SkillRef[];
  userSkills: SkillRef[];
  projectSkillsPath: string;
  userSkillsPath: string;
  message?: string;
}

export function AgentSkillsModal({ agentId, agentAlias, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/api/agents/${agentId}/skills`, {
        cache: "no-store",
      });
      const d = (await res.json()) as SkillsResponse;
      if (!d.ok) setError(d.message ?? "skills fetch failed");
      else {
        setError(null);
        setData(d);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const project = data?.projectSkills ?? [];
  const user = data?.userSkills ?? [];

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(820px,92vw)] h-[min(700px,84vh)] rounded-lg p-0 bg-background text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold font-mono">
              {agentAlias} · skills
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {data
                ? `${project.length} project · ${user.length} user`
                : loading
                  ? "…"
                  : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
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

          <SkillGroup
            title="Project skills"
            hint="agents/<id>/.claude/skills/ — the only skills this agent can invoke"
            path={data?.projectSkillsPath}
            skills={project}
          />

          <section className="mb-2">
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none">
                User skills on disk ({user.length}) — blocked for this agent
              </summary>
              <p className="mt-1">
                The wrapper generates a per-agent{" "}
                <code>.orchestrator/skills-settings.json</code> that denies the
                broad <code>Skill</code> tool and re-allows only the project
                skills above. These live at{" "}
                <code>{data?.userSkillsPath}</code> but are inert in this
                agent&apos;s sessions.
              </p>
            </details>
          </section>
        </div>
      </div>
    </dialog>
  );
}

function SkillGroup({
  title,
  hint,
  path,
  skills,
  mutedIfEmpty = false,
}: {
  title: string;
  hint: string;
  path?: string;
  skills: SkillRef[];
  mutedIfEmpty?: boolean;
}) {
  const empty = skills.length === 0;
  return (
    <section className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-1">
        {title}{" "}
        <span className="text-[10px] text-muted-foreground font-normal normal-case">
          ({skills.length})
        </span>
      </h3>
      <p className="text-[11px] text-muted-foreground mb-2">
        {hint}
        {path && (
          <>
            {" — "}
            <code className="text-[10px]">{path}</code>
          </>
        )}
      </p>

      {empty ? (
        <div
          className={`rounded border border-dashed border-border p-3 text-xs ${
            mutedIfEmpty ? "text-muted-foreground" : ""
          }`}
        >
          No skills installed here.
        </div>
      ) : (
        <ul className="space-y-1">
          {skills.map((s) => (
            <li
              key={`${s.scope}:${s.name}`}
              className="rounded border border-border p-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">{s.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.scope}
                </span>
              </div>
              {s.description && (
                <p className="mt-1 text-[12px] text-muted-foreground leading-snug">
                  {truncate(s.description, 320)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
