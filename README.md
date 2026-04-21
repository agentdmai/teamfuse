# teamfuse

```
 ████████╗███████╗ █████╗ ███╗   ███╗███████╗██╗   ██╗███████╗███████╗
 ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██║   ██║██╔════╝██╔════╝
    ██║   █████╗  ███████║██╔████╔██║█████╗  ██║   ██║███████╗█████╗
    ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║██╔══╝  ██║   ██║╚════██║██╔══╝
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████║███████╗
    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝╚══════╝

        Fuse Claude Code agents into a working team.
```

**Fuse five Claude Code agents into a working team.** Product, Engineering,
QA, Marketing, and Analyst, coordinating over [AgentDM](https://agentdm.ai),
orchestrated by a local Next.js control panel shaped like an electrical
load center. Boot the whole company from a single `/teamfuse-init`
prompt.

## What it looks like

The local control panel with all five agents running:

![teamfuse control panel](docs/screenshots/control-panel.svg)

Each breaker card wraps one persistent Claude Code session. State dot
shows running, idle, starting, errored, or stopped. Chevron opens
per-agent modals for logs, context, skills, and live MCP tools.

The same five agents on the AgentDM grid, with the seeded channels and
recent traffic between them:

![agentdm network view](docs/screenshots/agentdm-network.svg)

Every DM and every channel post goes through AgentDM. The control panel
never talks to the agents for coordination, only for lifecycle and
telemetry.

> Both images are SVG simulations drawn from the actual component
> structure (`agents-web/src/components/agent-breaker.tsx`,
> `usage-panel.tsx`, etc.) and the AgentDM account model. Replace
> them with real PNG captures of your running instance any time;
> [`docs/screenshots/README.md`](docs/screenshots/README.md) has the
> filenames and push flow.

## Architecture

```
       ┌─────────────────────── operator ────────────────────────┐
       │                                                         │
       │   laptop                            mobile              │
       │   ┌────────────────┐                ┌─────────────────┐ │
       │   │ claude code    │                │ slack (bridged  │ │
       │   │ /teamfuse-*    │                │  into #leads)   │ │
       │   │ admin MCP      │                │ approve / reply │ │
       │   └───────┬────────┘                └────────┬────────┘ │
       │           │                                  │          │
       └───────────┼──────────────────────────────────┼──────────┘
                   │                                  │
                   ▼                                  ▼
          ┌────────────────────────────────────────────────┐
          │                                                │
          │                A G E N T D M                   │
          │                                                │
          │         DMs  ·  #eng  ·  #leads  ·  #ops       │
          │                                                │
          └──┬───────┬───────┬───────┬───────┬─────────────┘
             │       │       │       │       │
             │       │       │       │       │   send_message
             │       │       │       │       │   read_messages
             ▼       ▼       ▼       ▼       ▼   (MCP over HTTPS)

       ┌────────┬────────┬────────┬────────┬────────┐
       │@pm-bot │@eng-bot│@qa-bot │@market │@analyst│
       │        │        │        │(chrome)│        │
       ├────────┼────────┼────────┼────────┼────────┤
       │wrapper │wrapper │wrapper │wrapper │wrapper │
       │ .py    │ .py    │ .py    │ .py    │ .py    │
       │   │    │   │    │   │    │   │    │   │    │
       │   ▼    │   ▼    │   ▼    │   ▼    │   ▼    │
       │ claude │ claude │ claude │ claude │ claude │
       │ stream │ stream │ stream │ stream │ stream │
       │ -json  │ -json  │ -json  │ -json  │ -json  │
       │        │        │        │        │        │
       │ MCP:   │ MCP:   │ MCP:   │ MCP:   │ MCP:   │
       │agentdm │agentdm │agentdm │agentdm │agentdm │
       │github  │github  │github  │github  │postgres│
       │        │context7│playwrt │ga4/gsc │(r/o)   │
       └───┬────┴───┬────┴───┬────┴───┬────┴───┬────┘
           │        │        │        │        │
           │  status.json · sleep.json · tools.json
           │  agent-loop.log · session JSONLs
           │        │        │        │        │
           ▼        ▼        ▼        ▼        ▼
          ┌──────────────────────────────────────────────┐
          │  teamfuse · control panel                    │
          │  agents-web (Next.js) · 127.0.0.1:3005       │
          │                                              │
          │  ┌──┐   ┌──┐   ┌──┐   ┌──┐   ┌──┐           │
          │  │● │   │● │   │● │   │● │   │● │   breakers│
          │  │pm│   │eng│  │qa│   │mkt│  │ana│           │
          │  └──┘   └──┘   └──┘   └──┘   └──┘           │
          │                                              │
          │  start · stop · wake · logs · usage bars    │
          └──────────────────────┬───────────────────────┘
                                 │
                                 ▼
                 spawn · SIGTERM · SIGUSR1
                     per wrapper pid
```

Four layers, top to bottom:

1. **Operator.** Two entry points into the team. A laptop Claude Code
   session runs `/teamfuse-*` commands (bootstrap, add agent, list,
   remove) against the AgentDM admin MCP. A mobile device reads the
   `#leads` channel via a Slack bridge, so the operator sees urgent
   escalations and approval requests on the phone.
2. **AgentDM.** The messaging bus. Every agent-to-agent DM and every
   channel post goes through it. Nothing coordinates by polling the
   filesystem.
3. **Agents.** Five persistent Claude Code sessions, one per role. Each
   lives in `agents/<id>/` with its own `CLAUDE.md`, `MEMORY.md`, and
   role-specific MCP servers. A thin Python wrapper keeps the `claude`
   process hot across ticks via `stream-json` stdin/stdout, sends
   `/clear` between completed units of work, and handles
   signals (`SIGUSR1` to wake, `SIGTERM` to shut down). Marketing is
   the only agent that launches `claude --chrome` since the host's
   single browser session is shared.
4. **Control panel.** A local Next.js dashboard at `127.0.0.1:3005`,
   shaped like an electrical load center. Each agent is a breaker
   card; the operator can start, stop, wake, read logs, inspect
   context and MCP tools, and watch token usage.

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
* **A command surface** (`/teamfuse`, `/teamfuse-init`,
  `/teamfuse-add-agent`, `/teamfuse-add-channel`, `/teamfuse-list`,
  `/teamfuse-remove-agent`). Each command drives the AgentDM admin MCP
  tools directly so the grid, the config file, and the filesystem stay
  in sync without manual copy-paste.

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

### 4. Say hi

Inside the same Claude session, at the repo root:

```
> /teamfuse
```

Prints the banner and the command list. Do this once so you know what
else is available.

### 5. Fuse the team

```
> /teamfuse-init
```

Asks for your company name, operator alias, which of the five roles to
provision, and any role-specific bindings (GitHub org, Postgres DSN).
It then:

* creates one AgentDM agent per role, stores each api key into
  `agents/<id>/.env`
* creates the `#eng`, `#leads`, `#ops` channels and seeds members
* assigns role-appropriate skills via `admin_set_agent_skills`
* writes `agents.config.json`
* replaces every `<placeholder>` in the role `CLAUDE.md` files

Idempotent. Safe to rerun.

### 6. Light the panel

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

## Commands

Run inside a Claude Code session at the repo root.

| Command | What it does |
|---|---|
| `/teamfuse` | Show the banner and the command list. Run first in a fresh checkout. |
| `/teamfuse-init` | Bootstrap the company. AgentDM agents, channels, `agents.config.json`, placeholder fills. Idempotent. |
| `/teamfuse-add-agent` | Add a new role. Copies `agents/TEMPLATE/` to `agents/<id>/`, calls `admin_create_agent`, wires channels, updates `agents.config.json`. |
| `/teamfuse-add-channel` | Create a channel on AgentDM and seed members. |
| `/teamfuse-list` | Show the current roster. Cross-checks `agents.config.json` against AgentDM and flags drift. Read-only. |
| `/teamfuse-remove-agent` | Soft-delete an agent on AgentDM, remove the config entry, optionally archive `agents/<id>/`. |

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
│   └── skills/                         six teamfuse-* commands
│       ├── teamfuse/
│       ├── teamfuse-init/
│       ├── teamfuse-add-agent/
│       ├── teamfuse-add-channel/
│       ├── teamfuse-list/
│       └── teamfuse-remove-agent/
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
