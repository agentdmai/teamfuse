import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAgent, isAgentId, type AgentDefinition } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Max bytes returned per file read (512 KB). Anything bigger is truncated and
// flagged; the UI surfaces the full size so the user knows.
const MAX_FILE_BYTES = 512 * 1024;

// Load modes describe how each file ends up in the agent's context window:
//   auto-cwd      — Claude Code auto-loads CLAUDE.md from cwd + parents
//   policy        — agent reads it per the tick prompt / CLAUDE.md policy
//   skill-desc    — only the skill NAME + description are injected; body loads on invoke
//   mcp-config    — this file configures MCP servers; their tool SCHEMAS load into context
//   synthetic     — not a file on disk; the tick prompt string the wrapper injects
//   referenced    — CLAUDE.md mentions the path; agent reads on demand
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
  absPath: string | null; // null for synthetic
  size: number;
  exists: boolean;
  description?: string;
}

function sopDir(): string {
  return path.resolve(
    process.cwd(),
    "..",
    "agents",
    "sop",
  );
}

// The wrapper script lives next to the web app at
// <repo>/agents-web/scripts/agent-loop.sh. process.cwd() is the Next.js
// server's working dir which in dev runs from agents-web/.
function wrapperPath(): string {
  return path.resolve(process.cwd(), "scripts", "agent-loop.sh");
}

async function safeStat(
  p: string,
): Promise<{ exists: boolean; size: number }> {
  try {
    const st = await fs.stat(p);
    return { exists: st.isFile(), size: st.size };
  } catch {
    return { exists: false, size: 0 };
  }
}

// Parse CLAUDE.md for `../sop/<foo>.md` style references so we can surface
// the SOPs this agent might reach for. Best-effort regex; falls back to an
// empty list on read failure.
async function referencedSopFiles(claudeMdPath: string): Promise<string[]> {
  let text: string;
  try {
    text = await fs.readFile(claudeMdPath, "utf8");
  } catch {
    return [];
  }
  const re = /\.\.\/sop\/([A-Za-z0-9._-]+\.md)/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) names.add(m[1]);
  return Array.from(names).sort();
}

async function buildEntries(agent: AgentDefinition): Promise<ContextEntry[]> {
  const cwd = agent.workingDir;
  const entries: ContextEntry[] = [];

  // 1. Auto-loaded CLAUDE.md from cwd
  const claudeCwd = path.join(cwd, "CLAUDE.md");
  const claudeCwdStat = await safeStat(claudeCwd);
  entries.push({
    id: "claude-md-cwd",
    label: "CLAUDE.md",
    category: "Auto-loaded",
    loadMode: "auto-cwd",
    absPath: claudeCwd,
    size: claudeCwdStat.size,
    exists: claudeCwdStat.exists,
    description: "Agent's primary instructions (auto-loaded by Claude Code from cwd)",
  });

  // 1a. User-global CLAUDE.md at ~/.claude/CLAUDE.md — if present, it's
  // ALWAYS injected into every Claude Code session regardless of cwd.
  const claudeGlobal = path.join(os.homedir(), ".claude", "CLAUDE.md");
  const claudeGlobalStat = await safeStat(claudeGlobal);
  if (claudeGlobalStat.exists) {
    entries.push({
      id: "claude-md-global",
      label: "~/.claude/CLAUDE.md",
      category: "Auto-loaded",
      loadMode: "auto-cwd",
      absPath: claudeGlobal,
      size: claudeGlobalStat.size,
      exists: true,
      description: "User-global Claude Code instructions (applied to every session)",
    });
  }

  // 2. MEMORY.md — read at tick start per the wrapper's TICK_PROMPT
  const memoryPath = path.join(cwd, "MEMORY.md");
  const memoryStat = await safeStat(memoryPath);
  entries.push({
    id: "memory-md",
    label: "MEMORY.md",
    category: "Scratchpad",
    loadMode: "policy",
    absPath: memoryPath,
    size: memoryStat.size,
    exists: memoryStat.exists,
    description: "Bounded durable-facts scratchpad, read every tick (budget 2 KB)",
  });

  // 3. Synthetic: the tick prompt text the wrapper injects on every claude -p
  entries.push({
    id: "tick-prompt",
    label: "tick prompt (wrapper)",
    category: "Auto-loaded",
    loadMode: "synthetic",
    absPath: wrapperPath(),
    size: 0, // extracted dynamically in content endpoint
    exists: true,
    description: "TICK_PROMPT default from agent-loop.sh — injected on every tick",
  });

  // 4. MCP config — configures servers whose TOOL SCHEMAS become part of context
  const mcpPath = path.join(cwd, ".mcp.json");
  const mcpStat = await safeStat(mcpPath);
  if (mcpStat.exists) {
    entries.push({
      id: "mcp-config",
      label: ".mcp.json",
      category: "MCP config",
      loadMode: "mcp-config",
      absPath: mcpPath,
      size: mcpStat.size,
      exists: true,
      description: "MCP server definitions; each server's tool schemas load into context",
    });
  }

  // 4a. tools.json snapshot — what the agent last reported as its live MCP set
  const toolsPath = path.join(cwd, ".orchestrator", "tools.json");
  const toolsStat = await safeStat(toolsPath);
  if (toolsStat.exists) {
    entries.push({
      id: "tools-json",
      label: ".orchestrator/tools.json",
      category: "MCP config",
      loadMode: "mcp-config",
      absPath: toolsPath,
      size: toolsStat.size,
      exists: true,
      description: "Agent-reported snapshot of live MCP tools this tick",
    });
  }

  // 5. Skills — SKILL.md files under .claude/skills/*/. Only the name +
  // description enter context until a skill is invoked; the full body loads
  // on demand. Still worth showing so you know what's available.
  const skillsRoot = path.join(cwd, ".claude", "skills");
  try {
    const dirs = await fs.readdir(skillsRoot, { withFileTypes: true });
    for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!d.isDirectory()) continue;
      const skillMd = path.join(skillsRoot, d.name, "SKILL.md");
      const st = await safeStat(skillMd);
      if (!st.exists) continue;
      entries.push({
        id: `skill:${d.name}`,
        label: `${d.name}/SKILL.md`,
        category: `Skills (body loads on invoke)`,
        loadMode: "skill-desc",
        absPath: skillMd,
        size: st.size,
        exists: true,
      });
    }
  } catch {
    // no skills dir — ignore
  }

  // 6. SOP files referenced from CLAUDE.md. These are lazy-reads; surface
  // them so the user understands what the agent MIGHT pull in.
  const sops = await referencedSopFiles(claudeCwd);
  for (const name of sops) {
    const abs = path.join(sopDir(), name);
    const st = await safeStat(abs);
    entries.push({
      id: `sop:${name}`,
      label: `../sop/${name}`,
      category: "Referenced SOPs (lazy)",
      loadMode: "referenced",
      absPath: abs,
      size: st.size,
      exists: st.exists,
    });
  }

  return entries;
}

// Read the default TICK_PROMPT out of agent-loop.sh. The shell default is
// defined as `TICK_PROMPT="${TICK_PROMPT:-...}"`; we extract the body between
// the `:-` and the matching closing quote.
async function readTickPrompt(): Promise<string> {
  let text: string;
  try {
    text = await fs.readFile(wrapperPath(), "utf8");
  } catch (err) {
    return `(failed to read wrapper: ${(err as Error).message})`;
  }
  const start = text.indexOf('TICK_PROMPT="${TICK_PROMPT:-');
  if (start < 0) return "(TICK_PROMPT default not found in wrapper)";
  const bodyStart = start + 'TICK_PROMPT="${TICK_PROMPT:-'.length;
  // Find the first unescaped closing `}"` — that's the end of the default.
  const end = text.indexOf('}"', bodyStart);
  if (end < 0) return "(TICK_PROMPT terminator not found)";
  return text.slice(bodyStart, end);
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
  const entries = await buildEntries(agent);

  const url = new URL(req.url);
  const entryId = url.searchParams.get("entry");
  if (!entryId) {
    // List mode
    return NextResponse.json({
      ok: true,
      agent: id,
      entries: entries.map(({ id, label, category, loadMode, size, exists, description }) => ({
        id,
        label,
        category,
        loadMode,
        size,
        exists,
        description,
      })),
    });
  }

  // Content mode
  const match = entries.find((e) => e.id === entryId);
  if (!match) {
    return NextResponse.json(
      { ok: false, message: `unknown entry: ${entryId}` },
      { status: 404 },
    );
  }

  // Synthetic entry — extract tick prompt from wrapper
  if (match.loadMode === "synthetic" && match.id === "tick-prompt") {
    const content = await readTickPrompt();
    return NextResponse.json({
      ok: true,
      agent: id,
      entry: match,
      path: match.absPath,
      content,
      size: Buffer.byteLength(content, "utf8"),
      truncated: false,
    });
  }

  if (!match.absPath || !match.exists) {
    return NextResponse.json({
      ok: true,
      agent: id,
      entry: match,
      path: match.absPath,
      content: "",
      size: 0,
      truncated: false,
      missing: true,
    });
  }

  try {
    const st = await fs.stat(match.absPath);
    const readLen = Math.min(st.size, MAX_FILE_BYTES);
    const fh = await fs.open(match.absPath, "r");
    try {
      const buf = Buffer.alloc(readLen);
      await fh.read(buf, 0, readLen, 0);
      return NextResponse.json({
        ok: true,
        agent: id,
        entry: match,
        path: match.absPath,
        content: buf.toString("utf8"),
        size: st.size,
        truncated: st.size > readLen,
      });
    } finally {
      await fh.close();
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
