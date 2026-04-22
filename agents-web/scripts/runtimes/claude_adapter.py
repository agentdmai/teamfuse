"""Claude Code runtime adapter.

Wraps a persistent `claude --print --verbose --input-format stream-json`
subprocess and exposes the BaseAdapter interface to agent-loop.py.

The Claude Code CLI keeps MCP connections, skills, and the parsed CLAUDE.md
hot across ticks. A /clear command wipes conversation history without
dropping the session; agent-loop uses this when the clear-session control
file is present.

Environment variables consumed (read at spawn time):
  CHROME=1          pass --chrome to claude (headed browser via Claude-in-Chrome)
  CLEAR_MIN_GAP     minimum seconds between /clear calls (default 600)
"""
from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import time
from pathlib import Path

from runtimes.base import BaseAdapter


class ClaudeAdapter(BaseAdapter):
    """Long-lived `claude -p --input-format stream-json` subprocess."""

    def __init__(self, agent_dir: Path, log_fn) -> None:
        super().__init__(agent_dir, log_fn)
        self._proc: subprocess.Popen | None = None
        self._session_id: str | None = None
        self._events: "queue.Queue[dict]" = queue.Queue()
        self._clear_min_gap = int(os.environ.get("CLEAR_MIN_GAP", "600"))
        self._last_clear_monotonic: float = 0.0
        self._stdout_thread: threading.Thread | None = None
        self._stderr_thread: threading.Thread | None = None
        self._chrome = os.environ.get("CHROME", "") == "1"
        self._settings_path = agent_dir / ".orchestrator" / "session-settings.json"

    # ------------------------------------------------------------------
    # Session settings (skills + lifecycle hooks) — Claude Code specific
    # ------------------------------------------------------------------

    def _write_session_settings(self) -> list[str]:
        skill_names: list[str] = []
        skills_dir = self.agent_dir / ".claude" / "skills"
        if skills_dir.is_dir():
            for d in sorted(skills_dir.iterdir()):
                if d.is_dir() and (d / "SKILL.md").is_file():
                    skill_names.append(d.name)

        settings: dict = {"permissions": {}, "hooks": {}}
        if skill_names:
            allow = []
            for n in skill_names:
                allow.append(f"Skill({n})")
                allow.append(f"Skill({n} *)")
            settings["permissions"] = {"deny": ["Skill"], "allow": allow}

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
        self._settings_path.write_text(json.dumps(settings, indent=2))
        return skill_names

    # ------------------------------------------------------------------
    # BaseAdapter implementation
    # ------------------------------------------------------------------

    def spawn(self, resume_id: str | None = None) -> None:
        skills = self._write_session_settings()
        if skills:
            self.log(f"skill isolation active: only [{' '.join(skills)}] allowed")

        args = [
            "claude", "--print", "--verbose",
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--dangerously-skip-permissions",
            "--model", "opusplan",
        ]
        if (self.agent_dir / ".mcp.json").is_file():
            args += ["--mcp-config", ".mcp.json", "--strict-mcp-config"]
        if self._settings_path.is_file():
            args += ["--settings", str(self._settings_path)]
        if self._chrome:
            args += ["--chrome"]
        if resume_id:
            args += ["--resume", resume_id]

        self.log(f"spawning claude: {' '.join(args)}")
        self._proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            cwd=str(self.agent_dir),
            start_new_session=False,
        )
        self.log(f"claude pid={self._proc.pid}")

        self._stdout_thread = threading.Thread(target=self._pump_stdout, daemon=True)
        self._stderr_thread = threading.Thread(target=self._pump_stderr, daemon=True)
        self._stdout_thread.start()
        self._stderr_thread.start()

    def terminate(self) -> None:
        if not self._proc:
            return
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            self._proc.terminate()
            self._proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.log("claude did not exit on SIGTERM, sending SIGKILL")
            self._proc.kill()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        except Exception as e:  # noqa: BLE001
            self.log(f"terminate error: {e}")

    def is_alive(self) -> bool:
        return bool(self._proc and (self._proc.poll() is None))

    def send(self, prompt: str) -> bool:
        if not (self._proc and self._proc.stdin):
            return False
        msg = {
            "type": "user",
            "message": {"role": "user", "content": prompt},
        }
        line = json.dumps(msg) + "\n"
        try:
            self._proc.stdin.write(line.encode("utf-8"))
            self._proc.stdin.flush()
            return True
        except (BrokenPipeError, OSError) as e:
            self.log(f"send failed: {e}")
            return False

    def wait_for_result(self, timeout: int) -> dict | None:
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                self.log(f"turn timeout after {timeout}s")
                return None
            try:
                ev = self._events.get(timeout=min(remaining, 1.0))
            except queue.Empty:
                if not self.is_alive():
                    rc = self._proc.returncode if self._proc else "?"
                    self.log(f"claude exited during turn rc={rc}")
                    return None
                continue

            t = ev.get("type")
            if t == "__eof__":
                self.log("claude stdout EOF")
                return None
            if t == "system" and ev.get("subtype") == "init":
                sid = ev.get("session_id")
                if sid:
                    self._session_id = sid
                    self.log(f"session_id={sid}")
            if t == "result":
                return ev

    # ------------------------------------------------------------------
    # Optional capabilities
    # ------------------------------------------------------------------

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @session_id.setter
    def session_id(self, value: str | None) -> None:
        self._session_id = value

    def supports_clear_session(self) -> bool:
        return True

    def clear_session(self) -> bool:
        """Send /clear to wipe conversation history without dropping the session.

        Rate-limited by CLEAR_MIN_GAP (default 600s) to avoid re-paying
        session setup costs (MCP handshake, CLAUDE.md parse) too frequently.
        Returns True if the clear was sent, False if rate-limited or failed.
        """
        since = time.monotonic() - self._last_clear_monotonic
        if self._last_clear_monotonic > 0 and since < self._clear_min_gap:
            wait_left = int(self._clear_min_gap - since)
            self.log(f"clear-session rate-limited ({wait_left}s remaining until next allowed clear)")
            return False
        if not self.send("/clear"):
            return False
        result = self.wait_for_result(timeout=30)
        if result is not None:
            self._last_clear_monotonic = time.monotonic()
            return True
        return False

    # ------------------------------------------------------------------
    # Internal stdout/stderr pumps
    # ------------------------------------------------------------------

    def _pump_stdout(self) -> None:
        assert self._proc and self._proc.stdout
        try:
            for raw in self._proc.stdout:
                line = raw.decode("utf-8", "replace").strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    self.log(f"claude stdout (non-json): {line[:200]}")
                    continue
                self._events.put(ev)
        except Exception as e:  # noqa: BLE001
            self.log(f"stdout pump error: {e}")
        self._events.put({"type": "__eof__"})

    def _pump_stderr(self) -> None:
        assert self._proc and self._proc.stderr
        try:
            for raw in self._proc.stderr:
                line = raw.decode("utf-8", "replace").rstrip()
                if line:
                    self.log(f"claude stderr: {line}")
        except Exception:  # noqa: BLE001
            pass
