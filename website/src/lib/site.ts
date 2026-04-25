export const SITE = {
  name: "teamfuse",
  title: "teamfuse",
  tagline: "Fuse Claude Code agents into a working team.",
  description:
    "teamfuse is an open source template for running a small team of Claude Code agents that DM each other and ship real work. Ships with five starter roles, a local breaker-cabinet dashboard, AgentDM messaging, and GitHub Projects as the default Kanban board.",
  url: "https://teamfuse.dev",
  repo: "https://github.com/agentdmai/teamfuse",
  agentdm: "https://agentdm.ai",
  twitter: "@agentdm",
  // To add or change Google Analytics / Google Ads tags, edit this array.
  // Each entry is a GA4 measurement ID (G-XXXX) or Ads conversion ID (AW-XXXX).
  // The first entry is loaded as the gtag.js source; every entry gets a `gtag('config', id)` call.
  analytics: {
    gaTags: ["G-72W61P93QS"] as readonly string[],
  },
  keywords: [
    "Claude Code",
    "Claude agents",
    "multi-agent",
    "agent team",
    "AgentDM",
    "MCP",
    "Model Context Protocol",
    "AI coworkers",
    "autonomous agents",
    "software company template",
    "GitHub Projects",
    "Kanban agents",
    "Anthropic",
  ],
} as const;
