import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  EvidenceModeSchema,
  ExecutionIntentSchema,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";
import type { RuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import { findRuntimeNodeCapability } from "./runtime-node-capability-registry.ts";
import type { TeamGraphEdge, TeamGraphNode } from "./runtime-work-graph.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";

export const WORK_INTENT_CONTEXT_RESOLUTION_ARTIFACT_TYPE =
  "execution_platform.work_intent_context_resolution" as const;

export const WORK_INTENT_CONTEXT_RESOLUTION_SCHEMA_VERSION =
  "execution-platform.work-intent-context-resolution.v1" as const;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 320) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const WorkIntentContextResolutionStatusSchema = z.enum([
  "resource_not_required",
  "resource_demand_open",
  "resource_demand_blocked",
  "resource_narrowing_required",
  "resource_ledger_ready",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "worker_action_ready",
  "pending_resource",
  "partially_satisfied",
  "satisfied",
  "read_only_satisfied",
  "blocked",
]);

export type WorkIntentContextResolutionStatus = z.infer<
  typeof WorkIntentContextResolutionStatusSchema
>;

export const WorkIntentContextResolutionSchema = z
  .object({
    artifactKind: z.literal("work_intent_context_resolution"),
    schemaVersion: z.literal(WORK_INTENT_CONTEXT_RESOLUTION_SCHEMA_VERSION),
    resolutionId: boundedString(180),
    resolutionRef: boundedString(360),
    resolutionHash: boundedString(140),
    runtimeJobId: boundedString(180),
    workflowId: boundedString(180),
    graphId: boundedString(180),
    workIntentId: boundedString(220),
    workIntentNodeId: boundedString(220),
    workIntentRef: boundedString(420),
    executionIntent: ExecutionIntentSchema,
    capabilityId: boundedString(180),
    evidenceMode: z.array(EvidenceModeSchema).max(12),
    resourceObjectiveFocusRefs: stringList(40, 360),
    nodeResourceDemandSessionRefs: stringList(40, 360),
    nodeResourceDemandRequestRefs: stringList(80, 360),
    nodeResourceDemandFulfillmentRefs: stringList(80, 360),
    nodeResourceDemandBlockerRefs: stringList(80, 360),
    nodeResourceLedgerRefs: stringList(40, 360),
    nodeResourceLedgerEntryRefs: stringList(160, 360),
    nodeResourceLedgerEntryPayloadRefs: stringList(160, 360),
    providerDiagnosticRefs: stringList(80, 360),
    domainResourceSelectionRefs: stringList(80, 360),
    domainResourceSelectionPacketRefs: stringList(80, 360),
    domainResourceSelectionDecisionRefs: stringList(80, 360),
    requiredResourceRequirementRefs: stringList(80, 360),
    resourceScoutExecutionPacketRefs: stringList(80, 360),
    resourceMergePacketRefs: stringList(80, 360),
    resourceSatisfactionStateRefs: stringList(80, 360),
    requiredShardHandoffRefs: stringList(120, 360),
    acceptedResourceHandoffRefs: stringList(80, 360),
    acceptedWithLimitationsResourceHandoffRefs: stringList(80, 360),
    failedResourceHandoffRefs: stringList(80, 360),
    limitationRefs: stringList(80, 360),
    missingResourceRequirementRefs: stringList(80, 360),
    missingResourceHandoffRefs: stringList(80, 360),
    consumerNodeIds: stringList(80, 220),
    resourceSupplyNodeIds: stringList(80, 220),
    legacyResourceSupplyObservationCount: z.number().int().nonnegative().max(10_000),
    failedResourceSupplyNodeIds: stringList(80, 220),
    pendingResourceSupplyNodeIds: stringList(80, 220),
    limitationWaiverRefs: stringList(40, 360),
    status: WorkIntentContextResolutionStatusSchema,
    nextLegalTransitions: stringList(16, 220),
    reasonCodes: stringList(120, 240),
    semanticQualityJudgedByDeterministicCode: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type WorkIntentContextResolution = z.infer<
  typeof WorkIntentContextResolutionSchema
>;

export type WorkIntentContextResolutionManifest = {
  artifactKind: "work_intent_context_resolution_manifest";
  schemaVersion: typeof WORK_INTENT_CONTEXT_RESOLUTION_SCHEMA_VERSION;
  resolutionRef: string;
  resolutionHash: string;
  workIntentNodeId: string;
  workIntentRef: string;
  executionIntent: ExecutionIntent;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  status: WorkIntentContextResolutionStatus;
  resourceObjectiveFocusCount: number;
  nodeResourceDemandSessionCount: number;
  nodeResourceDemandRequestCount: number;
  nodeResourceDemandFulfillmentCount: number;
  nodeResourceDemandBlockerCount: number;
  nodeResourceLedgerCount: number;
  nodeResourceLedgerEntryCount: number;
  nodeResourceLedgerEntryPayloadCount: number;
  providerDiagnosticCount: number;
  domainResourceSelectionCount: number;
  domainResourceSelectionPacketCount: number;
  domainResourceSelectionDecisionCount: number;
  requiredResourceRequirementCount: number;
  resourceMergePacketCount: number;
  resourceSatisfactionStateCount: number;
  requiredShardHandoffCount: number;
  acceptedResourceHandoffCount: number;
  acceptedWithLimitationsResourceHandoffCount: number;
  failedResourceHandoffCount: number;
  limitationCount: number;
  missingResourceRequirementCount: number;
  missingResourceHandoffCount: number;
  consumerNodeIds: string[];
  legacyResourceSupplyObservationCount: number;
  nextLegalTransitions: string[];
  transitionAuthority: "node_lifecycle_transition_runner";
  reasonCodes: string[];
  byteCount: number;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

type ResourceSupplyObservation = {
  node: TeamGraphNode;
  edge: TeamGraphEdge;
  metadata: Record<string, unknown>;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function bounded(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown, max = 80, maxChars = 360): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = bounded(item, maxChars);
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

function uniqueStrings(values: Array<string | null | undefined>, max = 80, maxChars = 360): string[] {
  return strings(values, max, maxChars);
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? bounded(value, 420) : null;
}

function metadataRefs(
  metadata: Record<string, unknown>,
  keys: string[],
  max = 80,
  maxChars = 360,
): string[] {
  return strings(
    keys.flatMap((key) => [
      metadataString(metadata, key),
      ...strings(metadata[key], max, maxChars),
    ]),
    max,
    maxChars,
  );
}

function explicitWorkflowResourceObservation(
  edge: TeamGraphEdge,
  node: TeamGraphNode,
): boolean {
  const edgeMetadata = asRecord(edge.metadata);
  const nodeMetadata = asRecord(node.metadata);
  return (
    edgeMetadata.explicitWorkflowContextCoordination === true ||
    edgeMetadata.contextCoordinationCapabilityExplicit === true ||
    nodeMetadata.explicitWorkflowContextCoordination === true ||
    typeof edgeMetadata.contextCoordinationCapabilityRef === "string" ||
    typeof nodeMetadata.contextCoordinationCapabilityRef === "string"
  );
}

function collectResourceSupplyObservations(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  workIntentNode: TeamGraphNode;
}): { observations: ResourceSupplyObservation[]; legacyResourceObservationCount: number } {
  const nodesById = new Map(input.snapshot.nodes.map((node) => [node.nodeId, node]));
  const resourceEdges = input.snapshot.edges.filter((edge) => {
    const edgeKind = String((edge as { edgeKind?: unknown }).edgeKind ?? "");
    const metadata = asRecord(edge.metadata);
    return (
      edge.toNodeId === input.workIntentNode.nodeId &&
      (edgeKind === "context_supplies" ||
        edgeKind === "handoff" ||
        metadata.edgeKind === "context_supplies" ||
        metadata.relationship === "context_supplies" ||
        metadata.resourceFulfillmentEdge === true)
    );
  });
  const observations = resourceEdges.flatMap((edge) => {
    const node = edge.fromNodeId ? nodesById.get(edge.fromNodeId) : null;
    if (!node || !explicitWorkflowResourceObservation(edge, node)) {
      return [];
    }
    return [
      {
        node,
        edge,
        metadata: asRecord(node.metadata),
      },
    ];
  });
  return { observations, legacyResourceObservationCount: resourceEdges.length };
}

function resourceObjectiveFocusRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  return metadataString(input.metadata, "resourceObjectiveFocusStatus") === "accepted"
    ? metadataRefs(input.metadata, [
        "resourceObjectiveFocusRef",
        "resourceObjectiveFocusRefs",
        "acceptedResourceObjectiveFocusRef",
        "acceptedResourceObjectiveFocusRefs",
      ], 40, 360)
    : [];
}

function resourceObjectiveFocusBlocked(metadata: Record<string, unknown>): boolean {
  const status = metadataString(metadata, "resourceObjectiveFocusStatus");
  return status === "blocked" || status === "unanswerable" || status === "rejected";
}

function nodeResourceDemandSessionRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  const status = metadataString(input.metadata, "nodeResourceDemandStatus");
  return status === "open" || status === "fulfilled" || status === "closed"
    ? metadataRefs(input.metadata, [
        "nodeResourceDemandSessionRef",
        "nodeResourceDemandSessionRefs",
      ], 40, 360)
    : [];
}

function nodeResourceDemandRequestRefsFrom(metadata: Record<string, unknown>): string[] {
  return metadataRefs(
    metadata,
    [
      "nodeResourceDemandRequestRef",
      "nodeResourceDemandRequestRefs",
      "nodeResourceDemandScopeRequestRef",
      "nodeResourceDemandScopeRequestRefs",
    ],
    80,
    360,
  );
}

function nodeResourceDemandFulfillmentRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  const status = metadataString(input.metadata, "nodeResourceDemandStatus");
  return status === "fulfilled"
    ? metadataRefs(input.metadata, [
        "nodeResourceDemandFulfillmentRef",
        "nodeResourceDemandFulfillmentRefs",
        "nodeResourceDemandResultRef",
        "nodeResourceDemandResultRefs",
        "nodeResourceDemandHandoffRef",
        "nodeResourceDemandHandoffRefs",
      ], 80, 360)
    : [];
}

function nodeResourceDemandBlockerRefsFrom(metadata: Record<string, unknown>): string[] {
  if (metadataString(metadata, "nodeResourceDemandStatus") === "fulfilled") {
    return [];
  }
  return metadataRefs(
    metadata,
    [
      "nodeResourceDemandBlockerRef",
      "nodeResourceDemandBlockerRefs",
      "nodeResourceDemandFailureRef",
      "nodeResourceDemandFailureRefs",
    ],
    80,
    360,
  );
}

function resourceNarrowingRequired(metadata: Record<string, unknown>): boolean {
  const narrowingStatus =
    metadataString(metadata, "resourceNarrowingStatus") ??
    metadataString(metadata, "contextScoutSpecialistStatus");
  if (
    narrowingStatus === "dispatch_ready" ||
    narrowingStatus === "open" ||
    narrowingStatus === "pending" ||
    narrowingStatus === "requires_exact_handles"
  ) {
    return true;
  }
  if (
    metadataRefs(
      metadata,
      [
        "contextScoutSpecialistRequestRef",
        "contextScoutSpecialistRequestRefs",
        "resourceNarrowingRequestRef",
        "resourceNarrowingRequestRefs",
      ],
      40,
      360,
    ).length > 0 &&
    narrowingStatus !== "accepted" &&
    narrowingStatus !== "fulfilled" &&
    narrowingStatus !== "blocked"
  ) {
    return true;
  }
  return false;
}

function nodeResourceLedgerRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  return metadataRefs(input.metadata, [
    "nodeResourceLedgerRef",
    "nodeResourceLedgerRefs",
    "resourceLedgerRef",
    "resourceLedgerRefs",
  ], 40, 360);
}

function nodeResourceLedgerEntryRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  return metadataRefs(input.metadata, [
    "nodeResourceLedgerEntryRef",
    "nodeResourceLedgerEntryRefs",
    "resourceLedgerEntryRef",
    "resourceLedgerEntryRefs",
  ], 160, 360);
}

function nodeResourceLedgerEntryPayloadRefsFrom(metadata: Record<string, unknown>): string[] {
  return metadataRefs(
    metadata,
    [
      "nodeResourceLedgerEntryPayloadRef",
      "nodeResourceLedgerEntryPayloadRefs",
      "resourceLedgerEntryPayloadRef",
      "resourceLedgerEntryPayloadRefs",
    ],
    160,
    360,
  );
}

function providerDiagnosticRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  return metadataRefs(input.metadata, [
    "providerDiagnosticRef",
    "providerDiagnosticRefs",
    "contextProviderDiagnosticRef",
    "contextProviderDiagnosticRefs",
  ], 80, 360);
}

function domainResourceSelectionRefsFrom(input: {
  metadata: Record<string, unknown>;
}): string[] {
  const status =
    metadataString(input.metadata, "domainResourceSelectionStatus") ??
    metadataString(input.metadata, "domainResourceSelectionDecisionStatus");
  const decisionStatus = metadataString(input.metadata, "domainResourceSelectionDecisionStatus");
  return status === "accepted" || decisionStatus === "accepted"
    ? metadataRefs(input.metadata, [
        "domainResourceSelectionRef",
        "domainResourceSelectionRefs",
        "acceptedDomainResourceSelectionRef",
        "acceptedDomainResourceSelectionRefs",
      ], 80, 360)
    : [];
}

function domainResourceSelectionPacketRefsFrom(metadata: Record<string, unknown>): string[] {
  const selectionStatus =
    metadataString(metadata, "domainResourceSelectionStatus") ??
    metadataString(metadata, "domainResourceSelectionDecisionStatus") ??
    metadataString(metadata, "domainResourceSelectionPacketStatus");
  const decisionStatus = metadataString(metadata, "domainResourceSelectionDecisionStatus");
  const packetStatus = metadataString(metadata, "domainResourceSelectionPacketStatus");
  if (
    selectionStatus !== "accepted" &&
    decisionStatus !== "accepted" &&
    packetStatus !== "accepted"
  ) {
    return [];
  }
  return metadataRefs(
    metadata,
    [
      "domainResourceSelectionPacketRef",
      "domainResourceSelectionPacketRefs",
      "domainResourceSelectionDecisionPacketRef",
      "domainResourceSelectionDecisionPacketRefs",
    ],
    80,
    360,
  );
}

function domainResourceSelectionDecisionRefsFrom(metadata: Record<string, unknown>): string[] {
  return metadataString(metadata, "domainResourceSelectionDecisionStatus") === "accepted"
    ? metadataRefs(
        metadata,
        [
          "domainResourceSelectionDecisionRef",
          "domainResourceSelectionDecisionRefs",
          "acceptedDomainResourceSelectionDecisionRef",
          "acceptedDomainResourceSelectionDecisionRefs",
        ],
        80,
        360,
      )
    : [];
}

function resourceRequirementRefsFrom(input: {
  workIntentMetadata: Record<string, unknown>;
  observations: ResourceSupplyObservation[];
}): string[] {
  return strings(
    [
      ...metadataRefs(input.workIntentMetadata, [
        "resourceRequirementRef",
        "resourceRequirementRefs",
      ]),
      ...strings(input.workIntentMetadata.resourceRequirementRefs),
      ...input.observations.flatMap((observation) => {
        const edgeMetadata = asRecord(observation.edge.metadata);
        return [
          metadataString(edgeMetadata, "resourceRequirementRef"),
          ...strings(edgeMetadata.resourceRequirementRefs),
          ...strings(observation.metadata.resourceRequirementRefs),
        ];
      }),
    ],
    80,
    360,
  );
}

function resourceScoutExecutionPacketRefsFrom(
  observations: ResourceSupplyObservation[],
): string[] {
  return strings(
    observations.flatMap((observation) => [
      metadataString(observation.metadata, "contextScoutExecutionPacketRef"),
      ...strings(observation.metadata.resourceScoutExecutionPacketRefs),
    ]),
    80,
    360,
  );
}

function resourceMergePacketRefsFrom(observations: ResourceSupplyObservation[]): string[] {
  return strings(
    observations.flatMap((observation) => [
      metadataString(observation.metadata, "contextMergePacketRef"),
      ...strings(observation.metadata.resourceMergePacketRefs),
    ]),
    80,
    360,
  );
}

function resourceSatisfactionStateRefsFrom(observations: ResourceSupplyObservation[]): string[] {
  return strings(
    observations.flatMap((observation) => [
      metadataString(observation.metadata, "workIntentContextSatisfactionStateRef"),
      metadataString(observation.metadata, "contextSatisfactionStateRef"),
      ...strings(observation.metadata.workIntentContextSatisfactionStateRefs),
      ...strings(observation.metadata.resourceSatisfactionStateRefs),
    ]),
    80,
    360,
  );
}

function requiredShardHandoffRefsFrom(observations: ResourceSupplyObservation[]): string[] {
  return strings(
    observations.flatMap((observation) => strings(observation.metadata.requiredShardHandoffRefs)),
    120,
    360,
  );
}

function resourceHandoffRefsFrom(observation: ResourceSupplyObservation): string[] {
  return strings(
    [
      metadataString(observation.metadata, "resourceHandoffPacketRef"),
      metadataString(observation.metadata, "contextShardHandoffRef"),
      ...strings(observation.metadata.resourceHandoffPacketRefs),
      ...strings(observation.metadata.contextShardHandoffRefs),
      ...strings(observation.metadata.acceptedShardHandoffRefs),
      ...strings(observation.metadata.acceptedResourceHandoffRefs),
    ],
    20,
    360,
  );
}

function limitationRefsFrom(observations: ResourceSupplyObservation[]): string[] {
  return strings(
    observations.flatMap((observation) => [
      ...strings(observation.metadata.limitationRefs),
      ...strings(observation.metadata.contextLimitationRefs),
    ]),
    80,
    360,
  );
}

function limitationWaiverRefsFrom(input: {
  workIntentMetadata: Record<string, unknown>;
  observations: ResourceSupplyObservation[];
}): string[] {
  return strings(
    [
      ...strings(input.workIntentMetadata.contextLimitationWaiverRefs),
      ...strings(input.workIntentMetadata.consumerContextLimitationWaiverRefs),
      ...input.observations.flatMap((observation) => [
        metadataString(observation.metadata, "consumerWaiverRef"),
        ...strings(observation.metadata.contextLimitationWaiverRefs),
        ...strings(observation.metadata.consumerContextLimitationWaiverRefs),
      ]),
    ],
    40,
    360,
  );
}

function evidenceModesFrom(metadata: Record<string, unknown>): EvidenceMode[] {
  const parsed: EvidenceMode[] = [];
  for (const value of strings(metadata.evidenceMode, 12, 160)) {
    const result = EvidenceModeSchema.safeParse(value);
    if (result.success && !parsed.includes(result.data)) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

function executionIntentFrom(metadata: Record<string, unknown>): ExecutionIntent {
  const value = metadataString(metadata, "executionIntent");
  const parsed = value ? ExecutionIntentSchema.safeParse(value) : null;
  return parsed?.success ? parsed.data : "unspecified";
}

export function workIntentContextResolutionCanSatisfyReadOnlyIntent(input: {
  executionIntent: ExecutionIntent;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): boolean {
  if (input.executionIntent === "source_grounding" || input.executionIntent === "readback") {
    return true;
  }
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  if (!capability) {
    return false;
  }
  const writeOrTerminalEvidence = new Set<EvidenceMode>([
    "changed_file_evidence",
    "validation_evidence",
    "review_evidence",
    "human_decision_evidence",
    "closeout_evidence",
  ]);
  return (
    !capability.canEditSource &&
    !input.evidenceMode.some((mode) => writeOrTerminalEvidence.has(mode)) &&
    (capability.canInspectRepo ||
      capability.graphNodeKind === "web_research" ||
      capability.graphNodeKind === "observability_readback")
  );
}

function workIntentContextResolutionRequiresDomainResourceSelection(input: {
  executionIntent: ExecutionIntent;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): boolean {
  if (input.executionIntent === "source_edit" || input.executionIntent === "resource_materialization") {
    return true;
  }
  if (input.evidenceMode.includes("changed_file_evidence")) {
    return true;
  }
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  return capability?.canEditSource === true || capability?.canWriteTests === true;
}

function workIntentContextResolutionUsesWorkerOwnedContext(input: {
  executionIntent: ExecutionIntent;
  capabilityId: string;
  evidenceMode: EvidenceMode[];
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): boolean {
  if (input.executionIntent === "source_grounding") {
    return false;
  }
  if (input.executionIntent === "source_edit") {
    return true;
  }
  if (
    input.evidenceMode.includes("changed_file_evidence") ||
    input.evidenceMode.includes("validation_evidence")
  ) {
    return true;
  }
  const capability = findRuntimeNodeCapability(input.capabilityId, input.capabilityManifest);
  return capability?.canRunAsExecutable === true && capability.graphNodeKind !== "work_intent";
}

function domainResourceSelectionBlocked(metadata: Record<string, unknown>): boolean {
  if (
    metadataString(metadata, "domainResourceSelectionStatus") === "accepted" ||
    metadataString(metadata, "domainResourceSelectionDecisionStatus") === "accepted" ||
    metadataRefs(metadata, [
      "acceptedDomainResourceSelectionRef",
      "acceptedDomainResourceSelectionRefs",
      "acceptedDomainResourceSelectionDecisionRef",
      "acceptedDomainResourceSelectionDecisionRefs",
    ], 80, 360).length > 0
  ) {
    return false;
  }
  const status =
    metadataString(metadata, "domainResourceSelectionStatus") ??
    metadataString(metadata, "domainResourceSelectionDecisionStatus") ??
    metadataString(metadata, "domainResourceSelectionPacketStatus");
  return (
    status === "blocked" ||
    status === "failed" ||
    status === "needs_review" ||
    status === "rejected"
  );
}

export function compileWorkIntentContextResolution(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  workIntentNode: TeamGraphNode;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): WorkIntentContextResolution {
  const metadata = asRecord(input.workIntentNode.metadata);
  const workIntentRef =
    metadataString(metadata, "workIntentRef") ??
    `runtime-work-graph://node/${input.workIntentNode.nodeId}`;
  const workIntentId =
    metadataString(metadata, "workIntentId") ?? input.workIntentNode.nodeId;
  const capabilityId =
    metadataString(metadata, "workIntentSelectedCapabilityId") ??
    metadataString(metadata, "selectedCapabilityId") ??
    metadataString(metadata, "capabilityId") ??
    "unknown";
  const executionIntent = executionIntentFrom(metadata);
  const evidenceMode = evidenceModesFrom(metadata);
  const { observations, legacyResourceObservationCount } = collectResourceSupplyObservations({
    snapshot: input.snapshot,
    workIntentNode: input.workIntentNode,
  });
  const resourceObjectiveFocusRefs = resourceObjectiveFocusRefsFrom({
    metadata,
  });
  const resourceObjectiveFocusIsBlocked = resourceObjectiveFocusBlocked(metadata);
  const nodeResourceDemandSessionRefs = nodeResourceDemandSessionRefsFrom({
    metadata,
  });
  const nodeResourceDemandRequestRefs = nodeResourceDemandRequestRefsFrom(metadata);
  const nodeResourceDemandFulfillmentRefs = nodeResourceDemandFulfillmentRefsFrom({
    metadata,
  });
  const nodeResourceDemandBlockerRefs = nodeResourceDemandBlockerRefsFrom(metadata);
  const nodeResourceLedgerRefs = nodeResourceLedgerRefsFrom({
    metadata,
  });
  const nodeResourceLedgerEntryRefs = nodeResourceLedgerEntryRefsFrom({
    metadata,
  });
  const nodeResourceLedgerEntryPayloadRefs = nodeResourceLedgerEntryPayloadRefsFrom(metadata);
  const providerDiagnosticRefs = providerDiagnosticRefsFrom({
    metadata,
  });
  const domainResourceSelectionRefs = domainResourceSelectionRefsFrom({
    metadata,
  });
  const domainResourceSelectionPacketRefs = domainResourceSelectionPacketRefsFrom(metadata);
  const domainResourceSelectionDecisionRefs = domainResourceSelectionDecisionRefsFrom(metadata);
  const resourceRequirementRefs = resourceRequirementRefsFrom({
    workIntentMetadata: metadata,
    observations,
  });
  const resourceScoutExecutionPacketRefs = strings(
    [
      ...metadataRefs(metadata, [
        "contextScoutExecutionPacketRef",
        "resourceScoutExecutionPacketRefs",
      ]),
      ...resourceScoutExecutionPacketRefsFrom(observations),
    ],
    80,
    360,
  );
  const resourceMergePacketRefs = strings(
    [
      ...metadataRefs(metadata, ["contextMergePacketRef", "resourceMergePacketRefs"]),
      ...resourceMergePacketRefsFrom(observations),
    ],
    80,
    360,
  );
  const resourceSatisfactionStateRefs = strings(
    [
      ...metadataRefs(metadata, [
        "workIntentContextSatisfactionStateRef",
        "workIntentContextSatisfactionStateRefs",
        "contextSatisfactionStateRef",
        "resourceSatisfactionStateRefs",
      ]),
      ...resourceSatisfactionStateRefsFrom(observations),
    ],
    80,
    360,
  );
  const requiredShardHandoffRefs = strings(
    [
      ...metadataRefs(metadata, ["requiredShardHandoffRef", "requiredShardHandoffRefs"], 120, 360),
      ...requiredShardHandoffRefsFrom(observations),
    ],
    120,
    360,
  );
  const acceptedObservations = observations.filter(
    (observation) => observation.node.nodeStatus === "succeeded",
  );
  const failedObservations = observations.filter((observation) =>
    ["failed", "needs_review", "skipped"].includes(observation.node.nodeStatus),
  );
  const pendingObservations = observations.filter((observation) =>
    ["planned", "running", "waiting_for_human"].includes(observation.node.nodeStatus),
  );
  const acceptedHandoffRefs = strings(
    [
      ...metadataRefs(metadata, [
        "resourceHandoffPacketRef",
        "resourceHandoffPacketRefs",
        "acceptedResourceHandoffRef",
        "acceptedResourceHandoffRefs",
        "acceptedShardHandoffRef",
        "acceptedShardHandoffRefs",
        "contextScoutSpecialistHandoffRef",
        "contextScoutSpecialistHandoffRefs",
      ]),
      ...nodeResourceDemandFulfillmentRefs,
      ...acceptedObservations.flatMap((observation) => resourceHandoffRefsFrom(observation)),
    ],
    80,
    360,
  );
  const acceptedWithLimitationsRefs = strings(
    [
      ...metadataRefs(metadata, [
        "acceptedWithLimitationsResourceHandoffRef",
        "acceptedWithLimitationsResourceHandoffRefs",
      ]),
      ...acceptedObservations
        .filter((observation) => {
          const status =
            metadataString(observation.metadata, "sufficiencyStatus") ??
            metadataString(observation.metadata, "contextSufficiencyStatus") ??
            metadataString(observation.metadata, "resourceHandoffStatus") ??
            metadataString(observation.metadata, "contextShardHandoffStatus") ??
            metadataString(observation.metadata, "contextMergeStatus") ??
            metadataString(observation.metadata, "contextStatus");
          return status === "accepted_with_limitations" || status === "satisfied_with_limitations";
        })
        .flatMap((observation) => resourceHandoffRefsFrom(observation)),
    ],
    80,
    360,
  );
  const failedHandoffRefs = strings(
    [
      ...metadataRefs(metadata, [
        "failedResourceHandoffRef",
        "failedResourceHandoffRefs",
        "failedShardHandoffRef",
        "failedShardHandoffRefs",
      ]),
      ...failedObservations.flatMap((observation) => resourceHandoffRefsFrom(observation)),
    ],
    80,
    360,
  );
  const missingResourceHandoffRefs = strings(
    observations
      .filter((observation) => resourceHandoffRefsFrom(observation).length === 0)
      .map((observation) => `resource-handoff-missing://${observation.node.nodeId}`),
    80,
    360,
  );
  const missingResourceRequirementRefs =
    observations.length > 0 && resourceRequirementRefs.length === 0
      ? [`resource-requirement-missing://${input.workIntentNode.nodeId}`]
      : [];
  const limitationRefs = strings(
    [
      ...metadataRefs(metadata, ["limitationRef", "limitationRefs", "contextLimitationRef", "contextLimitationRefs"]),
      ...limitationRefsFrom(observations),
    ],
    80,
    360,
  );
  const capability = findRuntimeNodeCapability(capabilityId, input.capabilityManifest);
  const resourceRequirementKinds = strings(metadata.resourceRequirementKinds, 80, 180);
  const resourceRequired =
    metadata.resourceRequired === true ||
    resourceRequirementKinds.includes("resource_handoff") ||
    capability?.requiresResources === true ||
    Boolean(capability?.requiredResourceKinds.length) ||
    resourceRequirementRefs.length > 0 ||
    nodeResourceDemandSessionRefs.length > 0 ||
    nodeResourceDemandRequestRefs.length > 0 ||
    nodeResourceDemandFulfillmentRefs.length > 0 ||
    nodeResourceLedgerRefs.length > 0 ||
    nodeResourceLedgerEntryRefs.length > 0 ||
    observations.length > 0;
  const hasRequiredObservations =
    observations.length > 0 ||
    resourceRequirementRefs.length > 0 ||
    nodeResourceDemandSessionRefs.length > 0 ||
    nodeResourceDemandRequestRefs.length > 0 ||
    nodeResourceDemandFulfillmentRefs.length > 0 ||
    nodeResourceLedgerRefs.length > 0 ||
    nodeResourceLedgerEntryRefs.length > 0;
  const allAccepted =
    (observations.length === 0 || acceptedObservations.length === observations.length) &&
    (acceptedHandoffRefs.length > 0 ||
      nodeResourceLedgerEntryRefs.length > 0 ||
      nodeResourceDemandFulfillmentRefs.length > 0) &&
    missingResourceRequirementRefs.length === 0 &&
    missingResourceHandoffRefs.length === 0;
  const nodeLocalResourceReady =
    acceptedHandoffRefs.length > 0 ||
    nodeResourceDemandFulfillmentRefs.length > 0 ||
    nodeResourceLedgerEntryRefs.length > 0 ||
    nodeResourceLedgerEntryPayloadRefs.length > 0;
  const hasAcceptedWithLimitations =
    acceptedWithLimitationsRefs.length > 0 ||
    strings(metadata.contextLimitationRefs).length > 0 ||
    limitationRefs.length > 0;
  const waiverRefs = limitationWaiverRefsFrom({ workIntentMetadata: metadata, observations });
  const blockedByUnwaivedLimitations = hasAcceptedWithLimitations && waiverRefs.length === 0;
  const requiresDomainResourceSelection = workIntentContextResolutionRequiresDomainResourceSelection({
    executionIntent,
    capabilityId,
    evidenceMode,
    capabilityManifest: input.capabilityManifest,
  });
  const workerOwnedContextStartReady = workIntentContextResolutionUsesWorkerOwnedContext({
    executionIntent,
    capabilityId,
    evidenceMode,
    capabilityManifest: input.capabilityManifest,
  });
  const domainResourceSelectionReady =
    domainResourceSelectionRefs.length > 0 ||
    domainResourceSelectionPacketRefs.length > 0 ||
    domainResourceSelectionDecisionRefs.length > 0;
  const domainResourceSelectionIsBlocked = domainResourceSelectionBlocked(metadata);
  const mustRunContextNarrowing =
    resourceNarrowingRequired(metadata) && !nodeLocalResourceReady;
  const readOnlySatisfied =
    allAccepted &&
    !blockedByUnwaivedLimitations &&
    workIntentContextResolutionCanSatisfyReadOnlyIntent({
      executionIntent,
      capabilityId,
      evidenceMode,
      capabilityManifest: input.capabilityManifest,
    });
  const status: WorkIntentContextResolutionStatus =
    workerOwnedContextStartReady
        ? "worker_action_ready"
      : !resourceRequired && !hasRequiredObservations
      ? "resource_not_required"
      : mustRunContextNarrowing || (resourceRequired && resourceObjectiveFocusRefs.length === 0)
        ? "resource_narrowing_required"
      : nodeResourceDemandBlockerRefs.length > 0 && !nodeLocalResourceReady
        ? "resource_demand_blocked"
      : nodeResourceDemandBlockerRefs.length > 0
        ? "blocked"
      : resourceRequired && !nodeLocalResourceReady
        ? "resource_demand_open"
      : pendingObservations.length > 0
        ? "pending_resource"
      : blockedByUnwaivedLimitations ||
            missingResourceRequirementRefs.length > 0 ||
            (observations.length > 0 && acceptedHandoffRefs.length === 0)
          ? "blocked"
            : failedObservations.length > 0 || missingResourceHandoffRefs.length > 0
              ? acceptedHandoffRefs.length > 0
                ? "partially_satisfied"
                : "blocked"
              : domainResourceSelectionIsBlocked
                ? "domain_resource_selection_blocked"
                : requiresDomainResourceSelection && !domainResourceSelectionReady
                  ? "domain_resource_selection_required"
                  : readOnlySatisfied
                    ? "read_only_satisfied"
                    : allAccepted
                      ? "satisfied"
                      : resourceRequired
                        ? "resource_ledger_ready"
                        : "resource_not_required";
  const nextLegalTransitions: string[] = [];
  const body = {
    artifactKind: "work_intent_context_resolution" as const,
    schemaVersion: WORK_INTENT_CONTEXT_RESOLUTION_SCHEMA_VERSION,
    resolutionId: `${input.workIntentNode.nodeId}:context-resolution`,
    resolutionRef: "pending",
    resolutionHash: "pending",
    runtimeJobId: bounded(input.snapshot.graph.rootRuntimeJobId ?? input.snapshot.graph.graphId, 180),
    workflowId: bounded(input.snapshot.graph.workflowId, 180),
    graphId: bounded(input.snapshot.graph.graphId, 180),
    workIntentId: bounded(workIntentId, 220),
    workIntentNodeId: bounded(input.workIntentNode.nodeId, 220),
    workIntentRef: bounded(workIntentRef, 420),
    executionIntent,
    capabilityId: bounded(capabilityId, 180),
    evidenceMode,
    resourceObjectiveFocusRefs,
    nodeResourceDemandSessionRefs,
    nodeResourceDemandRequestRefs,
    nodeResourceDemandFulfillmentRefs,
    nodeResourceDemandBlockerRefs,
    nodeResourceLedgerRefs,
    nodeResourceLedgerEntryRefs,
    nodeResourceLedgerEntryPayloadRefs,
    providerDiagnosticRefs,
    domainResourceSelectionRefs,
    domainResourceSelectionPacketRefs,
    domainResourceSelectionDecisionRefs,
    requiredResourceRequirementRefs: resourceRequirementRefs,
    resourceScoutExecutionPacketRefs,
    resourceMergePacketRefs,
    resourceSatisfactionStateRefs,
    requiredShardHandoffRefs,
    acceptedResourceHandoffRefs: acceptedHandoffRefs,
    acceptedWithLimitationsResourceHandoffRefs: acceptedWithLimitationsRefs,
    failedResourceHandoffRefs: failedHandoffRefs,
    limitationRefs,
    missingResourceRequirementRefs,
    missingResourceHandoffRefs,
    consumerNodeIds: [input.workIntentNode.nodeId],
    resourceSupplyNodeIds: observations.map((observation) => observation.node.nodeId),
    legacyResourceSupplyObservationCount: legacyResourceObservationCount,
    failedResourceSupplyNodeIds: failedObservations.map((observation) => observation.node.nodeId),
    pendingResourceSupplyNodeIds: pendingObservations.map((observation) => observation.node.nodeId),
    limitationWaiverRefs: waiverRefs,
    status,
    nextLegalTransitions,
    reasonCodes: strings(
      [
        "work_intent_context_resolution_compiled",
        "work_intent_context_resolution_facts_only",
        "work_intent_context_resolution_transition_authority_runner_owned",
        `work_intent_context_resolution_status:${status}`,
        ...(resourceRequired ? ["work_intent_resource_required"] : ["work_intent_resource_not_required"]),
        ...(workerOwnedContextStartReady
          ? [
              "work_intent_worker_owned_context_start_ready",
              "pre_worker_resource_demand_retired_for_executable_work_intent",
            ]
          : []),
        ...(resourceObjectiveFocusRefs.length > 0
          ? ["work_intent_resource_objective_focus_refs_present"]
          : resourceRequired && !workerOwnedContextStartReady
            ? ["work_intent_resource_objective_focus_required"]
            : []),
        ...(nodeResourceDemandSessionRefs.length > 0
          ? ["work_intent_node_resource_demand_session_refs_present"]
          : []),
        ...(nodeResourceDemandFulfillmentRefs.length > 0
          ? ["work_intent_node_resource_demand_fulfillment_refs_present"]
          : []),
        ...(nodeResourceDemandBlockerRefs.length > 0
          ? ["work_intent_node_resource_demand_blocker_refs_present"]
          : []),
        ...(mustRunContextNarrowing
          ? ["work_intent_resource_narrowing_required_from_specialist_request"]
          : []),
        ...(nodeResourceLedgerRefs.length > 0 ? ["work_intent_node_resource_ledger_refs_present"] : []),
        ...(nodeResourceLedgerEntryRefs.length > 0
          ? ["work_intent_node_resource_ledger_entry_refs_present"]
          : []),
        ...(domainResourceSelectionReady ? ["work_intent_domain_resource_selection_refs_present"] : []),
        ...(requiresDomainResourceSelection && !domainResourceSelectionReady
          ? ["work_intent_domain_resource_selection_required_from_resource_ledger"]
          : []),
        ...(domainResourceSelectionIsBlocked ? ["work_intent_domain_resource_selection_blocked"] : []),
        ...(legacyResourceObservationCount > observations.length
          ? ["legacy_resource_fulfillment_observations_ignored_without_explicit_workflow_coordination"]
          : []),
        ...(allAccepted ? ["work_intent_context_all_required_handoffs_accepted"] : []),
        ...(requiredShardHandoffRefs.length > 0
          ? ["work_intent_resource_required_shard_handoff_refs_declared"]
          : []),
        ...(resourceMergePacketRefs.length > 0
          ? ["work_intent_context_merge_packet_refs_present"]
          : []),
        ...(resourceSatisfactionStateRefs.length > 0
          ? ["work_intent_context_satisfaction_state_refs_present"]
          : []),
        ...(blockedByUnwaivedLimitations
          ? ["work_intent_context_accepted_with_limitations_waiver_missing"]
          : []),
        ...(failedObservations.length > 0
          ? ["work_intent_context_failed_supply_nodes_present"]
          : []),
        ...(missingResourceHandoffRefs.length > 0 ? ["work_intent_resource_handoff_refs_missing"] : []),
        ...(readOnlySatisfied ? ["work_intent_read_only_satisfied_from_context"] : []),
      ],
      120,
      240,
    ),
    semanticQualityJudgedByDeterministicCode: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawTranscriptStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
  };
  const hash = hashValue({ ...body, resolutionRef: null, resolutionHash: null });
  return WorkIntentContextResolutionSchema.parse({
    ...body,
    resolutionHash: hash,
    resolutionRef: `runtime-work-graph://work-intent-context-resolution/${body.workIntentNodeId}/${hash.slice(0, 16)}`,
  });
}

export function buildWorkIntentContextResolutionManifest(
  resolution: WorkIntentContextResolution,
): WorkIntentContextResolutionManifest {
  return {
    artifactKind: "work_intent_context_resolution_manifest",
    schemaVersion: WORK_INTENT_CONTEXT_RESOLUTION_SCHEMA_VERSION,
    resolutionRef: resolution.resolutionRef,
    resolutionHash: resolution.resolutionHash,
    workIntentNodeId: resolution.workIntentNodeId,
    workIntentRef: resolution.workIntentRef,
    executionIntent: resolution.executionIntent,
    capabilityId: resolution.capabilityId,
    evidenceMode: resolution.evidenceMode,
    status: resolution.status,
    resourceObjectiveFocusCount: resolution.resourceObjectiveFocusRefs.length,
    nodeResourceDemandSessionCount: resolution.nodeResourceDemandSessionRefs.length,
    nodeResourceDemandRequestCount: resolution.nodeResourceDemandRequestRefs.length,
    nodeResourceDemandFulfillmentCount: resolution.nodeResourceDemandFulfillmentRefs.length,
    nodeResourceDemandBlockerCount: resolution.nodeResourceDemandBlockerRefs.length,
    nodeResourceLedgerCount: resolution.nodeResourceLedgerRefs.length,
    nodeResourceLedgerEntryCount: resolution.nodeResourceLedgerEntryRefs.length,
    nodeResourceLedgerEntryPayloadCount: resolution.nodeResourceLedgerEntryPayloadRefs.length,
    providerDiagnosticCount: resolution.providerDiagnosticRefs.length,
    domainResourceSelectionCount: resolution.domainResourceSelectionRefs.length,
    domainResourceSelectionPacketCount: resolution.domainResourceSelectionPacketRefs.length,
    domainResourceSelectionDecisionCount: resolution.domainResourceSelectionDecisionRefs.length,
    requiredResourceRequirementCount: resolution.requiredResourceRequirementRefs.length,
    resourceMergePacketCount: resolution.resourceMergePacketRefs.length,
    resourceSatisfactionStateCount: resolution.resourceSatisfactionStateRefs.length,
    requiredShardHandoffCount: resolution.requiredShardHandoffRefs.length,
    acceptedResourceHandoffCount: resolution.acceptedResourceHandoffRefs.length,
    acceptedWithLimitationsResourceHandoffCount:
      resolution.acceptedWithLimitationsResourceHandoffRefs.length,
    failedResourceHandoffCount: resolution.failedResourceHandoffRefs.length,
    limitationCount: resolution.limitationRefs.length,
    missingResourceRequirementCount: resolution.missingResourceRequirementRefs.length,
    missingResourceHandoffCount: resolution.missingResourceHandoffRefs.length,
    consumerNodeIds: resolution.consumerNodeIds.slice(0, 20),
    legacyResourceSupplyObservationCount: resolution.legacyResourceSupplyObservationCount,
    nextLegalTransitions: resolution.nextLegalTransitions.slice(0, 16),
    transitionAuthority: "node_lifecycle_transition_runner",
    reasonCodes: resolution.reasonCodes.slice(0, 40),
    byteCount: Buffer.byteLength(JSON.stringify(resolution), "utf8"),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

const WORK_INTENT_CONTEXT_RESOLUTION_MANIFEST_MAX_BYTES = 12_000;
const FORBIDDEN_MANIFEST_BODY_KEYS = new Set([
  "body",
  "fullBody",
  "payloadBody",
  "rawPrompt",
  "rawResponse",
  "rawTranscript",
  "rawProviderLog",
  "rawToolLog",
  "rawCommandLog",
  "rawDbRows",
  "lineNumberedContent",
  "sourceWindowContent",
  "fileSnapshotContent",
]);

export function assertWorkIntentContextResolutionManifestMetadata(value: JsonValue): void {
  const encoded = JSON.stringify(value);
  const byteCount = Buffer.byteLength(encoded, "utf8");
  if (byteCount > WORK_INTENT_CONTEXT_RESOLUTION_MANIFEST_MAX_BYTES) {
    throw new Error(
      `work_intent_context_resolution_manifest_metadata_over_budget:${byteCount}`,
    );
  }
  const visit = (current: unknown, path: string): void => {
    if (!current || typeof current !== "object") {
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (FORBIDDEN_MANIFEST_BODY_KEYS.has(key)) {
        throw new Error(`work_intent_context_resolution_manifest_body_field:${path}.${key}`);
      }
      visit(child, path ? `${path}.${key}` : key);
    }
  };
  visit(value, "manifest");
}

export function workIntentContextResolutionMetadata(
  resolution: WorkIntentContextResolution,
): JsonValue {
  const metadata = {
    ...buildWorkIntentContextResolutionManifest(resolution),
    workIntentContextResolutionRefs: [resolution.resolutionRef],
    workIntentContextResolutionStatus: resolution.status,
    resourceObjectiveFocusRefs: resolution.resourceObjectiveFocusRefs.slice(0, 24),
    nodeResourceDemandSessionRefs: resolution.nodeResourceDemandSessionRefs.slice(0, 24),
    nodeResourceDemandRequestRefs: resolution.nodeResourceDemandRequestRefs.slice(0, 24),
    nodeResourceDemandFulfillmentRefs: resolution.nodeResourceDemandFulfillmentRefs.slice(0, 24),
    nodeResourceDemandBlockerRefs: resolution.nodeResourceDemandBlockerRefs.slice(0, 24),
    nodeResourceLedgerRefs: resolution.nodeResourceLedgerRefs.slice(0, 24),
    nodeResourceLedgerEntryRefs: resolution.nodeResourceLedgerEntryRefs.slice(0, 40),
    nodeResourceLedgerEntryPayloadRefs: resolution.nodeResourceLedgerEntryPayloadRefs.slice(0, 40),
    providerDiagnosticRefs: resolution.providerDiagnosticRefs.slice(0, 24),
    domainResourceSelectionRefs: resolution.domainResourceSelectionRefs.slice(0, 24),
    domainResourceSelectionPacketRefs: resolution.domainResourceSelectionPacketRefs.slice(0, 24),
    domainResourceSelectionDecisionRefs: resolution.domainResourceSelectionDecisionRefs.slice(0, 24),
    acceptedResourceHandoffRefs: resolution.acceptedResourceHandoffRefs.slice(0, 40),
    resourceHandoffPacketRefs: resolution.acceptedResourceHandoffRefs.slice(0, 40),
    resourceRequirementRefs: resolution.requiredResourceRequirementRefs.slice(0, 40),
    resourceScoutExecutionPacketRefs: resolution.resourceScoutExecutionPacketRefs.slice(0, 40),
    resourceMergePacketRefs: resolution.resourceMergePacketRefs.slice(0, 40),
    resourceSatisfactionStateRefs: resolution.resourceSatisfactionStateRefs.slice(0, 40),
    requiredShardHandoffRefs: resolution.requiredShardHandoffRefs.slice(0, 40),
    limitationRefs: resolution.limitationRefs.slice(0, 40),
    limitationWaiverRefs: resolution.limitationWaiverRefs.slice(0, 40),
    missingResourceRequirementRefs: resolution.missingResourceRequirementRefs.slice(0, 40),
    missingResourceHandoffRefs: resolution.missingResourceHandoffRefs.slice(0, 40),
    legacyResourceSupplyObservationCount: resolution.legacyResourceSupplyObservationCount,
    failedResourceSupplyNodeIds: resolution.failedResourceSupplyNodeIds.slice(0, 40),
    pendingResourceSupplyNodeIds: resolution.pendingResourceSupplyNodeIds.slice(0, 40),
    nextLegalTransitions: resolution.nextLegalTransitions.slice(0, 16),
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
  assertWorkIntentContextResolutionManifestMetadata(metadata);
  return metadata;
}
