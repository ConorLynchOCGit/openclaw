import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  MISSION_CONTRACT_LEDGER_SCHEMA_VERSION,
  MissionContractLedgerSchema,
  type MissionContractLedger,
  type MissionCommitment,
} from "./mission-contract-ledger.ts";
import type { SourcePromptContextIndex } from "./source-prompt-context.ts";

export const STAGED_MISSION_LEDGER_OBJECTIVE_CONSTRAINTS_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.objective_constraints";
export const STAGED_MISSION_LEDGER_OBLIGATION_CANDIDATE_SET_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.obligation_candidate_set";
export const STAGED_MISSION_LEDGER_COMPILED_CANDIDATE_SET_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.compiled_candidate_set";
export const STAGED_MISSION_LEDGER_REVIEW_PLAN_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.review_plan";
export const STAGED_MISSION_LEDGER_CANONICAL_COMMITMENTS_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.canonical_commitments";
export const STAGED_MISSION_LEDGER_ACCEPTANCE_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.acceptance";
export const STAGED_MISSION_LEDGER_STAGE_REPAIR_DIAGNOSTIC_ARTIFACT_TYPE =
  "execution_platform.staged_mission_ledger.stage_repair_diagnostic";
export const COMMITMENT_PACKET_SEMANTIC_BRIEF_ARTIFACT_TYPE =
  "execution_platform.commitment_packet.semantic_brief";
export const COMMITMENT_PACKET_FIELD_COMPLETION_ARTIFACT_TYPE =
  "execution_platform.commitment_packet.field_completion";
export const FAST_MODEL_NO_CONTENT_DIAGNOSTIC_ARTIFACT_TYPE =
  "execution_platform.fast_model.no_content_diagnostic";
export const FAILED_PACKET_REPLAY_RESULT_ARTIFACT_TYPE =
  "execution_platform.commitment_packet.failed_replay_result";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable();
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function scalarString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, maxItems: number, maxChars = 260): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => bounded(item, maxChars))
        .slice(0, maxItems)
    : [];
}

export const SourcePromptStructuralAnchorSchema = z
  .object({
    promptHash: boundedString(90),
    promptVersionRef: boundedString(260),
    sectionRef: boundedString(320),
    blockOrdinal: z.number().int().min(0),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().min(0),
    excerptRef: boundedString(360),
    excerptHash: boundedString(90),
    boundedSummary: z.string().trim().max(600).default(""),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.charEnd < value.charStart) {
      ctx.addIssue({
        code: "custom",
        message: "charEnd must be greater than or equal to charStart",
        path: ["charEnd"],
      });
    }
  });

export type SourcePromptStructuralAnchor = z.infer<typeof SourcePromptStructuralAnchorSchema>;

export const StagedObjectiveConstraintsSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_objective_constraints"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    ownerObjectiveSummary: boundedString(2_000),
    objectiveRationale: boundedString(1_200),
    explicitConstraints: stringList(30, 700),
    explicitNonGoals: stringList(30, 700),
    ambiguityNotes: stringList(20, 700),
    safetyBoundaryNotes: stringList(20, 700),
    sourcePromptHash: boundedString(90),
    sourcePromptLength: z.number().int().min(0),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type StagedObjectiveConstraints = z.infer<typeof StagedObjectiveConstraintsSchema>;

export const ObligationCandidateSchema = z
  .object({
    localCandidateRef: boundedString(120),
    obligationText: boundedString(1_500),
    whyItMatters: boundedString(900),
    expectedEvidenceDescription: boundedString(1_000),
    sourceAnchors: z.array(SourcePromptStructuralAnchorSchema).min(1).max(12),
    blockingProposal: z.enum(["blocking", "nonblocking", "needs_owner_review"]),
    constraintRefs: stringList(20, 260).default([]),
    nonGoalRefs: stringList(20, 260).default([]),
    ambiguityNotes: stringList(12, 700).default([]),
    modelMergeSplitNotes: stringList(12, 700).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type ObligationCandidate = z.infer<typeof ObligationCandidateSchema>;

export const ObligationCandidateSetSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_obligation_candidate_set"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    sourcePromptHash: boundedString(90),
    sourcePromptVersionRef: boundedString(260),
    candidates: z.array(ObligationCandidateSchema).min(1).max(60),
    omittedObligationNotes: stringList(20, 700).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type ObligationCandidateSet = z.infer<typeof ObligationCandidateSetSchema>;

export const CompiledObligationCandidateSchema = z
  .object({
    candidateRef: boundedString(180),
    localCandidateRef: boundedString(120),
    candidateHash: boundedString(90),
    obligationText: boundedString(1_500),
    whyItMatters: boundedString(900),
    expectedEvidenceDescription: boundedString(1_000),
    sourceAnchors: z.array(SourcePromptStructuralAnchorSchema).min(1).max(12),
    blockingProposal: z.enum(["blocking", "nonblocking", "needs_owner_review"]),
    constraintRefs: stringList(20, 260),
    nonGoalRefs: stringList(20, 260),
    ambiguityNotes: stringList(12, 700),
    duplicateAnchorGroupRef: optionalBoundedString(180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type CompiledObligationCandidate = z.infer<typeof CompiledObligationCandidateSchema>;

export const CompiledObligationCandidateSetSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_compiled_candidate_set"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    sourcePromptHash: boundedString(90),
    sourcePromptVersionRef: boundedString(260),
    candidateCount: z.number().int().min(1).max(60),
    duplicateAnchorGroupCount: z.number().int().min(0).max(60),
    candidates: z.array(CompiledObligationCandidateSchema).min(1).max(60),
    reasonCodes: stringList(30, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type CompiledObligationCandidateSet = z.infer<typeof CompiledObligationCandidateSetSchema>;

const ReviewOperationBaseSchema = z.object({
  operationId: boundedString(120),
  rationale: boundedString(1_000),
  rawPromptStored: z.literal(false),
  rawResponseStored: z.literal(false),
  rawProviderLogStored: z.literal(false),
});

export const ObligationReviewOperationSchema = z.discriminatedUnion("operationKind", [
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("accept_candidate"),
    candidateRefs: z.array(boundedString(180)).min(1).max(1),
    resultingCommitmentText: optionalBoundedString(1_500),
    expectedEvidenceDescription: optionalBoundedString(1_000),
    blocking: z.boolean().nullable().default(null),
  }).strict(),
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("merge_candidates"),
    candidateRefs: z.array(boundedString(180)).min(2).max(10),
    resultingCommitmentText: boundedString(1_500),
    expectedEvidenceDescription: boundedString(1_000),
    blocking: z.boolean().nullable().default(null),
  }).strict(),
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("split_candidate"),
    candidateRefs: z.array(boundedString(180)).min(1).max(1),
    splitCommitments: z
      .array(
        z
          .object({
            resultingCommitmentText: boundedString(1_500),
            expectedEvidenceDescription: boundedString(1_000),
            blocking: z.boolean().nullable().default(null),
            sourceAnchorRefs: stringList(12, 360),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  }).strict(),
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("discard_candidate_as_non_goal"),
    candidateRefs: z.array(boundedString(180)).min(1).max(10),
    nonGoalText: boundedString(1_000),
  }).strict(),
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("add_missing_candidate_with_source_anchor"),
    candidateRefs: z.array(boundedString(180)).max(0).default([]),
    resultingCommitmentText: boundedString(1_500),
    whyItMatters: boundedString(900),
    expectedEvidenceDescription: boundedString(1_000),
    sourceAnchors: z.array(SourcePromptStructuralAnchorSchema).min(1).max(12),
    blocking: z.boolean(),
  }).strict(),
  ReviewOperationBaseSchema.extend({
    operationKind: z.literal("mark_candidate_needs_owner_review"),
    candidateRefs: z.array(boundedString(180)).min(1).max(10),
    ownerQuestion: boundedString(1_000),
  }).strict(),
]);

export type ObligationReviewOperation = z.infer<typeof ObligationReviewOperationSchema>;

export const ObligationReviewPlanSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_obligation_review_plan"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    candidateSetRef: boundedString(260),
    operations: z.array(ObligationReviewOperationSchema).min(1).max(80),
    reviewerSummary: boundedString(2_000),
    unresolvedOwnerQuestions: stringList(20, 1_000).default([]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type ObligationReviewPlan = z.infer<typeof ObligationReviewPlanSchema>;

export const CanonicalMissionCommitmentSchema = z
  .object({
    commitmentId: boundedString(120),
    commitmentRef: boundedString(220),
    sourceCandidateRefs: z.array(boundedString(180)).max(12),
    sourceAnchors: z.array(SourcePromptStructuralAnchorSchema).min(1).max(24),
    commitmentText: boundedString(1_500),
    whyItMatters: boundedString(900),
    expectedEvidenceDescription: boundedString(1_000),
    blocking: z.boolean(),
    ownerReviewRequired: z.boolean(),
    reviewOperationId: boundedString(120),
    canonicalHash: boundedString(90),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type CanonicalMissionCommitment = z.infer<typeof CanonicalMissionCommitmentSchema>;

export const CanonicalMissionCommitmentsSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_canonical_commitments"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    sourcePromptHash: boundedString(90),
    sourcePromptVersionRef: boundedString(260),
    commitments: z.array(CanonicalMissionCommitmentSchema).min(1).max(60),
    discardedCandidateRefs: z.array(boundedString(180)).max(60),
    ownerReviewCandidateRefs: z.array(boundedString(180)).max(60),
    reasonCodes: stringList(40, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type CanonicalMissionCommitments = z.infer<typeof CanonicalMissionCommitmentsSchema>;

export const StagedMissionLedgerAcceptanceSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_acceptance"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    missionId: boundedString(180),
    status: z.enum(["accepted", "needs_review", "blocked"]),
    missionLedgerRef: boundedString(320).nullable(),
    canonicalCommitmentsRef: boundedString(320),
    commitmentCount: z.number().int().min(0).max(60),
    blockingCommitmentCount: z.number().int().min(0).max(60),
    ownerReviewCommitmentCount: z.number().int().min(0).max(60),
    reasonCodes: stringList(40, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type StagedMissionLedgerAcceptance = z.infer<typeof StagedMissionLedgerAcceptanceSchema>;

export const StagedMissionLedgerStageRepairDiagnosticSchema = z
  .object({
    artifactKind: z.literal("staged_mission_ledger_stage_repair_diagnostic"),
    schemaVersion: z.literal("execution-platform.staged-mission-ledger.v1"),
    diagnosticId: boundedString(180),
    missionId: boundedString(180),
    failedStage: z.enum([
      "objective_constraints",
      "obligation_candidate_extraction",
      "candidate_compilation",
      "candidate_review",
      "canonical_commitment_compilation",
      "mission_ledger_acceptance",
    ]),
    failedOperationId: boundedString(180).nullable(),
    failedPath: boundedString(360).nullable(),
    issueSummary: boundedString(1_000),
    validAlternatives: stringList(40, 360),
    preservedFieldPaths: stringList(40, 360),
    repairAttempted: z.boolean(),
    terminalAfterRepair: z.boolean(),
    reasonCodes: stringList(40, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type StagedMissionLedgerStageRepairDiagnostic = z.infer<
  typeof StagedMissionLedgerStageRepairDiagnosticSchema
>;

export const PacketSemanticBriefSchema = z
  .object({
    artifactKind: z.literal("commitment_packet_semantic_brief"),
    schemaVersion: z.literal("execution-platform.commitment-packet-semantic-brief.v1"),
    commitmentId: boundedString(120),
    commitmentMeaning: boundedString(1_500),
    ownerIntentSummary: boundedString(1_200),
    workerObjective: boundedString(1_500),
    contextScoutObjective: boundedString(1_500),
    implementationObjective: boundedString(1_500),
    validationObjective: boundedString(1_200),
    reviewObjective: boundedString(1_200),
    acceptanceCriteria: stringList(16, 700),
    requiredContextQuestions: stringList(16, 700),
    likelyRepoAreas: stringList(20, 260).default([]),
    expectedOutputs: stringList(16, 700).default([]),
    stopIfMissing: stringList(16, 700).default([]),
    risks: stringList(16, 700).default([]),
    downstreamConsumer: boundedString(260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type PacketSemanticBrief = z.infer<typeof PacketSemanticBriefSchema>;

export const PacketFieldCompletionSchema = z
  .object({
    artifactKind: z.literal("commitment_packet_field_completion"),
    schemaVersion: z.literal("execution-platform.commitment-packet-semantic-brief.v1"),
    commitmentId: boundedString(120),
    missingFields: stringList(20, 120),
    packetBriefPatch: z.record(z.string(), z.unknown()),
    reasonCodes: stringList(20, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type PacketFieldCompletion = z.infer<typeof PacketFieldCompletionSchema>;

export const FastModelNoContentReasonClassSchema = z.enum([
  "provider_timeout",
  "timeout_adjacent_empty_content",
  "client_abort_before_provider_finish",
  "transport_error",
  "empty_choices",
  "provider_empty_choice",
  "empty_content",
  "provider_empty_content",
  "parse_dropped_content",
  "adapter_content_extraction_failed",
  "schema_mode_failure",
  "refusal_empty_content",
  "preflight_blocked",
  "output_budget_exhausted",
  "runtime_prompt_truncated",
  "wrong_model_or_profile",
  "provider_rate_limited_or_queued",
  "transport_or_proxy_incomplete",
  "provider_usage_missing",
  "provider_finish_reason_missing",
  "unknown_provider_empty_output",
]);

export type FastModelNoContentReasonClass = z.infer<typeof FastModelNoContentReasonClassSchema>;

export const FastModelNoContentDiagnosticSchema = z
  .object({
    artifactKind: z.literal("fast_model_no_content_diagnostic"),
    schemaVersion: z.literal("execution-platform.fast-model-no-content-diagnostic.v1"),
    diagnosticId: boundedString(180),
    taskClass: boundedString(120),
    callSite: boundedString(180),
    modelRef: boundedString(180),
    providerPath: boundedString(120),
    modelCandidateId: boundedString(180).nullable(),
    requestProfileRef: boundedString(260).nullable(),
    providerRequestId: boundedString(260).nullable(),
    reasoningModeSent: boundedString(60).nullable(),
    responseFormatSent: boundedString(120).nullable(),
    inputByteLength: z.number().int().min(0),
    elapsedMs: z.number().int().min(0).nullable(),
    maxOutputTokens: z.number().int().min(0).nullable(),
    timeoutMs: z.number().int().min(0).nullable(),
    timeoutState: z.enum(["not_timed_out", "timed_out", "unknown"]),
    nativeFinishReason: boundedString(120).nullable(),
    finishReason: boundedString(120).nullable(),
    choiceCount: z.number().int().min(0).nullable(),
    contentLengthByChoice: z.array(z.number().int().min(0)).max(16),
    parsedContentLength: z.number().int().min(0),
    retryNumber: z.number().int().min(0),
    concurrencySlot: boundedString(120).nullable(),
    inputBundleRef: boundedString(360).nullable(),
    inputBundleHash: boundedString(90).nullable(),
    outputHash: boundedString(90).nullable(),
    classifiedReason: FastModelNoContentReasonClassSchema,
    retryEligibility: z.enum([
      "retry_same_bounded_input",
      "retry_reduced_input",
      "escalate",
      "not_retryable",
    ]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type FastModelNoContentDiagnostic = z.infer<typeof FastModelNoContentDiagnosticSchema>;

export const FailedPacketReplayResultSchema = z
  .object({
    artifactKind: z.literal("failed_packet_replay_result"),
    schemaVersion: z.literal("execution-platform.failed-packet-replay-result.v1"),
    replayId: boundedString(180),
    commitmentId: boundedString(120),
    inputBundleRef: boundedString(360),
    inputBundleHash: boundedString(90),
    status: z.enum(["passed", "reproduced_failure", "needs_review"]),
    attempts: z.array(FastModelNoContentDiagnosticSchema).max(8),
    reasonCodes: stringList(30, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type FailedPacketReplayResult = z.infer<typeof FailedPacketReplayResultSchema>;

export function sourcePromptStructuralAnchorsFromIndex(input: {
  index: SourcePromptContextIndex;
  promptVersionRef?: string | null;
  maxAnchors?: number;
}): SourcePromptStructuralAnchor[] {
  const promptVersionRef =
    input.promptVersionRef ?? `source-prompt://${input.index.promptHash.slice(0, 16)}/index`;
  return input.index.sections.slice(0, input.maxAnchors ?? 80).map((section, blockOrdinal) =>
    SourcePromptStructuralAnchorSchema.parse({
      promptHash: input.index.promptHash,
      promptVersionRef,
      sectionRef: section.sectionRef,
      blockOrdinal,
      charStart: section.startOffset,
      charEnd: section.endOffset,
      excerptRef: section.sectionRef,
      excerptHash: sha256Text(
        `${input.index.promptHash}:${section.sectionRef}:${section.startOffset}:${section.endOffset}`,
      ),
      boundedSummary: section.boundedSummary,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  );
}

export function compileObligationCandidateSet(input: {
  candidateSet: unknown;
  knownAnchors?: SourcePromptStructuralAnchor[];
}): CompiledObligationCandidateSet {
  const candidateSet = ObligationCandidateSetSchema.parse(input.candidateSet);
  const knownAnchorRefs = new Set(
    (input.knownAnchors ?? []).flatMap((anchor) => [anchor.excerptRef, anchor.sectionRef]),
  );
  const reasonCodes = ["obligation_candidate_set_compiled"];
  const duplicateGroupByAnchorDigest = new Map<string, string>();
  const duplicateGroupCounts = new Map<string, number>();
  const candidates = candidateSet.candidates.map((candidate, index) => {
    for (const anchor of candidate.sourceAnchors) {
      if (knownAnchorRefs.size > 0 && !knownAnchorRefs.has(anchor.excerptRef)) {
        throw new Error(
          `unknown_source_anchor:${candidate.localCandidateRef}:${anchor.excerptRef}`,
        );
      }
    }
    const anchorDigest = sha256Json(
      candidate.sourceAnchors
        .map((anchor) => ({
          promptHash: anchor.promptHash,
          sectionRef: anchor.sectionRef,
          charStart: anchor.charStart,
          charEnd: anchor.charEnd,
          excerptHash: anchor.excerptHash,
        }))
        .toSorted((a, b) =>
          `${a.sectionRef}:${a.charStart}`.localeCompare(`${b.sectionRef}:${b.charStart}`),
        ),
    );
    const duplicateGroupRef =
      duplicateGroupByAnchorDigest.get(anchorDigest) ?? `anchor-group-${anchorDigest.slice(0, 16)}`;
    duplicateGroupByAnchorDigest.set(anchorDigest, duplicateGroupRef);
    duplicateGroupCounts.set(
      duplicateGroupRef,
      (duplicateGroupCounts.get(duplicateGroupRef) ?? 0) + 1,
    );
    const candidateHash = sha256Json({
      sourcePromptHash: candidateSet.sourcePromptHash,
      sourcePromptVersionRef: candidateSet.sourcePromptVersionRef,
      anchorDigest,
      localCandidateRef: candidate.localCandidateRef,
      ordinal: index,
      obligationTextHash: sha256Text(candidate.obligationText),
    });
    return CompiledObligationCandidateSchema.parse({
      candidateRef: `obligation-candidate-${candidateHash.slice(0, 20)}`,
      localCandidateRef: candidate.localCandidateRef,
      candidateHash: `sha256:${candidateHash}`,
      obligationText: candidate.obligationText,
      whyItMatters: candidate.whyItMatters,
      expectedEvidenceDescription: candidate.expectedEvidenceDescription,
      sourceAnchors: candidate.sourceAnchors,
      blockingProposal: candidate.blockingProposal,
      constraintRefs: candidate.constraintRefs,
      nonGoalRefs: candidate.nonGoalRefs,
      ambiguityNotes: candidate.ambiguityNotes,
      duplicateAnchorGroupRef: duplicateGroupRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });
  const duplicateAnchorGroupCount = [...duplicateGroupCounts.values()].filter(
    (count) => count > 1,
  ).length;
  if (duplicateAnchorGroupCount > 0) {
    reasonCodes.push(`duplicate_anchor_groups:${duplicateAnchorGroupCount}`);
  }
  return CompiledObligationCandidateSetSchema.parse({
    artifactKind: "staged_mission_ledger_compiled_candidate_set",
    schemaVersion: "execution-platform.staged-mission-ledger.v1",
    missionId: candidateSet.missionId,
    sourcePromptHash: candidateSet.sourcePromptHash,
    sourcePromptVersionRef: candidateSet.sourcePromptVersionRef,
    candidateCount: candidates.length,
    duplicateAnchorGroupCount,
    candidates,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

function blockingFromProposal(
  candidate: CompiledObligationCandidate | null,
  override: boolean | null | undefined,
): boolean {
  if (typeof override === "boolean") {
    return override;
  }
  return candidate?.blockingProposal !== "nonblocking";
}

function canonicalCommitmentId(input: {
  sourcePromptHash: string;
  operationId: string;
  sourceCandidateRefs: string[];
  sourceAnchors: SourcePromptStructuralAnchor[];
  ordinal: number;
}): string {
  const anchorDigest = sha256Json(
    input.sourceAnchors.map((anchor) => ({
      promptHash: anchor.promptHash,
      sectionRef: anchor.sectionRef,
      charStart: anchor.charStart,
      charEnd: anchor.charEnd,
      excerptHash: anchor.excerptHash,
    })),
  );
  const hash = sha256Json({
    sourcePromptHash: input.sourcePromptHash,
    operationId: input.operationId,
    anchorDigest,
    ordinal: input.ordinal,
  });
  return `commitment-${hash.slice(0, 16)}`;
}

export function compileCanonicalMissionCommitments(input: {
  compiledCandidateSet: CompiledObligationCandidateSet;
  reviewPlan: unknown;
}): CanonicalMissionCommitments {
  const reviewPlan = ObligationReviewPlanSchema.parse(input.reviewPlan);
  const candidatesByRef = new Map(
    input.compiledCandidateSet.candidates.map((candidate) => [candidate.candidateRef, candidate]),
  );
  const usedOperationIds = new Set<string>();
  const discardedCandidateRefs: string[] = [];
  const ownerReviewCandidateRefs: string[] = [];
  const commitments: CanonicalMissionCommitment[] = [];
  const reasonCodes = ["canonical_commitments_compiled"];

  const requireCandidates = (refs: string[], operationId: string) => {
    const candidates = refs.map((ref) => {
      const candidate = candidatesByRef.get(ref);
      if (!candidate) {
        throw new Error(`unknown_candidate_ref:${operationId}:${ref}`);
      }
      return candidate;
    });
    return candidates;
  };
  const addCommitment = (inputCommitment: {
    operationId: string;
    sourceCandidates: CompiledObligationCandidate[];
    sourceAnchors: SourcePromptStructuralAnchor[];
    commitmentText: string;
    whyItMatters: string;
    expectedEvidenceDescription: string;
    blocking: boolean;
    ownerReviewRequired?: boolean;
  }) => {
    const ordinal = commitments.length;
    const sourceCandidateRefs = inputCommitment.sourceCandidates.map(
      (candidate) => candidate.candidateRef,
    );
    const commitmentId = canonicalCommitmentId({
      sourcePromptHash: input.compiledCandidateSet.sourcePromptHash,
      operationId: inputCommitment.operationId,
      sourceCandidateRefs,
      sourceAnchors: inputCommitment.sourceAnchors,
      ordinal,
    });
    const canonicalHash = sha256Json({
      commitmentId,
      sourceCandidateRefs,
      sourceAnchors: inputCommitment.sourceAnchors.map((anchor) => anchor.excerptHash),
      commitmentTextHash: sha256Text(inputCommitment.commitmentText),
      evidenceHash: sha256Text(inputCommitment.expectedEvidenceDescription),
    });
    commitments.push(
      CanonicalMissionCommitmentSchema.parse({
        commitmentId,
        commitmentRef: `mission://${input.compiledCandidateSet.missionId}/commitments/${commitmentId}`,
        sourceCandidateRefs,
        sourceAnchors: inputCommitment.sourceAnchors,
        commitmentText: inputCommitment.commitmentText,
        whyItMatters: inputCommitment.whyItMatters,
        expectedEvidenceDescription: inputCommitment.expectedEvidenceDescription,
        blocking: inputCommitment.blocking,
        ownerReviewRequired: inputCommitment.ownerReviewRequired ?? false,
        reviewOperationId: inputCommitment.operationId,
        canonicalHash: `sha256:${canonicalHash}`,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    );
  };

  for (const operation of reviewPlan.operations) {
    if (usedOperationIds.has(operation.operationId)) {
      throw new Error(`duplicate_review_operation_id:${operation.operationId}`);
    }
    usedOperationIds.add(operation.operationId);
    switch (operation.operationKind) {
      case "accept_candidate": {
        const [candidate] = requireCandidates(operation.candidateRefs, operation.operationId);
        addCommitment({
          operationId: operation.operationId,
          sourceCandidates: [candidate],
          sourceAnchors: candidate.sourceAnchors,
          commitmentText: operation.resultingCommitmentText ?? candidate.obligationText,
          whyItMatters: candidate.whyItMatters,
          expectedEvidenceDescription:
            operation.expectedEvidenceDescription ?? candidate.expectedEvidenceDescription,
          blocking: blockingFromProposal(candidate, operation.blocking),
        });
        break;
      }
      case "merge_candidates": {
        const sourceCandidates = requireCandidates(operation.candidateRefs, operation.operationId);
        addCommitment({
          operationId: operation.operationId,
          sourceCandidates,
          sourceAnchors: sourceCandidates
            .flatMap((candidate) => candidate.sourceAnchors)
            .slice(0, 24),
          commitmentText: operation.resultingCommitmentText,
          whyItMatters: sourceCandidates.map((candidate) => candidate.whyItMatters).join(" "),
          expectedEvidenceDescription: operation.expectedEvidenceDescription,
          blocking: blockingFromProposal(sourceCandidates[0] ?? null, operation.blocking),
        });
        break;
      }
      case "split_candidate": {
        const [candidate] = requireCandidates(operation.candidateRefs, operation.operationId);
        for (const split of operation.splitCommitments) {
          const splitAnchorRefs = new Set(split.sourceAnchorRefs);
          const splitAnchors =
            splitAnchorRefs.size > 0
              ? candidate.sourceAnchors.filter((anchor) => splitAnchorRefs.has(anchor.excerptRef))
              : candidate.sourceAnchors;
          if (splitAnchors.length === 0) {
            throw new Error(`split_candidate_missing_valid_anchor:${operation.operationId}`);
          }
          addCommitment({
            operationId: operation.operationId,
            sourceCandidates: [candidate],
            sourceAnchors: splitAnchors,
            commitmentText: split.resultingCommitmentText,
            whyItMatters: candidate.whyItMatters,
            expectedEvidenceDescription: split.expectedEvidenceDescription,
            blocking: blockingFromProposal(candidate, split.blocking),
          });
        }
        break;
      }
      case "discard_candidate_as_non_goal": {
        requireCandidates(operation.candidateRefs, operation.operationId);
        discardedCandidateRefs.push(...operation.candidateRefs);
        break;
      }
      case "add_missing_candidate_with_source_anchor": {
        addCommitment({
          operationId: operation.operationId,
          sourceCandidates: [],
          sourceAnchors: operation.sourceAnchors,
          commitmentText: operation.resultingCommitmentText,
          whyItMatters: operation.whyItMatters,
          expectedEvidenceDescription: operation.expectedEvidenceDescription,
          blocking: operation.blocking,
        });
        reasonCodes.push("review_plan_added_missing_candidate");
        break;
      }
      case "mark_candidate_needs_owner_review": {
        const sourceCandidates = requireCandidates(operation.candidateRefs, operation.operationId);
        ownerReviewCandidateRefs.push(...operation.candidateRefs);
        for (const candidate of sourceCandidates) {
          addCommitment({
            operationId: operation.operationId,
            sourceCandidates: [candidate],
            sourceAnchors: candidate.sourceAnchors,
            commitmentText: candidate.obligationText,
            whyItMatters: `${candidate.whyItMatters} Owner review question: ${operation.ownerQuestion}`,
            expectedEvidenceDescription: candidate.expectedEvidenceDescription,
            blocking: true,
            ownerReviewRequired: true,
          });
        }
        break;
      }
      default: {
        const unreachable: never = operation;
        throw new Error(`unsupported_review_operation:${JSON.stringify(unreachable)}`);
      }
    }
  }

  if (commitments.length === 0) {
    throw new Error("canonical_commitments_empty_after_review_plan");
  }
  if (ownerReviewCandidateRefs.length > 0) {
    reasonCodes.push(`owner_review_required:${ownerReviewCandidateRefs.length}`);
  }
  return CanonicalMissionCommitmentsSchema.parse({
    artifactKind: "staged_mission_ledger_canonical_commitments",
    schemaVersion: "execution-platform.staged-mission-ledger.v1",
    missionId: input.compiledCandidateSet.missionId,
    sourcePromptHash: input.compiledCandidateSet.sourcePromptHash,
    sourcePromptVersionRef: input.compiledCandidateSet.sourcePromptVersionRef,
    commitments,
    discardedCandidateRefs: [...new Set(discardedCandidateRefs)].slice(0, 60),
    ownerReviewCandidateRefs: [...new Set(ownerReviewCandidateRefs)].slice(0, 60),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function missionContractLedgerFromCanonicalCommitments(input: {
  canonicalCommitments: CanonicalMissionCommitments;
  ownerObjectiveSummary: string;
  sourceRuntimeJobId?: string | null;
  sourceWorkItemId?: string | null;
  explicitNonGoals?: string[];
  missionGate?: "clear_to_execute" | "needs_review" | "blocked_primary_prohibited";
  missionGateRationale?: string | null;
}): MissionContractLedger {
  const toMissionCommitment = (commitment: CanonicalMissionCommitment): MissionCommitment => ({
    commitmentId: commitment.commitmentId,
    commitmentText: bounded(commitment.commitmentText, 1_200),
    whyItMatters: bounded(commitment.whyItMatters, 800),
    expectedEvidenceDescription: bounded(commitment.expectedEvidenceDescription, 900),
    acceptedEvidenceRefs: [],
    rejectedEvidenceRefs: [],
    status: commitment.ownerReviewRequired ? "needs_review" : "pending",
    rationale: commitment.ownerReviewRequired
      ? "Canonical commitment requires owner review before execution."
      : null,
    remainingWork: [],
    blocking: commitment.blocking,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  const blockingCommitments = input.canonicalCommitments.commitments
    .filter((commitment) => commitment.blocking)
    .map(toMissionCommitment);
  const nonBlockingCommitments = input.canonicalCommitments.commitments
    .filter((commitment) => !commitment.blocking)
    .map(toMissionCommitment);
  return MissionContractLedgerSchema.parse({
    artifactKind: "mission_contract_ledger",
    schemaVersion: MISSION_CONTRACT_LEDGER_SCHEMA_VERSION,
    missionId: input.canonicalCommitments.missionId,
    sourceRuntimeJobId: input.sourceRuntimeJobId ?? null,
    sourceWorkItemId: input.sourceWorkItemId ?? null,
    ownerObjectiveSummary: bounded(input.ownerObjectiveSummary, 2_000),
    blockingCommitments,
    nonBlockingCommitments,
    explicitNonGoals: (input.explicitNonGoals ?? []).slice(0, 20),
    safetyConstraints: [],
    prohibitedDirectiveCandidates: [],
    authorityBoundary: {
      requestedAuthority: null,
      maximumAuthority: "workflow_default",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    missionGate:
      input.missionGate ??
      (input.canonicalCommitments.ownerReviewCandidateRefs.length > 0
        ? "needs_review"
        : "clear_to_execute"),
    missionGateRationale:
      input.missionGateRationale ??
      (input.canonicalCommitments.ownerReviewCandidateRefs.length > 0
        ? "One or more canonical commitments require owner review."
        : null),
    revisionProposals: [],
    ledgerStatus:
      input.canonicalCommitments.ownerReviewCandidateRefs.length > 0 ? "needs_review" : "pending",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
}

export function buildStagedMissionLedgerAcceptance(input: {
  missionId: string;
  canonicalCommitments: CanonicalMissionCommitments;
  missionLedgerRef: string | null;
  canonicalCommitmentsRef: string;
  missionGate?: "clear_to_execute" | "needs_review" | "blocked_primary_prohibited" | null;
  extraReasonCodes?: string[];
}): StagedMissionLedgerAcceptance {
  const commitmentCount = input.canonicalCommitments.commitments.length;
  const blockingCommitmentCount = input.canonicalCommitments.commitments.filter(
    (commitment) => commitment.blocking,
  ).length;
  const ownerReviewCommitmentCount = input.canonicalCommitments.commitments.filter(
    (commitment) => commitment.ownerReviewRequired,
  ).length;
  const status =
    input.missionGate === "blocked_primary_prohibited"
      ? "blocked"
      : commitmentCount === 0 || blockingCommitmentCount === 0 || ownerReviewCommitmentCount > 0
        ? "needs_review"
        : "accepted";
  const reasonCodes = [
    "staged_mission_ledger_acceptance_evaluated",
    `commitment_count:${commitmentCount}`,
    `blocking_commitment_count:${blockingCommitmentCount}`,
    ...(ownerReviewCommitmentCount > 0
      ? [`owner_review_commitment_count:${ownerReviewCommitmentCount}`]
      : []),
    status === "accepted"
      ? "mission_ledger_acceptance_passed"
      : status === "blocked"
        ? "mission_ledger_acceptance_blocked_primary_prohibited"
        : commitmentCount === 0
          ? "mission_ledger_acceptance_missing_commitments"
          : blockingCommitmentCount === 0
            ? "mission_ledger_acceptance_missing_blocking_commitments"
            : "mission_ledger_acceptance_owner_review_required",
    ...(input.extraReasonCodes ?? []),
  ];
  return StagedMissionLedgerAcceptanceSchema.parse({
    artifactKind: "staged_mission_ledger_acceptance",
    schemaVersion: "execution-platform.staged-mission-ledger.v1",
    missionId: input.missionId,
    status,
    missionLedgerRef: input.missionLedgerRef,
    canonicalCommitmentsRef: input.canonicalCommitmentsRef,
    commitmentCount,
    blockingCommitmentCount,
    ownerReviewCommitmentCount,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function buildStagedMissionLedgerStageRepairDiagnostic(input: {
  missionId: string;
  failedStage: StagedMissionLedgerStageRepairDiagnostic["failedStage"];
  error: unknown;
  failedOperationId?: string | null;
  failedPath?: string | null;
  validAlternatives?: string[];
  preservedFieldPaths?: string[];
  repairAttempted?: boolean;
  terminalAfterRepair?: boolean;
  reasonCodes?: string[];
}): StagedMissionLedgerStageRepairDiagnostic {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return StagedMissionLedgerStageRepairDiagnosticSchema.parse({
    artifactKind: "staged_mission_ledger_stage_repair_diagnostic",
    schemaVersion: "execution-platform.staged-mission-ledger.v1",
    diagnosticId: `mission-ledger-stage-repair-${sha256Text(
      `${input.missionId}:${input.failedStage}:${message}`,
    ).slice(0, 20)}`,
    missionId: input.missionId,
    failedStage: input.failedStage,
    failedOperationId: input.failedOperationId ?? null,
    failedPath: input.failedPath ?? null,
    issueSummary: bounded(message, 1_000),
    validAlternatives: (input.validAlternatives ?? []).slice(0, 40),
    preservedFieldPaths: (input.preservedFieldPaths ?? []).slice(0, 40),
    repairAttempted: input.repairAttempted ?? false,
    terminalAfterRepair: input.terminalAfterRepair ?? true,
    reasonCodes: [
      "staged_mission_ledger_stage_repair_diagnostic_recorded",
      `failed_stage:${input.failedStage}`,
      ...(input.reasonCodes ?? []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function summarizeCanonicalMissionCommitments(
  canonicalCommitments: CanonicalMissionCommitments,
): JsonValue {
  return {
    artifactKind: canonicalCommitments.artifactKind,
    missionId: canonicalCommitments.missionId,
    sourcePromptHash: canonicalCommitments.sourcePromptHash,
    sourcePromptVersionRef: canonicalCommitments.sourcePromptVersionRef,
    commitmentCount: canonicalCommitments.commitments.length,
    blockingCommitmentCount: canonicalCommitments.commitments.filter((item) => item.blocking)
      .length,
    ownerReviewCommitmentCount: canonicalCommitments.commitments.filter(
      (item) => item.ownerReviewRequired,
    ).length,
    commitments: canonicalCommitments.commitments.map((commitment) => ({
      commitmentId: commitment.commitmentId,
      commitmentRef: commitment.commitmentRef,
      commitmentText: commitment.commitmentText,
      blocking: commitment.blocking,
      ownerReviewRequired: commitment.ownerReviewRequired,
      sourceCandidateRefs: commitment.sourceCandidateRefs.slice(0, 8),
      sourceAnchorRefs: commitment.sourceAnchors.map((anchor) => anchor.excerptRef).slice(0, 8),
      expectedEvidenceDescription: commitment.expectedEvidenceDescription,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    })),
    reasonCodes: canonicalCommitments.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function lowerReason(input: unknown): string {
  return typeof input === "string" ? input.toLowerCase() : "";
}

export function classifyFastModelNoContent(input: {
  status?: string | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
  timedOut?: boolean | null;
  nativeFinishReason?: string | null;
  finishReason?: string | null;
  choiceCount?: number | null;
  contentLengthByChoice?: number[] | null;
  parsedContentLength?: number | null;
  responseFormatSent?: string | null;
  reasoningModeSent?: string | null;
  expectedModelRef?: string | null;
  actualModelRef?: string | null;
  promptTruncated?: boolean | null;
  timeoutMs?: number | null;
  elapsedMs?: number | null;
}): FastModelNoContentReasonClass {
  const errorReason = lowerReason(input.errorReasonCode);
  const nativeFinish = lowerReason(input.nativeFinishReason);
  const finishReason = lowerReason(input.finishReason);
  const responseFormat = lowerReason(input.responseFormatSent);
  const choiceCount = input.choiceCount ?? null;
  const contentLengths = input.contentLengthByChoice ?? [];
  const parsedContentLength = input.parsedContentLength ?? 0;
  const totalChoiceContentLength = contentLengths.reduce((sum, item) => sum + item, 0);
  const nearTimeout =
    typeof input.timeoutMs === "number" &&
    typeof input.elapsedMs === "number" &&
    input.timeoutMs > 0 &&
    input.elapsedMs >= Math.max(0, input.timeoutMs - 1_000);
  if (
    input.expectedModelRef &&
    input.actualModelRef &&
    input.expectedModelRef !== input.actualModelRef
  ) {
    return "wrong_model_or_profile";
  }
  if (input.promptTruncated || errorReason.includes("truncated")) {
    return "runtime_prompt_truncated";
  }
  if (errorReason.includes("preflight")) {
    return "preflight_blocked";
  }
  if (
    parsedContentLength === 0 &&
    nearTimeout &&
    !nativeFinish &&
    !finishReason &&
    !errorReason.includes("abort")
  ) {
    return "timeout_adjacent_empty_content";
  }
  if (input.timedOut || errorReason.includes("abort")) {
    return "client_abort_before_provider_finish";
  }
  if (errorReason.includes("timeout")) {
    return "provider_timeout";
  }
  if (input.httpStatus === 429 || errorReason.includes("rate") || errorReason.includes("queue")) {
    return "provider_rate_limited_or_queued";
  }
  if (
    errorReason.includes("network") ||
    errorReason.includes("transport") ||
    errorReason.includes("fetch")
  ) {
    return "transport_or_proxy_incomplete";
  }
  if (choiceCount === 0) {
    return "provider_empty_choice";
  }
  if (parsedContentLength === 0 && totalChoiceContentLength > 0) {
    return "adapter_content_extraction_failed";
  }
  if (
    parsedContentLength === 0 &&
    (nativeFinish.includes("length") ||
      nativeFinish.includes("token") ||
      finishReason.includes("length") ||
      finishReason.includes("token"))
  ) {
    return "output_budget_exhausted";
  }
  if (
    parsedContentLength === 0 &&
    (responseFormat.includes("json") ||
      responseFormat.includes("schema") ||
      errorReason.includes("schema") ||
      errorReason.includes("parse"))
  ) {
    return "schema_mode_failure";
  }
  if (errorReason.includes("refusal") || finishReason.includes("refusal")) {
    return "refusal_empty_content";
  }
  if (parsedContentLength === 0) {
    if (!nativeFinish && !finishReason) {
      return "provider_finish_reason_missing";
    }
    return "provider_empty_content";
  }
  return "unknown_provider_empty_output";
}

export function retryEligibilityForNoContentReason(
  reason: FastModelNoContentReasonClass,
): FastModelNoContentDiagnostic["retryEligibility"] {
  switch (reason) {
    case "provider_timeout":
    case "timeout_adjacent_empty_content":
    case "client_abort_before_provider_finish":
    case "provider_rate_limited_or_queued":
    case "transport_error":
    case "transport_or_proxy_incomplete":
    case "empty_choices":
    case "provider_empty_choice":
    case "empty_content":
    case "provider_empty_content":
    case "provider_finish_reason_missing":
    case "provider_usage_missing":
      return "retry_same_bounded_input";
    case "runtime_prompt_truncated":
    case "output_budget_exhausted":
    case "schema_mode_failure":
    case "parse_dropped_content":
    case "adapter_content_extraction_failed":
      return "retry_reduced_input";
    case "wrong_model_or_profile":
    case "preflight_blocked":
    case "refusal_empty_content":
      return "not_retryable";
    case "unknown_provider_empty_output":
      return "escalate";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export function buildFastModelNoContentDiagnostic(input: {
  diagnosticId?: string | null;
  taskClass: string;
  callSite: string;
  modelRef: string;
  providerPath: string;
  modelCandidateId?: string | null;
  requestProfileRef?: string | null;
  providerRequestId?: string | null;
  reasoningModeSent?: string | null;
  responseFormatSent?: string | null;
  inputByteLength: number;
  elapsedMs?: number | null;
  maxOutputTokens?: number | null;
  timeoutMs?: number | null;
  timedOut?: boolean | null;
  nativeFinishReason?: string | null;
  finishReason?: string | null;
  choiceCount?: number | null;
  contentLengthByChoice?: number[] | null;
  parsedContentLength?: number | null;
  retryNumber?: number | null;
  concurrencySlot?: string | null;
  inputBundleRef?: string | null;
  inputBundleHash?: string | null;
  outputHash?: string | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
  expectedModelRef?: string | null;
  promptTruncated?: boolean | null;
}): FastModelNoContentDiagnostic {
  const reason = classifyFastModelNoContent({
    status: null,
    errorReasonCode: input.errorReasonCode ?? null,
    httpStatus: input.httpStatus ?? null,
    timedOut: input.timedOut ?? null,
    nativeFinishReason: input.nativeFinishReason ?? null,
    finishReason: input.finishReason ?? null,
    choiceCount: input.choiceCount ?? null,
    contentLengthByChoice: input.contentLengthByChoice ?? [],
    parsedContentLength: input.parsedContentLength ?? 0,
    responseFormatSent: input.responseFormatSent ?? null,
    reasoningModeSent: input.reasoningModeSent ?? null,
    expectedModelRef: input.expectedModelRef ?? null,
    actualModelRef: input.modelRef,
    promptTruncated: input.promptTruncated ?? null,
    timeoutMs: input.timeoutMs ?? null,
    elapsedMs: input.elapsedMs ?? null,
  });
  return FastModelNoContentDiagnosticSchema.parse({
    artifactKind: "fast_model_no_content_diagnostic",
    schemaVersion: "execution-platform.fast-model-no-content-diagnostic.v1",
    diagnosticId:
      input.diagnosticId ??
      `fast-model-no-content-${sha256Json({
        taskClass: input.taskClass,
        callSite: input.callSite,
        modelRef: input.modelRef,
        inputBundleHash: input.inputBundleHash ?? null,
        retryNumber: input.retryNumber ?? 0,
      }).slice(0, 20)}`,
    taskClass: input.taskClass,
    callSite: input.callSite,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelCandidateId: input.modelCandidateId ?? null,
    requestProfileRef: input.requestProfileRef ?? null,
    providerRequestId: input.providerRequestId ?? null,
    reasoningModeSent: input.reasoningModeSent ?? null,
    responseFormatSent: input.responseFormatSent ?? null,
    inputByteLength: input.inputByteLength,
    elapsedMs: input.elapsedMs ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    timeoutMs: input.timeoutMs ?? null,
    timeoutState:
      input.timedOut === true
        ? "timed_out"
        : input.timedOut === false
          ? "not_timed_out"
          : "unknown",
    nativeFinishReason: input.nativeFinishReason ?? null,
    finishReason: input.finishReason ?? null,
    choiceCount: input.choiceCount ?? null,
    contentLengthByChoice: (input.contentLengthByChoice ?? []).slice(0, 16),
    parsedContentLength: input.parsedContentLength ?? 0,
    retryNumber: input.retryNumber ?? 0,
    concurrencySlot: input.concurrencySlot ?? null,
    inputBundleRef: input.inputBundleRef ?? null,
    inputBundleHash: input.inputBundleHash ?? null,
    outputHash: input.outputHash ?? null,
    classifiedReason: reason,
    retryEligibility: retryEligibilityForNoContentReason(reason),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function maybeBuildFastModelNoContentDiagnostic(input: {
  responseStatus: string;
  responseText: string | null;
  diagnostics: Omit<Parameters<typeof buildFastModelNoContentDiagnostic>[0], "parsedContentLength">;
}): FastModelNoContentDiagnostic | null {
  const parsedContentLength = (input.responseText ?? "").trim().length;
  if (
    input.responseStatus !== "no_content" &&
    input.responseStatus !== "failed" &&
    parsedContentLength > 0
  ) {
    return null;
  }
  return buildFastModelNoContentDiagnostic({
    ...input.diagnostics,
    parsedContentLength,
  });
}

export function buildFailedPacketReplayResult(input: {
  replayId: string;
  commitmentId: string;
  inputBundleRef: string;
  inputBundleHash: string;
  attempts: FastModelNoContentDiagnostic[];
  status?: FailedPacketReplayResult["status"] | null;
  reasonCodes?: string[];
}): FailedPacketReplayResult {
  const reproduced =
    input.attempts.length > 1 &&
    input.attempts.every((attempt) => attempt.inputBundleHash === input.inputBundleHash);
  return FailedPacketReplayResultSchema.parse({
    artifactKind: "failed_packet_replay_result",
    schemaVersion: "execution-platform.failed-packet-replay-result.v1",
    replayId: input.replayId,
    commitmentId: input.commitmentId,
    inputBundleRef: input.inputBundleRef,
    inputBundleHash: input.inputBundleHash,
    status: input.status ?? (reproduced ? "reproduced_failure" : "needs_review"),
    attempts: input.attempts,
    reasonCodes: [
      ...(input.reasonCodes ?? []),
      ...(reproduced ? ["same_bounded_input_reproduced_no_content"] : []),
    ].slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function normalizePacketSemanticBrief(value: unknown): PacketSemanticBrief {
  const record = asRecord(value);
  const candidate = asRecord(
    record.packetSemanticContent ??
      record.semanticPacketContent ??
      record.packetBrief ??
      record.semanticBrief ??
      record.packet,
  );
  return PacketSemanticBriefSchema.parse({
    artifactKind: "commitment_packet_semantic_brief",
    schemaVersion: "execution-platform.commitment-packet-semantic-brief.v1",
    commitmentId: bounded(
      scalarString(candidate.commitmentId, scalarString(record.commitmentId)),
      120,
    ),
    commitmentMeaning: bounded(scalarString(candidate.commitmentMeaning), 1_500),
    ownerIntentSummary: bounded(scalarString(candidate.ownerIntentSummary), 1_200),
    workerObjective: bounded(scalarString(candidate.workerObjective), 1_500),
    contextScoutObjective: bounded(scalarString(candidate.contextScoutObjective), 1_500),
    implementationObjective: bounded(scalarString(candidate.implementationObjective), 1_500),
    validationObjective: bounded(scalarString(candidate.validationObjective), 1_200),
    reviewObjective: bounded(scalarString(candidate.reviewObjective), 1_200),
    acceptanceCriteria: stringArray(candidate.acceptanceCriteria, 16, 700),
    requiredContextQuestions: stringArray(candidate.requiredContextQuestions, 16, 700),
    likelyRepoAreas: stringArray(candidate.likelyRepoAreas, 20, 260),
    expectedOutputs: stringArray(
      candidate.expectedOutputs ??
        candidate.expectedImplementationOutput ??
        candidate.expectedEvidenceDescriptions,
      16,
      700,
    ),
    stopIfMissing: stringArray(candidate.stopIfMissing, 16, 700),
    risks: stringArray(candidate.risks ?? candidate.uncertaintiesAndRisks, 16, 700),
    downstreamConsumer: bounded(
      scalarString(candidate.downstreamConsumer, "runtime_work_graph_scheduler"),
      260,
    ),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}
