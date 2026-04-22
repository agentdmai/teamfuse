# teamfuse – Copilot Instructions

## What this repo is

A template for running a small team of persistent agents (Product Manager, Engineer, QA, Marketing, Analyst) that coordinate via [AgentDM](https://agentdm.ai). Three moving parts:

1. **Agent sessions** – one runtime process per role, kept alive by `agents-web/scripts/agent-loop.py` / `agent-loop.sh`. Runtime is pluggable: `claude` (Claude Code CLI, default) or `copilot` (GitHub Copilot CLI).
2. **Control plane** – a Next.js 16 app at `agents-web/` (`127.0.0.1:3005`). Spawns/stops/wakes agents, reads their file-system outputs, serves the dashboard.
3. **AgentDM** – remote messaging bus. All agent-to-agent coordination goes through it; the control plane never routes messages.

## Build / lint / type-check

All commands run from `agents-web/`:

```bash
npm install          # first-time setup
npm run dev          # dev server on 127.0.0.1:3005
npm run build        # production build
npm run typecheck    # tsc --noEmit (run this after any TS change)
npm run lint         # next lint
npm run db:push      # apply schema changes to SQLite
npm run db:generate  # regenerate Drizzle migration files
npm run db:studio    # open Drizzle Studio
```

There is no test suite in `agents-web/`. Verify changes with `npm run typecheck && npm run lint`.

## Key conventions

### agents.config.json drives the control plane

`agents.config.json` at the repo root is the single source of truth for which agents exist. It is read once at Next.js server start and cached. To force a reload, restart the dev server. The `AGENTS_CONFIG` env var overrides the path.

```json
{ "companyName": "…", "agentsRoot": "./agents", "agents": [
  { "id": "eng-bot",      "alias": "@eng-bot",      "role": "Engineer",  "runtime": "claude",  "chrome": false },
  { "id": "copilot-eng",  "alias": "@copilot-eng",  "role": "Engineer",  "runtime": "copilot" }
]}
```

`runtime` defaults to `"claude"` if omitted. Valid values: `"claude"` | `"copilot"`.

### Runtime adapter pattern

The agent loop is runtime-agnostic. `agents-web/scripts/agent-loop.py` loads an adapter based on the `RUNTIME` env var (set by the supervisor from `agents.config.json`). Adapters live in `agents-web/scripts/runtimes/`:

- `base.py` – `BaseAdapter` ABC: `spawn()`, `send()`, `wait_for_result()`, `terminate()`, `supports_clear_session()`
- `claude_adapter.py` – `ClaudeAdapter`: persistent `claude --print --verbose --input-format stream-json` session; supports `/clear`
- `copilot_adapter.py` – `CopilotAdapter`: per-tick `copilot -p` process; `AGENTS.md` auto-loaded natively; `--resume=<session-id>` for cross-tick context continuity; `--additional-mcp-config @.mcp.json` for MCP servers; `clear-session` drops the session ID (fresh context next tick)

To add a new runtime, create `agents-web/scripts/runtimes/<name>_adapter.py` implementing `BaseAdapter` and add the name as a valid `runtime` value.

### Instruction files per runtime

| Runtime | Primary file | Notes |
|---|---|---|
| `claude` | `CLAUDE.md` | Auto-loaded by Claude Code natively |
| `copilot` | `AGENTS.md` | Auto-loaded by the Copilot CLI natively |

`agents/TEMPLATE/` contains both `CLAUDE.md` and `AGENTS.md` with `<placeholder>` tokens. `/teamfuse-init` and `/teamfuse-add-agent` substitute them. **Never commit filled-in instruction files back to the template.** To reset: `git checkout agents/*/CLAUDE.md agents/*/AGENTS.md`.

### Agent working directories (`agents/<id>/`)

Each agent's working directory must contain:
- `CLAUDE.md` or `AGENTS.md` – role instructions (checked by `startAgent` based on runtime)
- `.claude/skills/` – per-agent skills. For **copilot** agents, `.github/skills/` and `.agents/skills/` are also valid locations (all three are loaded automatically). Use `.claude/skills/` to share skills between claude and copilot agents in the same working dir.
- `.env` – AgentDM API key (gitignored, written by `/teamfuse-init`)
- `.mcp.json` – per-agent MCP servers
- `.orchestrator/` – runtime outputs (gitignored):
  - `sleep.json` – current backoff state (read by the dashboard)
  - `tools.json` – snapshot of live MCP tools
  - `agent-loop.log` – wrapper stdout/stderr
  - `last-start.json` – persists last start time across Stop/Start cycles
  - `did-work` – touch to reset sleep to MIN_SLEEP
  - `clear-session` – touch to wipe history before next tick (drops `--resume` session ID for copilot; sends `/clear` for claude)
  - `reset-session` – touch to force a full adapter respawn
- `status.json` – written every tick by the agent itself; must include `"state"`

### Control plane data model (Drizzle + better-sqlite3)

Schema lives in `agents-web/src/db/schema.ts`. Three tables:
- `agent_processes` – one row per running agent (pid, startedAt, logPath); deleted on Stop or crash reconciliation
- `agent_lifecycle_events` – start/stop audit log
- `ui_state` – KV for dashboard resets (5h/7d usage baselines)

SQLite file defaults to `agents-web/data/control-plane.db` (set via `DATABASE_URL`).

### Process management in the supervisor

`agents-web/src/lib/supervisor.ts` is `server-only`. It spawns `agent-loop.sh` detached (`detached: true`, `child.unref()`), so the child's pid is also its pgid. Stop signals go to `-pid` (the whole process group) to kill both the Python wrapper and any running runtime child.

- SIGUSR1 to `pid` (not `-pid`) = wake from backoff
- SIGTERM to `-pid` = graceful shutdown (5 s timeout, then SIGKILL)
- `RUNTIME=<runtime>` env var is passed to the wrapper at spawn time

### Next.js API conventions

- All lib files that touch the filesystem or DB use `import "server-only"` at the top.
- API routes are under `agents-web/src/app/api/agents/[id]/<action>/route.ts`.
- Agent IDs are validated with `isAgentId()` from `@/lib/agents` before any operation.

### Skill commands (`.claude/skills/`)

The `/teamfuse-*` slash commands are skills stored under `.claude/skills/<name>/SKILL.md`. They call AgentDM admin MCP tools directly. To add a new command, create a new directory with a `SKILL.md` inside it.

**Agent skills** (per `agents/<id>/`) work the same way for both runtimes:
- **claude**: loads from `.claude/skills/`
- **copilot**: loads from `.claude/skills/`, `.github/skills/`, or `.agents/skills/` (all equivalent; use `.claude/skills/` to share across runtimes)

### `chrome: true` agents

Only one agent should have `"chrome": true` in `agents.config.json`. Only applies to `claude` runtime. It causes the wrapper to pass `--chrome` to `claude`, using the host's single Chrome instance. Concurrently running two chrome-enabled agents will conflict.

## Bootstrap / teardown

```bash
# Bootstrap (inside a Claude Code session at repo root)
/teamfuse-init

# Undo / start over
rm agents.config.json
rm -rf agents/*/.env
git checkout agents/*/CLAUDE.md agents/*/AGENTS.md
```

## Environment files

| File | Purpose |
|---|---|
| `.mcp.json` | AgentDM MCP for the operator Claude session (copy from `.mcp.json.example`) |
| `agents.config.json` | Agent roster (copy from `agents.config.example.json`, then `/teamfuse-init`) |
| `agents-web/.env.local` | Control panel env (copy from `agents-web/.env.example`) |
| `agents/<id>/.env` | Per-agent AgentDM API key (written by bootstrap skill) |
