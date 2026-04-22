import { createHash } from "node:crypto";
import type { ProofCaseResult } from "../proof/proof-runner.ts";

export type BenchmarkSummary = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  expectedObjects: number;
  actualObjects: number;
  matchedObjects: number;
  falsePositiveRate: number;
  precision: number;
  recall: number;
  omissionRate: number;
};

export function buildBenchmarkSummary(results: ProofCaseResult[]): BenchmarkSummary {
  const totalCases = results.length;
  const passedCases = results.filter((result) => result.pass).length;
  const failedCases = totalCases - passedCases;
  const omissionCases = results.filter((result) => result.action === "ignore").length;
  const omissionPasses = results.filter(
    (result) => result.action === "ignore" && result.pass,
  ).length;
  const expectedObjects = results.reduce((total, result) => total + result.expectedObjectCount, 0);
  const actualObjects = results.reduce((total, result) => total + result.actualObjectCount, 0);
  const matchedObjects = results.reduce((total, result) => total + result.matchedObjectCount, 0);
  const falsePositiveObjects = Math.max(0, actualObjects - matchedObjects);

  return {
    totalCases,
    passedCases,
    failedCases,
    expectedObjects,
    actualObjects,
    matchedObjects,
    falsePositiveRate: actualObjects === 0 ? 0 : falsePositiveObjects / actualObjects,
    precision: actualObjects === 0 ? 1 : matchedObjects / actualObjects,
    recall: expectedObjects === 0 ? 1 : matchedObjects / expectedObjects,
    omissionRate: omissionCases === 0 ? 1 : omissionPasses / omissionCases,
  };
}

export const DEFAULT_CACHE_AWARE_MINI_MODEL_ID = "openai-codex/gpt-5.4-mini";
export const DEFAULT_CACHE_AWARE_NANO_MODEL_ID = "openrouter/openai/gpt-5.4-nano";

export type CacheAwareBenchmarkCaseKind =
  | "deterministic_routing_bypass"
  | "ambiguous_model_routing"
  | "durable_preference_extraction"
  | "durable_directive_extraction"
  | "durable_project_fact_extraction"
  | "canonicalization"
  | "correction_targeting"
  | "retrieval_request_interpretation"
  | "strict_schema_adherence"
  | "empty_response_behavior"
  | "repair_rate"
  | "large_document_compression";

export type CacheAwarePromptPlan = {
  contractName: string;
  contractVersion: string;
  promptVersion: string;
  staticPrefixHash: string;
  schemaHash: string;
  promptCacheKey: string;
  staticPrefix: string;
  schemaText: string;
  dynamicTail: string;
  sourceTextPlacement: "dynamic_tail_only";
};

export type CacheAwareModelCallObservation = {
  caseId: string;
  caseKind: CacheAwareBenchmarkCaseKind;
  runIndex: number;
  modelId: string;
  provider?: string;
  resolvedModelId?: string;
  contractName: string;
  contractVersion: string;
  promptVersion: string;
  staticPrefixHash: string;
  schemaHash: string;
  promptCacheKey?: string;
  latencyMs: number;
  promptTokenCount: number;
  cachedInputTokenCount: number;
  outputTokenCount: number;
  schemaAdherent: boolean;
  emptyResponse: boolean;
  repairAttempted: boolean;
  repairSucceeded: boolean;
  validCandidateCount: number;
  invalidCandidateCount: number;
  falsePositiveCount: number;
  missedDurableFactCount: number;
  failureClass?: string;
};

export type CacheAwareBenchmarkModelSummary = {
  modelId: string;
  calls: number;
  cases: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  promptTokens: number;
  cachedTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  cacheableCalls: number;
  cacheHits: number;
  cacheHitRate: number;
  cachedTokenPercentage: number;
  schemaAdherenceRate: number;
  emptyResponseRate: number;
  repairRate: number;
  repairSuccessRate: number;
  validCandidateRate: number;
  falsePositiveRate: number;
  missedDurableFactRate: number;
  failureClasses: Record<string, number>;
};

export type CacheAwareBenchmarkReport = {
  schemaVersion: "model_memory_cache_aware_benchmark.v1";
  generatedAt: string;
  miniModelId: string;
  nanoModelId: string;
  durableDbWrites: "disabled" | "isolated_staging";
  observations: CacheAwareModelCallObservation[];
  modelSummaries: CacheAwareBenchmarkModelSummary[];
  cacheHealth: {
    totalCalls: number;
    cacheableCalls: number;
    cacheHits: number;
    cacheHitRate: number;
    cachedTokenPercentage: number;
    averageCachedTokensPerCall: number;
    averageLatencyCachedMs: number | null;
    averageLatencyUncachedMs: number | null;
  };
  recommendation: {
    preferredModelId: string | null;
    reason: string;
    caveats: string[];
  };
};

export type LargeDocumentCompressionStrategy =
  | "direct_rigid_capture"
  | "source_preserving_summary_then_rigid_capture"
  | "section_map_candidate_hints";

export type SourcePreservingSummaryArtifact = {
  sourceId: string;
  sectionWindowIds: string[];
  sourceSpanIds: string[];
  quoteHashes: string[];
  boundedEvidenceQuotes?: string[];
  candidateHints: Array<{
    candidateId: string;
    candidateType: "claim" | "procedure" | "decision";
    sourceSpanIds: string[];
  }>;
  omittedSections: string[];
  uncertainSections: string[];
  canonicalTruth: false;
};

export type LargeDocumentCompressionObservation = {
  strategy: LargeDocumentCompressionStrategy;
  modelCalls: number;
  uncachedInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  extractionFailureRate: number;
  canonicalizationFailureRate: number;
  validMemoriesAdmitted: number;
  missedKnownFacts: number;
  hallucinatedUnsupportedCandidates: number;
  evidenceValidationFailures: number;
};

export type LargeDocumentCompressionReport = {
  schemaVersion: "model_memory_large_doc_compression.v1";
  generatedAt: string;
  sourceId: string;
  observations: LargeDocumentCompressionObservation[];
  recommendation: {
    preferredStrategy: LargeDocumentCompressionStrategy;
    reason: string;
  };
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildPromptCacheKey(input: {
  contractName: string;
  contractVersion: string;
  schemaHash: string;
  promptVersion: string;
  staticPrefixHash: string;
}): string {
  return `mmv2:${sha256(
    [
      input.contractName,
      input.contractVersion,
      input.schemaHash,
      input.promptVersion,
      input.staticPrefixHash,
    ].join("|"),
  ).slice(0, 32)}`;
}

export function buildCacheAwarePromptPlan(input: {
  contractName: string;
  contractVersion: string;
  promptVersion: string;
  staticPrefix: string;
  schema: unknown;
  dynamicTail: string;
  sourceText?: string;
}): CacheAwarePromptPlan {
  const schemaText = JSON.stringify(input.schema);
  const staticPrefixHash = sha256(input.staticPrefix);
  const schemaHash = sha256(schemaText);
  if (
    input.sourceText &&
    input.sourceText.trim().length > 0 &&
    (input.staticPrefix.includes(input.sourceText) || schemaText.includes(input.sourceText))
  ) {
    throw new Error("source text must only appear in the dynamic tail");
  }
  return {
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    promptVersion: input.promptVersion,
    staticPrefixHash,
    schemaHash,
    promptCacheKey: buildPromptCacheKey({
      contractName: input.contractName,
      contractVersion: input.contractVersion,
      schemaHash,
      promptVersion: input.promptVersion,
      staticPrefixHash,
    }),
    staticPrefix: input.staticPrefix,
    schemaText,
    dynamicTail: input.dynamicTail,
    sourceTextPlacement: "dynamic_tail_only",
  };
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function summarizeModelObservations(
  modelId: string,
  observations: CacheAwareModelCallObservation[],
): CacheAwareBenchmarkModelSummary {
  const promptTokens = observations.reduce(
    (sum, observation) => sum + observation.promptTokenCount,
    0,
  );
  const cachedTokens = observations.reduce(
    (sum, observation) => sum + observation.cachedInputTokenCount,
    0,
  );
  const outputTokens = observations.reduce(
    (sum, observation) => sum + observation.outputTokenCount,
    0,
  );
  const validCandidates = observations.reduce(
    (sum, observation) => sum + observation.validCandidateCount,
    0,
  );
  const invalidCandidates = observations.reduce(
    (sum, observation) => sum + observation.invalidCandidateCount,
    0,
  );
  const cacheableCalls = observations.filter((observation) => observation.promptCacheKey).length;
  const repairAttempts = observations.filter((observation) => observation.repairAttempted).length;
  return {
    modelId,
    calls: observations.length,
    cases: new Set(observations.map((observation) => observation.caseId)).size,
    p50LatencyMs: percentile(
      observations.map((observation) => observation.latencyMs),
      50,
    ),
    p95LatencyMs: percentile(
      observations.map((observation) => observation.latencyMs),
      95,
    ),
    promptTokens,
    cachedTokens,
    uncachedInputTokens: Math.max(0, promptTokens - cachedTokens),
    outputTokens,
    cacheableCalls,
    cacheHits: observations.filter((observation) => observation.cachedInputTokenCount > 0).length,
    cacheHitRate:
      cacheableCalls === 0
        ? 0
        : observations.filter((observation) => observation.cachedInputTokenCount > 0).length /
          cacheableCalls,
    cachedTokenPercentage: promptTokens === 0 ? 0 : cachedTokens / promptTokens,
    schemaAdherenceRate:
      observations.length === 0
        ? 0
        : observations.filter((observation) => observation.schemaAdherent).length /
          observations.length,
    emptyResponseRate:
      observations.length === 0
        ? 0
        : observations.filter((observation) => observation.emptyResponse).length /
          observations.length,
    repairRate: observations.length === 0 ? 0 : repairAttempts / observations.length,
    repairSuccessRate:
      repairAttempts === 0
        ? 1
        : observations.filter((observation) => observation.repairSucceeded).length / repairAttempts,
    validCandidateRate:
      validCandidates + invalidCandidates === 0
        ? 1
        : validCandidates / (validCandidates + invalidCandidates),
    falsePositiveRate:
      validCandidates === 0
        ? 0
        : observations.reduce((sum, observation) => sum + observation.falsePositiveCount, 0) /
          validCandidates,
    missedDurableFactRate:
      observations.length === 0
        ? 0
        : observations.reduce((sum, observation) => sum + observation.missedDurableFactCount, 0) /
          observations.length,
    failureClasses: countBy(
      observations
        .map((observation) => observation.failureClass)
        .filter((value): value is string => Boolean(value)),
    ),
  };
}

export function buildCacheAwareBenchmarkReport(input: {
  observations: CacheAwareModelCallObservation[];
  generatedAt?: Date;
  miniModelId?: string;
  nanoModelId?: string;
  durableDbWrites?: CacheAwareBenchmarkReport["durableDbWrites"];
}): CacheAwareBenchmarkReport {
  const observations = [...input.observations];
  const modelSummaries = [...new Set(observations.map((observation) => observation.modelId))]
    .toSorted((left, right) => left.localeCompare(right))
    .map((modelId) =>
      summarizeModelObservations(
        modelId,
        observations.filter((observation) => observation.modelId === modelId),
      ),
    );
  const totalPromptTokens = observations.reduce(
    (sum, observation) => sum + observation.promptTokenCount,
    0,
  );
  const totalCachedTokens = observations.reduce(
    (sum, observation) => sum + observation.cachedInputTokenCount,
    0,
  );
  const cacheableCalls = observations.filter((observation) => observation.promptCacheKey).length;
  const cacheHits = observations.filter(
    (observation) => observation.cachedInputTokenCount > 0,
  ).length;
  const cached = observations.filter((observation) => observation.cachedInputTokenCount > 0);
  const uncached = observations.filter((observation) => observation.cachedInputTokenCount === 0);
  const miniModelId = input.miniModelId ?? DEFAULT_CACHE_AWARE_MINI_MODEL_ID;
  const nanoModelId = input.nanoModelId ?? DEFAULT_CACHE_AWARE_NANO_MODEL_ID;
  const mini = modelSummaries.find((summary) => summary.modelId === miniModelId);
  const nano = modelSummaries.find((summary) => summary.modelId === nanoModelId);
  const preferredModelId =
    mini && nano
      ? mini.schemaAdherenceRate > nano.schemaAdherenceRate ||
        mini.emptyResponseRate < nano.emptyResponseRate ||
        mini.validCandidateRate >= nano.validCandidateRate
        ? mini.modelId
        : nano.modelId
      : null;
  return {
    schemaVersion: "model_memory_cache_aware_benchmark.v1",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    miniModelId,
    nanoModelId,
    durableDbWrites: input.durableDbWrites ?? "disabled",
    observations,
    modelSummaries,
    cacheHealth: {
      totalCalls: observations.length,
      cacheableCalls,
      cacheHits,
      cacheHitRate: cacheableCalls === 0 ? 0 : cacheHits / cacheableCalls,
      cachedTokenPercentage: totalPromptTokens === 0 ? 0 : totalCachedTokens / totalPromptTokens,
      averageCachedTokensPerCall:
        observations.length === 0 ? 0 : totalCachedTokens / observations.length,
      averageLatencyCachedMs: average(cached.map((observation) => observation.latencyMs)),
      averageLatencyUncachedMs: average(uncached.map((observation) => observation.latencyMs)),
    },
    recommendation: {
      preferredModelId,
      reason:
        preferredModelId === null
          ? "benchmark observations did not include both configured model routes"
          : "preferred route selected from schema adherence, empty-response rate, valid-candidate rate, and latency behavior",
      caveats: [
        "benchmark/eval output is artifact-only and must not be written into the live durable-memory DB",
        "prompt-cache gains are meaningful only when static prefix and schema remain byte-stable",
      ],
    },
  };
}

export function validateSourcePreservingSummaryArtifact(
  artifact: SourcePreservingSummaryArtifact,
): string[] {
  const failures: string[] = [];
  if (!artifact.sourceId) {
    failures.push("missing_source_id");
  }
  if (artifact.sectionWindowIds.length === 0) {
    failures.push("missing_section_window_ids");
  }
  if (artifact.sourceSpanIds.length === 0) {
    failures.push("missing_source_span_ids");
  }
  if (artifact.quoteHashes.length === 0 && (artifact.boundedEvidenceQuotes?.length ?? 0) === 0) {
    failures.push("missing_quote_hash_or_bounded_evidence");
  }
  if (artifact.canonicalTruth) {
    failures.push("summary_must_not_be_canonical_truth");
  }
  for (const candidate of artifact.candidateHints) {
    if (candidate.sourceSpanIds.length === 0) {
      failures.push(`candidate_missing_source_span:${candidate.candidateId}`);
    }
  }
  return failures;
}

export function buildLargeDocumentCompressionReport(input: {
  sourceId: string;
  observations: LargeDocumentCompressionObservation[];
  generatedAt?: Date;
}): LargeDocumentCompressionReport {
  const ranked = [...input.observations].toSorted((left, right) => {
    const leftFailures =
      left.extractionFailureRate +
      left.canonicalizationFailureRate +
      left.hallucinatedUnsupportedCandidates +
      left.evidenceValidationFailures +
      left.missedKnownFacts;
    const rightFailures =
      right.extractionFailureRate +
      right.canonicalizationFailureRate +
      right.hallucinatedUnsupportedCandidates +
      right.evidenceValidationFailures +
      right.missedKnownFacts;
    if (leftFailures !== rightFailures) {
      return leftFailures - rightFailures;
    }
    if (right.validMemoriesAdmitted !== left.validMemoriesAdmitted) {
      return right.validMemoriesAdmitted - left.validMemoriesAdmitted;
    }
    return (
      left.uncachedInputTokens +
      left.outputTokens -
      (right.uncachedInputTokens + right.outputTokens)
    );
  });
  const preferred = ranked[0]?.strategy ?? "direct_rigid_capture";
  return {
    schemaVersion: "model_memory_large_doc_compression.v1",
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    sourceId: input.sourceId,
    observations: input.observations,
    recommendation: {
      preferredStrategy: preferred,
      reason:
        preferred === "source_preserving_summary_then_rigid_capture"
          ? "source-preserving compression wins only when evidence validation remains clean and missed facts do not increase"
          : preferred === "section_map_candidate_hints"
            ? "section-map candidate hints preserve source authority with lower token pressure"
            : "direct rigid capture remains safest when compression adds evidence or omission failures",
    },
  };
}

export function renderCacheAwareBenchmarkMarkdown(report: CacheAwareBenchmarkReport): string {
  const lines = [
    "# Model Memory Cache-Aware Benchmark",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Mini model: ${report.miniModelId}`,
    `- Nano model: ${report.nanoModelId}`,
    `- Durable DB writes: ${report.durableDbWrites}`,
    `- Cache hit rate: ${report.cacheHealth.cacheHitRate}`,
    `- Cached-token percentage: ${report.cacheHealth.cachedTokenPercentage}`,
    `- Recommendation: ${report.recommendation.preferredModelId ?? "inconclusive"}`,
    "",
    "## Model Summaries",
    "",
    ...report.modelSummaries.flatMap((summary) => [
      `### ${summary.modelId}`,
      "",
      `- calls: ${summary.calls}`,
      `- cases: ${summary.cases}`,
      `- p50_latency_ms: ${summary.p50LatencyMs}`,
      `- p95_latency_ms: ${summary.p95LatencyMs}`,
      `- schema_adherence_rate: ${summary.schemaAdherenceRate}`,
      `- empty_response_rate: ${summary.emptyResponseRate}`,
      `- valid_candidate_rate: ${summary.validCandidateRate}`,
      `- cache_hit_rate: ${summary.cacheHitRate}`,
      "",
    ]),
  ];
  return lines.join("\n");
}
