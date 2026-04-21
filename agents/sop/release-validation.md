# Release validation protocol

**No release is shipped until both gates are green:**

1. `@qa-bot` prod smoke suite passes (functional correctness).
2. `@eng-bot` verifies host logs are clean for the deploy window (runtime
   health).

If either gate is red, `@eng-bot` decides rollback vs forward-fix.
`@pm-bot` does not post `[RELEASE]` until both gates are green. This
protocol applies to every release regardless of size.

## Roles

* `@eng-bot`. Cuts the release, runs the log check, owns the shipped vs
  rolled-back decision.
* `@qa-bot`. Runs the prod smoke suite, signs off or rejects.
* `@pm-bot`. Announces only when both gates are green, announces
  rollback if either is red.

## Sequence

### 1. `@eng-bot` cuts the release

Tag the version, trigger deploy (per `<repo>/RELEASE.md`), wait for the
post-deploy job to finish. Record `RELEASE_START = <ISO8601 UTC>`. This is
the earliest timestamp you will scan in the log check below.

### 2. `@eng-bot` to `@qa-bot` DM handoff

Format: `RELEASE <version> | <sha> | <deploy URL> | <changelog>`. Wake
`@qa-bot` after the DM.

### 3. `@qa-bot` prod smoke

Runs the fixed bundle defined in the `@qa-bot` CLAUDE.md
("Release-verification path"). Archives reports under
`qa-bot/test-reports/prod/<version>/`.

* Green: DM `@eng-bot`
  `RELEASE <version> QA-VERIFIED, N passed, p95 <latency>ms, report: <path>`.
* Red: DM `@eng-bot`
  `RELEASE <version> QA-FAILED, <failing assertion>, report: <path>`. Stop.
  `@eng-bot` decides rollback vs forward-fix. Do not proceed to step 4.

`@qa-bot` never announces a release. Only `@pm-bot` does, and only after
both gates are green.

### 4. `@eng-bot` host log check

Only runs if QA was green. Window: `RELEASE_START` to `now`, at least 5
minutes of live traffic, longer is better.

**What to scan for:**

* Any line at log level `ERROR`, `FATAL`, or `WARN` that references the
  deployed service.
* HTTP 5xx spikes above baseline (compare pre-release minute with
  post-release minute).
* Unhandled promise rejections, uncaught exceptions, OOM kills, crash
  loops.
* Deploy-time warnings that indicate a partial rollout (missing env var,
  failed migration, stuck queue consumer).
* Only for the services affected by this release. Do not page on noise
  from unrelated services.

**How to scan (fallback chain):**

1. Host MCP server log tool (if configured).
2. Host dashboard log view (time range filter).
3. If neither is reachable in a tick, DM the operator
   `RELEASE <version> needs log check; MCP and dashboard unreachable,
   can you confirm the deploy window is clean?`. Do not announce the
   release while this is outstanding.

**Verdict:**

* Clean: DM `@pm-bot`
  `RELEASE <version> SHIPPED, QA green plus host clean (<N> lines scanned,
  <window>). <one-line user-visible summary>. QA report: <path>`.
* Dirty: DM `@pm-bot` and `@qa-bot`
  `RELEASE <version> ROLLING BACK, QA green but host shows <error signature>,
  <count> occurrences in <window>`. Roll back or forward-fix per severity.
  Log the errors on the release card.

### 5. `@pm-bot` announcement

Posts `[RELEASE]` to the leads channel only on `@eng-bot`'s SHIPPED DM
(both gates green). If the DM says ROLLING BACK, post
`[RELEASE] <version> rolled back, <reason>` instead. Never infer that a
release shipped from other signals.

## Release log format

`@eng-bot` appends one line per release to `./release-log.md`:

```
<ts> | <version> | <sha> | shipped|rolled-back|forward-fix | qa:<green|red> | host:<clean|dirty|unknown> | <qa report path>
```

## Hard rules

* Never skip the host check because QA was green. Green QA does not see
  runtime errors that only appear under real traffic.
* Never scan windows shorter than 5 minutes. Cold-start noise dominates
  the first minute.
* Never interpret a single stray WARN as dirty unless it is in the
  deployed service AND references a code path the release touched.
* Never announce a release on partial signal. If host logs are
  unreachable, the release is not shipped until a human confirms.
* Never roll back without leaving a trace. Log the exact error signature.
