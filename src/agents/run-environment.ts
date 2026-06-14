import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { hasConfiguredModelFallbacks } from "./agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import { log } from "./pi-embedded-runner/logger.js";
import { ensureRuntimePluginsLoaded } from "./runtime-plugins.js";
import {
  redactRunIdentifier,
  resolveRunWorkspaceDir,
  type ResolveRunWorkspaceResult,
} from "./workspace-run.js";

export type PreparedRunEnvironment = {
  owner: "agent_runtime_core";
  workspaceResolution: ResolveRunWorkspaceResult;
  resolvedWorkspace: string;
  provider: string;
  modelId: string;
  agentDir: string;
  normalizedSessionKey: string | null;
  fallbackConfigured: boolean;
  runtimePluginsLoaded: boolean;
  runtimePluginsStatus: "loaded" | "skipped_not_requested";
  modelsJsonStatus: "reused_admitted_runtime" | "ensured";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type PrepareRunEnvironmentInput = {
  config?: OpenClawConfig;
  runId?: string;
  workspaceDir: string;
  sessionId: string;
  sessionKey?: string | null;
  agentId?: string | null;
  provider?: string | null;
  model?: string | null;
  agentDir?: string | null;
  runtimePluginIds?: string[];
  allowGatewaySubagentBinding?: boolean;
  modelsJsonPolicy?: "refresh" | "reuse-existing";
  authRuntimeAdmitted: boolean;
};

export async function prepareRunEnvironment(
  input: PrepareRunEnvironmentInput,
): Promise<PreparedRunEnvironment> {
  const workspaceResolution = resolveRunWorkspaceDir({
    workspaceDir: input.workspaceDir,
    sessionKey: input.sessionKey ?? undefined,
    agentId: input.agentId ?? undefined,
    config: input.config,
  });
  const resolvedWorkspace = workspaceResolution.workspaceDir;
  if (workspaceResolution.usedFallback) {
    log.warn(
      `[workspace-fallback] caller=AgentRuntimeCore reason=${workspaceResolution.fallbackReason} run=${input.runId} session=${redactRunIdentifier(input.sessionId)} sessionKey=${redactRunIdentifier(input.sessionKey ?? undefined)} agent=${workspaceResolution.agentId} workspace=${redactRunIdentifier(resolvedWorkspace)}`,
    );
  }
  const shouldLoadRuntimePlugins =
    input.allowGatewaySubagentBinding === true || (input.runtimePluginIds?.length ?? 0) > 0;
  if (shouldLoadRuntimePlugins) {
    ensureRuntimePluginsLoaded({
      config: input.config,
      workspaceDir: resolvedWorkspace,
      allowGatewaySubagentBinding: input.allowGatewaySubagentBinding,
      onlyPluginIds: input.runtimePluginIds,
    });
  }
  const provider = (input.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
  const modelId = (input.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const agentDir = input.agentDir?.trim() || resolveOpenClawAgentDir();
  const normalizedSessionKey = input.sessionKey?.trim() || null;
  const fallbackConfigured = hasConfiguredModelFallbacks({
    cfg: input.config,
    agentId: input.agentId ?? undefined,
    sessionKey: normalizedSessionKey ?? undefined,
  });
  const callerAdmittedModelRuntime =
    input.modelsJsonPolicy === "reuse-existing" && input.authRuntimeAdmitted;
  if (!callerAdmittedModelRuntime) {
    await ensureOpenClawModelsJson(input.config, agentDir, {
      policy: input.modelsJsonPolicy,
    });
  }
  return {
    owner: "agent_runtime_core",
    workspaceResolution,
    resolvedWorkspace,
    provider,
    modelId,
    agentDir,
    normalizedSessionKey,
    fallbackConfigured,
    runtimePluginsLoaded: shouldLoadRuntimePlugins,
    runtimePluginsStatus: shouldLoadRuntimePlugins ? "loaded" : "skipped_not_requested",
    modelsJsonStatus: callerAdmittedModelRuntime ? "reused_admitted_runtime" : "ensured",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
