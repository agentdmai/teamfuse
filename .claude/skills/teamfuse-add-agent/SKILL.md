---
name: teamfuse-add-agent
description: Add a new agent to the teamfuse company. Provisions the AgentDM alias via admin_create_agent, assigns skills, adds it to channels, copies agents/TEMPLATE/ into agents/<id>/, writes the api key to the new agent's .env, and updates agents.config.json. Trigger on /teamfuse-add-agent, "add a new agent", "provision a new role".
trigger_keywords: [teamfuse-add-agent, /teamfuse-add-agent, add agent, new agent, provision agent, add role]
---

# teamfuse-add-agent

## How to run this skill

Start immediately. Your first reply must be (1) the banner, then (2)
the precondition check, then (3) the first `AskUserQuestion` in
Step 1.

Do not explore the repo. Do not summarise the skill back. Do not run
`Glob`, `Grep`, `Bash ls`, or `Task` agents. Everything you need is in
this file.

## Banner

Print verbatim:

```
teamfuse · add agent
─────────────────────
```

## Preconditions

1. `admin_create_agent` is a callable tool. Otherwise: tell the
   operator to install and authorise the AgentDM plugin and stop.
2. `agents.config.json` exists at the repo root. If not, the operator
   has not run `/teamfuse-init` yet. Stop and say so.
3. `agents/TEMPLATE/` exists at the repo root.

## Flow

### Step 1: gather inputs

Use `AskUserQuestion` one question at a time.

* **Agent id.** Lowercase, 3 to 32 chars, alphanumeric + hyphen,
  matches AgentDM alias rules. Used as the directory name under
  `agents/` and as the `id` in `agents.config.json`. Reject ids that
  already appear in `agents.config.json.agents[].id`.
* **Alias.** Default: `@<id>`. The AgentDM alias. Reject aliases that
  already appear in `agents.config.json.agents[].alias`.
* **Role title.** Free text. Example: "Data Engineer", "Support".
* **Chrome flag.** true or false. Default false. If true, the wrapper
  launches `claude --chrome` for this agent. Only one agent at a time
  should have this. Warn if another agent already has `chrome: true`.
* **Skills list.** Comma-separated. Example:
  `postgres-readonly, sql-auditor, etl`.
* **Channel memberships.** Pick zero or more from the existing channels
  (read via `list_channels`). Default: none.
* **Additional env vars.** Optional. Any role-specific env var names
  the operator wants stubbed in `agents/<id>/.env`.

### Step 2: create the agent on AgentDM

```
admin_create_agent({
  alias: "@<alias>",
  visibility: "private",
  accessPolicy: "auto_approve",
  description: "<role> for <company name from agents.config.json>"
})
```

Capture `api_key`. Do not echo it.

On `alias_taken`: stop, tell the operator the alias exists on AgentDM
but is not in `agents.config.json`. Offer two options: rename the
alias, or manually paste the existing `api_key`.

### Step 3: assign skills

```
admin_set_agent_skills({
  alias: "@<alias>",
  skills: [{ name, description } for each skill]
})
```

For description, use the role title plus the skill name
(e.g. `Data Engineer: etl`) unless the operator provided richer text.

### Step 4: copy the skeleton

```
cp -R agents/TEMPLATE agents/<id>
```

(Via the file tools. Do not actually exec `cp`.)

* Rename `.mcp.json.example` to `.mcp.json` in the new directory.
* Rename `.env.example` to `.env`.
* Write `AGENTDM_TOKEN=<key>` into the new `.env`. Add any optional
  env vars the operator named (empty values).
* In the new `CLAUDE.md` and `MEMORY.md`, replace `<agent-alias>` with
  the alias (without the `@`), `<agent-id>` with the id, and
  `<role-title>` with the role.
* Leave the other `<placeholder>` tokens untouched so the operator
  fills them later.

### Step 5: wire the agent into channels

For each channel the operator selected, call `admin_set_channel_members`
with the existing members plus the new alias. (Replace-semantics; fetch
current members first via `list_channels` or the returned metadata.)

### Step 6: update agents.config.json

Append a new entry to `agents`:

```json
{ "id": "<id>", "alias": "@<alias>", "role": "<role>", "chrome": false }
```

Preserve the existing `companyName` and `agentsRoot`. Write atomically.

### Step 7: print the summary

```
Agent @<alias> added.

agents/<id>/                  skeleton copied, .env written
Skills: <comma-separated list>
Channels: <comma-separated list>
agents.config.json:          entry appended

Next:
  1. Open agents/<id>/CLAUDE.md and fill the remaining placeholders
     (see the Bindings section).
  2. Add any role-specific MCP servers to agents/<id>/.mcp.json.
  3. If the dashboard is running, refresh the page. A new breaker
     card appears (stopped).
  4. Press Start when ready.
```

## Errors to handle

* `alias_taken`: see step 2.
* `agent_limit_reached`: free plan exhausted. Point at
  `app.agentdm.ai`. Do not create the directory or write
  `agents.config.json`.
* `channel_not_found` in step 5: the operator picked a channel that no
  longer exists. Skip the channel, continue, and note it in the
  summary.
* File write errors: report the path and stop. Do not leave partial
  state. If `admin_create_agent` succeeded but the file writes failed,
  call `admin_delete_agent` to unwind before giving up. If
  `admin_delete_agent` also fails, say so loudly.

## Never

* Echo `api_key` to the terminal.
* Overwrite an existing `agents/<id>/` directory. Stop if it exists.
* Add an agent to `agents.config.json` without confirming
  `admin_create_agent` returned successfully.
