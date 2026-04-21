# Board integration

Teamfuse ships with GitHub Projects as the default Kanban backend. The
agents also work against Linear, Jira, Trello, Notion, or any board
that can be driven by an MCP server or a CLI with basic CRUD. Only the
transport changes; the card model the agents reason about stays the
same.

## The card model

Every agent reads and writes cards with the same shape regardless of
provider.

| Field | Type | Purpose |
|---|---|---|
| `id` | string | Stable identifier unique within the board |
| `title` | string | One-line summary |
| `status` | enum | `Backlog`, `Todo`, `In Progress`, `Waiting for Review`, `Reviewed`, `Done` |
| `agent` | enum | Which teamfuse agent owns the card |
| `type` | enum | `feature`, `bug`, `content`, `research`, `product-feedback`, `test`, `seo`, `browser-task` |
| `source` | enum | `operator`, `team-proposal`, `analyst-insight`, `pm-generated` |
| `output-link` | string | PR URL, draft path, report path |
| `release` | string | Optional, on release-tagged bug cards |

Transitions flow per [`agents/sop/card-lifecycle.md`](../agents/sop/card-lifecycle.md).
Every SOP in `agents/sop/` is written against this model, not against
a specific provider.

## Default: GitHub Projects v2

Out of the checkout the agents call `gh` and `gh api graphql` to read
and move cards. The bootstrap skill (`/teamfuse-init`) asks for the
project URL, resolves the project node ID and the six field IDs,
writes them into `agents/pm-bot/MEMORY.md`, and the PM agent picks
them up automatically.

Reference commands the PM uses:

* `gh project item-list <project-id>` for the board sweep.
* `gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(...) }'`
  to move a card between columns or fill a field.
* `gh project item-add <project-id> --url <issue-url>` to create.

Why GitHub by default: the agents share a bot GitHub identity with the
operator for commit attribution anyway, so the `gh` CLI is already
authenticated. Zero extra auth.

## Swapping to another board

Two changes per provider.

### 1. Add the board's MCP server to `agents/pm-bot/.mcp.json`

| Provider | MCP server | Notes |
|---|---|---|
| GitHub Projects | `gh` CLI, built in | Default. No extra MCP. |
| Linear | `@tacticlaunch/mcp-linear` or similar | Use `create_issue`, `update_issue`, `list_issues`. Map `status` to Linear workflow states. |
| Jira | `mcp-atlassian` or similar | Map the six teamfuse statuses to Jira workflow states once. Store the map in `agents/pm-bot/MEMORY.md`. |
| Trello | A Trello MCP or the Trello REST API | Lists map to statuses. Free-tier Trello has no custom fields, so use labels for `agent` and `type`. |
| Notion | A Notion MCP server pointed at a database | Define the six status options as a Notion Select property. `agent` and `type` as Multi-select. |

### 2. Replace the board calls in `agents/pm-bot/CLAUDE.md`

Everywhere the PM agent calls `gh ...` for board reads or writes, swap
in the equivalent MCP tool call for your provider. Keep the card
fields identical so the other agents do not notice the swap.

The bootstrap skill currently resolves GitHub Project IDs
automatically. For other providers, fill the bindings in
`agents/pm-bot/MEMORY.md` by hand, or extend the skill to call the
provider's lookup API before it writes `MEMORY.md`.

## What stays the same across providers

* Every file under `agents/sop/`. The card lifecycle, WIP rules, wake
  protocol, commit attribution, and release validation are
  provider-agnostic.
* Every non-PM agent's polling loop. They read and write cards through
  `@pm-bot` via DMs, not directly, so the board backend is invisible
  to them.
* The PR review protocol, which lives on GitHub PRs (since that is
  where the code lives) and is independent of where the cards live.
* The streaming agent loop and the control plane.

## What changes

* `agents/pm-bot/CLAUDE.md`: the sections that name `gh` commands.
* `agents/pm-bot/.mcp.json`: the new provider's MCP server.
* `agents/pm-bot/MEMORY.md`: the bindings (project ID, field IDs,
  status map).
* `agents/eng-bot/CLAUDE.md`: only the `Closes card <url>` format used
  in PR bodies, since that URL points at the board.

## Keeping the board and the code separate

GitHub Projects and GitHub PRs are two different surfaces. Even if you
move the board to Linear or Jira, the code still lives in GitHub and
the PR review protocol in
[`agents/sop/pr-review-protocol.md`](../agents/sop/pr-review-protocol.md)
stays intact. Eng opens a PR on GitHub, QA smokes it on GitHub, and
the PM posts a link to the non-GitHub board card in the PR body.

## A minimal sanity check

Regardless of provider, these five calls must work from a PM tick:

1. Read all cards whose `agent` field is a specific teamfuse alias.
2. Read a single card's full field set.
3. Move a card between any two columns.
4. Write to the `output-link` field.
5. Create a card with `status: Backlog` and fields populated.

If your provider can do those five, teamfuse can use it.
