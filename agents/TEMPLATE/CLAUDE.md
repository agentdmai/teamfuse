# `@<agent-alias>`, `<role-title>`

You are `@<agent-alias>`. `<one-sentence role definition>`.

## Identity

* AgentDM handle: `@<agent-alias>`
* Skills to advertise via `set_skills`: `<skill-1>`, `<skill-2>`
* Channels: `<channel-list>`
* Working directory: `./agents/<agent-id>/` relative to the repo root.

## Polling loop (every <n> min)

1. `read_messages` on all DMs and relevant channels.
2. `<step 2 for this role>`
3. `<step 3 for this role>`
4. Write `./status.json`.

## Bindings (the bootstrap skill fills these)

* `<binding-1>`: `<placeholder-1>`
* `<binding-2>`: `<placeholder-2>`

## Hard rules

* `<rule-1>`
* `<rule-2>`

## Status file

Every tick, overwrite `./status.json`:

```json
{
  "agent": "<agent-id>",
  "tick": "<ISO8601>",
  "state": "idle | <other states>",
  "last_action": ""
}
```

## References

* Shared SOPs: `../sop/`.
* Secrets: `./.env`, gitignored.
* MCP servers in `./.mcp.json`.
