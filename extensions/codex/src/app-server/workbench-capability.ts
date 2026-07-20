/**
 * Observational Codex workbench capability readback.
 *
 * This does not grant tools, select a runner, or enforce success. It records
 * what the harness-launched Codex app-server thread actually exposes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { CodexAppServerRpcError, type CodexAppServerClient } from "./client.js";
import type {
  CodexAppsListResponse,
  CodexListMcpServerStatusResponse,
  CodexModelListResponse,
  CodexPluginListResponse,
  CodexSkillsListResponse,
  JsonObject,
  JsonValue,
} from "./protocol.js";

export type CodexWorkbenchMethodStatus =
  | { status: "ok" }
  | { status: "unsupported"; message: string }
  | { status: "failed"; message: string };
type CodexWorkbenchMethodFailureStatus = Exclude<CodexWorkbenchMethodStatus, { status: "ok" }>;

export const CODEX_WORKBENCH_CAPABILITY_CONTROL_METHODS = Object.freeze([
  "model/list",
  "modelProvider/capabilities/read",
  "config/read",
  "experimentalFeature/list",
  "mcpServerStatus/list",
  "skills/list",
  "plugin/list",
  "app/list",
] as const);

export type CodexWorkbenchMethodPresence = {
  method: string;
  source: "installed_app_server_schema";
  expectedOwner: "codex_app_server";
  modelVisibleVia: "code_mode" | "control_plane" | "mcp";
};

export type CodexWorkbenchProviderCapabilities = CodexWorkbenchMethodStatus & {
  namespaceTools?: boolean;
  imageGeneration?: boolean;
  webSearch?: boolean;
};

export type CodexWorkbenchConfigRead = CodexWorkbenchMethodStatus & {
  includeLayers?: boolean;
  layerCount?: number;
  configKeyCount?: number;
  featureKeys?: string[];
  agentKeys?: string[];
};

export type CodexWorkbenchRoots = {
  executionCwd: string;
  workspaceRoot: string;
  workbenchRoot: string;
  packageProfileRoot?: string;
  mcpServers: string[];
};

export type CodexProjectConfigCapability = {
  source: "package_system_profile";
  present: boolean;
  layerVersion?: string;
  multiAgentVersion?: "v1" | "v2";
  maxConcurrentThreadsPerSession?: number;
  toolNamespace?: string;
  spawnAgentMetadataVisible?: boolean;
  directModelOnly?: boolean;
  error?: string;
};

export type CodexCustomAgentCapability = {
  source: "package_system_profile";
  count: number;
  names: string[];
  files: string[];
  hasCodexReviewer: boolean;
  hasCreativeQualityReviewer: boolean;
  error?: string;
};

export type CodexWorkbenchCapabilityReport = {
  schemaVersion: "openclaw.codex-workbench-capability.v1";
  owner: "codex_app_server";
  observedAt: number;
  appServer: {
    version?: string;
    transport: string;
    command?: string;
    argsCount?: number;
    initialized: boolean;
  };
  thread: {
    threadId: string;
    processCwd: string;
    cwd: string;
    workspaceDir: string;
    sandbox?: string;
    approvalPolicy?: string;
  };
  codexWorkbench: CodexWorkbenchRoots;
  openclawDynamicTools: {
    count: number;
    names: string[];
  };
  codexNativeTools: {
    mode: "app-server-native";
    codeModeConfigured: boolean;
    codeModeOnlyConfigured: boolean;
    expectedModelVisibleItemTypes: string[];
    expectedNativeMethodFamilies: string[];
    expectedSubagentTool: "spawn_agent";
  };
  generatedSchemaMethods: CodexWorkbenchMethodPresence[];
  codexProjectConfig: CodexProjectConfigCapability;
  customAgents: CodexCustomAgentCapability;
  controlMethods: {
    modelList: CodexWorkbenchMethodStatus & { count?: number };
    modelProviderCapabilitiesRead: CodexWorkbenchProviderCapabilities;
    configRead: CodexWorkbenchConfigRead;
    experimentalFeatureList: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
    mcpServerStatusList: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
    skillsList: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
    pluginList: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
    appList: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
  };
};

export async function buildCodexWorkbenchCapabilityReport(params: {
  client: CodexAppServerClient;
  threadId: string;
  cwd: string;
  workspaceDir: string;
  systemProfileDir?: string;
  processCwd?: string;
  appServerStart: {
    transport: string;
    command?: string;
    args?: readonly string[];
  };
  sandbox?: string;
  approvalPolicy?: string;
  codeModeConfigured: boolean;
  codeModeOnlyConfigured: boolean;
  openclawDynamicToolNames: readonly string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<CodexWorkbenchCapabilityReport> {
  const [
    nativeConfig,
    modelList,
    modelProviderCapabilities,
    experimentalFeatures,
    mcpServers,
    skillsList,
    pluginList,
    appList,
  ] = await Promise.all([
    inspectNativeCodexConfig(params),
    probeModelList(params),
    probeModelProviderCapabilities(params),
    probeExperimentalFeatureList(params),
    probeMcpServers(params),
    probeSkillsList(params),
    probePluginList(params),
    probeAppList(params),
  ]);
  const { codexProjectConfig, customAgents } = nativeConfig;
  const appServerVersion = (
    params.client as { getServerVersion?: () => string | undefined }
  ).getServerVersion?.();
  const appServer = {
    transport: params.appServerStart.transport,
    initialized: Boolean(appServerVersion),
    ...(appServerVersion ? { version: appServerVersion } : {}),
    ...(params.appServerStart.command ? { command: params.appServerStart.command } : {}),
    ...(params.appServerStart.args ? { argsCount: params.appServerStart.args.length } : {}),
  };
  const thread = {
    threadId: params.threadId,
    processCwd: params.processCwd ?? process.cwd(),
    cwd: params.cwd,
    workspaceDir: params.workspaceDir,
    ...(params.sandbox ? { sandbox: params.sandbox } : {}),
    ...(params.approvalPolicy ? { approvalPolicy: params.approvalPolicy } : {}),
  };
  const codexWorkbench = await buildCodexWorkbenchRoots({
    cwd: params.cwd,
    workspaceDir: params.workspaceDir,
    systemProfileDir: params.systemProfileDir,
    mcpServers,
  });

  return {
    schemaVersion: "openclaw.codex-workbench-capability.v1",
    owner: "codex_app_server",
    observedAt: Date.now(),
    appServer,
    thread,
    codexWorkbench,
    openclawDynamicTools: {
      count: params.openclawDynamicToolNames.length,
      names: [...params.openclawDynamicToolNames].toSorted((left, right) =>
        left.localeCompare(right),
      ),
    },
    codexNativeTools: {
      mode: "app-server-native",
      codeModeConfigured: params.codeModeConfigured,
      codeModeOnlyConfigured: params.codeModeOnlyConfigured,
      expectedModelVisibleItemTypes: ["commandExecution", "fileChange", "mcpToolCall", "webSearch"],
      expectedNativeMethodFamilies: ["fs/*", "command/exec/*", "fuzzyFileSearch", "mcpServer/*"],
      expectedSubagentTool: "spawn_agent",
    },
    generatedSchemaMethods: buildGeneratedSchemaMethodPresence(),
    codexProjectConfig,
    customAgents,
    controlMethods: {
      modelList,
      modelProviderCapabilitiesRead: modelProviderCapabilities,
      configRead: nativeConfig.configRead,
      experimentalFeatureList: experimentalFeatures,
      mcpServerStatusList: mcpServers,
      skillsList,
      pluginList,
      appList,
    },
  };
}

function buildGeneratedSchemaMethodPresence(): CodexWorkbenchMethodPresence[] {
  const methods: Array<Pick<CodexWorkbenchMethodPresence, "method" | "modelVisibleVia">> = [
    { method: "fs/readFile", modelVisibleVia: "code_mode" },
    { method: "fs/readDirectory", modelVisibleVia: "code_mode" },
    { method: "fs/writeFile", modelVisibleVia: "code_mode" },
    { method: "fs/createDirectory", modelVisibleVia: "code_mode" },
    { method: "fs/getMetadata", modelVisibleVia: "code_mode" },
    { method: "fs/remove", modelVisibleVia: "code_mode" },
    { method: "fs/copy", modelVisibleVia: "code_mode" },
    { method: "command/exec", modelVisibleVia: "code_mode" },
    { method: "command/exec/write", modelVisibleVia: "code_mode" },
    { method: "command/exec/terminate", modelVisibleVia: "code_mode" },
    { method: "command/exec/resize", modelVisibleVia: "code_mode" },
    { method: "fuzzyFileSearch", modelVisibleVia: "code_mode" },
    { method: "mcpServerStatus/list", modelVisibleVia: "control_plane" },
    { method: "mcpServer/tool/call", modelVisibleVia: "mcp" },
    { method: "modelProvider/capabilities/read", modelVisibleVia: "control_plane" },
    { method: "config/read", modelVisibleVia: "control_plane" },
    { method: "experimentalFeature/list", modelVisibleVia: "control_plane" },
    { method: "review/start", modelVisibleVia: "code_mode" },
    { method: "turn/start", modelVisibleVia: "control_plane" },
  ];
  return methods.map((entry) => ({
    method: entry.method,
    modelVisibleVia: entry.modelVisibleVia,
    source: "installed_app_server_schema" as const,
    expectedOwner: "codex_app_server" as const,
  }));
}

async function buildCodexWorkbenchRoots(params: {
  cwd: string;
  workspaceDir: string;
  systemProfileDir?: string;
  mcpServers: CodexWorkbenchMethodStatus & { count?: number; names?: string[] };
}): Promise<CodexWorkbenchRoots> {
  const packageProfileRoot = params.systemProfileDir
    ? await resolveExistingDirectory(params.systemProfileDir)
    : undefined;
  return {
    executionCwd: params.cwd,
    workspaceRoot: params.workspaceDir,
    workbenchRoot: params.cwd,
    ...(packageProfileRoot ? { packageProfileRoot } : {}),
    mcpServers: params.mcpServers.status === "ok" ? (params.mcpServers.names ?? []) : [],
  };
}

async function resolveExistingDirectory(candidate: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(candidate);
    return stat.isDirectory() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

async function inspectNativeCodexConfig(
  params: ProbeParams & {
    systemProfileDir?: string;
  },
): Promise<{
  configRead: CodexWorkbenchConfigRead;
  codexProjectConfig: CodexProjectConfigCapability;
  customAgents: CodexCustomAgentCapability;
}> {
  const source = "package_system_profile" as const;
  const configCwd = params.systemProfileDir
    ? path.join(params.systemProfileDir, "project")
    : params.workspaceDir;
  const response = await safeRequest<JsonObject>(params, "config/read", {
    cwd: configCwd,
    includeLayers: true,
  });
  if (response.status !== "ok") {
    return {
      configRead: response,
      codexProjectConfig: {
        source,
        present: false,
        error: response.message,
      },
      customAgents: {
        source,
        count: 0,
        names: [],
        files: [],
        hasCodexReviewer: false,
        hasCreativeQualityReviewer: false,
        error: response.message,
      },
    };
  }
  const config = isJsonObject(response.value.config) ? response.value.config : {};
  const layers = Array.isArray(response.value.layers) ? response.value.layers : [];
  const expectedDotCodexDir = path.join(configCwd, ".codex");
  const profileLayer = layers.find((entry) => {
    if (!isJsonObject(entry) || !isJsonObject(entry.name)) {
      return false;
    }
    return (
      entry.name.type === "project" &&
      typeof entry.name.dotCodexFolder === "string" &&
      path.resolve(entry.name.dotCodexFolder) === expectedDotCodexDir
    );
  });
  const profileConfig =
    isJsonObject(profileLayer) && isJsonObject(profileLayer.config) ? profileLayer.config : {};
  const features = isJsonObject(profileConfig.features) ? profileConfig.features : {};
  const multiAgentV2 = isJsonObject(features.multi_agent_v2) ? features.multi_agent_v2 : undefined;
  const multiAgentV1 = features.multi_agent === true;
  const agents = isJsonObject(profileConfig.agents) ? profileConfig.agents : {};
  const agentEntries = Object.entries(agents)
    .filter(([, value]) => isJsonObject(value) && typeof value.config_file === "string")
    .map(([name, value]) => ({
      name,
      file: path.basename((value as JsonObject).config_file as string),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const names = agentEntries.map((entry) => entry.name);
  const layerVersion =
    isJsonObject(profileLayer) && typeof profileLayer.version === "string"
      ? profileLayer.version
      : undefined;
  const maxConcurrentThreadsPerSession = multiAgentV2?.max_concurrent_threads_per_session;
  const toolNamespace = multiAgentV2?.tool_namespace;
  const hideSpawnAgentMetadata = multiAgentV2?.hide_spawn_agent_metadata;
  const nonCodeModeOnly = multiAgentV2?.non_code_mode_only;

  return {
    configRead: {
      status: "ok",
      includeLayers: true,
      layerCount: layers.length,
      configKeyCount: Object.keys(config).length,
      featureKeys: Object.keys(isJsonObject(config.features) ? config.features : {}).toSorted(
        (left, right) => left.localeCompare(right),
      ),
      agentKeys: Object.keys(isJsonObject(config.agents) ? config.agents : {}).toSorted(
        (left, right) => left.localeCompare(right),
      ),
    },
    codexProjectConfig: {
      source,
      present: Boolean(profileLayer),
      ...(layerVersion ? { layerVersion } : {}),
      ...(multiAgentV2?.enabled === true
        ? { multiAgentVersion: "v2" as const }
        : multiAgentV1
          ? { multiAgentVersion: "v1" as const }
          : {}),
      ...(typeof maxConcurrentThreadsPerSession === "number"
        ? { maxConcurrentThreadsPerSession }
        : {}),
      ...(typeof toolNamespace === "string" ? { toolNamespace } : {}),
      ...(typeof hideSpawnAgentMetadata === "boolean"
        ? { spawnAgentMetadataVisible: !hideSpawnAgentMetadata }
        : {}),
      ...(typeof nonCodeModeOnly === "boolean" ? { directModelOnly: nonCodeModeOnly } : {}),
      ...(!profileLayer
        ? { error: `No native project layer loaded from ${expectedDotCodexDir}` }
        : {}),
    },
    customAgents: {
      source,
      count: agentEntries.length,
      names,
      files: agentEntries.map((entry) => entry.file),
      hasCodexReviewer: names.includes("codex_reviewer"),
      hasCreativeQualityReviewer: names.includes("creative_quality_reviewer"),
      ...(!profileLayer
        ? { error: `No native project layer loaded from ${expectedDotCodexDir}` }
        : {}),
    },
  };
}

async function probeModelList(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number }> {
  const response = await safeRequest<CodexModelListResponse>(params, "model/list", {
    limit: 100,
  });
  if (response.status !== "ok") {
    return response;
  }
  return { status: "ok", count: readArrayField(response.value, "data").length };
}

async function probeModelProviderCapabilities(
  params: ProbeParams,
): Promise<CodexWorkbenchProviderCapabilities> {
  const response = await safeRequest<JsonObject>(params, "modelProvider/capabilities/read", {});
  if (response.status !== "ok") {
    return response;
  }
  return {
    status: "ok",
    ...readBooleanField(response.value, "namespaceTools", "namespace_tools"),
    ...readBooleanField(response.value, "imageGeneration", "image_generation"),
    ...readBooleanField(response.value, "webSearch", "web_search"),
  };
}

async function probeExperimentalFeatureList(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number; names?: string[] }> {
  const response = await safeRequest<JsonObject>(params, "experimentalFeature/list", {
    cursor: null,
    limit: 100,
  });
  if (response.status !== "ok") {
    return response;
  }
  const data = Array.isArray(response.value.data) ? response.value.data : [];
  const names = data
    .map((entry) => (isJsonObject(entry) ? readStringField(entry, "name", "id", "key") : undefined))
    .filter((value): value is string => Boolean(value?.trim()))
    .toSorted((left, right) => left.localeCompare(right));
  return { status: "ok", count: data.length, names };
}

async function probeMcpServers(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number; names?: string[] }> {
  const response = await safeRequest<CodexListMcpServerStatusResponse>(
    params,
    "mcpServerStatus/list",
    {
      cursor: null,
      limit: 100,
      detail: "toolsAndAuthOnly",
      threadId: params.threadId,
    },
  );
  if (response.status !== "ok") {
    return response;
  }
  const data = readArrayField(response.value, "data");
  return {
    status: "ok",
    count: data.length,
    names: data
      .map((entry) =>
        isJsonObject(entry) ? readStringField(entry, "name", "id", "key") : undefined,
      )
      .filter((value): value is string => Boolean(value?.trim()))
      .toSorted((left, right) => left.localeCompare(right)),
  };
}

async function probeSkillsList(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number; names?: string[] }> {
  const response = await safeRequest<CodexSkillsListResponse>(params, "skills/list", {
    cwds: [params.workspaceDir],
    forceReload: false,
  });
  if (response.status !== "ok") {
    return response;
  }
  const skills = readArrayField(response.value, "data").flatMap((entry) =>
    isJsonObject(entry) ? readArrayField(entry, "skills") : [],
  );
  return {
    status: "ok",
    count: skills.length,
    names: skills
      .map((skill) =>
        isJsonObject(skill) ? readStringField(skill, "name", "id", "key") : undefined,
      )
      .filter((value): value is string => Boolean(value?.trim()))
      .toSorted((left, right) => left.localeCompare(right)),
  };
}

async function probePluginList(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number; names?: string[] }> {
  const response = await safeRequest<CodexPluginListResponse>(params, "plugin/list", {
    cwds: [params.workspaceDir],
  });
  if (response.status !== "ok") {
    return response;
  }
  const plugins = readArrayField(response.value, "marketplaces").flatMap((marketplace) =>
    isJsonObject(marketplace) ? readArrayField(marketplace, "plugins") : [],
  );
  return {
    status: "ok",
    count: plugins.length,
    names: plugins
      .map((plugin) =>
        isJsonObject(plugin) ? readStringField(plugin, "name", "id", "key") : undefined,
      )
      .filter((value): value is string => Boolean(value?.trim()))
      .toSorted((left, right) => left.localeCompare(right)),
  };
}

async function probeAppList(
  params: ProbeParams,
): Promise<CodexWorkbenchMethodStatus & { count?: number; names?: string[] }> {
  const response = await safeRequest<CodexAppsListResponse>(params, "app/list", {
    cursor: null,
    limit: 100,
    forceRefetch: false,
  });
  if (response.status !== "ok") {
    return response;
  }
  const data = readArrayField(response.value, "data");
  return {
    status: "ok",
    count: data.length,
    names: data
      .map((app) => (isJsonObject(app) ? readStringField(app, "name", "id", "key") : undefined))
      .filter((value): value is string => Boolean(value?.trim()))
      .toSorted((left, right) => left.localeCompare(right)),
  };
}

type ProbeParams = {
  client: CodexAppServerClient;
  threadId: string;
  workspaceDir: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

async function safeRequest<T>(
  params: ProbeParams,
  method: string,
  requestParams: JsonObject | undefined,
  coerce?: (value: unknown) => T,
): Promise<{ status: "ok"; value: T } | CodexWorkbenchMethodFailureStatus> {
  try {
    const options = {
      ...(params.timeoutMs !== undefined ? { timeoutMs: params.timeoutMs } : {}),
      ...(params.signal ? { signal: params.signal } : {}),
    };
    const rawValue = await params.client.request(method, requestParams, options);
    const value = coerce ? coerce(rawValue) : (rawValue as T);
    return { status: "ok", value };
  } catch (error) {
    if (error instanceof CodexAppServerRpcError && error.code === -32601) {
      return { status: "unsupported", message: formatCapabilityError(error) };
    }
    return { status: "failed", message: formatCapabilityError(error) };
  }
}

function readBooleanField(
  value: JsonObject,
  camelKey: string,
  snakeKey: string,
): Record<string, boolean> {
  const candidate = value[camelKey] ?? value[snakeKey];
  return typeof candidate === "boolean" ? { [camelKey]: candidate } : {};
}

function readStringField(value: JsonObject, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function readArrayField(value: JsonObject, key: string): JsonValue[] {
  const candidate = value[key];
  return Array.isArray(candidate) ? candidate : [];
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatCapabilityError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
