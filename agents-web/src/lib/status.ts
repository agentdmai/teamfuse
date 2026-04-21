import { promises as fs } from "node:fs";
import path from "node:path";
import { AGENTS, getAgent, type AgentId } from "@/lib/agents";

// Loose shape: each agent's CLAUDE.md defines its own vocabulary for `state`
// (e.g. pm-bot: idle | triaging | auditing | gmail-pass | blocked). The
// orchestrator's own transitions (stopped/starting/running/errored) are
// layered in at the API boundary.
export type AgentState = string;

export interface AgentStatus {
  agent: AgentId;
  state: AgentState;
  // pm-bot / eng-bot schema
  tick?: string | null;
  last_action?: string | null;
  // legacy/fixture schema (keep for compat while in flux)
  current_card?: string | null;
  current_step?: string | null;
  last_tool?: string | null;
  last_message_ts?: string | null;
  heartbeat_ts?: string | null;
  // pass-through for any extra fields the agent writes
  extra?: Record<string, unknown>;
}

export interface AgentStatusReadResult {
  agent: AgentId;
  status: AgentStatus;
  source: "file" | "missing" | "invalid";
  path: string;
  error?: string;
}

function statusPathFor(id: AgentId): string | null {
  const agent = getAgent(id);
  if (!agent) return null;
  return path.join(agent.workingDir, "status.json");
}

function defaultStoppedStatus(id: AgentId): AgentStatus {
  return {
    agent: id,
    state: "stopped",
    current_card: null,
    current_step: null,
    last_tool: null,
    last_message_ts: null,
    heartbeat_ts: null,
  };
}

const KNOWN_KEYS = new Set([
  "agent",
  "state",
  "tick",
  "last_action",
  "current_card",
  "current_step",
  "last_tool",
  "last_message_ts",
  "heartbeat_ts",
]);

function coerceStatus(id: AgentId, raw: unknown): AgentStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const state = typeof obj.state === "string" ? obj.state : null;
  if (!state) return null;
  const heartbeat =
    typeof obj.heartbeat_ts === "string"
      ? obj.heartbeat_ts
      : typeof obj.tick === "string"
        ? obj.tick
        : null;
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!KNOWN_KEYS.has(k)) extra[k] = v;
  }
  return {
    agent: id,
    state,
    tick: typeof obj.tick === "string" ? obj.tick : null,
    last_action: typeof obj.last_action === "string" ? obj.last_action : null,
    current_card: typeof obj.current_card === "string" ? obj.current_card : null,
    current_step: typeof obj.current_step === "string" ? obj.current_step : null,
    last_tool: typeof obj.last_tool === "string" ? obj.last_tool : null,
    last_message_ts:
      typeof obj.last_message_ts === "string" ? obj.last_message_ts : null,
    heartbeat_ts: heartbeat,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

async function readOne(id: AgentId): Promise<AgentStatusReadResult> {
  const filePath = statusPathFor(id);
  if (!filePath) {
    return {
      agent: id,
      status: defaultStoppedStatus(id),
      source: "missing",
      path: "",
      error: "unknown agent id",
    };
  }
  try {
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    const status = coerceStatus(id, parsed);
    if (!status) {
      return {
        agent: id,
        status: defaultStoppedStatus(id),
        source: "invalid",
        path: filePath,
        error: "status.json did not match the expected shape",
      };
    }
    return { agent: id, status, source: "file", path: filePath };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return {
        agent: id,
        status: defaultStoppedStatus(id),
        source: "missing",
        path: filePath,
      };
    }
    return {
      agent: id,
      status: defaultStoppedStatus(id),
      source: "invalid",
      path: filePath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function readAllAgentStatuses(): Promise<AgentStatusReadResult[]> {
  return Promise.all(AGENTS.map((a) => readOne(a.id)));
}

export async function readAgentStatus(
  id: AgentId,
): Promise<AgentStatusReadResult> {
  return readOne(id);
}
