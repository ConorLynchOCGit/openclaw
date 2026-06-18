// Resolves factual launch inputs for native agent executions.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  normalizeStoredOverrideModel,
  resolveDefaultModelForAgent,
  resolvePersistedSelectedModelRef,
} from "./model-selection.js";

export type AgentExecutionLaunchMode = "fresh" | "resume";

export type AgentExecutionModelRef = {
  provider: string;
  model: string;
};

export type AgentExecutionRuntime = "openclaw" | "codex";

export type AgentExecutionPlan = {
  targetAgentId?: string;
  launchMode: AgentExecutionLaunchMode;
  model: AgentExecutionModelRef;
  runtime: AgentExecutionRuntime;
  requested?: {
    model?: string;
  };
};

export function resolveExecutionPlan(params: {
  cfg: OpenClawConfig;
  targetAgentId?: string;
  launchMode?: AgentExecutionLaunchMode;
  sessionModel?: {
    modelProvider?: string;
    model?: string;
  };
  requestedProvider?: string;
  requestedModel?: string;
  allowRequestOverride?: boolean;
  allowPluginNormalization?: boolean;
}): AgentExecutionPlan {
  const launchMode = params.launchMode ?? "resume";
  const targetAgentId = normalizeOptionalString(params.targetAgentId);
  const targetDefault = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: targetAgentId,
    allowPluginNormalization: params.allowPluginNormalization,
  });
  const requested = normalizeStoredOverrideModel({
    providerOverride: params.requestedProvider,
    modelOverride: params.requestedModel,
  });
  const overrideModel =
    params.allowRequestOverride === true && requested.providerOverride && requested.modelOverride
      ? resolvePersistedSelectedModelRef({
          defaultProvider: targetDefault.provider,
          overrideProvider: requested.providerOverride,
          overrideModel: requested.modelOverride,
          allowPluginNormalization: params.allowPluginNormalization,
        })
      : null;
  const sessionProvider = normalizeOptionalString(params.sessionModel?.modelProvider);
  const sessionModel = normalizeOptionalString(params.sessionModel?.model);
  const model =
    overrideModel ??
    (launchMode === "resume" && sessionProvider && sessionModel
      ? { provider: sessionProvider, model: sessionModel }
      : targetDefault);

  return {
    ...(targetAgentId ? { targetAgentId } : {}),
    launchMode,
    model,
    runtime: "openclaw",
    ...(requested.providerOverride && requested.modelOverride
      ? { requested: { model: `${requested.providerOverride}/${requested.modelOverride}` } }
      : {}),
  };
}
