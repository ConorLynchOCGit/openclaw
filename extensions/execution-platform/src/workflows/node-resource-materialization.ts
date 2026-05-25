import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  EvidenceModeSchema,
  ExecutionIntentSchema,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";
import {
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskPacket,
} from "./mission-work-packets.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems).default([]);

const ContextLimitationWaiverSchema = z
  .object({
    consumerNodeId: boundedString(180),
    workUnitId: z.string().trim().max(180).nullable().default(null),
    limitation: boundedString(900),
    evidenceRefs: stringList(16, 320),
  })
  .strict();

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string | null | undefined, max: number): string {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function unique(values: Array<string | null | undefined>, max = 24, maxChars = 260): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = bounded(value, maxChars);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stateRefFor(state: Omit<NodeReadinessState, "stateRef">): string {
  return `runtime-work-graph://node-readiness-state/${state.nodeId}/${hashValue(state).slice(0, 16)}`;
}

function limitationEntries(value: unknown): Array<{ limitation: string; blocking: boolean }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const limitation =
        typeof record.limitation === "string" ? bounded(record.limitation, 900) : "";
      if (!limitation) {
        return null;
      }
      return { limitation, blocking: record.blocking !== false };
    })
    .filter((entry): entry is { limitation: string; blocking: boolean } => Boolean(entry));
}

function normalizedLimitation(value: string): string {
  return bounded(value, 900).toLowerCase();
}

function contextLimitationWaivers(value: unknown): Array<{
  consumerNodeId: string;
  workUnitId: string | null;
  limitation: string;
  evidenceRefs: string[];
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const parsed = ContextLimitationWaiverSchema.safeParse({
        consumerNodeId: record.consumerNodeId,
        workUnitId: record.workUnitId ?? null,
        limitation: record.limitation,
        evidenceRefs: Array.isArray(record.evidenceRefs) ? record.evidenceRefs : [],
      });
      return parsed.success ? parsed.data : null;
    })
    .filter(
      (
        entry,
      ): entry is {
        consumerNodeId: string;
        workUnitId: string | null;
        limitation: string;
        evidenceRefs: string[];
      } => Boolean(entry),
    );
}

function hasContextLimitationWaiver(input: {
  limitation: string;
  nodeId: string;
  workUnitId: string | null;
  waivers: Array<{
    consumerNodeId: string;
    workUnitId: string | null;
    limitation: string;
    evidenceRefs: string[];
  }>;
}): boolean {
  const limitation = normalizedLimitation(input.limitation);
  return input.waivers.some((waiver) => {
    const consumerMatches =
      waiver.consumerNodeId === "all" || waiver.consumerNodeId === input.nodeId;
    const workUnitMatches = !waiver.workUnitId || waiver.workUnitId === input.workUnitId;
    const limitationMatches = normalizedLimitation(waiver.limitation) === limitation;
    return (
      consumerMatches && workUnitMatches && limitationMatches && waiver.evidenceRefs.length > 0
    );
  });
}

function isSplitChildExecutionPacket(input: {
  packet: NodeExecutionPacket;
  resourcePacket: Record<string, unknown>;
}): boolean {
  const implementationTaskPacketRef =
    typeof input.resourcePacket.implementationTaskPacketRef === "string"
      ? input.resourcePacket.implementationTaskPacketRef
      : "";
  return (
    input.packet.nodeId.includes(":task:") ||
    input.packet.packetId.includes(":task:") ||
    input.packet.packetRef.includes(":task:") ||
    input.packet.resourcePacketRef.includes(":implementation-task:") ||
    implementationTaskPacketRef.includes(":implementation-task:")
  );
}

export const NodeReadinessStatusSchema = z.enum([
  "not_evaluated",
  "blocked",
  "needs_repair",
  "needs_review",
  "ready_with_limitations",
  "ready",
]);

export type NodeReadinessStatus = z.infer<typeof NodeReadinessStatusSchema>;

export const NodeReadinessPhaseSchema = z.enum([
  "work_intent",
  "context_supply",
  "resource_materialization",
  "implementation_ready",
  "executing",
  "validation_ready",
  "closeout_ready",
]);

export type NodeReadinessPhase = z.infer<typeof NodeReadinessPhaseSchema>;

export const RuntimeNodeLifecycleStateSchema = z.enum([
  "work_intent",
  "context_required",
  "context_in_progress",
  "context_ready",
  "resources_required",
  "resource_materialization_in_progress",
  "resources_ready",
  "executable",
  "running",
  "completed",
  "needs_repair",
  "needs_review",
  "failed",
  "canceled",
]);

export type RuntimeNodeLifecycleState = z.infer<typeof RuntimeNodeLifecycleStateSchema>;

export const NodeReadinessSubStatusSchema = z.enum([
  "not_applicable",
  "unknown",
  "missing",
  "blocked",
  "accepted",
  "accepted_with_limitations",
  "fresh",
  "stale",
  "ready",
  "ready_with_limitations",
  "passed",
  "failed",
]);

export type NodeReadinessSubStatus = z.infer<typeof NodeReadinessSubStatusSchema>;

export const NodeReadinessRepairActionSchema = z.enum([
  "none",
  "request_context_repair",
  "compile_resource_packet",
  "compile_validation_plan",
  "repair_authority_scope",
  "repair_evidence_expectations",
  "split_work_unit",
  "ask_human",
  "needs_operator_review",
]);

export type NodeReadinessRepairAction = z.infer<typeof NodeReadinessRepairActionSchema>;

export const NodeReadinessTransitionSchema = z.enum([
  "request_context_repair",
  "compile_node_execution_packet",
  "compile_validation_plan",
  "repair_authority_scope",
  "repair_evidence_expectations",
  "split_work_unit",
  "execute_node",
  "run_validation",
  "closeout",
  "needs_review",
]);

export type NodeReadinessTransition = z.infer<typeof NodeReadinessTransitionSchema>;

export const NodeReadinessStateSchema = z
  .object({
    artifactKind: z.literal("node_readiness_state"),
    schemaVersion: z.literal("execution-platform.node-readiness-state.v1"),
    stateRef: boundedString(320),
    nodeId: boundedString(180),
    runtimeJobId: boundedString(180),
    graphId: boundedString(180),
    workflowId: boundedString(180),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    capabilityId: z.string().trim().max(180).nullable().default(null),
    roleClass: z.string().trim().max(120).nullable().default(null),
    readinessStatus: NodeReadinessStatusSchema,
    phase: NodeReadinessPhaseSchema,
    lifecycleState: RuntimeNodeLifecycleStateSchema.default("work_intent"),
    dependencyStatus: NodeReadinessSubStatusSchema.default("unknown"),
    resourcePacketRef: z.string().trim().max(320).nullable(),
    nodeExecutionPacketRef: z.string().trim().max(320).nullable().default(null),
    domainResourcePacketRef: z.string().trim().max(320).nullable().default(null),
    resourceStatus: NodeReadinessSubStatusSchema.default("unknown"),
    freshnessStatus: NodeReadinessSubStatusSchema,
    snapshotStatus: NodeReadinessSubStatusSchema,
    contextStatus: NodeReadinessSubStatusSchema,
    contextSnapshotRefs: stringList(80, 300),
    contextLimitationStatus: NodeReadinessSubStatusSchema.default("not_applicable"),
    contextLimitationWaiverRefs: stringList(40, 320),
    validationStatus: NodeReadinessSubStatusSchema,
    authorityStatus: NodeReadinessSubStatusSchema,
    evidenceStatus: NodeReadinessSubStatusSchema,
    payloadRefs: stringList(80, 320),
    manifestRefs: stringList(80, 320),
    targetCommitmentIds: stringList(40, 180),
    evidenceClaimRefs: stringList(40, 320),
    validationPlanRefs: stringList(40, 320),
    blockers: stringList(80, 900),
    blockingReasonCodes: stringList(80, 180),
    nonblockingReasonCodes: stringList(80, 180),
    blockingLimitations: stringList(80, 900),
    nonblockingLimitations: stringList(80, 900),
    repairAction: NodeReadinessRepairActionSchema,
    nextAllowedTransitions: z.array(NodeReadinessTransitionSchema).max(16).default([]),
    nextLegalTransitions: z.array(NodeReadinessTransitionSchema).max(16).default([]),
    replayBoundary: z.string().trim().max(160).nullable().default(null),
    createdAt: z.string().trim().max(80).nullable().default(null),
    updatedAt: z.string().trim().max(80).nullable().default(null),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type NodeReadinessState = z.infer<typeof NodeReadinessStateSchema>;

export const NodeExecutionPacketSchema = z
  .object({
    packetKind: z.literal("node_execution_packet"),
    schemaVersion: z.literal("execution-platform.node-execution-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(300),
    workflowId: boundedString(180),
    runtimeJobId: boundedString(180),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    nodeKind: boundedString(120),
    capabilityId: boundedString(180),
    executorKey: boundedString(240),
    workerRef: boundedString(240),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    targetCommitmentIds: stringList(24, 180),
    sourcePacketRefs: stringList(60, 300),
    sourceContextRefs: stringList(80, 300),
    resourcePacketKind: boundedString(120),
    resourcePacketRef: boundedString(300),
    readinessStatus: NodeReadinessStatusSchema,
    readinessReasonCodes: stringList(60, 180),
    blockingLimitations: stringList(40, 700),
    nonblockingLimitations: stringList(40, 700),
    validationRefs: stringList(40, 300),
    evidenceClaimExpectations: stringList(32, 700),
    authorityScope: stringList(40, 300),
    storagePolicy: z
      .object({
        boundedRefsOnly: z.literal(true),
        rawPromptStored: z.literal(false),
        rawResponseStored: z.literal(false),
        rawProviderLogStored: z.literal(false),
        rawToolLogStored: z.literal(false),
        rawCommandLogStored: z.literal(false),
        rawDbRowsStored: z.literal(false),
        secretsStored: z.literal(false),
      })
      .strict(),
    budgetPolicy: z
      .object({
        budgetPolicyRefs: stringList(16, 300),
        timeoutMs: z.number().int().min(0).nullable().default(null),
        maxInputTokens: z.number().int().min(0).nullable().default(null),
        maxOutputTokens: z.number().int().min(0).nullable().default(null),
      })
      .strict(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type NodeExecutionPacket = z.infer<typeof NodeExecutionPacketSchema>;

export const CodingResourcePacketSchema = z
  .object({
    packetKind: z.literal("coding_resource_packet"),
    schemaVersion: z.literal("execution-platform.coding-resource-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(300),
    implementationTaskPacketRef: boundedString(300),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    targetFileRefs: stringList(80, 300),
    targetFileSnapshotRefs: stringList(80, 300),
    targetFileSnapshotHashes: stringList(80, 140),
    allowedEditScope: stringList(100, 300),
    mustReadRefs: stringList(100, 300),
    likelyModifyRefs: stringList(100, 300),
    deniedFileRefs: stringList(80, 300),
    newFileIntentRefs: stringList(40, 300),
    fileChangeIntentRefs: stringList(80, 300),
    contextPacketRefs: stringList(80, 300),
    acceptedContextHandoffRefs: stringList(80, 300),
    validationRefs: stringList(40, 300),
    validationDiscoveryPlan: stringList(24, 700),
    acceptanceCriteria: stringList(32, 700),
    expectedPatchShape: boundedString(1_200),
    stopIfMissingOrEscalate: stringList(24, 700),
    targetCommitmentIds: stringList(24, 180),
    readableTargetSnapshotCount: z.number().int().min(0).max(1_000),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type CodingResourcePacket = z.infer<typeof CodingResourcePacketSchema>;

export const ReadOnlyResourcePacketSchema = z
  .object({
    packetKind: z.literal("read_only_resource_packet"),
    schemaVersion: z.literal("execution-platform.read-only-resource-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(300),
    executionIntent: ExecutionIntentSchema.default("source_grounding"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default(["read_only_evidence"]),
    sourceRefs: stringList(100, 300),
    boundedSnapshotRefs: stringList(100, 300),
    contextPacketRefs: stringList(80, 300),
    acceptedContextHandoffRefs: stringList(80, 300),
    validationRefs: stringList(40, 300),
    validationDiscoveryPlan: stringList(24, 700),
    targetCommitmentIds: stringList(24, 180),
    evidenceClaimExpectations: stringList(32, 700),
    authorityScope: stringList(40, 300),
    stopIfMissingOrEscalate: stringList(24, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ReadOnlyResourcePacket = z.infer<typeof ReadOnlyResourcePacketSchema>;
export type DomainResourcePacket = CodingResourcePacket | ReadOnlyResourcePacket;

export type NodeExecutionPacketValidation = {
  valid: boolean;
  status: NodeReadinessStatus;
  reasonCodes: string[];
  blockingLimitations: string[];
  nonblockingLimitations: string[];
  state: NodeReadinessState;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type WorkerInvocationReadinessGate = {
  allowed: boolean;
  status: NodeReadinessStatus;
  reasonCodes: string[];
  blockingLimitations: string[];
  nonblockingLimitations: string[];
  nodeExecutionPacketRef: string | null;
  resourcePacketKind: string | null;
  resourcePacketRef: string | null;
  nodeReadinessState: NodeReadinessState | null;
  readiness: NodeExecutionPacketValidation | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export function buildCodingResourcePacketFromImplementationTaskPacket(
  packet: ImplementationTaskPacket,
): CodingResourcePacket {
  const snapshotRefs = packet.targetFileSnapshots.map((snapshot) => snapshot.snapshotRef);
  const snapshotHashes = packet.targetFileSnapshots.map((snapshot) => snapshot.contentHash);
  const intentRefs = packet.newFileIntents.map(
    (intent) => `new-file-intent://${intent.fileRef}/${hashValue(intent).slice(0, 12)}`,
  );
  const fileChangeIntentRefs = packet.fileChangeIntents.map(
    (intent) => `file-change-intent://${intent.fileRef}/${hashValue(intent).slice(0, 12)}`,
  );
  const body = {
    packetKind: "coding_resource_packet" as const,
    schemaVersion: "execution-platform.coding-resource-packet.v1" as const,
    packetId: packet.packetId,
    packetRef: "pending",
    implementationTaskPacketRef: packet.packetRef,
    executionIntent: packet.executionIntent,
    evidenceMode: packet.evidenceMode,
    targetFileRefs: unique(packet.targetFileRefs, 80, 300),
    targetFileSnapshotRefs: unique(snapshotRefs, 80, 300),
    targetFileSnapshotHashes: unique(snapshotHashes, 80, 140),
    allowedEditScope: unique(packet.allowedEditScope, 100, 300),
    mustReadRefs: unique(packet.mustReadRefs, 100, 300),
    likelyModifyRefs: unique(packet.likelyModifyRefs, 100, 300),
    deniedFileRefs: unique(packet.deniedFileRefs, 80, 300),
    newFileIntentRefs: unique(intentRefs, 40, 300),
    fileChangeIntentRefs: unique(fileChangeIntentRefs, 80, 300),
    contextPacketRefs: unique(
      [
        ...packet.contextPacketRefs,
        ...packet.sourceContextHandoffRefs,
        ...packet.contextSynthesisRefs,
        ...packet.priorNodeOutputRefs,
      ],
      80,
      300,
    ),
    acceptedContextHandoffRefs: unique(
      [...packet.sourceContextHandoffRefs, ...packet.contextSynthesisRefs],
      80,
      300,
    ),
    validationRefs: unique(packet.validationCommandRefs, 40, 300),
    validationDiscoveryPlan: unique(packet.validationDiscoveryPlan, 24, 700),
    acceptanceCriteria: unique(packet.acceptanceCriteria, 32, 700),
    expectedPatchShape: bounded(packet.expectedPatchShape, 1_200),
    stopIfMissingOrEscalate: unique(packet.stopIfMissingOrEscalate, 24, 700),
    targetCommitmentIds: unique(packet.targetCommitmentIds, 24, 180),
    readableTargetSnapshotCount: packet.targetFileSnapshots.length,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  return CodingResourcePacketSchema.parse({
    ...body,
    packetRef: `runtime-work-graph://coding-resource-packet/${body.packetId}/${hashValue(body).slice(0, 16)}`,
  });
}

export function buildReadOnlyResourcePacket(input: {
  packetId: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  sourceRefs?: string[];
  boundedSnapshotRefs?: string[];
  contextPacketRefs?: string[];
  acceptedContextHandoffRefs?: string[];
  validationRefs?: string[];
  validationDiscoveryPlan?: string[];
  targetCommitmentIds: string[];
  evidenceClaimExpectations: string[];
  authorityScope: string[];
  stopIfMissingOrEscalate?: string[];
}): ReadOnlyResourcePacket {
  const base = {
    packetKind: "read_only_resource_packet" as const,
    schemaVersion: "execution-platform.read-only-resource-packet.v1" as const,
    packetId: bounded(input.packetId, 180),
    packetRef: "pending",
    executionIntent: input.executionIntent ?? "source_grounding",
    evidenceMode: unique(input.evidenceMode ?? ["read_only_evidence"], 12, 120),
    sourceRefs: unique(input.sourceRefs ?? [], 100, 300),
    boundedSnapshotRefs: unique(input.boundedSnapshotRefs ?? [], 100, 300),
    contextPacketRefs: unique(input.contextPacketRefs ?? [], 80, 300),
    acceptedContextHandoffRefs: unique(input.acceptedContextHandoffRefs ?? [], 80, 300),
    validationRefs: unique(input.validationRefs ?? [], 40, 300),
    validationDiscoveryPlan: unique(input.validationDiscoveryPlan ?? [], 24, 700),
    targetCommitmentIds: unique(input.targetCommitmentIds, 24, 180),
    evidenceClaimExpectations: unique(input.evidenceClaimExpectations, 32, 700),
    authorityScope: unique(input.authorityScope, 40, 300),
    stopIfMissingOrEscalate: unique(input.stopIfMissingOrEscalate ?? [], 24, 700),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  return ReadOnlyResourcePacketSchema.parse({
    ...base,
    packetRef: `runtime-work-graph://read-only-resource-packet/${base.packetId}/${hashValue(base).slice(0, 16)}`,
  });
}

export function evaluateNodeReadinessState(input: {
  packet: NodeExecutionPacket;
  resourcePacket?: DomainResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  phase?: NodeReadinessPhase | null;
}): NodeReadinessState {
  const blockingReasonCodes = ["node_readiness_state_evaluated"];
  const nonblockingReasonCodes: string[] = [];
  const blockingLimitations = [...input.packet.blockingLimitations];
  const nonblockingLimitations = [...input.packet.nonblockingLimitations];
  const resource = asRecord(input.resourcePacket ?? null);
  const implementationContext = asRecord(input.implementationContextPacket ?? null);
  const rawContextLimitations = limitationEntries(implementationContext.contextLimitations);
  const contextWaivers = contextLimitationWaivers(implementationContext.contextLimitationWaivers);
  const sourceWorkUnitId =
    typeof implementationContext.sourceWorkUnitId === "string"
      ? bounded(implementationContext.sourceWorkUnitId, 180)
      : null;
  const contextLimitations = rawContextLimitations.map((entry) => {
    if (entry.blocking) {
      return entry;
    }
    return {
      limitation: entry.limitation,
      blocking: !hasContextLimitationWaiver({
        limitation: entry.limitation,
        nodeId: input.packet.nodeId,
        workUnitId: sourceWorkUnitId,
        waivers: contextWaivers,
      }),
    };
  });
  const implementationContextReadiness =
    typeof implementationContext.readinessStatus === "string"
      ? implementationContext.readinessStatus
      : null;
  const splitRequiredSatisfiedByChildTask =
    implementationContextReadiness === "split_required" &&
    isSplitChildExecutionPacket({ packet: input.packet, resourcePacket: resource });
  const implementationContextFreshness =
    typeof implementationContext.contextFreshnessStatus === "string"
      ? implementationContext.contextFreshnessStatus
      : null;
  const implementationContextRefreshAction =
    typeof implementationContext.contextRefreshAction === "string"
      ? implementationContext.contextRefreshAction
      : null;
  const contextRefreshBlocksImplementation =
    implementationContextRefreshAction === "block_implementation";
  const resourcePacketKind =
    typeof resource.packetKind === "string" ? bounded(resource.packetKind, 120) : "";
  const isCodingResourcePacket =
    input.packet.resourcePacketKind === "coding_resource_packet" &&
    resourcePacketKind === "coding_resource_packet";
  const isReadOnlyResourcePacket =
    input.packet.resourcePacketKind === "read_only_resource_packet" &&
    resourcePacketKind === "read_only_resource_packet";
  const readOnlySourceRefs = Array.isArray(resource.sourceRefs) ? resource.sourceRefs : [];
  const readOnlyBoundedSnapshotRefs = Array.isArray(resource.boundedSnapshotRefs)
    ? resource.boundedSnapshotRefs
    : [];
  const contextBlockingLimitations = [
    ...contextLimitations.filter((entry) => entry.blocking).map((entry) => entry.limitation),
    ...unique(
      Array.isArray(implementationContext.blockingLimitations)
        ? (implementationContext.blockingLimitations as Array<string | null | undefined>)
        : [],
      40,
      900,
    ),
  ];
  const contextNonblockingLimitations = [
    ...contextLimitations.filter((entry) => !entry.blocking).map((entry) => entry.limitation),
    ...unique(
      Array.isArray(implementationContext.nonblockingLimitations)
        ? (implementationContext.nonblockingLimitations as Array<string | null | undefined>)
        : [],
      40,
      900,
    ),
  ];
  if (!input.packet.resourcePacketRef.trim()) {
    blockingReasonCodes.push("node_execution_packet_resource_packet_ref_missing");
    blockingLimitations.push("Resource packet ref is missing.");
  }
  if (!resourcePacketKind) {
    blockingReasonCodes.push("node_execution_packet_resource_packet_body_missing");
    blockingLimitations.push(
      "NodeExecutionPacket requires a hydrated domain resource packet body.",
    );
  } else if (resourcePacketKind !== input.packet.resourcePacketKind) {
    blockingReasonCodes.push("node_execution_packet_resource_packet_kind_mismatch");
    blockingLimitations.push(
      "Hydrated domain resource packet kind does not match the NodeExecutionPacket resourcePacketKind.",
    );
  }
  if (input.packet.targetCommitmentIds.length === 0) {
    blockingReasonCodes.push("node_execution_packet_commitment_mapping_missing");
    blockingLimitations.push("No target commitment ids are mapped to this node.");
  }
  if (input.packet.evidenceClaimExpectations.length === 0) {
    blockingReasonCodes.push("node_execution_packet_evidence_expectations_missing");
    blockingLimitations.push("Node has no evidence claim expectations.");
  }
  if (input.packet.executionIntent === "unspecified") {
    blockingReasonCodes.push("node_execution_packet_execution_intent_missing");
    blockingLimitations.push("Node execution packet is missing explicit execution intent.");
  }
  if (input.packet.nodeKind === "implementation") {
    if (input.packet.executionIntent !== "source_edit") {
      blockingReasonCodes.push("node_execution_packet_implementation_requires_source_edit_intent");
      blockingLimitations.push(
        "Implementation file-edit workers require executionIntent source_edit.",
      );
    }
    if (!input.packet.evidenceMode.includes("changed_file_evidence")) {
      blockingReasonCodes.push("node_execution_packet_changed_file_evidence_mode_missing");
      blockingLimitations.push(
        "Implementation file-edit workers require changed_file_evidence mode.",
      );
    }
  }
  if (contextBlockingLimitations.length > 0) {
    blockingReasonCodes.push("node_readiness_context_has_blocking_limitations");
    if (rawContextLimitations.some((entry) => !entry.blocking)) {
      blockingReasonCodes.push("node_readiness_context_limitation_waiver_missing");
    }
    blockingLimitations.push(...contextBlockingLimitations);
  }
  if (contextNonblockingLimitations.length > 0) {
    nonblockingReasonCodes.push("node_readiness_context_has_nonblocking_limitations");
    nonblockingLimitations.push(...contextNonblockingLimitations);
  }
  if (implementationContextReadiness === "split_required" && !splitRequiredSatisfiedByChildTask) {
    blockingReasonCodes.push("node_readiness_implementation_context_split_required");
    blockingLimitations.push(
      "Implementation context requires split child tasks before worker invocation.",
    );
  }
  if (contextRefreshBlocksImplementation) {
    blockingReasonCodes.push("node_readiness_implementation_context_blocks_implementation");
    blockingLimitations.push(
      "Implementation context requires upstream repair before worker invocation.",
    );
  }
  if (splitRequiredSatisfiedByChildTask) {
    nonblockingReasonCodes.push("node_readiness_split_required_parent_satisfied_by_child_task");
    nonblockingLimitations.push(
      "Parent implementation context required splitting; this child task already has a materialized execution packet.",
    );
  }
  if (isCodingResourcePacket) {
    const targetFileRefs = Array.isArray(resource.targetFileRefs) ? resource.targetFileRefs : [];
    const targetFileSnapshotRefs = Array.isArray(resource.targetFileSnapshotRefs)
      ? resource.targetFileSnapshotRefs
      : [];
    const newFileIntentRefs = Array.isArray(resource.newFileIntentRefs)
      ? resource.newFileIntentRefs
      : [];
    const validationRefs = Array.isArray(resource.validationRefs) ? resource.validationRefs : [];
    const validationDiscoveryPlan = Array.isArray(resource.validationDiscoveryPlan)
      ? resource.validationDiscoveryPlan
      : [];
    if (targetFileRefs.length === 0) {
      blockingReasonCodes.push("node_execution_packet_coding_target_refs_missing");
      blockingLimitations.push("Coding resource packet has no target file refs.");
    }
    if (targetFileSnapshotRefs.length === 0 && newFileIntentRefs.length === 0) {
      blockingReasonCodes.push(
        "node_execution_packet_coding_snapshots_or_new_file_intents_missing",
      );
      blockingLimitations.push(
        "Coding resource packet has neither target snapshots nor new-file intents.",
      );
    }
    if (validationRefs.length === 0 && validationDiscoveryPlan.length === 0) {
      blockingReasonCodes.push("node_execution_packet_validation_plan_missing");
      blockingLimitations.push("No validation refs or validation discovery plan are available.");
    }
  }
  if (isReadOnlyResourcePacket) {
    const readOnlyContextPacketRefs = Array.isArray(resource.contextPacketRefs)
      ? resource.contextPacketRefs
      : [];
    const readOnlyAcceptedContextHandoffRefs = Array.isArray(resource.acceptedContextHandoffRefs)
      ? resource.acceptedContextHandoffRefs
      : [];
    if (
      readOnlySourceRefs.length === 0 &&
      readOnlyBoundedSnapshotRefs.length === 0 &&
      readOnlyContextPacketRefs.length === 0 &&
      readOnlyAcceptedContextHandoffRefs.length === 0 &&
      input.packet.sourceContextRefs.length === 0
    ) {
      blockingReasonCodes.push("node_execution_packet_read_only_resource_refs_missing");
      blockingLimitations.push(
        "Read-only resource packet has no source, snapshot, or context refs.",
      );
    }
    if (input.packet.evidenceMode.includes("changed_file_evidence")) {
      blockingReasonCodes.push("node_execution_packet_read_only_changed_file_evidence_conflict");
      blockingLimitations.push(
        "Read-only resource packets cannot carry changed_file_evidence mode.",
      );
    }
  }
  if (
    input.packet.rawPromptStored ||
    input.packet.rawResponseStored ||
    input.packet.rawProviderLogStored ||
    input.packet.rawToolLogStored
  ) {
    blockingReasonCodes.push("node_execution_packet_raw_storage_flag_invalid");
    blockingLimitations.push("NodeExecutionPacket attempted to store raw model or tool content.");
  }
  if (
    input.packet.storagePolicy.rawPromptStored ||
    input.packet.storagePolicy.rawResponseStored ||
    input.packet.storagePolicy.rawProviderLogStored ||
    input.packet.storagePolicy.rawToolLogStored ||
    input.packet.storagePolicy.rawCommandLogStored ||
    input.packet.storagePolicy.rawDbRowsStored ||
    input.packet.storagePolicy.secretsStored
  ) {
    blockingReasonCodes.push("node_readiness_storage_policy_invalid");
    blockingLimitations.push(
      "Node storage policy attempted to retain raw prompts, responses, logs, DB rows, or secrets.",
    );
  }
  if (input.packet.authorityScope.length === 0) {
    blockingReasonCodes.push("node_readiness_authority_scope_missing");
    blockingLimitations.push("Node authority/edit scope is missing.");
  }
  const targetFileSnapshotRefs = Array.isArray(resource.targetFileSnapshotRefs)
    ? resource.targetFileSnapshotRefs
    : [];
  const newFileIntentRefs = Array.isArray(resource.newFileIntentRefs)
    ? resource.newFileIntentRefs
    : [];
  const contextPacketRefs = Array.isArray(resource.contextPacketRefs)
    ? resource.contextPacketRefs
    : [];
  const acceptedContextHandoffRefs = Array.isArray(resource.acceptedContextHandoffRefs)
    ? resource.acceptedContextHandoffRefs
    : [];
  const validationRefs = Array.isArray(resource.validationRefs) ? resource.validationRefs : [];
  const validationDiscoveryPlan = Array.isArray(resource.validationDiscoveryPlan)
    ? resource.validationDiscoveryPlan
    : [];
  const resourceHasReadOnlyContextSignal =
    isReadOnlyResourcePacket &&
    (readOnlySourceRefs.length > 0 ||
      readOnlyBoundedSnapshotRefs.length > 0 ||
      contextPacketRefs.length > 0 ||
      acceptedContextHandoffRefs.length > 0);
  const freshnessStatus: NodeReadinessSubStatus =
    implementationContextFreshness === "fresh"
      ? "fresh"
      : implementationContextFreshness === "stale"
        ? "stale"
        : implementationContextFreshness === "missing"
          ? "missing"
          : implementationContextFreshness === "rejected"
            ? "blocked"
            : acceptedContextHandoffRefs.length > 0 ||
                input.packet.sourceContextRefs.length > 0 ||
                resourceHasReadOnlyContextSignal
              ? "accepted"
              : "missing";
  const snapshotStatus: NodeReadinessSubStatus = isCodingResourcePacket
    ? targetFileSnapshotRefs.length > 0 || newFileIntentRefs.length > 0
      ? "ready"
      : "missing"
    : isReadOnlyResourcePacket
      ? readOnlyBoundedSnapshotRefs.length > 0
        ? "ready"
        : "not_applicable"
      : "missing";
  const contextStatus: NodeReadinessSubStatus =
    contextBlockingLimitations.length > 0 || contextRefreshBlocksImplementation
      ? "blocked"
      : implementationContextReadiness === "split_required" && !splitRequiredSatisfiedByChildTask
        ? "blocked"
        : contextNonblockingLimitations.length > 0 ||
            implementationContextReadiness === "ready_with_limitations" ||
            splitRequiredSatisfiedByChildTask
          ? "accepted_with_limitations"
          : implementationContextReadiness &&
              !["ready_as_single_task", "split_required"].includes(implementationContextReadiness)
            ? "blocked"
            : acceptedContextHandoffRefs.length > 0 ||
                input.packet.sourceContextRefs.length > 0 ||
                resourceHasReadOnlyContextSignal
              ? "accepted"
              : "missing";
  const validationStatus: NodeReadinessSubStatus =
    input.packet.evidenceMode.includes("validation_evidence") || isCodingResourcePacket
      ? validationRefs.length > 0 || validationDiscoveryPlan.length > 0
        ? "ready"
        : input.packet.validationRefs.length > 0
          ? "ready"
          : "missing"
      : "not_applicable";
  const authorityStatus: NodeReadinessSubStatus =
    input.packet.authorityScope.length > 0 ? "ready" : "missing";
  const evidenceStatus: NodeReadinessSubStatus =
    input.packet.evidenceClaimExpectations.length > 0 ? "ready" : "missing";
  const executionIntentOrEvidenceModeBlocked = blockingReasonCodes.some(
    (reasonCode) =>
      reasonCode === "node_execution_packet_execution_intent_missing" ||
      reasonCode === "node_execution_packet_implementation_requires_source_edit_intent" ||
      reasonCode === "node_execution_packet_changed_file_evidence_mode_missing",
  );
  if (freshnessStatus === "fresh" && isCodingResourcePacket && snapshotStatus === "missing") {
    blockingReasonCodes.push("node_readiness_context_fresh_but_snapshot_missing");
    blockingLimitations.push(
      "Context freshness cannot imply implementation readiness; target snapshots or explicit new-file intents are missing.",
    );
  }
  if (contextStatus === "accepted_with_limitations" && contextBlockingLimitations.length > 0) {
    blockingReasonCodes.push("node_readiness_accepted_context_has_blocking_limitations");
  }
  if (
    isCodingResourcePacket &&
    contextStatus === "missing" &&
    contextPacketRefs.length > 0 &&
    acceptedContextHandoffRefs.length === 0 &&
    input.packet.sourceContextRefs.length === 0
  ) {
    blockingReasonCodes.push("node_readiness_context_packet_refs_not_accepted_handoffs");
    blockingLimitations.push(
      "Context packet refs are present, but none are accepted context handoff or synthesis refs for this execution node.",
    );
  }
  if (isCodingResourcePacket && snapshotStatus === "ready" && validationStatus === "missing") {
    blockingReasonCodes.push("node_readiness_snapshots_without_validation_plan");
    blockingLimitations.push(
      "Target snapshots cannot imply validation readiness; validation refs or a discovery plan are missing.",
    );
  }
  if (evidenceStatus === "missing") {
    blockingReasonCodes.push("node_readiness_evidence_expectations_missing");
  }
  const uniqueBlocking = unique(blockingLimitations, 40, 700);
  const status: NodeReadinessStatus =
    uniqueBlocking.length > 0
      ? "blocked"
      : nonblockingLimitations.length > 0
        ? "ready_with_limitations"
        : "ready";
  const phase: NodeReadinessPhase =
    input.phase ??
    (status === "ready" || status === "ready_with_limitations"
      ? "implementation_ready"
      : snapshotStatus === "missing" || !input.packet.resourcePacketRef.trim()
        ? "resource_materialization"
        : contextStatus === "missing" || contextStatus === "blocked"
          ? "context_supply"
          : "resource_materialization");
  const repairAction: NodeReadinessRepairAction =
    status === "ready" || status === "ready_with_limitations"
      ? "none"
      : implementationContextReadiness === "split_required" && !splitRequiredSatisfiedByChildTask
        ? "split_work_unit"
        : contextStatus === "missing" ||
            contextStatus === "blocked" ||
            freshnessStatus === "stale" ||
            freshnessStatus === "missing"
          ? "request_context_repair"
          : snapshotStatus === "missing"
            ? "compile_resource_packet"
            : validationStatus === "missing"
              ? "compile_validation_plan"
              : authorityStatus === "missing"
                ? "repair_authority_scope"
                : evidenceStatus === "missing" || executionIntentOrEvidenceModeBlocked
                  ? "repair_evidence_expectations"
                  : "needs_operator_review";
  const nextAllowedTransitions: NodeReadinessTransition[] =
    status === "ready" || status === "ready_with_limitations"
      ? ["execute_node"]
      : repairAction === "split_work_unit"
        ? ["split_work_unit", "needs_review"]
        : repairAction === "request_context_repair"
          ? ["request_context_repair", "needs_review"]
          : repairAction === "compile_resource_packet"
            ? ["compile_node_execution_packet", "request_context_repair", "needs_review"]
            : repairAction === "compile_validation_plan"
              ? ["compile_validation_plan", "needs_review"]
              : repairAction === "repair_authority_scope"
                ? ["repair_authority_scope", "needs_review"]
                : repairAction === "repair_evidence_expectations"
                  ? ["repair_evidence_expectations", "needs_review"]
                  : ["needs_review"];
  const lifecycleState: RuntimeNodeLifecycleState =
    status === "ready" || status === "ready_with_limitations"
      ? "executable"
      : repairAction === "split_work_unit"
        ? "resources_required"
        : repairAction === "request_context_repair"
          ? contextStatus === "missing"
            ? "context_required"
            : "needs_repair"
          : repairAction === "compile_resource_packet"
            ? "resources_required"
            : "needs_repair";
  const resourceStatus: NodeReadinessSubStatus =
    status === "ready" || status === "ready_with_limitations"
      ? "ready"
      : snapshotStatus === "missing" || !input.packet.resourcePacketRef.trim()
        ? "missing"
        : "blocked";
  const contextLimitationStatus: NodeReadinessSubStatus =
    contextBlockingLimitations.length > 0
      ? "blocked"
      : contextNonblockingLimitations.length > 0
        ? "accepted_with_limitations"
        : "not_applicable";
  const body = {
    artifactKind: "node_readiness_state" as const,
    schemaVersion: "execution-platform.node-readiness-state.v1" as const,
    nodeId: input.packet.nodeId,
    runtimeJobId: input.packet.runtimeJobId,
    graphId: input.packet.graphId,
    workflowId: input.packet.workflowId,
    executionIntent: input.packet.executionIntent,
    evidenceMode: input.packet.evidenceMode,
    capabilityId: input.packet.capabilityId,
    roleClass: input.packet.nodeKind,
    readinessStatus: status,
    phase,
    lifecycleState,
    dependencyStatus: "accepted" as const,
    resourcePacketRef: input.packet.resourcePacketRef || null,
    nodeExecutionPacketRef: input.packet.packetRef,
    domainResourcePacketRef: input.packet.resourcePacketRef || null,
    resourceStatus,
    freshnessStatus,
    snapshotStatus,
    contextStatus,
    contextSnapshotRefs: unique(
      [...input.packet.sourceContextRefs, ...acceptedContextHandoffRefs],
      80,
      300,
    ),
    contextLimitationStatus,
    contextLimitationWaiverRefs: unique(
      contextWaivers.flatMap((waiver) => waiver.evidenceRefs),
      40,
      320,
    ),
    validationStatus,
    authorityStatus,
    evidenceStatus,
    payloadRefs: [],
    manifestRefs: [],
    targetCommitmentIds: input.packet.targetCommitmentIds,
    evidenceClaimRefs: [],
    validationPlanRefs: unique([...input.packet.validationRefs, ...validationRefs], 40, 300),
    blockers: uniqueBlocking,
    blockingReasonCodes: unique(blockingReasonCodes, 80, 180),
    nonblockingReasonCodes: unique(nonblockingReasonCodes, 80, 180),
    blockingLimitations: uniqueBlocking,
    nonblockingLimitations: unique(nonblockingLimitations, 40, 700),
    repairAction,
    nextAllowedTransitions,
    nextLegalTransitions: nextAllowedTransitions,
    replayBoundary: null,
    createdAt: null,
    updatedAt: null,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
  };
  return NodeReadinessStateSchema.parse({
    ...body,
    stateRef: stateRefFor(body),
  });
}

export function evaluateNodeExecutionPacketReadiness(input: {
  packet: NodeExecutionPacket;
  resourcePacket?: DomainResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  phase?: NodeReadinessPhase | null;
}): NodeExecutionPacketValidation {
  const state = evaluateNodeReadinessState(input);
  return {
    valid: state.readinessStatus === "ready" || state.readinessStatus === "ready_with_limitations",
    status: state.readinessStatus,
    reasonCodes: state.blockingReasonCodes.concat(state.nonblockingReasonCodes).slice(0, 80),
    blockingLimitations: state.blockingLimitations,
    nonblockingLimitations: state.nonblockingLimitations,
    state,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function evaluateWorkerInvocationReadinessGate(input: {
  nodeExecutionPacket: NodeExecutionPacket | null;
  resourcePacket?: CodingResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  nodeExecutionPacketRequired: boolean;
  nodeId: string;
  runtimeJobId?: string | null;
  graphId: string;
  workflowId: string;
}): WorkerInvocationReadinessGate {
  if (!input.nodeExecutionPacketRequired) {
    return {
      allowed: true,
      status: "ready",
      reasonCodes: ["node_execution_packet_not_required_for_worker_invocation"],
      blockingLimitations: [],
      nonblockingLimitations: [],
      nodeExecutionPacketRef: null,
      resourcePacketKind: null,
      resourcePacketRef: null,
      nodeReadinessState: null,
      readiness: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
  if (!input.nodeExecutionPacket) {
    const state = buildMissingNodeExecutionPacketReadinessState({
      nodeId: input.nodeId,
      runtimeJobId: input.runtimeJobId ?? null,
      graphId: input.graphId,
      workflowId: input.workflowId,
      reasonCodes: ["worker_invocation_node_execution_packet_missing"],
      limitations: [
        "Worker invocation requires a hydrated NodeExecutionPacket, not only graph metadata or manifest refs.",
      ],
    });
    return {
      allowed: false,
      status: state.readinessStatus,
      reasonCodes: state.blockingReasonCodes,
      blockingLimitations: state.blockingLimitations,
      nonblockingLimitations: state.nonblockingLimitations,
      nodeExecutionPacketRef: null,
      resourcePacketKind: null,
      resourcePacketRef: null,
      nodeReadinessState: state,
      readiness: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }

  const parsedResource =
    input.nodeExecutionPacket.resourcePacketKind === "coding_resource_packet"
      ? CodingResourcePacketSchema.safeParse(input.resourcePacket)
      : input.nodeExecutionPacket.resourcePacketKind === "read_only_resource_packet"
        ? ReadOnlyResourcePacketSchema.safeParse(input.resourcePacket)
        : {
            success:
              input.resourcePacket !== null &&
              typeof input.resourcePacket === "object" &&
              !Array.isArray(input.resourcePacket),
            data: input.resourcePacket ?? null,
            error: null,
          };
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: input.nodeExecutionPacket,
    resourcePacket: parsedResource.success ? (parsedResource.data as JsonValue) : null,
    implementationContextPacket: input.implementationContextPacket ?? null,
  });
  const resourceRecord = asRecord(parsedResource.success ? parsedResource.data : null);
  const resourcePacketRef =
    typeof resourceRecord.packetRef === "string" ? resourceRecord.packetRef : null;
  const gateReasonCodes = [...readiness.reasonCodes];
  const gateBlockingLimitations = [...readiness.blockingLimitations];
  if (!parsedResource.success) {
    const issues =
      parsedResource.error && "issues" in parsedResource.error
        ? parsedResource.error.issues
        : [{ path: [] as Array<string | number> }];
    gateReasonCodes.push(
      "worker_invocation_resource_packet_parse_failed",
      "worker_invocation_resource_packet_body_missing",
      ...issues
        .map((issue) => `resource_packet_schema:${issue.path.join(".") || "root"}`)
        .slice(0, 20),
    );
    gateBlockingLimitations.push(
      "Worker invocation requires a parseable domain resource packet body.",
    );
  }
  if (
    parsedResource.success &&
    typeof resourceRecord.packetKind === "string" &&
    resourceRecord.packetKind !== input.nodeExecutionPacket.resourcePacketKind
  ) {
    gateReasonCodes.push("worker_invocation_resource_packet_kind_mismatch");
    gateBlockingLimitations.push(
      "Hydrated resource packet kind does not match the NodeExecutionPacket resourcePacketKind.",
    );
  }
  if (
    parsedResource.success &&
    resourceRecord.packetKind !== input.nodeExecutionPacket.resourcePacketKind
  ) {
    gateReasonCodes.push("worker_invocation_resource_packet_body_missing");
    gateBlockingLimitations.push(
      "Worker invocation requires a hydrated domain resource packet body, not only a resource packet ref.",
    );
  }
  if (
    parsedResource.success &&
    resourcePacketRef &&
    resourcePacketRef !== input.nodeExecutionPacket.resourcePacketRef
  ) {
    gateReasonCodes.push("worker_invocation_resource_packet_ref_mismatch");
    gateBlockingLimitations.push(
      "Hydrated resource packet ref does not match the NodeExecutionPacket resourcePacketRef.",
    );
  }
  const blockingLimitations = unique(gateBlockingLimitations, 80, 900);
  const allowed = readiness.valid && blockingLimitations.length === 0;
  return {
    allowed,
    status: allowed ? readiness.status : "blocked",
    reasonCodes: unique(
      [
        "worker_invocation_readiness_gate_evaluated",
        ...gateReasonCodes,
        ...(allowed ? ["worker_invocation_hydrated_node_execution_packet_ready"] : []),
      ],
      100,
      180,
    ),
    blockingLimitations,
    nonblockingLimitations: readiness.nonblockingLimitations,
    nodeExecutionPacketRef: input.nodeExecutionPacket.packetRef,
    resourcePacketKind: input.nodeExecutionPacket.resourcePacketKind,
    resourcePacketRef: input.nodeExecutionPacket.resourcePacketRef,
    nodeReadinessState: readiness.state,
    readiness,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildMissingNodeExecutionPacketReadinessState(input: {
  nodeId: string;
  runtimeJobId?: string | null;
  graphId: string;
  workflowId: string;
  reasonCodes?: string[];
  limitations?: string[];
}): NodeReadinessState {
  const body = {
    artifactKind: "node_readiness_state" as const,
    schemaVersion: "execution-platform.node-readiness-state.v1" as const,
    nodeId: bounded(input.nodeId, 180),
    runtimeJobId: bounded(input.runtimeJobId || `runtime-job-unknown:${input.graphId}`, 180),
    graphId: bounded(input.graphId, 180),
    workflowId: bounded(input.workflowId, 180),
    executionIntent: "unspecified" as const,
    evidenceMode: [],
    capabilityId: null,
    roleClass: null,
    readinessStatus: "blocked" as const,
    phase: "resource_materialization" as const,
    lifecycleState: "resources_required" as const,
    dependencyStatus: "unknown" as const,
    resourcePacketRef: null,
    nodeExecutionPacketRef: null,
    domainResourcePacketRef: null,
    resourceStatus: "missing" as const,
    freshnessStatus: "unknown" as const,
    snapshotStatus: "missing" as const,
    contextStatus: "unknown" as const,
    contextSnapshotRefs: [],
    contextLimitationStatus: "unknown" as const,
    contextLimitationWaiverRefs: [],
    validationStatus: "missing" as const,
    authorityStatus: "missing" as const,
    evidenceStatus: "missing" as const,
    payloadRefs: [],
    manifestRefs: [],
    targetCommitmentIds: [],
    evidenceClaimRefs: [],
    validationPlanRefs: [],
    blockingReasonCodes: unique(
      ["node_execution_packet_missing", ...(input.reasonCodes ?? [])],
      80,
      180,
    ),
    nonblockingReasonCodes: [],
    blockingLimitations: unique(
      [
        "NodeExecutionPacket is missing.",
        "Runtime cannot prove worker-ready resources from context freshness, target refs, validation, authority, and evidence expectations.",
        ...(input.limitations ?? []),
      ],
      80,
      900,
    ),
    blockers: unique(
      [
        "NodeExecutionPacket is missing.",
        "Runtime cannot prove worker-ready resources from context freshness, target refs, validation, authority, and evidence expectations.",
        ...(input.limitations ?? []),
      ],
      80,
      900,
    ),
    nonblockingLimitations: [],
    repairAction: "compile_resource_packet" as const,
    nextAllowedTransitions: [
      "compile_node_execution_packet",
      "needs_review",
    ] satisfies NodeReadinessTransition[],
    nextLegalTransitions: [
      "compile_node_execution_packet",
      "needs_review",
    ] satisfies NodeReadinessTransition[],
    replayBoundary: null,
    createdAt: null,
    updatedAt: null,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
  };
  return NodeReadinessStateSchema.parse({
    ...body,
    stateRef: stateRefFor(body),
  });
}

export function buildNodeExecutionPacket(input: {
  workflowId: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  capabilityId: string;
  executorKey: string;
  workerRef: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  targetCommitmentIds: string[];
  sourcePacketRefs?: string[];
  sourceContextRefs?: string[];
  resourcePacketKind: string;
  resourcePacketRef: string;
  validationRefs?: string[];
  evidenceClaimExpectations?: string[];
  authorityScope?: string[];
  budgetPolicyRefs?: string[];
  timeoutMs?: number | null;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  blockingLimitations?: string[];
  nonblockingLimitations?: string[];
  resourcePacket?: DomainResourcePacket | JsonValue | null;
}): NodeExecutionPacket {
  const packetId = `${input.nodeId}:execution-packet`;
  const base = {
    packetKind: "node_execution_packet" as const,
    schemaVersion: "execution-platform.node-execution-packet.v1" as const,
    packetId,
    packetRef: "pending",
    workflowId: bounded(input.workflowId, 180),
    runtimeJobId: bounded(input.runtimeJobId, 180),
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    nodeKind: bounded(input.nodeKind, 120),
    capabilityId: bounded(input.capabilityId, 180),
    executorKey: bounded(input.executorKey, 240),
    workerRef: bounded(input.workerRef, 240),
    executionIntent: input.executionIntent ?? "unspecified",
    evidenceMode: unique(input.evidenceMode ?? [], 12, 120),
    targetCommitmentIds: unique(input.targetCommitmentIds, 24, 180),
    sourcePacketRefs: unique(input.sourcePacketRefs ?? [], 60, 300),
    sourceContextRefs: unique(input.sourceContextRefs ?? [], 80, 300),
    resourcePacketKind: bounded(input.resourcePacketKind, 120),
    resourcePacketRef: bounded(input.resourcePacketRef, 300),
    readinessStatus: "not_evaluated" as const,
    readinessReasonCodes: [],
    blockingLimitations: unique(input.blockingLimitations ?? [], 40, 700),
    nonblockingLimitations: unique(input.nonblockingLimitations ?? [], 40, 700),
    validationRefs: unique(input.validationRefs ?? [], 40, 300),
    evidenceClaimExpectations: unique(input.evidenceClaimExpectations ?? [], 32, 700),
    authorityScope: unique(input.authorityScope ?? [], 40, 300),
    storagePolicy: {
      boundedRefsOnly: true as const,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
      rawCommandLogStored: false as const,
      rawDbRowsStored: false as const,
      secretsStored: false as const,
    },
    budgetPolicy: {
      budgetPolicyRefs: unique(input.budgetPolicyRefs ?? [], 16, 300),
      timeoutMs: input.timeoutMs ?? null,
      maxInputTokens: input.maxInputTokens ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
    },
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  const parsedBase = NodeExecutionPacketSchema.parse({
    ...base,
    packetRef: `runtime-work-graph://node-execution-packet/${base.nodeId}/${hashValue(base).slice(0, 16)}`,
  });
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: parsedBase,
    resourcePacket: input.resourcePacket ?? null,
  });
  return NodeExecutionPacketSchema.parse({
    ...parsedBase,
    readinessStatus: readiness.status,
    readinessReasonCodes: readiness.reasonCodes,
    blockingLimitations: readiness.blockingLimitations,
    nonblockingLimitations: readiness.nonblockingLimitations,
  });
}

export function compileNodeExecutionPacketForImplementationTask(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind?: string;
  capabilityId: string;
  executorKey: string;
  workerRef: string;
  implementationTaskPacket: ImplementationTaskPacket;
}): {
  nodeExecutionPacket: NodeExecutionPacket;
  codingResourcePacket: CodingResourcePacket;
  implementationTaskValidation: ReturnType<typeof validateImplementationTaskPacketForWorker>;
  readiness: NodeExecutionPacketValidation;
} {
  const codingResourcePacket = buildCodingResourcePacketFromImplementationTaskPacket(
    input.implementationTaskPacket,
  );
  const implementationTaskValidation = validateImplementationTaskPacketForWorker(
    input.implementationTaskPacket,
  );
  const nodeExecutionPacket = buildNodeExecutionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind ?? "implementation",
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    executionIntent: input.implementationTaskPacket.executionIntent,
    evidenceMode: input.implementationTaskPacket.evidenceMode,
    targetCommitmentIds: input.implementationTaskPacket.targetCommitmentIds,
    sourcePacketRefs: [
      input.implementationTaskPacket.packetRef,
      ...input.implementationTaskPacket.sourceCommitmentPacketRefs,
    ],
    sourceContextRefs: [
      ...input.implementationTaskPacket.sourceContextHandoffRefs,
      ...input.implementationTaskPacket.contextSynthesisRefs,
    ],
    resourcePacketKind: codingResourcePacket.packetKind,
    resourcePacketRef: codingResourcePacket.packetRef,
    validationRefs: input.implementationTaskPacket.validationCommandRefs,
    evidenceClaimExpectations: input.implementationTaskPacket.evidenceClaimExpectations,
    authorityScope: input.implementationTaskPacket.allowedEditScope,
    budgetPolicyRefs: input.implementationTaskPacket.budgetPolicyRefs,
    blockingLimitations:
      implementationTaskValidation.status === "ready"
        ? []
        : implementationTaskValidation.reasonCodes.map(
            (code) => `ImplementationTaskPacket is not worker-ready: ${code}`,
          ),
    resourcePacket: codingResourcePacket,
  });
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: nodeExecutionPacket,
    resourcePacket: codingResourcePacket,
  });
  return {
    nodeExecutionPacket,
    codingResourcePacket,
    implementationTaskValidation,
    readiness,
  };
}

export function compileNodeExecutionPacketForReadOnlyResource(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  capabilityId: string;
  executorKey: string;
  workerRef: string;
  packetId?: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  sourceRefs?: string[];
  boundedSnapshotRefs?: string[];
  contextPacketRefs?: string[];
  acceptedContextHandoffRefs?: string[];
  validationRefs?: string[];
  validationDiscoveryPlan?: string[];
  targetCommitmentIds: string[];
  evidenceClaimExpectations: string[];
  authorityScope: string[];
  stopIfMissingOrEscalate?: string[];
}): {
  nodeExecutionPacket: NodeExecutionPacket;
  readOnlyResourcePacket: ReadOnlyResourcePacket;
  readiness: NodeExecutionPacketValidation;
} {
  const readOnlyResourcePacket = buildReadOnlyResourcePacket({
    packetId: input.packetId ?? `${input.nodeId}:read-only-resource`,
    executionIntent: input.executionIntent ?? "source_grounding",
    evidenceMode: input.evidenceMode ?? ["read_only_evidence"],
    sourceRefs: input.sourceRefs,
    boundedSnapshotRefs: input.boundedSnapshotRefs,
    contextPacketRefs: input.contextPacketRefs,
    acceptedContextHandoffRefs: input.acceptedContextHandoffRefs,
    validationRefs: input.validationRefs,
    validationDiscoveryPlan: input.validationDiscoveryPlan,
    targetCommitmentIds: input.targetCommitmentIds,
    evidenceClaimExpectations: input.evidenceClaimExpectations,
    authorityScope: input.authorityScope,
    stopIfMissingOrEscalate: input.stopIfMissingOrEscalate,
  });
  const nodeExecutionPacket = buildNodeExecutionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    executionIntent: readOnlyResourcePacket.executionIntent,
    evidenceMode: readOnlyResourcePacket.evidenceMode,
    targetCommitmentIds: readOnlyResourcePacket.targetCommitmentIds,
    sourcePacketRefs: readOnlyResourcePacket.sourceRefs,
    sourceContextRefs: [
      ...readOnlyResourcePacket.contextPacketRefs,
      ...readOnlyResourcePacket.acceptedContextHandoffRefs,
    ],
    resourcePacketKind: readOnlyResourcePacket.packetKind,
    resourcePacketRef: readOnlyResourcePacket.packetRef,
    validationRefs: readOnlyResourcePacket.validationRefs,
    evidenceClaimExpectations: readOnlyResourcePacket.evidenceClaimExpectations,
    authorityScope: readOnlyResourcePacket.authorityScope,
    blockingLimitations: [],
    resourcePacket: readOnlyResourcePacket,
  });
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: nodeExecutionPacket,
    resourcePacket: readOnlyResourcePacket,
  });
  return { nodeExecutionPacket, readOnlyResourcePacket, readiness };
}

export function summarizeNodeExecutionPacketForReadback(packet: NodeExecutionPacket): JsonValue {
  return {
    nodeExecutionPacketRef: packet.packetRef,
    nodeExecutionPacketStatus: packet.readinessStatus,
    nodeId: packet.nodeId,
    nodeKind: packet.nodeKind,
    capabilityId: packet.capabilityId,
    executorKey: packet.executorKey,
    workerRef: packet.workerRef,
    executionIntent: packet.executionIntent,
    evidenceMode: packet.evidenceMode,
    resourcePacketKind: packet.resourcePacketKind,
    resourcePacketRef: packet.resourcePacketRef,
    targetCommitmentIds: packet.targetCommitmentIds,
    validationRefs: packet.validationRefs,
    authorityScope: packet.authorityScope.slice(0, 20),
    readinessReasonCodes: packet.readinessReasonCodes,
    blockingLimitations: packet.blockingLimitations,
    nonblockingLimitations: packet.nonblockingLimitations,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function compileNodeResourceMaterializationToolOutput(input: {
  toolId: string;
  volatileInput: unknown;
  metadata?: JsonValue | null;
}): {
  status: "succeeded" | "needs_review";
  outputRef: string;
  outputHash: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata: JsonValue;
} {
  const metadata = asRecord(input.metadata ?? null);
  const volatile = asRecord(input.volatileInput);
  const nodeExecutionPacket = asRecord(
    volatile.nodeExecutionPacket ?? metadata.nodeExecutionPacket,
  );
  const resourcePacket = asRecord(volatile.resourcePacket ?? metadata.resourcePacket);
  const reasonCodes = [`${input.toolId.replaceAll(".", "_")}_recorded`];
  if (input.toolId === "node.evaluate_readiness" || input.toolId === "node.promote_ready_packet") {
    const parsed = NodeExecutionPacketSchema.safeParse(nodeExecutionPacket);
    if (!parsed.success) {
      return {
        status: "needs_review",
        outputRef: `runtime-tool-output://${input.toolId}/invalid-node-execution-packet`,
        outputHash: `node-resource:${input.toolId}:invalid`,
        outputSummary: "NodeExecutionPacket could not be parsed for readiness evaluation.",
        reasonCodes: [
          ...reasonCodes,
          "node_execution_packet_parse_failed",
          ...parsed.error.issues.map((issue) => `schema:${issue.path.join(".") || "root"}`),
        ].slice(0, 40),
        metadata: {
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } satisfies JsonValue,
      };
    }
    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: parsed.data,
      resourcePacket: resourcePacket as JsonValue,
    });
    const outputRef = `${parsed.data.packetRef}/readiness/${readiness.status}`;
    return {
      status: readiness.valid ? "succeeded" : "needs_review",
      outputRef,
      outputHash: `node-resource:${hashValue({ toolId: input.toolId, readiness })}`,
      outputSummary: `Node execution packet readiness is ${readiness.status}.`,
      reasonCodes: [...reasonCodes, ...readiness.reasonCodes].slice(0, 60),
      metadata: {
        nodeExecutionPacket: parsed.data as unknown as JsonValue,
        readiness,
        nodeReadinessState: readiness.state as unknown as JsonValue,
        resourcePacketKind: parsed.data.resourcePacketKind,
        resourcePacketRef: parsed.data.resourcePacketRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } satisfies JsonValue,
    };
  }
  const outputRef =
    typeof metadata.outputRef === "string"
      ? metadata.outputRef
      : `runtime-tool-output://${input.toolId}/${hashValue({ metadata, volatile }).slice(0, 16)}`;
  return {
    status: "succeeded",
    outputRef,
    outputHash: `node-resource:${input.toolId}:${hashValue({ metadata, volatile }).slice(0, 16)}`,
    outputSummary: `${input.toolId} recorded bounded node resource materialization evidence.`,
    reasonCodes,
    metadata: {
      ...metadata,
      toolInputSummary:
        typeof volatile.summary === "string" ? bounded(volatile.summary, 1_000) : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    } as JsonValue,
  };
}
