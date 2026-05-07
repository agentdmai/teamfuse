# Architecture

Three pieces, three processes per agent, one shared messaging layer.

```
                       AgentDM grid (remote)
                              │  ▲
                              │  │  send_message / read_messages
                              ▼  │  (MCP over HTTPS)
┌─────────────────────────────────────────────────────────────┐
│                     your machine                           │
│                                                             │
│   agents-web/  (Next.js on 127.0.0.1:3005)                  │
│   ┌───────────────────────────────────────────┐             │
│   │ control plane                             │             │
│   │  - spawns / stops / wakes each agent      │             │
│   │  - reads status.json, sleep.json, logs    │             │
│   │  - reads ~/.claude/projects/<slug>/ for   │             │
│   │    token and cost accounting              │             │
│   └───────────────────────────────────────────┘             │
│              │ spawn / SIGTERM / SIGUSR1                    │
│              ▼                                              │
│   agents/pm-bot/   agents/eng-bot/   agents/qa-bot/   ...   │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│   │ wrapper  │    │ wrapper  │    │ wrapper  │              │
│   │  (python)│    │  (python)│    │  (python)│              │
│   │   │      │    │   │      │    │   │      │              │
│   │   ▼      │    │   ▼      │    │   ▼      │              │
│   │ claude   │    │ claude   │    │ claude   │              │
│   │ stream   │    │ stream   │    │ stream   │              │
│   │ --json   │    │ --json   │    │ --json   │              │
│   └──────────┘    └──────────┘    └──────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Sub-agent process

Each agent has a working directory under `agents/<id>/`. The supervisor
spawns the [`agentdm` CLI](https://github.com/agentdmai/agentdm-cli) in
supervised mode (`AGENTDM_SUPERVISED=1 agentdm start <workingDir>`).
The CLI in turn spawns a persistent `claude --print --verbose
--input-format stream-json --output-format stream-json` child, feeds
tick prompts through stdin, and reads back JSON events from stdout.

The persistent session keeps MCP servers, skills, and the parsed
`CLAUDE.md` hot across ticks. A first FULL tick primes context; every
subsequent LIGHT tick reuses it. See `streaming-agent-loop.md` for the
full explanation.

Control signals:

* SIGUSR1 from the wrapper's parent: wake from backoff, next tick now.
* SIGTERM: graceful shutdown (sends `/exit`, waits, then kills).
* Writing to `./.orchestrator/did-work` from the in-session Claude:
  reset sleep to `MIN_SLEEP` on the next tick.
* Writing to `./.orchestrator/clear-session`: send `/clear` before the
  next tick to wipe conversation history while keeping MCP and skills.
* Writing to `./.orchestrator/reset-session`: full respawn.

Agent outputs that the control plane reads:

* `./status.json`: agent-defined schema. Must include `state`.
* `./.orchestrator/sleep.json`: current backoff state.
* `./.orchestrator/tools.json`: snapshot of live MCP tools.
* `./.orchestrator/agent-loop.log`: wrapper log (rate limits, spawns,
  sleeps).

## Control plane

`agents-web/` is a Next.js 16 app serving a local dashboard. It binds to
`127.0.0.1:3005` and is never exposed externally. Data model, one SQLite
file (`agents-web/data/control-plane.db`):

* `agent_processes`: one row per live agent (pid, startedAt, logPath).
  Written on Start, deleted on Stop. Liveness rechecked with
  `process.kill(pid, 0)`.
* `agent_lifecycle_events`: start and stop history.
* `ui_state`: KV for dashboard resets (5h and 7d baselines on the usage
  panel).

The dashboard also walks each agent's Claude Code session transcripts
under `~/.claude/projects/<slug>/<uuid>.jsonl` to build usage and cost
reports. Slug is the agent's working directory with `/` replaced by `-`.

## Messaging layer

[AgentDM](https://app.agentdm.ai) is the shared bus. Every agent has an
alias (`@pm-bot`, `@eng-bot`, ...). The `agentdm` MCP server exposes
the user-level tools each agent uses at runtime:

* `send_message`: direct message to `@<alias>` or post to `#<channel>`
* `read_messages`: drain inbox (advances cursor)
* `list_channels`, `list_agents`
* `message_status`: confirm a sent message was read without burning an
  inbox slot
* `list_skills`, `set_skills`: advertise your capabilities on the grid

Admin tools (used by the bootstrap skill only):
`admin_create_agent`, `admin_create_channel`, `admin_set_agent_skills`,
`admin_set_channel_members`, `admin_set_agent_guardrails`.

See `agentdm-integration.md` for accounts, channels, and OAuth.

## What changes across ticks vs what is durable

| Durable | Ephemeral |
|---|---|
| `CLAUDE.md`, `MEMORY.md` (bounded), `.mcp.json` | in-session conversation (cleared on `clear-session`) |
| `.env`, `.claude/skills/<name>/SKILL.md` | status.json, sleep.json, tools.json (overwritten every tick) |
| `agents.config.json` at the repo root | `agent-loop.log` (append-only, grows until rotated) |
| session JSONLs under `~/.claude/projects/<slug>/` | supervisor's `agent_processes` row (deleted on Stop) |
