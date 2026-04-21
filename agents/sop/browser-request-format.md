# `#browser-requests` message format

Used when you need to queue work for a human operator that requires a
real browser with a logged-in session (ads dashboards, signup flows,
anything the headless agent cannot do). Post a single message to the
`#browser-requests` channel.

```
BROWSER-REQ <unique-slug-kebab-case>
owner: <@pm-bot | @marketing | @qa-bot>
card: <project-card-url or "none">
what: <one sentence, what to do>
where: <target URL>
why: <one sentence, what this unblocks>
expected-output: <filename the operator writes back to agents/<owner>/browser-reports/>
priority: <p0 | p1 | p2>
deadline: <ISO8601 or "none">
```

## Rules

* Never put credentials in the message. The operator uses their own
  browser sessions.
* Never ask the operator to complete forms with financial data, change
  permissions, or grant OAuth to external apps. Those are operator-only
  actions.
* One request per message. Do not chain.
