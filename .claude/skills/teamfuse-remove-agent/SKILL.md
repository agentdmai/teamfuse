---
name: teamfuse-remove-agent
description: Remove an agent from the teamfuse company. Soft-deletes the AgentDM alias via admin_delete_agent, removes the entry from agents.config.json, and optionally archives the agents/<id>/ directory. Asks for confirmation before destructive steps. Trigger on /teamfuse-remove-agent, "remove agent", "delete role".
trigger_keywords: [teamfuse-remove-agent, /teamfuse-remove-agent, remove agent, delete agent, remove role]
---

# teamfuse-remove-agent

Soft-delete an agent from AgentDM and untrack it in teamfuse. The
operator's session must have admin MCP scope.

First action: print the short banner.

```
teamfuse · remove agent
────────────────────────
```

## Preconditions

1. `admin_delete_agent` is callable.
2. `agents.config.json` exists and has at least one agent.

## Flow

### Step 1: pick the agent

Read `agents.config.json.agents`. Present the list via
`AskUserQuestion`. Include alias, id, and role on each option so the
operator can tell two similar roles apart. Let the operator cancel.

### Step 2: confirm

Use `AskUserQuestion` with a single yes/no:

```
Remove @<alias> (<role>)?
This soft-deletes the agent on AgentDM (history preserved for audit)
and removes the entry from agents.config.json. Local agents/<id>/
stays on disk unless you ask to archive it below.
```

If the operator says no, stop.

### Step 3: ask about the local directory

`AskUserQuestion` one more question:

* **Archive `agents/<id>/`.** Options:
  * Leave it in place (default).
  * Move it to `agents/.archive/<id>-<ts>/`.
  * Delete it permanently.

### Step 4: soft-delete on AgentDM

```
admin_delete_agent({ alias: "@<alias>" })
```

On any error, stop and name the error code. Do not touch the local
state.

### Step 5: update `agents.config.json`

Remove the entry for that id. Preserve the rest. Atomic write.

### Step 6: handle the local directory

Per step 3.

* Leave in place: no-op.
* Archive: `mv agents/<id> agents/.archive/<id>-<YYYYMMDD-HHMM>`.
  Create `agents/.archive/` if missing. Gitignored by convention; add
  `.archive/` to `.gitignore` if not already present.
* Delete: `rm -rf agents/<id>`. Warn once that `.env` with the api key
  will be lost.

### Step 7: print the summary

```
@<alias> removed.

AgentDM:             soft-deleted (history preserved for audit)
agents.config.json:  entry removed
Local directory:     <left | archived to agents/.archive/<id>-<ts> | deleted>

If the dashboard is running, refresh the page. The breaker card
for @<alias> will be gone.
```

## Errors to handle

* Any admin MCP failure in step 4: stop, do not touch local state.
* If `agents/<id>/` is missing (operator already deleted it):
  continue, skip step 6, note in the summary.

## Never

* Delete `agents/<id>/.env` without confirming in step 3.
* Remove the `agents.config.json` entry before `admin_delete_agent`
  returns success.
* Hard-delete the AgentDM agent. `admin_delete_agent` is a soft
  delete; there is no hard-delete call and you should not try to
  build one.
