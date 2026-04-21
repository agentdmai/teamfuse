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
//       { "id": "pm-bot", "alias": "@pm-bot", "role": "Product Manager", "chrome": false },
//       ...
//     ]
//   }
//
// `chrome: true` means the wrapper launches `claude --chrome` (headed Chrome
// via the Claude-in-Chrome extension). Only one agent should set this at a
// time: they share the host's single Chrome instance and its login state.

export type AgentId = string;

export interface AgentDefinition {
  id: AgentId;
  alias: string;
  role: string;
  workingDir: string;
  chrome: boolean;
}

interface RawAgent {
  id: string;
  alias: string;
  role: string;
  chrome?: boolean;
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
  const agents: AgentDefinition[] = (parsed.agents ?? []).map((a) => ({
    id: a.id,
    alias: a.alias,
    role: a.role,
    chrome: Boolean(a.chrome),
    workingDir: path.join(agentsRoot, a.id),
  }));
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
