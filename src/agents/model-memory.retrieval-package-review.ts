import type { OpenClawConfig } from "../config/config.ts";
import {
  buildRetrievalPackArtifact,
  executeRetrieval,
  ExecutorBackedRetrievalFinalInclusionReviewer,
  ExecutorBackedRetrievalRequestInterpreter,
  rebuildDerivedRuntimeState,
  type ModelMemoryObjectRecord,
  buildLexicalBaselineRetrievalRequest,
  buildRetrievalRequestPrompt,
  rankRetrievalCandidates,
  type InterpretedRetrievalRequest,
  type RetrievalEnvelope,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  OpenAICompatibleLiveJsonExecutor,
  type ModelMemoryLiveExecutionTrace,
} from "./model-memory.live-json-executor.ts";
import { summarizeModelMemoryPayload } from "./model-memory.payload-summary.ts";
import { RETRIEVAL_PROBES, type RetrievalProbeSpec } from "./model-memory.proof-phase.ts";

export type RetrievalPackageReviewVerdict =
  | "model_materially_improved"
  | "mostly_same_value_as_deterministic"
  | "model_overconstrained_or_degraded"
  | "mixed_delta";

export type RetrievalPackageReviewResult = {
  objectId: string;
  canonicalClass: string;
  kind: string;
  score: number;
  payloadSummary: string;
  reasonCodes: string[];
};

export type RetrievalPackageReviewProbeReport = {
  probeId: string;
  queryText: string;
  requestPurpose: string;
  promptPayload: ReturnType<typeof buildRetrievalRequestPrompt>;
  providerTrace?: ModelMemoryLiveExecutionTrace;
  lexicalBaselineRequest: InterpretedRetrievalRequest;
  modelAction: "retrieve" | "skip";
  modelInterpretedRequest?: InterpretedRetrievalRequest;
  lexicalBaselineResults: RetrievalPackageReviewResult[];
  modelResults: RetrievalPackageReviewResult[];
  lexicalAcceptedCount: {
    matchingKinds: number;
    matchingClasses: number;
  };
  modelAcceptedCount: {
    matchingKinds: number;
    matchingClasses: number;
  };
  finalRetrievalPackPreview: string;
  verdict: RetrievalPackageReviewVerdict;
  rationale: string[];
};

export type ModelMemoryRetrievalPackageReviewReport = {
  generatedAt: string;
  currentCorpus: true;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  probeIds: string[];
  probes: RetrievalPackageReviewProbeReport[];
  summary: {
    verdictCounts: Record<string, number>;
    modelAddsMaterialValueBeyondDeterministicSearch: boolean;
    modelSteeringEligibleForCutover: boolean;
  };
};

function summarizePayload(record: Pick<ModelMemoryObjectRecord, "kind" | "payload">): string {
  return summarizeModelMemoryPayload(record);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildLexicalBaselineRequest(envelope: RetrievalEnvelope): InterpretedRetrievalRequest {
  return buildLexicalBaselineRetrievalRequest(envelope);
}

function summarizeResults(input: {
  memoryObjects: ModelMemoryObjectRecord[];
  request: InterpretedRetrievalRequest;
  limit: number;
}): RetrievalPackageReviewResult[] {
  return rankRetrievalCandidates({
    memoryObjects: input.memoryObjects,
    request: input.request,
  })
    .slice(0, input.limit)
    .map((entry) => ({
      objectId: entry.object.id,
      canonicalClass: entry.object.canonicalClass,
      kind: entry.object.kind,
      score: entry.score,
      payloadSummary: summarizePayload(entry.object),
      reasonCodes: entry.reasonCodes,
    }));
}

function countAcceptedResults(
  results: RetrievalPackageReviewResult[],
  probe: RetrievalProbeSpec,
): { matchingKinds: number; matchingClasses: number } {
  return {
    matchingKinds: results.filter((result) => probe.acceptedKinds.includes(result.kind)).length,
    matchingClasses: results.filter((result) =>
      probe.acceptedCanonicalClasses.includes(result.canonicalClass),
    ).length,
  };
}

function computeVerdict(input: {
  lexicalAcceptedCount: { matchingKinds: number; matchingClasses: number };
  modelAcceptedCount: { matchingKinds: number; matchingClasses: number };
  lexicalBaselineResults: RetrievalPackageReviewResult[];
  modelResults: RetrievalPackageReviewResult[];
}): { verdict: RetrievalPackageReviewVerdict; rationale: string[] } {
  const lexicalSignal =
    input.lexicalAcceptedCount.matchingKinds + input.lexicalAcceptedCount.matchingClasses;
  const modelSignal =
    input.modelAcceptedCount.matchingKinds + input.modelAcceptedCount.matchingClasses;
  const lexicalIds = input.lexicalBaselineResults.map((entry) => entry.objectId).join("|");
  const modelIds = input.modelResults.map((entry) => entry.objectId).join("|");

  if (modelSignal > lexicalSignal) {
    return {
      verdict: "model_materially_improved",
      rationale: [
        `accepted_signal_delta=+${modelSignal - lexicalSignal}`,
        lexicalIds === modelIds
          ? "same_ranked_ids_but_better_type_targeting"
          : "different_ranked_ids",
      ],
    };
  }

  if (modelSignal < lexicalSignal) {
    return {
      verdict: "model_overconstrained_or_degraded",
      rationale: [
        `accepted_signal_delta=${modelSignal - lexicalSignal}`,
        lexicalIds === modelIds
          ? "same_ranked_ids_but_worse_type_targeting"
          : "different_ranked_ids",
      ],
    };
  }

  if (lexicalIds === modelIds) {
    return {
      verdict: "mostly_same_value_as_deterministic",
      rationale: ["same_ranked_ids", `accepted_signal=${modelSignal}`],
    };
  }

  return {
    verdict: "mixed_delta",
    rationale: ["accepted_signal_tied", "ranked_ids_changed"],
  };
}

function probeById(probeId: string): RetrievalProbeSpec {
  const probe = RETRIEVAL_PROBES.find((entry) => entry.id === probeId);
  if (!probe) {
    throw new Error(
      `unknown retrieval probe "${probeId}". Expected one of: ${RETRIEVAL_PROBES.map((entry) => entry.id).join(", ")}`,
    );
  }
  return probe;
}

export async function runModelMemoryRetrievalPackageReview(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config: OpenClawConfig;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  probeIds?: string[];
}): Promise<ModelMemoryRetrievalPackageReviewReport> {
  const probeIds = input.probeIds?.length
    ? input.probeIds
    : RETRIEVAL_PROBES.map((probe) => probe.id);
  const rebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });

  const probes: RetrievalPackageReviewProbeReport[] = [];
  for (const probeId of probeIds) {
    const probe = probeById(probeId);
    const envelope = {
      queryText: probe.queryText,
      requestPurpose: probe.requestPurpose,
      sessionId: `retrieval-package-review-${probe.id}`,
      agentId: "model-memory-retrieval-package-review",
      maxResults: 5,
    } satisfies RetrievalEnvelope;
    const promptPayload = buildRetrievalRequestPrompt(envelope, input.modelRef, "v1");
    let providerTrace: ModelMemoryLiveExecutionTrace | undefined;
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config: input.config,
      requestTimeoutMs: input.requestTimeoutMs,
      requestSeed: input.requestSeed,
      onTrace: (trace) => {
        providerTrace = trace;
      },
    });
    const interpreter = new ExecutorBackedRetrievalRequestInterpreter(executor);
    const finalInclusionReviewer = new ExecutorBackedRetrievalFinalInclusionReviewer(executor, {
      modelId: input.modelRef,
      reasoningEffort: "low",
    });
    const retrieval = await executeRetrieval({
      envelope,
      interpreter,
      memoryObjects: rebuild.memoryObjects,
      modelId: input.modelRef,
      finalInclusionReviewer,
      finalInclusionModelId: input.modelRef,
      createdAt: new Date(),
      projectionVersions: rebuild.projectionVersions,
    });
    if (!retrieval) {
      throw new Error(`retrieval package review unexpectedly skipped probe ${probe.id}`);
    }

    const lexicalBaselineRequest = buildLexicalBaselineRequest(envelope);
    const lexicalBaselineResults = summarizeResults({
      memoryObjects: rebuild.memoryObjects,
      request: lexicalBaselineRequest,
      limit: lexicalBaselineRequest.desiredResultCount,
    });
    if (!retrieval) {
      probes.push({
        probeId: probe.id,
        queryText: probe.queryText,
        requestPurpose: probe.requestPurpose,
        promptPayload,
        providerTrace,
        lexicalBaselineRequest,
        modelAction: "skip",
        lexicalBaselineResults,
        modelResults: [],
        lexicalAcceptedCount: countAcceptedResults(lexicalBaselineResults, probe),
        modelAcceptedCount: {
          matchingKinds: 0,
          matchingClasses: 0,
        },
        finalRetrievalPackPreview: "",
        verdict: "model_overconstrained_or_degraded",
        rationale: ["model_requested_skip"],
      });
      continue;
    }

    const modelResults = summarizeResults({
      memoryObjects: rebuild.memoryObjects,
      request: retrieval.interpretedRequest,
      limit: retrieval.interpretedRequest.desiredResultCount,
    });
    const lexicalAcceptedCount = countAcceptedResults(lexicalBaselineResults, probe);
    const modelAcceptedCount = countAcceptedResults(modelResults, probe);
    const pack = buildRetrievalPackArtifact({
      retrievalRequest: retrieval.retrievalRequest,
      retrievalResultSet: retrieval.retrievalResultSet,
      retrievalResultItems: retrieval.retrievalResultItems,
      memoryObjects: rebuild.memoryObjects,
      retrievalPlan: retrieval.retrievalPlan,
      retrievalCandidates: retrieval.retrievalCandidates,
      retrievalExclusions: retrieval.retrievalExclusions,
      selectedProjectionDigests: retrieval.selectedProjectionDigests,
      buildPolicyVersion: "v1",
    });
    const verdict = computeVerdict({
      lexicalAcceptedCount,
      modelAcceptedCount,
      lexicalBaselineResults,
      modelResults,
    });

    probes.push({
      probeId: probe.id,
      queryText: probe.queryText,
      requestPurpose: probe.requestPurpose,
      promptPayload,
      providerTrace,
      lexicalBaselineRequest,
      modelAction: "retrieve",
      modelInterpretedRequest: retrieval.interpretedRequest,
      lexicalBaselineResults,
      modelResults,
      lexicalAcceptedCount,
      modelAcceptedCount,
      finalRetrievalPackPreview: pack.renderedText ?? "",
      verdict: verdict.verdict,
      rationale: verdict.rationale,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    currentCorpus: true,
    modelRef: input.modelRef,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    probeIds,
    probes,
    summary: {
      verdictCounts: countBy(probes.map((probe) => probe.verdict)),
      modelAddsMaterialValueBeyondDeterministicSearch: probes.some(
        (probe) => probe.verdict === "model_materially_improved",
      ),
      modelSteeringEligibleForCutover: !probes.some(
        (probe) => probe.verdict === "model_overconstrained_or_degraded",
      ),
    },
  };
}

function renderResult(result: RetrievalPackageReviewResult): string {
  return [
    result.objectId,
    `${result.canonicalClass}/${result.kind}`,
    `score=${result.score}`,
    `payload=${result.payloadSummary}`,
    `reasons=${result.reasonCodes.join(",")}`,
  ].join(" | ");
}

export function renderModelMemoryRetrievalPackageReviewMarkdown(
  report: ModelMemoryRetrievalPackageReviewReport,
): string {
  const lines = [
    "# Model Memory Retrieval Package Review",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Current corpus: ${report.currentCorpus}`,
    `- Model: ${report.modelRef}`,
    `- Timeout ms: ${report.requestTimeoutMs}`,
    `- Seed: ${report.requestSeed ?? "none"}`,
    `- Probe ids: ${report.probeIds.join(", ")}`,
    `- Verdict counts: ${JSON.stringify(report.summary.verdictCounts)}`,
    `- Model adds material value beyond deterministic search: ${report.summary.modelAddsMaterialValueBeyondDeterministicSearch}`,
    `- Model steering eligible for cutover: ${report.summary.modelSteeringEligibleForCutover}`,
    "",
  ];

  for (const probe of report.probes) {
    lines.push(`## ${probe.probeId}`);
    lines.push("");
    lines.push(`- Query: ${probe.queryText}`);
    lines.push(`- Request purpose: ${probe.requestPurpose}`);
    lines.push(`- Verdict: ${probe.verdict}`);
    lines.push(`- Rationale: ${probe.rationale.join(", ")}`);
    lines.push(`- Model action: ${probe.modelAction}`);
    lines.push(`- Lexical accepted counts: ${JSON.stringify(probe.lexicalAcceptedCount)}`);
    lines.push(`- Model accepted counts: ${JSON.stringify(probe.modelAcceptedCount)}`);
    lines.push(`- Lexical request: ${JSON.stringify(probe.lexicalBaselineRequest)}`);
    lines.push(`- Model request: ${JSON.stringify(probe.modelInterpretedRequest ?? null)}`);
    if (probe.providerTrace) {
      lines.push(
        `- Provider trace: status=${probe.providerTrace.httpStatus ?? "n/a"} stage=${probe.providerTrace.failureStage ?? "success"} resolvedModel=${probe.providerTrace.resolvedModelId ?? "n/a"}`,
      );
    }
    lines.push("- Lexical baseline results:");
    for (const result of probe.lexicalBaselineResults) {
      lines.push(`- ${renderResult(result)}`);
    }
    lines.push("- Model-shaped results:");
    for (const result of probe.modelResults) {
      lines.push(`- ${renderResult(result)}`);
    }
    if (probe.finalRetrievalPackPreview) {
      lines.push("```text");
      lines.push(probe.finalRetrievalPackPreview);
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}
