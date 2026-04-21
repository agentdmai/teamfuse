---
name: teamfuse-init
description: Bootstrap a new Claude Code agent company from the teamfuse template. Prints the teamfuse banner, asks for company specifics, provisions the AgentDM grid via admin MCP tools, writes agents.config.json, and fills placeholders in per-agent CLAUDE.md files. Idempotent. Run once at the start of a new project. Trigger on /teamfuse-init, /teamfuse init, "bootstrap my teamfuse company", or similar.
trigger_keywords: [teamfuse-init, teamfuse init, bootstrap, provision, set-up-company, /teamfuse-init]
---

# teamfuse-init

## How to run this skill

Start immediately. Your **first** reply must be (1) the banner, then
(2) the precondition check, then (3) the first `AskUserQuestion` in
Step 1. Nothing before the banner.

Do **not** do any of these before starting:

* Do not explore or map the repo. Everything you need to act is in
  this file. File paths the flow touches are named explicitly below;
  no other reads are required.
* Do not summarise the skill back to the operator. Do not describe
  what you are about to do. Do not ask for confirmation before
  starting. The operator already confirmed by invoking
  `/teamfuse-init`.
* Do not run exploratory `Glob`, `Grep`, `Bash ls`, or `Task` agents.
  The only tool you need for step-0 is `AskUserQuestion`. MCP admin
  calls come later.

If something is missing (preconditions fail, an MCP error code), stop
and report the exact failure. Do not improvise a workaround.

## Banner

Print this verbatim before anything else.

```
 ████████╗███████╗ █████╗ ███╗   ███╗███████╗██╗   ██╗███████╗███████╗
 ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██║   ██║██╔════╝██╔════╝
    ██║   █████╗  ███████║██╔████╔██║█████╗  ██║   ██║███████╗█████╗
    ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║██╔══╝  ██║   ██║╚════██║██╔══╝
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████║███████╗
    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝╚══════╝

        Fuse Claude Code agents into a working team.  init flow.
```

You (Claude) are standing up a new agent company from the teamfuse
template. Run inside the operator's Claude session at the repo root.
The AgentDM MCP server must be connected (the `admin_*` tools need to
be visible). If they are not, stop and print:

```
AgentDM MCP server not connected.
  1. /plugin install agentdm@agentdm
  2. /reload-plugins
  3. authorise the OAuth flow in the browser
  4. rerun /teamfuse-init
```

## Preconditions

1. `admin_create_agent` is a callable tool.
2. `agents.config.example.json` exists at the repo root.
3. CWD is the repo root.

## Idempotency

This skill is safe to rerun.

* `admin_create_agent`: on `alias_taken`, skip and reuse the existing
  `api_key` from `agents/<id>/.env`. If the `.env` has no key, tell the
  operator they must either delete the agent on AgentDM and rerun, or
  paste in a valid key.
* `admin_create_channel`: on `channel_taken`, skip.
* `admin_set_agent_skills` and `admin_set_channel_members`: idempotent
  by design (atomic replace).
* Placeholder substitution in `CLAUDE.md` and `MEMORY.md`: if no
  `<token>` remains for a value, it is already filled.

## Flow

### Step 1: gather inputs

Use `AskUserQuestion` one question at a time.

Mandatory:

* **Company name.** Used in `agents.config.json.companyName`, UI
  nameplate, commit footers, docs substitutions.
* **Company slug.** Default: company name lowercased with non-word
  characters replaced by `-`. Used in the commit footer identity.
* **Your domain.** For the commit footer email, e.g. `acme.dev`.
* **Operator alias.** The AgentDM alias the operator responds as.
  Default: `@operator`.
* **Roles to provision.** Subset of `pm-bot, eng-bot, qa-bot,
  marketing, analyst`. Default: all five.

Conditional:

* **GitHub org.** If eng, pm, or qa are selected.
* **Reviewer GitHub handle.** If eng, pm, or qa.
* **Project board URL.** If pm is selected. Optional. If given, resolve
  the project node ID via `gh api graphql` later.
* **Postgres DSN for `analyst_ro`.** If analyst is selected. Optional.
* **Dogfood account names and email domain.** If analyst is selected.
* **Landing repo name.** If marketing is selected.
* **Product positioning.** If marketing is selected. One sentence.

### Step 2: create agents

For each selected role:

```
admin_create_agent({
  alias: "@<role-alias>",
  visibility: "private",
  accessPolicy: "auto_approve",
  description: "<role> for <company name>"
})
```

Capture `api_key`. Do not echo it. Write to `agents/<id>/.env` (create
from `.env.example` if missing) as `AGENTDM_TOKEN=<key>`.

### Step 3: create channels

In order: `#eng`, `#leads`, `#ops`. Skip any that already exist.

Members (via `admin_set_channel_members`):

* `#eng`: every selected role.
* `#leads`: `@pm-bot` (if selected) plus the operator alias.
* `#ops`: every selected role plus the operator alias.

If the operator alias does not yet exist on AgentDM, skip adding it
silently.

### Step 4: assign skills

Per role, via `admin_set_agent_skills`. Starter lists:

* `@pm-bot`: roadmap-curation, spec-writing, wip-enforcement,
  release-announcements, queue-driving
* `@eng-bot`: typescript, release-management, code-review
* `@qa-bot`: vitest, playwright, api-smoke, release-verification
* `@marketing`: content-writing, seo, landing-copy, social-posting,
  browser-task
* `@analyst`: postgres-readonly, metrics-digest, anomaly-detection,
  board-audit

### Step 5: write agents.config.json

Based on `agents.config.example.json`, trimmed to selected roles and
with `companyName` filled in.

### Step 6: fill placeholders

Global replace in each selected role's `agents/<id>/CLAUDE.md` and
`agents/<id>/MEMORY.md`:

| Token | Value |
|---|---|
| `<company-name>` | company name |
| `<company-slug>` | derived slug |
| `<operator>` | operator alias |
| `<reviewer-alias>` | reviewer GitHub handle |
| `<github-org>` | github org |
| `<your-domain>` | the domain |
| `<project-id>`, `<status-field-id>`, `<agent-field-id>`, ... | via `gh api graphql` if the board URL was given, else leave as TODO |
| `<repos-root>` | `./repos` |
| `<default-branch>` | `main` unless asked |
| `<postgres-dsn>` | the DSN if given |
| `<dogfood-account-names>` | list |
| `<timezone>` | `date +%Z` |
| `<landing-repo-name>` | from step 1 |
| `<product-positioning>` | from step 1 |

Unfilled tokens stay as `<token>` and get appended to a TODO list the
summary prints.

### Step 7: print the summary

```
teamfuse init complete.

Agents: <count> provisioned, api keys written to agents/<id>/.env
Channels: #eng, #leads, #ops
agents.config.json: written

Next:
  cd agents-web
  cp .env.example .env.local
  npm install
  npm run dev

Open http://127.0.0.1:3005. Flip each breaker.
```

If any step failed mid-flight, print the step, the error code, and
how to recover. Never claim success on a partial run.

## Errors to handle

* `recipient_not_found` when setting channel members: the alias failed
  to create in step 2. Name which and stop.
* `agent_limit_reached`: free plan exhausted. Point at `app.agentdm.ai`
  to upgrade and rerun.
* `private_agent`: rare; the operator is on a different account.
  Surface as is.
* File write errors: report the path and exit. No partial writes.

## Never

* Echo any `api_key` to the terminal.
* Overwrite a non-empty `.env` without confirming.
* Commit `agents.config.json` or any `.env` as part of the flow.
* Auto-fill a placeholder you do not have a real value for.
