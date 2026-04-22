"""GitHub Copilot CLI runtime adapter.

Drives `copilot -p <prompt>` in non-interactive mode. Each tick spawns a
fresh `copilot` process; session continuity is maintained via
`--resume=<session-id>` so conversation context carries over between ticks,
similar to Claude's LIGHT_TICK model.

Instruction file:
  AGENTS.md in the agent working directory is auto-loaded by the Copilot CLI
  as the system prompt — the same way Claude Code auto-loads CLAUDE.md.
  No manual injection needed; just place AGENTS.md in agents/<id>/.

Skills:
  The Copilot CLI auto-loads skills from any of these directories inside the
  agent's working directory (agents/<id>/):
    .claude/skills/<name>/SKILL.md   ← same location Claude Code uses
    .github/skills/<name>/SKILL.md
    .agents/skills/<name>/SKILL.md
  All three are equivalent. Use .claude/skills/ to share skills between
  claude and copilot agents from the same working directory.

MCP servers:
  If agents/<id>/.mcp.json exists, it is passed via --additional-mcp-config.

Session lifecycle:
  - First tick: no --resume; Copilot starts fresh and returns a session ID.
  - Subsequent ticks: --resume=<session-id> picks up conversation context.
  - clear-session flag: adapter drops the saved session ID; next tick is fresh.
  - reset-session flag: same effect (agent-loop handles the respawn).

Environment variables consumed:
  COPILOT_MODEL           model name passed to --model (optional)
  COPILOT_REASONING       reasoning effort level: low/medium/high/xhigh (optional)
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
from pathlib import Path

from runtimes.base import BaseAdapter


class CopilotAdapter(BaseAdapter):
    """Per-tick GitHub Copilot CLI adapter with session resumption."""

    def __init__(self, agent_dir: Path, log_fn) -> None:
        super().__init__(agent_dir, log_fn)
        self._proc: subprocess.Popen | None = None
        self._session_id: str | None = None
        self._initialized: bool = False

    # ------------------------------------------------------------------
    # BaseAdapter implementation
    # ------------------------------------------------------------------

    def spawn(self, resume_id: str | None = None) -> None:
        """Initialise the adapter. No persistent process is launched here;
        the CLI process is spawned per-tick in send()."""
        self._session_id = resume_id
        self._initialized = True

        # Check that AGENTS.md exists (auto-loaded by the Copilot CLI).
        agents_md = self.agent_dir / "AGENTS.md"
        if agents_md.is_file():
            self.log("CopilotAdapter: AGENTS.md found — will be auto-loaded as system prompt")
        else:
            self.log("CopilotAdapter: WARN — no AGENTS.md found; agent will run without a "
                     "system prompt (create agents/<id>/AGENTS.md to fix this)")

        if resume_id:
            self.log(f"CopilotAdapter: will resume session {resume_id}")
        else:
            self.log("CopilotAdapter: starting fresh session")

    def terminate(self) -> None:
        """Kill any in-flight CLI process."""
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=10)
            except Exception:  # noqa: BLE001
                try:
                    self._proc.kill()
                except Exception:  # noqa: BLE001
                    pass
        self._proc = None
        self._initialized = False

    def is_alive(self) -> bool:
        # The adapter is always "alive" while initialised — there is no
        # persistent process to die between ticks.
        return self._initialized

    def send(self, prompt: str) -> bool:
        """Spawn `copilot -p <prompt>` and return True if the process started."""
        cmd = [
            "copilot",
            "-p", prompt,
            "--allow-all-tools",
            "--allow-all-paths",
            "--no-ask-user",
            "--output-format", "json",
        ]

        # Session continuity: resume previous conversation context.
        if self._session_id:
            cmd += [f"--resume={self._session_id}"]

        # Per-agent MCP servers.
        mcp_cfg = self.agent_dir / ".mcp.json"
        if mcp_cfg.is_file():
            cmd += ["--additional-mcp-config", f"@{mcp_cfg}"]

        # Optional model and reasoning effort overrides.
        model = os.environ.get("COPILOT_MODEL", "")
        if model:
            cmd += ["--model", model]
        reasoning = os.environ.get("COPILOT_REASONING", "")
        if reasoning:
            cmd += ["--effort", reasoning]

        self.log(f"CopilotAdapter: spawning copilot (session={self._session_id or 'new'})")
        try:
            self._proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(self.agent_dir),
            )
        except FileNotFoundError:
            self.log(
                "CopilotAdapter: ERROR — `copilot` not found. "
                "Install the GitHub Copilot CLI and authenticate: `copilot login`"
            )
            return False
        except Exception as e:  # noqa: BLE001
            self.log(f"CopilotAdapter: spawn error: {e}")
            return False

        return True

    def wait_for_result(self, timeout: int) -> dict | None:
        """Read JSONL events until the `result` event arrives, then return it."""
        if not self._proc:
            return None

        try:
            stdout_bytes, stderr_bytes = self._proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.log(f"CopilotAdapter: turn timeout after {timeout}s")
            self._proc.kill()
            self._proc.communicate()
            return None

        rc = self._proc.returncode
        stderr = stderr_bytes.decode("utf-8", "replace").strip()
        if stderr:
            for line in stderr.splitlines():
                self.log(f"copilot stderr: {line}")

        self._proc = None

        if rc != 0:
            self.log(f"CopilotAdapter: CLI exited with code {rc}")
            return None

        # Parse JSONL — find the `result` event and extract session ID + text.
        result_event: dict | None = None
        assistant_text: str = ""
        for raw_line in stdout_bytes.decode("utf-8", "replace").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue

            ev_type = ev.get("type", "")
            if ev_type == "assistant.message":
                assistant_text = ev.get("data", {}).get("content", "")
            elif ev_type == "result":
                result_event = ev

        if result_event is None:
            self.log("CopilotAdapter: no result event in output")
            return None

        # Persist the session ID for the next tick's --resume.
        new_sid = result_event.get("sessionId")
        if new_sid:
            self._session_id = new_sid
            self.log(f"CopilotAdapter: session_id={new_sid}")
            self._append_usage(new_sid, result_event.get("timestamp", ""))

        self.log(f"CopilotAdapter: tick ok (response {len(assistant_text)} chars)")
        if assistant_text:
            for line in assistant_text.splitlines():
                self.log(f"  > {line}")
        return {"type": "result", "output": assistant_text, "raw": result_event}

    def _append_usage(self, session_id: str, tick_ts: str) -> None:
        """Read per-model token counts from the Copilot session state file and
        append one usage record to .orchestrator/usage.jsonl.

        The Copilot CLI writes ~/.copilot/session-state/<id>/events.jsonl after
        each session. The `session.shutdown` event there has `modelMetrics` with
        exact input/output/cacheRead/cacheWrite token counts per model.
        """
        state_path = (
            pathlib.Path.home()
            / ".copilot"
            / "session-state"
            / session_id
            / "events.jsonl"
        )
        shutdown: dict | None = None
        try:
            for raw in state_path.read_text(encoding="utf-8").splitlines():
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    ev = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "session.shutdown":
                    shutdown = ev
                    break
        except OSError:
            self.log(f"CopilotAdapter: session state not found for {session_id} — no usage recorded")
            return

        if shutdown is None:
            self.log(f"CopilotAdapter: no session.shutdown event for {session_id}")
            return

        data = shutdown.get("data", {})
        model_metrics: dict = data.get("modelMetrics", {})
        usage_path = self.agent_dir / ".orchestrator" / "usage.jsonl"

        ts = tick_ts or shutdown.get("timestamp", "")
        for model, metrics in model_metrics.items():
            u = metrics.get("usage", {})
            record = {
                "ts": ts,
                "session_id": session_id,
                "model": model,
                "input_tokens": u.get("inputTokens", 0),
                "output_tokens": u.get("outputTokens", 0),
                "cache_read_tokens": u.get("cacheReadTokens", 0),
                "cache_write_tokens": u.get("cacheWriteTokens", 0),
                "reasoning_tokens": u.get("reasoningTokens", 0),
                "premium_requests": metrics.get("requests", {}).get("cost", 0),
            }
            try:
                with open(usage_path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record) + "\n")
            except OSError as e:
                self.log(f"CopilotAdapter: failed to write usage record: {e}")
                return

        total_input = sum(
            m.get("usage", {}).get("inputTokens", 0) for m in model_metrics.values()
        )
        total_output = sum(
            m.get("usage", {}).get("outputTokens", 0) for m in model_metrics.values()
        )
        self.log(f"CopilotAdapter: usage recorded (in={total_input} out={total_output})")

    # ------------------------------------------------------------------
    # Session capabilities
    # ------------------------------------------------------------------

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @session_id.setter
    def session_id(self, value: str | None) -> None:
        self._session_id = value

    def supports_clear_session(self) -> bool:
        # We support clear by simply not passing --resume on the next tick.
        return True

    def clear_session(self) -> bool:
        """Drop the session ID so the next tick starts a fresh Copilot session."""
        self.log("CopilotAdapter: clearing session (next tick will start fresh)")
        self._session_id = None
        return True

