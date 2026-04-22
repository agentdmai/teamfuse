# Operator guide

Day-to-day use of the control panel at
`http://127.0.0.1:3005`.

## The cabinet

The UI is a metaphor: a metallic cabinet with a master breaker, a
usage panel, and one breaker card per agent. Green dot means running,
blue is idle or sleeping, amber is starting, red is errored, grey is
stopped.

## Starting and stopping

Each card has mini breaker buttons. Start spawns
`scripts/agent-loop.sh <workingDir>` detached. Stop sends SIGTERM to
the whole process group, then SIGKILL after 5 seconds. The dashboard
reconciles pid liveness on every request via `process.kill(pid, 0)`.

Master breaker (top right) kills every agent. Press again to restart
them all from scratch.

## Waking

Each card has a Wake button. That sends SIGUSR1 to the wrapper pid
only, not the group, so an in-flight `claude` turn is not disturbed.
The wrapper's sleep returns immediately and the next tick starts.

Use wake when you just queued actionable work that should not wait for
the natural backoff. Do not spam it.

The agents also wake each other, per `agents/sop/wake-protocol.md`.

## Reading logs

Chevron on a breaker expands the card. The Log modal tails
`<workingDir>/.orchestrator/agent-loop.log`. Wrapper messages land
there (spawn, sleep, rate limits, tick cost) as well as any stderr
from the Claude process.

The Log modal is the first place to look when an agent looks stuck.

## Context modal

Shows the agent's instructions file (`CLAUDE.md` for claude agents,
`AGENTS.md` for copilot agents) plus the current `MEMORY.md`. Useful for
verifying the bootstrap skill wrote the right placeholders. Also useful
for catching MEMORY.md files that have drifted past 2KB; the agent is
supposed to consolidate on every tick, but sometimes it forgets.

## Skills modal

Enumerates the skills in `.claude/skills/` in the agent's working directory.
Each row is one skill directory with a `SKILL.md`.

For **copilot** agents, skills are loaded from any of these directories:
- `.claude/skills/` (same as Claude — use this to share skills across runtimes)
- `.github/skills/`
- `.agents/skills/`

## MCP tools modal

Reads `<workingDir>/.orchestrator/tools.json`. The agent writes this
at the top of every FULL tick (and every 60 minutes on LIGHT ticks),
snapshotting every `mcp__*` tool it can see. If the modal is empty or
stale, something is off with the MCP servers. Check the log modal for
startup errors.

## Usage panel

Two windowed bars plus per-agent token rows.

* 5h window: rolling by default. Reset button zeroes the baseline so
  you can see usage since "now". The cap is `USAGE_CAP_5H` in the env
  (100M tokens default).
* 7d window: same pattern, cap `USAGE_CAP_7D` (2B tokens default).

Per-agent rows show the "since start" window (all tokens since the
last Start press for that agent). Scaled against the peak agent so you
can compare load at a glance.

Rate limit detection: the panel parses the wrapper log for
`You've hit your limit, resets ...` lines and displays the most recent
one. An agent that has hit a limit in the last 4 hours shows a small
amber indicator on the usage panel.

## Running a manual wake from the command line

```bash
curl -sS -X POST http://127.0.0.1:3005/api/agents/<id>/wake
```

Useful when you want to nudge an agent from a script or from another
machine on the local network (the control plane binds to localhost, so
this works only from the same host).

## Running a manual stop-all

```bash
curl -sS -X POST http://127.0.0.1:3005/api/agents/master
```

Same effect as the master breaker.

## Tailing the session log directly

Claude Code writes one JSONL per session under
`~/.claude/projects/<slug>/<uuid>.jsonl`, where `<slug>` is the agent's
working directory with slashes replaced by dashes. To follow a live
tick:

```bash
tail -f ~/.claude/projects/$(pwd | tr / -)/*.jsonl
```

(You have to be in the agent's working directory for the slug to match.)

## File locations

The control panel reads several files at fixed paths. Here is the full
map relative to the **repo root** (one level above `agents-web/`):

| File | Purpose |
|---|---|
| `agents.config.json` | Agent roster — required. Dashboard is empty without it. Copy from `agents.config.example.json` and run `/teamfuse-init`, or create manually. Override the path with the `AGENTS_CONFIG` env var. |
| `agents-web/.env.local` | Control panel env vars (`DATABASE_URL`, port, usage caps). Copy from `agents-web/.env.example`. |
| `agents-web/data/control-plane.db` | SQLite DB (auto-created). Location set by `DATABASE_URL` in `.env.local`. |
| `agents/<id>/CLAUDE.md` | Role instructions for **claude** agents (auto-loaded by Claude Code CLI). Required to Start a claude agent. |
| `agents/<id>/AGENTS.md` | Role instructions for **copilot** agents (auto-loaded by the Copilot CLI from cwd). Required to Start a copilot agent. |
| `agents/<id>/.env` | Per-agent env vars — primarily the AgentDM `AGENTDM_API_KEY`. Written by `/teamfuse-init`. |
| `agents/<id>/.mcp.json` | Per-agent MCP server config. Passed as `--additional-mcp-config` to the CLI. |
| `agents/<id>/MEMORY.md` | Agent's bounded scratchpad (≤2 KB). Created empty on first Start if missing. |
| `agents/<id>/.orchestrator/` | Runtime outputs: `agent-loop.log`, `sleep.json`, `tools.json`. Gitignored, created at Start. |
| `agents/<id>/status.json` | Written by the agent each tick. Drives the state dot on the breaker card. |

**Key rule:** `agents.config.json` lives at the repo root, **not** inside
`agents-web/`. The control panel resolves it as `../agents.config.json`
relative to its own `process.cwd()` (which is `agents-web/` when you run
`npm run dev`). You can override this with `AGENTS_CONFIG=/absolute/path`.

## When something looks wrong

* Agent stuck in starting: open the log modal, look for spawn errors,
  missing env vars, MCP handshake failures.
* Agent running but no status.json updates: the tick is taking longer
  than usual. Check the session log.
* Everyone is rate-limited: the usage panel bars will be red.
  Reset the 5h baseline if you just bought another chunk of quota, or
  wait for the window to roll.
* `agents.config.json` missing: dashboard shows an empty table. Run
  `/teamfuse-init` or copy `agents.config.example.json` manually.
