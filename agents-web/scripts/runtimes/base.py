"""Base adapter interface for agent runtimes.

Each runtime (Claude Code, GitHub Copilot, …) implements BaseAdapter so
agent-loop.py can drive any of them through the same lifecycle.
"""
from __future__ import annotations

import abc
from pathlib import Path


class BaseAdapter(abc.ABC):
    """Abstract base for a long-lived agent session.

    The adapter owns the subprocess (or API connection) for one agent.
    agent-loop.py calls these methods and never touches runtime internals.
    """

    def __init__(self, agent_dir: Path, log_fn) -> None:
        """
        Args:
            agent_dir: Resolved path to the agent's working directory.
            log_fn:    Callable(str) that writes a timestamped line to the
                       wrapper log.  Adapters should use this instead of
                       print() so all output lands in agent-loop.log.
        """
        self.agent_dir = agent_dir
        self.log = log_fn

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @abc.abstractmethod
    def spawn(self, resume_id: str | None = None) -> None:
        """Start the underlying process / session.

        resume_id: opaque session token from a previous run (adapter may
        ignore it if resumption is not supported).
        """

    @abc.abstractmethod
    def terminate(self) -> None:
        """Shut down the session gracefully, then forcefully if needed."""

    @abc.abstractmethod
    def is_alive(self) -> bool:
        """Return True if the session process is still running."""

    # ------------------------------------------------------------------
    # Communication
    # ------------------------------------------------------------------

    @abc.abstractmethod
    def send(self, prompt: str) -> bool:
        """Send a tick prompt to the agent.

        Returns True if the message was delivered, False on error.
        """

    @abc.abstractmethod
    def wait_for_result(self, timeout: int) -> dict | None:
        """Block until the agent signals turn completion or timeout.

        Returns the result event dict on success, None on timeout/error.
        The dict must contain at least {"type": "result"}.
        """

    # ------------------------------------------------------------------
    # Optional capabilities
    # ------------------------------------------------------------------

    @property
    def session_id(self) -> str | None:
        """Opaque session token for resumption (None if not supported)."""
        return None

    def supports_clear_session(self) -> bool:
        """True if the runtime can wipe conversation history mid-session.

        When False, agent-loop treats clear-session as a full respawn.
        """
        return False

    def clear_session(self) -> bool:
        """Send the runtime-specific clear command.

        Only called when supports_clear_session() is True.
        Returns True if the clear completed successfully.
        """
        return False
