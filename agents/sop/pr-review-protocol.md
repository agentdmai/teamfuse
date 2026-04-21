# PR review protocol (comment-based, QA-gated)

Every code PR goes through a fixed sequence. The review step uses PR
comments, not GitHub's native Approve button, because bot agents and the
operator typically share one GitHub identity. GitHub blocks self-approval
from the same account. If you have a separate operator GitHub account
with write access, you can retire this SOP in favour of native approvals.

## The sequence (strict, no steps skipped)

### 1. Author opens a draft PR

* Author is `@eng-bot` (code) or `@marketing` (content, docs). Subject
  prefix `[agent: <handle>]`, footer per `commit-attribution.md`.
* Author fills the card `Output link` with the PR URL and moves the card
  to `Waiting for Review`.
* Author DMs `@qa-bot` with the PR URL and wakes them.
* Author does not DM the operator yet. The operator is blind to the PR
  until QA signs off.

### 2. `@qa-bot` smoke (gate before operator review)

* QA checks out the branch and runs the role's test suite (vitest,
  playwright, newman, etc. see the `@qa-bot` CLAUDE.md for the exact
  command bundle).
* Green: posts a top-level PR comment:
  ```
  [QA] smoke green, <counts>, p95 <ms>, report: <path>
  ```
  Then flips the PR out of draft (`gh pr ready <num>`) and DMs `@eng-bot`
  and `@pm-bot`.
* Red: posts a top-level PR comment:
  ```
  [QA] smoke red, <failing assertion>, report: <path>
  ```
  Leaves the PR in draft and DMs `@eng-bot`. Stop. Review does not reach
  the operator.
* If the PR is missing the `[agent: <handle>]` prefix or the
  Co-Authored-By footer, QA refuses to smoke. It comments on the PR
  linking this SOP and DMs the author.

### 3. `@pm-bot` surfaces the PR to the operator

On a `[QA] smoke green` comment AND the PR out of draft, `@pm-bot` DMs
`<operator>` once:

```
PR <url> ready for operator review, QA green, card <id>, <one-line summary>
```

Never DM the operator about a PR still in draft or still red in QA. If the
operator has not commented after 48h, ping once more. At 72h escalate to
the leads channel as `[STATUS]`.

### 4. Operator reviews and posts a top-level PR comment

Comment convention. One line, starts with one of these tokens
(case-insensitive, no leading whitespace):

| Token | Meaning | Next board state |
|---|---|---|
| `approve` | Approved as-is. Author may merge. | `Reviewed` |
| `approve with nits: <note>` | Approved, nits are follow-ups, not blockers. | `Reviewed` |
| `not approve: <reason>` | Changes required before merge. | `In Progress` |
| `changes requested: <reason>` | Same as `not approve`. | `In Progress` |
| `hold: <reason>` | Pause, more info or a decision needed. | stays `Waiting for Review` |

Anything not starting with one of those tokens is a regular comment. It
does not trigger a board move.

### 5. `@pm-bot` scans PR comments and moves the card

Every tick, for each card in `Waiting for Review`, `@pm-bot` reads the
PR's top-level comments (newest first). If the most recent operator
comment starts with an approval or rejection token, move the card and DM
the author.

* `approve*`: card to `Reviewed`, DM author
  `[PM] PR <url> approved, merge when ready`.
* `not approve*` or `changes requested*`: card to `In Progress`, DM
  author with the comment body.
* `hold: ...`: card stays, DM author the hold reason.

### 6. Author merges

On `Reviewed`, the author (not the operator, not `@pm-bot`) merges via
`gh pr merge <num> --squash` (or the repo's default strategy). Author
moves the card to `Done` after merge and after any post-deploy gates
(see `release-validation.md` for release PRs).

### 7. `@pm-bot` closes the loop

On a `Done` move, no announcement unless this is a release. Release
announcements live in `release-validation.md`.

## Hard rules

* Operator is never DM'd about a PR still in draft or red in QA.
* `@eng-bot` and `@marketing` never self-merge before the `approve*`
  comment lands.
* `@qa-bot` never flips a PR out of draft on red smoke.
* `@pm-bot` only recognises the five tokens above. Free-form operator
  comments like "looks good" do not move the card; they are a nudge for
  the operator to re-comment with the proper token.
* The approval comment must come from the operator's GitHub identity.
  Comments from bot identities are ignored for review purposes.
