import { createHash } from "node:crypto";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { OpenRouterRetryEvidence } from "./openrouter-retry-policy.ts";
import {
  normalizeProviderUsageCost,
  type OpenRouterCatalogPricing,
  type ProviderUsageCostSource,
  type ProviderUsageEstimationConfidence,
} from "./provider-usage-cost-normalizer.ts";

export type ModelRunAccountingStatus = "succeeded" | "failed" | "needs_review";

export type ModelRunAccountingRecord = {
  artifactKind: "model_run_accounting";
  modelRunId: string;
  runtimeJobId: string;
  teamRunId: string;
  roleId: string;
  modelCandidateId: string;
  provider: "openrouter" | "local" | "fake";
  modelId: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  providerReportedCostUsd: number | null;
  estimatedCostUsd: number | null;
  costSource: ProviderUsageCostSource;
  estimationConfidence: ProviderUsageEstimationConfidence;
  usageComplete: boolean;
  pricingRef: string | null;
  providerUsageAvailable: boolean;
  providerCallSucceeded: boolean;
  status: ModelRunAccountingStatus;
  errorReasonCode: string | null;
  retryAttemptCount: number;
  retryReasonCodes: string[];
  retryCooldownAppliedMs: number;
  promptHash: string;
  responseHash: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type ModelRunAccountingSummary = {
  artifactKind: "model_run_accounting_summary";
  teamRunId: string;
  runtimeJobId: string;
  runCount: number;
  succeededCount: number;
  failedCount: number;
  needsReviewCount: number;
  totalLatencyMs: number;
  totalTokenCount: number | null;
  estimatedCostUsd: number | null;
  providerUsageComplete: boolean;
  costSource: ProviderUsageCostSource | "mixed";
  perRole: Array<{
    roleId: string;
    modelId: string;
    status: ModelRunAccountingStatus;
    latencyMs: number;
    totalTokenCount: number | null;
    estimatedCostUsd: number | null;
    costSource: ProviderUsageCostSource;
    retryAttemptCount: number;
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
};

function sizeBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function asJson(value: unknown): JsonValue {
  return value as JsonValue;
}

export function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function createModelRunAccountingRecord(input: {
  modelRunId: string;
  runtimeJobId: string;
  teamRunId: string;
  roleId: string;
  modelCandidateId: string;
  provider: ModelRunAccountingRecord["provider"];
  modelId: string;
  startedAt: string;
  completedAt: string;
  promptHash: string;
  responseHash?: string | null;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
  } | null;
  rawUsage?: Record<string, unknown> | null;
  catalogPricing?: OpenRouterCatalogPricing | null;
  retryEvidence?: OpenRouterRetryEvidence | null;
  providerCallSucceeded: boolean;
  status?: ModelRunAccountingStatus;
  errorReasonCode?: string | null;
}): ModelRunAccountingRecord {
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  const normalized = normalizeProviderUsageCost({
    modelId: input.modelId,
    usage: input.rawUsage,
    inputTokenCount: input.usage?.inputTokenCount ?? null,
    outputTokenCount: input.usage?.outputTokenCount ?? null,
    totalTokenCount: input.usage?.totalTokenCount ?? null,
    estimatedCostUsd: input.usage?.estimatedCostUsd ?? null,
    catalogPricing: input.catalogPricing,
  });
  return {
    artifactKind: "model_run_accounting",
    modelRunId: input.modelRunId,
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId,
    roleId: input.roleId,
    modelCandidateId: input.modelCandidateId,
    provider: input.provider,
    modelId: input.modelId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    latencyMs:
      Number.isFinite(started) && Number.isFinite(completed) && completed >= started
        ? completed - started
        : 0,
    inputTokenCount: normalized.inputTokenCount,
    outputTokenCount: normalized.outputTokenCount,
    totalTokenCount: normalized.totalTokenCount,
    providerReportedCostUsd: normalized.providerReportedCostUsd,
    estimatedCostUsd: normalized.estimatedCostUsd,
    costSource: normalized.costSource,
    estimationConfidence: normalized.estimationConfidence,
    usageComplete: normalized.usageComplete,
    pricingRef: normalized.pricingRef,
    providerUsageAvailable:
      normalized.inputTokenCount !== null ||
      normalized.outputTokenCount !== null ||
      normalized.totalTokenCount !== null ||
      normalized.estimatedCostUsd !== null,
    providerCallSucceeded: input.providerCallSucceeded,
    status:
      input.status ??
      (input.providerCallSucceeded
        ? "succeeded"
        : input.errorReasonCode
          ? "failed"
          : "needs_review"),
    errorReasonCode: input.errorReasonCode ?? null,
    retryAttemptCount: input.retryEvidence?.attemptCount ?? 1,
    retryReasonCodes: input.retryEvidence?.retryReasonCodes ?? [],
    retryCooldownAppliedMs: input.retryEvidence?.cooldownAppliedMs ?? 0,
    promptHash: input.promptHash,
    responseHash: input.responseHash ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function summarizeModelRunAccounting(
  records: ModelRunAccountingRecord[],
): ModelRunAccountingSummary {
  const costs = records.map((record) => record.estimatedCostUsd).filter((cost) => cost !== null);
  const tokens = records.map((record) => record.totalTokenCount).filter((count) => count !== null);
  const costSources = new Set(records.map((record) => record.costSource));
  return {
    artifactKind: "model_run_accounting_summary",
    teamRunId: records[0]?.teamRunId ?? "unknown-team-run",
    runtimeJobId: records[0]?.runtimeJobId ?? "unknown-runtime-job",
    runCount: records.length,
    succeededCount: records.filter((record) => record.status === "succeeded").length,
    failedCount: records.filter((record) => record.status === "failed").length,
    needsReviewCount: records.filter((record) => record.status === "needs_review").length,
    totalLatencyMs: records.reduce((sum, record) => sum + record.latencyMs, 0),
    totalTokenCount:
      tokens.length === records.length ? tokens.reduce((sum, count) => sum + count, 0) : null,
    estimatedCostUsd:
      costs.length === records.length ? costs.reduce((sum, cost) => sum + cost, 0) : null,
    providerUsageComplete: records.every((record) => record.usageComplete),
    costSource: costSources.size === 1 ? ([...costSources][0] ?? "unavailable") : "mixed",
    perRole: records.map((record) => ({
      roleId: record.roleId,
      modelId: record.modelId,
      status: record.status,
      latencyMs: record.latencyMs,
      totalTokenCount: record.totalTokenCount,
      estimatedCostUsd: record.estimatedCostUsd,
      costSource: record.costSource,
      retryAttemptCount: record.retryAttemptCount,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export async function recordModelRunAccounting(input: {
  runtimeJobs: RuntimeJobRepository;
  record: ModelRunAccountingRecord;
}): Promise<RuntimeJobArtifact> {
  const metadata = asJson(input.record);
  await input.runtimeJobs.recordEvent({
    jobId: input.record.runtimeJobId,
    eventType: "agent_team.model_run_accounting_recorded",
    data: {
      modelRunId: input.record.modelRunId,
      roleId: input.record.roleId,
      modelId: input.record.modelId,
      status: input.record.status,
      latencyMs: input.record.latencyMs,
      providerUsageAvailable: input.record.providerUsageAvailable,
      usageComplete: input.record.usageComplete,
      costSource: input.record.costSource,
      retryAttemptCount: input.record.retryAttemptCount,
      retryReasonCodes: input.record.retryReasonCodes,
    },
  });
  return input.runtimeJobs.attachArtifact({
    jobId: input.record.runtimeJobId,
    artifactType: "agent_team.model_run_accounting",
    storageKind: "metadata",
    uri: `runtime-job://${input.record.runtimeJobId}/agent-team/model-run-accounting/${input.record.modelRunId}`,
    contentType: "application/json",
    sizeBytes: sizeBytes(metadata),
    metadata,
  });
}

export async function recordModelRunAccountingSummary(input: {
  runtimeJobs: RuntimeJobRepository;
  summary: ModelRunAccountingSummary;
}): Promise<RuntimeJobArtifact> {
  const metadata = asJson(input.summary);
  return input.runtimeJobs.attachArtifact({
    jobId: input.summary.runtimeJobId,
    artifactType: "agent_team.model_run_accounting_summary",
    storageKind: "metadata",
    uri: `runtime-job://${input.summary.runtimeJobId}/agent-team/model-run-accounting-summary/${input.summary.teamRunId}`,
    contentType: "application/json",
    sizeBytes: sizeBytes(metadata),
    metadata,
  });
}

export function latestModelRunAccountingSummary(
  artifacts: RuntimeJobArtifact[],
): ModelRunAccountingSummary | null {
  const artifact = artifacts.findLast(
    (item) => item.artifactType === "agent_team.model_run_accounting_summary",
  );
  return artifact?.metadata && typeof artifact.metadata === "object"
    ? (artifact.metadata as unknown as ModelRunAccountingSummary)
    : null;
}
