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
} from "./worker-execution-packets.ts";
import { validationPhaseRequirementsForEvidenceKinds } from "./validation-phase.ts";

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

function refsMatchingStructuralKinds(input: {
  refs: string[];
  schemes?: string[];
  pathSegments?: string[];
  max?: number;
}): string[] {
  const schemes = input.schemes ?? [];
  const pathSegments = input.pathSegments ?? [];
  return unique(
    input.refs.filter((ref) => {
      const normalized = ref.trim();
      return (
        schemes.some((scheme) => normalized.startsWith(scheme)) ||
        pathSegments.some((segment) => normalized.includes(segment))
      );
    }),
    input.max ?? 40,
    320,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stateRefFor(state: Omit<NodeReadinessState, "stateRef">): string {
  return `runtime-work-graph://node-readiness-state/${state.nodeId}/${hashValue(state).slice(0, 16)}`;
}

function contractRefFor(contract: Omit<NodeExecutionContract, "contractRef" | "contractHash">): {
  contractRef: string;
  contractHash: string;
} {
  const hashable = { ...contract, contractRef: "pending", contractHash: "pending" };
  const contractHash = hashValue(hashable);
  return {
    contractRef: `runtime-work-graph://node-execution-contract/${contract.nodeId}/${contractHash.slice(0, 16)}`,
    contractHash,
  };
}

function contractManifestByteCount(contract: NodeExecutionContract): number {
  return Buffer.byteLength(JSON.stringify(contract), "utf8");
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
  "resource_demand",
  "resource_materialization",
  "partial_context_allowed",
  "resource_window_required",
  "resource_demand_open",
  "resource_ledger_ready",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "domain_action_gate_blocked",
  "implementation_ready",
  "worker_action_ready",
  "post_action_validation_required",
  "evidence_required",
  "executing",
  "validation_ready",
  "closeout_ready",
]);

export type NodeReadinessPhase = z.infer<typeof NodeReadinessPhaseSchema>;

export const RuntimeNodeLifecycleStateSchema = z.enum([
  "work_intent",
  "resource_required",
  "resource_in_progress",
  "resource_ready",
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
  "open_node_resource_demand",
  "select_concrete_target_files",
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
  "open_node_resource_demand",
  "append_resource_ledger",
  "select_concrete_target_files",
  "select_target_resources",
  "compile_node_execution_packet",
  "compile_validation_plan",
  "evaluate_action_gate",
  "promote_worker_action_ready",
  "repair_authority_scope",
  "repair_evidence_expectations",
  "split_work_unit",
  "execute_node",
  "run_post_action_validation",
  "run_validation",
  "claim_evidence",
  "closeout",
  "needs_review",
]);

export type NodeReadinessTransition = z.infer<typeof NodeReadinessTransitionSchema>;

export const ProgressiveNodeExecutionPacketStateSchema = z.enum([
  "partial_context_allowed",
  "resource_window_required",
  "resource_demand_open",
  "resource_ledger_ready",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "domain_action_gate_blocked",
  "worker_action_ready",
  "post_action_validation_required",
  "evidence_required",
]);

export type ProgressiveNodeExecutionPacketState = z.infer<
  typeof ProgressiveNodeExecutionPacketStateSchema
>;

export const NodeExecutionActionGateStatusSchema = z.enum([
  "not_applicable",
  "blocked",
  "ready",
]);

export type NodeExecutionActionGateStatus = z.infer<
  typeof NodeExecutionActionGateStatusSchema
>;

export type ProgressiveNodeExecutionPacketReadiness = {
  progressiveState: ProgressiveNodeExecutionPacketState;
  actionGateStatus: NodeExecutionActionGateStatus;
  actionGateReasonCodes: string[];
  actionGateMissingFields: string[];
  nextLegalTransitions: NodeReadinessTransition[];
  allowedWorkerToolIds: string[];
  deniedWorkerToolIds: string[];
  nodeResourceDemandSessionRefs: string[];
  nodeResourceLedgerManifestRefs: string[];
  domainResourceSelectionRefs: string[];
  targetSnapshotRefs: string[];
  validationRefs: string[];
  evidenceExpectationCount: number;
  authorityScopeCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const CONTEXT_PHASE_WORKER_TOOL_IDS = [
  "worker.context.request_more",
  "worker.context.propose_searches",
  "worker.context.search",
  "worker.context.open_ref",
  "worker.context.open_around_match",
  "worker.context.open_window",
  "worker.context.expand_window",
  "worker.context.contract_window",
  "worker.context.accept_window",
  "worker.context.search_symbols",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.context.open_adjacent",
  "worker.context.report_pattern",
  "worker.context.report_risk",
  "worker.context.report_edit_point",
  "worker.context.finish_context_turn",
  "worker.context.mark_unanswerable",
  "worker.context.provide_bounded_snapshot",
  "worker.context.deny_request",
  "worker.repo.search",
  "worker.repo.read_files",
  "worker.repo.inspect_tests",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const DOMAIN_RESOURCE_SELECTION_PHASE_WORKER_TOOL_IDS = [
  ...CONTEXT_PHASE_WORKER_TOOL_IDS,
  "worker.edit.plan",
];

const WRITE_READY_WORKER_TOOL_IDS = [
  ...DOMAIN_RESOURCE_SELECTION_PHASE_WORKER_TOOL_IDS,
  "coding.inspect_edit_validate",
  "coding.add_test_and_validate",
  "coding.update_docs_and_cross_refs",
  "coding.refactor_symbol_with_lsp",
  "coding.fix_type_errors",
  "coding.apply_small_patch_with_evidence",
  "worker.edit.apply_patch",
  "worker.edit.apply_from_plan",
  "worker.edit.draft_from_snapshot",
  "worker.patch.force_author_from_plan",
  "worker.patch.author_edit",
  "worker.validation.run",
  "worker.validation.run_structural_default",
  "worker.validation.get_failure_context",
  "worker.validation.explain_failure",
  "worker.validation.classify_failure",
  "worker.repair.author_edit",
  "worker.repair.request_high_capability_escalation",
  "worker.evidence.claim",
  "worker.evidence.claim_commitment_progress",
  "worker.evidence.claim_from_validation",
  "worker.evidence.link_validation",
  "worker.review.add_issue",
  "worker.review.approve_or_request_changes",
];

const WRITE_PHASE_DENIED_WORKER_TOOL_IDS = WRITE_READY_WORKER_TOOL_IDS.filter(
  (toolId) => !DOMAIN_RESOURCE_SELECTION_PHASE_WORKER_TOOL_IDS.includes(toolId),
);

export const NODE_EXECUTION_CONTRACT_SCHEMA_VERSION =
  "execution-platform.node-execution-contract.v1" as const;

const NodeExecutionStoragePolicySchema = z
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
  .strict();

export const NodeExecutionContractSchema = z
  .object({
    contractKind: z.literal("node_execution_contract"),
    schemaVersion: z.literal(NODE_EXECUTION_CONTRACT_SCHEMA_VERSION),
    contractId: boundedString(180),
    contractRef: boundedString(320),
    contractHash: boundedString(140),
    workflowId: boundedString(180),
    runtimeJobId: boundedString(180),
    graphId: boundedString(180),
    branchId: z.string().trim().max(180).nullable().default(null),
    nodeId: boundedString(180),
    nodeKind: boundedString(120),
    workIntentRef: z.string().trim().max(320).nullable().default(null),
    sourceCommitmentIds: stringList(40, 180),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    capabilityId: boundedString(180),
    capabilityVersion: z.string().trim().max(120).nullable().default(null),
    executorKey: boundedString(240),
    workerRef: boundedString(240),
    roleClass: boundedString(120),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    expectedEvidenceClaimKinds: stringList(32, 180),
    evidenceClaimExpectations: stringList(32, 700),
    resourceRequirementRefs: stringList(120, 320),
    targetResourceSubsetRefs: stringList(120, 320),
    domainResourcePacketKind: boundedString(120),
    domainResourcePacketRef: z.string().trim().max(320).nullable().default(null),
    nodeExecutionPacketRequired: z.literal(true),
    validationRefs: stringList(40, 320),
    validationPhaseRequirements: stringList(40, 700),
    authorityScope: stringList(80, 320),
    allowedPathRefs: stringList(120, 320),
    deniedPathRefs: stringList(80, 320),
    toolFamilyRefs: stringList(40, 180),
    approvalRequirementRefs: stringList(40, 320),
    stopConditions: stringList(40, 700),
    repairTransitions: z.array(NodeReadinessTransitionSchema).max(16).default([]),
    nextLegalTransitions: z.array(NodeReadinessTransitionSchema).max(16).default([]),
    dependencyRefs: stringList(80, 320),
    consumerRefs: stringList(80, 320),
    parentContractRef: z.string().trim().max(320).nullable().default(null),
    childOverrideRef: z.string().trim().max(320).nullable().default(null),
    contractOverrideRefs: stringList(40, 320),
    storagePolicy: NodeExecutionStoragePolicySchema,
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type NodeExecutionContract = z.infer<typeof NodeExecutionContractSchema>;

export const NodeExecutionContractManifestSchema = z
  .object({
    contractRef: boundedString(320),
    contractVersion: z.literal(NODE_EXECUTION_CONTRACT_SCHEMA_VERSION),
    contractHash: boundedString(140),
    byteCount: z.number().int().min(0).max(512 * 1024),
    boundedSummary: boundedString(1_000),
    workIntentRef: z.string().trim().max(320).nullable().default(null),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    capabilityId: boundedString(180),
    executorKey: boundedString(240),
    workerRef: boundedString(240),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    domainResourcePacketKind: boundedString(120),
    nodeExecutionPacketRequired: z.literal(true),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type NodeExecutionContractManifest = z.infer<
  typeof NodeExecutionContractManifestSchema
>;

export const ContractOverridePacketSchema = z
  .object({
    overrideKind: z.literal("node_execution_contract_child_override"),
    schemaVersion: z.literal("execution-platform.node-execution-contract-child-override.v1"),
    overrideId: boundedString(180),
    overrideRef: boundedString(320),
    parentContractRef: boundedString(320),
    childNodeId: boundedString(180),
    branchId: z.string().trim().max(180).nullable().default(null),
    childTaskId: z.string().trim().max(180).nullable().default(null),
    targetResourceSubsetRefs: stringList(120, 320),
    dependencyRefs: stringList(80, 320),
    lineRangeRefs: stringList(80, 320),
    childResourceRequirementRefs: stringList(120, 320),
    childValidationRefs: stringList(40, 320),
    childEvidenceClaimRefs: stringList(40, 320),
    childStopConditions: stringList(40, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type ContractOverridePacket = z.infer<typeof ContractOverridePacketSchema>;

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
    nodeExecutionContractRef: z.string().trim().max(320).nullable().default(null),
    nodeExecutionContractVersion: z
      .literal(NODE_EXECUTION_CONTRACT_SCHEMA_VERSION)
      .nullable()
      .default(null),
    nodeExecutionContractHash: z.string().trim().max(140).nullable().default(null),
    nodeExecutionPacketRef: z.string().trim().max(320).nullable().default(null),
    nodeExecutionPacketHash: z.string().trim().max(140).nullable().default(null),
    domainResourcePacketRef: z.string().trim().max(320).nullable().default(null),
    domainResourcePacketHash: z.string().trim().max(140).nullable().default(null),
    boundaryEpoch: z.string().trim().max(180).nullable().default(null),
    staleIfMismatch: z.literal(true).default(true),
    projectionStatus: z.enum(["current", "stale", "unknown"]).default("unknown"),
    projectionMismatchReasonCodes: stringList(40, 180),
    resourceStatus: NodeReadinessSubStatusSchema.default("unknown"),
    freshnessStatus: NodeReadinessSubStatusSchema,
    snapshotStatus: NodeReadinessSubStatusSchema,
    contextStatus: NodeReadinessSubStatusSchema,
    contextSnapshotRefs: stringList(80, 300),
    contextLimitationStatus: NodeReadinessSubStatusSchema.default("not_applicable"),
    contextLimitationWaiverRefs: stringList(40, 320),
    progressiveState: ProgressiveNodeExecutionPacketStateSchema.default(
      "partial_context_allowed",
    ),
    actionGateStatus: NodeExecutionActionGateStatusSchema.default("blocked"),
    actionGateReasonCodes: stringList(80, 180),
    actionGateMissingFields: stringList(40, 180),
    legalWorkerToolIds: stringList(80, 180),
    deniedWorkerToolIds: stringList(80, 180),
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
    computedAt: z.string().trim().max(80).nullable().default(null),
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
    nodeExecutionContractRef: boundedString(320),
    nodeExecutionContractVersion: z.literal(NODE_EXECUTION_CONTRACT_SCHEMA_VERSION),
    nodeExecutionContractHash: boundedString(140),
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
    progressiveState: ProgressiveNodeExecutionPacketStateSchema.default(
      "domain_action_gate_blocked",
    ),
    nodeResourceDemandSessionRefs: stringList(40, 320),
    nodeResourceLedgerManifestRefs: stringList(40, 320),
    nodeResourceLedgerEntryManifestRefs: stringList(80, 320),
    domainResourceSelectionRefs: stringList(40, 320),
    targetSnapshotRefs: stringList(80, 320),
    validationManifestRefs: stringList(40, 320),
    actionGateStatus: NodeExecutionActionGateStatusSchema.default("blocked"),
    actionGateReasonCodes: stringList(80, 180),
    actionGateMissingFields: stringList(40, 180),
    nextLegalWorkerToolIds: stringList(80, 180),
    deniedWorkerToolIds: stringList(80, 180),
    readinessStatus: NodeReadinessStatusSchema,
    readinessReasonCodes: stringList(60, 180),
    blockingLimitations: stringList(40, 700),
    nonblockingLimitations: stringList(40, 700),
    validationRefs: stringList(40, 300),
    evidenceClaimExpectations: stringList(32, 700),
    authorityScope: stringList(40, 300),
    storagePolicy: NodeExecutionStoragePolicySchema,
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
    domainResourceSelectionRefs: stringList(80, 300),
    targetFileSnapshotRefs: stringList(80, 300),
    targetFileSnapshotHashes: stringList(80, 140),
    allowedEditScope: stringList(100, 300),
    mustReadRefs: stringList(100, 300),
    likelyModifyRefs: stringList(100, 300),
    deniedFileRefs: stringList(80, 300),
    newFileIntentRefs: stringList(40, 300),
    fileChangeIntentRefs: stringList(80, 300),
    contextPacketRefs: stringList(80, 300),
    acceptedResourceHandoffRefs: stringList(80, 300),
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
    acceptedResourceHandoffRefs: stringList(80, 300),
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

export const GenericDomainResourcePacketSchema = z
  .object({
    packetKind: z.literal("generic_domain_resource_packet"),
    schemaVersion: z.literal("execution-platform.generic-domain-resource-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(300),
    domainKind: boundedString(120),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    resourceRefs: stringList(120, 300),
    boundedSnapshotRefs: stringList(120, 300),
    contextPacketRefs: stringList(80, 300),
    acceptedResourceHandoffRefs: stringList(80, 300),
    validationRefs: stringList(40, 300),
    validationDiscoveryPlan: stringList(24, 700),
    targetCommitmentIds: stringList(24, 180),
    evidenceClaimExpectations: stringList(32, 700),
    authorityScope: stringList(40, 300),
    allowedOperationRefs: stringList(40, 300),
    stopIfMissingOrEscalate: stringList(24, 700),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type GenericDomainResourcePacket = z.infer<typeof GenericDomainResourcePacketSchema>;
export type DomainResourcePacket =
  | CodingResourcePacket
  | ReadOnlyResourcePacket
  | GenericDomainResourcePacket;

function resourceStrings(resource: Record<string, unknown>, key: string, max = 80): string[] {
  const value = resource[key];
  return Array.isArray(value) ? unique(value as Array<string | null | undefined>, max, 320) : [];
}

function readableResourceWindowRefs(refs: readonly string[], max = 80): string[] {
  return unique(
    refs.filter((ref) => {
      const value = ref.trim();
      return (
        value.startsWith("file-window://") ||
        value.startsWith("resource-window://") ||
        value.includes("/file-window/") ||
        value.includes("/resource-window/")
      );
    }),
    max,
    320,
  );
}

function sourceEditPacket(input: {
  packet: NodeExecutionPacket;
  resourcePacket: Record<string, unknown>;
}): boolean {
  return (
    input.packet.executionIntent === "source_edit" ||
    input.packet.nodeKind === "implementation" ||
    input.packet.evidenceMode.includes("changed_file_evidence") ||
    input.resourcePacket.packetKind === "coding_resource_packet"
  );
}

export function projectProgressiveNodeExecutionPacketReadiness(input: {
  packet: NodeExecutionPacket;
  resourcePacket?: DomainResourcePacket | JsonValue | null;
}): ProgressiveNodeExecutionPacketReadiness {
  const resource = asRecord(input.resourcePacket ?? null);
  const nodeResourceDemandSessionRefs = unique(input.packet.nodeResourceDemandSessionRefs, 40, 320);
  const nodeResourceLedgerManifestRefs = unique(
    input.packet.nodeResourceLedgerManifestRefs,
    40,
    320,
  );
  const contextRefs = unique(
    [
      ...input.packet.sourceContextRefs,
      ...resourceStrings(resource, "contextPacketRefs", 80),
      ...resourceStrings(resource, "acceptedResourceHandoffRefs", 80),
    ],
    160,
    320,
  );
  const domainResourceSelectionRefs = unique(
    [
      ...input.packet.domainResourceSelectionRefs,
      ...resourceStrings(resource, "domainResourceSelectionRefs", 80),
    ],
    120,
    320,
  );
  const targetSnapshotRefs = unique(
    [
      ...input.packet.targetSnapshotRefs,
      ...resourceStrings(resource, "targetFileSnapshotRefs", 80),
      ...resourceStrings(resource, "newFileIntentRefs", 40),
      ...resourceStrings(resource, "boundedSnapshotRefs", 80),
    ],
    160,
    320,
  );
  const validationRefs = unique(
    [
      ...input.packet.validationRefs,
      ...input.packet.validationManifestRefs,
      ...resourceStrings(resource, "validationRefs", 40),
      ...resourceStrings(resource, "validationDiscoveryPlan", 24),
    ],
    120,
    320,
  );
  const isSourceEdit = sourceEditPacket({ packet: input.packet, resourcePacket: resource });
  const exactReadableWindowRefs = readableResourceWindowRefs([...contextRefs, ...targetSnapshotRefs]);
  const hasReadableResourceContext =
    nodeResourceLedgerManifestRefs.length > 0 || exactReadableWindowRefs.length > 0;
  const missingFields: string[] = [];
  const reasonCodes = ["node_execution_packet_progressive_readiness_projected"];
  const hasAnyContextSignal =
    nodeResourceLedgerManifestRefs.length > 0 ||
    contextRefs.length > 0 ||
    input.packet.progressiveState === "resource_ledger_ready" ||
    input.packet.progressiveState === "domain_resource_selection_required" ||
    input.packet.progressiveState === "domain_action_gate_blocked" ||
    input.packet.progressiveState === "worker_action_ready";
  const hasOpenDemand =
    nodeResourceDemandSessionRefs.length > 0 &&
    nodeResourceLedgerManifestRefs.length === 0 &&
    exactReadableWindowRefs.length === 0;
  const hasContext = isSourceEdit ? hasReadableResourceContext : hasAnyContextSignal;

  if (!hasContext) {
    missingFields.push(isSourceEdit ? "resourceWindowRefs" : "nodeResourceLedgerManifestRefs");
  }
  if (isSourceEdit && domainResourceSelectionRefs.length === 0) {
    missingFields.push("domainResourceSelectionRefs");
  }
  if (isSourceEdit && targetSnapshotRefs.length === 0) {
    missingFields.push("targetSnapshotRefs");
  }
  if (isSourceEdit && input.packet.authorityScope.length === 0) {
    missingFields.push("authorityScope");
  }
  if (isSourceEdit && validationRefs.length === 0) {
    missingFields.push("validationRefs");
  }
  if (isSourceEdit && input.packet.evidenceClaimExpectations.length === 0) {
    missingFields.push("evidenceClaimExpectations");
  }

  const state: ProgressiveNodeExecutionPacketState =
    input.packet.progressiveState === "post_action_validation_required" ||
    input.packet.progressiveState === "evidence_required" ||
    input.packet.progressiveState === "domain_resource_selection_blocked"
      ? input.packet.progressiveState
      : !hasContext
        ? hasOpenDemand
          ? "resource_demand_open"
          : isSourceEdit
            ? "resource_window_required"
            : "partial_context_allowed"
        : isSourceEdit && domainResourceSelectionRefs.length === 0
          ? "domain_resource_selection_required"
          : isSourceEdit && missingFields.some((field) => field !== "nodeResourceLedgerManifestRefs")
            ? "domain_action_gate_blocked"
            : isSourceEdit
              ? "worker_action_ready"
              : "resource_ledger_ready";

  const actionGateStatus: NodeExecutionActionGateStatus = !isSourceEdit
    ? "not_applicable"
    : state === "worker_action_ready" ||
        state === "post_action_validation_required" ||
        state === "evidence_required"
      ? "ready"
      : "blocked";
  if (actionGateStatus === "blocked") {
    reasonCodes.push(
      ...missingFields.map((field) => `node_execution_packet_action_gate_missing:${field}`),
    );
  }
  const nextLegalTransitions: NodeReadinessTransition[] =
    state === "partial_context_allowed" || state === "resource_window_required"
      ? ["open_node_resource_demand", "needs_review"]
      : state === "resource_demand_open"
        ? ["append_resource_ledger", "open_node_resource_demand", "needs_review"]
        : state === "resource_ledger_ready"
          ? ["select_target_resources", "needs_review"]
        : state === "domain_resource_selection_required"
          ? ["select_target_resources", "needs_review"]
        : state === "domain_resource_selection_blocked"
          ? ["select_target_resources", "open_node_resource_demand", "needs_review"]
        : state === "domain_action_gate_blocked"
          ? ["evaluate_action_gate", "compile_node_execution_packet", "needs_review"]
              : state === "worker_action_ready"
                ? ["execute_node", "run_post_action_validation", "needs_review"]
                : state === "post_action_validation_required"
                  ? ["run_post_action_validation", "needs_review"]
                  : ["claim_evidence", "needs_review"];
  const allowedWorkerToolIds =
    actionGateStatus === "ready"
      ? WRITE_READY_WORKER_TOOL_IDS
      : state === "domain_resource_selection_required" || state === "resource_ledger_ready"
        ? DOMAIN_RESOURCE_SELECTION_PHASE_WORKER_TOOL_IDS
        : CONTEXT_PHASE_WORKER_TOOL_IDS;
  const deniedWorkerToolIds =
    actionGateStatus === "ready" ? [] : WRITE_PHASE_DENIED_WORKER_TOOL_IDS;

  return {
    progressiveState: state,
    actionGateStatus,
    actionGateReasonCodes: unique(reasonCodes, 80, 180),
    actionGateMissingFields: unique(missingFields, 40, 180),
    nextLegalTransitions,
    allowedWorkerToolIds: unique(allowedWorkerToolIds, 80, 180),
    deniedWorkerToolIds: unique(deniedWorkerToolIds, 80, 180),
    nodeResourceDemandSessionRefs,
    nodeResourceLedgerManifestRefs,
    domainResourceSelectionRefs,
    targetSnapshotRefs,
    validationRefs,
    evidenceExpectationCount: input.packet.evidenceClaimExpectations.length,
    authorityScopeCount: input.packet.authorityScope.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildNodeExecutionContract(input: {
  workflowId: string;
  runtimeJobId: string;
  graphId: string;
  branchId?: string | null;
  nodeId: string;
  nodeKind: string;
  workIntentRef?: string | null;
  sourceCommitmentIds: string[];
  executionIntent?: ExecutionIntent;
  capabilityId: string;
  capabilityVersion?: string | null;
  executorKey: string;
  workerRef: string;
  roleClass?: string | null;
  evidenceMode?: EvidenceMode[];
  expectedEvidenceClaimKinds?: string[];
  evidenceClaimExpectations?: string[];
  resourceRequirementRefs?: string[];
  targetResourceSubsetRefs?: string[];
  domainResourcePacketKind: string;
  domainResourcePacketRef?: string | null;
  validationRefs?: string[];
  validationPhaseRequirements?: string[];
  authorityScope?: string[];
  allowedPathRefs?: string[];
  deniedPathRefs?: string[];
  toolFamilyRefs?: string[];
  approvalRequirementRefs?: string[];
  stopConditions?: string[];
  repairTransitions?: NodeReadinessTransition[];
  nextLegalTransitions?: NodeReadinessTransition[];
  dependencyRefs?: string[];
  consumerRefs?: string[];
  parentContractRef?: string | null;
  childOverrideRef?: string | null;
  contractOverrideRefs?: string[];
}): NodeExecutionContract {
  const contractId = `${bounded(input.nodeId, 180)}:execution-contract`;
  const body = {
    contractKind: "node_execution_contract" as const,
    schemaVersion: NODE_EXECUTION_CONTRACT_SCHEMA_VERSION,
    contractId,
    contractRef: "pending",
    contractHash: "pending",
    workflowId: bounded(input.workflowId, 180),
    runtimeJobId: bounded(input.runtimeJobId, 180),
    graphId: bounded(input.graphId, 180),
    branchId: input.branchId ? bounded(input.branchId, 180) : null,
    nodeId: bounded(input.nodeId, 180),
    nodeKind: bounded(input.nodeKind, 120),
    workIntentRef: input.workIntentRef ? bounded(input.workIntentRef, 320) : null,
    sourceCommitmentIds: unique(input.sourceCommitmentIds, 40, 180),
    executionIntent: input.executionIntent ?? "unspecified",
    capabilityId: bounded(input.capabilityId, 180),
    capabilityVersion: input.capabilityVersion ? bounded(input.capabilityVersion, 120) : null,
    executorKey: bounded(input.executorKey, 240),
    workerRef: bounded(input.workerRef, 240),
    roleClass: bounded(input.roleClass ?? input.nodeKind, 120),
    evidenceMode: unique(input.evidenceMode ?? [], 12, 120),
    expectedEvidenceClaimKinds: unique(input.expectedEvidenceClaimKinds ?? [], 32, 180),
    evidenceClaimExpectations: unique(input.evidenceClaimExpectations ?? [], 32, 700),
    resourceRequirementRefs: unique(input.resourceRequirementRefs ?? [], 120, 320),
    targetResourceSubsetRefs: unique(input.targetResourceSubsetRefs ?? [], 120, 320),
    domainResourcePacketKind: bounded(input.domainResourcePacketKind, 120),
    domainResourcePacketRef: input.domainResourcePacketRef
      ? bounded(input.domainResourcePacketRef, 320)
      : null,
    nodeExecutionPacketRequired: true as const,
    validationRefs: unique(input.validationRefs ?? [], 40, 320),
    validationPhaseRequirements: unique(input.validationPhaseRequirements ?? [], 40, 700),
    authorityScope: unique(input.authorityScope ?? [], 80, 320),
    allowedPathRefs: unique(input.allowedPathRefs ?? input.authorityScope ?? [], 120, 320),
    deniedPathRefs: unique(input.deniedPathRefs ?? [], 80, 320),
    toolFamilyRefs: unique(input.toolFamilyRefs ?? [], 40, 180),
    approvalRequirementRefs: unique(input.approvalRequirementRefs ?? [], 40, 320),
    stopConditions: unique(input.stopConditions ?? [], 40, 700),
    repairTransitions: unique(input.repairTransitions ?? [], 16, 180) as NodeReadinessTransition[],
    nextLegalTransitions: unique(input.nextLegalTransitions ?? ["execute_node"], 16, 180) as
      NodeReadinessTransition[],
    dependencyRefs: unique(input.dependencyRefs ?? [], 80, 320),
    consumerRefs: unique(input.consumerRefs ?? [], 80, 320),
    parentContractRef: input.parentContractRef ? bounded(input.parentContractRef, 320) : null,
    childOverrideRef: input.childOverrideRef ? bounded(input.childOverrideRef, 320) : null,
    contractOverrideRefs: unique(input.contractOverrideRefs ?? [], 40, 320),
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
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
  };
  const { contractRef: _contractRef, contractHash: _contractHash, ...bodyWithoutRefs } = body;
  void _contractRef;
  void _contractHash;
  const refs = contractRefFor(
    bodyWithoutRefs as Omit<NodeExecutionContract, "contractRef" | "contractHash">,
  );
  return NodeExecutionContractSchema.parse({ ...body, ...refs });
}

export function buildNodeExecutionContractManifest(
  contract: NodeExecutionContract,
): NodeExecutionContractManifest {
  return NodeExecutionContractManifestSchema.parse({
    contractRef: contract.contractRef,
    contractVersion: contract.schemaVersion,
    contractHash: contract.contractHash,
    byteCount: contractManifestByteCount(contract),
    boundedSummary: bounded(
      `${contract.executionIntent} via ${contract.capabilityId} on ${contract.nodeId}; resource=${contract.domainResourcePacketKind}; evidence=${contract.evidenceMode.join(",") || "none"}`,
      1_000,
    ),
    workIntentRef: contract.workIntentRef,
    executionIntent: contract.executionIntent,
    capabilityId: contract.capabilityId,
    executorKey: contract.executorKey,
    workerRef: contract.workerRef,
    evidenceMode: contract.evidenceMode,
    domainResourcePacketKind: contract.domainResourcePacketKind,
    nodeExecutionPacketRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });
}

export function summarizeNodeExecutionContractForReadback(
  contract: NodeExecutionContract,
): JsonValue {
  const manifest = buildNodeExecutionContractManifest(contract);
  return {
    nodeExecutionContractRef: manifest.contractRef,
    nodeExecutionContractVersion: manifest.contractVersion,
    nodeExecutionContractHash: manifest.contractHash,
    nodeExecutionContractByteCount: manifest.byteCount,
    nodeExecutionContractSummary: manifest.boundedSummary,
    workIntentRef: manifest.workIntentRef,
    executionIntent: manifest.executionIntent,
    capabilityId: manifest.capabilityId,
    executorKey: manifest.executorKey,
    workerRef: manifest.workerRef,
    evidenceMode: manifest.evidenceMode,
    domainResourcePacketKind: manifest.domainResourcePacketKind,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function buildContractOverridePacket(input: {
  parentContractRef: string;
  childNodeId: string;
  branchId?: string | null;
  childTaskId?: string | null;
  targetResourceSubsetRefs?: string[];
  dependencyRefs?: string[];
  lineRangeRefs?: string[];
  childResourceRequirementRefs?: string[];
  childValidationRefs?: string[];
  childEvidenceClaimRefs?: string[];
  childStopConditions?: string[];
}): ContractOverridePacket {
  const overrideId = `${bounded(input.childNodeId, 180)}:contract-override`;
  const body = {
    overrideKind: "node_execution_contract_child_override" as const,
    schemaVersion: "execution-platform.node-execution-contract-child-override.v1" as const,
    overrideId,
    overrideRef: "pending",
    parentContractRef: bounded(input.parentContractRef, 320),
    childNodeId: bounded(input.childNodeId, 180),
    branchId: input.branchId ? bounded(input.branchId, 180) : null,
    childTaskId: input.childTaskId ? bounded(input.childTaskId, 180) : null,
    targetResourceSubsetRefs: unique(input.targetResourceSubsetRefs ?? [], 120, 320),
    dependencyRefs: unique(input.dependencyRefs ?? [], 80, 320),
    lineRangeRefs: unique(input.lineRangeRefs ?? [], 80, 320),
    childResourceRequirementRefs: unique(input.childResourceRequirementRefs ?? [], 120, 320),
    childValidationRefs: unique(input.childValidationRefs ?? [], 40, 320),
    childEvidenceClaimRefs: unique(input.childEvidenceClaimRefs ?? [], 40, 320),
    childStopConditions: unique(input.childStopConditions ?? [], 40, 700),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    secretsStored: false as const,
  };
  return ContractOverridePacketSchema.parse({
    ...body,
    overrideRef: `runtime-work-graph://node-execution-contract-override/${body.childNodeId}/${hashValue(body).slice(0, 16)}`,
  });
}

export function inheritNodeExecutionContractForSplitChild(input: {
  parentContract: NodeExecutionContract;
  override: ContractOverridePacket;
}): NodeExecutionContract {
  const parent = NodeExecutionContractSchema.parse(input.parentContract);
  const override = ContractOverridePacketSchema.parse(input.override);
  if (override.parentContractRef !== parent.contractRef) {
    throw new Error("contract child override parentContractRef does not match parent contract");
  }
  return buildNodeExecutionContract({
    workflowId: parent.workflowId,
    runtimeJobId: parent.runtimeJobId,
    graphId: parent.graphId,
    branchId: override.branchId ?? parent.branchId,
    nodeId: override.childNodeId,
    nodeKind: parent.nodeKind,
    workIntentRef: parent.workIntentRef,
    sourceCommitmentIds: parent.sourceCommitmentIds,
    executionIntent: parent.executionIntent,
    capabilityId: parent.capabilityId,
    capabilityVersion: parent.capabilityVersion,
    executorKey: parent.executorKey,
    workerRef: parent.workerRef,
    roleClass: parent.roleClass,
    evidenceMode: parent.evidenceMode,
    expectedEvidenceClaimKinds: parent.expectedEvidenceClaimKinds,
    evidenceClaimExpectations: unique(
      [...parent.evidenceClaimExpectations, ...override.childEvidenceClaimRefs],
      32,
      700,
    ),
    resourceRequirementRefs: unique(
      [...parent.resourceRequirementRefs, ...override.childResourceRequirementRefs],
      120,
      320,
    ),
    targetResourceSubsetRefs:
      override.targetResourceSubsetRefs.length > 0
        ? override.targetResourceSubsetRefs
        : parent.targetResourceSubsetRefs,
    domainResourcePacketKind: parent.domainResourcePacketKind,
    domainResourcePacketRef: parent.domainResourcePacketRef,
    validationRefs: unique([...parent.validationRefs, ...override.childValidationRefs], 40, 320),
    validationPhaseRequirements: parent.validationPhaseRequirements,
    authorityScope: parent.authorityScope,
    allowedPathRefs: parent.allowedPathRefs,
    deniedPathRefs: parent.deniedPathRefs,
    toolFamilyRefs: parent.toolFamilyRefs,
    approvalRequirementRefs: parent.approvalRequirementRefs,
    stopConditions: unique([...parent.stopConditions, ...override.childStopConditions], 40, 700),
    repairTransitions: parent.repairTransitions,
    nextLegalTransitions: parent.nextLegalTransitions,
    dependencyRefs: unique([...parent.dependencyRefs, ...override.dependencyRefs], 80, 320),
    consumerRefs: parent.consumerRefs,
    parentContractRef: parent.contractRef,
    childOverrideRef: override.overrideRef,
    contractOverrideRefs: unique(
      [...parent.contractOverrideRefs, override.overrideRef],
      40,
      320,
    ),
  });
}

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

export type WorkerInvocationPacketHydrationValidation = {
  allowed: boolean;
  status: NodeReadinessStatus;
  invocationMode: "write_ready" | "partial_context" | "blocked";
  progressiveState: ProgressiveNodeExecutionPacketState | null;
  actionGateStatus: NodeExecutionActionGateStatus | null;
  allowedWorkerToolIds: string[];
  deniedWorkerToolIds: string[];
  reasonCodes: string[];
  blockingLimitations: string[];
  nonblockingLimitations: string[];
  nodeExecutionContractRef: string | null;
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
    domainResourceSelectionRefs: unique(packet.domainResourceSelectionRefs, 80, 300),
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
        ...packet.sourceResourceHandoffRefs,
        ...packet.priorNodeOutputRefs,
      ],
      80,
      300,
    ),
    acceptedResourceHandoffRefs: unique(
      packet.sourceResourceHandoffRefs,
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
  acceptedResourceHandoffRefs?: string[];
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
    acceptedResourceHandoffRefs: unique(input.acceptedResourceHandoffRefs ?? [], 80, 300),
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

export function buildGenericDomainResourcePacket(input: {
  packetId: string;
  domainKind: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  resourceRefs?: string[];
  boundedSnapshotRefs?: string[];
  contextPacketRefs?: string[];
  acceptedResourceHandoffRefs?: string[];
  validationRefs?: string[];
  validationDiscoveryPlan?: string[];
  targetCommitmentIds: string[];
  evidenceClaimExpectations: string[];
  authorityScope: string[];
  allowedOperationRefs?: string[];
  stopIfMissingOrEscalate?: string[];
}): GenericDomainResourcePacket {
  const base = {
    packetKind: "generic_domain_resource_packet" as const,
    schemaVersion: "execution-platform.generic-domain-resource-packet.v1" as const,
    packetId: bounded(input.packetId, 180),
    packetRef: "pending",
    domainKind: bounded(input.domainKind, 120),
    executionIntent: input.executionIntent ?? "unspecified",
    evidenceMode: unique(input.evidenceMode ?? [], 12, 120),
    resourceRefs: unique(input.resourceRefs ?? [], 120, 300),
    boundedSnapshotRefs: unique(input.boundedSnapshotRefs ?? [], 120, 300),
    contextPacketRefs: unique(input.contextPacketRefs ?? [], 80, 300),
    acceptedResourceHandoffRefs: unique(input.acceptedResourceHandoffRefs ?? [], 80, 300),
    validationRefs: unique(input.validationRefs ?? [], 40, 300),
    validationDiscoveryPlan: unique(input.validationDiscoveryPlan ?? [], 24, 700),
    targetCommitmentIds: unique(input.targetCommitmentIds, 24, 180),
    evidenceClaimExpectations: unique(input.evidenceClaimExpectations, 32, 700),
    authorityScope: unique(input.authorityScope, 40, 300),
    allowedOperationRefs: unique(input.allowedOperationRefs ?? [], 40, 300),
    stopIfMissingOrEscalate: unique(input.stopIfMissingOrEscalate ?? [], 24, 700),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  };
  return GenericDomainResourcePacketSchema.parse({
    ...base,
    packetRef: `runtime-work-graph://generic-domain-resource-packet/${base.domainKind}/${base.packetId}/${hashValue(base).slice(0, 16)}`,
  });
}

export function evaluateNodeReadinessState(input: {
  packet: NodeExecutionPacket;
  nodeExecutionContract?: NodeExecutionContract | JsonValue | null;
  resourcePacket?: DomainResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  phase?: NodeReadinessPhase | null;
}): NodeReadinessState {
  const blockingReasonCodes = ["node_readiness_state_evaluated"];
  const nonblockingReasonCodes: string[] = [];
  const blockingLimitations = [...input.packet.blockingLimitations];
  const nonblockingLimitations = [...input.packet.nonblockingLimitations];
  const contractParse = NodeExecutionContractSchema.safeParse(input.nodeExecutionContract);
  const contract = contractParse.success ? contractParse.data : null;
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
  const contextRefreshRequestsWorkerContext =
    implementationContextRefreshAction === "request_worker_context";
  const resourcePacketKind =
    typeof resource.packetKind === "string" ? bounded(resource.packetKind, 120) : "";
  const isCodingResourcePacket =
    input.packet.resourcePacketKind === "coding_resource_packet" &&
    resourcePacketKind === "coding_resource_packet";
  const isReadOnlyResourcePacket =
    input.packet.resourcePacketKind === "read_only_resource_packet" &&
    resourcePacketKind === "read_only_resource_packet";
  const isGenericDomainResourcePacket =
    input.packet.resourcePacketKind === "generic_domain_resource_packet" &&
    resourcePacketKind === "generic_domain_resource_packet";
  const readOnlySourceRefs = Array.isArray(resource.sourceRefs) ? resource.sourceRefs : [];
  const readOnlyBoundedSnapshotRefs = Array.isArray(resource.boundedSnapshotRefs)
    ? resource.boundedSnapshotRefs
    : [];
  const genericResourceRefs = Array.isArray(resource.resourceRefs) ? resource.resourceRefs : [];
  const genericBoundedSnapshotRefs = Array.isArray(resource.boundedSnapshotRefs)
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
  if (!input.packet.nodeExecutionContractRef.trim()) {
    blockingReasonCodes.push("node_execution_packet_contract_ref_missing");
    blockingLimitations.push("NodeExecutionPacket is missing a NodeExecutionContract ref.");
  }
  if (!input.nodeExecutionContract) {
    blockingReasonCodes.push("node_execution_contract_body_missing");
    blockingLimitations.push(
      "Worker execution requires a hydrated NodeExecutionContract body, not only graph metadata or manifest refs.",
    );
  } else if (!contractParse.success) {
    blockingReasonCodes.push(
      "node_execution_contract_parse_failed",
      ...contractParse.error.issues
        .map((issue) => `node_execution_contract_schema:${issue.path.join(".") || "root"}`)
        .slice(0, 20),
    );
    blockingLimitations.push("NodeExecutionContract body failed schema validation.");
  } else if (contract) {
    if (contract.contractRef !== input.packet.nodeExecutionContractRef) {
      blockingReasonCodes.push("node_execution_contract_ref_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract ref does not match the NodeExecutionPacket contract ref.",
      );
    }
    if (contract.contractHash !== input.packet.nodeExecutionContractHash) {
      blockingReasonCodes.push("node_execution_contract_hash_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract hash does not match the NodeExecutionPacket contract hash.",
      );
    }
    if (contract.nodeId !== input.packet.nodeId) {
      blockingReasonCodes.push("node_execution_contract_node_id_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract node id does not match the NodeExecutionPacket node id.",
      );
    }
    if (contract.nodeKind !== input.packet.nodeKind) {
      blockingReasonCodes.push("node_execution_contract_node_kind_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract node kind does not match the NodeExecutionPacket node kind.",
      );
    }
    if (contract.executionIntent !== input.packet.executionIntent) {
      blockingReasonCodes.push("node_execution_contract_execution_intent_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract execution intent does not match the NodeExecutionPacket.",
      );
    }
    if (contract.capabilityId !== input.packet.capabilityId) {
      blockingReasonCodes.push("node_execution_contract_capability_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract capability does not match the NodeExecutionPacket capability.",
      );
    }
    if (contract.executorKey !== input.packet.executorKey) {
      blockingReasonCodes.push("node_execution_contract_executor_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract executor does not match the NodeExecutionPacket executor.",
      );
    }
    if (contract.workerRef !== input.packet.workerRef) {
      blockingReasonCodes.push("node_execution_contract_worker_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract worker does not match the NodeExecutionPacket worker.",
      );
    }
    if (contract.domainResourcePacketKind !== input.packet.resourcePacketKind) {
      blockingReasonCodes.push("node_execution_contract_resource_kind_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract domain resource kind does not match the NodeExecutionPacket.",
      );
    }
    if (
      contract.domainResourcePacketRef &&
      contract.domainResourcePacketRef !== input.packet.resourcePacketRef
    ) {
      blockingReasonCodes.push("node_execution_contract_resource_ref_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract domain resource packet ref does not match the NodeExecutionPacket.",
      );
    }
    const packetEvidenceModes = new Set(input.packet.evidenceMode);
    const missingEvidenceModes = contract.evidenceMode.filter((mode) => !packetEvidenceModes.has(mode));
    const extraEvidenceModes = input.packet.evidenceMode.filter(
      (mode) => !contract.evidenceMode.includes(mode),
    );
    if (missingEvidenceModes.length > 0 || extraEvidenceModes.length > 0) {
      blockingReasonCodes.push("node_execution_contract_evidence_mode_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract evidence mode does not match the NodeExecutionPacket.",
      );
    }
    const contractCommitments = new Set(contract.sourceCommitmentIds);
    const missingCommitments = input.packet.targetCommitmentIds.filter(
      (commitmentId) => !contractCommitments.has(commitmentId),
    );
    if (missingCommitments.length > 0) {
      blockingReasonCodes.push("node_execution_contract_commitment_mapping_mismatch");
      blockingLimitations.push(
        "Hydrated NodeExecutionContract does not cover all NodeExecutionPacket target commitments.",
      );
    }
    if (
      contract.rawPromptStored ||
      contract.rawResponseStored ||
      contract.rawProviderLogStored ||
      contract.rawToolLogStored ||
      contract.rawCommandLogStored ||
      contract.rawDbRowsStored ||
      contract.secretsStored
    ) {
      blockingReasonCodes.push("node_execution_contract_raw_storage_flag_invalid");
      blockingLimitations.push(
        "NodeExecutionContract attempted to store raw prompts, responses, logs, DB rows, or secrets.",
      );
    }
  }
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
  if (contextRefreshRequestsWorkerContext) {
    nonblockingReasonCodes.push("node_readiness_implementation_context_requests_worker_context");
    nonblockingLimitations.push(
      "Implementation context requests worker-owned context discovery during execution.",
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
    const readOnlyAcceptedResourceHandoffRefs = Array.isArray(resource.acceptedResourceHandoffRefs)
      ? resource.acceptedResourceHandoffRefs
      : [];
    if (
      readOnlySourceRefs.length === 0 &&
      readOnlyBoundedSnapshotRefs.length === 0 &&
      readOnlyContextPacketRefs.length === 0 &&
      readOnlyAcceptedResourceHandoffRefs.length === 0 &&
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
  if (isGenericDomainResourcePacket) {
    const genericContextPacketRefs = Array.isArray(resource.contextPacketRefs)
      ? resource.contextPacketRefs
      : [];
    const genericAcceptedResourceHandoffRefs = Array.isArray(resource.acceptedResourceHandoffRefs)
      ? resource.acceptedResourceHandoffRefs
      : [];
    const genericAllowedOperationRefs = Array.isArray(resource.allowedOperationRefs)
      ? resource.allowedOperationRefs
      : [];
    if (
      genericResourceRefs.length === 0 &&
      genericBoundedSnapshotRefs.length === 0 &&
      genericContextPacketRefs.length === 0 &&
      genericAcceptedResourceHandoffRefs.length === 0 &&
      input.packet.sourceContextRefs.length === 0
    ) {
      blockingReasonCodes.push("node_execution_packet_generic_resource_refs_missing");
      blockingLimitations.push(
        "Generic domain resource packet has no resource, snapshot, or accepted context refs.",
      );
    }
    if (genericAllowedOperationRefs.length === 0) {
      blockingReasonCodes.push("node_execution_packet_generic_operations_missing");
      blockingLimitations.push("Generic domain resource packet has no allowed operation refs.");
    }
    if (input.packet.evidenceMode.includes("changed_file_evidence")) {
      blockingReasonCodes.push("node_execution_packet_generic_changed_file_evidence_conflict");
      blockingLimitations.push(
        "Generic domain resource packets cannot carry changed_file_evidence mode.",
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
  const acceptedResourceHandoffRefs = Array.isArray(resource.acceptedResourceHandoffRefs)
    ? resource.acceptedResourceHandoffRefs
    : [];
  const codingReadableWindowRefs = readableResourceWindowRefs([
    ...input.packet.sourceContextRefs,
    ...contextPacketRefs,
    ...acceptedResourceHandoffRefs,
    ...targetFileSnapshotRefs,
  ]);
  const codingHasReadableResourceContext =
    isCodingResourcePacket &&
    (input.packet.nodeResourceLedgerManifestRefs.length > 0 || codingReadableWindowRefs.length > 0);
  const validationRefs = Array.isArray(resource.validationRefs) ? resource.validationRefs : [];
  const validationDiscoveryPlan = Array.isArray(resource.validationDiscoveryPlan)
    ? resource.validationDiscoveryPlan
    : [];
  const resourceHasReadOnlyContextSignal =
    isReadOnlyResourcePacket &&
    (readOnlySourceRefs.length > 0 ||
      readOnlyBoundedSnapshotRefs.length > 0 ||
      contextPacketRefs.length > 0 ||
      acceptedResourceHandoffRefs.length > 0);
  const resourceHasGenericDomainSignal =
    isGenericDomainResourcePacket &&
    (genericResourceRefs.length > 0 ||
      genericBoundedSnapshotRefs.length > 0 ||
      contextPacketRefs.length > 0 ||
      acceptedResourceHandoffRefs.length > 0);
  const freshnessStatus: NodeReadinessSubStatus =
    implementationContextFreshness === "fresh"
      ? "fresh"
      : implementationContextFreshness === "stale"
        ? "stale"
        : implementationContextFreshness === "missing"
          ? "missing"
          : implementationContextFreshness === "rejected"
            ? "blocked"
            : codingHasReadableResourceContext ||
                (!isCodingResourcePacket &&
                  (acceptedResourceHandoffRefs.length > 0 ||
                    input.packet.sourceContextRefs.length > 0 ||
                    resourceHasReadOnlyContextSignal ||
                    resourceHasGenericDomainSignal))
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
      : isGenericDomainResourcePacket
        ? genericBoundedSnapshotRefs.length > 0
          ? "ready"
          : "not_applicable"
        : "missing";
  const contextStatus: NodeReadinessSubStatus =
    contextBlockingLimitations.length > 0
      ? "blocked"
      : implementationContextReadiness === "split_required" && !splitRequiredSatisfiedByChildTask
        ? "blocked"
        : contextNonblockingLimitations.length > 0 ||
            implementationContextReadiness === "ready_with_limitations" ||
            splitRequiredSatisfiedByChildTask
          ? "accepted_with_limitations"
          : isCodingResourcePacket && codingHasReadableResourceContext
            ? contextNonblockingLimitations.length > 0 ||
              implementationContextReadiness === "ready_with_limitations" ||
              splitRequiredSatisfiedByChildTask
              ? "accepted_with_limitations"
              : "accepted"
          : isCodingResourcePacket
            ? "missing"
          : implementationContextReadiness &&
              !["ready_as_single_task", "split_required"].includes(implementationContextReadiness)
            ? "blocked"
            : acceptedResourceHandoffRefs.length > 0 ||
                input.packet.sourceContextRefs.length > 0 ||
                resourceHasReadOnlyContextSignal ||
                resourceHasGenericDomainSignal
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
      reasonCode === "node_execution_packet_changed_file_evidence_mode_missing" ||
      reasonCode === "node_execution_packet_generic_changed_file_evidence_conflict",
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
    acceptedResourceHandoffRefs.length === 0 &&
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
  const progressiveForPhase = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.packet,
    resourcePacket: input.resourcePacket ?? null,
  });
  const phase: NodeReadinessPhase =
    input.phase ??
    (status === "ready" || status === "ready_with_limitations"
      ? progressiveForPhase.progressiveState === "worker_action_ready"
        ? "worker_action_ready"
        : "implementation_ready"
      : progressiveForPhase.progressiveState === "partial_context_allowed" ||
          progressiveForPhase.progressiveState === "resource_window_required" ||
          progressiveForPhase.progressiveState === "resource_demand_open" ||
          progressiveForPhase.progressiveState === "resource_ledger_ready" ||
          progressiveForPhase.progressiveState === "domain_resource_selection_required" ||
          progressiveForPhase.progressiveState === "domain_resource_selection_blocked" ||
          progressiveForPhase.progressiveState === "domain_action_gate_blocked"
        ? progressiveForPhase.progressiveState
        : snapshotStatus === "missing" || !input.packet.resourcePacketRef.trim()
          ? "resource_materialization"
          : contextStatus === "missing" || contextStatus === "blocked"
            ? "resource_demand"
            : "resource_materialization");
  const repairAction: NodeReadinessRepairAction =
    status === "ready" || status === "ready_with_limitations"
      ? "none"
      : blockingReasonCodes.some((code) =>
          code.includes("implementation_context_concrete_domain_resource_selection_required"),
        )
          ? "select_concrete_target_files"
          : implementationContextReadiness === "split_required" && !splitRequiredSatisfiedByChildTask
            ? "split_work_unit"
            : contextStatus === "missing" ||
                contextStatus === "blocked" ||
                freshnessStatus === "stale" ||
                freshnessStatus === "missing"
              ? "open_node_resource_demand"
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
      : repairAction === "select_concrete_target_files"
        ? ["select_concrete_target_files", "needs_review"]
      : repairAction === "split_work_unit"
        ? ["split_work_unit", "needs_review"]
        : repairAction === "open_node_resource_demand"
          ? ["open_node_resource_demand", "needs_review"]
          : repairAction === "compile_resource_packet"
            ? ["compile_node_execution_packet", "open_node_resource_demand", "needs_review"]
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
        : repairAction === "open_node_resource_demand"
          ? contextStatus === "missing"
            ? "resource_required"
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
  const progressiveReadiness = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.packet,
    resourcePacket: input.resourcePacket ?? null,
  });
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
    nodeExecutionContractRef: contract?.contractRef ?? input.packet.nodeExecutionContractRef,
    nodeExecutionContractVersion: contract?.schemaVersion ?? input.packet.nodeExecutionContractVersion,
    nodeExecutionContractHash: contract?.contractHash ?? input.packet.nodeExecutionContractHash,
    nodeExecutionPacketRef: input.packet.packetRef,
    nodeExecutionPacketHash: hashValue(input.packet),
    domainResourcePacketRef: input.packet.resourcePacketRef || null,
    domainResourcePacketHash: input.resourcePacket ? hashValue(input.resourcePacket) : null,
    boundaryEpoch: null,
    staleIfMismatch: true as const,
    projectionStatus: "unknown" as const,
    projectionMismatchReasonCodes: [],
    resourceStatus,
    freshnessStatus,
    snapshotStatus,
    contextStatus,
    contextSnapshotRefs: unique(
      [...input.packet.sourceContextRefs, ...acceptedResourceHandoffRefs],
      80,
      300,
    ),
    contextLimitationStatus,
    contextLimitationWaiverRefs: unique(
      contextWaivers.flatMap((waiver) => waiver.evidenceRefs),
      40,
      320,
    ),
    progressiveState: progressiveReadiness.progressiveState,
    actionGateStatus: progressiveReadiness.actionGateStatus,
    actionGateReasonCodes: progressiveReadiness.actionGateReasonCodes,
    actionGateMissingFields: progressiveReadiness.actionGateMissingFields,
    legalWorkerToolIds: progressiveReadiness.allowedWorkerToolIds,
    deniedWorkerToolIds: progressiveReadiness.deniedWorkerToolIds,
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
    computedAt: null,
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
  nodeExecutionContract?: NodeExecutionContract | JsonValue | null;
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

export function validateWorkerInvocationPacketHydration(input: {
  nodeExecutionPacket: NodeExecutionPacket | null;
  nodeExecutionContract?: NodeExecutionContract | JsonValue | null;
  resourcePacket?: CodingResourcePacket | JsonValue | null;
  implementationContextPacket?: JsonValue | null;
  nodeExecutionPacketRequired: boolean;
  allowPartialContextInvocation?: boolean;
  nodeId: string;
  runtimeJobId?: string | null;
  graphId: string;
  workflowId: string;
}): WorkerInvocationPacketHydrationValidation {
  if (!input.nodeExecutionPacketRequired) {
    return {
      allowed: true,
      status: "ready",
      invocationMode: "write_ready",
      progressiveState: null,
      actionGateStatus: null,
      allowedWorkerToolIds: WRITE_READY_WORKER_TOOL_IDS,
      deniedWorkerToolIds: [],
      reasonCodes: ["node_execution_packet_not_required_for_worker_invocation"],
      blockingLimitations: [],
      nonblockingLimitations: [],
      nodeExecutionContractRef: null,
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
      invocationMode: "blocked",
      progressiveState: null,
      actionGateStatus: null,
      allowedWorkerToolIds: [],
      deniedWorkerToolIds: WRITE_READY_WORKER_TOOL_IDS,
      reasonCodes: state.blockingReasonCodes,
      blockingLimitations: state.blockingLimitations,
      nonblockingLimitations: state.nonblockingLimitations,
      nodeExecutionContractRef: null,
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
        : input.nodeExecutionPacket.resourcePacketKind === "generic_domain_resource_packet"
          ? GenericDomainResourcePacketSchema.safeParse(input.resourcePacket)
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
    nodeExecutionContract: input.nodeExecutionContract ?? null,
    resourcePacket: parsedResource.success ? (parsedResource.data as JsonValue) : null,
    implementationContextPacket: input.implementationContextPacket ?? null,
  });
  const resourceRecord = asRecord(parsedResource.success ? parsedResource.data : null);
  const parsedContract = NodeExecutionContractSchema.safeParse(input.nodeExecutionContract);
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.nodeExecutionPacket,
    resourcePacket: parsedResource.success ? (parsedResource.data as JsonValue) : null,
  });
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
  const writeReady =
    readiness.valid &&
    blockingLimitations.length === 0 &&
    (progressive.actionGateStatus === "ready" ||
      progressive.actionGateStatus === "not_applicable") &&
    (progressive.progressiveState === "worker_action_ready" ||
      progressive.progressiveState === "resource_ledger_ready");
  const partialContextAllowed =
    input.allowPartialContextInvocation === true &&
    parsedContract.success &&
    parsedResource.success &&
    resourceRecord.packetKind === input.nodeExecutionPacket.resourcePacketKind &&
    !writeReady &&
    [
      "partial_context_allowed",
      "resource_window_required",
      "resource_demand_open",
      "resource_ledger_ready",
      "domain_resource_selection_required",
      "domain_resource_selection_blocked",
      "domain_action_gate_blocked",
    ].includes(progressive.progressiveState) &&
    progressive.allowedWorkerToolIds.length > 0;
  const allowed = writeReady || partialContextAllowed;
  return {
    allowed,
    status: writeReady ? readiness.status : partialContextAllowed ? "ready_with_limitations" : "blocked",
    invocationMode: writeReady ? "write_ready" : partialContextAllowed ? "partial_context" : "blocked",
    progressiveState: progressive.progressiveState,
    actionGateStatus: progressive.actionGateStatus,
    allowedWorkerToolIds: progressive.allowedWorkerToolIds,
    deniedWorkerToolIds: progressive.deniedWorkerToolIds,
    reasonCodes: unique(
      [
        "worker_invocation_packet_hydration_validated",
        `worker_invocation_mode:${writeReady ? "write_ready" : partialContextAllowed ? "partial_context" : "blocked"}`,
        `node_execution_packet_progressive_state:${progressive.progressiveState}`,
        `node_execution_packet_action_gate:${progressive.actionGateStatus}`,
        ...gateReasonCodes,
        ...(writeReady ? ["worker_invocation_hydrated_node_execution_packet_ready"] : []),
        ...(partialContextAllowed
          ? ["worker_invocation_partial_context_packet_allowed"]
          : []),
      ],
      100,
      180,
    ),
    blockingLimitations,
    nonblockingLimitations: readiness.nonblockingLimitations,
    nodeExecutionContractRef: input.nodeExecutionPacket.nodeExecutionContractRef,
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
  repairAction?: NodeReadinessRepairAction;
  nextAllowedTransitions?: NodeReadinessTransition[];
}): NodeReadinessState {
  const repairAction = input.repairAction ?? "compile_resource_packet";
  const nextAllowedTransitions =
    input.nextAllowedTransitions ??
    (repairAction === "select_concrete_target_files"
      ? (["select_concrete_target_files", "needs_review"] satisfies NodeReadinessTransition[])
      : (["compile_node_execution_packet", "needs_review"] satisfies NodeReadinessTransition[]));
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
    nodeExecutionContractRef: null,
    nodeExecutionContractVersion: null,
    nodeExecutionContractHash: null,
    nodeExecutionPacketRef: null,
    nodeExecutionPacketHash: null,
    domainResourcePacketRef: null,
    domainResourcePacketHash: null,
    boundaryEpoch: null,
    staleIfMismatch: true as const,
    projectionStatus: "unknown" as const,
    projectionMismatchReasonCodes: [],
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
    progressiveState: "partial_context_allowed" as const,
    actionGateStatus: "blocked" as const,
    actionGateReasonCodes: ["node_execution_packet_missing"],
    actionGateMissingFields: ["nodeExecutionPacket"],
    legalWorkerToolIds: CONTEXT_PHASE_WORKER_TOOL_IDS,
    deniedWorkerToolIds: WRITE_READY_WORKER_TOOL_IDS,
    nonblockingLimitations: [],
    repairAction,
    nextAllowedTransitions,
    nextLegalTransitions: nextAllowedTransitions,
    replayBoundary: null,
    computedAt: null,
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
  branchId?: string | null;
  nodeId: string;
  nodeKind: string;
  nodeExecutionContract?: NodeExecutionContract | null;
  workIntentRef?: string | null;
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
  progressiveState?: ProgressiveNodeExecutionPacketState;
  nodeResourceDemandSessionRefs?: string[];
  nodeResourceLedgerManifestRefs?: string[];
  nodeResourceLedgerEntryManifestRefs?: string[];
  domainResourceSelectionRefs?: string[];
  targetSnapshotRefs?: string[];
  validationManifestRefs?: string[];
  validationRefs?: string[];
  validationPhaseRequirements?: string[];
  expectedEvidenceClaimKinds?: string[];
  evidenceClaimExpectations?: string[];
  authorityScope?: string[];
  allowedPathRefs?: string[];
  deniedPathRefs?: string[];
  toolFamilyRefs?: string[];
  budgetPolicyRefs?: string[];
  timeoutMs?: number | null;
  maxInputTokens?: number | null;
  maxOutputTokens?: number | null;
  blockingLimitations?: string[];
  nonblockingLimitations?: string[];
  resourcePacket?: DomainResourcePacket | JsonValue | null;
}): NodeExecutionPacket {
  const packetId = `${input.nodeId}:execution-packet`;
  const nodeExecutionContract =
    input.nodeExecutionContract ??
    buildNodeExecutionContract({
      runtimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      branchId: input.branchId ?? null,
      nodeId: input.nodeId,
      nodeKind: input.nodeKind,
      workIntentRef: input.workIntentRef ?? null,
      capabilityId: input.capabilityId,
      executorKey: input.executorKey,
      workerRef: input.workerRef,
      roleClass: input.nodeKind,
      executionIntent: input.executionIntent,
      evidenceMode: input.evidenceMode,
      sourceCommitmentIds: input.targetCommitmentIds,
      expectedEvidenceClaimKinds: input.expectedEvidenceClaimKinds,
      evidenceClaimExpectations: input.evidenceClaimExpectations,
      resourceRequirementRefs: [
        ...(input.sourceContextRefs ?? []),
        input.resourcePacketRef,
        ...(input.sourcePacketRefs ?? []),
      ],
      targetResourceSubsetRefs: input.authorityScope ?? [],
      domainResourcePacketKind: input.resourcePacketKind,
      domainResourcePacketRef: input.resourcePacketRef,
      validationRefs: input.validationRefs,
      validationPhaseRequirements: input.validationPhaseRequirements,
      authorityScope: input.authorityScope,
      allowedPathRefs: input.allowedPathRefs ?? input.authorityScope,
      deniedPathRefs: input.deniedPathRefs,
      toolFamilyRefs: input.toolFamilyRefs,
      stopConditions: input.blockingLimitations,
    });
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
    nodeExecutionContractRef: nodeExecutionContract.contractRef,
    nodeExecutionContractVersion: nodeExecutionContract.schemaVersion,
    nodeExecutionContractHash: nodeExecutionContract.contractHash,
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
    progressiveState: input.progressiveState ?? "domain_action_gate_blocked",
    nodeResourceDemandSessionRefs: unique(input.nodeResourceDemandSessionRefs ?? [], 40, 320),
    nodeResourceLedgerManifestRefs: unique(input.nodeResourceLedgerManifestRefs ?? [], 40, 320),
    nodeResourceLedgerEntryManifestRefs: unique(
      input.nodeResourceLedgerEntryManifestRefs ?? [],
      80,
      320,
    ),
    domainResourceSelectionRefs: unique(input.domainResourceSelectionRefs ?? [], 40, 320),
    targetSnapshotRefs: unique(input.targetSnapshotRefs ?? [], 80, 320),
    validationManifestRefs: unique(input.validationManifestRefs ?? [], 40, 320),
    actionGateStatus: "blocked" as const,
    actionGateReasonCodes: [],
    actionGateMissingFields: [],
    nextLegalWorkerToolIds: CONTEXT_PHASE_WORKER_TOOL_IDS,
    deniedWorkerToolIds: WRITE_PHASE_DENIED_WORKER_TOOL_IDS,
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
    nodeExecutionContract,
    resourcePacket: input.resourcePacket ?? null,
  });
  const packetWithReadiness = NodeExecutionPacketSchema.parse({
    ...parsedBase,
    readinessStatus: readiness.status,
    readinessReasonCodes: readiness.reasonCodes,
    blockingLimitations: readiness.blockingLimitations,
    nonblockingLimitations: readiness.nonblockingLimitations,
  });
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: packetWithReadiness,
    resourcePacket: input.resourcePacket ?? null,
  });
  return NodeExecutionPacketSchema.parse({
    ...packetWithReadiness,
    progressiveState: progressive.progressiveState,
    actionGateStatus: progressive.actionGateStatus,
    actionGateReasonCodes: progressive.actionGateReasonCodes,
    actionGateMissingFields: progressive.actionGateMissingFields,
    nextLegalWorkerToolIds: progressive.allowedWorkerToolIds,
    deniedWorkerToolIds: progressive.deniedWorkerToolIds,
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
  nodeExecutionContract: NodeExecutionContract;
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
  const contextRefsForProgressiveState = unique(
    [
      ...input.implementationTaskPacket.contextPacketRefs,
      ...input.implementationTaskPacket.sourceResourceHandoffRefs,
      ...input.implementationTaskPacket.priorNodeOutputRefs,
    ],
    160,
    320,
  );
  const nodeResourceDemandSessionRefs = refsMatchingStructuralKinds({
    refs: contextRefsForProgressiveState,
    schemes: ["node-resource-demand://"],
    pathSegments: ["/node-resource-demand/"],
  });
  const nodeResourceLedgerManifestRefs = refsMatchingStructuralKinds({
    refs: contextRefsForProgressiveState,
    schemes: ["node-resource-ledger://"],
    pathSegments: ["/node-resource-ledger/"],
  });
  const targetSnapshotRefs = unique(
    [
      ...input.implementationTaskPacket.targetFileSnapshots.map((snapshot) => snapshot.snapshotRef),
      ...input.implementationTaskPacket.newFileIntents.map(
        (intent) => `new-file-intent://${intent.fileRef}`,
      ),
    ],
    80,
    320,
  );
  const validationManifestRefs = unique(
    [
      ...input.implementationTaskPacket.validationCommandRefs,
      ...input.implementationTaskPacket.validationDiscoveryPlan,
    ],
    40,
    320,
  );
  const nodeExecutionContract = buildNodeExecutionContract({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind ?? "implementation",
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    roleClass: input.nodeKind ?? "implementation",
    executionIntent: input.implementationTaskPacket.executionIntent,
    evidenceMode: input.implementationTaskPacket.evidenceMode,
    sourceCommitmentIds: input.implementationTaskPacket.targetCommitmentIds,
    expectedEvidenceClaimKinds: input.implementationTaskPacket.expectedEvidenceClaimKinds,
    evidenceClaimExpectations: input.implementationTaskPacket.evidenceClaimExpectations,
    resourceRequirementRefs: [
      ...input.implementationTaskPacket.contextPacketRefs,
      ...input.implementationTaskPacket.sourceResourceHandoffRefs,
      ...input.implementationTaskPacket.priorNodeOutputRefs,
      codingResourcePacket.packetRef,
      input.implementationTaskPacket.packetRef,
      ...input.implementationTaskPacket.targetFileRefs,
      ...input.implementationTaskPacket.targetFileSnapshots.map((snapshot) => snapshot.snapshotRef),
      ...input.implementationTaskPacket.newFileIntents.map(
        (intent) => `new-file-intent://${intent.fileRef}`,
      ),
    ],
    targetResourceSubsetRefs: input.implementationTaskPacket.targetFileRefs,
    domainResourcePacketKind: codingResourcePacket.packetKind,
    domainResourcePacketRef: codingResourcePacket.packetRef,
    validationRefs: input.implementationTaskPacket.validationCommandRefs,
    validationPhaseRequirements: validationPhaseRequirementsForEvidenceKinds(
      input.implementationTaskPacket.expectedEvidenceClaimKinds,
    ),
    authorityScope: input.implementationTaskPacket.allowedEditScope,
    allowedPathRefs: input.implementationTaskPacket.allowedFileRefs,
    deniedPathRefs: input.implementationTaskPacket.deniedFileRefs,
    toolFamilyRefs: ["repo.read", "worker.edit", "checks.run", "worker.evidence"],
    stopConditions: input.implementationTaskPacket.stopIfMissingOrEscalate,
  });
  const nodeExecutionPacket = buildNodeExecutionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind ?? "implementation",
    nodeExecutionContract,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    executionIntent: input.implementationTaskPacket.executionIntent,
    evidenceMode: input.implementationTaskPacket.evidenceMode,
    targetCommitmentIds: input.implementationTaskPacket.targetCommitmentIds,
    sourcePacketRefs: [
      input.implementationTaskPacket.packetRef,
      ...input.implementationTaskPacket.sourceContractRefs,
    ],
    sourceContextRefs: [
      ...input.implementationTaskPacket.sourceResourceHandoffRefs,
    ],
    resourcePacketKind: codingResourcePacket.packetKind,
    resourcePacketRef: codingResourcePacket.packetRef,
    nodeResourceDemandSessionRefs,
    nodeResourceLedgerManifestRefs,
    domainResourceSelectionRefs: input.implementationTaskPacket.domainResourceSelectionRefs,
    targetSnapshotRefs,
    validationManifestRefs,
    validationRefs: input.implementationTaskPacket.validationCommandRefs,
    expectedEvidenceClaimKinds: input.implementationTaskPacket.expectedEvidenceClaimKinds,
    evidenceClaimExpectations: input.implementationTaskPacket.evidenceClaimExpectations,
    authorityScope: input.implementationTaskPacket.allowedEditScope,
    allowedPathRefs: input.implementationTaskPacket.allowedFileRefs,
    deniedPathRefs: input.implementationTaskPacket.deniedFileRefs,
    toolFamilyRefs: ["repo.read", "worker.edit", "checks.run", "worker.evidence"],
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
    nodeExecutionContract,
    resourcePacket: codingResourcePacket,
  });
  return {
    nodeExecutionContract,
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
  acceptedResourceHandoffRefs?: string[];
  validationRefs?: string[];
  validationDiscoveryPlan?: string[];
  targetCommitmentIds: string[];
  evidenceClaimExpectations: string[];
  authorityScope: string[];
  stopIfMissingOrEscalate?: string[];
}): {
  nodeExecutionContract: NodeExecutionContract;
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
    acceptedResourceHandoffRefs: input.acceptedResourceHandoffRefs,
    validationRefs: input.validationRefs,
    validationDiscoveryPlan: input.validationDiscoveryPlan,
    targetCommitmentIds: input.targetCommitmentIds,
    evidenceClaimExpectations: input.evidenceClaimExpectations,
    authorityScope: input.authorityScope,
    stopIfMissingOrEscalate: input.stopIfMissingOrEscalate,
  });
  const nodeExecutionContract = buildNodeExecutionContract({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    roleClass: input.nodeKind,
    executionIntent: readOnlyResourcePacket.executionIntent,
    evidenceMode: readOnlyResourcePacket.evidenceMode,
    sourceCommitmentIds: readOnlyResourcePacket.targetCommitmentIds,
    expectedEvidenceClaimKinds: ["resource_handoff", "read_only"],
    evidenceClaimExpectations: readOnlyResourcePacket.evidenceClaimExpectations,
    resourceRequirementRefs: [
      ...readOnlyResourcePacket.contextPacketRefs,
      ...readOnlyResourcePacket.acceptedResourceHandoffRefs,
      readOnlyResourcePacket.packetRef,
      ...readOnlyResourcePacket.sourceRefs,
      ...readOnlyResourcePacket.boundedSnapshotRefs,
    ],
    targetResourceSubsetRefs: [
      ...readOnlyResourcePacket.sourceRefs,
      ...readOnlyResourcePacket.boundedSnapshotRefs,
    ],
    domainResourcePacketKind: readOnlyResourcePacket.packetKind,
    domainResourcePacketRef: readOnlyResourcePacket.packetRef,
    validationRefs: readOnlyResourcePacket.validationRefs,
    validationPhaseRequirements: ["pre_execution_validation"],
    authorityScope: readOnlyResourcePacket.authorityScope,
    allowedPathRefs: readOnlyResourcePacket.authorityScope,
    toolFamilyRefs: ["repo.read", "artifact.create", "worker.evidence"],
    stopConditions: readOnlyResourcePacket.stopIfMissingOrEscalate,
  });
  const nodeExecutionPacket = buildNodeExecutionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    nodeExecutionContract,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    executionIntent: readOnlyResourcePacket.executionIntent,
    evidenceMode: readOnlyResourcePacket.evidenceMode,
    targetCommitmentIds: readOnlyResourcePacket.targetCommitmentIds,
    sourcePacketRefs: readOnlyResourcePacket.sourceRefs,
    sourceContextRefs: [
      ...readOnlyResourcePacket.contextPacketRefs,
      ...readOnlyResourcePacket.acceptedResourceHandoffRefs,
    ],
    resourcePacketKind: readOnlyResourcePacket.packetKind,
    resourcePacketRef: readOnlyResourcePacket.packetRef,
    validationRefs: readOnlyResourcePacket.validationRefs,
    expectedEvidenceClaimKinds: ["resource_handoff", "read_only"],
    evidenceClaimExpectations: readOnlyResourcePacket.evidenceClaimExpectations,
    authorityScope: readOnlyResourcePacket.authorityScope,
    blockingLimitations: [],
    resourcePacket: readOnlyResourcePacket,
  });
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: nodeExecutionPacket,
    nodeExecutionContract,
    resourcePacket: readOnlyResourcePacket,
  });
  return { nodeExecutionContract, nodeExecutionPacket, readOnlyResourcePacket, readiness };
}

export function compileNodeExecutionPacketForGenericDomainResource(input: {
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: string;
  capabilityId: string;
  executorKey: string;
  workerRef: string;
  packetId?: string;
  domainKind: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  resourceRefs?: string[];
  boundedSnapshotRefs?: string[];
  contextPacketRefs?: string[];
  acceptedResourceHandoffRefs?: string[];
  validationRefs?: string[];
  validationDiscoveryPlan?: string[];
  targetCommitmentIds: string[];
  evidenceClaimExpectations: string[];
  authorityScope: string[];
  allowedOperationRefs?: string[];
  stopIfMissingOrEscalate?: string[];
}): {
  nodeExecutionContract: NodeExecutionContract;
  nodeExecutionPacket: NodeExecutionPacket;
  genericDomainResourcePacket: GenericDomainResourcePacket;
  readiness: NodeExecutionPacketValidation;
} {
  const genericDomainResourcePacket = buildGenericDomainResourcePacket({
    packetId: input.packetId ?? `${input.nodeId}:generic-domain-resource`,
    domainKind: input.domainKind,
    executionIntent: input.executionIntent ?? "unspecified",
    evidenceMode: input.evidenceMode ?? [],
    resourceRefs: input.resourceRefs,
    boundedSnapshotRefs: input.boundedSnapshotRefs,
    contextPacketRefs: input.contextPacketRefs,
    acceptedResourceHandoffRefs: input.acceptedResourceHandoffRefs,
    validationRefs: input.validationRefs,
    validationDiscoveryPlan: input.validationDiscoveryPlan,
    targetCommitmentIds: input.targetCommitmentIds,
    evidenceClaimExpectations: input.evidenceClaimExpectations,
    authorityScope: input.authorityScope,
    allowedOperationRefs: input.allowedOperationRefs,
    stopIfMissingOrEscalate: input.stopIfMissingOrEscalate,
  });
  const nodeExecutionContract = buildNodeExecutionContract({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    roleClass: input.nodeKind,
    executionIntent: genericDomainResourcePacket.executionIntent,
    evidenceMode: genericDomainResourcePacket.evidenceMode,
    sourceCommitmentIds: genericDomainResourcePacket.targetCommitmentIds,
    expectedEvidenceClaimKinds: genericDomainResourcePacket.evidenceMode,
    evidenceClaimExpectations: genericDomainResourcePacket.evidenceClaimExpectations,
    resourceRequirementRefs: [
      ...genericDomainResourcePacket.contextPacketRefs,
      ...genericDomainResourcePacket.acceptedResourceHandoffRefs,
      genericDomainResourcePacket.packetRef,
      ...genericDomainResourcePacket.resourceRefs,
      ...genericDomainResourcePacket.boundedSnapshotRefs,
    ],
    targetResourceSubsetRefs: [
      ...genericDomainResourcePacket.resourceRefs,
      ...genericDomainResourcePacket.boundedSnapshotRefs,
    ],
    domainResourcePacketKind: genericDomainResourcePacket.packetKind,
    domainResourcePacketRef: genericDomainResourcePacket.packetRef,
    validationRefs: genericDomainResourcePacket.validationRefs,
    validationPhaseRequirements: validationPhaseRequirementsForEvidenceKinds(
      genericDomainResourcePacket.evidenceMode,
    ),
    authorityScope: genericDomainResourcePacket.authorityScope,
    allowedPathRefs: genericDomainResourcePacket.authorityScope,
    toolFamilyRefs: genericDomainResourcePacket.allowedOperationRefs,
    stopConditions: genericDomainResourcePacket.stopIfMissingOrEscalate,
  });
  const nodeExecutionPacket = buildNodeExecutionPacket({
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    nodeKind: input.nodeKind,
    nodeExecutionContract,
    capabilityId: input.capabilityId,
    executorKey: input.executorKey,
    workerRef: input.workerRef,
    executionIntent: genericDomainResourcePacket.executionIntent,
    evidenceMode: genericDomainResourcePacket.evidenceMode,
    targetCommitmentIds: genericDomainResourcePacket.targetCommitmentIds,
    sourcePacketRefs: genericDomainResourcePacket.resourceRefs,
    sourceContextRefs: [
      ...genericDomainResourcePacket.contextPacketRefs,
      ...genericDomainResourcePacket.acceptedResourceHandoffRefs,
    ],
    resourcePacketKind: genericDomainResourcePacket.packetKind,
    resourcePacketRef: genericDomainResourcePacket.packetRef,
    validationRefs: genericDomainResourcePacket.validationRefs,
    expectedEvidenceClaimKinds: genericDomainResourcePacket.evidenceMode,
    evidenceClaimExpectations: genericDomainResourcePacket.evidenceClaimExpectations,
    authorityScope: genericDomainResourcePacket.authorityScope,
    toolFamilyRefs: genericDomainResourcePacket.allowedOperationRefs,
    blockingLimitations: [],
    resourcePacket: genericDomainResourcePacket,
  });
  const readiness = evaluateNodeExecutionPacketReadiness({
    packet: nodeExecutionPacket,
    nodeExecutionContract,
    resourcePacket: genericDomainResourcePacket,
  });
  return {
    nodeExecutionContract,
    nodeExecutionPacket,
    genericDomainResourcePacket,
    readiness,
  };
}

export function summarizeNodeExecutionPacketForReadback(packet: NodeExecutionPacket): JsonValue {
  return {
    nodeExecutionContractRef: packet.nodeExecutionContractRef,
    nodeExecutionContractVersion: packet.nodeExecutionContractVersion,
    nodeExecutionContractHash: packet.nodeExecutionContractHash,
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
    progressiveState: packet.progressiveState,
    nodeResourceDemandSessionRefCount: packet.nodeResourceDemandSessionRefs.length,
    nodeResourceLedgerManifestRefCount: packet.nodeResourceLedgerManifestRefs.length,
    nodeResourceLedgerEntryManifestRefCount: packet.nodeResourceLedgerEntryManifestRefs.length,
    domainResourceSelectionRefCount: packet.domainResourceSelectionRefs.length,
    targetSnapshotRefCount: packet.targetSnapshotRefs.length,
    validationManifestRefCount: packet.validationManifestRefs.length,
    actionGateStatus: packet.actionGateStatus,
    actionGateReasonCodes: packet.actionGateReasonCodes,
    actionGateMissingFields: packet.actionGateMissingFields,
    nextLegalWorkerToolIds: packet.nextLegalWorkerToolIds.slice(0, 20),
    deniedWorkerToolIds: packet.deniedWorkerToolIds.slice(0, 20),
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

const NODE_EXECUTION_PACKET_PROGRESSIVE_METADATA_LIMIT_BYTES = 24 * 1024;

function jsonByteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stringRefsFromValues(...values: unknown[]): string[] {
  const refs: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      refs.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      refs.push(
        ...value.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        ),
      );
    }
  }
  return unique(refs, 80, 320);
}

function refFromManifest(value: unknown, ...keys: string[]): string | null {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function nodeExecutionPacketManifestForMetadata(packet: NodeExecutionPacket): JsonValue {
  return {
    packetRef: packet.packetRef,
    packetHash: hashValue(packet),
    schemaVersion: packet.schemaVersion,
    byteCount: jsonByteCount(packet),
    nodeId: packet.nodeId,
    nodeKind: packet.nodeKind,
    nodeExecutionContractRef: packet.nodeExecutionContractRef,
    nodeExecutionContractHash: packet.nodeExecutionContractHash,
    resourcePacketKind: packet.resourcePacketKind,
    resourcePacketRef: packet.resourcePacketRef,
    progressiveState: packet.progressiveState,
    actionGateStatus: packet.actionGateStatus,
    actionGateReasonCodes: packet.actionGateReasonCodes.slice(0, 30),
    actionGateMissingFields: packet.actionGateMissingFields.slice(0, 30),
    nodeResourceDemandSessionRefCount: packet.nodeResourceDemandSessionRefs.length,
    nodeResourceLedgerManifestRefCount: packet.nodeResourceLedgerManifestRefs.length,
    nodeResourceLedgerEntryManifestRefCount: packet.nodeResourceLedgerEntryManifestRefs.length,
    domainResourceSelectionRefCount: packet.domainResourceSelectionRefs.length,
    targetSnapshotRefCount: packet.targetSnapshotRefs.length,
    validationManifestRefCount: packet.validationManifestRefs.length,
    validationRefCount: packet.validationRefs.length,
    authorityScopeCount: packet.authorityScope.length,
    evidenceExpectationCount: packet.evidenceClaimExpectations.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function progressiveReadinessManifestForMetadata(
  progressive: ProgressiveNodeExecutionPacketReadiness,
): JsonValue {
  return {
    progressiveState: progressive.progressiveState,
    actionGateStatus: progressive.actionGateStatus,
    actionGateReasonCodes: progressive.actionGateReasonCodes.slice(0, 40),
    actionGateMissingFields: progressive.actionGateMissingFields.slice(0, 30),
    nextLegalTransitions: progressive.nextLegalTransitions,
    allowedWorkerToolIds: progressive.allowedWorkerToolIds.slice(0, 40),
    deniedWorkerToolIds: progressive.deniedWorkerToolIds.slice(0, 40),
    nodeResourceDemandSessionRefCount: progressive.nodeResourceDemandSessionRefs.length,
    nodeResourceLedgerManifestRefCount: progressive.nodeResourceLedgerManifestRefs.length,
    domainResourceSelectionRefCount: progressive.domainResourceSelectionRefs.length,
    targetSnapshotRefCount: progressive.targetSnapshotRefs.length,
    validationRefCount: progressive.validationRefs.length,
    evidenceExpectationCount: progressive.evidenceExpectationCount,
    authorityScopeCount: progressive.authorityScopeCount,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function patchNodeExecutionPacketForProgressiveProjection(input: {
  packet: NodeExecutionPacket;
  resourcePacket: Record<string, unknown>;
  progressiveState?: ProgressiveNodeExecutionPacketState;
  nodeResourceDemandSessionRefs?: string[];
  nodeResourceLedgerManifestRefs?: string[];
  nodeResourceLedgerEntryManifestRefs?: string[];
  domainResourceSelectionRefs?: string[];
  targetSnapshotRefs?: string[];
  validationManifestRefs?: string[];
  validationRefs?: string[];
  blockingLimitations?: string[];
}): NodeExecutionPacket {
  const candidate = NodeExecutionPacketSchema.parse({
    ...input.packet,
    progressiveState: input.progressiveState ?? input.packet.progressiveState,
    nodeResourceDemandSessionRefs: unique(
      [
        ...input.packet.nodeResourceDemandSessionRefs,
        ...(input.nodeResourceDemandSessionRefs ?? []),
      ],
      40,
      320,
    ),
    nodeResourceLedgerManifestRefs: unique(
      [
        ...input.packet.nodeResourceLedgerManifestRefs,
        ...(input.nodeResourceLedgerManifestRefs ?? []),
      ],
      40,
      320,
    ),
    nodeResourceLedgerEntryManifestRefs: unique(
      [
        ...input.packet.nodeResourceLedgerEntryManifestRefs,
        ...(input.nodeResourceLedgerEntryManifestRefs ?? []),
      ],
      80,
      320,
    ),
    domainResourceSelectionRefs: unique(
      [...input.packet.domainResourceSelectionRefs, ...(input.domainResourceSelectionRefs ?? [])],
      40,
      320,
    ),
    targetSnapshotRefs: unique(
      [...input.packet.targetSnapshotRefs, ...(input.targetSnapshotRefs ?? [])],
      80,
      320,
    ),
    validationManifestRefs: unique(
      [...input.packet.validationManifestRefs, ...(input.validationManifestRefs ?? [])],
      40,
      320,
    ),
    validationRefs: unique(
      [...input.packet.validationRefs, ...(input.validationRefs ?? [])],
      40,
      300,
    ),
    blockingLimitations: unique(
      [...input.packet.blockingLimitations, ...(input.blockingLimitations ?? [])],
      40,
      700,
    ),
  });
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: candidate,
    resourcePacket: input.resourcePacket as JsonValue,
  });
  return NodeExecutionPacketSchema.parse({
    ...candidate,
    progressiveState: progressive.progressiveState,
    actionGateStatus: progressive.actionGateStatus,
    actionGateReasonCodes: progressive.actionGateReasonCodes,
    actionGateMissingFields: progressive.actionGateMissingFields,
    nextLegalWorkerToolIds: progressive.allowedWorkerToolIds,
    deniedWorkerToolIds: progressive.deniedWorkerToolIds,
  });
}

function progressiveTransitionMetadata(input: {
  toolId: string;
  packet: NodeExecutionPacket;
  projectedPacket: NodeExecutionPacket;
  resourcePacket: Record<string, unknown>;
  extraReasonCodes?: string[];
  transitionStatus?: string;
  blockerKind?: string | null;
}): JsonValue {
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.projectedPacket,
    resourcePacket: input.resourcePacket as JsonValue,
  });
  const transition = {
    transitionToolId: input.toolId,
    transitionStatus: input.transitionStatus ?? progressive.actionGateStatus,
    blockerKind: input.blockerKind ?? null,
    previousPacket: nodeExecutionPacketManifestForMetadata(input.packet),
    projectedPacket: nodeExecutionPacketManifestForMetadata(input.projectedPacket),
    progressiveReadiness: progressiveReadinessManifestForMetadata(progressive),
    nextLegalTransitions: progressive.nextLegalTransitions,
    reasonCodes: unique(
      [
        `${input.toolId.replaceAll(".", "_")}_compiled_transition`,
        ...progressive.actionGateReasonCodes,
        ...(input.extraReasonCodes ?? []),
      ],
      80,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } satisfies JsonValue;
  const byteCount = jsonByteCount(transition);
  if (byteCount <= NODE_EXECUTION_PACKET_PROGRESSIVE_METADATA_LIMIT_BYTES) {
    return {
      ...transition,
      metadataByteCount: byteCount,
      metadataWithinProgressiveLimit: true,
    } satisfies JsonValue;
  }
  return {
    transitionToolId: input.toolId,
    transitionStatus: input.transitionStatus ?? progressive.actionGateStatus,
    blockerKind: input.blockerKind ?? null,
    previousPacketRef: input.packet.packetRef,
    previousPacketHash: hashValue(input.packet),
    projectedPacketRef: input.projectedPacket.packetRef,
    projectedPacketHash: hashValue(input.projectedPacket),
    progressiveReadiness: progressiveReadinessManifestForMetadata(progressive),
    metadataByteCount: byteCount,
    metadataWithinProgressiveLimit: false,
    metadataCompactedForRuntimeToolStorage: true,
    reasonCodes: unique(
      [
        `${input.toolId.replaceAll(".", "_")}_compiled_transition`,
        "node_execution_packet_progressive_metadata_compacted",
        ...progressive.actionGateReasonCodes,
        ...(input.extraReasonCodes ?? []),
      ],
      80,
      180,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } satisfies JsonValue;
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
  const nodeExecutionContract = asRecord(
    volatile.nodeExecutionContract ?? metadata.nodeExecutionContract,
  );
  const nodeExecutionPacket = asRecord(
    volatile.nodeExecutionPacket ?? metadata.nodeExecutionPacket,
  );
  const resourcePacket = asRecord(volatile.resourcePacket ?? metadata.resourcePacket);
  const reasonCodes = [`${input.toolId.replaceAll(".", "_")}_recorded`];
  if (
    input.toolId === "node.execution_packet.create_partial" ||
    input.toolId === "node.execution_packet.attach_resource_demand" ||
    input.toolId === "node.execution_packet.attach_node_resource_demand" ||
    input.toolId === "node.execution_packet.attach_resource_ledger_manifest" ||
    input.toolId === "node.execution_packet.mark_resource_ledger_ready" ||
    input.toolId === "node.execution_packet.require_domain_resource_selection" ||
    input.toolId === "node.execution_packet.evaluate_action_gate" ||
    input.toolId === "node.execution_packet.block_action_gate" ||
    input.toolId === "node.execution_packet.promote_worker_action_ready" ||
    input.toolId === "node.execution_packet.project_progressive_readiness"
  ) {
    const parsed = NodeExecutionPacketSchema.safeParse(nodeExecutionPacket);
    if (!parsed.success) {
      return {
        status: "needs_review",
        outputRef: `runtime-tool-output://${input.toolId}/invalid-node-execution-packet`,
        outputHash: `node-resource:${input.toolId}:invalid-progressive-packet`,
        outputSummary:
          "Progressive NodeExecutionPacket transition requires a parseable packet body or hydrated payload body.",
        reasonCodes: [
          ...reasonCodes,
          "node_execution_packet_parse_failed",
          ...parsed.error.issues.map((issue) => `schema:${issue.path.join(".") || "root"}`),
        ].slice(0, 40),
        metadata: {
          blockerKind: "node_execution_packet_progressive_transition_parse_failed",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        } satisfies JsonValue,
      };
    }
    const nodeResourceDemandSessionRefs = stringRefsFromValues(
      volatile.nodeResourceDemandSessionRef,
      volatile.nodeResourceDemandSessionRefs,
      metadata.nodeResourceDemandSessionRef,
      metadata.nodeResourceDemandSessionRefs,
      refFromManifest(
        volatile.nodeResourceDemandSessionManifest ?? metadata.nodeResourceDemandSessionManifest,
        "sessionRef",
        "nodeResourceDemandSessionRef",
        "demandSessionRef",
      ),
    );
    const nodeResourceLedgerManifestRefs = stringRefsFromValues(
      volatile.nodeResourceLedgerManifestRef,
      volatile.nodeResourceLedgerManifestRefs,
      metadata.nodeResourceLedgerManifestRef,
      metadata.nodeResourceLedgerManifestRefs,
      refFromManifest(
        volatile.nodeResourceLedgerManifest ?? metadata.nodeResourceLedgerManifest,
        "ledgerRef",
        "manifestRef",
        "nodeResourceLedgerManifestRef",
      ),
    );
    const nodeResourceLedgerEntryManifestRefs = stringRefsFromValues(
      volatile.nodeResourceLedgerEntryManifestRef,
      volatile.nodeResourceLedgerEntryManifestRefs,
      metadata.nodeResourceLedgerEntryManifestRef,
      metadata.nodeResourceLedgerEntryManifestRefs,
      refFromManifest(
        volatile.nodeResourceLedgerEntryManifest ?? metadata.nodeResourceLedgerEntryManifest,
        "entryRef",
        "manifestRef",
        "nodeResourceLedgerEntryManifestRef",
      ),
    );
    const domainResourceSelectionRefs = stringRefsFromValues(
      volatile.domainResourceSelectionRef,
      volatile.domainResourceSelectionRefs,
      metadata.domainResourceSelectionRef,
      metadata.domainResourceSelectionRefs,
      refFromManifest(
        volatile.domainResourceSelectionPacket ?? metadata.domainResourceSelectionPacket,
        "packetRef",
        "domainResourceSelectionPacketRef",
        "decisionRef",
      ),
    );
    const targetSnapshotRefs = stringRefsFromValues(
      volatile.targetSnapshotRef,
      volatile.targetSnapshotRefs,
      metadata.targetSnapshotRef,
      metadata.targetSnapshotRefs,
      resourcePacket.targetFileSnapshotRefs,
      resourcePacket.newFileIntentRefs,
    );
    const validationRefs = stringRefsFromValues(
      volatile.validationRef,
      volatile.validationRefs,
      metadata.validationRef,
      metadata.validationRefs,
      resourcePacket.validationRefs,
      resourcePacket.validationDiscoveryPlan,
    );
    const validationManifestRefs = stringRefsFromValues(
      volatile.validationManifestRef,
      volatile.validationManifestRefs,
      metadata.validationManifestRef,
      metadata.validationManifestRefs,
    );
    const toolReasonCodes: string[] = [];
    let projectedPacket = parsed.data;
    let status: "succeeded" | "needs_review" = "succeeded";
    let blockerKind: string | null = null;
    if (input.toolId === "node.execution_packet.create_partial") {
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: "partial_context_allowed",
      });
      toolReasonCodes.push("node_execution_packet_partial_context_created");
    } else if (
      input.toolId === "node.execution_packet.attach_resource_demand" ||
      input.toolId === "node.execution_packet.attach_node_resource_demand"
    ) {
      if (nodeResourceDemandSessionRefs.length === 0) {
        status = "needs_review";
        blockerKind = "node_resource_demand_session_ref_missing";
        toolReasonCodes.push("node_execution_packet_node_resource_demand_ref_missing");
      }
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: "resource_demand_open",
        nodeResourceDemandSessionRefs,
      });
    } else if (
      input.toolId === "node.execution_packet.attach_resource_ledger_manifest" ||
      input.toolId === "node.execution_packet.mark_resource_ledger_ready"
    ) {
      if (
        nodeResourceLedgerManifestRefs.length === 0 &&
        input.toolId === "node.execution_packet.attach_resource_ledger_manifest"
      ) {
        status = "needs_review";
        blockerKind = "node_resource_ledger_manifest_ref_missing";
        toolReasonCodes.push("node_execution_packet_resource_ledger_manifest_ref_missing");
      }
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: "resource_ledger_ready",
        nodeResourceDemandSessionRefs,
        nodeResourceLedgerManifestRefs,
        nodeResourceLedgerEntryManifestRefs,
      });
      toolReasonCodes.push("node_execution_packet_resource_ledger_ready");
    } else if (input.toolId === "node.execution_packet.require_domain_resource_selection") {
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: "domain_resource_selection_required",
        domainResourceSelectionRefs,
      });
      toolReasonCodes.push("node_execution_packet_domain_resource_selection_required");
    } else if (input.toolId === "node.execution_packet.block_action_gate") {
      const baseProjection = projectProgressiveNodeExecutionPacketReadiness({
        packet: parsed.data,
        resourcePacket: resourcePacket as JsonValue,
      });
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: baseProjection.actionGateMissingFields.includes("domainResourceSelectionRefs")
          ? "domain_resource_selection_blocked"
          : "domain_action_gate_blocked",
        blockingLimitations: stringRefsFromValues(
          volatile.blockingLimitations,
          metadata.blockingLimitations,
          firstString(volatile.blockerSummary, metadata.blockerSummary),
        ),
      });
      status = "needs_review";
      blockerKind = "node_execution_packet_domain_action_gate_blocked";
      toolReasonCodes.push("node_execution_packet_domain_action_gate_blocked");
    } else if (input.toolId === "node.execution_packet.promote_worker_action_ready") {
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        progressiveState: "worker_action_ready",
        domainResourceSelectionRefs,
        targetSnapshotRefs,
        validationManifestRefs,
        validationRefs,
      });
      const progressive = projectProgressiveNodeExecutionPacketReadiness({
        packet: projectedPacket,
        resourcePacket: resourcePacket as JsonValue,
      });
      if (progressive.actionGateStatus !== "ready") {
        status = "needs_review";
        blockerKind = "node_execution_packet_action_gate_not_ready";
        toolReasonCodes.push("node_execution_packet_worker_edit_promotion_blocked");
      } else {
        toolReasonCodes.push("node_execution_packet_worker_action_ready_promoted");
      }
    } else {
      projectedPacket = patchNodeExecutionPacketForProgressiveProjection({
        packet: parsed.data,
        resourcePacket,
        domainResourceSelectionRefs,
        targetSnapshotRefs,
        validationManifestRefs,
        validationRefs,
      });
      toolReasonCodes.push("node_execution_packet_progressive_readiness_projected");
    }
    const progressive = projectProgressiveNodeExecutionPacketReadiness({
      packet: projectedPacket,
      resourcePacket: resourcePacket as JsonValue,
    });
    const transitionMetadata = progressiveTransitionMetadata({
      toolId: input.toolId,
      packet: parsed.data,
      projectedPacket,
      resourcePacket,
      extraReasonCodes: toolReasonCodes,
      transitionStatus: progressive.actionGateStatus,
      blockerKind,
    });
    return {
      status:
        input.toolId === "node.execution_packet.evaluate_action_gate" ||
        input.toolId === "node.execution_packet.project_progressive_readiness"
          ? "succeeded"
          : status,
      outputRef: `${parsed.data.packetRef}/progressive/${input.toolId.split(".").at(-1)}/${hashValue(transitionMetadata).slice(0, 16)}`,
      outputHash: `node-resource:${hashValue({ toolId: input.toolId, transitionMetadata })}`,
      outputSummary:
        progressive.actionGateStatus === "ready"
          ? `NodeExecutionPacket write gate is ready at ${progressive.progressiveState}.`
          : `NodeExecutionPacket write gate is ${progressive.actionGateStatus}; missing ${progressive.actionGateMissingFields.join(", ") || "no structural fields"}.`,
      reasonCodes: unique(
        [
          ...reasonCodes,
          ...toolReasonCodes,
          `node_execution_packet_progressive_state:${progressive.progressiveState}`,
          `node_execution_packet_action_gate:${progressive.actionGateStatus}`,
          ...progressive.actionGateReasonCodes,
          ...(blockerKind ? [blockerKind] : []),
        ],
        100,
        180,
      ),
      metadata: transitionMetadata,
    };
  }
  if (
    input.toolId === "node.evaluate_readiness" ||
    input.toolId === "node.promote_ready_packet" ||
    input.toolId === "node.execution_packet.validate_hydration" ||
    input.toolId === "node.execution_packet.project_readiness" ||
    input.toolId === "resource.materialize_node_packet" ||
    input.toolId === "resource.materialize_domain_packet"
  ) {
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
    const parsedContract = NodeExecutionContractSchema.safeParse(nodeExecutionContract);
    const readiness = evaluateNodeExecutionPacketReadiness({
      packet: parsed.data,
      nodeExecutionContract: parsedContract.success ? parsedContract.data : null,
      resourcePacket: resourcePacket as JsonValue,
    });
    const progressive = projectProgressiveNodeExecutionPacketReadiness({
      packet: parsed.data,
      resourcePacket: resourcePacket as JsonValue,
    });
    const outputRef = `${parsed.data.packetRef}/readiness/${readiness.status}`;
    const contractManifest = parsedContract.success
      ? buildNodeExecutionContractManifest(parsedContract.data)
      : null;
    return {
      status: readiness.valid ? "succeeded" : "needs_review",
      outputRef,
      outputHash: `node-resource:${hashValue({ toolId: input.toolId, readiness })}`,
      outputSummary: `Node execution packet readiness is ${readiness.status}.`,
      reasonCodes: [...reasonCodes, ...readiness.reasonCodes].slice(0, 60),
      metadata: {
        nodeExecutionContract: contractManifest
          ? (contractManifest as unknown as JsonValue)
          : parsed.data.nodeExecutionContractRef,
        nodeExecutionPacket: {
          packetRef: parsed.data.packetRef,
          contentHash: hashValue(parsed.data),
          byteCount: Buffer.byteLength(JSON.stringify(parsed.data), "utf8"),
          boundedSummary: `NodeExecutionPacket ${parsed.data.readinessStatus} for ${parsed.data.nodeId}.`,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } as JsonValue,
        readiness: {
          status: readiness.status,
          reasonCodes: readiness.reasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } as JsonValue,
        progressiveReadiness: {
          progressiveState: progressive.progressiveState,
          actionGateStatus: progressive.actionGateStatus,
          actionGateReasonCodes: progressive.actionGateReasonCodes,
          actionGateMissingFields: progressive.actionGateMissingFields,
          nextLegalTransitions: progressive.nextLegalTransitions,
          allowedWorkerToolIds: progressive.allowedWorkerToolIds.slice(0, 30),
          deniedWorkerToolIds: progressive.deniedWorkerToolIds.slice(0, 30),
          nodeResourceDemandSessionRefCount: progressive.nodeResourceDemandSessionRefs.length,
          nodeResourceLedgerManifestRefCount: progressive.nodeResourceLedgerManifestRefs.length,
          domainResourceSelectionRefCount: progressive.domainResourceSelectionRefs.length,
          targetSnapshotRefCount: progressive.targetSnapshotRefs.length,
          validationRefCount: progressive.validationRefs.length,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        } as JsonValue,
        nodeReadinessState: {
          stateRef: readiness.state.stateRef,
          contentHash: hashValue(readiness.state),
          byteCount: Buffer.byteLength(JSON.stringify(readiness.state), "utf8"),
          boundedSummary: `Node readiness state ${readiness.state.readinessStatus} for ${readiness.state.nodeId}.`,
          readinessStatus: readiness.state.readinessStatus,
          nodeExecutionContractHash: readiness.state.nodeExecutionContractHash,
          nodeExecutionPacketHash: readiness.state.nodeExecutionPacketHash,
          domainResourcePacketHash: readiness.state.domainResourcePacketHash,
          boundaryEpoch: readiness.state.boundaryEpoch,
          staleIfMismatch: readiness.state.staleIfMismatch,
          projectionStatus: readiness.state.projectionStatus,
          reasonCodes: readiness.reasonCodes.slice(0, 20),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        } as JsonValue,
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
