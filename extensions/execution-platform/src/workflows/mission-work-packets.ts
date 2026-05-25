import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
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
import type {
  MissionCommitment,
  MissionContractLedger,
  MissionContractLedgerSummary,
} from "./mission-contract-ledger.ts";
import { summarizeMissionContractLedger } from "./mission-contract-ledger.ts";
// INVARIANT: All ledger and packet surfaces must use bounded refs only.
// Raw content storage flags must be explicitly set to false at schema level.

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

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
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
    input.contextRefreshAction === "block_implementation" &&
    input.contextFreshnessStatus === "missing"
  );
}

function packetRef(kind: string, id: string, body: unknown): string {
  return `runtime-work-graph://${kind}/${id}/${hashPacket(body).slice(0, 16)}`;
}

export const CommitmentWorkPacketSchema = z
  .object({
    packetKind: z.literal("commitment_work_packet"),
    schemaVersion: z.literal("execution-platform.commitment-work-packet.v1"),
    authoringSource: z.enum(["model_authored", "deterministic_fallback"]),
    qualityStatus: z.enum(["accepted", "accepted_with_limitations", "needs_review", "unreviewed"]),
    packetId: boundedString(180),
    packetRef: boundedString(260),
    missionId: boundedString(180),
    commitmentId: boundedString(160),
    commitmentText: boundedString(1_200),
    commitmentMeaning: boundedString(1_500),
    ownerIntentSummary: boundedString(1_200),
    whyItMatters: boundedString(900),
    workerObjective: boundedString(1_500),
    contextScoutObjective: boundedString(1_500),
    implementationObjective: boundedString(1_500),
    validationObjective: boundedString(1_200),
    reviewObjective: boundedString(1_200),
    expectedEvidenceDescriptions: stringList(8, 900),
    expectedEvidenceKinds: stringList(8, 120),
    acceptanceCriteria: stringList(12, 700),
    remainingWork: stringList(12, 700),
    relevantConstraints: stringList(16, 700),
    explicitNonGoals: stringList(12, 500),
    likelyRepoAreas: stringList(12, 260),
    requiredContextQuestions: stringList(8, 700),
    allowedContextRequestHints: stringList(8, 700),
    expectedContextScoutOutput: stringList(8, 700),
    expectedImplementationOutput: stringList(8, 700),
    expectedValidationOutput: stringList(8, 700),
    expectedReviewReadbackOutput: stringList(8, 700),
    requiredEvidenceClaimDescriptions: stringList(12, 700),
    stopIfMissing: stringList(8, 700),
    packetQualityReviewRefs: stringList(8, 260),
    uncertaintiesAndRisks: stringList(12, 700),
    downstreamConsumer: boundedString(260),
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
        "rerun_context_scout",
        "rerun_context_synthesis",
        "refresh_replay_checkpoint",
        "block_implementation",
        "ask_human",
      ])
      .default("block_implementation"),
    contextFreshnessSummary: z
      .string()
      .max(900)
      .default("Context freshness has not been evaluated."),
    // Synthesis enrichment fields are runtime-populated after context scout and
    // synthesis. Packet authoring precedes that phase, so these must default
    // empty and the scheduler owns the later synthesis-quality gate.
    // Scheduler MUST NOT select implementation graph until synthesisQualityReviewed
    // is true, synthesisQualityGatePassed is true, synthesisValidationStrategy is
    // non-empty, and at least one synthesisImplementationGroups entry exists.
    // Scheduler gate: requires at least one non-runtime context source.
    // HARDENED: runtimeSuppliedRefRejected must be false for at least one
    // verified context source with acceptedContextSource !== "runtime_supplied".
    // If all context sources are runtime_supplied, scheduler MUST reject
    // implementation graph selection regardless of other synthesis flags.
    // ENFORCED: synthesisValidationStrategy must contain at least one entry
    // describing how the implementation group will be validated before merge.
    // ENFORCED: synthesisEscalationTriggers must contain at least one entry
    // describing conditions that trigger escalation to human or higher model.
    synthesisImplementationGroups: stringList(12, 700).default([]),
    synthesisDependencies: stringList(12, 700).default([]),
    synthesisRisks: stringList(12, 700).default([]),
    synthesisValidationStrategy: stringList(8, 700).default([]),
    synthesisEscalationTriggers: stringList(8, 700).default([]),
    synthesisQualityReviewed: z.boolean().default(false),
    synthesisQualityGatePassed: z.boolean().default(false),
    // Explicit gate flag: at least one non-runtime source accepted.
    // This flag is set by the scheduler ONLY after verifying the associated
    // ContextScoutSufficiencyReview has at least one verified ref with
    // acceptedContextSource !== "runtime_supplied" and runtimeSuppliedRefRejected === false.
    synthesisHasNonRuntimeContextSource: z.boolean().default(false),
    rawFileContentStored: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false).default(false),
    rawToolLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false).default(false),
  })
  .strict();

export type CommitmentWorkPacket = z.infer<typeof CommitmentWorkPacketSchema>;

// Scheduler gate function: rejects implementation graph selection unless
// synthesis quality criteria and non-runtime context source are satisfied.
export function canSelectImplementationGraph(packet: CommitmentWorkPacket): boolean {
  if (!packet.synthesisQualityReviewed) {
    return false;
  }
  if (!packet.synthesisQualityGatePassed) {
    return false;
  }
  if (packet.synthesisValidationStrategy.length === 0) {
    return false;
  }
  if (packet.synthesisImplementationGroups.length === 0) {
    return false;
  }
  if (!packet.synthesisHasNonRuntimeContextSource) {
    return false;
  }
  // All raw storage flags must be false (bounded refs only)
  if (packet.rawFileContentStored) {
    return false;
  }
  if (packet.rawPromptStored) {
    return false;
  }
  if (packet.rawResponseStored) {
    return false;
  }
  return true;
}

// Scheduler gate enforcement helper.
// Returns true only when synthesis quality is substantively reviewed and
// at least one non-runtime context source has been accepted.
export function commitmentWorkPacketSynthesisGateReady(packet: CommitmentWorkPacket): boolean {
  if (!packet.synthesisQualityReviewed) {
    return false;
  }
  if (!packet.synthesisQualityGatePassed) {
    return false;
  }
  if (!packet.synthesisHasNonRuntimeContextSource) {
    return false;
  }
  if (packet.synthesisValidationStrategy.length === 0) {
    return false;
  }
  if (packet.synthesisEscalationTriggers.length === 0) {
    return false;
  }
  if (packet.synthesisImplementationGroups.length === 0) {
    return false;
  }
  return true;
}

export const CommitmentPacketQualityReviewSchema = z
  .object({
    packetKind: z.literal("commitment_packet_quality_review"),
    schemaVersion: z.literal("execution-platform.commitment-packet-quality-review.v1"),
    reviewId: boundedString(180),
    reviewRef: boundedString(260),
    missionId: boundedString(180),
    status: z.enum([
      "accepted",
      "accepted_with_limitations",
      "needs_repair_blocking",
      "needs_review_nonblocking",
    ]),
    packetReviews: z
      .array(
        z
          .object({
            packetRef: boundedString(260),
            commitmentId: boundedString(160),
            status: z.enum([
              "accepted",
              "accepted_with_limitations",
              "needs_repair_blocking",
              "needs_review_nonblocking",
            ]),
            specificEnoughForContextScout: z.boolean(),
            specificEnoughForImplementation: z.boolean(),
            specificEnoughForValidation: z.boolean(),
            specificEnoughForReview: z.boolean(),
            preservesOwnerIntent: z.boolean(),
            blockingRepairRequired: z.boolean(),
            missingInformation: stringList(8, 500),
            repairInstructions: stringList(8, 700),
            insufficientFields: z
              .array(
                z
                  .object({
                    path: boundedString(220),
                    whyInsufficient: boundedString(700),
                    blocking: z.boolean(),
                  })
                  .strict(),
              )
              .max(12),
          })
          .strict(),
      )
      .max(40),
    reviewerSummary: boundedString(1_500),
    // Bounded refs only: raw content must never be stored in the review surface
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type CommitmentPacketQualityReview = z.infer<typeof CommitmentPacketQualityReviewSchema>;

export const ContextHandoffPacketSchema = z
  .object({
    packetKind: z.literal("context_handoff_packet"),
    schemaVersion: z.literal("execution-platform.context-handoff-packet.v1"),
    packetId: boundedString(180),
    packetRef: boundedString(260),
    sourceNodeId: boundedString(180),
    targetCommitmentIds: stringList(16, 160),
    commitmentWorkPacketRefs: stringList(32, 320).default([]),
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
    handoffSummaryForSynthesis: z.string().max(1_500).default(""),
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
        "rerun_context_scout",
        "rerun_context_synthesis",
        "refresh_replay_checkpoint",
        "block_implementation",
        "ask_human",
      ])
      .default("block_implementation"),
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

export type ContextHandoffPacket = z.infer<typeof ContextHandoffPacketSchema>;

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
    sourceCommitmentPacketRefs: stringList(40, 260).default([]),
    sourceContextHandoffRefs: stringList(40, 260).default([]),
    sourcePromptExcerptRefs: stringList(24, 260),
    contextSynthesisRefs: stringList(24, 260),
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
        "rerun_context_scout",
        "rerun_context_synthesis",
        "refresh_replay_checkpoint",
        "block_implementation",
        "ask_human",
      ])
      .default("block_implementation"),
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

export function compileCommitmentWorkPackets(input: {
  ledger: MissionContractLedger;
  likelyRepoAreasByCommitmentId?: Record<string, string[]>;
}): CommitmentWorkPacket[] {
  const summary = summarizeMissionContractLedger(input.ledger);
  const constraints = input.ledger.safetyConstraints.map(
    (constraint) => `${constraint.boundaryKind}: ${constraint.constraintText}`,
  );
  const commitments: MissionCommitment[] = [
    ...input.ledger.blockingCommitments,
    ...input.ledger.nonBlockingCommitments,
  ];
  return commitments.map((commitment): CommitmentWorkPacket => {
    const remainingWork =
      commitment.remainingWork.length > 0
        ? commitment.remainingWork
        : [`Advance commitment ${commitment.commitmentId} with bounded runtime evidence.`];
    const acceptanceCriteria = uniqueStrings(
      [commitment.commitmentText, commitment.expectedEvidenceDescription, ...remainingWork],
      12,
    );
    const base = {
      packetKind: "commitment_work_packet" as const,
      schemaVersion: "execution-platform.commitment-work-packet.v1" as const,
      authoringSource: "deterministic_fallback" as const,
      qualityStatus: "unreviewed" as const,
      packetId: `${summary.missionId}:${commitment.commitmentId}`,
      packetRef: "pending",
      missionId: summary.missionId,
      commitmentId: commitment.commitmentId,
      commitmentText: bounded(commitment.commitmentText, 1_200),
      commitmentMeaning: bounded(commitment.commitmentText, 1_500),
      ownerIntentSummary: bounded(input.ledger.ownerObjectiveSummary ?? summary.missionId, 1_200),
      whyItMatters: bounded(commitment.whyItMatters ?? commitment.commitmentText, 900),
      workerObjective: bounded(remainingWork.join(" "), 1_500),
      contextScoutObjective: bounded(
        `Find existing repo files and constraints needed to advance ${commitment.commitmentId}.`,
        1_500,
      ),
      implementationObjective: bounded(remainingWork.join(" "), 1_500),
      validationObjective: bounded(commitment.expectedEvidenceDescription, 1_200),
      reviewObjective: bounded(
        `Review whether evidence satisfies ${commitment.commitmentId}.`,
        1_200,
      ),
      expectedEvidenceDescriptions: [bounded(commitment.expectedEvidenceDescription, 900)],
      expectedEvidenceKinds: ["mission_commitment_evidence"],
      acceptanceCriteria,
      remainingWork: uniqueStrings(remainingWork, 12),
      relevantConstraints: uniqueStrings(constraints, 16),
      explicitNonGoals: uniqueStrings(input.ledger.explicitNonGoals, 12),
      likelyRepoAreas: uniqueStrings(
        input.likelyRepoAreasByCommitmentId?.[commitment.commitmentId] ?? [],
        12,
      ),
      requiredContextQuestions: [
        bounded(
          `What repo surfaces already implement or constrain ${commitment.commitmentId}?`,
          700,
        ),
        bounded(
          `Which files, tests, and readback surfaces can produce evidence for ${commitment.commitmentId}?`,
          700,
        ),
      ],
      allowedContextRequestHints: [
        bounded(
          `Request bounded original-prompt excerpts only when packet context is insufficient to ground ${commitment.commitmentId}.`,
          700,
        ),
      ],
      expectedContextScoutOutput: [
        bounded(
          `Verified file refs and implementation constraints for ${commitment.commitmentId}.`,
          700,
        ),
      ],
      expectedImplementationOutput: [
        bounded(`Bounded source/test/docs changes that advance ${commitment.commitmentId}.`, 700),
      ],
      expectedValidationOutput: [
        bounded(`Validation refs showing ${commitment.commitmentId} behavior was checked.`, 700),
      ],
      expectedReviewReadbackOutput: [
        bounded(`Review/readback evidence mapped to ${commitment.commitmentId}.`, 700),
      ],
      requiredEvidenceClaimDescriptions: [bounded(commitment.expectedEvidenceDescription, 700)],
      stopIfMissing: [
        bounded(
          `Stop before implementation if no verified repo context or explicit context-not-needed rationale exists for ${commitment.commitmentId}.`,
          700,
        ),
      ],
      packetQualityReviewRefs: [],
      uncertaintiesAndRisks: [],
      downstreamConsumer: "scheduler_node_executor",
      ...contextFreshnessFields({}),
      rawFileContentStored: false as const,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
      rawDbRowsStored: false as const,
    };
    return CommitmentWorkPacketSchema.parse({
      ...base,
      packetRef: packetRef("commitment-work-packet", commitment.commitmentId, base),
    });
  });
}

export function summarizeCommitmentWorkPackets(packets: CommitmentWorkPacket[]): JsonValue {
  return packets.map((packet) => ({
    packetRef: packet.packetRef,
    commitmentId: packet.commitmentId,
    authoringSource: packet.authoringSource,
    qualityStatus: packet.qualityStatus,
    commitmentMeaning: bounded(packet.commitmentMeaning, 700),
    workerObjective: bounded(packet.workerObjective, 700),
    contextScoutObjective: bounded(packet.contextScoutObjective, 700),
    implementationObjective: bounded(packet.implementationObjective, 700),
    validationObjective: bounded(packet.validationObjective, 700),
    reviewObjective: bounded(packet.reviewObjective, 700),
    acceptanceCriteriaCount: packet.acceptanceCriteria.length,
    acceptanceCriteria: packet.acceptanceCriteria.slice(0, 6),
    expectedEvidenceKinds: packet.expectedEvidenceKinds,
    likelyRepoAreas: packet.likelyRepoAreas,
    requiredContextQuestions: packet.requiredContextQuestions.slice(0, 6),
    allowedContextRequestHints: packet.allowedContextRequestHints.slice(0, 6),
    requiredEvidenceClaimDescriptions: packet.requiredEvidenceClaimDescriptions.slice(0, 8),
    stopIfMissing: packet.stopIfMissing.slice(0, 6),
    packetQualityReviewRefs: packet.packetQualityReviewRefs.slice(0, 6),
    downstreamConsumer: packet.downstreamConsumer,
    contextFreshnessStatus: packet.contextFreshnessStatus,
    contextRefreshAction: packet.contextRefreshAction,
    contextSnapshotRefs: (packet.providedContextSnapshotRefs ?? [])
      .map((ref) => ref.snapshotRef)
      .slice(0, 12),
    staleContextSnapshotRefs: (packet.staleContextSnapshotRefs ?? []).slice(0, 12),
    missingContextSnapshotRefs: (packet.missingContextSnapshotRefs ?? []).slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
  })) as JsonValue;
}

export function summarizeCommitmentWorkPacketsForProgress(
  packets: CommitmentWorkPacket[],
): JsonValue {
  return {
    packetCount: packets.length,
    packetRefs: packets.map((packet) => packet.packetRef).slice(0, 40),
    truncated: packets.length > 8,
    packets: packets.slice(0, 8).map((packet) => ({
      packetRef: packet.packetRef,
      commitmentId: packet.commitmentId,
      authoringSource: packet.authoringSource,
      qualityStatus: packet.qualityStatus,
      workerObjective: bounded(packet.workerObjective, 220),
      contextScoutObjective: bounded(packet.contextScoutObjective, 220),
      implementationObjective: bounded(packet.implementationObjective, 220),
      validationObjective: bounded(packet.validationObjective, 180),
      likelyRepoAreas: packet.likelyRepoAreas.slice(0, 4),
      requiredContextQuestions: packet.requiredContextQuestions.slice(0, 3),
      stopIfMissing: packet.stopIfMissing.slice(0, 2),
      downstreamConsumer: packet.downstreamConsumer,
      contextFreshnessStatus: packet.contextFreshnessStatus,
      contextRefreshAction: packet.contextRefreshAction,
      contextSnapshotRefs: (packet.providedContextSnapshotRefs ?? [])
        .map((ref) => ref.snapshotRef)
        .slice(0, 8),
      staleContextSnapshotRefs: (packet.staleContextSnapshotRefs ?? []).slice(0, 8),
      missingContextSnapshotRefs: (packet.missingContextSnapshotRefs ?? []).slice(0, 8),
      rawPromptStored: false,
      rawResponseStored: false,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } as JsonValue;
}

export function summarizeCommitmentWorkPacketsForArtifact(
  packets: CommitmentWorkPacket[],
): JsonValue {
  return {
    packetCount: packets.length,
    packetRefs: packets.map((packet) => packet.packetRef).slice(0, 80),
    packets: packets.map((packet) => ({
      packetRef: packet.packetRef,
      commitmentId: packet.commitmentId,
      authoringSource: packet.authoringSource,
      qualityStatus: packet.qualityStatus,
      workerObjective: bounded(packet.workerObjective, 180),
      contextScoutObjective: bounded(packet.contextScoutObjective, 180),
      implementationObjective: bounded(packet.implementationObjective, 180),
      validationObjective: bounded(packet.validationObjective, 160),
      reviewObjective: bounded(packet.reviewObjective, 140),
      acceptanceCriteriaCount: packet.acceptanceCriteria.length,
      expectedEvidenceKindCount: packet.expectedEvidenceKinds.length,
      likelyRepoAreas: packet.likelyRepoAreas.slice(0, 4),
      requiredContextQuestionCount: packet.requiredContextQuestions.length,
      requiredContextQuestions: packet.requiredContextQuestions
        .slice(0, 2)
        .map((value) => bounded(value, 180)),
      allowedContextRequestHintCount: packet.allowedContextRequestHints.length,
      stopIfMissingCount: packet.stopIfMissing.length,
      packetQualityReviewRefs: packet.packetQualityReviewRefs.slice(0, 2),
      downstreamConsumer: packet.downstreamConsumer,
      contextFreshnessStatus: packet.contextFreshnessStatus,
      contextRefreshAction: packet.contextRefreshAction,
      contextSnapshotRefs: (packet.providedContextSnapshotRefs ?? [])
        .map((ref) => ref.snapshotRef)
        .slice(0, 8),
      staleContextSnapshotRefs: (packet.staleContextSnapshotRefs ?? []).slice(0, 8),
      missingContextSnapshotRefs: (packet.missingContextSnapshotRefs ?? []).slice(0, 8),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } as JsonValue;
}

export const COMMITMENT_PACKET_FANOUT_DIAGNOSTICS_ARTIFACT_TYPE =
  "execution_platform.commitment_packet_fanout_diagnostics";

export type CommitmentPacketFanoutLaneState = {
  commitmentId: string;
  objective?: string | null;
  status: "pending" | "running" | "completed" | "needs_review" | "failed" | string;
  modelRef?: string | null;
  providerPath?: string | null;
  profileRef?: string | null;
  reasonCodes?: string[];
  latestDiagnostics?: JsonValue | null;
};

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayField(value: unknown, maxItems = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, maxItems)
    : [];
}

function fanoutLaneFailureClasses(input: {
  status: string;
  reasonCodes: string[];
  latestDiagnostics: Record<string, JsonValue>;
}): string[] {
  const latest = input.latestDiagnostics;
  const providerDiagnostics = jsonRecord(latest.providerDiagnostics);
  const retryEvidence = jsonRecord(latest.retryEvidence);
  const noContentDiagnostic = jsonRecord(latest.noContentDiagnostic);
  const retryReasonCodes = stringArrayField(retryEvidence.retryReasonCodes, 20);
  const reasonCodes = [...input.reasonCodes, ...retryReasonCodes];
  const classes: string[] = [];
  if (input.status !== "completed") {
    classes.push("packet_author_incomplete");
  }
  if (typeof latest.errorReasonCode === "string" && latest.errorReasonCode.trim()) {
    classes.push("packet_author_provider_error");
  }
  if (reasonCodes.length > 0) {
    classes.push("packet_author_retry_needed");
  }
  if (
    typeof latest.fallbackReasonCode === "string" ||
    typeof latest.fallbackFromModelRef === "string" ||
    reasonCodes.some((code) => code.includes("rescue") || code.includes("fallback"))
  ) {
    classes.push("packet_author_rescue_or_fallback");
  }
  if (
    latest.outputContentLength === 0 ||
    latest.parsedContentLength === 0 ||
    providerDiagnostics.contentLength === 0 ||
    typeof latest.noContentReasonClass === "string" ||
    typeof noContentDiagnostic.classifiedReason === "string" ||
    reasonCodes.some((code) => code.includes("no_content") || code.includes("empty_content"))
  ) {
    classes.push("packet_author_no_content_or_empty_output");
  }
  const timeoutMs =
    numberField(latest.timeoutMs) ??
    numberField(jsonRecord(providerDiagnostics.requestProfileDiagnostics).timeoutMs);
  const latencyMs = numberField(latest.latencyMs);
  if (
    latencyMs !== null &&
    (latencyMs >= 90_000 || (timeoutMs !== null && latencyMs >= timeoutMs))
  ) {
    classes.push("packet_author_long_latency");
  }
  return [...new Set(classes)].slice(0, 12);
}

export function buildCommitmentPacketFanoutDiagnosticsArtifact(input: {
  missionId: string;
  runtimeJobId: string;
  generatedAt: string;
  states: CommitmentPacketFanoutLaneState[];
  profile: JsonValue | null;
  reasonCodes?: string[];
}): JsonValue {
  const packetDiagnostics = input.states.map((state) => {
    const latestDiagnostics = jsonRecord(state.latestDiagnostics);
    const reasonCodes = (state.reasonCodes ?? []).slice(0, 20);
    const failureClasses = fanoutLaneFailureClasses({
      status: state.status,
      reasonCodes,
      latestDiagnostics,
    });
    return {
      commitmentId: bounded(state.commitmentId, 160),
      status: bounded(state.status, 80),
      objective: bounded(state.objective ?? "", 260),
      modelRef: bounded(state.modelRef ?? "", 180),
      providerPath: bounded(state.providerPath ?? "", 120),
      profileRef: bounded(state.profileRef ?? "", 260),
      reasonCodes,
      failureClasses,
      latestDiagnostics,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  });
  const classCounts = new Map<string, number>();
  for (const diagnostic of packetDiagnostics) {
    for (const failureClass of diagnostic.failureClasses) {
      classCounts.set(failureClass, (classCounts.get(failureClass) ?? 0) + 1);
    }
  }
  return {
    artifactKind: "commitment_packet_fanout_diagnostics",
    schemaVersion: "execution-platform.commitment-packet-fanout-diagnostics.v1",
    fanoutId: `commitment-packet-fanout-${hashPacket({
      missionId: input.missionId,
      runtimeJobId: input.runtimeJobId,
      generatedAt: input.generatedAt,
      states: input.states.map((state) => [state.commitmentId, state.status, state.reasonCodes]),
    }).slice(0, 20)}`,
    missionId: input.missionId,
    runtimeJobId: input.runtimeJobId,
    generatedAt: input.generatedAt,
    totalCount: input.states.length,
    pendingCount: input.states.filter((state) => state.status === "pending").length,
    runningCount: input.states.filter((state) => state.status === "running").length,
    completedCount: input.states.filter((state) => state.status === "completed").length,
    needsReviewCount: input.states.filter((state) => state.status === "needs_review").length,
    failedCount: input.states.filter((state) => state.status === "failed").length,
    retryCount: packetDiagnostics.filter((packet) =>
      packet.failureClasses.includes("packet_author_retry_needed"),
    ).length,
    fallbackCount: packetDiagnostics.filter((packet) =>
      packet.failureClasses.includes("packet_author_rescue_or_fallback"),
    ).length,
    longLatencyCount: packetDiagnostics.filter((packet) =>
      packet.failureClasses.includes("packet_author_long_latency"),
    ).length,
    providerErrorCount: packetDiagnostics.filter((packet) =>
      packet.failureClasses.includes("packet_author_provider_error"),
    ).length,
    noContentCount: packetDiagnostics.filter((packet) =>
      packet.failureClasses.includes("packet_author_no_content_or_empty_output"),
    ).length,
    failureClassCounts: Object.fromEntries(
      [...classCounts.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
    ) as JsonValue,
    packetDiagnostics,
    profile: input.profile ?? null,
    reasonCodes: uniqueStrings(input.reasonCodes ?? ["commitment_packet_fanout_diagnostics"], 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } as JsonValue;
}

export function summarizeCommitmentPacketFanoutForProgress(input: {
  diagnostics: JsonValue;
  diagnosticArtifactRef?: string | null;
  diagnosticArtifactHash?: string | null;
}): JsonValue {
  const diagnostics = jsonRecord(input.diagnostics);
  const packets = Array.isArray(diagnostics.packetDiagnostics)
    ? diagnostics.packetDiagnostics.map(jsonRecord)
    : [];
  const affectedCommitmentIds = packets
    .filter((packet) => stringField(packet.status) !== "completed")
    .map((packet) => stringField(packet.commitmentId))
    .filter(Boolean)
    .slice(0, 20);
  const runningCommitmentIds = packets
    .filter((packet) => stringField(packet.status) === "running")
    .map((packet) => stringField(packet.commitmentId))
    .filter(Boolean)
    .slice(0, 12);
  const topBlockerSummaries = packets
    .filter(
      (packet) =>
        stringField(packet.status) === "failed" || stringField(packet.status) === "needs_review",
    )
    .map((packet) => {
      const latest = jsonRecord(packet.latestDiagnostics);
      const reason =
        stringField(latest.errorReasonCode) ||
        stringField(latest.noContentReasonClass) ||
        stringField(packet.status);
      return `${stringField(packet.commitmentId, "unknown")}:${bounded(reason || "needs_review", 160)}`;
    })
    .slice(0, 3);
  return {
    artifactKind: "commitment_packet_fanout_progress_manifest",
    schemaVersion: "execution-platform.commitment-packet-fanout-progress-manifest.v1",
    totalCount: numberField(diagnostics.totalCount) ?? packets.length,
    pendingCount: numberField(diagnostics.pendingCount) ?? 0,
    runningCount: numberField(diagnostics.runningCount) ?? 0,
    completedCount: numberField(diagnostics.completedCount) ?? 0,
    needsReviewCount: numberField(diagnostics.needsReviewCount) ?? 0,
    failedCount: numberField(diagnostics.failedCount) ?? 0,
    retryCount: numberField(diagnostics.retryCount) ?? 0,
    fallbackCount: numberField(diagnostics.fallbackCount) ?? 0,
    longLatencyCount: numberField(diagnostics.longLatencyCount) ?? 0,
    providerErrorCount: numberField(diagnostics.providerErrorCount) ?? 0,
    noContentCount: numberField(diagnostics.noContentCount) ?? 0,
    runningCommitmentIds,
    affectedCommitmentIds,
    topBlockerSummaries,
    diagnosticArtifactRef: input.diagnosticArtifactRef ?? null,
    diagnosticArtifactHash: input.diagnosticArtifactHash ?? null,
    diagnosticHydrationToolId: input.diagnosticArtifactRef ? "artifact.payload.get_json" : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } as JsonValue;
}

export function summarizeCommitmentPacketQualityReviewForArtifact(
  review: CommitmentPacketQualityReview,
): JsonValue {
  return {
    packetKind: review.packetKind,
    schemaVersion: review.schemaVersion,
    reviewId: review.reviewId,
    reviewRef: review.reviewRef,
    missionId: review.missionId,
    status: review.status,
    packetReviewCount: review.packetReviews.length,
    packetReviews: review.packetReviews.map((packetReview) => ({
      packetRef: packetReview.packetRef,
      commitmentId: packetReview.commitmentId,
      status: packetReview.status,
      specificEnoughForContextScout: packetReview.specificEnoughForContextScout,
      specificEnoughForImplementation: packetReview.specificEnoughForImplementation,
      specificEnoughForValidation: packetReview.specificEnoughForValidation,
      specificEnoughForReview: packetReview.specificEnoughForReview,
      preservesOwnerIntent: packetReview.preservesOwnerIntent,
      blockingRepairRequired: packetReview.blockingRepairRequired,
      missingInformationCount: packetReview.missingInformation.length,
      repairInstructionCount: packetReview.repairInstructions.length,
      missingInformation: packetReview.missingInformation
        .slice(0, 2)
        .map((value) => bounded(value, 180)),
      repairInstructions: packetReview.repairInstructions
        .slice(0, 2)
        .map((value) => bounded(value, 220)),
      insufficientFieldCount: packetReview.insufficientFields.length,
      insufficientFields: packetReview.insufficientFields.slice(0, 6),
    })),
    reviewerSummary: bounded(review.reviewerSummary, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } as JsonValue;
}

export function normalizeModelAuthoredCommitmentWorkPackets(input: {
  value: unknown;
  ledger: MissionContractLedger;
}): CommitmentWorkPacket[] {
  const record =
    input.value && typeof input.value === "object" && !Array.isArray(input.value)
      ? (input.value as Record<string, unknown>)
      : {};
  const packetLikeFieldNames = [
    "commitmentMeaning",
    "workerObjective",
    "contextScoutObjective",
    "implementationObjective",
    "validationObjective",
    "reviewObjective",
    "acceptanceCriteria",
    "requiredContextQuestions",
  ];
  const rawPackets = Array.isArray(record.commitmentWorkPackets)
    ? record.commitmentWorkPackets
    : Array.isArray(record.packets)
      ? record.packets
      : record.commitmentWorkPacket &&
          typeof record.commitmentWorkPacket === "object" &&
          !Array.isArray(record.commitmentWorkPacket)
        ? [record.commitmentWorkPacket]
        : record.packet && typeof record.packet === "object" && !Array.isArray(record.packet)
          ? [record.packet]
          : packetLikeFieldNames.some((fieldName) => fieldName in record)
            ? [record]
            : [];
  const commitments = new Map(
    [...input.ledger.blockingCommitments, ...input.ledger.nonBlockingCommitments].map(
      (commitment) => [commitment.commitmentId, commitment],
    ),
  );
  return rawPackets.map((raw, index): CommitmentWorkPacket => {
    const packet =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const commitmentId = bounded(stringField(packet.commitmentId), 160);
    const commitment = commitments.get(commitmentId);
    if (!commitment) {
      throw new Error(`commitment_packet_unknown_commitment:${commitmentId || index}`);
    }
    const base = {
      packetKind: "commitment_work_packet" as const,
      schemaVersion: "execution-platform.commitment-work-packet.v1" as const,
      authoringSource: "model_authored" as const,
      qualityStatus: "unreviewed" as const,
      packetId: bounded(
        stringField(packet.packetId, `${input.ledger.missionId}:${commitmentId}`),
        180,
      ),
      packetRef: "pending",
      missionId: input.ledger.missionId,
      commitmentId,
      commitmentText: bounded(commitment.commitmentText, 1_200),
      commitmentMeaning: bounded(
        stringField(packet.commitmentMeaning, commitment.commitmentText),
        1_500,
      ),
      ownerIntentSummary: bounded(
        stringField(packet.ownerIntentSummary, input.ledger.ownerObjectiveSummary),
        1_200,
      ),
      whyItMatters: bounded(stringField(packet.whyItMatters, commitment.whyItMatters), 900),
      workerObjective: bounded(stringField(packet.workerObjective), 1_500),
      contextScoutObjective: bounded(stringField(packet.contextScoutObjective), 1_500),
      implementationObjective: bounded(stringField(packet.implementationObjective), 1_500),
      validationObjective: bounded(stringField(packet.validationObjective), 1_200),
      reviewObjective: bounded(stringField(packet.reviewObjective), 1_200),
      expectedEvidenceDescriptions: uniqueStrings(
        arrayStrings(packet.expectedEvidenceDescriptions, 8, 900).length > 0
          ? arrayStrings(packet.expectedEvidenceDescriptions, 8, 900)
          : [commitment.expectedEvidenceDescription],
        8,
      ),
      expectedEvidenceKinds: uniqueStrings(arrayStrings(packet.expectedEvidenceKinds, 8, 120), 8),
      acceptanceCriteria: uniqueStrings(arrayStrings(packet.acceptanceCriteria, 12, 700), 12),
      remainingWork: uniqueStrings(arrayStrings(packet.remainingWork, 12, 700), 12),
      relevantConstraints: uniqueStrings(arrayStrings(packet.relevantConstraints, 16, 700), 16),
      explicitNonGoals: uniqueStrings(arrayStrings(packet.explicitNonGoals, 12, 500), 12),
      likelyRepoAreas: uniqueStrings(arrayStrings(packet.likelyRepoAreas, 12, 260), 12),
      requiredContextQuestions: uniqueStrings(
        arrayStrings(packet.requiredContextQuestions, 8, 700),
        8,
      ),
      allowedContextRequestHints: uniqueStrings(
        arrayStrings(packet.allowedContextRequestHints, 8, 700),
        8,
      ),
      expectedContextScoutOutput: uniqueStrings(
        arrayStrings(packet.expectedContextScoutOutput, 8, 700),
        8,
      ),
      expectedImplementationOutput: uniqueStrings(
        arrayStrings(packet.expectedImplementationOutput, 8, 700),
        8,
      ),
      expectedValidationOutput: uniqueStrings(
        arrayStrings(packet.expectedValidationOutput, 8, 700),
        8,
      ),
      expectedReviewReadbackOutput: uniqueStrings(
        arrayStrings(packet.expectedReviewReadbackOutput, 8, 700),
        8,
      ),
      requiredEvidenceClaimDescriptions: uniqueStrings(
        arrayStrings(packet.requiredEvidenceClaimDescriptions, 12, 700).length > 0
          ? arrayStrings(packet.requiredEvidenceClaimDescriptions, 12, 700)
          : [commitment.expectedEvidenceDescription],
        12,
      ),
      stopIfMissing: uniqueStrings(arrayStrings(packet.stopIfMissing, 8, 700), 8),
      packetQualityReviewRefs: uniqueStrings(
        arrayStrings(packet.packetQualityReviewRefs, 8, 260),
        8,
      ),
      uncertaintiesAndRisks: uniqueStrings(arrayStrings(packet.uncertaintiesAndRisks, 12, 700), 12),
      downstreamConsumer: bounded(
        stringField(packet.downstreamConsumer, "runtime_work_graph_scheduler"),
        260,
      ),
      ...contextFreshnessFields({
        requiredContextSnapshotRefs: arrayContextSnapshotRefs(packet.requiredContextSnapshotRefs),
        providedContextSnapshotRefs: arrayContextSnapshotRefs(packet.providedContextSnapshotRefs),
        contextFreshnessSummary: stringField(packet.contextFreshnessSummary),
      }),
      rawFileContentStored: false as const,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
      rawDbRowsStored: false as const,
    };
    return CommitmentWorkPacketSchema.parse({
      ...base,
      packetRef: packetRef("commitment-work-packet", `${commitmentId}-${index}`, base),
    });
  });
}

function arrayStrings(value: unknown, maxItems: number, maxChars: number): string[] {
  const source =
    typeof value === "string" && value.trim().length > 0
      ? [value]
      : Array.isArray(value)
        ? value
        : [];
  return source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => bounded(item, maxChars))
    .slice(0, maxItems);
}

function arrayContextSnapshotRefs(value: unknown): ContextSnapshotRef[] {
  return Array.isArray(value)
    ? value
        .map((item) => ContextSnapshotRefSchema.safeParse(item))
        .filter((result): result is z.ZodSafeParseSuccess<ContextSnapshotRef> => result.success)
        .map((result) => result.data)
        .slice(0, 80)
    : [];
}

export function normalizeCommitmentPacketQualityReview(input: {
  value: unknown;
  missionId: string;
  packets: CommitmentWorkPacket[];
}): CommitmentPacketQualityReview {
  const record =
    input.value && typeof input.value === "object" && !Array.isArray(input.value)
      ? (input.value as Record<string, unknown>)
      : {};
  const packetByCommitment = new Map(input.packets.map((packet) => [packet.commitmentId, packet]));
  const rawReviews = Array.isArray(record.packetReviews) ? record.packetReviews : [];
  const packetReviews = rawReviews.map((raw) => {
    const review =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const commitmentId = bounded(stringField(review.commitmentId), 160);
    const packet = packetByCommitment.get(commitmentId);
    const reviewStatus = stringField(review.status);
    const status =
      reviewStatus === "accepted"
        ? "accepted"
        : reviewStatus === "accepted_with_limitations"
          ? "accepted_with_limitations"
          : reviewStatus === "needs_review_nonblocking"
            ? "needs_review_nonblocking"
            : reviewStatus === "needs_repair_blocking"
              ? "needs_repair_blocking"
              : "needs_review_nonblocking";
    const specificEnoughForContextScout = review.specificEnoughForContextScout === true;
    const specificEnoughForImplementation = review.specificEnoughForImplementation === true;
    const specificEnoughForValidation = review.specificEnoughForValidation === true;
    const specificEnoughForReview = review.specificEnoughForReview === true;
    const preservesOwnerIntent = review.preservesOwnerIntent === true;
    const missingInformation = arrayStrings(review.missingInformation, 8, 500);
    const repairInstructions = arrayStrings(review.repairInstructions, 8, 700);
    const insufficientFields = Array.isArray(review.insufficientFields)
      ? review.insufficientFields
          .map((field) => {
            const value =
              field && typeof field === "object" && !Array.isArray(field)
                ? (field as Record<string, unknown>)
                : {};
            return {
              path: bounded(stringField(value.path), 220),
              whyInsufficient: bounded(stringField(value.whyInsufficient), 700),
              blocking: value.blocking === true,
            };
          })
          .filter((field) => field.path && field.whyInsufficient)
          .slice(0, 12)
      : [];
    const inferredBlockingRepairRequired =
      status === "needs_repair_blocking" ||
      !specificEnoughForContextScout ||
      !specificEnoughForImplementation ||
      !specificEnoughForValidation ||
      !specificEnoughForReview ||
      !preservesOwnerIntent ||
      insufficientFields.some((field) => field.blocking);
    const blockingRepairRequired =
      typeof review.blockingRepairRequired === "boolean"
        ? review.blockingRepairRequired
        : inferredBlockingRepairRequired;
    const normalizedStatus = blockingRepairRequired
      ? "needs_repair_blocking"
      : status === "accepted"
        ? "accepted"
        : status === "accepted_with_limitations"
          ? "accepted_with_limitations"
          : "needs_review_nonblocking";
    return {
      packetRef: bounded(stringField(review.packetRef, packet?.packetRef ?? ""), 260),
      commitmentId,
      status: normalizedStatus,
      specificEnoughForContextScout,
      specificEnoughForImplementation,
      specificEnoughForValidation,
      specificEnoughForReview,
      preservesOwnerIntent,
      blockingRepairRequired,
      missingInformation,
      repairInstructions,
      insufficientFields,
    };
  });
  const status = packetReviews.some((review) => review.blockingRepairRequired)
    ? "needs_repair_blocking"
    : packetReviews.some((review) => review.status === "needs_review_nonblocking")
      ? "needs_review_nonblocking"
      : packetReviews.some((review) => review.status === "accepted_with_limitations")
        ? "accepted_with_limitations"
        : "accepted";
  const base = {
    packetKind: "commitment_packet_quality_review" as const,
    schemaVersion: "execution-platform.commitment-packet-quality-review.v1" as const,
    reviewId: bounded(stringField(record.reviewId, `${input.missionId}-packet-review`), 180),
    reviewRef: "pending",
    missionId: input.missionId,
    status,
    packetReviews,
    reviewerSummary: bounded(stringField(record.reviewerSummary), 1_500),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
  };
  return CommitmentPacketQualityReviewSchema.parse({
    ...base,
    reviewRef: packetRef("commitment-packet-quality-review", base.reviewId, base),
  });
}

export function applyCommitmentPacketQualityReview(input: {
  packets: CommitmentWorkPacket[];
  review: CommitmentPacketQualityReview;
}): CommitmentWorkPacket[] {
  const statusByCommitment = new Map(
    input.review.packetReviews.map((review) => [
      review.commitmentId,
      review.blockingRepairRequired
        ? "needs_review"
        : review.status === "accepted_with_limitations" ||
            review.status === "needs_review_nonblocking"
          ? "accepted_with_limitations"
          : "accepted",
    ]),
  );
  return input.packets.map((packet) =>
    CommitmentWorkPacketSchema.parse({
      ...packet,
      qualityStatus:
        statusByCommitment.get(packet.commitmentId) === "accepted" ||
        statusByCommitment.get(packet.commitmentId) === "accepted_with_limitations"
          ? statusByCommitment.get(packet.commitmentId)
          : "needs_review",
      packetQualityReviewRefs: uniqueStrings(
        [...packet.packetQualityReviewRefs, input.review.reviewRef],
        8,
      ),
    }),
  );
}

export function validateCommitmentWorkPacketsForScheduler(input: {
  packets: CommitmentWorkPacket[];
  ledger: MissionContractLedger | null | undefined;
}): { valid: boolean; reasonCodes: string[] } {
  if (!input.ledger) {
    return { valid: true, reasonCodes: [] };
  }
  const blockingCommitmentIds = input.ledger.blockingCommitments.map(
    (commitment) => commitment.commitmentId,
  );
  const packetByCommitment = new Map(input.packets.map((packet) => [packet.commitmentId, packet]));
  const reasonCodes: string[] = [];
  for (const commitmentId of blockingCommitmentIds) {
    const packet = packetByCommitment.get(commitmentId);
    if (!packet) {
      reasonCodes.push(`commitment_work_packet_missing:${commitmentId}`);
      continue;
    }
    if (packet.authoringSource !== "model_authored") {
      reasonCodes.push(`commitment_work_packet_not_model_authored:${commitmentId}`);
    }
    if (
      packet.qualityStatus !== "accepted" &&
      packet.qualityStatus !== "accepted_with_limitations"
    ) {
      reasonCodes.push(`commitment_work_packet_quality_not_accepted:${commitmentId}`);
    }
  }
  return { valid: reasonCodes.length === 0, reasonCodes };
}

export function commitmentWorkPacketsFromSummary(
  summary: MissionContractLedgerSummary | null | undefined,
): CommitmentWorkPacket[] {
  if (!summary) {
    return [];
  }
  return summary.commitments.map((commitment): CommitmentWorkPacket => {
    const base = {
      packetKind: "commitment_work_packet" as const,
      schemaVersion: "execution-platform.commitment-work-packet.v1" as const,
      authoringSource: "deterministic_fallback" as const,
      qualityStatus: "unreviewed" as const,
      packetId: `${summary.missionId}:${commitment.commitmentId}`,
      packetRef: "pending",
      missionId: summary.missionId,
      commitmentId: commitment.commitmentId,
      commitmentText: bounded(commitment.commitmentText, 1_200),
      commitmentMeaning: bounded(commitment.commitmentText, 1_500),
      ownerIntentSummary: bounded(`Mission ${summary.missionId}`, 1_200),
      whyItMatters: bounded(commitment.commitmentText, 900),
      workerObjective: bounded(commitment.commitmentText, 1_500),
      contextScoutObjective: bounded(`Find context for ${commitment.commitmentId}.`, 1_500),
      implementationObjective: bounded(commitment.commitmentText, 1_500),
      validationObjective: bounded(commitment.expectedEvidenceDescription, 1_200),
      reviewObjective: bounded(`Review evidence for ${commitment.commitmentId}.`, 1_200),
      expectedEvidenceDescriptions: [bounded(commitment.expectedEvidenceDescription, 900)],
      expectedEvidenceKinds: ["mission_commitment_evidence"],
      acceptanceCriteria: uniqueStrings(
        [
          commitment.commitmentText,
          commitment.expectedEvidenceDescription,
          ...commitment.remainingWork,
        ],
        12,
      ),
      remainingWork: uniqueStrings(commitment.remainingWork, 12),
      relevantConstraints: [],
      explicitNonGoals: [],
      likelyRepoAreas: [],
      requiredContextQuestions: [
        bounded(`What context is required to advance ${commitment.commitmentId}?`, 700),
      ],
      allowedContextRequestHints: [
        bounded(
          `Request a bounded original-prompt excerpt if the packet summary is insufficient for ${commitment.commitmentId}.`,
          700,
        ),
      ],
      expectedContextScoutOutput: [
        bounded(`Verified context refs for ${commitment.commitmentId}.`, 700),
      ],
      expectedImplementationOutput: [
        bounded(`Implementation evidence for ${commitment.commitmentId}.`, 700),
      ],
      expectedValidationOutput: [
        bounded(`Validation evidence for ${commitment.commitmentId}.`, 700),
      ],
      expectedReviewReadbackOutput: [
        bounded(`Review/readback evidence for ${commitment.commitmentId}.`, 700),
      ],
      requiredEvidenceClaimDescriptions: [bounded(commitment.expectedEvidenceDescription, 700)],
      stopIfMissing: [
        bounded(
          `Stop before implementation if context remains too weak for ${commitment.commitmentId}.`,
          700,
        ),
      ],
      packetQualityReviewRefs: [],
      uncertaintiesAndRisks: [],
      downstreamConsumer: "scheduler_node_executor",
      ...contextFreshnessFields({}),
      rawFileContentStored: false as const,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      rawToolLogStored: false as const,
      rawDbRowsStored: false as const,
    };
    return CommitmentWorkPacketSchema.parse({
      ...base,
      packetRef: packetRef("commitment-work-packet", commitment.commitmentId, base),
    });
  });
}

export function buildContextHandoffPacket(input: {
  sourceNodeId: string;
  targetCommitmentIds: string[];
  commitmentWorkPacketRefs?: string[];
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
  handoffSummaryForSynthesis?: string;
  evidenceClaimRefs?: string[];
  limitations?: string[];
  requiredContextSnapshotRefs?: ContextSnapshotRef[];
  providedContextSnapshotRefs?: ContextSnapshotRef[];
}): ContextHandoffPacket {
  const base = {
    packetKind: "context_handoff_packet" as const,
    schemaVersion: "execution-platform.context-handoff-packet.v1" as const,
    packetId: `${input.sourceNodeId}:${hashPacket(input).slice(0, 12)}`,
    packetRef: "pending",
    sourceNodeId: bounded(input.sourceNodeId, 180),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 16),
    commitmentWorkPacketRefs: uniqueStrings(input.commitmentWorkPacketRefs ?? [], 32),
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
    handoffSummaryForSynthesis: bounded(input.handoffSummaryForSynthesis ?? "", 1_500),
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
  return ContextHandoffPacketSchema.parse({
    ...base,
    packetRef: packetRef("context-handoff-packet", base.packetId, base),
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
  sourceCommitmentPacketRefs?: string[];
  sourceContextHandoffRefs?: string[];
  sourcePromptExcerptRefs?: string[];
  contextSynthesisRefs?: string[];
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
    sourceCommitmentPacketRefs: uniqueStrings(input.sourceCommitmentPacketRefs ?? [], 40),
    sourceContextHandoffRefs: uniqueStrings(input.sourceContextHandoffRefs ?? [], 40),
    sourcePromptExcerptRefs: uniqueStrings(input.sourcePromptExcerptRefs ?? [], 24),
    contextSynthesisRefs: uniqueStrings(input.contextSynthesisRefs ?? [], 24),
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
    packet.contextSynthesisRefs.length > 0 ||
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
  const contextRefreshBlocksImplementation =
    effectiveContextRefreshAction === "block_implementation" &&
    (effectiveMissingContextSnapshotRefs.length > 0 ||
      effectiveRejectedContextSnapshotRefs.length > 0 ||
      effectiveStaleContextSnapshotRefs.length > 0 ||
      effectiveContextFreshnessStatus === "missing" ||
      effectiveContextFreshnessStatus === "rejected" ||
      effectiveContextFreshnessStatus === "stale");
  if (contextRefreshBlocksImplementation) {
    reasonCodes.push("implementation_task_packet_context_refresh_action_block_implementation");
  }
  const hasContextSnapshotContract =
    packet.requiredContextSnapshotRefs.length > 0 ||
    packet.providedContextSnapshotRefs.length > 0 ||
    effectiveMissingContextSnapshotRefs.length > 0 ||
    effectiveRejectedContextSnapshotRefs.length > 0 ||
    effectiveStaleContextSnapshotRefs.length > 0 ||
    contextRefreshBlocksImplementation;
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
              code === "implementation_task_packet_context_refresh_action_block_implementation" ||
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
