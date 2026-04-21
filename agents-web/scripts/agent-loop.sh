#!/usr/bin/env bash
# Thin launcher that execs agent-loop.py (the real long-lived wrapper).
#
# The supervisor (src/lib/supervisor.ts) invokes this script by name and
# preserves the path contract, so we keep it as the entrypoint.
#
# History: agent-loop.sh USED to be the wrapper itself (per-tick fork model
# via `claude -p "<prompt>"`). The Python rewrite moved to a persistent
# claude process with stream-json I/O + `/clear` on task-done; see
# agent-loop.py for the full design. Env vars and the signal contract
# (SIGUSR1 = wake, SIGTERM = stop the process group) are unchanged.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/agent-loop.py" "$@"
