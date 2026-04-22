import "server-only";
import fs from "node:fs";
import path from "node:path";

// Config-driven agent registry. At startup the control plane reads
// `agents.config.json` from the repo root (one level above agents-web/).
// Override the location with the AGENTS_CONFIG env var if you keep it
// elsewhere.
//
// Config shape:
//   {
//     "companyName": "Your Company",
//     "agentsRoot": "./agents",
//     "agents": [
//       { "id": "pm-bot", "alias": "@pm-bot", "role": "Product Manager",
//         "runtime": "claude", "chrome": false },
//       { "id": "copilot-eng", "alias": "@copilot-eng", "role": "Engineer",
//         "runtime": "copilot" }
//     ]
//   }
//
// `runtime` selects the agent-loop adapter.  Defaults to "claude".
//   "claude"  — Claude Code CLI (stream-json, persistent session, CLAUDE.md auto-loaded)
//   "copilot" — GitHub Copilot CLI (-p flag, JSONL output, AGENTS.md auto-loaded,
//               --resume=<session-id> for cross-tick context continuity)
//
// `chrome: true` is Claude-only. Passes `--chrome` to the claude CLI so it
// shares the host's single headed Chrome instance. Only one agent at a time.
//
// `instructionsFile` overrides the default instruction filename per runtime
// (claude → CLAUDE.md, copilot → AGENTS.md). Rarely needed.

export type AgentId = string;
export type AgentRuntime = "claude" | "copilot";

export interface AgentDefinition {
  id: AgentId;
  alias: string;
  role: string;
  workingDir: string;
  runtime: AgentRuntime;
  /** Claude-only: share the host's headed Chrome session. */
  chrome: boolean;
  /** Override the default instructions filename for this agent's runtime. */
  instructionsFile?: string;
}

interface RawAgent {
  id: string;
  alias: string;
  role: string;
  runtime?: string;
  chrome?: boolean;
  instructionsFile?: string;
}

interface RawConfig {
  companyName?: string;
  agentsRoot?: string;
  agents?: RawAgent[];
}

function resolveConfigPath(): string {
  const envPath = process.env.AGENTS_CONFIG;
  if (envPath && envPath.trim().length > 0) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), "..", "agents.config.json");
}

function resolveAgentsRoot(raw: string, configPath: string): string {
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(path.dirname(configPath), raw);
}

interface LoadedConfig {
  companyName: string;
  agents: AgentDefinition[];
}

let cached: LoadedConfig | null = null;

function loadConfig(): LoadedConfig {
  if (cached) return cached;
  const configPath = resolveConfigPath();
  let parsed: RawConfig;
  try {
    const text = fs.readFileSync(configPath, "utf8");
    parsed = JSON.parse(text) as RawConfig;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      cached = { companyName: "Your Company", agents: [] };
      return cached;
    }
    throw new Error(
      `Failed to read agents config at ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const agentsRoot = resolveAgentsRoot(
    typeof parsed.agentsRoot === "string" ? parsed.agentsRoot : "./agents",
    configPath,
  );
  const agents: AgentDefinition[] = (parsed.agents ?? []).map((a) => {
    const runtime: AgentRuntime =
      a.runtime === "copilot" ? "copilot" : "claude";
    return {
      id: a.id,
      alias: a.alias,
      role: a.role,
      runtime,
      chrome: Boolean(a.chrome),
      workingDir: path.join(agentsRoot, a.id),
      ...(a.instructionsFile ? { instructionsFile: a.instructionsFile } : {}),
    };
  });
  cached = {
    companyName:
      typeof parsed.companyName === "string" && parsed.companyName.length > 0
        ? parsed.companyName
        : "Your Company",
    agents,
  };
  return cached;
}

export const AGENTS: AgentDefinition[] = loadConfig().agents;
export const COMPANY_NAME: string = loadConfig().companyName;
export const AGENT_IDS: AgentId[] = AGENTS.map((a) => a.id);

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as string[]).includes(value);
}

export function getAgent(id: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.id === id);
}
