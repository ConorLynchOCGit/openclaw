import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  buildContextBrokerRequest,
  summarizeContextBrokerRequest,
  type ContextBrokerRequest,
} from "./context-broker.ts";
import {
  buildResourceRequirementPacketManifest,
  compileResourceRequirementPacketFromBrokerRequest,
  type ResourceRequirementCompileResult,
} from "./resource-requirement-packet.ts";
import type {
  ResourceObjectiveFocus,
  ResourceObjectiveFocusLegalRefUniverse,
} from "./resource-objective-focus.ts";

export const CONTEXT_REPAIR_REQUIREMENT_ARTIFACT_TYPE =
  "execution_platform.resource_repair_requirement" as const;

export const CONTEXT_REPAIR_REQUIREMENT_SCHEMA_VERSION =
  "execution-platform.context-repair-requirement.v1" as const;

export type ContextRepairRequirementLifecycle = "consumer_blocking" | "diagnostic_only";

export type ContextRepairRequirementPacket = {
  artifactKind: "resource_repair_requirement";
  schemaVersion: typeof CONTEXT_REPAIR_REQUIREMENT_SCHEMA_VERSION;
  repairRequirementId: string;
  repairRequirementRef: string;
  repairRequirementHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  repairNodeId: string;
  failedConsumerNodeId: string;
  consumerBranchId: string;
  workIntentRef: string;
  targetCommitmentIds: string[];
  lifecycle: ContextRepairRequirementLifecycle;
  canUnlockConsumer: boolean;
  contextPurpose: string;
  semanticQuestions: string[];
  missingFields: string[];
  reasonCodes: string[];
  schemaPaths: string[];
  policyPaths: string[];
  acceptedContextRefs: string[];
  candidateResourceRefs: string[];
  candidateMemoryContextPackRefs: string[];
  downstreamCapabilityId: string;
  downstreamExecutionIntent: string;
  downstreamEvidenceMode: string[];
  requiredResourceKinds: string[];
  allowedToolIds: string[];
  maxScopeRefs: string[];
  downstreamTransition: string;
  contextBrokerRequestRef: string;
  resourceRequirementRef: string;
  resourceRequirementHash: string;
  resourceRequirementStatus: ResourceRequirementCompileResult["status"];
  resourceRequirementReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ContextRepairRequirementManifest = {
  repairRequirementRef: string;
  repairRequirementId: string;
  repairRequirementHash: string;
  schemaVersion: typeof CONTEXT_REPAIR_REQUIREMENT_SCHEMA_VERSION;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  repairNodeId: string;
  failedConsumerNodeId: string;
  consumerBranchId: string;
  lifecycle: ContextRepairRequirementLifecycle;
  canUnlockConsumer: boolean;
  workIntentRef: string;
  targetCommitmentIds: string[];
  contextPurpose: string;
  semanticQuestionCount: number;
  semanticQuestionSample: string[];
  missingFields: string[];
  reasonCodes: string[];
  downstreamCapabilityId: string;
  downstreamExecutionIntent: string;
  downstreamEvidenceMode: string[];
  contextBrokerRequestRef: string;
  resourceRequirementRef: string;
  resourceRequirementStatus: ResourceRequirementCompileResult["status"];
  resourceRequirementReasonCodes: string[];
  byteCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ContextRepairRequirementCompileResult = {
  status: "ready" | "blocked" | "diagnostic_only";
  packet: ContextRepairRequirementPacket;
  manifest: ContextRepairRequirementManifest;
  contextBrokerRequest: ContextBrokerRequest;
  resourceRequirement: ResourceRequirementCompileResult;
  nodeMetadata: JsonValue;
  consumerEdgeMetadata: JsonValue;
  reasonCodes: string[];
  canDispatchContextScout: boolean;
  canUnlockConsumer: boolean;
};

export type ContextRepairConsumerWiringResult = {
  status: "consumer_linked" | "diagnostic_only" | "blocked";
  consumerNodeId: string | null;
  canUnlockConsumer: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ContextRepairNodeExecutionGateResult = {
  status: "allowed" | "blocked";
  lifecycle: ContextRepairRequirementLifecycle | "not_resource_repair";
  consumerNodeId: string | null;
  resourceRequirementRefs: string[];
  contextBrokerRequestRef: string | null;
  canUnlockConsumer: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

type EdgeLike = {
  fromNodeId?: string | null;
  toNodeId?: string | null;
  edgeKind?: string | null;
};

type ContextRepairNodeLike = {
  nodeId: string;
  nodeKind?: string | null;
  metadata?: JsonValue | null;
  inputHandoffRefs?: string[];
};

const DEFAULT_CONTEXT_REPAIR_ALLOWED_TOOL_IDS = [
  "resource.requirement.get",
  "resource.scout.request_prompt_excerpt",
  "repo.search",
  "repo.find_files",
  "repo.open_file_window",
  "repo.open_symbol",
  "repo.get_related_tests",
  "resource.scout.add_finding",
  "resource.scout.mark_limitation",
  "resource.scout.submit_handoff",
] as const;

function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(
  values: Array<string | null | undefined>,
  max: number,
  chars = 300,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = bounded(value, chars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function byteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 80, chars = 300): string[] {
  return Array.isArray(value)
    ? uniqueStrings(
        value.filter((entry): entry is string => typeof entry === "string"),
        max,
        chars,
      )
    : [];
}

function repairRequirementRef(input: {
  runtimeJobId: string;
  graphId: string;
  repairNodeId: string;
  failedConsumerNodeId: string;
  repairRequirementId: string;
}): string {
  return `runtime-job://${bounded(input.runtimeJobId, 180)}/runtime-work-graph/${bounded(
    input.graphId,
    140,
  )}/context-repair-requirement/${bounded(input.repairNodeId, 140)}/${bounded(
    input.failedConsumerNodeId,
    140,
  )}/${input.repairRequirementId}`;
}

export function buildContextRepairRequirementManifest(
  packet: ContextRepairRequirementPacket,
): ContextRepairRequirementManifest {
  return {
    repairRequirementRef: packet.repairRequirementRef,
    repairRequirementId: packet.repairRequirementId,
    repairRequirementHash: packet.repairRequirementHash,
    schemaVersion: packet.schemaVersion,
    runtimeJobId: packet.runtimeJobId,
    workflowId: packet.workflowId,
    graphId: packet.graphId,
    repairNodeId: packet.repairNodeId,
    failedConsumerNodeId: packet.failedConsumerNodeId,
    consumerBranchId: packet.consumerBranchId,
    lifecycle: packet.lifecycle,
    canUnlockConsumer: packet.canUnlockConsumer,
    workIntentRef: packet.workIntentRef,
    targetCommitmentIds: packet.targetCommitmentIds.slice(0, 24),
    contextPurpose: packet.contextPurpose,
    semanticQuestionCount: packet.semanticQuestions.length,
    semanticQuestionSample: packet.semanticQuestions.slice(0, 4),
    missingFields: packet.missingFields.slice(0, 24),
    reasonCodes: packet.reasonCodes.slice(0, 40),
    downstreamCapabilityId: packet.downstreamCapabilityId,
    downstreamExecutionIntent: packet.downstreamExecutionIntent,
    downstreamEvidenceMode: packet.downstreamEvidenceMode.slice(0, 12),
    contextBrokerRequestRef: packet.contextBrokerRequestRef,
    resourceRequirementRef: packet.resourceRequirementRef,
    resourceRequirementStatus: packet.resourceRequirementStatus,
    resourceRequirementReasonCodes: packet.resourceRequirementReasonCodes.slice(0, 24),
    byteCount: byteCount(packet),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function contextRepairRequirementMetadata(
  packet: ContextRepairRequirementPacket,
): JsonValue {
  return {
    ...buildContextRepairRequirementManifest(packet),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function compileContextRepairRequirement(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  repairNodeId: string;
  failedConsumerNodeId: string;
  consumerBranchId?: string | null;
  workIntentRef: string | null;
  targetCommitmentIds?: string[];
  downstreamCapabilityId: string | null;
  downstreamExecutionIntent: string | null;
  downstreamEvidenceMode?: string[];
  contextPurpose: string | null;
  semanticQuestions: string[];
  missingFields?: string[];
  reasonCodes?: string[];
  schemaPaths?: string[];
  policyPaths?: string[];
  acceptedContextRefs?: string[];
  candidateResourceRefs?: string[];
  inheritedContextRefs?: string[];
  knownContextRefs?: string[];
  candidateMemoryContextPackRefs?: string[];
  resourceObjectiveFocus?: ResourceObjectiveFocus | null;
  legalRefUniverse?: ResourceObjectiveFocusLegalRefUniverse | null;
  requiredResourceKinds?: string[];
  allowedToolIds?: string[];
  maxScopeRefs?: string[];
  downstreamTransition?: string | null;
  diagnosticOnly?: boolean;
  createdAt?: string | null;
}): ContextRepairRequirementCompileResult {
  const lifecycle: ContextRepairRequirementLifecycle =
    input.diagnosticOnly === true ? "diagnostic_only" : "consumer_blocking";
  const semanticQuestions = uniqueStrings(input.semanticQuestions, 24, 500);
  const contextPurpose = bounded(input.contextPurpose, 180);
  const missingFields = uniqueStrings(input.missingFields ?? [], 40, 180);
  const repairReasonCodes = uniqueStrings(input.reasonCodes ?? [], 80, 180);
  const compileBlockers = uniqueStrings(
    [
      ...(input.failedConsumerNodeId ? [] : ["resource_repair_consumer_node_id_missing"]),
      ...(input.repairNodeId ? [] : ["resource_repair_node_id_missing"]),
      ...(input.workIntentRef ? [] : ["resource_repair_work_intent_ref_missing"]),
      ...(input.downstreamCapabilityId ? [] : ["resource_repair_downstream_capability_id_missing"]),
      ...(input.downstreamExecutionIntent
        ? []
        : ["resource_repair_downstream_execution_intent_missing"]),
      ...((input.downstreamEvidenceMode ?? []).length > 0
        ? []
        : ["resource_repair_downstream_evidence_mode_missing"]),
      ...(contextPurpose ? [] : ["resource_repair_resource_purpose_missing"]),
      ...(semanticQuestions.length > 0 ? [] : ["resource_repair_semantic_questions_missing"]),
    ],
    80,
    180,
  );
  const contextBrokerRequest = buildContextBrokerRequest({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    requestingNodeId: input.repairNodeId,
    consumerNodeId: input.failedConsumerNodeId,
    targetCommitmentIds: input.targetCommitmentIds ?? [],
    requiredResourceKind: "resource_repair",
    neededByPhase: "resource_repair",
    semanticQuestion:
      semanticQuestions.length > 0
        ? semanticQuestions.join(" ")
        : "Context repair semantic question missing; block before dispatch.",
    candidateResourceRefs: input.candidateResourceRefs ?? [],
    inheritedContextRefs: input.inheritedContextRefs ?? [],
    knownContextRefs: input.knownContextRefs ?? [],
    outputContextRefs: lifecycle === "diagnostic_only" ? [] : input.acceptedContextRefs ?? [],
    missingContextReasonCodes: [
      ...(lifecycle === "diagnostic_only"
        ? ["resource_repair_diagnostic_resource_scout_requested"]
        : []),
      ...repairReasonCodes,
      ...compileBlockers,
    ],
    blockingLimitations:
      lifecycle === "diagnostic_only"
        ? []
        : ["Context repair must satisfy the declared consumer before it can retry."],
    nonblockingLimitations:
      lifecycle === "diagnostic_only"
        ? ["Diagnostic-only context repair cannot unlock a consumer."]
        : [],
    blockingIfMissing: lifecycle !== "diagnostic_only",
    inheritedContextUsable: false,
    budgetClass: "cheap",
    createdAt: input.createdAt ?? null,
  });
  const resourceRequirement = compileResourceRequirementPacketFromBrokerRequest({
    request: contextBrokerRequest,
    workIntentRef: input.workIntentRef,
    consumerBranchId: input.consumerBranchId ?? input.failedConsumerNodeId,
    downstreamCapabilityId: input.downstreamCapabilityId,
    downstreamExecutionIntent: input.downstreamExecutionIntent,
    downstreamEvidenceMode: input.downstreamEvidenceMode ?? [],
    contextPurpose,
    semanticQuestions,
    requiredResourceKinds: input.requiredResourceKinds ?? [
      "resource_handoff",
      "repo_context",
      "validation_refs",
    ],
    knownTargetRefs: input.candidateResourceRefs ?? [],
    knownValidationNeedRefs: [],
    candidateMemoryContextPackRefs: input.candidateMemoryContextPackRefs ?? [],
    resourceObjectiveFocus: input.resourceObjectiveFocus ?? null,
    legalRefUniverse: input.legalRefUniverse ?? null,
    nextLegalTransitions: [input.downstreamTransition ?? "retry_declared_consumer", "needs_review"],
    blockerReasonCodes: [...repairReasonCodes, ...compileBlockers],
  });
  const repairRequirementId = hashValue({
    contextBrokerRequestRef: contextBrokerRequest.requestRef,
    resourceRequirementRef: resourceRequirement.packet.resourceRequirementRef,
    repairNodeId: input.repairNodeId,
    failedConsumerNodeId: input.failedConsumerNodeId,
    lifecycle,
  }).slice(0, 24);
  const ref = repairRequirementRef({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    repairNodeId: input.repairNodeId,
    failedConsumerNodeId: input.failedConsumerNodeId,
    repairRequirementId,
  });
  const canUnlockConsumer =
    lifecycle === "consumer_blocking" &&
    resourceRequirement.status === "ready" &&
    compileBlockers.length === 0;
  const baseWithoutHash = {
    artifactKind: "resource_repair_requirement" as const,
    schemaVersion: CONTEXT_REPAIR_REQUIREMENT_SCHEMA_VERSION,
    repairRequirementId,
    repairRequirementRef: ref,
    repairRequirementHash: "",
    runtimeJobId: bounded(input.runtimeJobId, 180),
    workflowId: bounded(input.workflowId, 180),
    graphId: bounded(input.graphId, 180),
    repairNodeId: bounded(input.repairNodeId, 180),
    failedConsumerNodeId: bounded(input.failedConsumerNodeId, 180),
    consumerBranchId: bounded(input.consumerBranchId ?? input.failedConsumerNodeId, 180),
    workIntentRef: bounded(input.workIntentRef, 420),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds ?? [], 40, 180),
    lifecycle,
    canUnlockConsumer,
    contextPurpose,
    semanticQuestions,
    missingFields,
    reasonCodes: uniqueStrings(
      [
        "resource_repair_requirement_compiled",
        `resource_repair_requirement_lifecycle:${lifecycle}`,
        ...repairReasonCodes,
        ...compileBlockers,
        ...resourceRequirement.reasonCodes,
      ],
      120,
      180,
    ),
    schemaPaths: uniqueStrings(input.schemaPaths ?? [], 40, 240),
    policyPaths: uniqueStrings(input.policyPaths ?? [], 40, 240),
    acceptedContextRefs: uniqueStrings(input.acceptedContextRefs ?? [], 80, 320),
    candidateResourceRefs: uniqueStrings(input.candidateResourceRefs ?? [], 100, 320),
    candidateMemoryContextPackRefs: uniqueStrings(
      input.candidateMemoryContextPackRefs ?? [],
      40,
      320,
    ),
    downstreamCapabilityId: bounded(input.downstreamCapabilityId, 180),
    downstreamExecutionIntent: bounded(input.downstreamExecutionIntent, 120),
    downstreamEvidenceMode: uniqueStrings(input.downstreamEvidenceMode ?? [], 12, 120),
    requiredResourceKinds: uniqueStrings(
      input.requiredResourceKinds ?? ["resource_handoff", "repo_context", "validation_refs"],
      24,
      160,
    ),
    allowedToolIds: uniqueStrings(
      input.allowedToolIds ?? [...DEFAULT_CONTEXT_REPAIR_ALLOWED_TOOL_IDS],
      24,
      180,
    ),
    maxScopeRefs: uniqueStrings(input.maxScopeRefs ?? input.candidateResourceRefs ?? [], 80, 320),
    downstreamTransition: bounded(input.downstreamTransition ?? "retry_declared_consumer", 180),
    contextBrokerRequestRef: contextBrokerRequest.requestRef,
    resourceRequirementRef: resourceRequirement.packet.resourceRequirementRef,
    resourceRequirementHash: resourceRequirement.packet.resourceRequirementHash,
    resourceRequirementStatus: resourceRequirement.status,
    resourceRequirementReasonCodes: resourceRequirement.reasonCodes.slice(0, 80),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } satisfies Omit<ContextRepairRequirementPacket, "repairRequirementHash"> & {
    repairRequirementHash: string;
  };
  const packet: ContextRepairRequirementPacket = {
    ...baseWithoutHash,
    repairRequirementHash: hashValue({ ...baseWithoutHash, repairRequirementHash: null }),
  };
  const status: ContextRepairRequirementCompileResult["status"] =
    compileBlockers.length > 0 || resourceRequirement.status !== "ready"
      ? "blocked"
      : lifecycle === "diagnostic_only"
        ? "diagnostic_only"
        : canUnlockConsumer
          ? "ready"
          : "blocked";
  const manifest = buildContextRepairRequirementManifest(packet);
  const resourceRequirementManifest = buildResourceRequirementPacketManifest(
    resourceRequirement.packet,
  );
  const brokerSummary = summarizeContextBrokerRequest(contextBrokerRequest);
  const nodeMetadata = {
    runtimeOwnedContextRepairNode: true,
    contextRepairRequirementRef: packet.repairRequirementRef,
    contextRepairRequirementHash: packet.repairRequirementHash,
    contextRepairRequirementStatus: status,
    contextRepairRequirementManifest: manifest as unknown as JsonValue,
    resourceRequirementRefs: [resourceRequirement.packet.resourceRequirementRef],
    resourceRequirementStatuses: [resourceRequirement.status],
    resourceRequirementManifests: [resourceRequirementManifest as unknown as JsonValue],
    contextBrokerRequestRef: contextBrokerRequest.requestRef,
    contextBrokerRequestStatus: contextBrokerRequest.status,
    contextBrokerConsumerNodeId: contextBrokerRequest.consumerNodeId,
    contextBrokerSemanticQuestion: contextBrokerRequest.semanticQuestion,
    contextBrokerCandidateResourceRefs: contextBrokerRequest.candidateResourceRefs,
    contextBrokerReasonCodes: contextBrokerRequest.reasonCodes,
    contextBrokerDedupeKey: contextBrokerRequest.dedupeKey,
    contextBrokerNextTransition: contextBrokerRequest.nextTransition,
    contextBrokerRequestSummary: brokerSummary as unknown as JsonValue,
    contextRepairConsumerNodeId: packet.failedConsumerNodeId,
    contextRepairConsumerBranchId: packet.consumerBranchId,
    contextRepairLifecycle: lifecycle,
    contextRepairCanUnlockConsumer: packet.canUnlockConsumer,
    diagnosticOnly: lifecycle === "diagnostic_only",
    contextNodeLifecycle: lifecycle,
    downstreamTransition: packet.downstreamTransition,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
  const consumerEdgeMetadata = {
    runtimeOwnedContextRepairEdge: true,
    contextRepairConsumerEdge: true,
    contextRepairRequirementRef: packet.repairRequirementRef,
    resourceRequirementRef: resourceRequirement.packet.resourceRequirementRef,
    contextBrokerRequestRef: contextBrokerRequest.requestRef,
    contextRepairConsumerNodeId: packet.failedConsumerNodeId,
    contextRepairConsumerBranchId: packet.consumerBranchId,
    contextRepairCanUnlockConsumer: packet.canUnlockConsumer,
    contextRepairLifecycle: lifecycle,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
  return {
    status,
    packet,
    manifest,
    contextBrokerRequest,
    resourceRequirement,
    nodeMetadata,
    consumerEdgeMetadata,
    reasonCodes: packet.reasonCodes,
    canDispatchContextScout: status === "ready" || status === "diagnostic_only",
    canUnlockConsumer,
  };
}

export function evaluateContextRepairConsumerWiring(input: {
  repairNodeId: string;
  consumerNodeId?: string | null;
  diagnosticOnly?: boolean;
  edges: EdgeLike[];
}): ContextRepairConsumerWiringResult {
  const consumerNodeId = bounded(input.consumerNodeId, 180) || null;
  const linked =
    Boolean(consumerNodeId) &&
    input.edges.some(
      (edge) =>
        edge.fromNodeId === input.repairNodeId &&
        edge.toNodeId === consumerNodeId &&
        edge.edgeKind === "handoff",
    );
  if (input.diagnosticOnly === true) {
    return {
      status: "diagnostic_only",
      consumerNodeId,
      canUnlockConsumer: false,
      reasonCodes: [
        "resource_repair_consumer_wiring_diagnostic_only",
        ...(linked ? ["resource_repair_diagnostic_edge_present_but_not_unlocking"] : []),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  if (linked) {
    return {
      status: "consumer_linked",
      consumerNodeId,
      canUnlockConsumer: true,
      reasonCodes: ["resource_repair_consumer_edge_declared"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  return {
    status: "blocked",
    consumerNodeId,
    canUnlockConsumer: false,
    reasonCodes: [
      "resource_repair_consumer_edge_missing",
      ...(consumerNodeId ? [] : ["resource_repair_consumer_node_id_missing"]),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function evaluateContextRepairNodeExecutionGate(input: {
  node: ContextRepairNodeLike;
  edges: EdgeLike[];
}): ContextRepairNodeExecutionGateResult {
  const metadata = asRecord(input.node.metadata);
  const runtimeOwnedContextRepairNode = metadata.runtimeOwnedContextRepairNode === true;
  const repairRequirementRef =
    typeof metadata.contextRepairRequirementRef === "string"
      ? bounded(metadata.contextRepairRequirementRef, 420)
      : null;
  if (!runtimeOwnedContextRepairNode && !repairRequirementRef) {
    return {
      status: "allowed",
      lifecycle: "not_resource_repair",
      consumerNodeId: null,
      resourceRequirementRefs: [],
      contextBrokerRequestRef: null,
      canUnlockConsumer: false,
      reasonCodes: ["resource_repair_execution_gate_not_applicable"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const diagnosticOnly =
    metadata.diagnosticOnly === true ||
    metadata.contextRepairLifecycle === "diagnostic_only" ||
    metadata.contextNodeLifecycle === "diagnostic_only";
  const consumerNodeId =
    typeof metadata.contextRepairConsumerNodeId === "string"
      ? bounded(metadata.contextRepairConsumerNodeId, 180)
      : typeof metadata.contextBrokerConsumerNodeId === "string"
        ? bounded(metadata.contextBrokerConsumerNodeId, 180)
        : null;
  const resourceRequirementRefs = uniqueStrings(
    [
      typeof metadata.resourceRequirementRef === "string"
        ? metadata.resourceRequirementRef
        : null,
      ...stringArray(metadata.resourceRequirementRefs, 20, 420),
    ],
    20,
    420,
  );
  const contextBrokerRequestRef =
    typeof metadata.contextBrokerRequestRef === "string"
      ? bounded(metadata.contextBrokerRequestRef, 420)
      : null;
  const wiring = evaluateContextRepairConsumerWiring({
    repairNodeId: input.node.nodeId,
    consumerNodeId,
    diagnosticOnly,
    edges: input.edges,
  });
  const missingReasonCodes = [
    ...(resourceRequirementRefs.length > 0
      ? []
      : ["resource_repair_requirement_packet_ref_missing"]),
    ...(contextBrokerRequestRef ? [] : ["resource_repair_resource_broker_request_ref_missing"]),
    ...(wiring.status !== "blocked" ? [] : wiring.reasonCodes),
  ];
  return {
    status: missingReasonCodes.length === 0 ? "allowed" : "blocked",
    lifecycle: diagnosticOnly ? "diagnostic_only" : "consumer_blocking",
    consumerNodeId,
    resourceRequirementRefs,
    contextBrokerRequestRef,
    canUnlockConsumer:
      diagnosticOnly === true ? false : missingReasonCodes.length === 0 && wiring.canUnlockConsumer,
    reasonCodes: uniqueStrings(
      [
        "resource_repair_execution_gate_evaluated",
        ...(diagnosticOnly ? ["resource_repair_diagnostic_only_cannot_unlock_consumer"] : []),
        ...missingReasonCodes,
      ],
      80,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
