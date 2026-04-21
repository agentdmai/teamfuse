#!/usr/bin/env node
// Sync the repo's README and docs into the website's content dir so the
// site build can render them. Runs as a prebuild + predev hook.
//
// The website/ dir is self-contained once this script runs; Vercel
// builds without touching sibling paths after sync.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(here, "..");
const repoRoot = path.resolve(websiteRoot, "..");
const contentDir = path.join(websiteRoot, "src", "content");
const docsOutDir = path.join(contentDir, "docs");

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src, dst) {
  const data = await fs.readFile(src, "utf8");
  await ensureDir(path.dirname(dst));
  await fs.writeFile(dst, data, "utf8");
}

async function copyDir(src, dst, { filter = () => true } = {}) {
  await ensureDir(dst);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d, { filter });
    } else if (filter(s)) {
      await copyFile(s, d);
    }
  }
}

async function main() {
  await ensureDir(contentDir);
  await ensureDir(docsOutDir);

  // 1. README.md at the repo root becomes content/readme.md
  await copyFile(
    path.join(repoRoot, "README.md"),
    path.join(contentDir, "readme.md"),
  );

  // 2. All markdown under docs/ (but not docs/screenshots/) becomes
  //    content/docs/<slug>.md. Screenshots dir is images-only and has
  //    its own README that is operator-facing, skip it.
  const docsSrc = path.join(repoRoot, "docs");
  const docEntries = await fs.readdir(docsSrc, { withFileTypes: true });
  for (const entry of docEntries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    await copyFile(
      path.join(docsSrc, entry.name),
      path.join(docsOutDir, entry.name),
    );
  }

  // 3. Copy the logo so the site can serve it directly from /public
  await copyFile(
    path.join(repoRoot, "docs", "logo.svg"),
    path.join(websiteRoot, "public", "logo.svg"),
  );

  // 4. Copy screenshots as static assets
  await copyDir(
    path.join(repoRoot, "docs", "screenshots"),
    path.join(websiteRoot, "public", "screenshots"),
    { filter: (p) => p.endsWith(".svg") || p.endsWith(".png") },
  );

  // 5. Generate llms.txt and llms-full.txt for generative engine
  //    optimisation (Perplexity, ChatGPT browse, Google AI Overviews,
  //    Claude browse, etc). See https://llmstxt.org.
  await writeLlmsTxt();
  await writeLlmsFullTxt();

  console.log("[sync-docs] wrote README and " +
    (await fs.readdir(docsOutDir)).length +
    " docs into src/content/ plus llms.txt and llms-full.txt");
}

async function writeLlmsTxt() {
  const base = "https://teamfuse.dev";
  const docs = [
    ["architecture", "Architecture", "Sub-agent sessions, control plane, messaging layer, and how they connect."],
    ["streaming-agent-loop", "The streaming agent loop", "Why one persistent claude process per agent, stream-json framing, control files, signals, backoff, cost accounting."],
    ["agentdm-integration", "AgentDM integration", "Accounts, aliases, channels, admin vs user MCP tools, OAuth, guardrails."],
    ["board-integration", "Board integration", "GitHub Projects by default. Swap flow for Linear, Jira, Trello, Notion."],
    ["creating-agents", "Creating agents", "Three paths for standing up a new role."],
    ["operator-guide", "Operator guide", "Daily ops on the cabinet UI."],
    ["extending", "Extending teamfuse", "Adding MCP servers, skills, guardrails, optional patterns."],
  ];
  const lines = [
    "# teamfuse",
    "",
    "> Fuse Claude Code agents into a working team. Open source template for running a team of Claude Code agents that DM each other and ship real work, with five starter roles, a local breaker-cabinet dashboard, AgentDM messaging, and GitHub Projects as the default Kanban board.",
    "",
    "teamfuse runs each agent as its own persistent claude process in its own directory, coordinating through a messaging layer rather than a shared Python process. The team is bootstrapped from a single /teamfuse-init command inside Claude Code. The messaging layer defaults to AgentDM but is pluggable. The Kanban board defaults to GitHub Projects but also supports Linear, Jira, Trello, and Notion.",
    "",
    "## Docs",
    "",
    ...docs.map(([slug, title, desc]) => `- [${title}](${base}/docs/${slug}): ${desc}`),
    "",
    "## Repo",
    "",
    "- [Source on GitHub](https://github.com/agentdmai/teamfuse): MIT licensed. Use as a GitHub Template.",
    "",
    "## Related",
    "",
    "- [AgentDM](https://agentdm.ai): the messaging layer teamfuse uses by default.",
    "- [Claude Code](https://docs.anthropic.com/claude/claude-code): the runtime each agent runs on.",
    "- [Model Context Protocol](https://modelcontextprotocol.io): the protocol AgentDM and every per-agent tool speaks.",
    "",
  ];
  await fs.writeFile(
    path.join(websiteRoot, "public", "llms.txt"),
    lines.join("\n"),
    "utf8",
  );
}

async function writeLlmsFullTxt() {
  const readme = await fs.readFile(
    path.join(contentDir, "readme.md"),
    "utf8",
  );
  const docs = await fs.readdir(docsOutDir);
  docs.sort();

  const out = [];
  out.push("# teamfuse");
  out.push("");
  out.push(
    "Full-text bundle for LLM crawlers. Landing page, then every doc page, separated by headings. Lives at https://teamfuse.dev/llms-full.txt. Source repo: https://github.com/agentdmai/teamfuse.",
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push("## README");
  out.push("");
  out.push(readme.trim());
  for (const f of docs) {
    if (!f.endsWith(".md")) continue;
    const body = await fs.readFile(path.join(docsOutDir, f), "utf8");
    out.push("");
    out.push("---");
    out.push("");
    out.push(`## /docs/${f.replace(/\.md$/, "")}`);
    out.push("");
    out.push(body.trim());
  }
  out.push("");
  await fs.writeFile(
    path.join(websiteRoot, "public", "llms-full.txt"),
    out.join("\n"),
    "utf8",
  );
}

main().catch((err) => {
  console.error("[sync-docs] failed:", err);
  process.exit(1);
});
