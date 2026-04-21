#!/usr/bin/env python3
"""Long-lived per-agent Claude Code wrapper (persistent session + /clear).

Replaces the per-tick fork model. Spawns `claude` ONCE per agent in
stream-json I/O mode and feeds tick prompts through stdin. MCP
connections, skills, and the cached system prompt all stay hot across
ticks. A task-done sentinel (`.orchestrator/clear-session`) triggers a
`/clear` slash command to wipe conversation history without dropping
the session. A hard `.orchestrator/reset-session` sentinel respawns the
whole claude process if something gets wedged.

Signals:
  SIGUSR1 — wake from sleep, run the next tick immediately
  SIGTERM / SIGINT — graceful shutdown (sends /exit, waits, then kills)

Protocol files under ./.orchestrator/:
  did-work         — agent touches ⇒ wrapper resets sleep to MIN_SLEEP
  clear-session    — agent touches ⇒ wrapper sends /clear before next tick
  reset-session    — agent or orchestrator touches ⇒ full claude respawn
  sleep.json       — current backoff state (dashboard reads)
  tools.json       — agent-written snapshot of live MCP tools
  agent-loop.log   — op log (wrapper + lifecycle hooks append here)

env:
  MIN_SLEEP        seconds after a productive tick (default 60)
  IDLE_STEP        added per idle tick              (default 60)
  MAX_SLEEP        ceiling on backoff               (default 3600)
  TIMEOUT_SECS     hard cap on a single turn        (default 600)
  CHROME=1         launch claude --chrome (headed browser)
"""
from __future__ import annotations

import json
import os
import queue
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

MIN_SLEEP    = int(os.environ.get("MIN_SLEEP", "60"))
IDLE_STEP    = int(os.environ.get("IDLE_STEP", "60"))
MAX_SLEEP    = int(os.environ.get("MAX_SLEEP", "3600"))
TIMEOUT_SECS = int(os.environ.get("TIMEOUT_SECS", "600"))
CHROME       = os.environ.get("CHROME", "") == "1"

ORCH_DIR    = AGENT_DIR / ".orchestrator"
ORCH_DIR.mkdir(exist_ok=True)

LOG_PATH    = ORCH_DIR / "agent-loop.log"
DID_WORK    = ORCH_DIR / "did-work"
CLEAR_FLAG  = ORCH_DIR / "clear-session"
RESET_FLAG  = ORCH_DIR / "reset-session"
SLEEP_JSON  = ORCH_DIR / "sleep.json"
TOOLS_JSON  = ORCH_DIR / "tools.json"
SETTINGS    = ORCH_DIR / "session-settings.json"

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
            # strip matching surrounding quotes
            if (len(v) >= 2) and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
                v = v[1:-1]
            if key:
                os.environ[key] = v


# ---------- Session settings (skills + lifecycle hooks) ----------
def write_session_settings() -> list[str]:
    skill_names: list[str] = []
    skills_dir = AGENT_DIR / ".claude" / "skills"
    if skills_dir.is_dir():
        for d in sorted(skills_dir.iterdir()):
            if d.is_dir() and (d / "SKILL.md").is_file():
                skill_names.append(d.name)

    # Strict skill isolation: always deny the Skill tool by default so the
    # agent never inherits the operator's user-level skill library, and only
    # allow the per-agent skills that live under ./.claude/skills/.
    allow: list[str] = []
    for n in skill_names:
        allow.append(f"Skill({n})")
        allow.append(f"Skill({n} *)")
    settings: dict = {
        "permissions": {"deny": ["Skill"], "allow": allow},
        "hooks": {},
    }

    log_tpl = (
        'date -u "+[%FT%TZ] hook:{event} — {note}" '
        '>> ./.orchestrator/agent-loop.log 2>&1'
    )
    settings["hooks"] = {
        "SessionStart": [{"matcher": "*", "hooks": [{
            "type": "command",
            "command": log_tpl.format(
                event="SessionStart",
                note="context + MCP + skills loading…"),
        }]}],
        "UserPromptSubmit": [{"matcher": "*", "hooks": [{
            "type": "command",
            "command": log_tpl.format(
                event="UserPromptSubmit",
                note="all loaded (CLAUDE.md + MCP + skills); running tick"),
        }]}],
    }
    SETTINGS.write_text(json.dumps(settings, indent=2))
    return skill_names


# ---------- Claude process wrapper ----------
class ClaudeSession:
    """Long-lived `claude -p --input-format stream-json` subprocess."""

    def __init__(self) -> None:
        self.proc: subprocess.Popen | None = None
        self.session_id: str | None = None
        self.events: "queue.Queue[dict]" = queue.Queue()
        self._stdout_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None

    def spawn(self, resume_id: str | None = None) -> None:
        args = [
            "claude", "--print", "--verbose",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--dangerously-skip-permissions",
            "--model", "opusplan",
        ]
        # Strict MCP isolation: never inherit the operator's user-level
        # servers. If the agent has its own .mcp.json we use it; otherwise
        # we point at an empty file so `--strict-mcp-config` loads nothing.
        mcp_path = AGENT_DIR / ".mcp.json"
        if not mcp_path.is_file():
            empty_mcp = ORCH_DIR / "empty-mcp.json"
            if not empty_mcp.is_file():
                empty_mcp.write_text('{"mcpServers":{}}')
            mcp_path = empty_mcp
        args += ["--mcp-config", str(mcp_path), "--strict-mcp-config"]
        if SETTINGS.is_file():
            args += ["--settings", str(SETTINGS)]
        if CHROME:
            args += ["--chrome"]
        if resume_id:
            args += ["--resume", resume_id]

        log(f"spawning claude: {' '.join(args)}")
        self.proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            cwd=str(AGENT_DIR),
            # New process group so supervisor can SIGTERM the whole tree.
            start_new_session=False,  # we're already in wrapper's pgid
        )
        log(f"claude pid={self.proc.pid}")

        self._stdout_thread = threading.Thread(
            target=self._pump_stdout, daemon=True)
        self._stderr_thread = threading.Thread(
            target=self._pump_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()

    def _pump_stdout(self) -> None:
        assert self.proc and self.proc.stdout
        try:
            for raw in self.proc.stdout:
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    # Non-JSON lines: log at info for visibility.
                    log(f"claude stdout (non-json): {line[:200]}")
                    continue
                self.events.put(ev)
        except Exception as e:  # noqa: BLE001
            log(f"stdout pump error: {e}")
        self.events.put({"type": "__eof__"})

    def _pump_stderr(self) -> None:
        assert self.proc and self.proc.stderr
        try:
            for raw in self.proc.stderr:
                line = raw.decode("utf-8", "replace").rstrip()
                if line:
                    log(f"claude stderr: {line}")
        except Exception:  # noqa: BLE001
            pass

    def is_alive(self) -> bool:
        return bool(self.proc and (self.proc.poll() is None))

    def send(self, prompt: str) -> bool:
        if not (self.proc and self.proc.stdin):
            return False
        msg = {
            "type": "user",
            "message": {"role": "user", "content": prompt},
        }
        line = json.dumps(msg) + "\n"
        try:
            self.proc.stdin.write(line.encode("utf-8"))
            self.proc.stdin.flush()
            return True
        except (BrokenPipeError, OSError) as e:
            log(f"send failed: {e}")
            return False

    def wait_for_result(self, timeout: int) -> dict | None:
        """Block until a 'result' event arrives (turn complete) or timeout."""
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                log(f"turn timeout after {timeout}s")
                return None
            try:
                ev = self.events.get(timeout=min(remaining, 1.0))
            except queue.Empty:
                if not self.is_alive():
                    log(f"claude exited during turn rc={self.proc.returncode if self.proc else '?'}")
                    return None
                continue

            t = ev.get("type")
            if t == "__eof__":
                log("claude stdout EOF")
                return None
            if t == "system" and ev.get("subtype") == "init":
                sid = ev.get("session_id")
                if sid:
                    self.session_id = sid
                    log(f"session_id={sid}")
            if t == "result":
                # result event signals turn completion
                return ev

    def terminate(self) -> None:
        if not self.proc:
            return
        try:
            if self.proc.stdin:
                self.proc.stdin.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            self.proc.terminate()
            self.proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            log("claude did not exit on SIGTERM, sending SIGKILL")
            self.proc.kill()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        except Exception as e:  # noqa: BLE001
            log(f"terminate error: {e}")


# ---------- Tick prompts ----------
FULL_TICK_PROMPT = (
    "Polling tick (fresh session). Follow CLAUDE.md — that file owns what work you do.\n"
    "\n"
    "SETUP (silent):\n"
    "1. Read ./MEMORY.md. HARD BUDGET: keep the whole file under 2 KB. MEMORY is "
    "a bounded scratchpad of DURABLE facts (schema, IDs, founder preferences, routing "
    "rules, hard-earned gotchas) — NOT a diary or activity log. When you learn "
    "something worth keeping, CONSOLIDATE: merge into an existing section, replace a "
    "stale bullet, or delete what is no longer true. If the file exceeds 2 KB, trim "
    "it before adding anything new.\n"
    "2. Check ./.orchestrator/tools.json. If missing or its `generated_at` is >60min "
    "old, overwrite with a JSON snapshot of every mcp__* tool you can see, grouped by "
    "server. Shape: "
    '{"generated_at":"<ISO>","total_tools":<int>,"servers":[{"name":"<server>","tools":[{"name":"<full_tool_name>"}]}]}. '
    "Be exhaustive.\n"
    "\n"
    "Then run your polling loop per CLAUDE.md.\n"
    "\n"
    "END OF TICK: overwrite ./status.json.\n"
    " • If this task is FINISHED (no immediate follow-up needed), `touch "
    "./.orchestrator/clear-session` — the wrapper will wipe conversation history "
    "before the next tick so context stays bounded. MCP/skills/CLAUDE.md all stay "
    "loaded; only in-session turn history is cleared.\n"
    " • If you took any meaningful action this tick (sent a DM, triaged an email, "
    "moved a card, committed code, posted anywhere), `touch ./.orchestrator/did-work` "
    "so the orchestrator wakes you quickly for the next tick. An idle tick must NOT "
    "touch did-work.\n"
)

LIGHT_TICK_PROMPT = (
    "Next polling tick (CLAUDE.md + MEMORY.md + tools already in context from "
    "the prior tick of this session). Do NOT re-read them unless something changed. "
    "Follow CLAUDE.md.\n"
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
    skills = write_session_settings()
    if skills:
        log(f"skill isolation active: only [{' '.join(skills)}] allowed")
    log(f"lifecycle hooks + settings → {SETTINGS}")

    # Make sure MEMORY.md exists so the agent can always read it.
    memory_md = AGENT_DIR / "MEMORY.md"
    if not memory_md.exists():
        memory_md.touch()

    # Clean stale flags from any prior run.
    for p in (DID_WORK, CLEAR_FLAG, RESET_FLAG, TOOLS_JSON):
        try:
            p.unlink()
        except FileNotFoundError:
            pass

    log(f"agent-loop start pid={os.getpid()} cwd={AGENT_DIR} "
        f"min={MIN_SLEEP}s step={IDLE_STEP}s max={MAX_SLEEP}s timeout={TIMEOUT_SECS}s")

    claude = ClaudeSession()
    claude.spawn()

    current_sleep = MIN_SLEEP
    fresh_context = True  # next tick needs the FULL setup prompt
    consecutive_failures = 0

    while not stop_event.is_set():
        # Respawn if claude died between ticks.
        if not claude.is_alive():
            rc = claude.proc.returncode if claude.proc else "?"
            log(f"claude process gone rc={rc} — respawning")
            resume_id = claude.session_id
            claude = ClaudeSession()
            claude.session_id = resume_id
            claude.spawn(resume_id=resume_id)
            fresh_context = True
            time.sleep(2)
            continue

        # Honor clear-session flag before starting a tick.
        if CLEAR_FLAG.exists():
            log("clear-session flag → sending /clear (wipe conversation history)")
            try:
                CLEAR_FLAG.unlink()
            except FileNotFoundError:
                pass
            if claude.send("/clear"):
                # /clear is near-instant; give it a short window to flush.
                claude.wait_for_result(timeout=30)
            fresh_context = True

        # Hard-reset flag: full respawn (for when /clear isn't enough).
        if RESET_FLAG.exists():
            log("reset-session flag → full claude respawn")
            try:
                RESET_FLAG.unlink()
            except FileNotFoundError:
                pass
            claude.terminate()
            claude = ClaudeSession()
            claude.spawn()
            fresh_context = True
            continue

        tick_start = time.time()
        prompt = FULL_TICK_PROMPT if fresh_context else LIGHT_TICK_PROMPT
        log(f"tick begin (fresh_context={fresh_context})")

        if not claude.send(prompt):
            consecutive_failures += 1
            log(f"send failed; respawning (fails={consecutive_failures})")
            claude.terminate()
            claude = ClaudeSession()
            claude.spawn()
            fresh_context = True
            time.sleep(min(5 * consecutive_failures, 60))
            continue

        result = claude.wait_for_result(timeout=TIMEOUT_SECS)
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

    # Shutdown.
    log("shutting down claude session")
    claude.terminate()
    log("agent-loop exit")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:  # noqa: BLE001
        log(f"fatal: {type(e).__name__}: {e}")
        raise
