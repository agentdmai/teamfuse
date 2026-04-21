# agents-web

Local control plane for your Claude Code agent company. Starts, stops, wakes,
and observes the sub-agents defined in `agents.config.json`. Binds to
`127.0.0.1:3005` only.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 3, Drizzle ORM on a
local SQLite file.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
# open http://127.0.0.1:3005
```

The dashboard reads `../agents.config.json` for the agent roster. Until you
run the bootstrap flow (see the repo root `README.md`) that file does not
exist and the table is empty, which is expected.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `./data/control-plane.db` | SQLite file path |
| `AGENTS_CONFIG` | `../agents.config.json` | Path to the agent registry |
| `HOST` / `PORT` | `127.0.0.1` / `3005` | Dashboard bind |
| `USAGE_CAP_5H` | `100000000` | Upper bound for the 5h progress bar |
| `USAGE_CAP_7D` | `2000000000` | Upper bound for the 7d progress bar |

## What it does

On each request the dashboard re-reads every agent's `status.json`, checks
pid liveness from `agent_processes` in SQLite, reads `sleep.json` for the
next wake time, and walks each agent's Claude Code session transcripts under
`~/.claude/projects/<slug>/` to compute token usage.

Buttons per agent:

* **Start**. Spawns `scripts/agent-loop.sh <workingDir>` detached in a new
  process group. Writes a row into `agent_processes` and a
  `last-start.json` marker into `<workingDir>/.orchestrator/`.
* **Stop**. SIGTERM to the process group, then SIGKILL after 5 seconds if
  still alive. Drops the row from `agent_processes`.
* **Wake**. SIGUSR1 to the wrapper pid only (not the group). The wrapper's
  trap breaks its `sleep` so the next tick starts immediately.

See the root `docs/streaming-agent-loop.md` for how each agent's Claude Code
session is kept persistent across ticks.

## Source layout

```
src/
  app/
    layout.tsx, page.tsx        control panel shell
    api/
      agents/route.ts           GET list + status for all agents
      agents/[id]/start         POST spawn the loop
      agents/[id]/stop          POST graceful then forced kill
      agents/[id]/wake          POST SIGUSR1
      agents/[id]/context       GET CLAUDE.md + MEMORY.md
      agents/[id]/logs          GET tail of agent-loop.log
      agents/[id]/skills        GET skills from .claude/skills/
      agents/[id]/tools         GET tools.json snapshot
      agents/master             POST kill every agent
      usage                     GET usage report
      usage/reset               POST reset a window baseline
      heartbeat                 GET liveness summary
  components/                   cabinet UI (breakers + modals)
  db/                           drizzle + better-sqlite3
  lib/
    agents.ts                   config-driven registry
    status.ts                   status.json reader
    supervisor.ts               spawn/stop/wake
    usage.ts                    session JSONL aggregator
    ui-state.ts                 KV for dashboard resets
scripts/
  agent-loop.sh                 bash wrapper (thin)
  agent-loop.py                 streaming Claude Code session manager
  tick-cost.py                  per-tick cost summariser
```
