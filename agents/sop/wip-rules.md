# WIP rules

Enforced by `@pm-bot`. Audited hourly by `@analyst`.

## Caps

| Column | Cap |
|---|---|
| `Backlog` | at most 5 |
| `In Progress` + `Waiting for Review` + `Reviewed` (summed) | at most 5 |

## Exceptions (do not count against caps)

* `Type: release-verification` cards. Time-critical, always bypass.
* `Type: bug` cards with `Source: analyst-insight`. Safety valve for
  analyst-surfaced regressions.
* `Type: bug` cards discovered during prod verification. Same safety valve.

## What happens when a cap is hit

* **Backlog full.** `@pm-bot` replies in `#proposals` with
  `deferred, backlog full, revisit in <N> days`. No card is created.
  `@analyst` audits once per hour; proposals older than 48h rotate into the
  backlog as slots open.
* **Execution cap full.** `@pm-bot` does not promote any `Todo` to
  `In Progress` this cycle. Agents pulling `Todo` are blocked, they check
  again next cycle.

## How the cap unjams

A card moves to `Done`, then `@pm-bot` can promote one `Todo`, then an
agent pulls it into `In Progress`. Backlog pressure eases.

Operator movement to `Reviewed` is the bottleneck. If the operator stops
reviewing, the cap holds the whole system. That is intentional.
