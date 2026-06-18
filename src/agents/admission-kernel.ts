/**
 * Native admission decisions for fresh agent launches.
 *
 * Admission is a compact execution decision derived from existing OpenClaw
 * config, model catalog/runtime policy, and target-agent model declarations.
 * It is not a separate config surface.
 */
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveModelAgentRuntimeMetadata } from "./agent-runtime-metadata.js";
import { listAgentEntries } from "./agent-scope-config.js";
import {
  createModelIdentityFromRef,
  modelIdentityDisplayRef,
  modelIdentityKeyFromProviderModel,
  modelIdentityTransportSnapshot,
  type ModelIdentityKey,
  type ModelIdentityTransportSnapshot,
} from "./model-identity.js";
import type { ModelManifestNormalizationContext, ModelRef } from "./model-selection-normalize.js";
import { normalizeProviderId, parseModelRef } from "./model-selection-normalize.js";

export type AdmissionRuntimeId = "openclaw" | "codex";

export type ModelAdmissionDecision = {
  primaryIdentityKey: ModelIdentityKey;
  fallbackIdentityKeys: ModelIdentityKey[];
};

export type RuntimeAdmissionDecision = {
  id: AdmissionRuntimeId;
  providerProfileKey: string;
};

export type RunAdmissionDecision = {
  model: ModelAdmissionDecision;
  runtime: RuntimeAdmissionDecision;
  policyTraceId?: string;
};

type RuntimeMetadata = ReturnType<typeof resolveModelAgentRuntimeMetadata>;

function normalizeAdmissionRuntime(value: string | undefined): AdmissionRuntimeId {
  return value === "codex" ? "codex" : "openclaw";
}

function resolveProviderProfileKey(params: {
  runtime: AdmissionRuntimeId;
  primaryIdentityKey: ModelIdentityKey;
}): string {
  const transport = modelIdentityTransportSnapshot(params.primaryIdentityKey);
  if (params.runtime === "codex") {
    return "codex";
  }
  return `${transport.provider}-native`;
}

function resolveAgentEntryModels(params: {
  cfg: OpenClawConfig;
  targetAgentId?: string;
}): Record<string, unknown> | undefined {
  const targetAgentId = normalizeOptionalString(params.targetAgentId);
  if (!targetAgentId) {
    return undefined;
  }
  const entry = listAgentEntries(params.cfg).find(
    (candidate) => candidate.id?.trim() === targetAgentId,
  );
  const models = entry?.models;
  return models && typeof models === "object" && !Array.isArray(models)
    ? (models as Record<string, unknown>)
    : undefined;
}

function parseProviderWildcard(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed.endsWith("/*")) {
    return undefined;
  }
  return normalizeProviderId(trimmed.slice(0, -2)) || undefined;
}

function configuredModelAllowsIdentity(
  params: {
    raw: string;
    identityKey: ModelIdentityKey;
    defaultProvider: string;
    allowPluginNormalization?: boolean;
  } & ModelManifestNormalizationContext,
): boolean {
  const wildcardProvider = parseProviderWildcard(params.raw);
  if (wildcardProvider) {
    return modelIdentityTransportSnapshot(params.identityKey).provider === wildcardProvider;
  }
  const parsed = parseModelRef(params.raw, params.defaultProvider, {
    allowPluginNormalization: params.allowPluginNormalization,
    manifestPlugins: params.manifestPlugins,
  });
  if (!parsed) {
    return false;
  }
  return createModelIdentityFromRef(parsed).identityKey === params.identityKey;
}

function assertAgentModelAdmission(
  params: {
    cfg: OpenClawConfig;
    targetAgentId?: string;
    primary: ModelRef;
    primaryIdentityKey: ModelIdentityKey;
    allowPluginNormalization?: boolean;
  } & ModelManifestNormalizationContext,
): void {
  const agentModels = resolveAgentEntryModels({
    cfg: params.cfg,
    targetAgentId: params.targetAgentId,
  });
  if (!agentModels || Object.keys(agentModels).length === 0) {
    return;
  }
  const allowed = Object.keys(agentModels).some((raw) =>
    configuredModelAllowsIdentity({
      raw,
      identityKey: params.primaryIdentityKey,
      defaultProvider: params.primary.provider,
      allowPluginNormalization: params.allowPluginNormalization,
      manifestPlugins: params.manifestPlugins,
    }),
  );
  if (allowed) {
    return;
  }
  throw new Error(
    `Model "${modelIdentityDisplayRef(
      params.primaryIdentityKey,
    )}" is not admitted for agent "${params.targetAgentId ?? "unknown"}".`,
  );
}

function assertRuntimeAdmission(params: {
  runtimeMeta: RuntimeMetadata;
  targetAgentId?: string;
  primaryIdentityKey: ModelIdentityKey;
  enforceExplicitRuntime?: boolean;
}): AdmissionRuntimeId {
  const runtime = normalizeAdmissionRuntime(params.runtimeMeta.id);
  if (
    params.enforceExplicitRuntime !== false &&
    runtime === "codex" &&
    params.runtimeMeta.source === "implicit"
  ) {
    throw new Error(
      `Implicit Codex runtime is not admitted for fresh agent launch "${params.targetAgentId ?? "unknown"}" with model "${modelIdentityDisplayRef(
        params.primaryIdentityKey,
      )}". Configure agentRuntime explicitly for Codex-runtime agents.`,
    );
  }
  return runtime;
}

export function admitAgentExecution(
  params: {
    cfg: OpenClawConfig;
    targetAgentId?: string;
    primary: ModelRef;
    fallbacks: ModelRef[];
    runtimeMeta: RuntimeMetadata;
    enforceAgentModelAllowlist?: boolean;
    enforceExplicitRuntime?: boolean;
    allowPluginNormalization?: boolean;
  } & ModelManifestNormalizationContext,
): RunAdmissionDecision {
  const primaryIdentity = createModelIdentityFromRef(params.primary);
  if (params.enforceAgentModelAllowlist !== false) {
    assertAgentModelAdmission({
      cfg: params.cfg,
      targetAgentId: params.targetAgentId,
      primary: params.primary,
      primaryIdentityKey: primaryIdentity.identityKey,
      allowPluginNormalization: params.allowPluginNormalization,
      manifestPlugins: params.manifestPlugins,
    });
  }
  const runtime = assertRuntimeAdmission({
    runtimeMeta: params.runtimeMeta,
    targetAgentId: params.targetAgentId,
    primaryIdentityKey: primaryIdentity.identityKey,
    enforceExplicitRuntime: params.enforceExplicitRuntime,
  });
  const fallbackIdentityKeys: ModelIdentityKey[] = [];
  const seen = new Set<ModelIdentityKey>([primaryIdentity.identityKey]);
  for (const fallback of params.fallbacks) {
    const key = modelIdentityKeyFromProviderModel(fallback.provider, fallback.model, {
      allowPluginNormalization: params.allowPluginNormalization,
      manifestPlugins: params.manifestPlugins,
    });
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    fallbackIdentityKeys.push(key);
  }
  return {
    model: {
      primaryIdentityKey: primaryIdentity.identityKey,
      fallbackIdentityKeys,
    },
    runtime: {
      id: runtime,
      providerProfileKey: resolveProviderProfileKey({
        runtime,
        primaryIdentityKey: primaryIdentity.identityKey,
      }),
    },
    policyTraceId: "agent-model-policy",
  };
}

export function admissionPrimaryTransport(
  admission: RunAdmissionDecision,
): ModelIdentityTransportSnapshot {
  return modelIdentityTransportSnapshot(admission.model.primaryIdentityKey);
}

export function admissionFallbackDisplayRefs(admission: RunAdmissionDecision): string[] {
  return admission.model.fallbackIdentityKeys.map(modelIdentityDisplayRef);
}
