# Extending the template

## Adding an MCP server

Edit the agent's `.mcp.json`. Add a new entry under `mcpServers`. For
a stdio server:

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GH_TOKEN}" }
}
```

For a remote server:

```json
"custom-remote": {
  "command": "npx",
  "args": [
    "-y", "mcp-remote",
    "https://your.endpoint/mcp",
    "--header", "Authorization: Bearer ${YOUR_TOKEN}"
  ]
}
```

Add the env var to `agents/<id>/.env` and to `.env.example`. Restart
the agent so the wrapper respawns claude with the new config.

## Adding a skill

Skills are reusable procedures an agent can invoke. Put them under
`agents/<id>/.claude/skills/<skill-name>/SKILL.md`. The wrapper's
`session-settings.json` auto-grants `Skill(<name>)` and
`Skill(<name> *)` permissions and denies any skill not in the agent's
own folder.

A minimal skill:

```markdown
---
description: Short description used by Claude to decide when to fire.
trigger_keywords: [keyword1, keyword2]
---

# Skill body

Steps, examples, conventions. The skill body is loaded into context
only when Claude invokes it, so it can be long.
```

## Custom guardrails

Call the admin MCP tool:

```
admin_list_guardrail_providers()
admin_set_agent_guardrails({
  alias: "@pm-bot",
  guardrails: ["pii-redactor", "profanity-filter"]
})
```

Guardrails apply to outbound AgentDM messages only. Failures block
delivery, so an over-aggressive guardrail will make your agent look
mute. Test in a staging account first.

## Adding a Gmail intake (optional pattern)

Some companies want their PM to triage an inbound support mailbox.
This template does not ship the Gmail integration, because the OAuth
setup is per-operator and because the triage rules are company-shaped.
Here is the outline if you want to add it:

1. Install the Gmail MCP server of your choice in `@pm-bot`'s
   `.mcp.json`.
2. Add `GMAIL_*` credentials to `agents/pm-bot/.env`.
3. Store the OAuth client JSON and token JSON under
   `agents/pm-bot/google/`. Add both to `.gitignore`.
4. Write `agents/sop/gmail-triage-rules.md` with your routing rules
   (bugs to eng, feature requests to backlog, legal to the operator,
   etc.).
5. Update `agents/pm-bot/CLAUDE.md` with a step in the polling loop
   that calls `read_emails` every N ticks and routes per the SOP.

## Adding a browser-driven role (paid ads, admin panels)

The template already has `chrome: true` wired in for the marketing
agent. The wrapper passes `--chrome` to claude when `CHROME=1` is in
the environment (the supervisor sets it based on the
`agents.config.json` flag). Caveats:

* Only one agent at a time can have `chrome: true`. They all share the
  host's Chrome instance.
* Claude-in-Chrome is the extension providing the browser. The
  operator must be logged into the target sites in that Chrome profile
  for the agent to pick up their sessions.

## Swapping the messaging layer

If you do not want to use AgentDM:

1. Replace the `agentdm` entry in every `.mcp.json` with your chosen
   server (Slack MCP, Discord MCP, a custom one).
2. Rewrite each `CLAUDE.md` to call the equivalent tools. The shape
   changes (`post_message`, `read_channel`, etc.).
3. Remove the bootstrap skill's AgentDM admin calls and replace them
   with provisioning for the new layer.
4. Update `docs/agentdm-integration.md` to point at the new layer.

The streaming agent loop, the SOPs, the control plane, and the
agent directory contract all survive the swap unchanged. AgentDM is
replaceable, the rest of the template is not about it.

## Per-repo CLAUDE.md

If the eng agent edits multiple repos, put a lightweight `CLAUDE.md`
in each repo's root with repo-specific conventions (ESM vs CommonJS,
test runner, which files to always regenerate). The eng agent's
top-level `CLAUDE.md` in `agents/eng-bot/` tells it to look for those.
