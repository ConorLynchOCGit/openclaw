import fs from "node:fs/promises";
import path from "node:path";
import type { CodexAppServerClient } from "./client.js";
import { isJsonObject, type CodexSelectedCapabilityRoot, type JsonObject } from "./protocol.js";

const CODING_AGENT_ID = "coding";
const CODEX_LOCAL_ENVIRONMENT_ID = "local";
const CODEX_PRODUCT_CAPABILITY_ROOT_ID = "openclaw-codex-product-profile";
const CODEX_WORKSPACE_PERMISSION_PROFILE = ":workspace";
const EXPECTED_PURPOSE_AGENTS = [
  "architect_reviewer",
  "code_reviewer",
  "codex_reviewer",
  "creative_quality_reviewer",
  "docs_researcher",
  "implementation_planner",
  "implementer",
  "native_fit_reviewer",
  "project_explorer",
  "test_engineer",
] as const;

export type CodexLoadedSystemProfile = {
  profileDir: string;
  projectDir: string;
  configLayerVersion: string;
  config: JsonObject;
  developerInstructions: string;
  permissionProfile: string;
  agentNames: string[];
  selectedCapabilityRoots: CodexSelectedCapabilityRoot[];
};

const profileCache = new WeakMap<
  CodexAppServerClient,
  Map<string, Promise<CodexLoadedSystemProfile>>
>();

export function resolveCodexSystemProfileDir(pluginRoot: string | undefined): string {
  const normalizedRoot = pluginRoot?.trim();
  if (!normalizedRoot) {
    throw new Error("Codex package root is unavailable for the immutable Coding profile");
  }
  return path.join(path.resolve(normalizedRoot), "system-profile");
}

export function loadCodexSystemProfileForAgent(params: {
  client: CodexAppServerClient;
  pluginRoot?: string;
  agentId?: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CodexLoadedSystemProfile | undefined> {
  if (params.agentId?.trim().toLowerCase() !== CODING_AGENT_ID) {
    return Promise.resolve(undefined);
  }
  const profileDir = resolveCodexSystemProfileDir(params.pluginRoot);
  let clientProfiles = profileCache.get(params.client);
  if (!clientProfiles) {
    clientProfiles = new Map();
    profileCache.set(params.client, clientProfiles);
  }
  const existing = clientProfiles.get(profileDir);
  if (existing) {
    return existing;
  }
  const loading = loadCodexSystemProfile({
    client: params.client,
    profileDir,
    timeoutMs: params.timeoutMs,
    signal: params.signal,
  });
  clientProfiles.set(profileDir, loading);
  void loading.catch(() => clientProfiles?.delete(profileDir));
  return loading;
}

async function loadCodexSystemProfile(params: {
  client: CodexAppServerClient;
  profileDir: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CodexLoadedSystemProfile> {
  const projectDir = path.join(params.profileDir, "project");
  const dotCodexDir = path.join(projectDir, ".codex");
  const response = await params.client.request<JsonObject>(
    "config/read",
    { cwd: projectDir, includeLayers: true },
    { timeoutMs: params.timeoutMs, signal: params.signal },
  );
  const layers = Array.isArray(response.layers) ? response.layers : [];
  const profileLayer = layers.find((entry) => {
    if (!isJsonObject(entry) || !isJsonObject(entry.name)) {
      return false;
    }
    return (
      entry.name.type === "project" &&
      typeof entry.name.dotCodexFolder === "string" &&
      path.resolve(entry.name.dotCodexFolder) === dotCodexDir
    );
  });
  if (!isJsonObject(profileLayer) || !isJsonObject(profileLayer.config)) {
    throw new Error(`Codex did not load its immutable Coding profile from ${dotCodexDir}`);
  }
  const configLayerVersion = profileLayer.version;
  if (typeof configLayerVersion !== "string" || !configLayerVersion.trim()) {
    throw new Error("Codex immutable Coding profile is missing its native layer version");
  }
  const config = await materializePackageOwnedMcpConfig(profileLayer.config, params.profileDir);
  const agentNames = readPurposeAgentNames(config);
  if (
    agentNames.length !== EXPECTED_PURPOSE_AGENTS.length ||
    agentNames.some((name, index) => name !== EXPECTED_PURPOSE_AGENTS[index])
  ) {
    throw new Error(
      `Codex immutable Coding profile has unexpected purpose agents: ${agentNames.join(", ")}`,
    );
  }
  if (config.project_doc_max_bytes !== 0) {
    throw new Error("Codex immutable Coding profile must disable editable project documents");
  }
  if (config.default_permissions !== CODEX_WORKSPACE_PERMISSION_PROFILE) {
    throw new Error("Codex immutable Coding profile must select native :workspace permissions");
  }
  const developerInstructions = config.developer_instructions;
  if (typeof developerInstructions !== "string" || !developerInstructions.trim()) {
    throw new Error("Codex immutable Coding profile is missing developer instructions");
  }

  const sharedSkillsDir = path.join(params.profileDir, "shared-skills");
  const sharedSkillsStat = await fs.stat(sharedSkillsDir);
  if (!sharedSkillsStat.isDirectory()) {
    throw new Error(`Codex product capability root is not a directory: ${sharedSkillsDir}`);
  }

  return {
    profileDir: params.profileDir,
    projectDir,
    configLayerVersion,
    config,
    developerInstructions,
    permissionProfile: CODEX_WORKSPACE_PERMISSION_PROFILE,
    agentNames,
    selectedCapabilityRoots: [
      {
        id: CODEX_PRODUCT_CAPABILITY_ROOT_ID,
        location: {
          type: "environment",
          environmentId: CODEX_LOCAL_ENVIRONMENT_ID,
          path: sharedSkillsDir,
        },
      },
    ],
  };
}

export function buildCodexUntrustedProjectConfig(cwd: string): JsonObject {
  return {
    projects: {
      [path.resolve(cwd)]: {
        trust_level: "untrusted",
      },
    },
  };
}

async function materializePackageOwnedMcpConfig(
  config: JsonObject,
  profileDir: string,
): Promise<JsonObject> {
  const mcpServers = isJsonObject(config.mcp_servers) ? config.mcp_servers : undefined;
  const workbench = mcpServers?.openclaw_repo_workbench;
  if (!isJsonObject(workbench) || workbench.command !== "node") {
    throw new Error("Codex immutable Coding profile is missing its Workbench MCP server");
  }
  if (
    !Array.isArray(workbench.args) ||
    workbench.args.length !== 1 ||
    workbench.args[0] !== "tools/openclaw-repo-workbench.mjs"
  ) {
    throw new Error("Codex immutable Coding profile has an invalid Workbench package path");
  }
  if (workbench.cwd !== undefined || workbench.env !== undefined) {
    throw new Error("Workbench MCP must inherit the Codex thread cwd and cleared environment");
  }
  const executable = path.join(profileDir, "tools", "openclaw-repo-workbench.mjs");
  const executableStat = await fs.stat(executable);
  if (!executableStat.isFile()) {
    throw new Error(`Workbench MCP package asset is not a file: ${executable}`);
  }
  return {
    ...config,
    mcp_servers: {
      ...mcpServers,
      openclaw_repo_workbench: {
        ...workbench,
        args: [executable],
      },
    },
  };
}

function readPurposeAgentNames(config: JsonObject): string[] {
  const agents = isJsonObject(config.agents) ? config.agents : {};
  return Object.entries(agents)
    .filter(([, value]) => isJsonObject(value) && typeof value.config_file === "string")
    .map(([name]) => name)
    .toSorted((left, right) => left.localeCompare(right));
}
