---
name: teamfuse
description: Show the teamfuse banner and the list of teamfuse commands. Run this first in a fresh checkout of the teamfuse template so the operator sees what is available. Trigger on /teamfuse, /teamfuse help, "show teamfuse commands", or similar.
trigger_keywords: [teamfuse, /teamfuse, teamfuse help, teamfuse commands]
---

# teamfuse

Print the banner, the one-line pitch, and the command list. Nothing
else. No MCP calls, no file writes. This is the welcome screen.

## Output

Print verbatim:

```
 ████████╗███████╗ █████╗ ███╗   ███╗███████╗██╗   ██╗███████╗███████╗
 ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██║   ██║██╔════╝██╔════╝
    ██║   █████╗  ███████║██╔████╔██║█████╗  ██║   ██║███████╗█████╗
    ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║██╔══╝  ██║   ██║╚════██║██╔══╝
    ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║     ╚██████╔╝███████║███████╗
    ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝      ╚═════╝ ╚══════╝╚══════╝

        Fuse Claude Code agents into a working team.

Commands:

  /teamfuse                   Show this banner and command list.
  /teamfuse-init              Bootstrap the company. First thing to run in a
                              fresh checkout. Creates AgentDM agents and
                              channels, writes agents.config.json, fills
                              placeholders.
  /teamfuse-add-agent         Add a new agent. Copies agents/TEMPLATE/ to
                              agents/<id>/, calls admin_create_agent, wires
                              it into channels, updates agents.config.json.
  /teamfuse-add-channel       Create a channel on AgentDM and seed members.
  /teamfuse-list              Show the current roster (agents + channels),
                              cross-checked between agents.config.json and
                              the AgentDM grid.
  /teamfuse-remove-agent      Soft-delete an agent on AgentDM and remove
                              it from agents.config.json.

Docs:

  README.md                   quickstart + what you get
  SETUP.md                    long-form walkthrough
  docs/architecture.md        how the pieces fit
  docs/streaming-agent-loop.md  the persistent Claude Code loop
  docs/agentdm-integration.md  accounts, aliases, channels
  docs/creating-agents.md     hand-adding roles
  docs/operator-guide.md      daily ops
  docs/extending.md           MCP servers, skills, guardrails

Prerequisites:

  * Node 18.17+
  * Python 3.10+
  * Claude Code CLI
  * AgentDM account with the plugin installed (/plugin install agentdm@agentdm)

Next step if this is a fresh checkout:
  /teamfuse-init
```

## Rules

* No MCP calls. This is a pure display command.
* Do not truncate the banner.
* If the operator asks a follow-up question after the banner, answer
  normally using your context; do not invoke another teamfuse-* skill
  unless they explicitly type a slash command.
