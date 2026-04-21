# The streaming agent loop

This doc explains `scripts/agent-loop.py`. It is the most important file
in the template because it decides what "a Claude Code agent" means at
runtime.

## Why a persistent session

Starting a fresh `claude` process every tick works for toy demos and
falls apart in practice:

* MCP servers take several seconds to hand-shake. Paying that on every
  tick turns a 20-second polling loop into a 30-second one and burns
  tokens reprocessing each server's tool inventory.
* `CLAUDE.md` and the skill catalogue have to be re-read and re-cached
  every tick.
* Session transcripts fragment into tiny files and become hard to
  reason about.

The wrapper spawns `claude` once per agent and keeps stdin open. Ticks
become user-prompt-submit events against the already-hot session.
Conversation history accumulates, so the wrapper clears it between
completed units of work via the `/clear` slash command. That drops
conversation context while keeping MCP servers, skills, and the parsed
`CLAUDE.md` loaded.

## The claude invocation

```
claude --print --verbose \
       --input-format stream-json --output-format stream-json \
       --include-partial-messages \
       --dangerously-skip-permissions \
       --model opusplan \
       --mcp-config .mcp.json --strict-mcp-config \
       --settings .orchestrator/session-settings.json \
       [--chrome]
```

Flags that matter:

* `--print`. Non-interactive mode. No TTY, no scrollback.
* `--input-format stream-json`, `--output-format stream-json`. Every
  user message is one JSON line on stdin; every event (system init,
  assistant delta, tool use, result) is one JSON line on stdout.
* `--include-partial-messages`. The wrapper does not use deltas, but
  leaving them on keeps future deltas queryable without a respawn.
* `--dangerously-skip-permissions`. The agent runs inside its own
  working directory on the operator's machine; prompting for
  permissions would stall the loop. Scope tightly by choosing what
  lives in `.mcp.json` and `.env`.
* `--strict-mcp-config`. Fail loudly when `.mcp.json` is malformed,
  instead of silently ignoring servers.
* `--model opusplan`. Default choice for long sessions. Override per
  role if you want Sonnet or Haiku.
* `--chrome`. Only set when `CHROME=1` is in the env (the supervisor
  passes this for agents with `chrome: true` in `agents.config.json`).

## Stdin and stdout framing

Input: one JSON line per user message.

```json
{"type": "user", "message": {"role": "user", "content": "<prompt>"}}
```

Output: one JSON event per line. The wrapper cares about three types:

* `{"type": "system", "subtype": "init", "session_id": "<uuid>"}`.
  Captured once per spawn. Used for `--resume <uuid>` on crash recovery.
* `{"type": "result", ...}`. The turn is complete. The wrapper stops
  waiting for stdout and the tick returns.
* `{"type": "__eof__"}`. Sentinel the wrapper enqueues when stdout
  closes. Triggers a respawn.

All other event types (tool use, content deltas, partial messages) are
drained but ignored. You can hook into them by editing the stdout
pump in `ClaudeSession._pump_stdout`.

## Thread model

```
main thread
 ├─ signal handlers (SIGUSR1, SIGTERM, SIGINT)
 ├─ tick loop: send() -> wait_for_result() -> sleep_with_wake()
 │
 │  owns: ClaudeSession.proc (Popen), events queue
 │
 ├─ _pump_stdout thread  (daemon)
 │     reads proc.stdout line by line
 │     json.loads, enqueues into events queue
 │     on EOF enqueues {"type": "__eof__"}
 │
 └─ _pump_stderr thread  (daemon)
       reads proc.stderr line by line
       logs to .orchestrator/agent-loop.log
```

The main thread drives ticks. `wait_for_result(timeout)` blocks on the
events queue and returns as soon as a `result` event arrives or the
600-second cap expires. Nothing else consumes the queue.

## Two tick prompts: FULL and LIGHT

The first tick after a spawn uses `FULL_TICK_PROMPT`. It asks Claude
to:

1. Read `./MEMORY.md`, hard budget 2KB. Consolidate when it grows.
2. Check `./.orchestrator/tools.json`. If stale (over 60 min old),
   snapshot every `mcp__*` tool grouped by server.
3. Run the polling loop per `CLAUDE.md`.
4. Overwrite `./status.json` at end of tick.
5. `touch ./.orchestrator/clear-session` if the task is done.
6. `touch ./.orchestrator/did-work` if the tick did anything
   meaningful.

Subsequent ticks use `LIGHT_TICK_PROMPT`, which assumes `CLAUDE.md`,
`MEMORY.md`, and tools are already in context and just says "run
another polling tick".

## Control files (`.orchestrator/`)

The agent writes these. The wrapper reads them before or after each
tick.

| File | Writer | Effect |
|---|---|---|
| `did-work` | agent | wrapper resets sleep to `MIN_SLEEP` |
| `clear-session` | agent | wrapper sends `/clear` before next tick |
| `reset-session` | agent or operator | wrapper respawns the whole claude process |
| `sleep.json` | wrapper | dashboard reads: state, seconds, reason, sleep_until_epoch |
| `tools.json` | agent | dashboard reads: current MCP tool inventory |
| `session-settings.json` | wrapper | skills isolation and lifecycle hooks |
| `agent-loop.log` | wrapper and hooks | append-only op log |

## Signals

* `SIGUSR1` to the wrapper pid. Sets an event; the next `time.sleep` in
  `sleep_with_wake` wakes immediately. In-flight ticks ignore SIGUSR1.
  This is how cross-agent wakes work: the supervisor sends SIGUSR1 to
  exactly the wrapper pid, not the process group, so an in-progress
  `claude` turn is not disturbed.
* `SIGTERM` / `SIGINT` to the wrapper. The wrapper sets `stop_event`,
  exits its sleep, sends `/exit` to Claude, waits up to 30 seconds,
  then kills.
* `SIGKILL` from the supervisor as a last resort, 5 seconds after
  SIGTERM.

## Backoff sleep

Defaults (overridable via env):

* `MIN_SLEEP = 60`. First sleep after a productive tick.
* `IDLE_STEP = 60`. Added per idle tick.
* `MAX_SLEEP = 3600`. Ceiling.

Logic: if the last tick touched `did-work`, reset sleep to `MIN_SLEEP`.
Else add `IDLE_STEP`, capped at `MAX_SLEEP`. This keeps agents cheap on
quiet days and responsive when there is traffic.

## Crash recovery

If the claude subprocess exits unexpectedly, the stdout pump enqueues
`__eof__`, the tick returns `None`, and the wrapper respawns the
process. If a `session_id` was captured before the crash, the respawn
includes `--resume <session_id>` so the conversation is continued
rather than started fresh.

## Cost accounting

After every tick the wrapper invokes `scripts/tick-cost.py <agent_dir>
<tick_start_epoch>`. That script walks the agent's session JSONL files
under `~/.claude/projects/<slug>/`, filters events by mtime since the
tick started, sums per-model token counts, applies current Anthropic
pricing, and emits a one-line summary to the wrapper log.

The dashboard aggregates the same JSONLs for its usage panel. Both the
per-tick log line and the dashboard come from the same source of
truth: the session transcripts Claude Code writes automatically.

## Extending the loop

Common extensions:

* Swap the tick prompt. Edit `FULL_TICK_PROMPT` and
  `LIGHT_TICK_PROMPT`.
* Hook into other event types. Extend `_pump_stdout` to act on tool
  uses or assistant deltas.
* Add a control file. Pick a new filename under `.orchestrator/` and
  check for its existence at the top of the tick.
* Change the default model. Edit the `--model` flag in `spawn()` or
  gate on an env var.
* Add a lifecycle hook. `session-settings.json` already wires
  `SessionStart` and `UserPromptSubmit`; add `ToolUse`, `Stop`, or
  `PreToolUse` as needed.
