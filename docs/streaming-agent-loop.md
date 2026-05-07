# The streaming agent loop

> **Note (May 2026):** the loop itself moved to the
> [`agentdm` CLI](https://github.com/agentdmai/agentdm-cli). teamfuse used
> to ship its own `scripts/agent-loop.{py,sh}`; the supervisor now spawns
> `agentdm start <workingDir>` with `AGENTDM_SUPERVISED=1` instead. The
> control-file contract under `<workingDir>/.orchestrator/`, the SIGUSR1
> wake protocol, the adaptive backoff, the FULL/LIGHT prompts, and the
> cost-accounting are all unchanged — they live in the CLI now. The
> design notes below still describe how it works.

This doc explains the supervised agent loop and how it drives both
supported runtimes. The loop itself is runtime-agnostic; what differs
is the adapter each runtime uses underneath.

| | `claude` | `copilot` |
|---|---|---|
| Session model | Persistent process, `/clear` between tasks | Stateless per-tick (`copilot -p`) |
| Instruction file | `CLAUDE.md` | `AGENTS.md` |
| Context continuity | Conversation history in-process | `--resume <session-id>` across ticks |
| Cost source | `~/.claude/projects/<slug>/*.jsonl` | `.orchestrator/usage.jsonl` |

## Why a persistent session (claude)

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

## Why stateless per-tick (copilot)

The Copilot CLI does not support a persistent streaming session. Each
tick runs a fresh `copilot -p` invocation. To preserve context across
ticks, the adapter passes `--resume <session-id>` from the previous
tick. When an agent signals it is done with a task, it touches
`.orchestrator/clear-session`, causing the adapter to drop the session
ID so the next tick starts fresh. Durable state lives in `MEMORY.md`.

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

## The copilot invocation

```
copilot -p "<tick-prompt>" \
        --resume <session-id> \
        --additional-mcp-config @.mcp.json
```

Flags that matter:

* `-p`. Non-interactive prompt mode. One invocation per tick.
* `--resume <session-id>`. Passes the session ID from the previous
  tick so the model has access to prior conversation history.
  Omitted on first tick or after a `clear-session` signal.
* `--additional-mcp-config @.mcp.json`. Loads per-agent MCP servers
  on top of the user-level Copilot config.

The adapter runs `copilot -p` as a subprocess, captures stdout (JSONL
events), and returns when the process exits. Each tick is a blocking
call; there is no persistent process to manage. The session ID is
extracted from the JSONL output and passed to the next tick.

## Stdin and stdout framing (claude)

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
pump in `ClaudeAdapter._pump_stdout`.

## JSONL output (copilot)

The Copilot CLI writes one JSON event per line to stdout. The adapter
captures the full output after the process exits. Key event types:

* `{"type": "session.start", "data": {"sessionId": "<uuid>"}}`.
  Session ID carried to the next tick as `--resume`.
* `{"type": "message", "data": {"role": "assistant", "content": "..."}}`.
  The assistant response. Logged with `> ` prefix to `agent-loop.log`.
* `{"type": "session.shutdown", "data": {"modelMetrics": {...}}}`.
  Present at end of session. Contains per-model token counts used for
  usage tracking; written to `.orchestrator/usage.jsonl`.

## Thread model (claude)

```
main thread
 ├─ signal handlers (SIGUSR1, SIGTERM, SIGINT)
 ├─ tick loop: send() -> wait_for_result() -> sleep_with_wake()
 │
 │  owns: ClaudeAdapter.proc (Popen), events queue
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

## Thread model (copilot)

```
main thread
 ├─ signal handlers (SIGUSR1, SIGTERM, SIGINT)
 └─ tick loop: send() -> wait_for_result() -> sleep_with_wake()
       wait_for_result() runs copilot -p as a subprocess
       reads stdout to completion, parses JSONL, returns
       no background threads needed (process per tick)
```

## Two tick prompts: FULL and LIGHT

Both runtimes use the same `FULL_TICK_PROMPT` / `LIGHT_TICK_PROMPT`
constants from `agent-loop.py`. The first tick after a spawn (or fresh
start for copilot) uses `FULL_TICK_PROMPT`. It asks the agent to:

1. Read `./MEMORY.md`, hard budget 2KB. Consolidate when it grows.
2. Check `./.orchestrator/tools.json`. If stale (over 60 min old),
   snapshot every `mcp__*` tool grouped by server.
3. Run the polling loop per `CLAUDE.md` (claude) or `AGENTS.md` (copilot).
4. Overwrite `./status.json` at end of tick.
5. `touch ./.orchestrator/clear-session` if the task is done.
6. `touch ./.orchestrator/did-work` if the tick did anything
   meaningful.

Subsequent ticks use `LIGHT_TICK_PROMPT`, which assumes the instruction
file, `MEMORY.md`, and tools are already in context and just says "run
another polling tick".

## Control files (`.orchestrator/`)

The agent writes these. The wrapper reads them before or after each
tick.

| File | Writer | Effect | Runtimes |
|---|---|---|---|
| `did-work` | agent | wrapper resets sleep to `MIN_SLEEP` | both |
| `clear-session` | agent | claude: wrapper sends `/clear` before next tick; copilot: wrapper drops `--resume` session ID | both |
| `reset-session` | agent or operator | wrapper respawns the whole adapter | both |
| `sleep.json` | wrapper | dashboard reads: state, seconds, reason, sleep_until_epoch | both |
| `tools.json` | agent | dashboard reads: current MCP tool inventory | both |
| `usage.jsonl` | copilot adapter | per-tick token usage records; read by the dashboard | copilot |
| `session-settings.json` | wrapper | skills isolation and lifecycle hooks | claude only |
| `agent-loop.log` | wrapper and hooks | append-only op log | both |

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

**claude:** If the claude subprocess exits unexpectedly, the stdout pump
enqueues `__eof__`, the tick returns `None`, and the wrapper respawns
the process. If a `session_id` was captured before the crash, the
respawn includes `--resume <session_id>` so the conversation is
continued rather than started fresh.

**copilot:** Each tick is a fresh subprocess, so there is nothing to
respawn. If `copilot -p` exits with a non-zero code, the adapter logs
the error, returns an empty result, and the loop sleeps normally before
the next tick. The previous `--resume` session ID is retained and tried
again on the next tick.

## Cost accounting

**claude:** After every tick the wrapper invokes `scripts/tick-cost.py
<agent_dir> <tick_start_epoch>`. That script walks the agent's session
JSONL files under `~/.claude/projects/<slug>/`, filters events by mtime
since the tick started, sums per-model token counts, applies current
Anthropic pricing, and emits a one-line summary to the wrapper log.
The dashboard aggregates the same JSONLs for its usage panel.

**copilot:** After every tick the adapter reads the Copilot session
state file at `~/.copilot/session-state/<session-id>/events.jsonl`,
extracts `modelMetrics` from the `session.shutdown` event, and appends
a record to `.orchestrator/usage.jsonl`. The dashboard reads this file
for its usage panel. Copilot does not expose a USD cost figure, so
cost is reported as zero.

## Extending the loop

Common extensions:

* Swap the tick prompt. Edit `FULL_TICK_PROMPT` and
  `LIGHT_TICK_PROMPT` in `agent-loop.py`.
* Hook into other event types (claude). Extend `_pump_stdout` in
  `ClaudeAdapter` to act on tool uses or assistant deltas.
* Add a control file. Pick a new filename under `.orchestrator/` and
  check for its existence at the top of the tick.
* Change the default model. Edit the invocation in the adapter's
  `spawn()` (claude) or `wait_for_result()` (copilot), or gate on an
  env var.
* Add a lifecycle hook (claude). `session-settings.json` already wires
  `SessionStart` and `UserPromptSubmit`; add `ToolUse`, `Stop`, or
  `PreToolUse` as needed.
* Add a new runtime. Create
  `agents-web/scripts/runtimes/<name>_adapter.py` implementing
  `BaseAdapter` and register the name as a valid `runtime` value.
