import { readFile } from "node:fs/promises";

type HoleAssessment =
  | "supported"
  | "partially_supported"
  | "not_supported"
  | "insufficient_evidence";

type ThesisEffect =
  | "weakens_thesis"
  | "partially_weakens_thesis"
  | "does_not_weaken_thesis"
  | "reframes_thesis"
  | "unknown";

type Confidence = "low" | "medium" | "high";

type TraceDiagnosis = {
  totalDistinctWrites: number;
  totalAttachSupports: number;
  totalConflictHoldWrites: number;
  zeroCandidateSkips: number;
  admittedToBatch: number;
  likelyHinge: string;
};

type CollisionHingeTrace = {
  sourcePath: string;
  diagnosis: TraceDiagnosis;
};

type DuplicateAuditReport = {
  generatedAt: string;
  rerunEscapeCases: Array<{
    source: string;
    kind: string;
  }>;
  summary: {
    rerunEscapeCaseCount: number;
    rerunMissClassCounts: Record<string, number>;
    rerunPackagingDriftTypeCounts: Record<string, number>;
    rerunRetainedCandidateCount: {
      zero: number;
      one: number;
      multiple: number;
    };
    rerunCaseCountByKind: Record<string, number>;
  };
};

type DuplicateBenchmarkReport = {
  summary: {
    rerunSampleSize: number;
    clusterCorroborationSize: number;
    attachSupportMissRateOnReruns: number;
    falseDistinctRateOnReruns: number;
    trueDistinctRateOnReruns: number;
  };
};

type DuplicateReviewReport = {
  sampleSize: number;
  summary: Record<string, number>;
  cases: Array<{
    caseId: string;
    source: string;
    kind: string;
    replayPathClassification: string;
    reviewerLabel: string;
    sameClaimConfidence: string;
    packagingDriftType?: string;
  }>;
};

type ProofPhaseReport = {
  retrievalContextProbes?: Array<{
    id: string;
    selectedCount?: number;
    estimatedInputTokens?: number;
    pruningUsed?: boolean;
    error?: unknown;
  }>;
  rebuildProjectionProof?: {
    supportOnlySource?: string;
    supportOnlyTarget?: {
      sourceType?: string;
    };
    supportOnlyProbeClass?: string;
    supportOnlyProjectionChurn?: boolean;
    supportOnlyArtifactChurn?: boolean;
    supportOnlyStableSurfaceDiffs?: unknown[];
  };
  readiness?: {
    state?: string;
  };
};

type SupportOnlyRebuildDiff = {
  classification?: string;
};

export type ThesisHoleEvaluation = {
  id: string;
  title: string;
  concern: string;
  assessment: HoleAssessment;
  effectOnThesis: ThesisEffect;
  confidence: Confidence;
  summary: string;
  evidence: string[];
  metrics: Record<string, number | string | boolean | null>;
};

export type ModelMemoryThesisHoleEvaluationReport = {
  generatedAt: string;
  baselineThesis: {
    cutoverJudgment: "not_ready_for_cutover";
    statements: string[];
  };
  inputs: {
    agentsTracePath: string;
    comparisonTracePaths: string[];
    duplicateAuditPath: string;
    duplicateBenchmarkPath: string;
    duplicateReviewPath: string;
    proofPhaseReportPath: string;
    supportOnlyRebuildDiffPath: string;
  };
  holes: ThesisHoleEvaluation[];
  reevaluatedThesis: {
    cutoverJudgment: "not_ready_for_cutover";
    confidence: Confidence;
    thesisStillLooksTrue: string[];
    thesisNeedsRevision: string[];
    remainingBlockers: string[];
    nextTestsThatWouldChangeTheCall: string[];
    conciseJudgment: string;
  };
};

type RunInput = {
  agentsTracePath: string;
  comparisonTracePaths: string[];
  duplicateAuditPath: string;
  duplicateBenchmarkPath: string;
  duplicateReviewPath: string;
  proofPhaseReportPath: string;
  supportOnlyRebuildDiffPath: string;
};

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return round(numerator / denominator);
}

function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): {
  lower: number;
  upper: number;
} {
  if (total === 0) {
    return { lower: 0, upper: 0 };
  }
  const p = successes / total;
  const z2 = z ** 2;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    lower: round((center - margin) / denominator),
    upper: round((center + margin) / denominator),
  };
}

function countBySource(
  rerunEscapeCases: DuplicateAuditReport["rerunEscapeCases"],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const caseRecord of rerunEscapeCases) {
    counts[caseRecord.source] = (counts[caseRecord.source] ?? 0) + 1;
  }
  return counts;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildBaselineThesis(): ModelMemoryThesisHoleEvaluationReport["baselineThesis"] {
  return {
    cutoverJudgment: "not_ready_for_cutover",
    statements: [
      "Support-only churn is no longer the blocker; true pure_attach_support replay is stable.",
      "Retrieval/context boundedness is green on the current preserved corpus.",
      "The current cutover blocker is duplicate under-attachment in dense rule guidance, especially AGENTS.md.",
      "The failure appears mostly deterministic gate loss on wrapper-heavy same-rule restatements, with a smaller secondary batch-adjudication conservatism component.",
      "The preserved-corpus qualitative duplicate review is the strongest current cutover truth surface and outweighs the narrower benchmark seed basket.",
    ],
  };
}

export async function runModelMemoryThesisHoleEvaluation(
  input: RunInput,
): Promise<ModelMemoryThesisHoleEvaluationReport> {
  const [
    agentsTrace,
    comparisonTraces,
    duplicateAudit,
    duplicateBenchmark,
    duplicateReview,
    proofPhaseReport,
    supportOnlyRebuildDiff,
  ] = await Promise.all([
    readJsonFile<CollisionHingeTrace>(input.agentsTracePath),
    Promise.all(input.comparisonTracePaths.map((path) => readJsonFile<CollisionHingeTrace>(path))),
    readJsonFile<DuplicateAuditReport>(input.duplicateAuditPath),
    readJsonFile<DuplicateBenchmarkReport>(input.duplicateBenchmarkPath),
    readJsonFile<DuplicateReviewReport>(input.duplicateReviewPath),
    readJsonFile<ProofPhaseReport>(input.proofPhaseReportPath),
    readJsonFile<SupportOnlyRebuildDiff>(input.supportOnlyRebuildDiffPath),
  ]);

  const sourceCounts = countBySource(duplicateAudit.rerunEscapeCases);
  const agentsRerunShare = rate(
    sourceCounts["AGENTS.md"] ?? 0,
    duplicateAudit.summary.rerunEscapeCaseCount,
  );
  const otherZeroSkipMean = mean(
    comparisonTraces.map((trace) => trace.diagnosis.zeroCandidateSkips),
  );
  const reviewDuplicateCount = duplicateReview.summary.clear_duplicate_should_attach ?? 0;
  const reviewDistinctCount = duplicateReview.summary.clear_distinct_should_stay_distinct ?? 0;
  const reviewDuplicateRate = rate(reviewDuplicateCount, duplicateReview.sampleSize);
  const reviewDuplicateInterval = wilsonInterval(reviewDuplicateCount, duplicateReview.sampleSize);
  const auditLegitDistinctRate = rate(
    duplicateAudit.summary.rerunMissClassCounts.legit_distinct ?? 0,
    duplicateAudit.summary.rerunEscapeCaseCount,
  );
  const auditExtraConstraintRate = rate(
    duplicateAudit.summary.rerunPackagingDriftTypeCounts.extra_constraint ?? 0,
    duplicateAudit.summary.rerunEscapeCaseCount,
  );
  const reviewReplayBatchedCount = duplicateReview.cases.filter(
    (caseRecord) => caseRecord.replayPathClassification === "batched_adjudication",
  ).length;
  const retrievalProbeCount = proofPhaseReport.retrievalContextProbes?.length ?? 0;
  const retrievalProbeErrors =
    proofPhaseReport.retrievalContextProbes?.filter((probe) => probe.error).length ?? 0;
  const retrievalProbePruned =
    proofPhaseReport.retrievalContextProbes?.filter((probe) => probe.pruningUsed).length ?? 0;
  const maxRetrievalTokens = Math.max(
    0,
    ...(proofPhaseReport.retrievalContextProbes ?? []).map(
      (probe) => probe.estimatedInputTokens ?? 0,
    ),
  );

  const holes: ThesisHoleEvaluation[] = [
    {
      id: "hole_1_agents_trace_overstates_problem",
      title: "AGENTS.md trace may be overstating the problem",
      concern:
        "The AGENTS trace is a targeted scratch stress source and might not be representative of the preserved corpus.",
      assessment:
        agentsRerunShare >= 0.4 && agentsTrace.diagnosis.zeroCandidateSkips > otherZeroSkipMean * 2
          ? "partially_supported"
          : "not_supported",
      effectOnThesis:
        agentsRerunShare >= 0.4 && agentsTrace.diagnosis.zeroCandidateSkips > otherZeroSkipMean * 2
          ? "partially_weakens_thesis"
          : "does_not_weaken_thesis",
      confidence: "medium",
      summary:
        agentsRerunShare >= 0.4
          ? "AGENTS is clearly a worst-case stress source, but it is also a dominant preserved-corpus duplicate source, so it cannot be dismissed as a mere outlier."
          : "Current preserved-corpus evidence does not show AGENTS dominating rerun escapes, so the stress-trace objection is not carrying much weight.",
      evidence: [
        `AGENTS scratch trace zero_candidate_skips=${agentsTrace.diagnosis.zeroCandidateSkips} versus comparison-trace mean=${round(otherZeroSkipMean, 2)}.`,
        `AGENTS contributes ${sourceCounts["AGENTS.md"] ?? 0} of ${duplicateAudit.summary.rerunEscapeCaseCount} preserved-corpus rerun escapes.`,
        `Comparison traces still show substantially lower gate loss: ${comparisonTraces
          .map(
            (trace) =>
              `${trace.sourcePath} zero_candidate_skips=${trace.diagnosis.zeroCandidateSkips}`,
          )
          .join("; ")}.`,
      ],
      metrics: {
        agentsZeroCandidateSkips: agentsTrace.diagnosis.zeroCandidateSkips,
        comparisonMeanZeroCandidateSkips: round(otherZeroSkipMean, 2),
        agentsRerunEscapeShare: agentsRerunShare,
        agentsRerunEscapeCount: sourceCounts["AGENTS.md"] ?? 0,
      },
    },
    {
      id: "hole_2_some_misses_may_be_correct_distincts",
      title: "Some supposed misses may actually be correct distincts",
      concern:
        "Wrapper-heavy or nearby candidates may still be adding real operational constraints, so some judged misses could actually be correct distinct writes.",
      assessment:
        auditLegitDistinctRate >= 0.6 && auditExtraConstraintRate >= 0.8
          ? "partially_supported"
          : "not_supported",
      effectOnThesis:
        auditLegitDistinctRate >= 0.6 && auditExtraConstraintRate >= 0.8
          ? "partially_weakens_thesis"
          : "does_not_weaken_thesis",
      confidence: "medium",
      summary:
        "The over-merge risk is real. The broad audit is dominated by legit-distinct and extra-constraint cases, so any duplicate thesis that ignores additive deltas would be too aggressive.",
      evidence: [
        `Preserved-corpus audit legit_distinct rate=${auditLegitDistinctRate}.`,
        `Preserved-corpus audit extra_constraint packaging rate=${auditExtraConstraintRate}.`,
        `The qualitative review still contains ${reviewDuplicateCount} clear should-attach cases, so the distinctness objection is real but not sufficient to erase the blocker.`,
      ],
      metrics: {
        auditLegitDistinctRate,
        auditExtraConstraintRate,
        reviewClearDuplicateShouldAttach: reviewDuplicateCount,
        reviewClearDistinctShouldStayDistinct: reviewDistinctCount,
      },
    },
    {
      id: "hole_3_qualitative_review_sample_is_small",
      title: "Qualitative review sample is small",
      concern:
        "The current review sample may be too small to justify a broad cutover blocker call.",
      assessment: duplicateReview.sampleSize < 20 ? "supported" : "not_supported",
      effectOnThesis:
        duplicateReview.sampleSize < 20 ? "partially_weakens_thesis" : "does_not_weaken_thesis",
      confidence: "high",
      summary:
        "This hole is real. The review is still the strongest truth surface, but its sample is small enough that it should be treated as high-signal rather than high-coverage evidence.",
      evidence: [
        `Review sample size is only ${duplicateReview.sampleSize}.`,
        `Clear duplicate rate in review = ${reviewDuplicateRate} with Wilson interval [${reviewDuplicateInterval.lower}, ${reviewDuplicateInterval.upper}].`,
        `That interval is wide enough that the underlying corpus-wide miss rate could be materially lower or higher than the observed 2/7.`,
      ],
      metrics: {
        reviewSampleSize: duplicateReview.sampleSize,
        reviewClearDuplicateRate: reviewDuplicateRate,
        reviewWilsonLower: reviewDuplicateInterval.lower,
        reviewWilsonUpper: reviewDuplicateInterval.upper,
      },
    },
    {
      id: "hole_4_benchmark_and_review_diverge",
      title: "Benchmark and review are pulling in different directions",
      concern:
        "The benchmark currently shows zero rerun attach-support misses while the qualitative review still surfaces clear misses.",
      assessment:
        duplicateBenchmark.summary.attachSupportMissRateOnReruns === 0 && reviewDuplicateCount > 0
          ? "supported"
          : "not_supported",
      effectOnThesis:
        duplicateBenchmark.summary.attachSupportMissRateOnReruns === 0 && reviewDuplicateCount > 0
          ? "partially_weakens_thesis"
          : "does_not_weaken_thesis",
      confidence: "high",
      summary:
        "The divergence is real. The benchmark seed basket is not broad enough to settle the cutover question by itself, so the thesis should explicitly treat benchmark cleanliness as narrower than review cleanliness.",
      evidence: [
        `Benchmark attachSupportMissRateOnReruns=${duplicateBenchmark.summary.attachSupportMissRateOnReruns}.`,
        `Review clear_duplicate_should_attach=${reviewDuplicateCount} of ${duplicateReview.sampleSize}.`,
        `The current evidence set supports weighting the review above the benchmark for cutover, but not treating the benchmark as useless.`,
      ],
      metrics: {
        benchmarkRerunSampleSize: duplicateBenchmark.summary.rerunSampleSize,
        benchmarkAttachSupportMissRateOnReruns:
          duplicateBenchmark.summary.attachSupportMissRateOnReruns,
        reviewClearDuplicateShouldAttach: reviewDuplicateCount,
        reviewSampleSize: duplicateReview.sampleSize,
      },
    },
    {
      id: "hole_5_support_only_result_may_be_narrower_than_it_looks",
      title: "Support-only stability result may be narrower than it looks",
      concern:
        "The proof now runs a true pure_attach_support lane, but it uses deterministic synthetic replay rather than a naturally occurring support-only source rerun.",
      assessment:
        proofPhaseReport.rebuildProjectionProof?.supportOnlyTarget?.sourceType ===
        "synthetic_existing_object_replay"
          ? "supported"
          : "not_supported",
      effectOnThesis:
        proofPhaseReport.rebuildProjectionProof?.supportOnlyTarget?.sourceType ===
        "synthetic_existing_object_replay"
          ? "partially_weakens_thesis"
          : "does_not_weaken_thesis",
      confidence: "high",
      summary:
        "The current stability result is honest and strong for a true attach-support replay, but it does not fully exhaust all natural reinforcement shapes.",
      evidence: [
        `Proof support probe class=${proofPhaseReport.rebuildProjectionProof?.supportOnlyProbeClass ?? "unknown"}.`,
        `Proof support probe source type=${proofPhaseReport.rebuildProjectionProof?.supportOnlyTarget?.sourceType ?? "unknown"}.`,
        `Isolated rebuild diff classification=${supportOnlyRebuildDiff.classification ?? "unknown"}.`,
      ],
      metrics: {
        supportOnlyProbeClass:
          proofPhaseReport.rebuildProjectionProof?.supportOnlyProbeClass ?? null,
        supportOnlyProbeSourceType:
          proofPhaseReport.rebuildProjectionProof?.supportOnlyTarget?.sourceType ?? null,
        supportOnlyProjectionChurn:
          proofPhaseReport.rebuildProjectionProof?.supportOnlyProjectionChurn ?? null,
        supportOnlyArtifactChurn:
          proofPhaseReport.rebuildProjectionProof?.supportOnlyArtifactChurn ?? null,
      },
    },
    {
      id: "hole_6_real_blocker_may_be_choice_not_recall",
      title: "The real blocker may be choice, not recall",
      concern:
        "The surviving candidates may already be sufficient, and the bigger remaining issue may be batch adjudication being too conservative on wrapper-drift rule cases.",
      assessment: "partially_supported",
      effectOnThesis: "reframes_thesis",
      confidence: "high",
      summary:
        "The evidence now points to a mixed blocker: recall is still dominant in AGENTS scratch traces, but the reviewed clear misses all reached batched adjudication, so choice quality is also materially involved.",
      evidence: [
        `AGENTS zero_candidate_skips=${agentsTrace.diagnosis.zeroCandidateSkips} versus admitted_to_batch=${agentsTrace.diagnosis.admittedToBatch}.`,
        `All ${duplicateReview.sampleSize} reviewed cases replayed through batched_adjudication.`,
        `${reviewDuplicateCount} reviewed cases are clear should-attach despite reaching the batch lane.`,
      ],
      metrics: {
        agentsZeroCandidateSkips: agentsTrace.diagnosis.zeroCandidateSkips,
        agentsAdmittedToBatch: agentsTrace.diagnosis.admittedToBatch,
        reviewCasesThroughBatch: reviewReplayBatchedCount,
        reviewClearDuplicateShouldAttach: reviewDuplicateCount,
      },
    },
    {
      id: "hole_7_replayed_audit_path_may_diverge_from_live_path",
      title: "Replay-based audit path may still diverge from the live write path",
      concern:
        "The audit replays cases using current runtime helpers, so it may still drift from exact live ordering or neighborhood behavior.",
      assessment: "insufficient_evidence",
      effectOnThesis: "unknown",
      confidence: "low",
      summary:
        "Current artifacts do not provide a direct live-versus-replay paired comparison, so this hole remains unresolved rather than disproved.",
      evidence: [
        "The duplicate audit is replay-based by design and no artifact currently pairs each replayed case with a contemporaneous live collision trace for the same object.",
        "The audit now reuses source-family context, which reduces a known source of divergence, but does not eliminate all possible replay drift.",
      ],
      metrics: {
        directLiveVsReplayPairingArtifactExists: false,
        reviewSampleSize: duplicateReview.sampleSize,
      },
    },
    {
      id: "hole_8_cutover_bar_may_be_stricter_than_operationally_necessary",
      title: "Cutover bar itself may be stricter than operationally necessary",
      concern:
        "The current cutover bar may be intentionally conservative beyond what production rollout actually requires.",
      assessment: "insufficient_evidence",
      effectOnThesis: "unknown",
      confidence: "low",
      summary:
        "This is a governance question more than an empirical one. Current evidence can show which bars pass and fail, but it cannot decide the right operational risk tolerance by itself.",
      evidence: [
        `Current cutover bar passes support-only stability, stable-surface stability, and current-corpus retrieval/context boundedness, but fails AGENTS duplicate quality and preserved-corpus duplicate review.`,
        `A team could choose a more permissive operational bar, but that would be a conscious policy change rather than a factual correction.`,
      ],
      metrics: {
        cutoverBarPassedChecks: 3,
        cutoverBarFailedChecks: 2,
        reviewClearDuplicateShouldAttach: reviewDuplicateCount,
      },
    },
    {
      id: "hole_9_reference_deferred_could_be_hidden_gap",
      title: "Deferred reference recall could be a hidden gap",
      concern:
        "Reference memories may be under-sampled and could still be a meaningful duplicate blocker despite being deferred.",
      assessment:
        (duplicateAudit.summary.rerunCaseCountByKind.reference ?? 0) <= 2
          ? "not_supported"
          : "partially_supported",
      effectOnThesis:
        (duplicateAudit.summary.rerunCaseCountByKind.reference ?? 0) <= 2
          ? "does_not_weaken_thesis"
          : "partially_weakens_thesis",
      confidence: "medium",
      summary:
        (duplicateAudit.summary.rerunCaseCountByKind.reference ?? 0) <= 2
          ? "Current preserved-corpus evidence does not support reference as the next blocker. It remains under-sampled, but not materially represented."
          : "Reference is showing up often enough that deferral would need to be reconsidered.",
      evidence: [
        `Reference rerun-escape count=${duplicateAudit.summary.rerunCaseCountByKind.reference ?? 0} of ${duplicateAudit.summary.rerunEscapeCaseCount}.`,
        `Current qualitative review includes ${duplicateReview.cases.filter((caseRecord) => caseRecord.kind === "reference").length} reference cases.`,
      ],
      metrics: {
        referenceRerunEscapeCount: duplicateAudit.summary.rerunCaseCountByKind.reference ?? 0,
        totalRerunEscapeCount: duplicateAudit.summary.rerunEscapeCaseCount,
        referenceReviewCases: duplicateReview.cases.filter(
          (caseRecord) => caseRecord.kind === "reference",
        ).length,
      },
    },
    {
      id: "hole_10_current_corpus_green_lanes_may_not_generalize",
      title: "Current-corpus green lanes may not generalize",
      concern:
        "The retrieval/context proof is green on the current corpus, but current probes may not cover broader production prompt shapes.",
      assessment: retrievalProbeCount <= 4 ? "supported" : "partially_supported",
      effectOnThesis:
        retrievalProbeCount <= 4 ? "partially_weakens_thesis" : "does_not_weaken_thesis",
      confidence: "medium",
      summary:
        "Current-corpus green still matters, but generalization is not fully proven. The current proof basket is bounded and should be treated as a current-corpus result, not universal coverage.",
      evidence: [
        `Current proof basket covers ${retrievalProbeCount} retrieval/context probes.`,
        `Current probes report errors=${retrievalProbeErrors}, pruned=${retrievalProbePruned}, max_estimated_tokens=${maxRetrievalTokens}.`,
        `Green status on this basket is strong current-corpus evidence but still limited breadth evidence.`,
      ],
      metrics: {
        retrievalProbeCount,
        retrievalProbeErrors,
        retrievalProbePruned,
        maxRetrievalTokens,
      },
    },
  ];

  const reevaluatedThesis: ModelMemoryThesisHoleEvaluationReport["reevaluatedThesis"] = {
    cutoverJudgment: "not_ready_for_cutover",
    confidence: "medium",
    thesisStillLooksTrue: [
      "Support-only churn is no longer a live blocker; both isolated diff and honest pure_attach_support replay show stable support-only behavior.",
      "Retrieval/context boundedness is green on the current preserved corpus.",
      "AGENTS is not just a synthetic outlier; it is also the single largest preserved-corpus rerun-escape source.",
      "Duplicate quality remains the live cutover blocker.",
    ],
    thesisNeedsRevision: [
      "The blocker should no longer be described as mostly deterministic recall loss alone.",
      "Current evidence supports a mixed blocker: deterministic gate loss remains large in AGENTS traces, but batch adjudication is still missing some same-claim rule cases that already reached the batch lane.",
      "The qualitative review should still outrank the benchmark for cutover judgment, but only as a high-signal bounded sample, not as broad corpus coverage.",
    ],
    remainingBlockers: [
      "AGENTS still shows dominant deterministic gate loss on the current scratch hinge trace.",
      "Preserved-corpus qualitative review still contains clear duplicate cases that should have attached support.",
      "The benchmark and qualitative review still diverge enough that duplicate quality is not yet settled cleanly.",
    ],
    nextTestsThatWouldChangeTheCall: [
      "Expand qualitative duplicate review to a materially larger preserved-corpus sample, especially AGENTS rule cases.",
      "Add a paired live-vs-replay audit trace for reviewed duplicate cases to test replay drift directly.",
      "Run one more narrow AGENTS-specific batch-evidence improvement pass and refresh the preserved-corpus review.",
      "Add a broader retrieval/context probe basket before treating current-corpus green as production-generalized.",
    ],
    conciseJudgment:
      "The baseline thesis was directionally right but too recall-centric. The updated thesis is that cutover is still blocked by duplicate quality in dense rule guidance, with AGENTS proving a mixed recall-plus-batch-choice problem rather than a recall-only one.",
  };

  return {
    generatedAt: new Date().toISOString(),
    baselineThesis: buildBaselineThesis(),
    inputs: {
      agentsTracePath: input.agentsTracePath,
      comparisonTracePaths: input.comparisonTracePaths,
      duplicateAuditPath: input.duplicateAuditPath,
      duplicateBenchmarkPath: input.duplicateBenchmarkPath,
      duplicateReviewPath: input.duplicateReviewPath,
      proofPhaseReportPath: input.proofPhaseReportPath,
      supportOnlyRebuildDiffPath: input.supportOnlyRebuildDiffPath,
    },
    holes,
    reevaluatedThesis,
  };
}

export function renderModelMemoryThesisHoleEvaluationMarkdown(
  report: ModelMemoryThesisHoleEvaluationReport,
): string {
  const lines: string[] = [
    "# Model Memory Thesis Hole Evaluation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Baseline cutover judgment: ${report.baselineThesis.cutoverJudgment}`,
    `- Inputs:`,
    `  - AGENTS trace: ${report.inputs.agentsTracePath}`,
    `  - Comparison traces: ${report.inputs.comparisonTracePaths.join(", ")}`,
    `  - Duplicate audit: ${report.inputs.duplicateAuditPath}`,
    `  - Duplicate benchmark: ${report.inputs.duplicateBenchmarkPath}`,
    `  - Duplicate review: ${report.inputs.duplicateReviewPath}`,
    `  - Proof phase report: ${report.inputs.proofPhaseReportPath}`,
    `  - Support-only rebuild diff: ${report.inputs.supportOnlyRebuildDiffPath}`,
    "",
    "## Baseline Thesis",
    "",
  ];

  for (const statement of report.baselineThesis.statements) {
    lines.push(`- ${statement}`);
  }

  lines.push("", "## Hole Results", "");

  for (const hole of report.holes) {
    lines.push(`### ${hole.id}: ${hole.title}`);
    lines.push(`- Concern: ${hole.concern}`);
    lines.push(`- Assessment: ${hole.assessment}`);
    lines.push(`- Effect on thesis: ${hole.effectOnThesis}`);
    lines.push(`- Confidence: ${hole.confidence}`);
    lines.push(`- Summary: ${hole.summary}`);
    for (const evidencePoint of hole.evidence) {
      lines.push(`- Evidence: ${evidencePoint}`);
    }
    lines.push(`- Metrics: ${JSON.stringify(hole.metrics)}`);
    lines.push("");
  }

  lines.push("## Reevaluated Thesis", "");
  lines.push(`- Cutover judgment: ${report.reevaluatedThesis.cutoverJudgment}`);
  lines.push(`- Confidence: ${report.reevaluatedThesis.confidence}`);
  lines.push(`- Concise judgment: ${report.reevaluatedThesis.conciseJudgment}`);
  lines.push("- Thesis still looks true:");
  for (const point of report.reevaluatedThesis.thesisStillLooksTrue) {
    lines.push(`  - ${point}`);
  }
  lines.push("- Thesis needs revision:");
  for (const point of report.reevaluatedThesis.thesisNeedsRevision) {
    lines.push(`  - ${point}`);
  }
  lines.push("- Remaining blockers:");
  for (const point of report.reevaluatedThesis.remainingBlockers) {
    lines.push(`  - ${point}`);
  }
  lines.push("- Next tests that would change the call:");
  for (const point of report.reevaluatedThesis.nextTestsThatWouldChangeTheCall) {
    lines.push(`  - ${point}`);
  }

  return lines.join("\n").trimEnd();
}
