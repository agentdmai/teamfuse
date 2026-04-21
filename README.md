# teamfuse

**Fuse five Claude Code agents into a working team.** Product, Engineering,
QA, Marketing, and Analyst, coordinating over [AgentDM](https://agentdm.ai),
orchestrated by a local Next.js control panel shaped like an electrical
load center. Boot the whole company from a single `/bootstrap-company`
prompt.

```
          ┌─── teamfuse ───┐
 spark  → │ pm   eng   qa  │ → working
 (one     │ mkt       ana  │   team
 command) └─ main load ────┘
```

## What you get out of the box

* **Five starter roles**, each a persistent Claude Code session with its
  own `CLAUDE.md`, `MEMORY.md`, `.mcp.json`, and role-scoped skills.
* **A local control panel** at `127.0.0.1:3005` with breaker-cabinet UI:
  start, stop, wake, read logs, inspect context, inspect MCP tools, track
  token usage per agent and per window (5h / 7d / since-start).
* **A streaming agent loop** that keeps each Claude Code session hot
  across ticks. One `claude` process per agent, stdin/stdout JSON,
  `/clear` between units of work, SIGUSR1 wake, exponential backoff
  sleep. Full writeup in `docs/streaming-agent-loop.md`.
* **A shared SOP library** (`agents/sop/`): card lifecycle, WIP caps,
  wake protocol, PR review, commit attribution, release validation,
  browser requests, DB access.
* **A bootstrap skill** that you run inside Claude Code. It asks for the
  handful of specifics it needs, provisions the AgentDM grid via admin
  MCP tools, writes `agents.config.json`, and fills every `<placeholder>`
  in each role's `CLAUDE.md` with your real values.

## Who it is for

You want a small autonomous team of AI coworkers that coordinate through
a real messaging layer, with enough structure that they can actually ship
(PRs, smoke tests, release gates, WIP caps), without writing the whole
harness yourself. Typical users: solo founders, indie shops, internal
ops teams automating a slice of their workflow.

## Quickstart

### 1. Clone

```bash
gh repo create my-company --template agentdm/teamfuse --public
cd my-company
```

Or clone and re-init:

```bash
git clone https://github.com/agentdm/teamfuse my-company
cd my-company
rm -rf .git && git init -b main
```

### 2. Install dependencies

```bash
cd agents-web && npm install && cd ..
```

### 3. Authorise AgentDM in Claude Code

```bash
claude
> /plugin install agentdm@agentdm
> /reload-plugins
```

Claude prints an OAuth URL. Open it, approve, come back. See
`docs/agentdm-integration.md` for the account, alias, and channel model.

### 4. Fuse the team

Inside the same Claude session, at the repo root:

```
> /bootstrap-company
```

The skill asks for your company name, operator alias, which of the five
roles to provision, and any role-specific bindings (GitHub org, Postgres
DSN). It then:

* creates one AgentDM agent per role, stores each api key into
  `agents/<id>/.env`
* creates the `#eng`, `#leads`, `#ops` channels and seeds members
* assigns role-appropriate skills via `admin_set_agent_skills`
* writes `agents.config.json`
* replaces every `<placeholder>` in the role `CLAUDE.md` files

Idempotent. Safe to rerun.

### 5. Light the panel

```bash
cd agents-web
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3005`. One breaker card per agent, all stopped.
Flip the first Start. The wrapper forks, `status.json` starts updating,
and the log modal fills with tick output.

## Prerequisites

* Node 18.17+
* Python 3.10+
* [Claude Code CLI](https://docs.anthropic.com/claude/claude-code)
* An [AgentDM](https://app.agentdm.ai) account
* A GitHub account (only if Eng, PM, or QA are provisioned)
* A Postgres DSN (only if Analyst is provisioned)

## Docs

| | |
|---|---|
| [Architecture](docs/architecture.md) | Three pieces: sub-agent sessions, control plane, messaging layer. |
| [Streaming agent loop](docs/streaming-agent-loop.md) | Deep dive on `scripts/agent-loop.py`. Why persistent sessions, JSON framing, control files, signals, backoff, crash recovery, cost accounting. |
| [AgentDM integration](docs/agentdm-integration.md) | Accounts, aliases, channels, admin vs user MCP tools, OAuth, guardrails. |
| [Creating agents](docs/creating-agents.md) | Three paths: edit a starter, copy the `TEMPLATE/` skeleton, or replace the lineup entirely. |
| [Operator guide](docs/operator-guide.md) | Daily ops: start, stop, wake, context, skills, MCP tools, usage windows, master breaker. |
| [Extending](docs/extending.md) | Adding MCP servers, skills, guardrails, optional patterns (Gmail intake, paid ads, browser work). |

## Layout

```
.
├── README.md                           you are here
├── SETUP.md                            long-form bootstrap walkthrough
├── LICENSE                             MIT
├── .gitignore
├── .claude/
│   ├── settings.example.json
│   └── skills/bootstrap-company/       the bootstrap flow
├── .mcp.json.example                   AgentDM MCP, copy to .mcp.json
├── agents.config.example.json          copy to agents.config.json during bootstrap
├── docs/                               six markdown docs
├── agents/
│   ├── TEMPLATE/                       blank agent skeleton
│   ├── pm-bot/                         placeholderised starter roles
│   ├── eng-bot/
│   ├── qa-bot/
│   ├── marketing/
│   ├── analyst/
│   └── sop/                            shared operating procedures
└── agents-web/                         Next.js control panel
```

## Naming

The product is teamfuse: a team fused into existence. The metaphor runs
through the UI (load center, breakers, LIVE indicator) and the repo
structure. It is not a reference to any other Fuse, TeamFusion, or Spark
product you may have seen.

## License

MIT. See `LICENSE`.
