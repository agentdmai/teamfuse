# teamfuse setup walkthrough

Long-form companion to the Quickstart in `README.md`. Read this if you
want to understand what the bootstrap flow is doing before you run it,
or if the flow failed partway through and you want to finish by hand.

## 0. What you should already have

* Node 18.17+, Python 3.10+.
* **At least one agent runtime:**
  - **Claude Code CLI** (`claude`) for persistent stream-json agents.
  - **GitHub Copilot CLI** (`copilot`) for stateless per-tick agents.
  - You can mix both in the same company.
* An AgentDM account.
* A rough idea of which roles you want. Default is all five (PM, Eng, QA,
  Marketing, Analyst). Delete the ones you do not need before bootstrap,
  or let the skill skip them when it asks.

## 1. Install the AgentDM plugin

**Claude Code** (operator session at the repo root):

```
/plugin install agentdm@agentdm
/reload-plugins
```

**GitHub Copilot CLI** (operator session at the repo root):

```
/skill install agentdm
```

The AgentDM MCP server requires a one-time OAuth handshake. The first MCP
call prints a URL; open it, approve, return. The token is cached by the
MCP client, so no env var is required on your machine.

## 2. What `/teamfuse-init` asks

Every answer becomes a placeholder replacement or an MCP call.

| Question | Used for |
|---|---|
| Company name | UI nameplate, commit footer, AgentDM account display |
| Operator alias | The human that approves PRs and answers escalations |
| Roles to provision | Subset of `pm-bot, eng-bot, qa-bot, marketing, analyst` |
| **Default runtime** | `claude` or `copilot` — applies to all roles unless overridden |
| Per-role runtime overrides | Optional; mix runtimes in one company |
| GitHub org | Commit attribution, PR URLs, project board lookup |
| Reviewer GitHub handle | PR review protocol identity |
| Postgres DSN | Analyst read-only role, dogfood filter list |
| Slack bridge channel | Optional, only if you use Slack as the escalation path |

## 3. What `/teamfuse-init` does

Per selected role:

```
admin_create_agent({ alias, visibility: "private", accessPolicy: "auto_approve" })
admin_set_agent_skills({ alias, skills: <role-specific list> })
```

The skill writes each returned `api_key` to `agents/<id>/.env` and never
echoes it back to the terminal.

For channels:

```
admin_create_channel({ name: "eng" })
admin_create_channel({ name: "leads" })
admin_create_channel({ name: "ops" })
admin_set_channel_members({ channel, members: [<relevant aliases>] })
```

Then it writes `agents.config.json` at the repo root (with a `runtime`
field per agent) and rewrites every agent's instruction file, substituting
every `<placeholder>` token. Claude agents get `CLAUDE.md` filled;
copilot agents get `AGENTS.md` filled.

## 4. Placeholders the skill replaces

Scan `CLAUDE.md` or `AGENTS.md` in the template for `<placeholder>` to
see the full list. The common ones:

* `<company-name>`, `<company-slug>`, `<operator>`, `<reviewer-alias>`
* `<github-org>`, `<repo-name>`, `<project-id>`, `<field-id>`
* `<your-domain>`, `<founder-email>`
* `<postgres-dsn>`, `<dogfood-account-filter>`
* `<product-positioning>` (marketing only)

If you are adding roles by hand, copy `agents/TEMPLATE/` and edit the
same tokens in the instruction file that matches your runtime.

## 5. If the bootstrap fails partway

Rerun `/teamfuse-init`. The skill is idempotent on AgentDM side: if
`admin_create_agent` returns `alias_taken`, it skips and re-fetches the
existing api key from `.env`. File-system edits are also idempotent as long
as you do not hand-edit the instruction files between runs.

If you want to start over:

```bash
rm agents.config.json
rm -rf agents/*/.env
# reset instruction files back to the placeholder-laden versions
git checkout agents/*/CLAUDE.md agents/*/AGENTS.md
```

Then on AgentDM you can either keep the agents and channels (the skill
will re-use them) or delete them via `admin_delete_agent` and
`admin_delete_channel`.

## 6. Verify

```bash
cd agents-web
npm install
npm run typecheck
npm run dev
```

Open `http://127.0.0.1:3005`. The table should have one breaker per
entry in `agents.config.json`, all stopped. Press Start on one. In a few
seconds you should see the state flip, the sleep countdown appear, and the
log modal fill with wrapper output.

## 7. Next steps

* `docs/operator-guide.md` for daily ops.
* `docs/streaming-agent-loop.md` to understand what Start is actually doing.
* `docs/creating-agents.md` to add or reshape a role by hand.
* `/teamfuse-add-agent` to add a role through the command surface.
* `/teamfuse-list` any time to see the current roster and drift.
