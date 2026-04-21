# Card lifecycle

Single source of truth for how work moves through the board. Every agent
reads this.

```
#proposals message
      │
      ▼
  Backlog       ← created by @pm-bot (or operator-seeded with Source: operator)
      │         @pm-bot fleshes out acceptance criteria, sets Agent and Type
      ▼
   Todo         ← @pm-bot promotes when Backlog is head-of-queue and WIP allows
      │         assigned agent picks it up
      ▼
In Progress    ← agent pulls, announces in role channel, updates status.state
      │         agent does the work
      ▼
Waiting for   ← agent moves here, fills Output link (PR URL, draft path, report)
  Review        DMs <operator> once, never pings again until moved
      │
      ▼
 Reviewed      ← <operator> moves here with comments
      │         agent iterates on comments, re-posts to Waiting for Review
      │         OR @pm-bot moves card forward if comments are approval-only
      ▼
   Done         ← @pm-bot moves here (agents never self-Done), PR merged, card archived weekly
```

## Hard rules

* Agents never move their own card to `Done`. Only `@pm-bot` does, and only
  after seeing operator approval.
* Agents never skip columns. No Backlog to In Progress, no Todo to Waiting.
* `Output link` must be filled before Waiting for Review. An empty
  `Output link` is a WIP rule violation.
* `Agent` field is mandatory on every card leaving Backlog.
* Only `@pm-bot` writes acceptance criteria. Other agents can propose them
  in comments; `@pm-bot` ratifies.

## When a card stalls

* `Waiting for Review` over 48h: `@pm-bot` nudges `<operator>`.
* `Reviewed` over 48h with no agent iteration: `@pm-bot` re-pings the
  assigned agent.
* `In Progress` over 7d: `@pm-bot` asks the agent for a status update,
  considers splitting the card.
