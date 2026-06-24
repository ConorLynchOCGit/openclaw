/** Shared target-agent scope resolution for model commands. */
import {
  resolveAgentDir,
  resolveAgentExplicitModelPrimary,
  resolveAgentModelFallbacksOverride,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import type { AgentModelEntryConfig } from "../../config/types.agent-defaults.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { resolveKnownAgentId } from "./shared.js";

export type ModelsCommandAgentScope = {
  /** Explicit user-requested agent id, if supplied. */
  explicitAgentId?: string;
  /** Effective agent id used for workspace/auth scope. */
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  agentModelPrimary?: string;
  agentFallbacksOverride?: string[];
  effectiveModelMap: Record<string, AgentModelEntryConfig>;
  scopedConfig: OpenClawConfig;
};

function findConfiguredAgent(cfg: OpenClawConfig, agentId: string) {
  const normalized = normalizeAgentId(agentId);
  return cfg.agents?.list?.find((entry) =>
    entry.id ? normalizeAgentId(entry.id) === normalized : false,
  );
}

export function resolveModelsCommandAgentScope(params: {
  cfg: OpenClawConfig;
  rawAgentId?: string | null;
  defaultAgentDirOverride?: string;
}): ModelsCommandAgentScope {
  const explicitAgentId = resolveKnownAgentId({
    cfg: params.cfg,
    rawAgentId: params.rawAgentId,
  });
  const agentId = explicitAgentId ?? resolveDefaultAgentId(params.cfg);
  const agentDir = explicitAgentId
    ? resolveAgentDir(params.cfg, explicitAgentId)
    : (params.defaultAgentDirOverride ?? resolveAgentDir(params.cfg, agentId));
  const workspaceDir =
    resolveAgentWorkspaceDir(params.cfg, agentId) ?? resolveDefaultAgentWorkspaceDir();
  const agentEntry = explicitAgentId ? findConfiguredAgent(params.cfg, explicitAgentId) : undefined;
  const agentModelPrimary = explicitAgentId
    ? resolveAgentExplicitModelPrimary(params.cfg, explicitAgentId)
    : undefined;
  const agentFallbacksOverride = explicitAgentId
    ? resolveAgentModelFallbacksOverride(params.cfg, explicitAgentId)
    : undefined;
  const defaultModelMap = params.cfg.agents?.defaults?.models ?? {};
  const effectiveModelMap =
    explicitAgentId && agentEntry?.models
      ? {
          ...defaultModelMap,
          ...agentEntry.models,
        }
      : defaultModelMap;
  const shouldApplyAgentScope =
    Boolean(explicitAgentId && agentEntry?.models) ||
    Boolean(agentModelPrimary && agentModelPrimary.length > 0) ||
    agentFallbacksOverride !== undefined;
  const scopedConfig = shouldApplyAgentScope
    ? {
        ...params.cfg,
        agents: {
          ...params.cfg.agents,
          defaults: {
            ...params.cfg.agents?.defaults,
            model: {
              ...(typeof params.cfg.agents?.defaults?.model === "object"
                ? params.cfg.agents.defaults.model
                : {}),
              ...(agentModelPrimary ? { primary: agentModelPrimary } : {}),
              ...(agentFallbacksOverride !== undefined
                ? { fallbacks: agentFallbacksOverride }
                : {}),
            },
            models: effectiveModelMap,
          },
        },
      }
    : params.cfg;

  return {
    ...(explicitAgentId ? { explicitAgentId } : {}),
    agentId,
    agentDir,
    workspaceDir,
    ...(agentModelPrimary ? { agentModelPrimary } : {}),
    ...(agentFallbacksOverride !== undefined ? { agentFallbacksOverride } : {}),
    effectiveModelMap,
    scopedConfig,
  };
}
