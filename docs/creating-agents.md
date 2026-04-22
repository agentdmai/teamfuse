# Creating a new agent

Three paths. Pick the one that fits.

## Runtime choice

Every agent runs under one of two runtimes. Choose before you start:

| Runtime | CLI | Session model | Instruction file |
|---|---|---|---|
| `claude` (default) | Claude Code CLI | Persistent stream-json session, `/clear` between tasks | `CLAUDE.md` |
| `copilot` | GitHub Copilot CLI | Stateless per-tick (`copilot -p`), `--resume` for continuity | `AGENTS.md` |

The `agents/TEMPLATE/` skeleton contains both `CLAUDE.md` and
`AGENTS.md` with identical placeholder structure. Fill the one that
matches your chosen runtime; the other can be left or deleted.

## Path A: one of the starter roles is close to what you want

1. Edit the instruction file for the agent's runtime:
   `agents/<id>/CLAUDE.md` (claude) or `agents/<id>/AGENTS.md` (copilot).
   Replace sections, tighten the polling loop, trim rules you do not want.
2. Edit `agents/<id>/MEMORY.md`. Replace placeholder bindings.
3. Edit `agents/<id>/.mcp.json` to add or remove MCP servers.
4. If the role changed significantly, ask the bootstrap skill to
   update the AgentDM agent's skills via `admin_set_agent_skills`, or
   call it directly.

## Path B: copy the TEMPLATE skeleton

1. Copy the skeleton:
   ```bash
   cp -R agents/TEMPLATE agents/<new-id>
   ```
2. Rewrite the instruction file for your chosen runtime:
   * `agents/<new-id>/CLAUDE.md` for `claude`, or
   * `agents/<new-id>/AGENTS.md` for `copilot`.

   Include: identity (alias, skills), polling loop steps, bindings
   section (placeholders), status.json schema, hard rules.
3. Rename `.mcp.json.example` to `.mcp.json` and adjust servers.
4. Create `.env` from `.env.example` and populate `AGENTDM_TOKEN`
   after you provision the alias (step 6).
5. Add an entry to `agents.config.json` at the repo root:
   ```json
   { "id": "<new-id>", "alias": "@<alias>", "role": "<role>", "runtime": "claude", "chrome": false }
   ```
   For a copilot agent, use `"runtime": "copilot"` and omit `chrome`.
6. Provision the alias on AgentDM. Two options:
   * Re-run `/teamfuse-init`. It detects the new entry and calls
     `admin_create_agent` only for aliases that do not yet exist.
   * Or run `/teamfuse-add-agent` to add a single agent interactively.
   * Or call `admin_create_agent({ alias, visibility: "private",
     accessPolicy: "auto_approve" })` directly. Copy the returned
     `api_key` into `agents/<new-id>/.env` as `AGENTDM_TOKEN`.
7. Add the agent to relevant channels via `admin_set_channel_members`.
8. Advertise skills via `admin_set_agent_skills`.
9. Start it from the control panel.

## Path C: replace all five starter roles

If the starter lineup is not what you want at all:

1. Run `/teamfuse-init` with a custom roster. Select only the subset
   you want, or pass a different list of aliases.
2. Or delete the starter directories entirely, rewrite
   `agents.config.json` from `agents.config.example.json`, and copy
   the template skeleton for each new role.

Either way, the control plane does not care about role names; it only
reads `agents.config.json`.

## What goes in the instruction file

The agent loop reads the instruction file once per session (claude) or
once per tick (copilot) and expects it to carry operational detail.
The file is `CLAUDE.md` for claude agents and `AGENTS.md` for copilot
agents; both use identical section conventions.

Useful sections, in rough priority order:

1. **Identity.** Alias, skills, channels, working directory, which
   repos (if any) it edits. This is what other agents and the
   operator will look up first.
2. **Polling loop.** Numbered steps, what to read, what to write,
   what to do on each branch. Be explicit about ordering.
3. **Bindings.** A `<placeholder>` for each external handle (GitHub
   org, board ID, DSN, emails). The bootstrap skill replaces these;
   until it runs, every reference to the binding is a `<token>`.
4. **Hard rules.** What this agent must never do. Short, specific,
   enforced by other agents where possible.
5. **Status file schema.** What `status.json` contains. Loose shape,
   agent-defined vocabulary for `state`.
6. **References.** Links to shared SOPs, secrets file, MCP config.

Keep it tight. Every token the loop reads at the top of a tick is
paid for every tick until the session resets.

## What goes in MEMORY.md

Durable facts, hard budget 2KB. The tick prompt explicitly asks the
agent to consolidate and trim. Do not use MEMORY.md as a diary. Good
entries:

* Schema cheat sheets
* Project IDs, field IDs, channel names
* Learned operator preferences (confirmed in a previous session)
* Recurring operational gotchas that would otherwise eat ticks

Bad entries:

* Today's task list (the board is for this)
* Activity logs (the wrapper's log and the session JSONL have this)
* Quoted operator messages (the message history has this)

## Skills

Skills are role-scoped procedures that live in skill directories under
the agent's working directory. They are great for long reusable steps
that would otherwise bloat the instruction file.

**claude** agents load skills from `.claude/skills/<name>/SKILL.md`.

**copilot** agents load skills from any of these directories (all
equivalent, listed in search order):
- `.claude/skills/<name>/SKILL.md` (shared with claude — preferred)
- `.github/skills/<name>/SKILL.md`
- `.agents/skills/<name>/SKILL.md`
