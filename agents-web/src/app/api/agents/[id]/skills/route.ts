import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAgent, isAgentId } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Scans project-scoped skill directories and ~/.claude/skills (user-scoped).
//
// For claude agents, the only project skill dir is:
//   <workingDir>/.claude/skills/
//
// For copilot agents, all three locations are loaded automatically by the CLI:
//   <workingDir>/.claude/skills/   ← shared with claude; preferred
//   <workingDir>/.github/skills/
//   <workingDir>/.agents/skills/
//
// User-scoped skills (~/.claude/skills/) are available for claude; for copilot
// the equivalent personal skills dirs are ~/.claude/skills/, ~/.github/skills/,
// and ~/.agents/skills/, but we only surface ~/.claude/skills/ here (same data).

interface SkillRef {
  name: string;
  description: string;
  scope: "project" | "user";
  /** Relative sub-path within workingDir, e.g. ".claude/skills" */
  skillsDir: string;
  path: string;
}

function parseFrontmatter(text: string): { name: string; description: string } {
  // Matches:  ---\n key: val\n key2: val2\n ---
  const m = text.match(/^---\s*([\s\S]*?)\s*---/);
  if (!m) return { name: "", description: "" };
  const body = m[1];
  // YAML is tiny; a couple of top-level keys we care about.
  let name = "";
  let description = "";
  // Multiline scalars (folded) aren't expected here but handle the simple
  // quoted / unquoted single-line case.
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const mm = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!mm) continue;
    const key = mm[1];
    let val = mm[2].trim();
    // Strip surrounding quotes, if any.
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "name") name = val;
    else if (key === "description") description = val;
  }
  return { name, description };
}

async function scanSkillDir(
  dir: string,
  scope: "project" | "user",
  skillsDir: string,
): Promise<SkillRef[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return [];
    throw err;
  }
  const out: SkillRef[] = [];
  for (const name of entries) {
    const full = path.join(dir, name);
    const skillFile = path.join(full, "SKILL.md");
    try {
      const text = await fs.readFile(skillFile, "utf8");
      const fm = parseFrontmatter(text);
      out.push({
        name: fm.name || name,
        description: fm.description || "",
        scope,
        skillsDir,
        path: full,
      });
    } catch {
      // Not a skill dir (no SKILL.md) or unreadable — skip.
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function GET(
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
  const agent = getAgent(id)!;
  const isCopilot = agent.runtime === "copilot";

  // Project skill directories to scan.
  const projectDirs = [".claude/skills"];
  if (isCopilot) {
    projectDirs.push(".github/skills", ".agents/skills");
  }

  const projectSkillGroups = await Promise.all(
    projectDirs.map((rel) =>
      scanSkillDir(path.join(agent.workingDir, rel), "project", rel),
    ),
  );
  // Flatten, deduplicate by name (first occurrence wins if same skill appears in multiple dirs).
  const seen = new Set<string>();
  const projectSkills: SkillRef[] = [];
  for (const group of projectSkillGroups) {
    for (const s of group) {
      if (!seen.has(s.name)) {
        seen.add(s.name);
        projectSkills.push(s);
      }
    }
  }

  const userSkills = await scanSkillDir(
    path.join(os.homedir(), ".claude", "skills"),
    "user",
    "~/.claude/skills",
  );

  return NextResponse.json({
    ok: true,
    agent: id,
    runtime: agent.runtime,
    projectSkillDirs: projectDirs.map((rel) => path.join(agent.workingDir, rel)),
    userSkillsPath: path.join(os.homedir(), ".claude", "skills"),
    projectSkills,
    userSkills,
  });
}
