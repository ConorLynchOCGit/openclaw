/**
 * Loads the immutable, package-owned Codex profile through Codex's native
 * config parser. The editable repository is never a configuration authority.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { CodexAppServerClient } from "./client.js";
import { isJsonObject, type CodexSelectedCapabilityRoot, type JsonObject } from "./protocol.js";

const CODEX_LOCAL_ENVIRONMENT_ID = "local";

export type CodexLoadedSystemProfile = {
  profileDir: string;
  projectDir: string;
  configLayerVersion: string;
  config: JsonObject;
  agentNames: string[];
  selectedCapabilityRoots: CodexSelectedCapabilityRoot[];
};

const profileCache = new WeakMap<
  CodexAppServerClient,
  Map<string, Promise<CodexLoadedSystemProfile>>
>();

export function loadCodexSystemProfile(params: {
  client: CodexAppServerClient;
  systemProfileDir: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CodexLoadedSystemProfile> {
  const profileDir = path.resolve(params.systemProfileDir);
  let clientProfiles = profileCache.get(params.client);
  if (!clientProfiles) {
    clientProfiles = new Map();
    profileCache.set(params.client, clientProfiles);
  }
  const existing = clientProfiles.get(profileDir);
  if (existing) {
    return existing;
  }
  const loading = loadCodexSystemProfileUncached({ ...params, systemProfileDir: profileDir });
  clientProfiles.set(profileDir, loading);
  void loading.catch(() => clientProfiles?.delete(profileDir));
  return loading;
}

async function loadCodexSystemProfileUncached(params: {
  client: CodexAppServerClient;
  systemProfileDir: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<CodexLoadedSystemProfile> {
  const profileDir = params.systemProfileDir;
  const projectDir = path.join(profileDir, "project");
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
    throw new Error(`Codex did not load its immutable system profile from ${dotCodexDir}`);
  }
  const configLayerVersion = profileLayer.version;
  if (typeof configLayerVersion !== "string" || !configLayerVersion.trim()) {
    throw new Error("Codex system profile readback is missing its native layer version");
  }
  const agents = isJsonObject(profileLayer.config.agents) ? profileLayer.config.agents : {};
  const agentNames = Object.entries(agents)
    .filter(([, value]) => isJsonObject(value) && typeof value.config_file === "string")
    .map(([name]) => name)
    .toSorted((left, right) => left.localeCompare(right));
  const config = await materializePackageOwnedMcpConfig(profileLayer.config, profileDir);

  return {
    profileDir,
    projectDir,
    configLayerVersion,
    config,
    agentNames,
    selectedCapabilityRoots: [
      buildCapabilityRoot("codex-system-skills", profileDir, "skills"),
      buildCapabilityRoot("openclaw-shared-system-skills", profileDir, "shared-skills"),
      buildCapabilityRoot("openclaw-contributor-guidance", profileDir, "contributor-guidance"),
    ],
  };
}

async function materializePackageOwnedMcpConfig(
  config: JsonObject,
  profileDir: string,
): Promise<JsonObject> {
  const mcpServers = isJsonObject(config.mcp_servers) ? config.mcp_servers : undefined;
  const workbench = mcpServers?.openclaw_repo_workbench;
  if (!isJsonObject(workbench) || workbench.command !== "node") {
    throw new Error("Codex system profile is missing its package-owned Workbench MCP server");
  }
  if (
    !Array.isArray(workbench.args) ||
    workbench.args.length !== 1 ||
    workbench.args[0] !== "tools/openclaw-repo-workbench.mjs"
  ) {
    throw new Error("Codex system profile has an invalid Workbench MCP package path");
  }
  if (workbench.cwd !== undefined || workbench.env !== undefined) {
    throw new Error("Workbench MCP must inherit the Codex thread cwd and cleared environment");
  }
  const executable = path.join(profileDir, "tools", "openclaw-repo-workbench.mjs");
  const stat = await fs.stat(executable);
  if (!stat.isFile()) {
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

function buildCapabilityRoot(
  id: string,
  profileDir: string,
  relativePath: string,
): CodexSelectedCapabilityRoot {
  return {
    id,
    location: {
      type: "environment",
      environmentId: CODEX_LOCAL_ENVIRONMENT_ID,
      path: path.join(profileDir, relativePath),
    },
  };
}
