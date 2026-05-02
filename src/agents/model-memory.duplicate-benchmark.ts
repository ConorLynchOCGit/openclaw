import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
  DuplicateAuditClusterCase,
  DuplicateAuditRerunEscapeCase,
  DuplicateAuditReport,
} from "./model-memory.duplicate-audit.ts";
import type { ModelMemoryDuplicateReviewReport } from "./model-memory.duplicate-review.ts";

export type DuplicateBenchmarkLabel =
  | "legit_distinct"
  | "should_attach_support"
  | "should_supersede"
  | "ambiguous_but_contained";

export type DuplicateBenchmarkResolution = "bootstrap_case_id" | "exact_fingerprint";

type ReviewedCaseSeed = {
  label: DuplicateBenchmarkLabel;
  rationale: string[];
};

type BenchmarkSeedBootstrapMode =
  | "review_aligned_semantic_seeds"
  | "prior_semantic_seeds"
  | "legacy_case_id_bootstrap"
  | "no_reviewed_seeds";

export type DuplicateBenchmarkSemanticSeed = {
  seedId: string;
  from: "rerun_escape" | "duplicate_cluster";
  source?: string;
  kind?: string;
  payloadSummaryHash: string;
  payloadSummaryPreview: string;
  topPriorCandidateSummaryHash?: string;
  topPriorCandidateSummaryPreview?: string;
  adjudicatedLabel: DuplicateBenchmarkLabel;
  rationale: string[];
};

type ReviewedCaseRecord = {
  seedId: string;
  caseId: string;
  source?: string;
  kind?: string;
  payloadSummary: string;
  historicalDecision?: string;
  replayPathClassification?: string;
  topPriorCandidateSummary?: string;
  topPriorCandidateDecisiveFieldAgreement?: boolean;
  topPriorCandidateDecisiveFieldSummary?: string;
  topPriorCandidateOverlap?: {
    overlapCount: number;
    smallerCoverage: number;
    largerCoverage: number;
  };
  adjudicatedLabel: DuplicateBenchmarkLabel;
  rationale: string[];
  resolution: DuplicateBenchmarkResolution;
};

export type ModelMemoryDuplicateBenchmarkReport = {
  generatedAt: string;
  duplicateAuditPath: string;
  duplicateAuditGeneratedAt: string;
  duplicateReviewPath?: string;
  duplicateReviewGeneratedAt?: string;
  databaseMode?: string;
  databaseName?: string;
  priorBenchmarkPath?: string;
  seedBootstrapMode: BenchmarkSeedBootstrapMode;
  seedStrategy: "semantic_fingerprint_v1";
  missingBootstrapRerunCaseIds: string[];
  missingBootstrapClusterCaseIds: string[];
  unresolvedSemanticSeedIds: string[];
  semanticSeeds: DuplicateBenchmarkSemanticSeed[];
  rerunReviewedCases: ReviewedCaseRecord[];
  clusterCorroborationCases: ReviewedCaseRecord[];
  summary: {
    rerunSampleSize: number;
    clusterCorroborationSize: number;
    rerunHistoricalWriteCaseCount: number;
    rerunHistoricalSupersedeCaseCount: number;
    rerunLabelCounts: Record<string, number>;
    clusterLabelCounts: Record<string, number>;
    reviewBasketComposition?: Record<string, Record<string, number>>;
    falseDistinctRateOnReruns: number;
    trueDistinctRateOnReruns: number;
    attachSupportMissRateOnReruns: number;
    falseSupersedeRateOnReruns: number;
    falseDistinctRateIntervalOnReruns: {
      lower: number;
      upper: number;
      sampleSize: number;
    };
    trueDistinctRateIntervalOnReruns: {
      lower: number;
      upper: number;
      sampleSize: number;
    };
    attachSupportMissRateIntervalOnReruns: {
      lower: number;
      upper: number;
      sampleSize: number;
    };
  };
};

const REVIEWED_RERUN_CASES: Record<string, ReviewedCaseSeed> = {
  "rerun-f995f462-6fbb-5ac2-97df-16e41ec5efbc": {
    label: "should_attach_support",
    rationale: [
      "The prior active rule expresses the same stash safety instruction with only subject phrasing drift.",
      "The action-bearing rule body is materially the same, so a new active sibling is duplicate growth rather than new truth.",
    ],
  },
  "rerun-dd10aabd-96c3-5649-976d-4586157325f0": {
    label: "should_attach_support",
    rationale: [
      "The retained candidate set contains a narrower restart-handling fact whose value matches the rerun claim closely.",
      "This is a same-claim rerun with subject drift, not a new durable fact.",
    ],
  },
  "rerun-7afb9896-a61b-5fee-9f97-6e3eb4ad9c2b": {
    label: "should_attach_support",
    rationale: [
      "The prior candidate states the same credential-discovery fact with only minor wording drift in the subject.",
      "A new active object here is a duplicate fact escape.",
    ],
  },
  "rerun-c908cccf-d704-572e-ad8c-4caca7113144": {
    label: "should_attach_support",
    rationale: [
      "The model list and recommendation content match the prior fact; the subject wording changed but the durable claim did not.",
      "This should have reinforced the existing fact instead of creating a sibling object.",
    ],
  },
  "rerun-4444f492-2ca6-5bc8-9cef-e90eb3f1a1e6": {
    label: "should_attach_support",
    rationale: [
      "The prior rule already captures the same newline-handling instruction and negative constraint.",
      "This is a near-restatement of the same rule, not a distinct operational rule.",
    ],
  },
  "rerun-384a8e58-db4e-509f-a996-b0e7860be346": {
    label: "should_attach_support",
    rationale: [
      "The newer object repeats the same base-directory fact rather than correcting it.",
      "The historical supersede path was too aggressive; this should have been support on the prior fact.",
    ],
  },
  "rerun-77308577-0850-518c-82f9-29887d8eab4d": {
    label: "should_attach_support",
    rationale: [
      "The prior rule already says to reply with full docs URLs; only the subject framing changed.",
      "This is duplicate support for the same durable instruction.",
    ],
  },
  "rerun-a39686ff-094e-5377-b5c0-9dd2fdebca87": {
    label: "legit_distinct",
    rationale: [
      "The retained prior rule is broader and bundles other Mintlify/internal-link behavior not present in the new claim.",
      "Attaching support would incorrectly reinforce unrelated parts of the broader rule.",
    ],
  },
  "rerun-1d30a83a-260f-51cf-971a-f51cba11de7a": {
    label: "legit_distinct",
    rationale: [
      "The nearest prior fact is only loosely related through testing/credentials vocabulary.",
      "This is a different testing-behavior fact, not a duplicate of the credential-path fact.",
    ],
  },
  "rerun-f8185f64-64d8-5906-85c7-4dbee4171203": {
    label: "legit_distinct",
    rationale: [
      "The nearest prior rule is about GitHub auto-linking for issue/PR references, not end-of-task output format.",
      "Shared GitHub vocabulary does not make these the same durable rule.",
    ],
  },
  "rerun-c3cd4d39-a7a1-512d-bfff-14dc2a94887d": {
    label: "legit_distinct",
    rationale: [
      "The new rule is about unit/integration test expectations and CI behavior, while the prior rule is about live-test instability.",
      "These are related testing topics but distinct durable rules.",
    ],
  },
  "rerun-a2476beb-d562-54de-87b1-faa18959118d": {
    label: "legit_distinct",
    rationale: [
      "The nearest prior rule is about SecretRef activation semantics and shares only generic runtime wording.",
      "The Node 22+ baseline is a separate durable rule.",
    ],
  },
  "rerun-351698cb-edb6-5d1a-a87d-6cf101df30a4": {
    label: "legit_distinct",
    rationale: [
      "The prior rule is about newline encoding in GitHub comments, while the new rule adds shell-safety and `gh ... -b` constraints.",
      "These are adjacent but not the same durable claim.",
    ],
  },
};

const REVIEWED_CLUSTER_CASES: Record<string, ReviewedCaseSeed> = {
  "cluster-daca8ea0-6d53-552c-89ed-d8f292b07a93-b9d35e91-e117-5a07-9f37-da3b0c9f3342": {
    label: "should_attach_support",
    rationale: [
      "The configuration-file fact is the same durable claim with only subject wording drift.",
      "This duplicate cluster corroborates that value-exact facts should usually attach support.",
    ],
  },
  "cluster-4fa114d0-fa23-5e31-a63b-e04bb0c6c94a-cb8ecf16-ec11-567c-a729-3619a85ddaad": {
    label: "should_attach_support",
    rationale: [
      "The security-advisory alignment rule preserves the same action-bearing content with subject drift.",
      "This is a rule duplicate, not a new durable memory.",
    ],
  },
  "cluster-412e863d-b427-5ab5-9381-d301e341e0b6-519e8c35-8fd0-53de-be09-4121b91663e9": {
    label: "should_attach_support",
    rationale: [
      "The procedure steps are materially identical and title drift alone should not create a second procedure object.",
      "This cluster justifies procedure attach when steps agree exactly.",
    ],
  },
  "cluster-f465113d-983e-5e5b-810e-d30f25477f1b-7afb9896-a61b-5fee-9f97-6e3eb4ad9c2b": {
    label: "should_attach_support",
    rationale: [
      "The credential-discovery fact matches exactly in value and should reinforce the prior fact.",
      "This cluster corroborates the same miss pattern already seen in the rerun sample.",
    ],
  },
  "cluster-cb59ac43-944e-56c4-ad7b-3fcb6acb74f6-44413f95-04b6-5fa1-82a5-01a93d4d4312": {
    label: "should_attach_support",
    rationale: [
      "This already-correct attach-support cluster is a control case showing the intended same-claim behavior.",
      "It validates that the benchmark is not only selecting failures.",
    ],
  },
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function roundRate(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): {
  lower: number;
  upper: number;
  sampleSize: number;
} {
  if (total === 0) {
    return { lower: 0, upper: 0, sampleSize: 0 };
  }
  const p = successes / total;
  const z2 = z ** 2;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return {
    lower: Number(((center - margin) / denominator).toFixed(4)),
    upper: Number(((center + margin) / denominator).toFixed(4)),
    sampleSize: total,
  };
}

function normalizeFingerprintText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[`"'\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashFingerprintText(value: string | undefined): string | undefined {
  const normalized = normalizeFingerprintText(value);
  if (normalized.length === 0) {
    return undefined;
  }
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function getTopPriorCandidateSummary(
  caseRecord: DuplicateAuditRerunEscapeCase | DuplicateAuditClusterCase,
): string | undefined {
  if (caseRecord.caseType === "saturation_rerun_escape") {
    return caseRecord.nearestPriorCandidates[0]?.payloadSummary;
  }
  return caseRecord.olderPayloadSummary;
}

function buildSemanticSeed(input: {
  seedId?: string;
  from: "rerun_escape" | "duplicate_cluster";
  source?: string;
  kind?: string;
  payloadSummary: string;
  topPriorCandidateSummary?: string;
  label: DuplicateBenchmarkLabel;
  rationale: string[];
}): DuplicateBenchmarkSemanticSeed {
  const payloadSummaryHash = hashFingerprintText(input.payloadSummary) ?? "missing_payload_hash";
  const topPriorCandidateSummaryHash = hashFingerprintText(input.topPriorCandidateSummary);
  const seedId =
    input.seedId ??
    createSemanticSeedId({
      from: input.from,
      source: input.source,
      kind: input.kind,
      payloadSummaryHash,
      topPriorCandidateSummaryHash,
    });
  return {
    seedId,
    from: input.from,
    source: input.source,
    kind: input.kind,
    payloadSummaryHash,
    payloadSummaryPreview: input.payloadSummary,
    topPriorCandidateSummaryHash,
    topPriorCandidateSummaryPreview: input.topPriorCandidateSummary,
    adjudicatedLabel: input.label,
    rationale: input.rationale,
  };
}

function createSemanticSeedId(input: {
  from: "rerun_escape" | "duplicate_cluster";
  source?: string;
  kind?: string;
  payloadSummaryHash: string;
  topPriorCandidateSummaryHash?: string;
}): string {
  const rawKey = buildSemanticFingerprintKey(input);
  return `seed-${createHash("sha256").update(rawKey).digest("hex").slice(0, 16)}`;
}

function buildSemanticFingerprintKey(seed: {
  from: "rerun_escape" | "duplicate_cluster";
  source?: string;
  kind?: string;
  payloadSummaryHash: string;
  topPriorCandidateSummaryHash?: string;
}): string {
  return [
    seed.from,
    normalizeFingerprintText(seed.source),
    normalizeFingerprintText(seed.kind),
    seed.payloadSummaryHash,
    seed.topPriorCandidateSummaryHash ?? "",
  ].join("|");
}

function toReviewedCaseRecord(
  caseRecord: DuplicateAuditRerunEscapeCase | DuplicateAuditClusterCase,
  seed: DuplicateBenchmarkSemanticSeed,
  resolution: DuplicateBenchmarkResolution,
): ReviewedCaseRecord {
  if (caseRecord.caseType === "saturation_rerun_escape") {
    return {
      seedId: seed.seedId,
      caseId: caseRecord.caseId,
      source: caseRecord.source,
      kind: caseRecord.kind,
      payloadSummary: caseRecord.payloadSummary,
      historicalDecision: caseRecord.historicalDecision,
      replayPathClassification: caseRecord.replayPathClassification,
      topPriorCandidateSummary: caseRecord.nearestPriorCandidates[0]?.payloadSummary,
      topPriorCandidateDecisiveFieldAgreement:
        caseRecord.nearestPriorCandidates[0]?.decisiveFieldAgreement,
      topPriorCandidateDecisiveFieldSummary:
        caseRecord.nearestPriorCandidates[0]?.decisiveFieldSummary,
      topPriorCandidateOverlap: caseRecord.nearestPriorCandidates[0]
        ? {
            overlapCount: caseRecord.nearestPriorCandidates[0].overlap.overlapCount,
            smallerCoverage: caseRecord.nearestPriorCandidates[0].overlap.smallerCoverage,
            largerCoverage: caseRecord.nearestPriorCandidates[0].overlap.largerCoverage,
          }
        : undefined,
      adjudicatedLabel: seed.adjudicatedLabel,
      rationale: seed.rationale,
      resolution,
    };
  }

  return {
    seedId: seed.seedId,
    caseId: caseRecord.caseId,
    source: caseRecord.newerObjectSource,
    kind: caseRecord.kind,
    payloadSummary: caseRecord.newerPayloadSummary,
    historicalDecision: caseRecord.newerHistoricalDecision,
    replayPathClassification: caseRecord.newerReplayPathClassification,
    topPriorCandidateSummary: caseRecord.olderPayloadSummary,
    topPriorCandidateDecisiveFieldAgreement: undefined,
    topPriorCandidateDecisiveFieldSummary: undefined,
    topPriorCandidateOverlap: {
      overlapCount: caseRecord.overlap.overlapCount,
      smallerCoverage: caseRecord.overlap.smallerCoverage,
      largerCoverage: caseRecord.overlap.largerCoverage,
    },
    adjudicatedLabel: seed.adjudicatedLabel,
    rationale: seed.rationale,
    resolution,
  };
}

function buildBootstrapSemanticSeeds(input: { duplicateAudit: DuplicateAuditReport }): {
  semanticSeeds: DuplicateBenchmarkSemanticSeed[];
  missingBootstrapRerunCaseIds: string[];
  missingBootstrapClusterCaseIds: string[];
} {
  const rerunById = new Map(
    input.duplicateAudit.rerunEscapeCases.map(
      (caseRecord) => [caseRecord.caseId, caseRecord] as const,
    ),
  );
  const clusterById = new Map(
    input.duplicateAudit.duplicateClusterCases.map(
      (caseRecord) => [caseRecord.caseId, caseRecord] as const,
    ),
  );

  const missingBootstrapRerunCaseIds: string[] = [];
  const missingBootstrapClusterCaseIds: string[] = [];
  const semanticSeeds: DuplicateBenchmarkSemanticSeed[] = [];

  for (const [caseId, seed] of Object.entries(REVIEWED_RERUN_CASES)) {
    const caseRecord = rerunById.get(caseId);
    if (!caseRecord) {
      missingBootstrapRerunCaseIds.push(caseId);
      continue;
    }
    semanticSeeds.push(
      buildSemanticSeed({
        seedId: caseId,
        from: "rerun_escape",
        source: caseRecord.source,
        kind: caseRecord.kind,
        payloadSummary: caseRecord.payloadSummary,
        topPriorCandidateSummary: caseRecord.nearestPriorCandidates[0]?.payloadSummary,
        label: seed.label,
        rationale: seed.rationale,
      }),
    );
  }

  for (const [caseId, seed] of Object.entries(REVIEWED_CLUSTER_CASES)) {
    const caseRecord = clusterById.get(caseId);
    if (!caseRecord) {
      missingBootstrapClusterCaseIds.push(caseId);
      continue;
    }
    semanticSeeds.push(
      buildSemanticSeed({
        seedId: caseId,
        from: "duplicate_cluster",
        source: caseRecord.newerObjectSource,
        kind: caseRecord.kind,
        payloadSummary: caseRecord.newerPayloadSummary,
        topPriorCandidateSummary: caseRecord.olderPayloadSummary,
        label: seed.label,
        rationale: seed.rationale,
      }),
    );
  }

  return {
    semanticSeeds,
    missingBootstrapRerunCaseIds,
    missingBootstrapClusterCaseIds,
  };
}

function mapReviewLabelToBenchmarkLabel(label: string): DuplicateBenchmarkLabel {
  switch (label) {
    case "clear_duplicate_should_attach":
      return "should_attach_support";
    case "clear_distinct_should_stay_distinct":
      return "legit_distinct";
    case "true_ambiguity":
    case "needs_policy_change":
    default:
      return "ambiguous_but_contained";
  }
}

function buildSemanticSeedsFromReview(input: {
  duplicateReview: ModelMemoryDuplicateReviewReport;
}): DuplicateBenchmarkSemanticSeed[] {
  return input.duplicateReview.cases.map((caseRecord) =>
    buildSemanticSeed({
      seedId: caseRecord.caseId,
      from: "rerun_escape",
      source: caseRecord.source,
      kind: caseRecord.kind,
      payloadSummary: caseRecord.payloadSummary,
      topPriorCandidateSummary: caseRecord.topRetainedCandidates[0],
      label: mapReviewLabelToBenchmarkLabel(caseRecord.reviewerLabel),
      rationale: [
        "Seed aligned to the current qualitative duplicate review basket.",
        `Review label=${caseRecord.reviewerLabel} with stratification=${JSON.stringify(caseRecord.stratification)}.`,
      ],
    }),
  );
}

function resolveSemanticSeed(
  seed: DuplicateBenchmarkSemanticSeed,
  cases: Array<DuplicateAuditRerunEscapeCase | DuplicateAuditClusterCase>,
): {
  caseRecord?: DuplicateAuditRerunEscapeCase | DuplicateAuditClusterCase;
  resolution?: DuplicateBenchmarkResolution;
} {
  const seedFingerprint = buildSemanticFingerprintKey(seed);
  const exactMatch = cases.find((caseRecord) => {
    const caseFingerprint = buildSemanticFingerprintKey({
      from:
        caseRecord.caseType === "saturation_rerun_escape" ? "rerun_escape" : "duplicate_cluster",
      source:
        caseRecord.caseType === "saturation_rerun_escape"
          ? caseRecord.source
          : caseRecord.newerObjectSource,
      kind: caseRecord.kind,
      payloadSummaryHash:
        hashFingerprintText(
          caseRecord.caseType === "saturation_rerun_escape"
            ? caseRecord.payloadSummary
            : caseRecord.newerPayloadSummary,
        ) ?? "missing_payload_hash",
      topPriorCandidateSummaryHash: hashFingerprintText(getTopPriorCandidateSummary(caseRecord)),
    });
    return seedFingerprint === caseFingerprint;
  });

  if (exactMatch) {
    return {
      caseRecord: exactMatch,
      resolution: "exact_fingerprint",
    };
  }

  return {};
}

function readMaybePriorBenchmark(value: string): ModelMemoryDuplicateBenchmarkReport | undefined {
  try {
    return JSON.parse(value) as ModelMemoryDuplicateBenchmarkReport;
  } catch {
    return undefined;
  }
}

async function readPriorBenchmarkIfPresent(
  priorBenchmarkPath: string | undefined,
): Promise<ModelMemoryDuplicateBenchmarkReport | undefined> {
  if (!priorBenchmarkPath) {
    return undefined;
  }
  try {
    return readMaybePriorBenchmark(await readFile(priorBenchmarkPath, "utf8"));
  } catch {
    return undefined;
  }
}

export async function runModelMemoryDuplicateBenchmark(input: {
  duplicateAuditPath: string;
  duplicateReviewPath?: string;
  databaseMode?: string;
  databaseName?: string;
  priorBenchmarkPath?: string;
}): Promise<ModelMemoryDuplicateBenchmarkReport> {
  const [duplicateAudit, duplicateReview] = await Promise.all([
    readFile(input.duplicateAuditPath, "utf8").then(
      (value) => JSON.parse(value) as DuplicateAuditReport,
    ),
    input.duplicateReviewPath
      ? readFile(input.duplicateReviewPath, "utf8").then(
          (value) => JSON.parse(value) as ModelMemoryDuplicateReviewReport,
        )
      : Promise.resolve(undefined),
  ]);
  const priorBenchmarkPath = input.priorBenchmarkPath;
  const priorBenchmark = await readPriorBenchmarkIfPresent(priorBenchmarkPath);

  const bootstrapSeeds = buildBootstrapSemanticSeeds({
    duplicateAudit,
  });
  const reviewAlignedSeeds = duplicateReview
    ? buildSemanticSeedsFromReview({
        duplicateReview,
      })
    : [];
  const semanticSeeds =
    reviewAlignedSeeds.length > 0
      ? reviewAlignedSeeds
      : priorBenchmark?.semanticSeeds && priorBenchmark.semanticSeeds.length > 0
        ? priorBenchmark.semanticSeeds
        : bootstrapSeeds.semanticSeeds.length > 0
          ? bootstrapSeeds.semanticSeeds
          : [];
  const seedBootstrapMode: BenchmarkSeedBootstrapMode =
    reviewAlignedSeeds.length > 0
      ? "review_aligned_semantic_seeds"
      : priorBenchmark?.semanticSeeds && priorBenchmark.semanticSeeds.length > 0
        ? "prior_semantic_seeds"
        : bootstrapSeeds.semanticSeeds.length > 0
          ? "legacy_case_id_bootstrap"
          : "no_reviewed_seeds";

  const allCases: Array<DuplicateAuditRerunEscapeCase | DuplicateAuditClusterCase> = [
    ...duplicateAudit.rerunEscapeCases,
    ...duplicateAudit.duplicateClusterCases,
  ];

  const unresolvedSemanticSeedIds: string[] = [];
  const rerunReviewedCases: ReviewedCaseRecord[] = [];
  const clusterCorroborationCases: ReviewedCaseRecord[] = [];

  for (const seed of semanticSeeds) {
    const resolved = resolveSemanticSeed(seed, allCases);
    if (!resolved.caseRecord || !resolved.resolution) {
      unresolvedSemanticSeedIds.push(seed.seedId);
      continue;
    }
    const record = toReviewedCaseRecord(resolved.caseRecord, seed, resolved.resolution);
    if (seed.from === "rerun_escape") {
      rerunReviewedCases.push(record);
    } else {
      clusterCorroborationCases.push(record);
    }
  }

  const rerunHistoricalWriteCases = rerunReviewedCases.filter(
    (caseRecord) => caseRecord.historicalDecision === "write",
  );
  const rerunHistoricalSupersedeCases = rerunReviewedCases.filter(
    (caseRecord) => caseRecord.historicalDecision === "supersede",
  );
  const rerunWriteShouldAttachCount = rerunHistoricalWriteCases.filter(
    (caseRecord) => caseRecord.adjudicatedLabel === "should_attach_support",
  ).length;
  const rerunWriteShouldSupersedeCount = rerunHistoricalWriteCases.filter(
    (caseRecord) => caseRecord.adjudicatedLabel === "should_supersede",
  ).length;
  const rerunWriteLegitDistinctCount = rerunHistoricalWriteCases.filter(
    (caseRecord) => caseRecord.adjudicatedLabel === "legit_distinct",
  ).length;
  const rerunSupersedeMissCount = rerunHistoricalSupersedeCases.filter(
    (caseRecord) => caseRecord.adjudicatedLabel !== "should_supersede",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    duplicateAuditPath: input.duplicateAuditPath,
    duplicateAuditGeneratedAt: duplicateAudit.generatedAt,
    duplicateReviewPath: input.duplicateReviewPath,
    duplicateReviewGeneratedAt: duplicateReview?.generatedAt,
    databaseMode: input.databaseMode ?? duplicateAudit.databaseMode,
    databaseName: input.databaseName ?? duplicateAudit.databaseName,
    priorBenchmarkPath,
    seedBootstrapMode,
    seedStrategy: "semantic_fingerprint_v1",
    missingBootstrapRerunCaseIds: bootstrapSeeds.missingBootstrapRerunCaseIds,
    missingBootstrapClusterCaseIds: bootstrapSeeds.missingBootstrapClusterCaseIds,
    unresolvedSemanticSeedIds,
    semanticSeeds,
    rerunReviewedCases,
    clusterCorroborationCases,
    summary: {
      rerunSampleSize: rerunReviewedCases.length,
      clusterCorroborationSize: clusterCorroborationCases.length,
      rerunHistoricalWriteCaseCount: rerunHistoricalWriteCases.length,
      rerunHistoricalSupersedeCaseCount: rerunHistoricalSupersedeCases.length,
      rerunLabelCounts: countBy(
        rerunReviewedCases.map((caseRecord) => caseRecord.adjudicatedLabel),
      ),
      clusterLabelCounts: countBy(
        clusterCorroborationCases.map((caseRecord) => caseRecord.adjudicatedLabel),
      ),
      reviewBasketComposition: duplicateReview?.basketComposition,
      falseDistinctRateOnReruns: roundRate(
        rerunWriteShouldAttachCount + rerunWriteShouldSupersedeCount,
        rerunHistoricalWriteCases.length,
      ),
      trueDistinctRateOnReruns: roundRate(
        rerunWriteLegitDistinctCount,
        rerunHistoricalWriteCases.length,
      ),
      attachSupportMissRateOnReruns: roundRate(
        rerunWriteShouldAttachCount,
        rerunHistoricalWriteCases.length,
      ),
      falseSupersedeRateOnReruns: roundRate(
        rerunSupersedeMissCount,
        rerunHistoricalSupersedeCases.length,
      ),
      falseDistinctRateIntervalOnReruns: wilsonInterval(
        rerunWriteShouldAttachCount + rerunWriteShouldSupersedeCount,
        rerunHistoricalWriteCases.length,
      ),
      trueDistinctRateIntervalOnReruns: wilsonInterval(
        rerunWriteLegitDistinctCount,
        rerunHistoricalWriteCases.length,
      ),
      attachSupportMissRateIntervalOnReruns: wilsonInterval(
        rerunWriteShouldAttachCount,
        rerunHistoricalWriteCases.length,
      ),
    },
  };
}

export function renderModelMemoryDuplicateBenchmarkMarkdown(
  report: ModelMemoryDuplicateBenchmarkReport,
): string {
  const lines: string[] = [
    "# Model Memory Duplicate Escape Benchmark",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duplicate audit: ${report.duplicateAuditPath}`,
    `- Duplicate audit generated at: ${report.duplicateAuditGeneratedAt}`,
    `- Duplicate review: ${report.duplicateReviewPath ?? "none"}`,
    `- Duplicate review generated at: ${report.duplicateReviewGeneratedAt ?? "n/a"}`,
    `- DB mode: ${report.databaseMode ?? "unspecified"}`,
    `- Database: ${report.databaseName ?? "unknown"}`,
    `- Prior benchmark path: ${report.priorBenchmarkPath ?? "none"}`,
    `- Seed bootstrap mode: ${report.seedBootstrapMode}`,
    `- Seed strategy: ${report.seedStrategy}`,
    `- Missing bootstrap rerun case ids: ${report.missingBootstrapRerunCaseIds.length === 0 ? "none" : report.missingBootstrapRerunCaseIds.join(", ")}`,
    `- Missing bootstrap cluster case ids: ${report.missingBootstrapClusterCaseIds.length === 0 ? "none" : report.missingBootstrapClusterCaseIds.join(", ")}`,
    `- Unresolved semantic seed ids: ${report.unresolvedSemanticSeedIds.length === 0 ? "none" : report.unresolvedSemanticSeedIds.join(", ")}`,
    `- Rerun sample size: ${report.summary.rerunSampleSize}`,
    `- Cluster corroboration size: ${report.summary.clusterCorroborationSize}`,
    `- Rerun historical write cases: ${report.summary.rerunHistoricalWriteCaseCount}`,
    `- Rerun historical supersede cases: ${report.summary.rerunHistoricalSupersedeCaseCount}`,
    `- Rerun label counts: ${JSON.stringify(report.summary.rerunLabelCounts)}`,
    `- Cluster label counts: ${JSON.stringify(report.summary.clusterLabelCounts)}`,
    `- Review basket composition: ${JSON.stringify(report.summary.reviewBasketComposition ?? {})}`,
    `- False-distinct rate on reruns: ${report.summary.falseDistinctRateOnReruns}`,
    `- False-distinct Wilson interval on reruns: ${JSON.stringify(report.summary.falseDistinctRateIntervalOnReruns)}`,
    `- True-distinct rate on reruns: ${report.summary.trueDistinctRateOnReruns}`,
    `- True-distinct Wilson interval on reruns: ${JSON.stringify(report.summary.trueDistinctRateIntervalOnReruns)}`,
    `- Attach-support miss rate on reruns: ${report.summary.attachSupportMissRateOnReruns}`,
    `- Attach-support miss Wilson interval on reruns: ${JSON.stringify(report.summary.attachSupportMissRateIntervalOnReruns)}`,
    `- False-supersede rate on reruns: ${report.summary.falseSupersedeRateOnReruns}`,
    "",
    "## Semantic Seeds",
    "",
  ];

  for (const seed of report.semanticSeeds) {
    lines.push(`### ${seed.seedId}`);
    lines.push(`- From: ${seed.from}`);
    lines.push(`- Source: ${seed.source ?? "n/a"}`);
    lines.push(`- Kind: ${seed.kind ?? "n/a"}`);
    lines.push(`- Payload summary hash: ${seed.payloadSummaryHash}`);
    lines.push(`- Payload summary preview: ${seed.payloadSummaryPreview}`);
    lines.push(`- Top prior summary hash: ${seed.topPriorCandidateSummaryHash ?? "n/a"}`);
    lines.push(`- Top prior summary preview: ${seed.topPriorCandidateSummaryPreview ?? "n/a"}`);
    lines.push(`- Label: ${seed.adjudicatedLabel}`);
    for (const rationale of seed.rationale) {
      lines.push(`- Rationale: ${rationale}`);
    }
    lines.push("");
  }

  lines.push("## Reviewed Rerun Cases", "");
  for (const caseRecord of report.rerunReviewedCases) {
    lines.push(`### ${caseRecord.caseId}`);
    lines.push(`- Seed id: ${caseRecord.seedId}`);
    lines.push(`- Resolution: ${caseRecord.resolution}`);
    if (caseRecord.source) {
      lines.push(`- Source: ${caseRecord.source}`);
    }
    if (caseRecord.kind) {
      lines.push(`- Kind: ${caseRecord.kind}`);
    }
    lines.push(`- Payload: ${caseRecord.payloadSummary}`);
    if (caseRecord.historicalDecision) {
      lines.push(`- Historical decision: ${caseRecord.historicalDecision}`);
    }
    if (caseRecord.replayPathClassification) {
      lines.push(`- Replay path: ${caseRecord.replayPathClassification}`);
    }
    if (caseRecord.topPriorCandidateSummary) {
      lines.push(`- Top prior candidate: ${caseRecord.topPriorCandidateSummary}`);
    }
    if (caseRecord.topPriorCandidateDecisiveFieldAgreement !== undefined) {
      lines.push(
        `- Top prior decisive-field agreement: ${caseRecord.topPriorCandidateDecisiveFieldAgreement}`,
      );
    }
    if (caseRecord.topPriorCandidateDecisiveFieldSummary) {
      lines.push(
        `- Top prior decisive-field summary: ${caseRecord.topPriorCandidateDecisiveFieldSummary}`,
      );
    }
    if (caseRecord.topPriorCandidateOverlap) {
      lines.push(
        `- Top prior overlap: overlap=${caseRecord.topPriorCandidateOverlap.overlapCount} smaller=${caseRecord.topPriorCandidateOverlap.smallerCoverage.toFixed(2)} larger=${caseRecord.topPriorCandidateOverlap.largerCoverage.toFixed(2)}`,
      );
    }
    lines.push(`- Adjudicated label: ${caseRecord.adjudicatedLabel}`);
    for (const rationale of caseRecord.rationale) {
      lines.push(`- Rationale: ${rationale}`);
    }
    lines.push("");
  }

  lines.push("## Cluster Corroboration Cases", "");
  for (const caseRecord of report.clusterCorroborationCases) {
    lines.push(`### ${caseRecord.caseId}`);
    lines.push(`- Seed id: ${caseRecord.seedId}`);
    lines.push(`- Resolution: ${caseRecord.resolution}`);
    if (caseRecord.source) {
      lines.push(`- Source: ${caseRecord.source}`);
    }
    if (caseRecord.kind) {
      lines.push(`- Kind: ${caseRecord.kind}`);
    }
    lines.push(`- Payload: ${caseRecord.payloadSummary}`);
    if (caseRecord.historicalDecision) {
      lines.push(`- Historical decision: ${caseRecord.historicalDecision}`);
    }
    if (caseRecord.topPriorCandidateSummary) {
      lines.push(`- Top prior candidate: ${caseRecord.topPriorCandidateSummary}`);
    }
    if (caseRecord.topPriorCandidateOverlap) {
      lines.push(
        `- Top prior overlap: overlap=${caseRecord.topPriorCandidateOverlap.overlapCount} smaller=${caseRecord.topPriorCandidateOverlap.smallerCoverage.toFixed(2)} larger=${caseRecord.topPriorCandidateOverlap.largerCoverage.toFixed(2)}`,
      );
    }
    lines.push(`- Adjudicated label: ${caseRecord.adjudicatedLabel}`);
    for (const rationale of caseRecord.rationale) {
      lines.push(`- Rationale: ${rationale}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
