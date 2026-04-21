# Wake protocol, short-circuiting a teammate's backoff

Every agent wrapper uses exponential backoff. Idle ticks grow from
`MIN_SLEEP` up to `MAX_SLEEP` (roughly one hour by default). That is
deliberate: it keeps token burn low on quiet days. It is also a problem
when you just queued actionable work for a teammate and they are mid
backoff. Their inbox can sit for up to an hour.

The control plane exposes a wake endpoint that any agent can call. It
sends SIGUSR1 to the target wrapper, which kills its current `sleep` and
starts the next tick within seconds. If the target is not sleeping
(mid-tick), it is a no-op. Safe to call either way.

## The command

```bash
curl -sS -X POST http://127.0.0.1:3005/api/agents/<agent-id>/wake
```

`<agent-id>` is the registry id (the `id` field in `agents.config.json`),
not the `@alias`. Response is JSON: `{ok, sent, pid, message}`.

* `sent: true`: SIGUSR1 delivered, target will tick within seconds.
* `sent: false`: target is not running. Not a failure; starting an agent
  is the operator's call, not yours. Move on.

## When to wake

| Scenario | Wake? |
|---|---|
| You DM'd a teammate a card id they need to pull | yes, once |
| You promoted a production-incident bug to `Todo` and DM'd the assignee | yes, immediately |
| You finished a PR and DM'd `@qa-bot` for smoke | yes |
| QA failed and DM'd Eng about a rollback | yes |
| You detected a prod data anomaly and DM'd Eng | yes |
| Teammate is idle but you have no new work for them | no, backoff exists to save tokens |
| You only edited a card they are already working | no, natural tick |
| Non-urgent question via DM | no, DMs are fine at normal cadence |
| You already woke them once in this tick | no, no double-wake |
| You want to check they are alive | no, check their `status.json` instead |

**Guiding principle.** Wake only when you just produced actionable work
that should not wait for their next natural tick. Every wake costs them a
full tick's worth of tokens; cheap for urgent work, wasteful for routine
traffic.

## Safety

* Sending the signal to a teammate who is not sleeping is a no-op. The
  wrapper's `trap wake_from_sleep USR1` runs `kill %1 2>/dev/null || true`,
  which silently does nothing when there is no backgrounded `sleep` to
  kill. The in-flight `claude` never receives the signal; the wake targets
  only the wrapper's pid, not the process group.
* Waking an agent that is not running returns `{ok: true, sent: false}`.
  Not an error and not a reason to escalate.
* Wake is fire and forget. Read the response only if you care about the
  `sent` flag.

## Audit trail

Every agent logs outbound wakes to `./wake-log.md` in its own working
directory, one line per call:

```
<ISO8601> | <target-agent-id> | <one-line reason> | result=<sent|not-running|error>
```

If your `wake-log.md` shows more than ~20 entries per day targeting the
same teammate, you are being chatty. Self-audit and back off. Waking is
not a substitute for batching work into fewer, higher quality DMs.

## Who can wake whom

Everyone can wake everyone. There is no per-agent allow list. The control
plane trusts the localhost boundary; if you are running, you are already
inside it.
