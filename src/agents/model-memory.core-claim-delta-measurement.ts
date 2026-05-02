import { readFile } from "node:fs/promises";
import {
  assessStructuralSameClaimDelta,
  describeClaimFieldComparison,
  deriveMemoryIdentity,
  isDeterministicSameSlotSupersession,
  type ClaimFieldComparison,
  type StructuralDeltaClass,
} from "../plugin-sdk/model-memory-legacy.js";
import {
  type ModelMemoryObject,
  type ModelMemoryObjectRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import type {
  DuplicateAuditPathClassification,
  DuplicateAuditReport,
  DuplicateAuditRerunEscapeCase,
} from "./model-memory.duplicate-audit.ts";
import type {
  DuplicateReviewCase,
  DuplicateReviewLabel,
  ModelMemoryDuplicateReviewReport,
} from "./model-memory.duplicate-review.ts";
import { summarizeModelMemoryPayload } from "./model-memory.payload-summary.ts";

type MeasurementSampleRole =
  | "reviewed_clear_duplicate_should_attach"
  | "reviewed_clear_distinct_control"
  | "reviewed_true_ambiguity_control"
  | "reviewed_policy_change"
  | "audited_miss"
  | "audited_legit_distinct_control";

type HypotheticalOutcome =
  | "would_flip_attach_support"
  | "would_not_flip"
  | "risky_distinct_control";

type CurrentPathBlocker =
  | "no_retained_candidates"
  | "blocking_core_claim_fields"
  | "blocking_packaging_fields"
  | "non_packaging_delta"
  | "same_slot_supersession"
  | "no_unique_dominant_candidate"
  | "batch_choice_or_attach_threshold"
  | "already_exact_identity"
  | "already_legit_distinct";

export type CoreClaimDeltaMeasurementCase = {
  caseId: string;
  source: string;
  kind: string;
  sampleRole: MeasurementSampleRole;
  reviewerLabel?: DuplicateReviewLabel;
  historicalDecision: string;
  replayPathClassification: DuplicateAuditPathClassification;
  missClass: string;
  sameClaimConfidence: string;
  packagingDriftType?: string;
  retainedCandidateCount: number;
  currentPathBlocker: CurrentPathBlocker;
  targetCandidateId?: string;
  targetCandidatePayloadSummary?: string;
  claimFieldComparison?: {
    coreClaimFields: string[];
    packagingFields: string[];
    matchingCoreClaimFields: string[];
    blockingCoreClaimFields: string[];
    matchingPackagingFields: string[];
    blockingPackagingFields: string[];
    coreClaimMatch: boolean;
    coreClaimSummary: string;
    packagingSummary: string;
  };
  deltaClass?: StructuralDeltaClass;
  deltaSummary?: string;
  sameClaimLeaning?: boolean;
  dominantCoreClaimCandidateIds: string[];
  wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift: boolean;
  hypotheticalOutcome: HypotheticalOutcome;
};

export type ModelMemoryCoreClaimDeltaMeasurementReport = {
  generatedAt: string;
  duplicateAuditPath: string;
  duplicateAuditGeneratedAt: string;
  duplicateReviewPath: string;
  duplicateReviewGeneratedAt: string;
  databaseMode?: string;
  databaseName?: string;
  measuredCaseCount: number;
  cases: CoreClaimDeltaMeasurementCase[];
  summary: {
    reviewedCaseCount: number;
    auditedOnlyCaseCount: number;
    clearDuplicateShouldAttachCount: number;
    legitDistinctControlCount: number;
    ambiguityControlCount: number;
    missesBlockedByCoreClaimFields: number;
    missesBlockedByPackagingFields: number;
    missesBlockedByNeitherFieldClass: number;
    clearMissesThatWouldFlip: number;
    legitDistinctControlsThatWouldBecomeRisky: number;
    casesByCurrentPathBlocker: Record<string, number>;
    casesByDeltaClass: Record<string, number>;
    casesByReviewerLabel: Record<string, number>;
  };
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function summarizePayload(record: Pick<ModelMemoryObjectRecord, "kind" | "payload">): string {
  return summarizeModelMemoryPayload(record);
}

function toSyntheticObject(record: ModelMemoryObjectRecord): ModelMemoryObject {
  return {
    canonicalClass: record.canonicalClass as ModelMemoryObject["canonicalClass"],
    kind: record.kind as ModelMemoryObject["kind"],
    payload: record.payload as ModelMemoryObject["payload"],
    scope: record.scope as ModelMemoryObject["scope"],
    provenance: (record.provenance ?? []) as ModelMemoryObject["provenance"],
    confidence: record.confidence as ModelMemoryObject["confidence"],
    durability: record.durability as ModelMemoryObject["durability"],
    reviewMode: "auto_accept" as const,
    rationaleCodes: record.rationaleCodes as ModelMemoryObject["rationaleCodes"],
  } as ModelMemoryObject;
}

function normalizeReviewLabel(value: string | undefined): DuplicateReviewLabel | undefined {
  if (
    value === "clear_duplicate_should_attach" ||
    value === "clear_distinct_should_stay_distinct" ||
    value === "true_ambiguity" ||
    value === "needs_policy_change"
  ) {
    return value;
  }
  return undefined;
}

function buildSampleRole(input: {
  reviewCase?: DuplicateReviewCase;
  auditCase: DuplicateAuditRerunEscapeCase;
}): MeasurementSampleRole {
  const reviewerLabel = normalizeReviewLabel(input.reviewCase?.reviewerLabel);
  if (reviewerLabel === "clear_duplicate_should_attach") {
    return "reviewed_clear_duplicate_should_attach";
  }
  if (reviewerLabel === "clear_distinct_should_stay_distinct") {
    return "reviewed_clear_distinct_control";
  }
  if (reviewerLabel === "true_ambiguity") {
    return "reviewed_true_ambiguity_control";
  }
  if (reviewerLabel === "needs_policy_change") {
    return "reviewed_policy_change";
  }
  return input.auditCase.missClass === "legit_distinct"
    ? "audited_legit_distinct_control"
    : "audited_miss";
}

function isClearDuplicateMiss(caseRecord: CoreClaimDeltaMeasurementCase): boolean {
  return caseRecord.sampleRole === "reviewed_clear_duplicate_should_attach";
}

function isLegitDistinctControl(caseRecord: CoreClaimDeltaMeasurementCase): boolean {
  return (
    caseRecord.sampleRole === "reviewed_clear_distinct_control" ||
    caseRecord.sampleRole === "audited_legit_distinct_control"
  );
}

function isAmbiguityControl(caseRecord: CoreClaimDeltaMeasurementCase): boolean {
  return caseRecord.sampleRole === "reviewed_true_ambiguity_control";
}

function buildClaimFieldSummary(
  comparison: ClaimFieldComparison,
): CoreClaimDeltaMeasurementCase["claimFieldComparison"] {
  return {
    coreClaimFields: comparison.coreClaimFields,
    packagingFields: comparison.packagingFields,
    matchingCoreClaimFields: comparison.matchingCoreClaimFields,
    blockingCoreClaimFields: comparison.blockingCoreClaimFields,
    matchingPackagingFields: comparison.matchingPackagingFields,
    blockingPackagingFields: comparison.blockingPackagingFields,
    coreClaimMatch: comparison.coreClaimMatch,
    coreClaimSummary: comparison.coreClaimSummary,
    packagingSummary: comparison.packagingSummary,
  };
}

function findTargetCandidate(input: {
  auditCase: DuplicateAuditRerunEscapeCase;
  objectById: Map<string, ModelMemoryObjectRecord>;
}): ModelMemoryObjectRecord | undefined {
  const retainedIds = input.auditCase.retainedPriorCandidates.map(
    (candidate) => candidate.objectId,
  );
  const nearestIds = input.auditCase.nearestPriorCandidates.map((candidate) => candidate.objectId);
  for (const candidateId of [...retainedIds, ...nearestIds]) {
    const record = input.objectById.get(candidateId);
    if (record) {
      return record;
    }
  }
  return undefined;
}

function hasSameSlotSupersessionReason(input: {
  objectRecord: ModelMemoryObjectRecord;
  candidateRecord: ModelMemoryObjectRecord;
}): boolean {
  const objectIdentity = deriveMemoryIdentity(toSyntheticObject(input.objectRecord));
  return isDeterministicSameSlotSupersession(
    {
      kind: input.candidateRecord.kind as ModelMemoryObject["kind"],
      identityKey: input.candidateRecord.identityKey,
      slotKey: input.candidateRecord.slotKey,
    },
    {
      kind: input.objectRecord.kind as ModelMemoryObject["kind"],
      identityKey: objectIdentity.identityKey,
      slotKey: objectIdentity.slotKey,
    },
  );
}

function buildDominantCoreClaimCandidateIds(input: {
  auditCase: DuplicateAuditRerunEscapeCase;
  objectRecord: ModelMemoryObjectRecord;
  objectById: Map<string, ModelMemoryObjectRecord>;
}): string[] {
  const retainedRecords = input.auditCase.retainedPriorCandidates
    .map((candidate) => input.objectById.get(candidate.objectId))
    .filter((record): record is ModelMemoryObjectRecord => Boolean(record));

  return retainedRecords
    .filter((candidate) => {
      const comparison = describeClaimFieldComparison(
        toSyntheticObject(input.objectRecord),
        candidate,
      );
      const delta = assessStructuralSameClaimDelta(
        toSyntheticObject(input.objectRecord),
        candidate,
      );
      return comparison.coreClaimMatch && delta.deltaClass === "packaging_only_drift";
    })
    .map((candidate) => candidate.id);
}

function determineCurrentPathBlocker(input: {
  auditCase: DuplicateAuditRerunEscapeCase;
  comparison?: ClaimFieldComparison;
  deltaClass?: StructuralDeltaClass;
  dominantCoreClaimCandidateIds: string[];
  sameSlotSupersessionReason: boolean;
}): CurrentPathBlocker {
  if (input.auditCase.replayPathClassification === "exact_identity") {
    return "already_exact_identity";
  }
  if (input.auditCase.missClass === "legit_distinct") {
    return "already_legit_distinct";
  }
  if (input.auditCase.retainedCandidateCount === 0) {
    return "no_retained_candidates";
  }
  if (input.comparison?.blockingCoreClaimFields.length) {
    return "blocking_core_claim_fields";
  }
  if (input.comparison?.blockingPackagingFields.length) {
    return "blocking_packaging_fields";
  }
  if (input.sameSlotSupersessionReason) {
    return "same_slot_supersession";
  }
  if (input.deltaClass && input.deltaClass !== "packaging_only_drift") {
    return "non_packaging_delta";
  }
  if (input.dominantCoreClaimCandidateIds.length !== 1) {
    return "no_unique_dominant_candidate";
  }
  return "batch_choice_or_attach_threshold";
}

function buildHypotheticalOutcome(input: {
  wouldFlip: boolean;
  distinctControl: boolean;
}): HypotheticalOutcome {
  if (input.wouldFlip && input.distinctControl) {
    return "risky_distinct_control";
  }
  if (input.wouldFlip) {
    return "would_flip_attach_support";
  }
  return "would_not_flip";
}

function sortCases(
  left: CoreClaimDeltaMeasurementCase,
  right: CoreClaimDeltaMeasurementCase,
): number {
  const roleOrder: Record<MeasurementSampleRole, number> = {
    reviewed_clear_duplicate_should_attach: 0,
    reviewed_true_ambiguity_control: 1,
    reviewed_clear_distinct_control: 2,
    reviewed_policy_change: 3,
    audited_miss: 4,
    audited_legit_distinct_control: 5,
  };
  if (roleOrder[left.sampleRole] !== roleOrder[right.sampleRole]) {
    return roleOrder[left.sampleRole] - roleOrder[right.sampleRole];
  }
  return left.caseId.localeCompare(right.caseId);
}

export async function runModelMemoryCoreClaimDeltaMeasurement(input: {
  runtime: ModelMemoryDatabaseRuntime;
  duplicateAuditPath: string;
  duplicateReviewPath: string;
}): Promise<ModelMemoryCoreClaimDeltaMeasurementReport> {
  const [duplicateAudit, duplicateReview, snapshot] = await Promise.all([
    readFile(input.duplicateAuditPath, "utf8").then(
      (value) => JSON.parse(value) as DuplicateAuditReport,
    ),
    readFile(input.duplicateReviewPath, "utf8").then(
      (value) => JSON.parse(value) as ModelMemoryDuplicateReviewReport,
    ),
    input.runtime.canonicalRepository.snapshot(),
  ]);

  const objectById = new Map(snapshot.memoryObjects.map((record) => [record.id, record] as const));
  const reviewCaseById = new Map(
    duplicateReview.cases.map((caseRecord) => [caseRecord.caseId, caseRecord] as const),
  );

  const cases = duplicateAudit.rerunEscapeCases
    .map((auditCase) => {
      const reviewCase = reviewCaseById.get(auditCase.caseId);
      const objectRecord = objectById.get(auditCase.memoryObjectId);
      const targetCandidate = objectRecord
        ? findTargetCandidate({
            auditCase,
            objectById,
          })
        : undefined;

      const comparison =
        objectRecord && targetCandidate
          ? describeClaimFieldComparison(toSyntheticObject(objectRecord), targetCandidate)
          : undefined;
      const structuralDelta =
        objectRecord && targetCandidate
          ? assessStructuralSameClaimDelta(toSyntheticObject(objectRecord), targetCandidate)
          : undefined;
      const sameSlotSupersessionReason =
        objectRecord && targetCandidate
          ? hasSameSlotSupersessionReason({
              objectRecord,
              candidateRecord: targetCandidate,
            })
          : false;
      const dominantCoreClaimCandidateIds = objectRecord
        ? buildDominantCoreClaimCandidateIds({
            auditCase,
            objectRecord,
            objectById,
          })
        : [];
      const wouldFlip =
        dominantCoreClaimCandidateIds.length === 1 &&
        structuralDelta?.deltaClass === "packaging_only_drift" &&
        !sameSlotSupersessionReason;

      const sampleRole = buildSampleRole({
        reviewCase,
        auditCase,
      });
      const caseRecord = {
        caseId: auditCase.caseId,
        source: auditCase.source,
        kind: auditCase.kind,
        sampleRole,
        reviewerLabel: normalizeReviewLabel(reviewCase?.reviewerLabel),
        historicalDecision: auditCase.historicalDecision,
        replayPathClassification: auditCase.replayPathClassification,
        missClass: auditCase.missClass,
        sameClaimConfidence: auditCase.sameClaimConfidence,
        packagingDriftType: auditCase.packagingDriftType,
        retainedCandidateCount: auditCase.retainedCandidateCount,
        currentPathBlocker: determineCurrentPathBlocker({
          auditCase,
          comparison,
          deltaClass: structuralDelta?.deltaClass,
          dominantCoreClaimCandidateIds,
          sameSlotSupersessionReason,
        }),
        targetCandidateId: targetCandidate?.id,
        targetCandidatePayloadSummary: targetCandidate
          ? summarizePayload(targetCandidate)
          : undefined,
        claimFieldComparison: comparison ? buildClaimFieldSummary(comparison) : undefined,
        deltaClass: structuralDelta?.deltaClass,
        deltaSummary: structuralDelta?.summary,
        sameClaimLeaning: structuralDelta?.sameClaimLeaning,
        dominantCoreClaimCandidateIds,
        wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift: wouldFlip,
        hypotheticalOutcome: buildHypotheticalOutcome({
          wouldFlip,
          distinctControl:
            sampleRole === "reviewed_clear_distinct_control" ||
            sampleRole === "audited_legit_distinct_control",
        }),
      } satisfies CoreClaimDeltaMeasurementCase;
      return caseRecord;
    })
    .toSorted(sortCases);

  const missCases = cases.filter((caseRecord) => !isLegitDistinctControl(caseRecord));

  return {
    generatedAt: new Date().toISOString(),
    duplicateAuditPath: input.duplicateAuditPath,
    duplicateAuditGeneratedAt: duplicateAudit.generatedAt,
    duplicateReviewPath: input.duplicateReviewPath,
    duplicateReviewGeneratedAt: duplicateReview.generatedAt,
    databaseMode: input.runtime.resolution.databaseMode ?? duplicateAudit.databaseMode,
    databaseName: input.runtime.resolution.databaseName,
    measuredCaseCount: cases.length,
    cases,
    summary: {
      reviewedCaseCount: cases.filter((caseRecord) => caseRecord.reviewerLabel).length,
      auditedOnlyCaseCount: cases.filter((caseRecord) => !caseRecord.reviewerLabel).length,
      clearDuplicateShouldAttachCount: cases.filter(isClearDuplicateMiss).length,
      legitDistinctControlCount: cases.filter(isLegitDistinctControl).length,
      ambiguityControlCount: cases.filter(isAmbiguityControl).length,
      missesBlockedByCoreClaimFields: missCases.filter(
        (caseRecord) => caseRecord.currentPathBlocker === "blocking_core_claim_fields",
      ).length,
      missesBlockedByPackagingFields: missCases.filter(
        (caseRecord) => caseRecord.currentPathBlocker === "blocking_packaging_fields",
      ).length,
      missesBlockedByNeitherFieldClass: missCases.filter(
        (caseRecord) =>
          caseRecord.currentPathBlocker !== "blocking_core_claim_fields" &&
          caseRecord.currentPathBlocker !== "blocking_packaging_fields",
      ).length,
      clearMissesThatWouldFlip: cases.filter(
        (caseRecord) =>
          isClearDuplicateMiss(caseRecord) &&
          caseRecord.wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift,
      ).length,
      legitDistinctControlsThatWouldBecomeRisky: cases.filter(
        (caseRecord) =>
          isLegitDistinctControl(caseRecord) &&
          caseRecord.wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift,
      ).length,
      casesByCurrentPathBlocker: countBy(cases.map((caseRecord) => caseRecord.currentPathBlocker)),
      casesByDeltaClass: countBy(
        cases
          .map((caseRecord) => caseRecord.deltaClass)
          .filter((value): value is StructuralDeltaClass => typeof value === "string"),
      ),
      casesByReviewerLabel: countBy(
        cases
          .map((caseRecord) => caseRecord.reviewerLabel)
          .filter((value): value is DuplicateReviewLabel => typeof value === "string"),
      ),
    },
  };
}

export function renderModelMemoryCoreClaimDeltaMeasurementMarkdown(
  report: ModelMemoryCoreClaimDeltaMeasurementReport,
): string {
  const lines: string[] = [
    "# Model Memory Core Claim Delta Measurement",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duplicate audit: ${report.duplicateAuditPath}`,
    `- Duplicate audit generated at: ${report.duplicateAuditGeneratedAt}`,
    `- Duplicate review: ${report.duplicateReviewPath}`,
    `- Duplicate review generated at: ${report.duplicateReviewGeneratedAt}`,
    `- DB mode: ${report.databaseMode ?? "unspecified"}`,
    `- Database: ${report.databaseName ?? "unknown"}`,
    `- Measured case count: ${report.measuredCaseCount}`,
    `- Summary: ${JSON.stringify(report.summary)}`,
    "",
  ];

  for (const caseRecord of report.cases) {
    lines.push(`## ${caseRecord.caseId}`);
    lines.push(`- Source: ${caseRecord.source}`);
    lines.push(`- Kind: ${caseRecord.kind}`);
    lines.push(`- Sample role: ${caseRecord.sampleRole}`);
    lines.push(`- Reviewer label: ${caseRecord.reviewerLabel ?? "n/a"}`);
    lines.push(`- Historical decision: ${caseRecord.historicalDecision}`);
    lines.push(`- Replay path: ${caseRecord.replayPathClassification}`);
    lines.push(`- Miss class: ${caseRecord.missClass}`);
    lines.push(`- Same-claim confidence: ${caseRecord.sameClaimConfidence}`);
    lines.push(`- Packaging drift type: ${caseRecord.packagingDriftType ?? "n/a"}`);
    lines.push(`- Retained candidate count: ${caseRecord.retainedCandidateCount}`);
    lines.push(`- Current path blocker: ${caseRecord.currentPathBlocker}`);
    lines.push(`- Target candidate: ${caseRecord.targetCandidateId ?? "n/a"}`);
    if (caseRecord.targetCandidatePayloadSummary) {
      lines.push(`- Target candidate payload: ${caseRecord.targetCandidatePayloadSummary}`);
    }
    if (caseRecord.claimFieldComparison) {
      lines.push(
        `- Core claim fields: ${caseRecord.claimFieldComparison.coreClaimFields.join(", ") || "none"}`,
      );
      lines.push(
        `- Matching core claim fields: ${caseRecord.claimFieldComparison.matchingCoreClaimFields.join(", ") || "none"}`,
      );
      lines.push(
        `- Blocking core claim fields: ${caseRecord.claimFieldComparison.blockingCoreClaimFields.join(", ") || "none"}`,
      );
      lines.push(
        `- Packaging fields: ${caseRecord.claimFieldComparison.packagingFields.join(", ") || "none"}`,
      );
      lines.push(
        `- Matching packaging fields: ${caseRecord.claimFieldComparison.matchingPackagingFields.join(", ") || "none"}`,
      );
      lines.push(
        `- Blocking packaging fields: ${caseRecord.claimFieldComparison.blockingPackagingFields.join(", ") || "none"}`,
      );
      lines.push(`- Core claim match: ${caseRecord.claimFieldComparison.coreClaimMatch}`);
      lines.push(`- Core claim summary: ${caseRecord.claimFieldComparison.coreClaimSummary}`);
      lines.push(`- Packaging summary: ${caseRecord.claimFieldComparison.packagingSummary}`);
    }
    lines.push(`- Delta class: ${caseRecord.deltaClass ?? "n/a"}`);
    lines.push(`- Delta summary: ${caseRecord.deltaSummary ?? "n/a"}`);
    lines.push(`- Same-claim leaning: ${caseRecord.sameClaimLeaning ?? false}`);
    lines.push(
      `- Dominant core-claim candidate ids: ${caseRecord.dominantCoreClaimCandidateIds.join(", ") || "none"}`,
    );
    lines.push(
      `- Would flip under core-claim-only + packaging_only_drift: ${caseRecord.wouldFlipUnderCoreClaimOnlyPackagingOnlyDrift}`,
    );
    lines.push(`- Hypothetical outcome: ${caseRecord.hypotheticalOutcome}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
