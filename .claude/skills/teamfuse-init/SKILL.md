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
* `agents/sop/company.md`: overwrite only if the operator's step-1
  answers differ from the live file. Otherwise skip silently.
* `gh project create`: on duplicate title under the same owner, list
  existing projects, match by title, reuse the found project. Never
  create a second board with the same title.
* `gh project field-create`: skip any field whose name is already taken.
  Never delete or rename existing fields.
* Clone symlinks in `agents/eng-bot/repos/` and `agents/qa-bot/repos/`:
  if a symlink with the given short name already exists and points at
  the same path, skip. If it points at a different path, warn and leave
  it — never silently re-point the operator's existing wiring.

## Flow

### Step 1: gather inputs

Use `AskUserQuestion` one question at a time.

Mandatory:

* **Company name.** Used in `agents.config.json.companyName`, UI
  nameplate, commit footers, docs substitutions.
* **Company slug.** Default: company name lowercased with non-word
  characters replaced by `-`. Used in the commit footer identity.
* **Your domain.** For the commit footer email, e.g. `acme.dev`.
* **What the company does.** One short paragraph. The mission and the
  problem it exists to solve. Written as prose an agent can quote
  verbatim in user-facing copy.
* **The product.** One short paragraph. Shape (SaaS, CLI, library,
  service), core capabilities, what a user does with it on a typical
  day. Concrete, not aspirational.
* **Who it is for.** One short paragraph. Target customer: role, team
  size, industry, pain point. Include the anti-customer if obvious.
* **Positioning one-liner.** Single sentence. Used verbatim in
  marketing copy and landing-page headers. Default: propose one
  derived from the three answers above and let the operator confirm
  or edit.
* **Operator alias.** The AgentDM alias the operator responds as.
  Default: `@operator`.
* **Roles to provision.** Subset of `pm-bot, eng-bot, qa-bot,
  marketing, analyst`. Default: all five.

Conditional:

* **GitHub org.** If eng, pm, or qa are selected.
* **Reviewer GitHub handle.** If eng, pm, or qa.
* **Project board.** If pm is selected. Ask three options:
  1. **Create a new GitHub Project V2.** Default. Skill runs
     `gh project create --owner <github-org> --title "<company-name>"`
     and resolves the node ID + standard field IDs via `gh api graphql`.
     See Step 4b.
  2. **Use an existing board.** Operator pastes the URL. Skill resolves
     node ID + field IDs via `gh api graphql`.
  3. **Skip.** Leave the placeholders as TODO; `@pm-bot` will flag the
     gap when it tries to read the board.
* **Repos to wire into `@eng-bot` and `@qa-bot`.** If eng or qa are
  selected. The agents edit code under `agents/eng-bot/repos/<name>`
  and read the same path from `agents/qa-bot/repos/<name>`; those are
  symlinks (gitignored). Ask: "Do you have local clones you want eng
  and qa to work on?" For each, collect:
  * **Absolute path to the clone.** E.g. `/Users/me/code/acme-app`.
    Validate that the path exists and contains a `.git/` directory.
  * **Short name.** Default: basename of the path. Used as the
    symlink name and fills the `<repo-name>` placeholder.
  Operator can add zero or more repos. If zero, leave placeholders
  and note in the final summary how to add one later.
* **Postgres DSN for `analyst_ro`.** If analyst is selected. Optional.
* **Dogfood account names and email domain.** If analyst is selected.
* **Landing repo name.** If marketing is selected.

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

Then materialize the per-agent MCP config. The template ships
`agents/<id>/.mcp.json.example` for each role; the live `.mcp.json` is
gitignored (same pattern as `agents.config.json` — the starter ships
only the `.example`, the bootstrap flow writes the live file).
`agent-loop.py` passes `--strict-mcp-config` so the agent only sees
servers listed here — if the file is absent, the wrapper falls back to
an empty MCP config (no AgentDM, no GitHub, nothing). So for each
selected role:

1. Pick the source: `agents/<id>/.mcp.json.example` if present, else
   fall back to `agents/TEMPLATE/.mcp.json.example` and flag it in the
   final summary as "MCP config generic — review before first wake".
2. Read the source and substitute **only** `${AGENTDM_TOKEN}` with the
   real `api_key` we just captured from `admin_create_agent`. Do this
   in-memory, never write the token anywhere else. Other placeholders
   (`${GH_TOKEN}`, `${ANALYST_DB_DSN}`, `${PROJECT_ID}`, etc.) stay as
   `${...}` so the operator can edit `.env` later without rerunning
   this skill — those are resolved by Claude Code at MCP boot from the
   env the wrapper exports.
3. Write the result to `agents/<id>/.mcp.json` (gitignored). If the
   live file already exists, diff: if the existing file still has
   literal `${AGENTDM_TOKEN}`, replace it with the fresh key; otherwise
   leave the file alone (the operator has customised it).
4. Verify the write: the new `agents/<id>/.mcp.json` must contain zero
   occurrences of `${AGENTDM_TOKEN}`. If one remains, stop and report
   the path — something is wrong with the substitution logic and
   letting the agent boot would silently 401 against AgentDM.

Why pre-substitute just the AgentDM token: we have it in hand from the
admin call, it will not rotate during this flow, and burning it in
guarantees every agent boots with a working AgentDM connection without
depending on Claude Code's `${VAR}` expansion of mcp-config args. Other
placeholders rotate or come later, so they stay as env-var references.

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

### Step 4b: set up the project board

Only if `@pm-bot` is selected.

**If the operator chose "create a new board" in Step 1:**

1. Run `gh project create --owner "<github-org>" --title "<company-name>" --format json`.
   Capture `number`, `url`, and the `id` node.
2. If the org or user has no projects scope in `gh auth`, stop and tell
   the operator to run `gh auth refresh -s project` and rerun.
3. On `already exists` (same title): list with
   `gh project list --owner "<github-org>" --format json`, find the one
   with the matching title, reuse its `number` and `id`. Do not create
   duplicates.
4. Seed the standard single-select fields the rest of the system
   expects. Per field, run
   `gh project field-create <number> --owner "<github-org>" --name "<field>" --data-type SINGLE_SELECT --single-select-options "<options>"`:
   * `Status` — `Backlog,Todo,In Progress,Waiting for Review,Reviewed,Done`
   * `Agent` — one option per selected role alias, stripped of `@`
     (e.g. `pm-bot,eng-bot,qa-bot,marketing,analyst`)
   * `Type` — `feature,content,bug,research,product-feedback,test,seo,browser-task`
   * `Source` — `operator,team-proposal,analyst-insight,pm-generated`
   * Plus a text field `Output link` via `--data-type TEXT`.
   If a field already exists (error contains `name has already been
   taken`), skip it and move on. Never overwrite an existing field.

**If the operator pasted an existing URL in Step 1:** skip the creation,
skip field seeding, resolve the project node ID below from that URL.

**Field / node ID resolution (both paths, unless the operator chose
"skip"):**

```
gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    organization(login: $owner) {
      projectV2(number: $number) {
        id
        fields(first: 50) {
          nodes {
            ... on ProjectV2SingleSelectField { id name }
            ... on ProjectV2Field { id name }
          }
        }
      }
    }
  }
' -f owner=<github-org> -F number=<project-number>
```

Capture `<project-id>`, `<status-field-id>`, `<agent-field-id>`,
`<type-field-id>`, `<source-field-id>`, `<output-link-field-id>` from
the response for the Step 6 placeholder pass. On `Could not resolve to
an organization`, retry with `user(login:)` — individual accounts
don't have an `organization` node.

If the operator chose "skip", leave all board placeholders as TODO and
mention them in the final summary.

### Step 5: write agents.config.json

Based on `agents.config.example.json`, trimmed to selected roles and
with `companyName` filled in.

### Step 5b: write the company brief

Every agent reads `agents/sop/company.md` at start-up — it is the single
source of truth for what this company is, what the product does, and
who it serves. Write the file from the step-1 answers using
`agents/sop/company.md.example` as the layout:

* `## What the company does` — the "what the company does" paragraph.
* `## The product` — the "product" paragraph.
* `## Who it is for` — the "who it is for" paragraph.
* `## Positioning one-liner` — the positioning sentence.
* `## How agents should use this` — copy verbatim from the example.

Never prepend or append extra commentary. Never split the paragraphs
into bullets. If the operator gave multi-line answers, keep them as a
single paragraph per section.

On rerun: overwrite if the paragraphs differ from what the operator just
gave. If identical, skip silently.

### Step 5c: wire existing clones into eng/qa

Only if the operator named one or more repos in Step 1.

For each named repo (`<abs-path>`, `<short-name>`):

1. `mkdir -p agents/eng-bot/repos agents/qa-bot/repos`.
2. Create the symlinks:
   * `ln -sfn "<abs-path>" "agents/eng-bot/repos/<short-name>"`
   * `ln -sfn "<abs-path>" "agents/qa-bot/repos/<short-name>"`
   (Marketing and analyst do not get repo access.)
3. `.gitignore` already covers `agents/*/repos/`, so no gitignore work
   is needed. If the pattern is absent (custom operator edit), append
   `agents/*/repos/` — never rewrite the whole file.
4. Sanity-check: `<abs-path>/.git/` exists. If not, warn and continue.

Placeholder resolution later in Step 6:

* `<repos-root>` — `./repos` (unchanged, relative to each agent dir).
* `<repo-name>` — the first repo's `<short-name>` if exactly one was
  given; if multiple, fill with the first and add the full list under a
  new "Repos" block below the Identity section (one bullet per repo).
* `<default-branch>` — run `git -C "<abs-path>" symbolic-ref --short HEAD`
  for the first repo; fallback to `main` on failure.

On rerun:

* If the symlink already exists and points at the same path, skip.
* If it points elsewhere, warn and leave the existing link intact — the
  operator must remove it by hand if the old path is wrong.

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
| `<project-id>`, `<status-field-id>`, `<agent-field-id>`, `<type-field-id>`, `<source-field-id>`, `<output-link-field-id>` | resolved in Step 4b (from a newly created board or an existing URL). If the operator chose "skip", leave as TODO |
| `<repos-root>` | `./repos` |
| `<repo-name>` | Step 5c short-name for the (first) wired repo; TODO if none wired |
| `<default-branch>` | from Step 5c (`git symbolic-ref`), else `main` |
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
AgentDM MCP: <count> agents ready (token burned into agents/<id>/.mcp.json)
Channels: #eng, #leads, #ops
Project board: <url or "skipped — fill <project-id> in pm-bot/CLAUDE.md later">
Wired repos: <list of "<short-name> -> <abs-path>" lines, or "none — symlink under agents/eng-bot/repos/ to add later">
agents.config.json: written
agents/sop/company.md: written (single source of truth every agent reads)

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
