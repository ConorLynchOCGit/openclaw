import { readFile } from "node:fs/promises";
import type { ModelMemoryCoreClaimDeltaMeasurementReport } from "./model-memory.core-claim-delta-measurement.ts";
import type { DuplicateAuditReport } from "./model-memory.duplicate-audit.ts";
import type {
  DuplicateReviewCase,
  ModelMemoryDuplicateReviewReport,
} from "./model-memory.duplicate-review.ts";

type TraceCandidate = {
  id: string;
  identityKey: string;
  lifecycleState?: string;
  slotKey?: string;
  normalizedSearchText: string;
  payloadSummary: string;
  coreClaimMatch?: boolean;
  coreClaimSummary?: string;
  blockingCoreClaimFields?: string[];
  blockingPackagingFields?: string[];
  deltaClass?: string;
  packagingDriftType?: string;
  sameClaimLeaning?: boolean;
};

type TracePass = {
  passLabel: string;
  collisionGate: Array<{
    candidateId: string;
    caseIdentity: string;
    objectSummary: string;
    sourceWindowId: string;
    rawCandidateCount: number;
    retainedCandidateCount: number;
    prunedCandidateCount: number;
    disposition: "zero_candidate_skip" | "admitted_to_batch";
  }>;
  collisionBatch: Array<{
    candidateId: string;
    caseIdentity: string;
    sourceWindowId?: string;
    objectSummary: string;
    candidates: TraceCandidate[];
    decision?: {
      relation: string;
      targetObjectId?: string;
    };
  }>;
  writeResults: Array<{
    candidateId: string;
    caseIdentity: string;
    sourceWindowId?: string;
    decision: string;
    decisionCodes: string[];
    memoryObjectId?: string;
    supportItemId?: string;
    objectSummary: string;
  }>;
};

type CollisionHingeTrace = {
  sourcePath: string;
  passes: TracePass[];
};

type ParityCaseRole =
  | "clear_duplicate_should_attach"
  | "clear_distinct_should_stay_distinct"
  | "true_ambiguity";

type ParityQuality =
  | "close"
  | "diverged_recall"
  | "diverged_batch_context"
  | "diverged_decision"
  | "unresolved_trace_match";

export type LiveVsReplayParityCase = {
  caseId: string;
  caseIdentity: string;
  source: string;
  kind: string;
  role: ParityCaseRole;
  liveMatchFound: boolean;
  liveMatchedPassLabel?: string;
  liveTraceCandidateId?: string;
  liveGateClassification?: string;
  liveDecision?: string;
  liveRetainedCandidates: Array<{
    identityKey?: string;
    payloadSummary: string;
    coreClaimMatch?: boolean;
    coreClaimSummary?: string;
    blockingCoreClaimFields?: string[];
    blockingPackagingFields?: string[];
    deltaClass?: string;
    packagingDriftType?: string;
    sameClaimLeaning?: boolean;
  }>;
  replayClassification: string;
  replayCurrentPathBlocker?: string;
  replayDeltaClass?: string;
  replayRetainedCandidates: Array<{
    identityKey?: string;
    payloadSummary: string;
  }>;
  retainedCountDelta: number;
  overlappingRetainedCandidateCount: number;
  parityQuality: ParityQuality;
  localizedSeam:
    | "retained_candidate_recall"
    | "batch_payload_context"
    | "decision_lane"
    | "trace_match";
  notes: string[];
};

export type ModelMemoryLiveVsReplayParityReport = {
  generatedAt: string;
  duplicateReviewPath: string;
  duplicateReviewGeneratedAt: string;
  duplicateAuditPath: string;
  duplicateAuditGeneratedAt: string;
  coreClaimDeltaMeasurementPath: string;
  coreClaimDeltaMeasurementGeneratedAt: string;
  tracePaths: string[];
  sampleSize: number;
  cases: LiveVsReplayParityCase[];
  summary: {
    closeCount: number;
    divergedCount: number;
    parityByQuality: Record<string, number>;
    divergenceBySeam: Record<string, number>;
  };
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function selectReviewCases(report: ModelMemoryDuplicateReviewReport): DuplicateReviewCase[] {
  const labels: Array<[ParityCaseRole, number]> = [
    ["clear_duplicate_should_attach", 3],
    ["clear_distinct_should_stay_distinct", 2],
    ["true_ambiguity", 1],
  ];
  const selected: DuplicateReviewCase[] = [];
  const seen = new Set<string>();
  for (const [label, limit] of labels) {
    const matching = report.cases.filter((caseRecord) => caseRecord.reviewerLabel === label);
    for (const caseRecord of matching) {
      if (seen.has(caseRecord.caseId)) {
        continue;
      }
      selected.push(caseRecord);
      seen.add(caseRecord.caseId);
      if (selected.filter((entry) => entry.reviewerLabel === label).length >= limit) {
        break;
      }
    }
  }
  return selected;
}

function overlapCount(left: string[], right: string[]): number {
  const matchedRight = new Set<string>();
  let count = 0;
  for (const leftValue of left) {
    if (right.includes(leftValue) && !matchedRight.has(leftValue)) {
      matchedRight.add(leftValue);
      count += 1;
    }
  }
  return count;
}

function findTraceMatchByCaseIdentity(input: {
  trace: CollisionHingeTrace;
  caseIdentity: string;
}): {
  matched: boolean;
  matches: Array<{
    pass: TracePass;
    gate?: TracePass["collisionGate"][number];
    batch?: TracePass["collisionBatch"][number];
    write?: TracePass["writeResults"][number];
  }>;
} {
  const matches: Array<{
    pass: TracePass;
    gate?: TracePass["collisionGate"][number];
    batch?: TracePass["collisionBatch"][number];
    write?: TracePass["writeResults"][number];
  }> = [];
  for (const pass of input.trace.passes.filter((entry) => entry.passLabel !== "baseline")) {
    const gateByIdentity = new Map(
      pass.collisionGate.map((entry) => [entry.caseIdentity, entry] as const),
    );
    const batchByIdentity = new Map(
      pass.collisionBatch.map((entry) => [entry.caseIdentity, entry] as const),
    );
    const writeByIdentity = new Map(
      pass.writeResults.map((entry) => [entry.caseIdentity, entry] as const),
    );
    const gate = gateByIdentity.get(input.caseIdentity);
    const batch = batchByIdentity.get(input.caseIdentity);
    const write = writeByIdentity.get(input.caseIdentity);
    if (gate || batch || write) {
      matches.push({ pass, gate, batch, write });
    }
  }
  return {
    matched: matches.length > 0,
    matches,
  };
}

function selectLatestTraceMatch(input: {
  matches: Array<{
    pass: TracePass;
    gate?: TracePass["collisionGate"][number];
    batch?: TracePass["collisionBatch"][number];
    write?: TracePass["writeResults"][number];
  }>;
}):
  | {
      pass: TracePass;
      gate?: TracePass["collisionGate"][number];
      batch?: TracePass["collisionBatch"][number];
      write?: TracePass["writeResults"][number];
    }
  | undefined {
  return input.matches.at(-1);
}

function classifyParity(input: {
  liveFound: boolean;
  liveGateClassification?: string;
  liveDecision?: string;
  liveRetained: string[];
  replayClassification: string;
  replayRetained: string[];
}): {
  parityQuality: ParityQuality;
  localizedSeam: LiveVsReplayParityCase["localizedSeam"];
  notes: string[];
} {
  if (!input.liveFound) {
    return {
      parityQuality: "unresolved_trace_match",
      localizedSeam: "trace_match",
      notes: ["No reliable trace-row match was found for this reviewed case."],
    };
  }

  const sharedRetainedCount = overlapCount(input.liveRetained, input.replayRetained);
  if (
    input.liveGateClassification === input.replayClassification &&
    input.liveRetained.length === input.replayRetained.length &&
    sharedRetainedCount === input.liveRetained.length
  ) {
    return {
      parityQuality: "close",
      localizedSeam: "trace_match",
      notes: [
        "Live trace and replay retained the same candidate family with the same path classification.",
      ],
    };
  }
  if (input.liveRetained.length === 0 && input.replayRetained.length > 0) {
    return {
      parityQuality: "diverged_recall",
      localizedSeam: "retained_candidate_recall",
      notes: ["Replay retained plausible prior candidates that the live trace dropped to zero."],
    };
  }
  if (
    input.liveGateClassification === "batched_adjudication" &&
    input.replayClassification === "batched_adjudication"
  ) {
    return {
      parityQuality: "diverged_batch_context",
      localizedSeam: "batch_payload_context",
      notes: [
        "Both lanes reached batch, but the retained candidate basket or structural summaries differed.",
      ],
    };
  }
  return {
    parityQuality: "diverged_decision",
    localizedSeam: "decision_lane",
    notes: [
      `Live classification=${input.liveGateClassification ?? "n/a"} decision=${input.liveDecision ?? "n/a"} while replay classification=${input.replayClassification}.`,
    ],
  };
}

export async function runModelMemoryLiveVsReplayParity(input: {
  duplicateReviewPath: string;
  duplicateAuditPath: string;
  coreClaimDeltaMeasurementPath: string;
  tracePaths: string[];
}): Promise<ModelMemoryLiveVsReplayParityReport> {
  const [duplicateReview, duplicateAudit, measurement, traces] = await Promise.all([
    readJson<ModelMemoryDuplicateReviewReport>(input.duplicateReviewPath),
    readJson<DuplicateAuditReport>(input.duplicateAuditPath),
    readJson<ModelMemoryCoreClaimDeltaMeasurementReport>(input.coreClaimDeltaMeasurementPath),
    Promise.all(input.tracePaths.map((tracePath) => readJson<CollisionHingeTrace>(tracePath))),
  ]);

  const auditCaseById = new Map(
    duplicateAudit.rerunEscapeCases.map((caseRecord) => [caseRecord.caseId, caseRecord] as const),
  );
  const measurementCaseById = new Map(
    measurement.cases.map((caseRecord) => [caseRecord.caseId, caseRecord] as const),
  );
  const traceBySource = new Map(traces.map((trace) => [trace.sourcePath, trace] as const));

  const cases = selectReviewCases(duplicateReview).map((reviewCase) => {
    const auditCase = auditCaseById.get(reviewCase.caseId);
    const measurementCase = measurementCaseById.get(reviewCase.caseId);
    const trace = traceBySource.get(reviewCase.source);
    const traceMatchSet = trace
      ? findTraceMatchByCaseIdentity({
          trace,
          caseIdentity: reviewCase.caseIdentity,
        })
      : { matched: false, matches: [] };
    const selectedTraceMatch = selectLatestTraceMatch({
      matches: traceMatchSet.matches,
    });
    const liveFound = traceMatchSet.matched && Boolean(selectedTraceMatch);
    const liveGateClassification = !liveFound
      ? undefined
      : selectedTraceMatch?.gate?.disposition === "zero_candidate_skip"
        ? "distinct_write"
        : selectedTraceMatch?.batch
          ? "batched_adjudication"
          : selectedTraceMatch?.write?.decision === "attach_support"
            ? "attach_support_or_exact_identity"
            : "distinct_write";
    const liveRetainedCandidates = liveFound
      ? (selectedTraceMatch?.batch?.candidates ?? []).map((candidate) => ({
          identityKey: candidate.identityKey,
          payloadSummary: candidate.payloadSummary,
          coreClaimMatch: candidate.coreClaimMatch,
          coreClaimSummary: candidate.coreClaimSummary,
          blockingCoreClaimFields: candidate.blockingCoreClaimFields,
          blockingPackagingFields: candidate.blockingPackagingFields,
          deltaClass: candidate.deltaClass,
          packagingDriftType: candidate.packagingDriftType,
          sameClaimLeaning: candidate.sameClaimLeaning,
        }))
      : [];
    const replayRetainedCandidates =
      auditCase?.retainedPriorCandidates.map((candidate) => ({
        identityKey: candidate.identityKey,
        payloadSummary: candidate.payloadSummary,
      })) ?? [];
    const parity = classifyParity({
      liveFound,
      liveGateClassification,
      liveDecision:
        selectedTraceMatch?.batch?.decision?.relation ?? selectedTraceMatch?.write?.decision,
      liveRetained: liveRetainedCandidates.map(
        (candidate) => candidate.identityKey ?? candidate.payloadSummary,
      ),
      replayClassification: auditCase?.replayPathClassification ?? "unknown",
      replayRetained: replayRetainedCandidates.map(
        (candidate) => candidate.identityKey ?? candidate.payloadSummary,
      ),
    });
    const sharedRetained = overlapCount(
      liveRetainedCandidates.map((candidate) => candidate.identityKey ?? candidate.payloadSummary),
      replayRetainedCandidates.map(
        (candidate) => candidate.identityKey ?? candidate.payloadSummary,
      ),
    );

    return {
      caseId: reviewCase.caseId,
      caseIdentity: reviewCase.caseIdentity,
      source: reviewCase.source,
      kind: reviewCase.kind,
      role: reviewCase.reviewerLabel as ParityCaseRole,
      liveMatchFound: liveFound,
      liveMatchedPassLabel: selectedTraceMatch?.pass.passLabel,
      liveTraceCandidateId:
        selectedTraceMatch?.write?.candidateId ?? selectedTraceMatch?.batch?.candidateId,
      liveGateClassification,
      liveDecision:
        selectedTraceMatch?.batch?.decision?.relation ?? selectedTraceMatch?.write?.decision,
      liveRetainedCandidates,
      replayClassification: auditCase?.replayPathClassification ?? "unknown",
      replayCurrentPathBlocker: measurementCase?.currentPathBlocker,
      replayDeltaClass: measurementCase?.deltaClass,
      replayRetainedCandidates,
      retainedCountDelta: liveRetainedCandidates.length - replayRetainedCandidates.length,
      overlappingRetainedCandidateCount: sharedRetained,
      parityQuality: parity.parityQuality,
      localizedSeam: parity.localizedSeam,
      notes: parity.notes,
    } satisfies LiveVsReplayParityCase;
  });

  return {
    generatedAt: new Date().toISOString(),
    duplicateReviewPath: input.duplicateReviewPath,
    duplicateReviewGeneratedAt: duplicateReview.generatedAt,
    duplicateAuditPath: input.duplicateAuditPath,
    duplicateAuditGeneratedAt: duplicateAudit.generatedAt,
    coreClaimDeltaMeasurementPath: input.coreClaimDeltaMeasurementPath,
    coreClaimDeltaMeasurementGeneratedAt: measurement.generatedAt,
    tracePaths: input.tracePaths,
    sampleSize: cases.length,
    cases,
    summary: {
      closeCount: cases.filter((caseRecord) => caseRecord.parityQuality === "close").length,
      divergedCount: cases.filter((caseRecord) => caseRecord.parityQuality !== "close").length,
      parityByQuality: countBy(cases.map((caseRecord) => caseRecord.parityQuality)),
      divergenceBySeam: countBy(
        cases
          .filter((caseRecord) => caseRecord.parityQuality !== "close")
          .map((caseRecord) => caseRecord.localizedSeam),
      ),
    },
  };
}

export function renderModelMemoryLiveVsReplayParityMarkdown(
  report: ModelMemoryLiveVsReplayParityReport,
): string {
  const lines: string[] = [
    "# Model Memory Live vs Replay Parity",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duplicate review: ${report.duplicateReviewPath}`,
    `- Duplicate review generated at: ${report.duplicateReviewGeneratedAt}`,
    `- Duplicate audit: ${report.duplicateAuditPath}`,
    `- Duplicate audit generated at: ${report.duplicateAuditGeneratedAt}`,
    `- Core claim delta measurement: ${report.coreClaimDeltaMeasurementPath}`,
    `- Core claim delta measurement generated at: ${report.coreClaimDeltaMeasurementGeneratedAt}`,
    `- Trace paths: ${report.tracePaths.join(", ")}`,
    `- Sample size: ${report.sampleSize}`,
    `- Summary: ${JSON.stringify(report.summary)}`,
    "",
  ];

  for (const caseRecord of report.cases) {
    lines.push(`## ${caseRecord.caseId}`);
    lines.push(`- Case identity: ${caseRecord.caseIdentity}`);
    lines.push(`- Source: ${caseRecord.source}`);
    lines.push(`- Kind: ${caseRecord.kind}`);
    lines.push(`- Role: ${caseRecord.role}`);
    lines.push(`- Live match found: ${caseRecord.liveMatchFound}`);
    lines.push(`- Live pass: ${caseRecord.liveMatchedPassLabel ?? "n/a"}`);
    lines.push(`- Live trace candidate: ${caseRecord.liveTraceCandidateId ?? "n/a"}`);
    lines.push(`- Live gate classification: ${caseRecord.liveGateClassification ?? "n/a"}`);
    lines.push(`- Live decision: ${caseRecord.liveDecision ?? "n/a"}`);
    lines.push(`- Replay classification: ${caseRecord.replayClassification}`);
    lines.push(`- Replay current path blocker: ${caseRecord.replayCurrentPathBlocker ?? "n/a"}`);
    lines.push(`- Replay delta class: ${caseRecord.replayDeltaClass ?? "n/a"}`);
    lines.push(`- Retained count delta: ${caseRecord.retainedCountDelta}`);
    lines.push(
      `- Overlapping retained candidate count: ${caseRecord.overlappingRetainedCandidateCount}`,
    );
    lines.push(`- Parity quality: ${caseRecord.parityQuality}`);
    lines.push(`- Localized seam: ${caseRecord.localizedSeam}`);
    for (const note of caseRecord.notes) {
      lines.push(`- Note: ${note}`);
    }
    for (const candidate of caseRecord.liveRetainedCandidates) {
      lines.push(
        `- Live retained: ${candidate.payloadSummary} | coreClaimMatch=${candidate.coreClaimMatch ?? false} | deltaClass=${candidate.deltaClass ?? "n/a"} | blockingCore=${(candidate.blockingCoreClaimFields ?? []).join(",") || "none"} | blockingPackaging=${(candidate.blockingPackagingFields ?? []).join(",") || "none"}`,
      );
    }
    for (const candidate of caseRecord.replayRetainedCandidates) {
      lines.push(`- Replay retained: ${candidate.payloadSummary}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
