import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "src", "content");
const DOCS_DIR = path.join(CONTENT_DIR, "docs");
const README_PATH = path.join(CONTENT_DIR, "readme.md");

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  path: string;
}

export interface Doc extends DocMeta {
  body: string;
}

// Human-friendly titles and short descriptions for each doc. Synced
// with the sidebar on the docs index and the metadata generator.
const DOC_INDEX: Record<
  string,
  { title: string; description: string; order: number }
> = {
  architecture: {
    title: "Architecture",
    description:
      "Three pieces and three processes per agent: sub-agent sessions, the control plane, and the AgentDM messaging bus. How they connect and what flows between them.",
    order: 1,
  },
  "streaming-agent-loop": {
    title: "The streaming agent loop",
    description:
      "Deep explainer on scripts/agent-loop.py. Why one persistent claude process per agent, stream-json stdin/stdout, the .orchestrator/ control files, signal handling, backoff sleep, crash recovery, and per-tick cost accounting.",
    order: 2,
  },
  "agentdm-integration": {
    title: "AgentDM integration",
    description:
      "Accounts, aliases, channels, admin vs user MCP tools, the OAuth flow, error codes, and guardrails. How AgentDM fits under teamfuse and what would need to change to swap the messaging layer.",
    order: 3,
  },
  "board-integration": {
    title: "Board integration",
    description:
      "GitHub Projects by default. Swap flow for Linear, Jira, Trello, and Notion. The card model every agent reads and writes, and what stays the same across providers.",
    order: 4,
  },
  "creating-agents": {
    title: "Creating agents",
    description:
      "Three paths for standing up a new role: edit a starter, copy agents/TEMPLATE/, or replace the whole lineup. What belongs in CLAUDE.md vs MEMORY.md.",
    order: 5,
  },
  "operator-guide": {
    title: "Operator guide",
    description:
      "Daily ops. The cabinet UI, starting and stopping, waking, reading logs, the context and skills modals, the MCP tools modal, usage windows, and what to do when something looks wrong.",
    order: 6,
  },
  extending: {
    title: "Extending teamfuse",
    description:
      "Adding MCP servers, role-scoped skills, custom guardrails, optional patterns like Gmail intake, browser-driven roles, and swapping the messaging layer entirely.",
    order: 7,
  },
};

function fallbackMeta(slug: string): { title: string; description: string; order: number } {
  const title = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return { title, description: "", order: 999 };
}

export async function listDocs(): Promise<DocMeta[]> {
  const entries = await fs.readdir(DOCS_DIR);
  const docs: DocMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const slug = entry.replace(/\.md$/, "");
    const meta = DOC_INDEX[slug] ?? fallbackMeta(slug);
    docs.push({
      slug,
      title: meta.title,
      description: meta.description,
      path: `/docs/${slug}`,
    });
  }
  return docs.sort(
    (a, b) =>
      (DOC_INDEX[a.slug]?.order ?? 999) - (DOC_INDEX[b.slug]?.order ?? 999),
  );
}

export async function getDoc(slug: string): Promise<Doc | null> {
  try {
    const raw = await fs.readFile(path.join(DOCS_DIR, `${slug}.md`), "utf8");
    const { content } = matter(raw);
    const meta = DOC_INDEX[slug] ?? fallbackMeta(slug);
    return {
      slug,
      title: meta.title,
      description: meta.description,
      path: `/docs/${slug}`,
      body: content,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function getReadme(): Promise<string> {
  const raw = await fs.readFile(README_PATH, "utf8");
  const { content } = matter(raw);
  return content;
}

// For SEO and GEO, extract the first paragraph of README plus docs into
// a short summary string. Used in llms-full.txt and other metadata.
export async function getReadmeFirstParagraph(): Promise<string> {
  const readme = await getReadme();
  const stripped = readme
    .replace(/<p[^>]*>[\s\S]*?<\/p>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#.*$/gm, "")
    .replace(/^```[\s\S]*?```$/gm, "")
    .trim();
  const firstPara = stripped.split(/\n\s*\n/)[0] ?? "";
  return firstPara.replace(/\s+/g, " ").trim();
}
