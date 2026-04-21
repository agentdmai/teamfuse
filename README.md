# claude-code-company-template

A template for running a small company as a group of Claude Code agents that
cooperate over [AgentDM](https://agentdm.ai). You get five starter roles
(Product, Engineering, QA, Marketing, Analyst), a local Next.js control
panel that starts and stops each agent as a persistent Claude Code session,
and a bootstrap flow that provisions the whole thing end to end from a single
Claude conversation.

## What you get

1. `agents-web/`. A Next.js control plane, cabinet style, one breaker per
   agent. Start, stop, wake, read logs, read context, read MCP tools, see
   token usage. Binds to `127.0.0.1:3005`.
2. `agents/<role>/`. Five scrubbed sub-agent directories, each with a
   placeholder `CLAUDE.md`, a `.mcp.json.example`, a `.env.example`, and a
   spot for role-scoped skills.
3. `agents/sop/`. Shared operating procedures for the whole company: card
   lifecycle, WIP caps, wake protocol, PR review, commit attribution, release
   validation, browser request format, DB access.
4. `docs/`. How the thing is put together. The deep dive on the streaming
   agent loop lives in `docs/streaming-agent-loop.md`.
5. `.claude/skills/bootstrap-company/`. The bootstrap skill you invoke from
   a Claude session at the repo root. It asks for the handful of company
   specifics you need, provisions the AgentDM grid, and fills placeholders.

## Prerequisites

* Node 18.17+
* Python 3.10+
* [Claude Code CLI](https://docs.anthropic.com/claude/claude-code) installed
* An [AgentDM](https://app.agentdm.ai) account
* A GitHub account if you want the Eng / PM / QA roles to touch repos
* A Postgres DSN if you want the Analyst role to read a production database

## Quickstart

### 1. Clone the template

```bash
gh repo create my-company --template claude-code-company-template --public
cd my-company
```

Or clone and re-init:

```bash
git clone https://github.com/<you>/claude-code-company-template my-company
cd my-company
rm -rf .git && git init -b main
```

### 2. Install dependencies

```bash
cd agents-web && npm install && cd ..
```

### 3. Authorise AgentDM from Claude Code

Install the plugin and authorise once:

```bash
claude
> /plugin install agentdm@agentdm
> /reload-plugins
```

Claude will print an OAuth URL. Open it, approve, come back. The plugin
caches the token in the MCP client so you do not need to export it.

See `docs/agentdm-integration.md` for the full model (accounts, aliases,
channels, admin vs user tools).

### 4. Run the bootstrap flow

Still inside `claude` at the repo root:

```
> /bootstrap-company
```

The skill asks for:

* Company name (used in the UI nameplate and commit attribution)
* Operator alias (the human who reviews PRs and answers escalations)
* Which of the five starter roles to provision (default: all five)
* GitHub org, if you selected Eng, PM, or QA
* Postgres DSN, if you selected Analyst

It then calls the AgentDM admin tools to create one agent per role, seeds
three starter channels (`#eng`, `#leads`, `#ops`), assigns role-appropriate
skills, writes `agents.config.json` at the repo root, and replaces every
`<placeholder>` in each role's `CLAUDE.md` with the real value.

API keys it receives from AgentDM go into `agents/<id>/.env`. Those files
are gitignored.

### 5. Start the control panel

```bash
cd agents-web
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:3005`. You should see one breaker card per agent,
all stopped. Press Start on the first one. The wrapper forks, a persistent
Claude Code session spins up in that agent's working directory, and
`status.json` starts updating. Press the chevron to open the context,
skills, and MCP modals.

### 6. What the agents actually do

Each agent runs a polling loop defined by its `CLAUDE.md`. The PM reads
a project board, the Engineer picks up cards and commits, the QA runs
tests, Marketing drafts content, the Analyst pulls metrics. They talk to
each other and to you over AgentDM.

See `docs/architecture.md` for the full picture and
`docs/streaming-agent-loop.md` for how the Claude Code session is kept
persistent across ticks.

## Docs index

* `docs/architecture.md`. Three-piece picture: sub-agent sessions, the
  control plane, the AgentDM messaging layer.
* `docs/streaming-agent-loop.md`. Deep explainer on `scripts/agent-loop.py`.
  Why a persistent session, stdin/stdout JSON framing, control files,
  signals, backoff sleep, cost tracking.
* `docs/agentdm-integration.md`. Accounts, aliases, channels, admin vs user
  MCP tools, the OAuth flow, guardrails.
* `docs/creating-agents.md`. How to add a new role or reshape an existing
  one.
* `docs/operator-guide.md`. Daily ops. Starting, stopping, waking, reading
  logs, the master breaker, usage windows.
* `docs/extending.md`. Adding MCP servers, adding skills, optional patterns
  (Gmail intake, Google Ads automation, browser work via Chrome).

## Layout

```
.
├── README.md
├── SETUP.md
├── LICENSE
├── .gitignore
├── .claude/
│   ├── settings.example.json
│   └── skills/bootstrap-company/SKILL.md
├── .mcp.json.example
├── agents.config.example.json
├── docs/
├── agents/
│   ├── TEMPLATE/            blank agent skeleton
│   ├── pm-bot/              placeholderised starter role
│   ├── eng-bot/
│   ├── qa-bot/
│   ├── marketing/
│   ├── analyst/
│   └── sop/                 shared operating procedures
└── agents-web/              Next.js control panel
```

## License

MIT. See `LICENSE`.
