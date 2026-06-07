import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  capabilitySelectableInPhase,
  findRuntimeNodeCapability,
  providerCapabilityProfileForCapability,
  runtimeNodeCapabilityManifestForModel,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
  type RuntimeNodeCapabilityPhase,
} from "./runtime-node-capability-registry.ts";

export const CAPABILITY_DOMAIN_LIFECYCLE_SCHEMA_VERSION =
  "execution-platform.capability-domain-lifecycle.v1";

export const CAPABILITY_DOMAIN_LIFECYCLE_MANIFEST_MAX_BYTES = 16 * 1024;

export type CapabilityManifestRuntimeToolId =
  | "capability.lookup"
  | "capability.validate_intent"
  | "capability.require_resources"
  | "capability.require_validation"
  | "capability.require_evidence"
  | "capability.list_legal_transitions";

export type CapabilityManifestRuntimeToolOutput = {
  status: "succeeded" | "needs_review";
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
};

type JsonObject = Record<string, JsonValue>;

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function mergedInput(input: { volatileInput?: unknown; metadata?: JsonValue }): JsonObject {
  return {
    ...asObject(input.volatileInput),
    ...asObject(input.metadata),
  };
}

function boundedCapability(capability: RuntimeNodeCapability): JsonObject {
  const profile = providerCapabilityProfileForCapability(capability);
  return {
    capabilityId: capability.capabilityId,
    providerCapabilityProfileId: profile.profileId,
    displayName: capability.displayName,
    workflowId: capability.workflowId,
    supportedWorkflowIds: capability.supportedWorkflowIds,
    supportedPhases: capability.supportedPhases,
    supportedExecutionIntents: capability.supportedExecutionIntents,
    defaultExecutionIntent: capability.defaultExecutionIntent,
    domainProfileId: capability.domainProfileId,
    resourceSelectionProfileRef: capability.resourceSelectionProfileRef,
    domainActionGateProfileRef: capability.domainActionGateProfileRef,
    domainActionGateKinds: capability.domainActionGateKinds,
    domainWorkerActionToolIds: capability.domainWorkerActionToolIds,
    domainEvidenceKinds: capability.domainEvidenceKinds,
    lifecycleTransitionProfileRef: capability.lifecycleTransitionProfileRef,
    allowedLifecycleTransitions: capability.allowedLifecycleTransitions,
    requiredLifecycleTools: capability.requiredLifecycleTools,
    domainResourceKinds: capability.domainResourceKinds,
    requiresResources: capability.requiresResources,
    requiredSourceMaterialKinds: capability.requiredSourceMaterialKinds,
    requiredResourcePacketKind: capability.requiredResourcePacketKind,
    requiredSnapshotKinds: capability.requiredSnapshotKinds,
    requiredValidationKinds: capability.requiredValidationKinds,
    requiredAuthorityScopes: capability.requiredAuthorityScopes,
    requiredEvidenceClaimKinds: capability.requiredEvidenceClaimKinds,
    evidenceProducedKinds: capability.evidenceProducedKinds,
    canRunAsWorkIntent: capability.canRunAsWorkIntent,
    canRunAsExecutable: capability.canRunAsExecutable,
    defaultRepairTransition: capability.defaultRepairTransition,
    defaultBlockedTransition: capability.defaultBlockedTransition,
    costClass: capability.costClass,
    latencyClass: capability.latencyClass,
    preferredTaskSize: capability.preferredTaskSize,
    maxRecommendedContextRefs: capability.maxRecommendedContextRefs,
    productionSelectable: profile.productionSelectable,
    productionSelectionRequiresQualification: capability.productionSelectionRequiresQualification,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function capabilityMenu(input: {
  manifest: RuntimeNodeCapabilityManifest;
  workflowId?: string | null;
  phase?: RuntimeNodeCapabilityPhase | null;
}): JsonObject {
  const menu = runtimeNodeCapabilityManifestForModel({
    workflowId: input.workflowId,
    phase: input.phase,
  });
  const menuBytes = JSON.stringify(menu).length;
  return {
    artifactKind: "capability_domain_lifecycle_menu",
    schemaVersion: CAPABILITY_DOMAIN_LIFECYCLE_SCHEMA_VERSION,
    menu,
    menuByteCount: menuBytes,
    maxMenuBytes: CAPABILITY_DOMAIN_LIFECYCLE_MANIFEST_MAX_BYTES,
    menuWithinProfile: menuBytes <= CAPABILITY_DOMAIN_LIFECYCLE_MANIFEST_MAX_BYTES,
    capabilityCount: input.manifest.capabilities.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function output(input: {
  status?: "succeeded" | "needs_review";
  toolId: CapabilityManifestRuntimeToolId;
  summary: string;
  reasonCodes: string[];
  body: JsonObject;
}): CapabilityManifestRuntimeToolOutput {
  const body = {
    artifactKind: "capability_domain_lifecycle_tool_output",
    schemaVersion: CAPABILITY_DOMAIN_LIFECYCLE_SCHEMA_VERSION,
    toolId: input.toolId,
    ...input.body,
    semanticRoutingPerformed: false,
    runtimeSemanticJudgmentAllowed: false,
    authorityGranted: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonObject;
  const hash = hashValue(body);
  return {
    status: input.status ?? "succeeded",
    outputRef: `runtime-tool://capability-domain-lifecycle/${input.toolId}/${hash.slice(0, 16)}`,
    outputHash: `sha256:${hash}`,
    outputSummary: input.summary,
    reasonCodes: input.reasonCodes,
    metadata: body,
  };
}

function selectCapability(input: {
  manifest: RuntimeNodeCapabilityManifest;
  payload: JsonObject;
}): RuntimeNodeCapability | null {
  const capabilityId = stringValue(input.payload.capabilityId);
  return capabilityId ? findRuntimeNodeCapability(capabilityId, input.manifest) : null;
}

function invalidCapabilityOutput(input: {
  toolId: CapabilityManifestRuntimeToolId;
  payload: JsonObject;
  manifest: RuntimeNodeCapabilityManifest;
}): CapabilityManifestRuntimeToolOutput {
  return output({
    status: "needs_review",
    toolId: input.toolId,
    summary: "Capability lifecycle tool could not resolve the requested capability id.",
    reasonCodes: ["capability_lifecycle_capability_id_missing_or_invalid"],
    body: {
      requestedCapabilityId: stringValue(input.payload.capabilityId),
      validCapabilityIds: input.manifest.capabilities.map((capability) => capability.capabilityId),
    },
  });
}

export function compileCapabilityManifestRuntimeToolOutput(input: {
  toolId: CapabilityManifestRuntimeToolId | string;
  volatileInput?: unknown;
  metadata?: JsonValue;
  manifest?: RuntimeNodeCapabilityManifest;
}): CapabilityManifestRuntimeToolOutput {
  if (!isCapabilityManifestRuntimeToolId(input.toolId)) {
    return output({
      status: "needs_review",
      toolId: "capability.lookup",
      summary: "Unsupported capability lifecycle tool id.",
      reasonCodes: ["capability_lifecycle_tool_id_invalid"],
      body: { requestedToolId: input.toolId },
    });
  }

  const manifest = input.manifest ?? buildRuntimeNodeCapabilityManifest();
  const payload = mergedInput(input);
  const workflowId = stringValue(payload.workflowId);
  const phase = stringValue(payload.phase) as RuntimeNodeCapabilityPhase | null;
  const capability = selectCapability({ manifest, payload });

  if (input.toolId === "capability.lookup" && !capability) {
    return output({
      toolId: input.toolId,
      summary: "Returned a bounded capability lifecycle menu.",
      reasonCodes: ["capability_lookup_menu_returned"],
      body: capabilityMenu({ manifest, workflowId, phase }),
    });
  }

  if (!capability) {
    return invalidCapabilityOutput({ toolId: input.toolId, payload, manifest });
  }

  if (input.toolId === "capability.lookup") {
    return output({
      toolId: input.toolId,
      summary: `Returned bounded lifecycle details for ${capability.capabilityId}.`,
      reasonCodes: ["capability_lookup_succeeded"],
      body: {
        capability: boundedCapability(capability),
      },
    });
  }

  if (input.toolId === "capability.validate_intent") {
    const requestedWorkflowId = workflowId;
    const requestedPhase = phase;
    const requestedIntent = stringValue(payload.executionIntent);
    const requiredLifecycleTools = stringArray(payload.requiredLifecycleTools);
    const requiredSourceMaterialKinds = stringArray(payload.requiredSourceMaterialKinds);
    const requiredEvidenceKinds = stringArray(payload.requiredEvidenceKinds);
    const reasonCodes: string[] = [];
    if (requestedWorkflowId && !capability.supportedWorkflowIds.includes(requestedWorkflowId)) {
      reasonCodes.push("capability_validate_intent_workflow_unsupported");
    }
    if (requestedPhase && !capabilitySelectableInPhase(capability, requestedPhase)) {
      reasonCodes.push("capability_validate_intent_phase_unsupported");
    }
    if (
      requestedIntent &&
      !capability.supportedExecutionIntents.includes(requestedIntent as never)
    ) {
      reasonCodes.push("capability_validate_intent_execution_intent_unsupported");
    }
    for (const toolId of requiredLifecycleTools) {
      if (!capability.requiredLifecycleTools.includes(toolId)) {
        reasonCodes.push(`capability_validate_intent_required_lifecycle_tool_missing:${toolId}`);
      }
    }
    for (const kind of requiredSourceMaterialKinds) {
      if (
        !capability.requiredSourceMaterialKinds.includes(kind) &&
        !capability.domainResourceKinds.includes(kind as never)
      ) {
        reasonCodes.push(`capability_validate_intent_required_resource_kind_missing:${kind}`);
      }
    }
    for (const kind of requiredEvidenceKinds) {
      if (
        !capability.requiredEvidenceClaimKinds.includes(kind) &&
        !capability.evidenceProducedKinds.includes(kind as never)
      ) {
        reasonCodes.push(`capability_validate_intent_required_evidence_kind_missing:${kind}`);
      }
    }

    return output({
      status: reasonCodes.length === 0 ? "succeeded" : "needs_review",
      toolId: input.toolId,
      summary:
        reasonCodes.length === 0
          ? `Capability ${capability.capabilityId} structurally supports the requested intent.`
          : `Capability ${capability.capabilityId} does not structurally satisfy the requested intent.`,
      reasonCodes:
        reasonCodes.length === 0
          ? ["capability_validate_intent_supported"]
          : ["capability_validate_intent_blocked", ...reasonCodes],
      body: {
        capabilityId: capability.capabilityId,
        requestedWorkflowId,
        requestedPhase,
        requestedIntent,
        requestedRequiredLifecycleTools: requiredLifecycleTools,
        requestedRequiredResourceKinds: requiredSourceMaterialKinds,
        requestedRequiredEvidenceKinds: requiredEvidenceKinds,
        supportedWorkflowIds: capability.supportedWorkflowIds,
        supportedPhases: capability.supportedPhases,
        supportedExecutionIntents: capability.supportedExecutionIntents,
      },
    });
  }

  if (input.toolId === "capability.require_resources") {
    return output({
      toolId: input.toolId,
      summary: `Returned resource requirements for ${capability.capabilityId}.`,
      reasonCodes: ["capability_require_resources_succeeded"],
      body: {
        capabilityId: capability.capabilityId,
        domainProfileId: capability.domainProfileId,
        resourceSelectionProfileRef: capability.resourceSelectionProfileRef,
        requiresResources: capability.requiresResources,
        domainResourceKinds: capability.domainResourceKinds,
        requiredSourceMaterialKinds: capability.requiredSourceMaterialKinds,
        requiredResourcePacketKind: capability.requiredResourcePacketKind,
        requiredSnapshotKinds: capability.requiredSnapshotKinds,
      },
    });
  }

  if (input.toolId === "capability.require_validation") {
    return output({
      toolId: input.toolId,
      summary: `Returned validation/action-gate requirements for ${capability.capabilityId}.`,
      reasonCodes: ["capability_require_validation_succeeded"],
      body: {
        capabilityId: capability.capabilityId,
        domainActionGateProfileRef: capability.domainActionGateProfileRef,
        domainActionGateKinds: capability.domainActionGateKinds,
        requiredValidationKinds: capability.requiredValidationKinds,
        defaultRepairTransition: capability.defaultRepairTransition,
        defaultBlockedTransition: capability.defaultBlockedTransition,
      },
    });
  }

  if (input.toolId === "capability.require_evidence") {
    return output({
      toolId: input.toolId,
      summary: `Returned evidence requirements for ${capability.capabilityId}.`,
      reasonCodes: ["capability_require_evidence_succeeded"],
      body: {
        capabilityId: capability.capabilityId,
        domainEvidenceKinds: capability.domainEvidenceKinds,
        requiredEvidenceClaimKinds: capability.requiredEvidenceClaimKinds,
        evidenceProducedKinds: capability.evidenceProducedKinds,
      },
    });
  }

  return output({
    toolId: input.toolId,
    summary: `Returned lifecycle transitions for ${capability.capabilityId}.`,
    reasonCodes: ["capability_list_legal_transitions_succeeded"],
    body: {
      capabilityId: capability.capabilityId,
      lifecycleTransitionProfileRef: capability.lifecycleTransitionProfileRef,
      allowedLifecycleTransitions: capability.allowedLifecycleTransitions,
      requiredLifecycleTools: capability.requiredLifecycleTools,
      domainWorkerActionToolIds: capability.domainWorkerActionToolIds,
      validLifecyclePhases: capability.validLifecyclePhases,
      canRunAsWorkIntent: capability.canRunAsWorkIntent,
      canRunAsExecutable: capability.canRunAsExecutable,
    },
  });
}

export function isCapabilityManifestRuntimeToolId(
  toolId: string,
): toolId is CapabilityManifestRuntimeToolId {
  return (
    toolId === "capability.lookup" ||
    toolId === "capability.validate_intent" ||
    toolId === "capability.require_resources" ||
    toolId === "capability.require_validation" ||
    toolId === "capability.require_evidence" ||
    toolId === "capability.list_legal_transitions"
  );
}
