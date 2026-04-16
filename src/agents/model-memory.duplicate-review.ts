import { readFile } from "node:fs/promises";
import type {
  DuplicateAuditPathClassification,
  DuplicateAuditReport,
  DuplicateAuditRerunEscapeCase,
} from "./model-memory.duplicate-audit.ts";

export type DuplicateReviewLabel =
  | "clear_duplicate_should_attach"
  | "clear_distinct_should_stay_distinct"
  | "true_ambiguity"
  | "needs_policy_change";

export type DuplicateReviewCase = {
  caseId: string;
  caseIdentity: string;
  source: string;
  kind: string;
  payloadSummary: string;
  historicalDecision: string;
  replayPathClassification: DuplicateAuditPathClassification;
  missClass: string;
  deltaClass?: string;
  sameClaimConfidence: string;
  packagingDriftType?: string;
  stratification: {
    sourceFamily: string;
    kind: string;
    replayPath: DuplicateAuditPathClassification;
    missClass: string;
    deltaClass: string;
    packagingDriftType: string;
  };
  topRetainedCandidates: string[];
  reviewerLabel: DuplicateReviewLabel;
  rationale: string;
};

export type ModelMemoryDuplicateReviewReport = {
  generatedAt: string;
  duplicateAuditPath: string;
  duplicateAuditGeneratedAt: string;
  databaseMode?: string;
  databaseName?: string;
  sampleSize: number;
  cases: DuplicateReviewCase[];
  summary: Record<DuplicateReviewLabel, number>;
  basketComposition: {
    bySourceFamily: Record<string, number>;
    byKind: Record<string, number>;
    byReplayPath: Record<string, number>;
    byMissClass: Record<string, number>;
    byDeltaClass: Record<string, number>;
    byPackagingDriftType: Record<string, number>;
  };
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildReviewerLabel(caseRecord: DuplicateAuditRerunEscapeCase): DuplicateReviewLabel {
  if (caseRecord.missClass === "legit_distinct") {
    return "clear_distinct_should_stay_distinct";
  }
  if (
    caseRecord.deltaClass === "packaging_only_drift" &&
    caseRecord.sameClaimConfidence === "high"
  ) {
    return "clear_duplicate_should_attach";
  }
  if (
    caseRecord.packagingDriftType === "broader_narrower" ||
    caseRecord.deltaClass === "unresolved"
  ) {
    return "needs_policy_change";
  }
  return "true_ambiguity";
}

function buildRationale(caseRecord: DuplicateAuditRerunEscapeCase): string {
  if (caseRecord.missClass === "legit_distinct") {
    return "Nearest prior candidates do not clear the same-claim bar strongly enough; keeping the object distinct remains defensible.";
  }
  if (caseRecord.packagingDriftType === "field_packing_drift") {
    return "The durable rule body matches but the action-bearing content is packed differently across fields; this is the right shape for support rather than a sibling write.";
  }
  if (caseRecord.packagingDriftType === "value_wrapper_drift") {
    return "The value-level claim matches and the remaining delta is wrapper phrasing, so the rerun should reinforce the existing fact.";
  }
  if (caseRecord.packagingDriftType === "broader_narrower") {
    return "The same-value core is present but the broader-vs-narrower boundary is still policy-sensitive; this needs an explicit preference rule rather than loose merging.";
  }
  if (caseRecord.missClass === "historical_supersede_miss") {
    return "The newer object repeated an existing claim without replacing its slot-defining content; support would be more accurate than supersede.";
  }
  if (caseRecord.replayPathClassification === "distinct_write") {
    return "A plausible prior existed but deterministic recall still dropped it before adjudication.";
  }
  if (caseRecord.replayPathClassification === "batched_adjudication") {
    return "The candidate reached the batch lane but the same-claim evidence still was not converted into support.";
  }
  return "The case is close enough to warrant manual review, but it still needs a narrower local rule before automatic attach would be safe.";
}

function buildStratificationKey(caseRecord: DuplicateAuditRerunEscapeCase): string {
  return [
    caseRecord.source,
    caseRecord.kind,
    caseRecord.replayPathClassification,
    caseRecord.missClass,
    caseRecord.deltaClass ?? "n/a",
    caseRecord.packagingDriftType ?? "n/a",
  ].join("|");
}

function selectCases(report: DuplicateAuditReport): DuplicateAuditRerunEscapeCase[] {
  const desiredCounts: Record<DuplicateReviewLabel, number> = {
    clear_duplicate_should_attach: 6,
    clear_distinct_should_stay_distinct: 6,
    true_ambiguity: 4,
    needs_policy_change: 3,
  };
  const selected: DuplicateAuditRerunEscapeCase[] = [];
  const selectedIds = new Set<string>();
  const usedStrata = new Set<string>();

  const candidatePools = [...report.rerunEscapeCases]
    .map((caseRecord) => ({
      caseRecord,
      reviewerLabel: buildReviewerLabel(caseRecord),
    }))
    .toSorted((left, right) => {
      const leftRetained = left.caseRecord.retainedCandidateCount;
      const rightRetained = right.caseRecord.retainedCandidateCount;
      if (left.reviewerLabel !== right.reviewerLabel) {
        return left.reviewerLabel.localeCompare(right.reviewerLabel);
      }
      if (right.caseRecord.sameClaimConfidence !== left.caseRecord.sameClaimConfidence) {
        return right.caseRecord.sameClaimConfidence.localeCompare(
          left.caseRecord.sameClaimConfidence,
        );
      }
      if (rightRetained !== leftRetained) {
        return rightRetained - leftRetained;
      }
      return left.caseRecord.caseId.localeCompare(right.caseRecord.caseId);
    });

  for (const [label, desiredCount] of Object.entries(desiredCounts) as Array<
    [DuplicateReviewLabel, number]
  >) {
    for (const { caseRecord, reviewerLabel } of candidatePools) {
      if (reviewerLabel !== label || selectedIds.has(caseRecord.caseId)) {
        continue;
      }
      const stratumKey = buildStratificationKey(caseRecord);
      if (
        usedStrata.has(stratumKey) &&
        selected.filter((entry) => buildReviewerLabel(entry) === label).length >= 1
      ) {
        continue;
      }
      selected.push(caseRecord);
      selectedIds.add(caseRecord.caseId);
      usedStrata.add(stratumKey);
      if (selected.filter((entry) => buildReviewerLabel(entry) === label).length >= desiredCount) {
        break;
      }
    }
  }

  return selected;
}

export async function runModelMemoryDuplicateReview(input: {
  duplicateAuditPath: string;
}): Promise<ModelMemoryDuplicateReviewReport> {
  const duplicateAudit = JSON.parse(
    await readFile(input.duplicateAuditPath, "utf8"),
  ) as DuplicateAuditReport;
  const cases = selectCases(duplicateAudit).map((caseRecord) => {
    const reviewerLabel = buildReviewerLabel(caseRecord);
    return {
      caseId: caseRecord.caseId,
      caseIdentity: caseRecord.caseIdentity,
      source: caseRecord.source,
      kind: caseRecord.kind,
      payloadSummary: caseRecord.payloadSummary,
      historicalDecision: caseRecord.historicalDecision,
      replayPathClassification: caseRecord.replayPathClassification,
      missClass: caseRecord.missClass,
      deltaClass: caseRecord.deltaClass,
      sameClaimConfidence: caseRecord.sameClaimConfidence,
      packagingDriftType: caseRecord.packagingDriftType,
      stratification: {
        sourceFamily: caseRecord.source,
        kind: caseRecord.kind,
        replayPath: caseRecord.replayPathClassification,
        missClass: caseRecord.missClass,
        deltaClass: caseRecord.deltaClass ?? "n/a",
        packagingDriftType: caseRecord.packagingDriftType ?? "n/a",
      },
      topRetainedCandidates: caseRecord.retainedPriorCandidates.map(
        (candidate) => candidate.payloadSummary,
      ),
      reviewerLabel,
      rationale: buildRationale(caseRecord),
    } satisfies DuplicateReviewCase;
  });

  return {
    generatedAt: new Date().toISOString(),
    duplicateAuditPath: input.duplicateAuditPath,
    duplicateAuditGeneratedAt: duplicateAudit.generatedAt,
    databaseMode: duplicateAudit.databaseMode,
    databaseName: duplicateAudit.databaseName,
    sampleSize: cases.length,
    cases,
    summary: countBy(cases.map((caseRecord) => caseRecord.reviewerLabel)) as Record<
      DuplicateReviewLabel,
      number
    >,
    basketComposition: {
      bySourceFamily: countBy(cases.map((caseRecord) => caseRecord.stratification.sourceFamily)),
      byKind: countBy(cases.map((caseRecord) => caseRecord.stratification.kind)),
      byReplayPath: countBy(cases.map((caseRecord) => caseRecord.stratification.replayPath)),
      byMissClass: countBy(cases.map((caseRecord) => caseRecord.stratification.missClass)),
      byDeltaClass: countBy(cases.map((caseRecord) => caseRecord.stratification.deltaClass)),
      byPackagingDriftType: countBy(
        cases.map((caseRecord) => caseRecord.stratification.packagingDriftType),
      ),
    },
  };
}

export function renderModelMemoryDuplicateReviewMarkdown(
  report: ModelMemoryDuplicateReviewReport,
): string {
  const lines: string[] = [
    "# Model Memory Duplicate Qualitative Review",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duplicate audit: ${report.duplicateAuditPath}`,
    `- Duplicate audit generated at: ${report.duplicateAuditGeneratedAt}`,
    `- DB mode: ${report.databaseMode ?? "unspecified"}`,
    `- Database: ${report.databaseName ?? "unknown"}`,
    `- Sample size: ${report.sampleSize}`,
    `- Summary: ${JSON.stringify(report.summary)}`,
    `- Basket composition: ${JSON.stringify(report.basketComposition)}`,
    "",
  ];

  for (const caseRecord of report.cases) {
    lines.push(`## ${caseRecord.caseId}`);
    lines.push(`- Case identity: ${caseRecord.caseIdentity}`);
    lines.push(`- Source: ${caseRecord.source}`);
    lines.push(`- Kind: ${caseRecord.kind}`);
    lines.push(`- Payload: ${caseRecord.payloadSummary}`);
    lines.push(`- Historical decision: ${caseRecord.historicalDecision}`);
    lines.push(`- Replay path: ${caseRecord.replayPathClassification}`);
    lines.push(`- Miss class: ${caseRecord.missClass}`);
    lines.push(`- Delta class: ${caseRecord.deltaClass ?? "n/a"}`);
    lines.push(`- Same-claim confidence: ${caseRecord.sameClaimConfidence}`);
    lines.push(`- Packaging drift: ${caseRecord.packagingDriftType ?? "n/a"}`);
    lines.push(`- Stratification: ${JSON.stringify(caseRecord.stratification)}`);
    lines.push(`- Reviewer label: ${caseRecord.reviewerLabel}`);
    lines.push(`- Rationale: ${caseRecord.rationale}`);
    for (const candidate of caseRecord.topRetainedCandidates.slice(0, 3)) {
      lines.push(`- Retained candidate: ${candidate}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
