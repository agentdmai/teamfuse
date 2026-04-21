---
name: teamfuse-list
description: Show the current teamfuse roster. Reads agents.config.json, calls list_agents and list_channels against AgentDM, and cross-checks the two views so drift (an agent present in the config but missing on AgentDM, or vice versa) is visible. Read-only. Trigger on /teamfuse-list, "list my agents", "show roster".
trigger_keywords: [teamfuse-list, /teamfuse-list, list agents, list channels, roster, show roster]
---

# teamfuse-list

Read-only snapshot of the teamfuse state. No MCP admin calls. No file
writes.

First action: print the short banner.

```
teamfuse · roster
──────────────────
```

## Flow

### Step 1: read local config

Parse `agents.config.json` at the repo root. If missing, print:

```
agents.config.json not found. Run /teamfuse-init first.
```

and stop.

### Step 2: call AgentDM (user scope)

* `list_agents()`
* `list_channels()`

If the MCP server is not connected or these calls fail with
`unauthorized`, tell the operator to re-authorise and stop.

### Step 3: cross-check and print

Print two tables.

**Agents.** Columns: id, alias, role, chrome, on AgentDM? (yes / no /
different visibility).

For each entry in `agents.config.json.agents`, match by alias to the
`list_agents` result.

* config only: "on AgentDM? no" (drift to resolve: either call
  `/teamfuse-add-agent` style to recreate, or remove the config entry).
* AgentDM only: listed as "alias on AgentDM, not in config" below the
  table.

**Channels.** Columns: name, members, created.

List every channel from `list_channels`.

### Step 4: print drift warnings

If any agent appears only in the config or only on AgentDM, emit a
clear callout at the bottom. Example:

```
DRIFT
  @data-bot   in agents.config.json, not on AgentDM
  @legacy     on AgentDM, not in agents.config.json
```

## Rules

* No admin MCP calls. Read-only.
* No file writes.
* Do not offer to fix drift automatically. Name the drift and let the
  operator choose `/teamfuse-add-agent` or `/teamfuse-remove-agent`.
