#!/usr/bin/env python3
"""Long-lived per-agent runtime wrapper (persistent session + /clear).

Supports multiple agent runtimes via the adapter pattern:
  RUNTIME=claude   (default) — Claude Code CLI, persistent stream-json session
  RUNTIME=copilot            — GitHub Copilot CLI, stateless per-tick

Each runtime is implemented as a BaseAdapter subclass in ./runtimes/.
agent-loop.py handles the common orchestration loop (signals, backoff,
control files, logging) and delegates all runtime specifics to the adapter.

Signals:
  SIGUSR1 — wake from sleep, run the next tick immediately
  SIGTERM / SIGINT — graceful shutdown

Protocol files under ./.orchestrator/:
  did-work         — agent touches ⇒ wrapper resets sleep to MIN_SLEEP
  clear-session    — agent touches ⇒ wrapper clears history before next tick
                     (full respawn if the runtime does not support in-session clear)
  reset-session    — agent or orchestrator touches ⇒ full adapter respawn
  sleep.json       — current backoff state (dashboard reads)
  tools.json       — agent-written snapshot of live MCP tools
  agent-loop.log   — op log (wrapper + lifecycle hooks append here)

env:
  RUNTIME          adapter to use: "claude" (default) or "copilot"
  MIN_SLEEP        seconds after a productive tick (default 60)
  IDLE_STEP        added per idle tick              (default 60)
  MAX_SLEEP        ceiling on backoff               (default 3600)
  TIMEOUT_SECS     hard cap on a single turn        (default 600)
  CHROME=1         (claude only) launch claude --chrome
  COPILOT_MODEL    (copilot only) model name for the CLI
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------- Setup ----------

if len(sys.argv) < 2:
    print("agent-loop.py: agent directory required", file=sys.stderr)
    sys.exit(2)

AGENT_DIR = Path(sys.argv[1]).resolve()
if not AGENT_DIR.is_dir():
    print(f"agent-loop.py: cwd {AGENT_DIR} unreachable", file=sys.stderr)
    sys.exit(2)
os.chdir(AGENT_DIR)

RUNTIME      = os.environ.get("RUNTIME", "claude").lower()
MIN_SLEEP    = int(os.environ.get("MIN_SLEEP", "60"))
IDLE_STEP    = int(os.environ.get("IDLE_STEP", "60"))
MAX_SLEEP    = int(os.environ.get("MAX_SLEEP", "3600"))
TIMEOUT_SECS = int(os.environ.get("TIMEOUT_SECS", "600"))

ORCH_DIR    = AGENT_DIR / ".orchestrator"
ORCH_DIR.mkdir(exist_ok=True)

LOG_PATH    = ORCH_DIR / "agent-loop.log"
DID_WORK    = ORCH_DIR / "did-work"
CLEAR_FLAG  = ORCH_DIR / "clear-session"
RESET_FLAG  = ORCH_DIR / "reset-session"
SLEEP_JSON  = ORCH_DIR / "sleep.json"
TOOLS_JSON  = ORCH_DIR / "tools.json"

SCRIPT_DIR  = Path(__file__).resolve().parent
COST_SCRIPT = SCRIPT_DIR / "tick-cost.py"


def utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(line: str) -> None:
    stamp = utc_iso()
    s = f"[{stamp}] {line}\n"
    try:
        sys.stdout.write(s)
        sys.stdout.flush()
    except (BrokenPipeError, OSError):
        pass
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(s)
    except OSError:
        pass


# ---------- .env sourcing ----------
def source_env() -> None:
    envfile = AGENT_DIR / ".env"
    if not envfile.is_file():
        log("WARN: no .env in agent dir — MCP servers requiring tokens will fail")
        return
    log("sourcing .env")
    with open(envfile, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            v = val.strip()
            if (len(v) >= 2) and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
                v = v[1:-1]
            if key:
                os.environ[key] = v


# ---------- Adapter loading ----------
def load_adapter():
    """Return the BaseAdapter subclass for the configured RUNTIME."""
    # Add the scripts directory to the path so runtimes/ is importable.
    if str(SCRIPT_DIR) not in sys.path:
        sys.path.insert(0, str(SCRIPT_DIR))

    if RUNTIME == "copilot":
        from runtimes.copilot_adapter import CopilotAdapter
        return CopilotAdapter(AGENT_DIR, log)
    if RUNTIME == "claude":
        from runtimes.claude_adapter import ClaudeAdapter
        return ClaudeAdapter(AGENT_DIR, log)
    log(f"WARN: unknown RUNTIME={RUNTIME!r}, falling back to claude")
    from runtimes.claude_adapter import ClaudeAdapter
    return ClaudeAdapter(AGENT_DIR, log)


# ---------- Tick prompts ----------
FULL_TICK_PROMPT = (
    "Polling tick (fresh session). Follow your instructions file "
    "(AGENTS.md or CLAUDE.md) — that file owns what work you do.\n"
    "\n"
    "SETUP (silent):\n"
    "1. Read ./MEMORY.md. HARD BUDGET: keep the whole file under 2 KB. MEMORY is "
    "a bounded scratchpad of DURABLE facts (schema, IDs, founder preferences, routing "
    "rules, hard-earned gotchas) — NOT a diary or activity log. When you learn "
    "something worth keeping, CONSOLIDATE: merge into an existing section, replace a "
    "stale bullet, or delete what is no longer true. If the file exceeds 2 KB, trim "
    "it before adding anything new.\n"
    "2. Check ./.orchestrator/tools.json. If missing or its `generated_at` is >60min "
    "old, overwrite with a names-only snapshot of every mcp__* tool you can see, "
    "grouped by server. Shape: "
    '{"generated_at":"<ISO>","total_tools":<int>,"servers":[{"name":"<server>","tools":[{"name":"<full_tool_name>"}]}]}. '
    "Names only — do not include parameter schemas, descriptions, examples, or "
    "any other metadata. One line per tool.\n"
    "\n"
    "Then run your polling loop per your instructions file.\n"
    "\n"
    "END OF TICK: overwrite ./status.json.\n"
    " • If this task is FINISHED (no immediate follow-up needed), `touch "
    "./.orchestrator/clear-session` — the wrapper will wipe conversation history "
    "before the next tick so context stays bounded.\n"
    " • If you took any meaningful action this tick (sent a DM, triaged an email, "
    "moved a card, committed code, posted anywhere), `touch ./.orchestrator/did-work` "
    "so the orchestrator wakes you quickly for the next tick. An idle tick must NOT "
    "touch did-work.\n"
)

LIGHT_TICK_PROMPT = (
    "Next polling tick (instructions + MEMORY.md + tools already in context from "
    "the prior tick of this session). Do NOT re-read them unless something changed. "
    "Follow your instructions file.\n"
    "\n"
    "END OF TICK: overwrite ./status.json. If the task is FINISHED, `touch "
    "./.orchestrator/clear-session`. If you took any meaningful action, `touch "
    "./.orchestrator/did-work`.\n"
)


# ---------- Token accounting ----------
def tick_cost_line(tick_start_epoch: float) -> str | None:
    if not COST_SCRIPT.is_file():
        return None
    try:
        r = subprocess.run(
            ["python3", str(COST_SCRIPT), str(AGENT_DIR), str(tick_start_epoch)],
            capture_output=True, text=True, timeout=15,
        )
        line = (r.stdout or "").strip()
        return line or None
    except Exception as e:  # noqa: BLE001
        log(f"tick-cost error: {e}")
        return None


# ---------- Sleep + signal plumbing ----------
wake_event = threading.Event()
stop_event = threading.Event()


def handle_usr1(_sig, _frame):
    wake_event.set()


def handle_term(_sig, _frame):
    log("received SIGTERM/SIGINT — shutting down")
    stop_event.set()
    wake_event.set()


signal.signal(signal.SIGUSR1, handle_usr1)
signal.signal(signal.SIGTERM, handle_term)
signal.signal(signal.SIGINT,  handle_term)


def publish_sleep(state: str, seconds: int, reason: str) -> None:
    now = int(time.time())
    data = {
        "state": state,
        "current_sleep_seconds": seconds,
        "reason": reason,
        "updated_at_epoch": now,
    }
    if state == "sleeping":
        data["sleep_until_epoch"] = now + seconds
    try:
        SLEEP_JSON.write_text(json.dumps(data, indent=2))
    except OSError:
        pass


def sleep_with_wake(seconds: int, reason: str) -> None:
    wake_event.clear()
    publish_sleep("sleeping", seconds, reason)
    wake_event.wait(timeout=seconds)
    publish_sleep("tick", seconds, reason)


# ---------- Main loop ----------
def main() -> None:
    source_env()
    log(f"agent-loop start pid={os.getpid()} cwd={AGENT_DIR} runtime={RUNTIME} "
        f"min={MIN_SLEEP}s step={IDLE_STEP}s max={MAX_SLEEP}s timeout={TIMEOUT_SECS}s")

    memory_md = AGENT_DIR / "MEMORY.md"
    if not memory_md.exists():
        memory_md.touch()

    for p in (DID_WORK, CLEAR_FLAG, RESET_FLAG, TOOLS_JSON):
        try:
            p.unlink()
        except FileNotFoundError:
            pass

    adapter = load_adapter()
    adapter.spawn()

    current_sleep = MIN_SLEEP
    fresh_context = True
    consecutive_failures = 0

    while not stop_event.is_set():
        # Respawn if the adapter process died between ticks.
        if not adapter.is_alive():
            log(f"adapter process gone — respawning (runtime={RUNTIME})")
            resume_id = adapter.session_id
            adapter = load_adapter()
            if resume_id:
                adapter.spawn(resume_id=resume_id)
            else:
                adapter.spawn()
            fresh_context = True
            time.sleep(2)
            continue

        # Honor clear-session flag before starting a tick. Rate-limited:
        # the agent's CLAUDE.md tells it to touch clear-session after most
        # "finished" ticks, which on a busy project means nearly every tick.
        # Clearing that often forces a fresh FULL_TICK_PROMPT re-setup and
        # throws away the prompt cache, burning tokens for no real benefit.
        # We honor the flag at most once every CLEAR_MIN_GAP seconds.
        if CLEAR_FLAG.exists():
            try:
                CLEAR_FLAG.unlink()
            except FileNotFoundError:
                pass

            if adapter.supports_clear_session():
                log("clear-session flag → clearing history (runtime supports in-session clear)")
                adapter.clear_session()
                fresh_context = True
            else:
                log("clear-session flag → full respawn (runtime is stateless per-tick)")
                adapter.terminate()
                adapter = load_adapter()
                adapter.spawn()
                fresh_context = True

        # Hard-reset flag: full respawn regardless of runtime.
        if RESET_FLAG.exists():
            log("reset-session flag → full adapter respawn")
            try:
                RESET_FLAG.unlink()
            except FileNotFoundError:
                pass
            adapter.terminate()
            adapter = load_adapter()
            adapter.spawn()
            fresh_context = True
            continue

        tick_start = time.time()
        # Stateless runtimes always get the full prompt (no in-session context to reuse).
        use_full = fresh_context or not adapter.supports_clear_session()
        prompt = FULL_TICK_PROMPT if use_full else LIGHT_TICK_PROMPT
        log(f"tick begin (fresh_context={fresh_context}, runtime={RUNTIME})")

        if not adapter.send(prompt):
            consecutive_failures += 1
            log(f"send failed; respawning (fails={consecutive_failures})")
            adapter.terminate()
            adapter = load_adapter()
            adapter.spawn()
            fresh_context = True
            time.sleep(min(5 * consecutive_failures, 60))
            continue

        result = adapter.wait_for_result(timeout=TIMEOUT_SECS)
        fresh_context = False

        if result is None:
            log("tick did not complete (timeout or EOF)")
            consecutive_failures += 1
        else:
            log("tick ok")
            consecutive_failures = 0
            cost_line = tick_cost_line(tick_start)
            if cost_line:
                log(cost_line)

        # Backoff decision.
        if DID_WORK.exists():
            try:
                DID_WORK.unlink()
            except FileNotFoundError:
                pass
            current_sleep = MIN_SLEEP
            reason = "work done → MIN_SLEEP"
        else:
            current_sleep = min(current_sleep + IDLE_STEP, MAX_SLEEP)
            reason = f"idle (+{IDLE_STEP}s, cap {MAX_SLEEP}s)"

        elapsed = int(time.time() - tick_start)
        log(f"tick took {elapsed}s; sleeping {current_sleep}s — {reason}")
        sleep_with_wake(current_sleep, reason)

    log("shutting down adapter session")
    adapter.terminate()
    log("agent-loop exit")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:  # noqa: BLE001
        log(f"fatal: {type(e).__name__}: {e}")
        raise
