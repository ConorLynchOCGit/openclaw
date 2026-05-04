import type { ModelRunAccountingRecord } from "./model-run-accounting.ts";

export type ProviderReliabilitySummary = {
  artifactKind: "provider_reliability_summary";
  teamRunId: string;
  runtimeJobId: string;
  perModel: Array<{
    modelId: string;
    provider: string;
    callCount: number;
    successCount: number;
    needsReviewCount: number;
    rateLimitCount: number;
    noContentCount: number;
    retryCount: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    usageComplete: boolean;
    costSource: string;
    latestReasonCodes: string[];
    readiness:
      | "qualified"
      | "needs_review"
      | "blocked"
      | "shadow_only"
      | "auto_demoted"
      | "unknown";
  }>;
  sourceArtifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export function summarizeProviderReliability(input: {
  records: ModelRunAccountingRecord[];
  readinessByModelId?: Record<string, string>;
  sourceArtifactRefs?: string[];
}): ProviderReliabilitySummary {
  const byModel = new Map<string, ModelRunAccountingRecord[]>();
  for (const record of input.records) {
    byModel.set(record.modelId, [...(byModel.get(record.modelId) ?? []), record]);
  }
  return {
    artifactKind: "provider_reliability_summary",
    teamRunId: input.records[0]?.teamRunId ?? "unknown-team-run",
    runtimeJobId: input.records[0]?.runtimeJobId ?? "unknown-runtime-job",
    perModel: [...byModel.entries()].map(([modelId, records]) => {
      const latency = records.map((record) => record.latencyMs);
      const reasonCodes = [
        ...new Set(
          records.flatMap((record) => [
            ...(record.errorReasonCode ? [record.errorReasonCode] : []),
            ...(record.retryReasonCodes ?? []),
          ]),
        ),
      ];
      return {
        modelId,
        provider: records[0]?.provider ?? "unknown",
        callCount: records.length,
        successCount: records.filter((record) => record.status === "succeeded").length,
        needsReviewCount: records.filter((record) => record.status === "needs_review").length,
        rateLimitCount: reasonCodes.filter((reason) => reason === "openrouter_http_429").length,
        noContentCount: reasonCodes.filter((reason) => reason === "openrouter_no_content").length,
        retryCount: records.reduce((sum, record) => sum + (record.retryAttemptCount ?? 1) - 1, 0),
        averageLatencyMs: latency.length
          ? Math.round(latency.reduce((sum, value) => sum + value, 0) / latency.length)
          : 0,
        maxLatencyMs: latency.length ? Math.max(...latency) : 0,
        usageComplete: records.every((record) => record.usageComplete),
        costSource: records.every((record) => record.costSource === "provider_reported")
          ? "provider_reported"
          : records.some((record) => record.costSource === "estimated_from_catalog")
            ? "estimated_from_catalog"
            : "unavailable",
        latestReasonCodes: reasonCodes.slice(0, 8),
        readiness:
          (input.readinessByModelId?.[modelId] as
            | "qualified"
            | "needs_review"
            | "blocked"
            | "shadow_only"
            | "auto_demoted"
            | undefined) ?? "unknown",
      };
    }),
    sourceArtifactRefs: input.sourceArtifactRefs?.slice(0, 20) ?? [],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
