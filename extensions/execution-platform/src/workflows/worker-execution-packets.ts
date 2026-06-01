import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ContextSnapshotRefSchema,
  mergeContextSnapshotRefs,
  validateContextSnapshotFreshness,
  type ContextSnapshotRef,
} from "./context-snapshot.ts";
import {
  EvidenceModeSchema,
  ExecutionIntentSchema,
  type EvidenceMode,
  type ExecutionIntent,
} from "./execution-intent.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

function hashPacket(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: Array<string | null | undefined>, max = 24): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, 260))
    .slice(0, max);
}

function packetRef(kind: string, id: string, body: unknown): string {
  return `runtime-work-graph://${kind}/${id}/${hashPacket(body).slice(0, 16)}`;
}

function contextFreshnessFields(input: {
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
  contextFreshnessSummary?: string;
}) {
  const requiredContextSnapshotRefs = mergeContextSnapshotRefs(
    input.requiredContextSnapshotRefs ?? [],
  );
  const providedContextSnapshotRefs = mergeContextSnapshotRefs(
    input.providedContextSnapshotRefs ?? [],
  );
  if (requiredContextSnapshotRefs.length === 0 && providedContextSnapshotRefs.length === 0) {
    return {
      requiredContextSnapshotRefs,
      providedContextSnapshotRefs,
      staleContextSnapshotRefs: [],
      missingContextSnapshotRefs: [],
      rejectedContextSnapshotRefs: [],
      contextFreshnessStatus: "fresh" as const,
      contextRefreshAction: "none" as const,
      contextFreshnessSummary: bounded(
        input.contextFreshnessSummary ??
          "No explicit context snapshot contract was required for this packet boundary.",
        900,
      ),
    };
  }
  const validation = validateContextSnapshotFreshness({
    requiredRefs: requiredContextSnapshotRefs,
    providedRefs: providedContextSnapshotRefs,
  });
  return {
    requiredContextSnapshotRefs,
    providedContextSnapshotRefs,
    staleContextSnapshotRefs: validation.staleRefs,
    missingContextSnapshotRefs: validation.missingRefs,
    rejectedContextSnapshotRefs: validation.rejectedRefs,
    contextFreshnessStatus: validation.freshnessStatus,
    contextRefreshAction: validation.requiredRefreshAction,
    contextFreshnessSummary: bounded(
      input.contextFreshnessSummary ??
        (validation.valid
          ? "Required context snapshots are fresh for this packet boundary."
          : `Context freshness requires attention: ${validation.reasonCodes.join("; ")}`),
      900,
    ),
  };
}

function hasLegacyNoContextSnapshotContractSentinel(input: {
  requiredContextSnapshotRefs: ContextSnapshotRef[];
  providedContextSnapshotRefs: ContextSnapshotRef[];
  missingContextSnapshotRefs: string[];
  staleContextSnapshotRefs: string[];
  rejectedContextSnapshotRefs: string[];
  contextRefreshAction: string;
  contextFreshnessStatus: string;
}): boolean {
  return (
    input.requiredContextSnapshotRefs.length === 0 &&
    input.providedContextSnapshotRefs.length === 0 &&
    input.staleContextSnapshotRefs.length === 0 &&
    input.rejectedContextSnapshotRefs.length === 0 &&
    input.missingContextSnapshotRefs.length === 1 &&
    input.missingContextSnapshotRefs[0] === "context-snapshot://missing/context" &&
    input.contextRefreshAction === "request_worker_context" &&
    input.contextFreshnessStatus === "missing"
  );
}

export const ResourceHandoffPacketSchema = z
  .object({
    packetKind: z.literal("resource_handoff_packet"),
    schemaVersion: z.literal("execution-platform.resource-handoff-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(260),
    sourceNodeId: boundedString(180),
    targetCommitmentIds: stringList(16, 160),
    sourceContractRefs: stringList(32, 320).default([]),
    sourcePromptExcerptRefs: stringList(24, 320).default([]),
    targetFileRefs: stringList(24, 260),
    relevantFileRefs: stringList(40, 260),
    symbolRefs: stringList(40, 260).default([]),
    testRefs: stringList(32, 260).default([]),
    codeIntelligenceResultRefs: stringList(80, 320).default([]),
    codeIntelligenceSymbolRefs: stringList(80, 320).default([]),
    codeIntelligenceDiagnosticRefs: stringList(80, 320).default([]),
    codeIntelligenceRelatedTestRefs: stringList(80, 320).default([]),
    codeIntelligenceImpactRefs: stringList(80, 320).default([]),
    codeIntelligenceSemanticModes: stringList(8, 80).default([]),
    codeIntelligenceLimitations: stringList(16, 700).default([]),
    recommendedEditPoints: stringList(24, 700),
    existingPatterns: stringList(24, 700),
    risks: stringList(20, 700),
    validationSuggestions: stringList(16, 500),
    handoffSummaryForImplementation: boundedString(1_500),
    handoffSummaryForConsumer: z.string().max(1_500).default(""),
    evidenceClaimRefs: stringList(32, 320).default([]),
    limitations: stringList(12, 700),
    requiredContextSnapshotRefs: z.array(ContextSnapshotRefSchema).max(80).default([]),
    providedContextSnapshotRefs: z.array(ContextSnapshotRefSchema).max(80).default([]),
    contextFreshnessStatus: z
      .enum(["fresh", "stale", "missing", "rejected", "unknown"])
      .default("unknown"),
    contextRefreshAction: z
      .enum([
        "none",
        "request_excerpt",
        "rerun_resource_scout",
        "refresh_replay_checkpoint",
        "request_worker_context",
        "ask_human",
      ])
      .default("request_worker_context"),
    contextFreshnessSummary: z
      .string()
      .max(900)
      .default("Context freshness has not been evaluated."),
    staleContextSnapshotRefs: stringList(80, 320).default([]),
    missingContextSnapshotRefs: stringList(80, 320).default([]),
    rejectedContextSnapshotRefs: stringList(80, 320).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type ResourceHandoffPacket = z.infer<typeof ResourceHandoffPacketSchema>;

export const ImplementationTaskFileSnapshotSchema = z
  .object({
    fileRef: boundedString(260),
    snapshotRef: boundedString(260),
    contentHash: boundedString(96),
    byteCount: z.number().int().min(0).max(20_000_000),
    sourceKind: z.enum(["repo_file", "generated_new_file_intent"]).default("repo_file"),
    freshnessStatus: z.enum(["fresh", "stale", "missing", "unknown"]).default("fresh"),
    rawContentStored: z.literal(false),
  })
  .strict();

export type ImplementationTaskFileSnapshot = z.infer<typeof ImplementationTaskFileSnapshotSchema>;

export const ImplementationTaskNewFileIntentSchema = z
  .object({
    fileRef: boundedString(260),
    reason: boundedString(900),
    expectedPurpose: boundedString(900),
    validationExpectation: boundedString(700),
  })
  .strict();

export type ImplementationTaskNewFileIntent = z.infer<typeof ImplementationTaskNewFileIntentSchema>;

export const ImplementationTaskFileChangeIntentSchema = z
  .object({
    fileRef: boundedString(260),
    symbolOrRegion: boundedString(260),
    intendedChange: boundedString(900),
    whyThisFile: boundedString(900),
  })
  .strict();

export type ImplementationTaskFileChangeIntent = z.infer<
  typeof ImplementationTaskFileChangeIntentSchema
>;

export const ImplementationTaskPacketSchema = z
  .object({
    packetKind: z.literal("implementation_task_packet"),
    schemaVersion: z.literal("execution-platform.implementation-task-packet.v3"),
    packetId: boundedString(180),
    packetRef: boundedString(260),
    runtimeJobId: boundedString(180).default("unknown-runtime-job"),
    workflowId: boundedString(180).default("agent_team.coding"),
    graphId: boundedString(180).default("unknown-graph"),
    sourceGraphNodeId: boundedString(180).default("unknown-node"),
    sourceWorkUnitId: boundedString(180).default("unknown-work-unit"),
    microtaskId: boundedString(180),
    microtaskTitle: boundedString(300),
    executionIntent: ExecutionIntentSchema.default("unspecified"),
    evidenceMode: z.array(EvidenceModeSchema).max(12).default([]),
    exactEditObjective: boundedString(1_200),
    taskSummary: boundedString(2_500),
    whyThisWorkerWasSelected: boundedString(1_200),
    expectedOutput: boundedString(1_200),
    expectedPatchShape: z
      .string()
      .trim()
      .max(1_200)
      .default(
        "Produce bounded source edits against the allowed refs, then return changed-file refs, validation refs, and commitment-linked evidence claims.",
      ),
    targetCommitmentIds: stringList(16, 160),
    domainResourceSelectionRefs: stringList(24, 260).default([]),
    targetFileRefs: stringList(24, 260),
    targetFileSnapshots: z.array(ImplementationTaskFileSnapshotSchema).max(80).default([]),
    newFileIntents: z.array(ImplementationTaskNewFileIntentSchema).max(24).default([]),
    fileChangeIntents: z.array(ImplementationTaskFileChangeIntentSchema).max(40).default([]),
    allowedFileRefs: stringList(80, 260),
    allowedEditScope: stringList(80, 260).default([]),
    mustReadRefs: stringList(80, 260).default([]),
    likelyModifyRefs: stringList(80, 260).default([]),
    deniedFileRefs: stringList(40, 260),
    contextPacketRefs: stringList(24, 260),
    sourceContractRefs: stringList(40, 260).default([]),
    sourceResourceHandoffRefs: stringList(40, 260).default([]),
    sourcePromptExcerptRefs: stringList(24, 260),
    priorNodeOutputRefs: stringList(24, 260),
    validationCommandRefs: stringList(16, 260),
    validationDiscoveryPlan: stringList(12, 700).default([]),
    acceptanceCriteria: stringList(16, 700),
    expectedEvidenceClaimKinds: stringList(16, 120),
    evidenceClaimExpectations: stringList(16, 700).default([]),
    stopIfMissingOrEscalate: stringList(12, 700),
    budgetPolicyRefs: stringList(12, 260),
    capabilityFit: z
      .string()
      .trim()
      .max(900)
      .default("Capability fit was selected by scheduler policy."),
    costAndEscalationPolicy: z
      .string()
      .trim()
      .max(900)
      .default(
        "Use the cheapest sufficiently capable implementation lane and escalate only after bounded repair/context request.",
      ),
    downstreamConsumer: boundedString(260),
    successEvidenceDescriptions: stringList(12, 700),
    existingApisAndTypes: stringList(32, 700).default([]),
    knownTests: stringList(32, 500).default([]),
    dependencyNotes: stringList(24, 700).default([]),
    riskAndBlastRadius: stringList(24, 700).default([]),
    repairHistoryRefs: stringList(12, 260),
    requiredContextSnapshotRefs: z.array(ContextSnapshotRefSchema).max(80).default([]),
    providedContextSnapshotRefs: z.array(ContextSnapshotRefSchema).max(80).default([]),
    staleContextSnapshotRefs: stringList(80, 320).default([]),
    missingContextSnapshotRefs: stringList(80, 320).default([]),
    rejectedContextSnapshotRefs: stringList(80, 320).default([]),
    contextFreshnessStatus: z
      .enum(["fresh", "stale", "missing", "rejected", "unknown"])
      .default("unknown"),
    contextRefreshAction: z
      .enum([
        "none",
        "request_excerpt",
        "rerun_resource_scout",
        "refresh_replay_checkpoint",
        "request_worker_context",
        "ask_human",
      ])
      .default("request_worker_context"),
    contextFreshnessSummary: z
      .string()
      .max(900)
      .default("Context freshness has not been evaluated."),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
  })
  .strict();

export type ImplementationTaskPacket = z.infer<typeof ImplementationTaskPacketSchema>;

export type ImplementationTaskPacketValidation = {
  valid: boolean;
  status: "ready" | "needs_context" | "invalid";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export function buildResourceHandoffPacket(input: {
  sourceNodeId: string;
  targetCommitmentIds: string[];
  sourceContractRefs?: string[];
  sourcePromptExcerptRefs?: string[];
  targetFileRefs?: string[];
  relevantFileRefs?: string[];
  symbolRefs?: string[];
  testRefs?: string[];
  codeIntelligenceResultRefs?: string[];
  codeIntelligenceSymbolRefs?: string[];
  codeIntelligenceDiagnosticRefs?: string[];
  codeIntelligenceRelatedTestRefs?: string[];
  codeIntelligenceImpactRefs?: string[];
  codeIntelligenceSemanticModes?: string[];
  codeIntelligenceLimitations?: string[];
  recommendedEditPoints?: string[];
  existingPatterns?: string[];
  risks?: string[];
  validationSuggestions?: string[];
  handoffSummaryForImplementation: string;
  handoffSummaryForConsumer?: string;
  evidenceClaimRefs?: string[];
  limitations?: string[];
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
}): ResourceHandoffPacket {
  const base = {
    packetKind: "resource_handoff_packet" as const,
    schemaVersion: "execution-platform.resource-handoff-packet.v1" as const,
    packetId: `${input.sourceNodeId}:${hashPacket(input).slice(0, 12)}`,
    packetRef: "pending",
    sourceNodeId: bounded(input.sourceNodeId, 180),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 16),
    sourceContractRefs: uniqueStrings(input.sourceContractRefs ?? [], 32),
    sourcePromptExcerptRefs: uniqueStrings(input.sourcePromptExcerptRefs ?? [], 24),
    targetFileRefs: uniqueStrings(input.targetFileRefs ?? [], 24),
    relevantFileRefs: uniqueStrings(input.relevantFileRefs ?? [], 40),
    symbolRefs: uniqueStrings(input.symbolRefs ?? [], 40),
    testRefs: uniqueStrings(input.testRefs ?? [], 32),
    codeIntelligenceResultRefs: uniqueStrings(input.codeIntelligenceResultRefs ?? [], 80),
    codeIntelligenceSymbolRefs: uniqueStrings(input.codeIntelligenceSymbolRefs ?? [], 80),
    codeIntelligenceDiagnosticRefs: uniqueStrings(input.codeIntelligenceDiagnosticRefs ?? [], 80),
    codeIntelligenceRelatedTestRefs: uniqueStrings(input.codeIntelligenceRelatedTestRefs ?? [], 80),
    codeIntelligenceImpactRefs: uniqueStrings(input.codeIntelligenceImpactRefs ?? [], 80),
    codeIntelligenceSemanticModes: uniqueStrings(input.codeIntelligenceSemanticModes ?? [], 8),
    codeIntelligenceLimitations: uniqueStrings(input.codeIntelligenceLimitations ?? [], 16),
    recommendedEditPoints: uniqueStrings(input.recommendedEditPoints ?? [], 24),
    existingPatterns: uniqueStrings(input.existingPatterns ?? [], 24),
    risks: uniqueStrings(input.risks ?? [], 20),
    validationSuggestions: uniqueStrings(input.validationSuggestions ?? [], 16),
    handoffSummaryForImplementation: bounded(input.handoffSummaryForImplementation, 1_500),
    handoffSummaryForConsumer: bounded(input.handoffSummaryForConsumer ?? "", 1_500),
    evidenceClaimRefs: uniqueStrings(input.evidenceClaimRefs ?? [], 32),
    limitations: uniqueStrings(input.limitations ?? [], 12),
    ...contextFreshnessFields({
      requiredContextSnapshotRefs: input.requiredContextSnapshotRefs ?? [],
      providedContextSnapshotRefs: input.providedContextSnapshotRefs ?? [],
      contextFreshnessSummary: "Context scout handoff freshness is tracked by runtime snapshots.",
    }),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
  };
  return ResourceHandoffPacketSchema.parse({
    ...base,
    packetRef: packetRef("resource-handoff-packet", base.packetId, base),
  });
}

export function buildImplementationTaskPacket(input: {
  runtimeJobId?: string;
  workflowId?: string;
  graphId?: string;
  sourceGraphNodeId?: string;
  sourceWorkUnitId?: string;
  microtaskId?: string;
  microtaskTitle?: string;
  executionIntent?: ExecutionIntent;
  evidenceMode?: EvidenceMode[];
  exactEditObjective: string;
  taskSummary: string;
  whyThisWorkerWasSelected?: string;
  expectedOutput?: string;
  expectedPatchShape?: string;
  targetCommitmentIds?: string[];
  domainResourceSelectionRefs?: string[];
  targetFileRefs?: string[];
  targetFileSnapshots?: ImplementationTaskFileSnapshot[];
  newFileIntents?: ImplementationTaskNewFileIntent[];
  fileChangeIntents?: ImplementationTaskFileChangeIntent[];
  allowedFileRefs: string[];
  allowedEditScope?: string[];
  mustReadRefs?: string[];
  likelyModifyRefs?: string[];
  deniedFileRefs?: string[];
  contextPacketRefs?: string[];
  sourceContractRefs?: string[];
  sourceResourceHandoffRefs?: string[];
  sourcePromptExcerptRefs?: string[];
  priorNodeOutputRefs?: string[];
  validationCommandRefs?: string[];
  validationDiscoveryPlan?: string[];
  acceptanceCriteria?: string[];
  expectedEvidenceClaimKinds?: string[];
  evidenceClaimExpectations?: string[];
  stopIfMissingOrEscalate?: string[];
  budgetPolicyRefs?: string[];
  capabilityFit?: string;
  costAndEscalationPolicy?: string;
  downstreamConsumer?: string;
  successEvidenceDescriptions?: string[];
  existingApisAndTypes?: string[];
  knownTests?: string[];
  dependencyNotes?: string[];
  riskAndBlastRadius?: string[];
  repairHistoryRefs?: string[];
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
  contextFreshnessSummary?: string;
}): ImplementationTaskPacket {
  const microtaskId = bounded(
    input.microtaskId ?? `implementation-${hashPacket(input).slice(0, 12)}`,
    180,
  );
  const base = {
    packetKind: "implementation_task_packet" as const,
    schemaVersion: "execution-platform.implementation-task-packet.v3" as const,
    packetId: microtaskId,
    packetRef: "pending",
    runtimeJobId: bounded(input.runtimeJobId ?? "unknown-runtime-job", 180),
    workflowId: bounded(input.workflowId ?? "agent_team.coding", 180),
    graphId: bounded(input.graphId ?? "unknown-graph", 180),
    sourceGraphNodeId: bounded(input.sourceGraphNodeId ?? "unknown-node", 180),
    sourceWorkUnitId: bounded(input.sourceWorkUnitId ?? input.microtaskId ?? microtaskId, 180),
    microtaskId,
    microtaskTitle: bounded(input.microtaskTitle ?? "Scoped implementation task", 300),
    executionIntent: input.executionIntent ?? "source_edit",
    evidenceMode: uniqueStrings(
      input.evidenceMode ??
        (input.validationCommandRefs?.length
          ? ["changed_file_evidence", "validation_evidence"]
          : ["changed_file_evidence"]),
      12,
    ),
    exactEditObjective: bounded(input.exactEditObjective, 1_200),
    taskSummary: bounded(input.taskSummary, 2_500),
    whyThisWorkerWasSelected: bounded(
      input.whyThisWorkerWasSelected ??
        "The scheduler selected this worker as the smallest sufficiently capable implementation lane for the bounded task.",
      1_200,
    ),
    expectedOutput: bounded(
      input.expectedOutput ??
        "Changed-file refs, validation refs, and commitment-linked evidence claims or a precise escalation/context request.",
      1_200,
    ),
    expectedPatchShape: bounded(
      input.expectedPatchShape ??
        "Produce bounded source edits against the allowed refs, then return changed-file refs, validation refs, and commitment-linked evidence claims.",
      1_200,
    ),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds ?? [], 16),
    domainResourceSelectionRefs: uniqueStrings(input.domainResourceSelectionRefs ?? [], 24),
    targetFileRefs: uniqueStrings(input.targetFileRefs ?? [], 24),
    targetFileSnapshots: input.targetFileSnapshots ?? [],
    newFileIntents: input.newFileIntents ?? [],
    fileChangeIntents: (input.fileChangeIntents ?? []).slice(0, 40),
    allowedFileRefs: uniqueStrings(input.allowedFileRefs, 80),
    allowedEditScope: uniqueStrings(input.allowedEditScope ?? input.allowedFileRefs, 80),
    mustReadRefs: uniqueStrings(input.mustReadRefs ?? input.targetFileRefs ?? [], 80),
    likelyModifyRefs: uniqueStrings(input.likelyModifyRefs ?? input.targetFileRefs ?? [], 80),
    deniedFileRefs: uniqueStrings(input.deniedFileRefs ?? [], 40),
    contextPacketRefs: uniqueStrings(input.contextPacketRefs ?? [], 24),
    sourceContractRefs: uniqueStrings(input.sourceContractRefs ?? [], 40),
    sourceResourceHandoffRefs: uniqueStrings(input.sourceResourceHandoffRefs ?? [], 40),
    sourcePromptExcerptRefs: uniqueStrings(input.sourcePromptExcerptRefs ?? [], 24),
    priorNodeOutputRefs: uniqueStrings(input.priorNodeOutputRefs ?? [], 24),
    validationCommandRefs: uniqueStrings(input.validationCommandRefs ?? [], 16),
    validationDiscoveryPlan: uniqueStrings(input.validationDiscoveryPlan ?? [], 12),
    acceptanceCriteria: uniqueStrings(input.acceptanceCriteria ?? [input.exactEditObjective], 16),
    expectedEvidenceClaimKinds: uniqueStrings(
      input.expectedEvidenceClaimKinds ??
        (input.validationCommandRefs?.length
          ? ["source_change", "test_validation"]
          : ["source_change"]),
      16,
    ),
    evidenceClaimExpectations: uniqueStrings(
      input.evidenceClaimExpectations ??
        input.successEvidenceDescriptions ??
        input.acceptanceCriteria ?? [input.exactEditObjective],
      16,
    ),
    stopIfMissingOrEscalate: uniqueStrings(
      input.stopIfMissingOrEscalate ?? [
        "Request bounded context before editing when target refs, acceptance criteria, or validation expectations are insufficient.",
        "Escalate to Codex or human review after bounded repair if source edits cannot be safely produced.",
      ],
      12,
    ),
    budgetPolicyRefs: uniqueStrings(input.budgetPolicyRefs ?? [], 12),
    capabilityFit: bounded(
      input.capabilityFit ?? "Capability fit was selected by scheduler policy.",
      900,
    ),
    costAndEscalationPolicy: bounded(
      input.costAndEscalationPolicy ??
        "Use the cheapest sufficiently capable implementation lane and escalate only after bounded repair/context request.",
      900,
    ),
    downstreamConsumer: bounded(input.downstreamConsumer ?? "validation_and_review", 260),
    successEvidenceDescriptions: uniqueStrings(
      input.successEvidenceDescriptions ?? input.acceptanceCriteria ?? [input.exactEditObjective],
      12,
    ),
    existingApisAndTypes: uniqueStrings(input.existingApisAndTypes ?? [], 32),
    knownTests: uniqueStrings(input.knownTests ?? [], 32),
    dependencyNotes: uniqueStrings(input.dependencyNotes ?? [], 24),
    riskAndBlastRadius: uniqueStrings(input.riskAndBlastRadius ?? [], 24),
    repairHistoryRefs: uniqueStrings(input.repairHistoryRefs ?? [], 12),
    ...contextFreshnessFields({
      requiredContextSnapshotRefs: input.requiredContextSnapshotRefs ?? [],
      providedContextSnapshotRefs: input.providedContextSnapshotRefs ?? [],
      contextFreshnessSummary: input.contextFreshnessSummary,
    }),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
  };
  return ImplementationTaskPacketSchema.parse({
    ...base,
    packetRef: packetRef("implementation-task-packet", microtaskId, base),
  });
}

export function validateImplementationTaskPacketForWorker(
  packet: ImplementationTaskPacket,
): ImplementationTaskPacketValidation {
  const reasonCodes: string[] = [];
  if (packet.executionIntent === "unspecified") {
    reasonCodes.push("implementation_task_packet_execution_intent_missing");
  }
  if (packet.executionIntent !== "source_edit") {
    reasonCodes.push("implementation_task_packet_execution_intent_not_source_edit");
  }
  if (!packet.evidenceMode.includes("changed_file_evidence")) {
    reasonCodes.push("implementation_task_packet_changed_file_evidence_mode_missing");
  }
  if (!packet.exactEditObjective.trim()) {
    reasonCodes.push("implementation_task_packet_objective_missing");
  }
  if (packet.targetFileRefs.length === 0 || packet.allowedFileRefs.length === 0) {
    reasonCodes.push("implementation_task_packet_target_scope_missing");
  }
  if (packet.executionIntent === "source_edit" && packet.domainResourceSelectionRefs.length === 0) {
    reasonCodes.push("implementation_task_packet_domain_resource_selection_refs_missing");
  }
  const directoryOnlyTargetRefs = packet.targetFileRefs.filter((ref) => ref.trim().endsWith("/"));
  if (directoryOnlyTargetRefs.length > 0) {
    reasonCodes.push("implementation_task_packet_directory_only_target_ref");
  }
  const snapshotFileRefs = new Set(packet.targetFileSnapshots.map((snapshot) => snapshot.fileRef));
  const newFileIntentRefs = new Set(packet.newFileIntents.map((intent) => intent.fileRef));
  const missingSnapshotRefs = packet.targetFileRefs.filter(
    (ref) => !ref.trim().endsWith("/") && !snapshotFileRefs.has(ref) && !newFileIntentRefs.has(ref),
  );
  if (packet.targetFileRefs.length > 0 && missingSnapshotRefs.length > 0) {
    reasonCodes.push("implementation_task_packet_target_snapshot_missing");
  }
  if (packet.targetFileSnapshots.length === 0 && packet.newFileIntents.length === 0) {
    reasonCodes.push("implementation_task_packet_target_snapshots_or_new_file_intent_missing");
  }
  const targetFileRefSet = new Set(packet.targetFileRefs);
  const allowedFileRefSet = new Set(packet.allowedFileRefs);
  const intentFileRefs = new Set(packet.fileChangeIntents.map((intent) => intent.fileRef));
  const fileChangeIntentRefsOutOfScope = packet.fileChangeIntents.filter(
    (intent) => !targetFileRefSet.has(intent.fileRef) && !allowedFileRefSet.has(intent.fileRef),
  );
  if (fileChangeIntentRefsOutOfScope.length > 0) {
    reasonCodes.push("implementation_task_packet_file_change_intent_ref_out_of_scope");
  }
  const multiFileOrMultiCommitment =
    packet.targetFileRefs.length > 1 || packet.targetCommitmentIds.length > 1;
  if (multiFileOrMultiCommitment && packet.fileChangeIntents.length === 0) {
    reasonCodes.push("implementation_task_packet_file_change_intents_missing");
  }
  if (multiFileOrMultiCommitment) {
    const missingIntentCoverage = packet.targetFileRefs.filter(
      (ref) => !intentFileRefs.has(ref) && !newFileIntentRefs.has(ref),
    );
    if (missingIntentCoverage.length > 0) {
      reasonCodes.push("implementation_task_packet_file_change_intent_coverage_missing");
    }
  }
  if (packet.allowedEditScope.length === 0 || packet.mustReadRefs.length === 0) {
    reasonCodes.push("implementation_task_packet_edit_scope_or_must_read_refs_missing");
  }
  if (packet.acceptanceCriteria.length === 0) {
    reasonCodes.push("implementation_task_packet_acceptance_criteria_missing");
  }
  if (packet.validationCommandRefs.length === 0 && packet.validationDiscoveryPlan.length === 0) {
    reasonCodes.push("implementation_task_packet_validation_refs_missing");
  }
  if (packet.targetCommitmentIds.length === 0) {
    reasonCodes.push("implementation_task_packet_commitment_mapping_missing");
  }
  if (
    packet.expectedEvidenceClaimKinds.length === 0 ||
    packet.evidenceClaimExpectations.length === 0
  ) {
    reasonCodes.push("implementation_task_packet_evidence_expectations_missing");
  }
  if (packet.rawPromptStored || packet.rawResponseStored || packet.rawProviderLogStored) {
    reasonCodes.push("implementation_task_packet_raw_storage_flag_invalid");
  }
  if (packet.rawToolLogStored || packet.rawCommandLogStored) {
    reasonCodes.push("implementation_task_packet_raw_runtime_log_flag_invalid");
  }
  const hasContext =
    packet.contextPacketRefs.length > 0 ||
    packet.sourcePromptExcerptRefs.length > 0 ||
    packet.priorNodeOutputRefs.length > 0;
  if (!hasContext) {
    reasonCodes.push("implementation_task_packet_context_request_required");
  }
  const contextFreshness = validateContextSnapshotFreshness({
    requiredRefs: packet.requiredContextSnapshotRefs,
    providedRefs: packet.providedContextSnapshotRefs,
  });
  const legacyNoContextSnapshotContractSentinel = hasLegacyNoContextSnapshotContractSentinel({
    requiredContextSnapshotRefs: packet.requiredContextSnapshotRefs,
    providedContextSnapshotRefs: packet.providedContextSnapshotRefs,
    missingContextSnapshotRefs: packet.missingContextSnapshotRefs,
    staleContextSnapshotRefs: packet.staleContextSnapshotRefs,
    rejectedContextSnapshotRefs: packet.rejectedContextSnapshotRefs,
    contextRefreshAction: packet.contextRefreshAction,
    contextFreshnessStatus: packet.contextFreshnessStatus,
  });
  const effectiveMissingContextSnapshotRefs = legacyNoContextSnapshotContractSentinel
    ? []
    : packet.missingContextSnapshotRefs;
  const effectiveRejectedContextSnapshotRefs = legacyNoContextSnapshotContractSentinel
    ? []
    : packet.rejectedContextSnapshotRefs;
  const effectiveStaleContextSnapshotRefs = legacyNoContextSnapshotContractSentinel
    ? []
    : packet.staleContextSnapshotRefs;
  const effectiveContextRefreshAction = legacyNoContextSnapshotContractSentinel
    ? "none"
    : packet.contextRefreshAction;
  const effectiveContextFreshnessStatus = legacyNoContextSnapshotContractSentinel
    ? "fresh"
    : packet.contextFreshnessStatus;
  if (legacyNoContextSnapshotContractSentinel) {
    reasonCodes.push("implementation_task_packet_legacy_context_snapshot_no_contract_normalized");
  }
  if (packet.requiredContextSnapshotRefs.length > 0 && !contextFreshness.valid) {
    reasonCodes.push(...contextFreshness.reasonCodes);
  }
  if (
    packet.requiredContextSnapshotRefs.length > 0 &&
    packet.providedContextSnapshotRefs.length === 0
  ) {
    reasonCodes.push("implementation_task_packet_required_context_snapshots_missing");
  }
  if (effectiveMissingContextSnapshotRefs.length > 0) {
    reasonCodes.push("implementation_task_packet_missing_context_snapshot_refs");
  }
  if (effectiveRejectedContextSnapshotRefs.length > 0) {
    reasonCodes.push("implementation_task_packet_rejected_context_snapshot_refs");
  }
  if (effectiveStaleContextSnapshotRefs.length > 0) {
    reasonCodes.push("implementation_task_packet_stale_context_snapshot_refs");
  }
  const contextRefreshRequestsWorkerContext =
    effectiveContextRefreshAction === "request_worker_context" &&
    (effectiveMissingContextSnapshotRefs.length > 0 ||
      effectiveRejectedContextSnapshotRefs.length > 0 ||
      effectiveStaleContextSnapshotRefs.length > 0 ||
      effectiveContextFreshnessStatus === "missing" ||
      effectiveContextFreshnessStatus === "rejected" ||
      effectiveContextFreshnessStatus === "stale");
  if (contextRefreshRequestsWorkerContext) {
    reasonCodes.push("implementation_task_packet_context_refresh_action_request_worker_context");
  }
  const hasContextSnapshotContract =
    packet.requiredContextSnapshotRefs.length > 0 ||
    packet.providedContextSnapshotRefs.length > 0 ||
    effectiveMissingContextSnapshotRefs.length > 0 ||
    effectiveRejectedContextSnapshotRefs.length > 0 ||
    effectiveStaleContextSnapshotRefs.length > 0 ||
    contextRefreshRequestsWorkerContext;
  if (
    hasContextSnapshotContract &&
    (effectiveContextFreshnessStatus === "stale" ||
      effectiveContextFreshnessStatus === "missing" ||
      effectiveContextFreshnessStatus === "rejected" ||
      effectiveContextFreshnessStatus === "unknown")
  ) {
    reasonCodes.push(`implementation_task_packet_context_${effectiveContextFreshnessStatus}`);
  }
  const invalid = reasonCodes.some(
    (code) =>
      code !== "implementation_task_packet_legacy_context_snapshot_no_contract_normalized" &&
      code !== "implementation_task_packet_context_request_required" &&
      code !== "implementation_task_packet_validation_refs_missing" &&
      code !== "implementation_task_packet_commitment_mapping_missing" &&
      code !== "implementation_task_packet_target_snapshot_missing" &&
      code !== "implementation_task_packet_target_snapshots_or_new_file_intent_missing" &&
      code !== "implementation_task_packet_file_change_intents_missing" &&
      code !== "implementation_task_packet_file_change_intent_coverage_missing" &&
      code !== "implementation_task_packet_missing_context_snapshot_refs" &&
      code !== "implementation_task_packet_rejected_context_snapshot_refs" &&
      code !== "implementation_task_packet_stale_context_snapshot_refs" &&
      !code.startsWith("context_snapshot_") &&
      !code.startsWith("implementation_task_packet_context_") &&
      code !== "implementation_task_packet_required_context_snapshots_missing",
  );
  return {
    valid: !invalid,
    status: invalid
      ? "invalid"
      : reasonCodes.some(
            (code) =>
              code === "implementation_task_packet_context_request_required" ||
              code === "implementation_task_packet_validation_refs_missing" ||
              code === "implementation_task_packet_commitment_mapping_missing" ||
              code === "implementation_task_packet_target_snapshot_missing" ||
              code === "implementation_task_packet_target_snapshots_or_new_file_intent_missing" ||
              code === "implementation_task_packet_file_change_intents_missing" ||
              code === "implementation_task_packet_file_change_intent_coverage_missing" ||
              code === "implementation_task_packet_missing_context_snapshot_refs" ||
              code === "implementation_task_packet_rejected_context_snapshot_refs" ||
              code === "implementation_task_packet_stale_context_snapshot_refs" ||
              code === "implementation_task_packet_context_refresh_action_request_worker_context" ||
              code.startsWith("context_snapshot_") ||
              code.startsWith("implementation_task_packet_context_") ||
              code === "implementation_task_packet_required_context_snapshots_missing",
          )
        ? "needs_context"
        : "ready",
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
