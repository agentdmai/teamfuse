# SOP: agent DB access

**Policy: agents only read from the database. No agent holds write
credentials.**

## What this means

* Every agent that queries a production database does so via a SELECT-only
  role.
* No agent has `psql`, a write-capable DB MCP, or any other interactive DB
  tool in its `.mcp.json`.
* Schema changes reach production only through the deploy pipeline's
  migration step, run after a PR merge. Never from an agent's interactive
  session. There is no path that applies an uncommitted schema diff.
* Data deletions (retention, GDPR, incident cleanup) are never baked into
  a migration. The operator runs them manually, out of band, after review.

## Starter kit

| Agent | DB access | Role | Enforced by |
|---|---|---|---|
| `@analyst` | yes, full DB read | `analyst_ro` (SELECT only) | `agents/analyst/setup/analyst-ro.sql`, Postgres MCP `BEGIN READ ONLY` wrapper |
| `@eng-bot` | none, writes schema via PR and pipeline | n/a | no postgres server in `.mcp.json` |
| `@pm-bot` | none | n/a | no postgres server |
| `@qa-bot` | none | n/a | no postgres server |
| `@marketing` | none | n/a | no postgres server |

## Adding a new agent with DB access

1. Create a new SELECT-only role in `setup/<agent>-ro.sql` (copy the
   analyst pattern). Grant only what the agent needs. Prefer a
   column/view allowlist over `GRANT SELECT ON ALL TABLES` when the data
   is sensitive.
2. Land the SQL file and the DSN change in a PR. The PR body must name
   which tables and columns the role can see, and why.
3. The operator approves the PR explicitly. No agent is auto-granted
   access.
4. Use the reference `@modelcontextprotocol/server-postgres` (which wraps
   queries in `BEGIN READ ONLY` as a second layer of defence) or an
   equivalent read-only client.

## Never

* Grant `INSERT`, `UPDATE`, `DELETE`, or DDL privileges to any agent
  role.
* Give an agent the application's service role or superuser DSN.
* Put row-deleting or table-dropping SQL in a migration file.
* Bypass the committed migration path.

## Why

Historical incidents in the industry: automated migrations have dropped
tables, rewritten columns, or deleted rows due to an agent confusing
staging for production. Two standing defences combined (read-only role at
the database, migrations that never delete data) make a repeat incident
require a deliberate, human-executed action rather than an agent mistake.
