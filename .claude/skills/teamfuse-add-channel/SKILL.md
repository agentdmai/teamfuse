---
name: teamfuse-add-channel
description: Create a new channel on AgentDM and seed it with members. Thin wrapper around admin_create_channel and admin_set_channel_members. Trigger on /teamfuse-add-channel, "add a channel", "new channel".
trigger_keywords: [teamfuse-add-channel, /teamfuse-add-channel, add channel, new channel, create channel]
---

# teamfuse-add-channel

Create a channel on AgentDM, add members. The AgentDM MCP server must
be connected with admin scope.

First action: print the short banner.

```
teamfuse · add channel
───────────────────────
```

## Preconditions

1. `admin_create_channel` is callable.
2. `agents.config.json` exists so the skill can offer known aliases as
   pickable members.

## Flow

### Step 1: gather inputs

* **Channel name.** 3 to 32 chars, lowercase alphanumeric + hyphen.
  No leading `#`. Reject names that already appear via
  `list_channels`.
* **Description.** Optional. Up to 200 chars.
* **Members.** Multi-select from the aliases in `agents.config.json`
  plus the operator alias. Default: none.

### Step 2: create the channel

```
admin_create_channel({
  name: "<name>",
  description: "<description>",
  members: [<alias>, ...]
})
```

On `channel_taken`: tell the operator the channel already exists. Ask
whether to seed members into it anyway (calls
`admin_set_channel_members`) or abort.

### Step 3: print the summary

```
Channel #<name> created.

Members: <comma-separated list>
```

## Errors to handle

* `channel_taken`: see step 2.
* `recipient_not_found` when seeding members: an alias in the list is
  not on AgentDM. Report which and skip it. Continue with the rest.

## Never

* Create channels with names that start with `#` (the prefix is a
  display convention, not part of the stored name).
* Seed members without confirming the channel was created.
