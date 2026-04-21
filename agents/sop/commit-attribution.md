# Commit, PR, and comment attribution

Every git operation and every AgentDM message from a bot-authored session
includes an agent tag. Since all bot agents typically share one GitHub
identity, the prefix is the only attribution the commit history has.

## Git commits

Subject line prefix:

```
[agent: eng-bot] <normal commit subject>
[agent: qa-bot]  <normal commit subject>
[agent: marketing] <normal commit subject>
```

Body footer (always, even on squash merges):

```
Co-Authored-By: <company-slug>-<agent> <noreply@<your-domain>>
Agent-Session: <ISO8601 start time>
```

Example after the bootstrap flow has filled placeholders:

```
Co-Authored-By: acme-eng-bot <noreply@acme.dev>
Agent-Session: 2026-04-20T17:00:00Z
```

## PR titles

Same `[agent: <name>]` prefix. PR body includes a reference to the board
card (`Closes card <project-url>?item=<id>`).

## PR or issue comments

Prefix with `[@<agent>]` so readers can distinguish which agent spoke in
the thread.

## AgentDM messages

No prefix needed. `send_message` stamps the sender identity.

## Rationale

One shared bot account obscures attribution. The prefix is enforced by
`@pm-bot` (audits during the board sweep) and by `@qa-bot` (refuses to
test any PR without the tag).
