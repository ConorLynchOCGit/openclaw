import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

export const MISSION_CONTRACT_LEDGER_SCHEMA_VERSION =
  "execution-platform.mission-contract-ledger.v1";
export const MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE = "execution_platform.mission_contract_ledger";
export const MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE =
  "execution_platform.mission_contract_evaluation";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable();
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

const MissionSafetyConstraintSchema = z
  .object({
    constraintId: boundedString(120),
    constraintText: boundedString(800),
    boundaryKind: z.enum([
      "authority",
      "storage",
      "lifecycle",
      "side_effect",
      "scope",
      "validation",
      "privacy",
      "security",
      "other",
    ]),
    enforcementOwner: z.enum([
      "mission_ledger",
      "compiler",
      "authority_gate",
      "runtime_policy",
      "human_review",
    ]),
    evidenceRefs: stringList(12, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

const ProhibitedDirectiveCandidateSchema = z
  .object({
    directiveId: boundedString(120),
    directiveText: boundedString(800),
    classification: z.enum([
      "constraint_not_primary",
      "primary_prohibited",
      "ambiguous_needs_review",
    ]),
    rationale: boundedString(1_000),
    actionCategory: optionalBoundedString(120),
    evidenceRefs: stringList(12, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

const MissionAuthorityBoundarySchema = z
  .object({
    requestedAuthority: optionalBoundedString(120),
    maximumAuthority: boundedString(120),
    requiresApproval: z.boolean(),
    approvalRefs: stringList(12, 260),
    authorityRefs: stringList(12, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
  })
  .strict();

const MissionStoragePolicySchema = z
  .object({
    rawPromptStorageAllowed: z.literal(false),
    rawResponseStorageAllowed: z.literal(false),
    rawTranscriptStorageAllowed: z.literal(false),
    rawProviderLogStorageAllowed: z.literal(false),
    rawToolLogStorageAllowed: z.literal(false),
    rawDbRowStorageAllowed: z.literal(false),
    secretsStorageAllowed: z.literal(false),
    boundedRefsOnly: z.literal(true),
  })
  .strict();

const MissionLifecycleBoundarySchema = z
  .object({
    workQueueLifecycleMutationAllowed: z.literal(false),
    authorityGrantAllowed: z.literal(false),
    deployAllowed: z.literal(false),
    outboundSendAllowed: z.literal(false),
    modelPromotionAllowed: z.literal(false),
    runtimeJobLifecycleOwner: z.literal("runtime_jobs"),
  })
  .strict();

export const MissionGateSchema = z.enum([
  "clear_to_execute",
  "needs_review",
  "blocked_primary_prohibited",
]);

export type MissionGate = z.infer<typeof MissionGateSchema>;

export const MissionCommitmentStatusSchema = z.enum([
  "pending",
  "satisfied",
  "partially_satisfied",
  "impossible",
  "needs_review",
]);

export type MissionCommitmentStatus = z.infer<typeof MissionCommitmentStatusSchema>;

export const MissionCommitmentSchema = z
  .object({
    commitmentId: boundedString(120),
    commitmentText: boundedString(1_200),
    whyItMatters: boundedString(800),
    expectedEvidenceDescription: boundedString(900),
    acceptedEvidenceRefs: stringList(20, 260),
    rejectedEvidenceRefs: stringList(20, 260),
    status: MissionCommitmentStatusSchema,
    rationale: optionalBoundedString(1_000),
    remainingWork: stringList(12, 500),
    blocking: z.boolean(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type MissionCommitment = z.infer<typeof MissionCommitmentSchema>;

export const MissionContractRevisionProposalSchema = z
  .object({
    revisionId: boundedString(120),
    proposedBy: boundedString(120),
    rationale: boundedString(1_000),
    affectedCommitmentIds: stringList(12, 120),
    proposedCommitmentTexts: stringList(20, 1_000),
    status: z.enum(["proposed", "accepted", "rejected", "needs_review"]),
    evidenceRefs: stringList(20, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export const MissionContractLedgerSchema = z
  .object({
    artifactKind: z.literal("mission_contract_ledger"),
    schemaVersion: z.literal(MISSION_CONTRACT_LEDGER_SCHEMA_VERSION),
    missionId: boundedString(160),
    sourceRuntimeJobId: optionalBoundedString(180),
    sourceWorkItemId: optionalBoundedString(180),
    ownerObjectiveSummary: boundedString(2_000),
    blockingCommitments: z.array(MissionCommitmentSchema).max(30),
    nonBlockingCommitments: z.array(MissionCommitmentSchema).max(30),
    explicitNonGoals: stringList(20, 600),
    safetyConstraints: z.array(MissionSafetyConstraintSchema).max(30).default([]),
    prohibitedDirectiveCandidates: z.array(ProhibitedDirectiveCandidateSchema).max(20).default([]),
    authorityBoundary: MissionAuthorityBoundarySchema.default({
      requestedAuthority: null,
      maximumAuthority: "workflow_default",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    storagePolicy: MissionStoragePolicySchema.default({
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    }),
    lifecycleBoundary: MissionLifecycleBoundarySchema.default({
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    }),
    missionGate: MissionGateSchema.default("clear_to_execute"),
    missionGateRationale: optionalBoundedString(1_000).default(null),
    revisionProposals: z.array(MissionContractRevisionProposalSchema).max(12),
    ledgerStatus: z.enum(["pending", "satisfied", "needs_review", "blocked"]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type MissionContractLedger = z.infer<typeof MissionContractLedgerSchema>;

export const MissionCommitmentEvaluationSchema = z
  .object({
    artifactKind: z.literal("mission_commitment_evaluation"),
    schemaVersion: z.literal(MISSION_CONTRACT_LEDGER_SCHEMA_VERSION),
    evaluationId: boundedString(160),
    missionId: boundedString(160),
    commitmentUpdates: z
      .array(
        z
          .object({
            commitmentId: boundedString(120),
            status: MissionCommitmentStatusSchema,
            acceptedEvidenceRefs: stringList(20, 260),
            rejectedEvidenceRefs: stringList(20, 260),
            rationale: boundedString(1_000),
            remainingWork: stringList(12, 500),
          })
          .strict(),
      )
      .max(30),
    revisionProposals: z.array(MissionContractRevisionProposalSchema).max(12),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type MissionCommitmentEvaluation = z.infer<typeof MissionCommitmentEvaluationSchema>;

export type MissionContractLedgerSummary = {
  missionId: string;
  ledgerStatus: MissionContractLedger["ledgerStatus"];
  blockingCommitmentCount: number;
  openBlockingCommitmentCount: number;
  missionGate: MissionGate;
  missionGateRationale: string | null;
  safetyConstraintCount: number;
  prohibitedPrimaryDirectiveCount: number;
  commitments: Array<{
    commitmentId: string;
    commitmentText: string;
    expectedEvidenceDescription: string;
    status: MissionCommitmentStatus;
    blocking: boolean;
    acceptedEvidenceRefs: string[];
    remainingWork: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
};

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string, max = 1_000): string {
  return typeof value === "string" && value.trim() ? bounded(value, max) : fallback;
}

function stringArray(value: unknown, maxItems: number, maxChars = 260): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => bounded(item, maxChars))
        .slice(0, maxItems)
    : [];
}

function statusValue(value: unknown): MissionCommitmentStatus {
  return MissionCommitmentStatusSchema.safeParse(value).success
    ? (value as MissionCommitmentStatus)
    : "pending";
}

function normalizeCommitment(
  value: unknown,
  fallbackIdPrefix: string,
  blocking: boolean,
): MissionCommitment | null {
  const record = asRecord(value);
  const commitmentText = stringValue(record.commitmentText ?? record.text, "", 1_200);
  if (!commitmentText) {
    return null;
  }
  const commitmentId =
    stringValue(record.commitmentId ?? record.id, "", 120) ||
    `${fallbackIdPrefix}-${hashText(commitmentText).slice(0, 12)}`;
  return {
    commitmentId,
    commitmentText,
    whyItMatters: stringValue(record.whyItMatters, "Mission requirement from owner prompt.", 800),
    expectedEvidenceDescription: stringValue(
      record.expectedEvidenceDescription,
      "Model-authored evidence refs must show this commitment was handled.",
      900,
    ),
    acceptedEvidenceRefs: stringArray(record.acceptedEvidenceRefs, 20),
    rejectedEvidenceRefs: stringArray(record.rejectedEvidenceRefs, 20),
    status: statusValue(record.status),
    rationale: typeof record.rationale === "string" ? bounded(record.rationale, 1_000) : null,
    remainingWork: stringArray(record.remainingWork, 12, 500),
    blocking: typeof record.blocking === "boolean" ? record.blocking : blocking,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function normalizeSafetyConstraint(value: unknown, index: number) {
  const record = asRecord(value);
  const constraintText = stringValue(record.constraintText ?? record.text, "", 800);
  if (!constraintText) {
    return null;
  }
  const boundaryKind = [
    "authority",
    "storage",
    "lifecycle",
    "side_effect",
    "scope",
    "validation",
    "privacy",
    "security",
    "other",
  ].includes(String(record.boundaryKind))
    ? String(record.boundaryKind)
    : "other";
  const enforcementOwner = [
    "mission_ledger",
    "compiler",
    "authority_gate",
    "runtime_policy",
    "human_review",
  ].includes(String(record.enforcementOwner))
    ? String(record.enforcementOwner)
    : "mission_ledger";
  return MissionSafetyConstraintSchema.parse({
    constraintId:
      stringValue(record.constraintId ?? record.id, "", 120) ||
      `constraint-${index + 1}-${hashText(constraintText).slice(0, 8)}`,
    constraintText,
    boundaryKind,
    enforcementOwner,
    evidenceRefs: stringArray(record.evidenceRefs, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

function normalizeProhibitedDirectiveCandidate(value: unknown, index: number) {
  const record = asRecord(value);
  const directiveText = stringValue(record.directiveText ?? record.text, "", 800);
  if (!directiveText) {
    return null;
  }
  const classification = [
    "constraint_not_primary",
    "primary_prohibited",
    "ambiguous_needs_review",
  ].includes(String(record.classification))
    ? String(record.classification)
    : "ambiguous_needs_review";
  return ProhibitedDirectiveCandidateSchema.parse({
    directiveId:
      stringValue(record.directiveId ?? record.id, "", 120) ||
      `directive-${index + 1}-${hashText(directiveText).slice(0, 8)}`,
    directiveText,
    classification,
    rationale: stringValue(
      record.rationale,
      "Model-authored directive classification requires review.",
      1_000,
    ),
    actionCategory:
      typeof record.actionCategory === "string" ? bounded(record.actionCategory, 120) : null,
    evidenceRefs: stringArray(record.evidenceRefs, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

function normalizeMissionGate(value: unknown): MissionGate {
  return MissionGateSchema.safeParse(value).success ? (value as MissionGate) : "clear_to_execute";
}

export function normalizeMissionContractLedger(input: {
  value: unknown;
  missionId: string;
  sourceRuntimeJobId?: string | null;
  sourceWorkItemId?: string | null;
  ownerObjectiveSummary: string;
}): MissionContractLedger {
  const record = asRecord(input.value);
  const blockingCommitments = (
    Array.isArray(record.blockingCommitments) ? record.blockingCommitments : []
  )
    .map((item) => normalizeCommitment(item, "blocking", true))
    .filter((item): item is MissionCommitment => Boolean(item))
    .slice(0, 30);
  const nonBlockingCommitments = (
    Array.isArray(record.nonBlockingCommitments) ? record.nonBlockingCommitments : []
  )
    .map((item) => normalizeCommitment(item, "nonblocking", false))
    .filter((item): item is MissionCommitment => Boolean(item))
    .slice(0, 30);
  const fallbackBlocking =
    blockingCommitments.length > 0
      ? []
      : [
          normalizeCommitment(
            {
              commitmentId: "owner-objective",
              commitmentText: bounded(input.ownerObjectiveSummary, 1_200),
              whyItMatters:
                "This preserves the owner's stated mission when the model omits details.",
              expectedEvidenceDescription:
                "Final evidence refs must show the owner objective was actually completed or explicitly revised.",
              status: "pending",
              blocking: true,
            },
            "blocking",
            true,
          ),
        ].filter((item): item is MissionCommitment => Boolean(item));
  const ledger = {
    artifactKind: "mission_contract_ledger" as const,
    schemaVersion: MISSION_CONTRACT_LEDGER_SCHEMA_VERSION,
    missionId: stringValue(record.missionId, input.missionId, 160),
    sourceRuntimeJobId: input.sourceRuntimeJobId ?? null,
    sourceWorkItemId: input.sourceWorkItemId ?? null,
    ownerObjectiveSummary: bounded(input.ownerObjectiveSummary, 2_000),
    blockingCommitments: [...blockingCommitments, ...fallbackBlocking].slice(0, 30),
    nonBlockingCommitments,
    explicitNonGoals: stringArray(record.explicitNonGoals, 20, 600),
    safetyConstraints: (Array.isArray(record.safetyConstraints) ? record.safetyConstraints : [])
      .map((item, index) => normalizeSafetyConstraint(item, index))
      .filter((item): item is z.infer<typeof MissionSafetyConstraintSchema> => Boolean(item))
      .slice(0, 30),
    prohibitedDirectiveCandidates: (Array.isArray(record.prohibitedDirectiveCandidates)
      ? record.prohibitedDirectiveCandidates
      : []
    )
      .map((item, index) => normalizeProhibitedDirectiveCandidate(item, index))
      .filter((item): item is z.infer<typeof ProhibitedDirectiveCandidateSchema> => Boolean(item))
      .slice(0, 20),
    authorityBoundary: {
      requestedAuthority:
        typeof asRecord(record.authorityBoundary).requestedAuthority === "string"
          ? bounded(String(asRecord(record.authorityBoundary).requestedAuthority), 120)
          : null,
      maximumAuthority: stringValue(
        asRecord(record.authorityBoundary).maximumAuthority,
        "workflow_default",
        120,
      ),
      requiresApproval: Boolean(asRecord(record.authorityBoundary).requiresApproval),
      approvalRefs: stringArray(asRecord(record.authorityBoundary).approvalRefs, 12),
      authorityRefs: stringArray(asRecord(record.authorityBoundary).authorityRefs, 12),
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
    missionGate: normalizeMissionGate(record.missionGate),
    missionGateRationale:
      typeof record.missionGateRationale === "string"
        ? bounded(record.missionGateRationale, 1_000)
        : null,
    revisionProposals: [],
    ledgerStatus: "pending" as const,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
  return recomputeMissionLedgerStatus(MissionContractLedgerSchema.parse(ledger));
}

export function parseMissionContractLedger(value: unknown): MissionContractLedger {
  return recomputeMissionLedgerStatus(MissionContractLedgerSchema.parse(value));
}

export function parseMissionCommitmentEvaluation(value: unknown): MissionCommitmentEvaluation {
  return MissionCommitmentEvaluationSchema.parse(value);
}

export function missionCommitmentIsClosed(commitment: MissionCommitment): boolean {
  return commitment.status === "satisfied" || commitment.status === "impossible";
}

export function openBlockingMissionCommitments(ledger: MissionContractLedger): MissionCommitment[] {
  return ledger.blockingCommitments.filter((commitment) => !missionCommitmentIsClosed(commitment));
}

export function missionLedgerHasOpenBlockingCommitments(ledger: MissionContractLedger): boolean {
  return openBlockingMissionCommitments(ledger).length > 0;
}

export function recomputeMissionLedgerStatus(ledger: MissionContractLedger): MissionContractLedger {
  const openBlocking = openBlockingMissionCommitments(ledger);
  return {
    ...ledger,
    ledgerStatus:
      ledger.missionGate === "blocked_primary_prohibited"
        ? "blocked"
        : ledger.missionGate === "needs_review"
          ? "needs_review"
          : openBlocking.length === 0
            ? "satisfied"
            : openBlocking.some((commitment) => commitment.status === "needs_review")
              ? "needs_review"
              : "pending",
  };
}

export function missionLedgerBlocksExecution(ledger: MissionContractLedger): boolean {
  return ledger.missionGate === "blocked_primary_prohibited";
}

export function missionLedgerRequiresReviewBeforeExecution(ledger: MissionContractLedger): boolean {
  return ledger.missionGate === "needs_review";
}

export function applyMissionCommitmentEvaluation(input: {
  ledger: MissionContractLedger;
  evaluation: MissionCommitmentEvaluation;
  availableEvidenceRefs?: string[];
}): MissionContractLedger {
  const available = new Set(input.availableEvidenceRefs ?? []);
  const updateById = new Map(
    input.evaluation.commitmentUpdates.map((update) => [update.commitmentId, update]),
  );
  const apply = (commitment: MissionCommitment): MissionCommitment => {
    const update = updateById.get(commitment.commitmentId);
    if (!update) {
      return commitment;
    }
    const refs = update.acceptedEvidenceRefs.filter(
      (ref) => available.size === 0 || available.has(ref),
    );
    return {
      ...commitment,
      status: update.status,
      acceptedEvidenceRefs: refs,
      rejectedEvidenceRefs: update.rejectedEvidenceRefs,
      rationale: update.rationale,
      remainingWork: update.remainingWork,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  };
  return recomputeMissionLedgerStatus(
    MissionContractLedgerSchema.parse({
      ...input.ledger,
      blockingCommitments: input.ledger.blockingCommitments.map(apply),
      nonBlockingCommitments: input.ledger.nonBlockingCommitments.map(apply),
      revisionProposals: [
        ...input.ledger.revisionProposals,
        ...input.evaluation.revisionProposals,
      ].slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    }),
  );
}

export function summarizeMissionContractLedger(
  ledger: MissionContractLedger,
): MissionContractLedgerSummary {
  const commitments = [...ledger.blockingCommitments, ...ledger.nonBlockingCommitments].map(
    (commitment) => ({
      commitmentId: commitment.commitmentId,
      commitmentText: commitment.commitmentText,
      expectedEvidenceDescription: commitment.expectedEvidenceDescription,
      status: commitment.status,
      blocking: commitment.blocking,
      acceptedEvidenceRefs: commitment.acceptedEvidenceRefs.slice(0, 8),
      remainingWork: commitment.remainingWork.slice(0, 6),
    }),
  );
  return {
    missionId: ledger.missionId,
    ledgerStatus: ledger.ledgerStatus,
    blockingCommitmentCount: ledger.blockingCommitments.length,
    openBlockingCommitmentCount: openBlockingMissionCommitments(ledger).length,
    missionGate: ledger.missionGate,
    missionGateRationale: ledger.missionGateRationale,
    safetyConstraintCount: ledger.safetyConstraints.length,
    prohibitedPrimaryDirectiveCount: ledger.prohibitedDirectiveCandidates.filter(
      (candidate) => candidate.classification === "primary_prohibited",
    ).length,
    commitments,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function missionContractLedgerArtifactRef(input: {
  runtimeJobId: string;
  missionId: string;
  revision?: number;
}): string {
  return `runtime-job://${input.runtimeJobId}/mission-contract-ledger/${input.missionId}${
    input.revision ? `/${input.revision}` : ""
  }`;
}

export function missionContractLedgerHash(ledger: MissionContractLedger): string {
  return hashText(JSON.stringify(ledger));
}

export function missionContractLedgerToJson(ledger: MissionContractLedger): JsonValue {
  return ledger as unknown as JsonValue;
}
