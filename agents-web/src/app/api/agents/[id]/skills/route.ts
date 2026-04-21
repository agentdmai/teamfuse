import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { getAgent, isAgentId } from "@/lib/agents";

export const dynamic = "force-dynamic";

// Scans <agent.workingDir>/.claude/skills/*/SKILL.md (project-scoped skills)
// and ~/.claude/skills/*/SKILL.md (user-scoped, global). Each skill is a
// directory with a SKILL.md whose YAML frontmatter has `name` and
// `description`. We surface both for the dashboard's skills modal.

interface SkillRef {
  name: string;
  description: string;
  scope: "project" | "user";
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

  const [projectSkills, userSkills] = await Promise.all([
    scanSkillDir(path.join(agent.workingDir, ".claude", "skills"), "project"),
    scanSkillDir(path.join(os.homedir(), ".claude", "skills"), "user"),
  ]);

  return NextResponse.json({
    ok: true,
    agent: id,
    projectSkillsPath: path.join(agent.workingDir, ".claude", "skills"),
    userSkillsPath: path.join(os.homedir(), ".claude", "skills"),
    projectSkills,
    userSkills,
  });
}
