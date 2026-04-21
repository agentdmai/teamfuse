---
name: bootstrap-company
description: Provision a new Claude Code agent company end to end. Creates AgentDM agents and channels, writes agents.config.json, fills placeholders in per-agent CLAUDE.md files, and drops api keys into per-agent .env files. Run once at the start of a new project.
trigger_keywords: [bootstrap, provision, set-up-company, bootstrap-company, /bootstrap-company]
---

# Bootstrap-company skill

You (Claude) are helping the operator stand up a new Claude Code agent
company from this template. This skill runs in the operator's Claude
session at the repo root. The AgentDM MCP server must be connected
(the admin_* tools need to be visible); if not, say so and stop.

## Preconditions

Fail fast if any of these is missing:

1. `admin_create_agent` is not a callable tool. Tell the operator:
   "Install the AgentDM plugin first: `/plugin install agentdm@agentdm`,
   then `/reload-plugins`, then authorise the OAuth flow, then re-run
   `/bootstrap-company`."
2. `agents.config.example.json` exists at the repo root. If not, the
   operator is not in a valid template checkout.
3. The operator is in the repo root (CWD ends in the template directory).

## Idempotency

This skill can be re-run safely. For each resource it would create:

* `admin_create_agent`: if the call returns `alias_taken`, assume the
  alias exists and skip, reusing the existing `api_key` if the agent's
  `.env` already has one. If `.env` has no key, the operator must
  recreate the agent (delete + create) or provide the key manually.
* `admin_create_channel`: if `channel_taken`, skip and move on.
* `admin_set_agent_skills` and `admin_set_channel_members`: idempotent
  by design (atomic replace).
* Placeholder replacement in `CLAUDE.md`: idempotent. If no `<token>`
  remains, the file is already filled.

## Flow

### Step 1: gather inputs

Use `AskUserQuestion` to ask the questions in order. Do not batch them
into a single giant prompt; the operator should see each answered
before the next is asked.

Mandatory:

* **Company name.** Free text. Used in `agents.config.json.companyName`,
  the UI nameplate, commit footers, docs substitutions. Example: "Acme".
* **Company slug.** Defaults to company name, lowercased, non-word
  characters replaced with `-`. Used in commit-attribution footer.
  Example: "acme".
* **Your domain.** The domain for commit footer emails, e.g. `acme.dev`.
* **Operator alias.** The AgentDM alias the operator responds as. The
  PR-review protocol and escalation rules route messages to this
  handle. Default: `@operator`.
* **Roles to provision.** Default: all five starter roles.
  `pm-bot, eng-bot, qa-bot, marketing, analyst`. Let the operator
  deselect any they do not want.

Conditional (only if that role is in the selection):

* **GitHub org.** If eng, pm, or qa are selected. Where their bot
  account lives. Example: `acme-agents`. Store as `<github-org>`.
* **Reviewer GitHub handle.** If eng, pm, or qa. The human account that
  posts approval tokens on PRs. Example: `alice-acme`.
* **Project board URL.** If pm is selected. Optional. If given,
  extract the project node ID later via `gh api graphql`.
* **Postgres DSN for analyst_ro.** If analyst is selected. Optional.
  If skipped, the analyst directory ships without `.env` populated.
* **Dogfood account names and email domain.** If analyst is selected.
  Plain list of the company's own accounts, plus the email domain
  (e.g. `@acme.dev`) that identifies internal users.
* **Landing repo name.** If marketing is selected. Example:
  `acme-landing`.

### Step 2: create agents

For each selected role, call:

```
admin_create_agent({
  alias: "@<role-alias>",    // @pm-bot, @eng-bot, ...
  visibility: "private",
  accessPolicy: "auto_approve",
  description: "<role> for <company name>"
})
```

Capture `api_key`. Do not echo it to the terminal. Write it to
`agents/<id>/.env` by creating the file from `.env.example` if needed
and setting `AGENTDM_TOKEN=<key>`.

On `alias_taken`: check if `agents/<id>/.env` already has a non-empty
`AGENTDM_TOKEN`. If yes, proceed. If no, tell the operator you cannot
continue until they recreate the agent (and the token) or paste one in.

### Step 3: create channels

Create these in order: `#eng`, `#leads`, `#ops`. Skip any that already
exist (`channel_taken`).

Set members via `admin_set_channel_members`:

* `#eng`: every agent selected (all five by default).
* `#leads`: `@pm-bot` plus the operator alias. Other roles stay out.
* `#ops`: every agent selected plus the operator alias.

If the operator alias does not exist on AgentDM yet, skip adding it
silently. The operator's presence on the grid is optional.

### Step 4: assign skills

For each selected role, call:

```
admin_set_agent_skills({ alias, skills: <role-specific list> })
```

Starter skill lists:

* `@pm-bot`: roadmap-curation, spec-writing, wip-enforcement,
  release-announcements, queue-driving
* `@eng-bot`: typescript, release-management, code-review (or adjust
  to the operator's primary language)
* `@qa-bot`: vitest, playwright, api-smoke, release-verification
* `@marketing`: content-writing, seo, landing-copy, social-posting,
  browser-task
* `@analyst`: postgres-readonly, metrics-digest, anomaly-detection,
  board-audit

### Step 5: write agents.config.json

Write `agents.config.json` at the repo root based on
`agents.config.example.json`, keeping only the selected roles and
filling in `companyName`. Do not commit this file; `.gitignore` already
excludes it.

### Step 6: fill placeholders

For each selected role's `agents/<id>/CLAUDE.md` and
`agents/<id>/MEMORY.md`, do a global replace of every placeholder with
the real value collected in step 1.

Placeholder map (expand as needed):

| Token | Value |
|---|---|
| `<company-name>` | company name |
| `<company-slug>` | slug derived from company name |
| `<operator>` | operator alias |
| `<reviewer-alias>` | reviewer GitHub handle, `@`-prefixed if used in prose |
| `<github-org>` | github org |
| `<your-domain>` | your domain |
| `<project-id>`, `<status-field-id>`, `<agent-field-id>`, etc. | fetched via `gh api graphql` if the board URL was provided, else left as a TODO |
| `<repos-root>` | `./repos` |
| `<default-branch>` | default to `main`, ask if different |
| `<postgres-dsn>` | the DSN if provided |
| `<dogfood-account-names>` | comma-separated list |
| `<timezone>` | derive from `date +%Z` or ask |
| `<landing-repo-name>` | from step 1 |
| `<product-positioning>` | ask once |

If any placeholder value is not available (operator skipped the
question), leave the `<token>` in place and append a TODO to the file
so the operator notices.

### Step 7: print the summary

Tell the operator:

```
Bootstrap complete.

Agents created on AgentDM: <count>, stored in agents/<id>/.env
Channels created: #eng, #leads, #ops
agents.config.json written at the repo root

Next steps:
  cd agents-web
  cp .env.example .env.local
  npm install
  npm run dev

Open http://127.0.0.1:3005 and press Start on each breaker.
```

If any step failed mid-flight, say which step, what the error code was,
and what to do next. Do not claim success on a partial run.

## Errors you must handle

* `recipient_not_found` while setting channel members: the alias does
  not exist yet because step 2 failed. Say which alias and stop.
* `agent_limit_reached`: the AgentDM free plan is full. Point the
  operator at `app.agentdm.ai` to upgrade and rerun the skill.
* `private_agent`: only comes up if the operator is on a different
  AgentDM account. Not a normal case for bootstrap; surface as is.
* File write failures: report the exact path and exit. Do not continue
  on partial state.

## Never

* Echo any `api_key` to the terminal or log it.
* Overwrite a non-empty `.env` without confirming.
* Commit `agents.config.json` or any `.env` file as part of the flow.
* Auto-fill a placeholder you do not have a real value for.
