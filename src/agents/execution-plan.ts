// Resolves factual launch inputs for native agent executions.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { sanitizeForLog } from "../../packages/terminal-core/src/ansi.js";
import { resolveAgentModelFallbackValues } from "../config/model-input.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  admitAgentExecution,
  admissionFallbackDisplayRefs,
  admissionPrimaryTransport,
  type AdmissionRuntimeId,
  type RunAdmissionDecision,
} from "./admission-kernel.js";
import { resolveModelAgentRuntimeMetadata } from "./agent-runtime-metadata.js";
import { resolveAgentConfig, resolveAgentWorkspaceDir } from "./agent-scope-config.js";
import {
  modelIdentityDisplayRef,
  modelIdentityMatchesRef,
  modelIdentityTransportSnapshot,
  type ModelIdentityKey,
  type ModelIdentityTransportSnapshot,
} from "./model-identity.js";
import {
  modelKey,
  normalizeStoredOverrideModel,
  parseModelRef,
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
  runId: string;
  targetAgentId?: string;
  launchMode: AgentExecutionLaunchMode;
  source: {
    kind:
      | "chat"
      | "gateway"
      | "plugin"
      | "subagent"
      | "taskflow"
      | "lobster"
      | "codex"
      | "user"
      | "cron"
      | "unknown";
    id?: string;
    hook?: string;
  };
  workspace?: string;
  contextMode?: "full" | "lightweight";
  admission: RunAdmissionDecision;
  /**
   * Compatibility projection from admission.model.primaryIdentityKey.
   * Fresh planned runs must consume admission, not this projection.
   */
  model: AgentExecutionModelRef;
  /** Compatibility projection from admission.runtime.id. */
  runtime: AgentExecutionRuntime;
  /** Compatibility projection from admission.model.fallbackIdentityKeys. */
  fallbacks: AgentExecutionModelRef[];
  requested?: {
    model?: string;
  };
  policy: {
    overrideAuthorized: boolean;
    resumeAuthorized: boolean;
  };
};

export type FreshPlannedRunSelection = {
  primaryIdentityKey: ModelIdentityKey;
  fallbackIdentityKeys: ModelIdentityKey[];
  provider: string;
  model: string;
  runtime: AdmissionRuntimeId;
  providerProfileKey: string;
  contextMode: "full" | "lightweight";
  fallbacksOverride: string[];
  transportSnapshot: ModelIdentityTransportSnapshot;
  allowLiveSwitch: false;
  allowSessionOverrides: false;
  allowChannelOverrides: false;
  allowAutoFallbackProbe: false;
  allowDefaultSubstitution: false;
};

export type AgentAttemptRecord = {
  runId: string;
  attemptId: string;
  targetAgentId?: string;
  startedAt: string;
  endedAt?: string;
  modelIdentityKey?: ModelIdentityKey;
  provider: string;
  model: string;
  runtime: AgentExecutionRuntime;
  providerProfileKey?: string;
  transportSnapshot?: ModelIdentityTransportSnapshot;
  harness: string;
  contextMode?: "full" | "lightweight";
  status: "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
  fallback: {
    used: boolean;
    from?: string;
    to?: string;
    reason?: string;
  };
};

export function isFreshExecutionPlan(
  plan: AgentExecutionPlan | undefined,
): plan is AgentExecutionPlan {
  return plan?.launchMode === "fresh";
}

export function formatExecutionModelRef(ref: AgentExecutionModelRef): string {
  return ref.model.startsWith(`${ref.provider}/`) ? ref.model : `${ref.provider}/${ref.model}`;
}

export function resolveFreshPlannedRunSelection(
  plan: AgentExecutionPlan | undefined,
): FreshPlannedRunSelection | undefined {
  if (!plan) {
    return undefined;
  }
  if (!isFreshExecutionPlan(plan)) {
    throw new Error("Fresh planned run selection requires a fresh launch plan.");
  }
  const provider = normalizeOptionalString(plan.model.provider);
  const model = normalizeOptionalString(plan.model.model);
  if (!provider || !model) {
    throw new Error("Fresh launch plan missing model before planned run selection.");
  }
  if (!plan.admission) {
    throw new Error("Fresh launch plan missing admission before planned run selection.");
  }
  const transport = admissionPrimaryTransport(plan.admission);
  if (transport.provider !== provider || transport.model !== model) {
    throw new Error(
      `Fresh launch plan model projection drift: admission=${sanitizeForLog(
        modelIdentityDisplayRef(plan.admission.model.primaryIdentityKey),
      )}, projection=${sanitizeForLog(provider)}/${sanitizeForLog(model)}.`,
    );
  }
  return {
    primaryIdentityKey: plan.admission.model.primaryIdentityKey,
    fallbackIdentityKeys: plan.admission.model.fallbackIdentityKeys,
    provider,
    model,
    runtime: plan.admission.runtime.id,
    providerProfileKey: plan.admission.runtime.providerProfileKey,
    contextMode: plan.contextMode ?? "lightweight",
    fallbacksOverride: admissionFallbackDisplayRefs(plan.admission),
    transportSnapshot: transport,
    allowLiveSwitch: false,
    allowSessionOverrides: false,
    allowChannelOverrides: false,
    allowAutoFallbackProbe: false,
    allowDefaultSubstitution: false,
  };
}

export function executionPlanAllowsModel(params: {
  plan: AgentExecutionPlan | undefined;
  provider: string | undefined;
  model: string | undefined;
}): boolean {
  if (!isFreshExecutionPlan(params.plan)) {
    return true;
  }
  const provider = normalizeOptionalString(params.provider);
  const model = normalizeOptionalString(params.model);
  if (!provider || !model) {
    return false;
  }
  if (
    modelIdentityMatchesRef({
      identityKey: params.plan.admission.model.primaryIdentityKey,
      provider,
      model,
    })
  ) {
    return true;
  }
  return params.plan.admission.model.fallbackIdentityKeys.some((identityKey) =>
    modelIdentityMatchesRef({ identityKey, provider, model }),
  );
}

export function assertFreshExecutionPlanBinding(params: {
  plan: AgentExecutionPlan | undefined;
  runId: string;
  agentId?: string;
  provider?: string;
  model?: string;
  runtime?: string;
  stage: string;
}): void {
  const plan = params.plan;
  if (!isFreshExecutionPlan(plan)) {
    return;
  }
  if (!normalizeOptionalString(plan.runId)) {
    throw new Error(`Fresh launch plan missing runId before ${params.stage}.`);
  }
  if (plan.runId !== params.runId) {
    throw new Error(
      `Fresh launch plan runId mismatch before ${params.stage}: expected ${sanitizeForLog(
        params.runId,
      )}, got ${sanitizeForLog(plan.runId)}.`,
    );
  }
  const targetAgentId = normalizeOptionalString(plan.targetAgentId);
  const agentId = normalizeOptionalString(params.agentId);
  if (!targetAgentId) {
    throw new Error(`Fresh launch plan missing targetAgentId before ${params.stage}.`);
  }
  if (agentId && targetAgentId !== agentId) {
    throw new Error(
      `Fresh launch plan target "${sanitizeForLog(
        targetAgentId,
      )}" does not match run agent "${sanitizeForLog(agentId)}" before ${params.stage}.`,
    );
  }
  if (!normalizeOptionalString(plan.model.provider) || !normalizeOptionalString(plan.model.model)) {
    throw new Error(`Fresh launch plan missing model before ${params.stage}.`);
  }
  if (plan.runtime !== "openclaw" && plan.runtime !== "codex") {
    throw new Error(`Fresh launch plan has invalid runtime before ${params.stage}.`);
  }
  const runtime = normalizeOptionalString(params.runtime);
  if (runtime && runtime !== plan.runtime) {
    throw new Error(
      `Fresh launch plan runtime drift before ${params.stage}: expected ${sanitizeForLog(
        plan.runtime,
      )}, got ${sanitizeForLog(runtime)}.`,
    );
  }
  const provider = normalizeOptionalString(params.provider);
  const model = normalizeOptionalString(params.model);
  if ((provider || model) && !executionPlanAllowsModel({ plan, provider, model })) {
    throw new Error(
      `Fresh launch plan model drift before ${params.stage}: ${sanitizeForLog(
        params.provider ?? "",
      )}/${sanitizeForLog(params.model ?? "")} is not in RunPlan.`,
    );
  }
}

function resolvePlanSource(params: {
  source?: AgentExecutionPlan["source"];
}): AgentExecutionPlan["source"] {
  return params.source ?? { kind: "unknown" };
}

function normalizePlanRuntime(value: string | undefined): AgentExecutionRuntime {
  return value === "codex" ? "codex" : "openclaw";
}

function resolveModelEntryRuntimeMetadata(params: {
  cfg: OpenClawConfig;
  targetAgentId?: string;
  model: AgentExecutionModelRef;
}): ReturnType<typeof resolveModelAgentRuntimeMetadata> {
  return params.targetAgentId
    ? resolveModelAgentRuntimeMetadata({
        cfg: params.cfg,
        agentId: params.targetAgentId,
        provider: params.model.provider,
        model: params.model.model,
      })
    : { id: normalizePlanRuntime(undefined), source: "implicit" as const };
}

function resolvePlanFallbacks(params: {
  cfg: OpenClawConfig;
  targetAgentId?: string;
  defaultProvider: string;
  allowPluginNormalization?: boolean;
}): AgentExecutionModelRef[] {
  const agentConfig = params.targetAgentId
    ? resolveAgentConfig(params.cfg, params.targetAgentId)
    : undefined;
  const rawFallbacks = resolveAgentModelFallbackValues(
    agentConfig?.model ?? params.cfg.agents?.defaults?.model,
  );
  const fallbacks: AgentExecutionModelRef[] = [];
  const seen = new Set<string>();
  for (const raw of rawFallbacks) {
    const parsed = parseModelRef(raw, params.defaultProvider, {
      allowPluginNormalization: params.allowPluginNormalization,
    });
    if (!parsed) {
      continue;
    }
    const key = modelKey(parsed.provider, parsed.model);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    fallbacks.push(parsed);
  }
  return fallbacks;
}

export function resolveExecutionPlan(params: {
  cfg: OpenClawConfig;
  runId?: string;
  targetAgentId?: string;
  source?: AgentExecutionPlan["source"];
  launchMode?: AgentExecutionLaunchMode;
  contextMode?: "full" | "lightweight";
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
  const source = resolvePlanSource({ source: params.source });
  const contextMode =
    params.contextMode ??
    (launchMode === "fresh" && source.kind === "plugin" ? "lightweight" : undefined);
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
  const fallbacks = resolvePlanFallbacks({
    cfg: params.cfg,
    targetAgentId,
    defaultProvider: model.provider,
    allowPluginNormalization: params.allowPluginNormalization,
  });
  const runtimeMeta = resolveModelEntryRuntimeMetadata({
    cfg: params.cfg,
    targetAgentId,
    model,
  });
  const admission = admitAgentExecution({
    cfg: params.cfg,
    targetAgentId,
    primary: model,
    fallbacks,
    runtimeMeta,
    enforceAgentModelAllowlist: launchMode === "fresh" && !overrideModel,
    enforceExplicitRuntime: launchMode === "fresh",
    allowPluginNormalization: params.allowPluginNormalization,
  });
  const primaryTransport = admissionPrimaryTransport(admission);
  const fallbackTransports = admission.model.fallbackIdentityKeys.map(
    modelIdentityTransportSnapshot,
  );
  const runtime = admission.runtime.id;

  return {
    runId: normalizeOptionalString(params.runId) ?? "",
    ...(targetAgentId ? { targetAgentId } : {}),
    launchMode,
    source,
    ...(targetAgentId ? { workspace: resolveAgentWorkspaceDir(params.cfg, targetAgentId) } : {}),
    ...(contextMode ? { contextMode } : {}),
    admission,
    model: {
      provider: primaryTransport.provider,
      model: primaryTransport.model,
    },
    runtime,
    fallbacks: fallbackTransports.map((transport) => ({
      provider: transport.provider,
      model: transport.model,
    })),
    ...(requested.providerOverride && requested.modelOverride
      ? { requested: { model: `${requested.providerOverride}/${requested.modelOverride}` } }
      : {}),
    policy: {
      overrideAuthorized: params.allowRequestOverride === true,
      resumeAuthorized: launchMode === "resume",
    },
  };
}
