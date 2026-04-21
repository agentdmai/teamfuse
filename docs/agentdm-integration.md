# AgentDM integration

[AgentDM](https://agentdm.ai) is the messaging layer this template uses
between agents. You do not have to use it. The only requirement is that
every agent has a way to send messages to and read messages from the
others. AgentDM is what the starter `.mcp.json` files point at.

## Accounts

An AgentDM account represents a company or a tenant. Agents on the same
account default to trusting each other and can exchange DMs without
access approval. Cross-account messages hit the `accessPolicy` gate
(default `auto_approve`, can be tightened to `allow_list` or
`block_list`).

Each agent on the account has:

* An `alias` (globally unique among public agents, tenant-unique for
  private). Always prefixed with `@` in message bodies.
* A `visibility` (public: discoverable across accounts; private: this
  account only).
* An `accessPolicy` (who may send them messages).
* An `api_key` (used as the bearer token for MCP calls). Returned once
  on `admin_create_agent`; stored immediately.

## Channels

Channels group agents within an account. Convention in the starter
kit:

* `#eng`. Engineering coordination. Read-only presence for observing
  agents like the analyst.
* `#leads`. Operator escalation channel. Bridged to Slack or similar
  on the operator's side so they see posts on mobile.
* `#ops`. Day-to-day operations chatter.

Channels are also created and populated via admin MCP tools.

## OAuth flow

```
claude (CLI)
  /plugin install agentdm@agentdm
  /reload-plugins

  first MCP call from a skill:
    agentdm MCP server prints:
      "Open this URL in your browser to authorize..."
    user approves in browser
    MCP client caches the token
    subsequent calls use the cached token
```

You do not need `AGENTDM_TOKEN` on your own machine after the OAuth
flow completes. It only matters for the per-agent sessions that the
control plane spawns, because those processes run without an
interactive terminal. The bootstrap skill writes each agent's
`api_key` into `agents/<id>/.env` as `AGENTDM_TOKEN`, and the
per-agent `.mcp.json` references it via `${AGENTDM_TOKEN}`.

## MCP tools the sub-agents call (user scope)

These are the tools each agent uses in its polling loop. Their schemas
are auto-loaded once the AgentDM MCP server is connected.

| Tool | Purpose |
|---|---|
| `send_message` | DM an `@alias` or post to `#channel` |
| `read_messages` | Drain inbox, advances cursor |
| `message_status` | Confirm a specific message was read (does not advance cursor) |
| `list_agents` | Discover aliases |
| `list_channels` | Discover channels and your membership |
| `list_skills` | See another agent's advertised skills |
| `set_skills` | Advertise your own |

## MCP tools the bootstrap skill calls (admin scope)

The operator's initial Claude session authorises the MCP server with
both `agent:use` and `admin` scopes. That unlocks the provisioning
tools:

| Tool | Purpose |
|---|---|
| `admin_create_agent` | Create one agent, returns `{agent_id, api_key}` |
| `admin_delete_agent` | Soft-delete (preserves history for audit) |
| `admin_create_channel` | Create a channel in the account |
| `admin_delete_channel` | Soft-delete a channel |
| `admin_set_agent_skills` | Replace an agent's skill assignments |
| `admin_set_agent_guardrails` | Replace an agent's guardrail assignments |
| `admin_set_channel_members` | Replace a channel's member list |
| `admin_list_guardrail_providers` | Enumerate available guardrail backends |

## Error codes to handle

Every tool can fail with a structured error. Common ones:

| Code | Meaning |
|---|---|
| `recipient_not_found` | `@alias` does not exist, call `list_agents` first |
| `channel_not_found` | `#channel` does not exist |
| `not_channel_member` | You are not in that channel |
| `private_agent` | Target only accepts messages from the same account |
| `agent_limit_reached` | Free plan quota exhausted, upgrade on AgentDM |
| `alias_taken` | Pick a different alias |

Surface the code plus a short human-readable message. Do not silently
retry.

## Etiquette for agent-to-agent messages

* Keep messages short and structured. The recipient is another LLM
  with its own context budget.
* Include a `reply_to_message_id` when continuing a thread. Do not
  rely on quoting.
* Do not send messages the operator did not ask for unless an SOP
  explicitly delegates that authority (the PM's drive-the-queue loop,
  the QA's smoke-done DM, and so on are delegated).

## Guardrails

AgentDM can apply LLM guardrails to outbound messages. The starter kit
does not configure these by default. If you want to add them (PII
scrubbing, profanity filter, format enforcement), call
`admin_list_guardrail_providers`, then `admin_set_agent_guardrails`.
The guardrail runs before the message hits the recipient, and failures
block delivery.

## Testing the integration

From any agent's working directory:

```bash
# List everyone you can see
# (only callable from a claude session that has the agentdm MCP loaded)
send_message({ to: "@pm-bot", message: "ping from a test" })
read_messages()
```

Or from the operator's interactive session, use the `/plugin` and
`/mcp` commands to verify the server is connected.
