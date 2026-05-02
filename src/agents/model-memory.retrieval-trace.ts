import type { OpenClawConfig } from "../config/config.ts";
import {
  buildRetrievalPackArtifact,
  buildRetrievalRequestPrompt,
  executeRetrieval,
  ExecutorBackedRetrievalFinalInclusionReviewer,
  ExecutorBackedRetrievalRequestInterpreter,
  JsonModelOutputError,
  rebuildDerivedRuntimeState,
  runModelMemoryContextEngine,
  type ModelMemoryObjectRecord,
  type RetrievalResultItemRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import {
  ModelMemoryLiveExecutionError,
  OpenAICompatibleLiveJsonExecutor,
  type ModelMemoryLiveExecutionTrace,
} from "./model-memory.live-json-executor.ts";
import { RETRIEVAL_PROBES, type RetrievalProbeSpec } from "./model-memory.proof-phase.ts";

const DEFAULT_CONTEXT_MAX_TOKENS = 1400;

export type RetrievalTraceFailureStage = "request_time" | "parse_time";

export type RetrievalTraceReport = {
  generatedAt: string;
  probeId: string;
  queryText: string;
  currentCorpus: true;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  promptPayload: ReturnType<typeof buildRetrievalRequestPrompt>;
  providerTrace?: ModelMemoryLiveExecutionTrace;
  failureStage?: RetrievalTraceFailureStage;
  parseValidationFailedAfterSuccessfulProviderResponse: boolean;
  errorMessage?: string;
  retrieval: {
    action: "retrieve" | "skip" | "failed";
    selectedCount: number;
    matchingKindCount: number;
    matchingClassCount: number;
    activeOnly: boolean;
    topResults: Array<{
      objectId: string;
      canonicalClass: string;
      kind: string;
      rankBand: string;
      reasonCodes: string[];
    }>;
  };
  context: {
    attempted: boolean;
    orderedSegmentCount: number;
    estimatedInputTokens: number;
    pruningUsed: boolean;
    retrievalPackIncluded: boolean;
    stableLayerHash: string;
    semiStableLayerHash: string;
    volatileLayerHash: string;
  };
};

function probeById(probeId: string): RetrievalProbeSpec {
  const probe = RETRIEVAL_PROBES.find((entry) => entry.id === probeId);
  if (!probe) {
    throw new Error(
      `unknown retrieval probe "${probeId}". Expected one of: ${RETRIEVAL_PROBES.map((entry) => entry.id).join(", ")}`,
    );
  }
  return probe;
}

function countMatchingItems(
  items: RetrievalResultItemRecord[],
  objectById: Map<string, ModelMemoryObjectRecord>,
  acceptedCanonicalClasses: string[],
  acceptedKinds: string[],
): { matchingClassCount: number; matchingKindCount: number; activeOnly: boolean } {
  let matchingClassCount = 0;
  let matchingKindCount = 0;
  let activeOnly = true;

  for (const item of items.filter((entry) => entry.selectedForContext)) {
    const object = objectById.get(item.memoryObjectId);
    if (!object) {
      activeOnly = false;
      continue;
    }
    if (acceptedCanonicalClasses.includes(object.canonicalClass)) {
      matchingClassCount += 1;
    }
    if (acceptedKinds.includes(object.kind)) {
      matchingKindCount += 1;
    }
    if ((object.lifecycleState ?? "active") !== "active" || object.supersededAt) {
      activeOnly = false;
    }
  }

  return {
    matchingClassCount,
    matchingKindCount,
    activeOnly,
  };
}

export async function runModelMemoryRetrievalTrace(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config: OpenClawConfig;
  probeId: string;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
}): Promise<RetrievalTraceReport> {
  const probe = probeById(input.probeId);
  const promptPayload = buildRetrievalRequestPrompt(
    {
      queryText: probe.queryText,
      requestPurpose: probe.requestPurpose,
      sessionId: `trace-${probe.id}`,
      agentId: "model-memory-retrieval-trace",
      maxResults: 5,
    },
    input.modelRef,
    "v1",
  );

  let providerTrace: ModelMemoryLiveExecutionTrace | undefined;
  const executor = new OpenAICompatibleLiveJsonExecutor({
    config: input.config,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    onTrace: (trace) => {
      providerTrace = trace;
    },
  });
  const retrievalInterpreter = new ExecutorBackedRetrievalRequestInterpreter(executor);
  const finalInclusionReviewer = new ExecutorBackedRetrievalFinalInclusionReviewer(executor, {
    modelId: input.modelRef,
    reasoningEffort: "low",
  });
  const rebuild = await rebuildDerivedRuntimeState({
    canonicalRepository: input.runtime.canonicalRepository,
    runtimeRepository: input.runtime.runtimeRepository,
  });

  try {
    const retrieval = await executeRetrieval({
      envelope: {
        queryText: probe.queryText,
        requestPurpose: probe.requestPurpose,
        sessionId: `trace-${probe.id}`,
        agentId: "model-memory-retrieval-trace",
        maxResults: 5,
      },
      interpreter: retrievalInterpreter,
      memoryObjects: rebuild.memoryObjects,
      modelId: input.modelRef,
      finalInclusionReviewer,
      finalInclusionModelId: input.modelRef,
      store: input.runtime.retrievalStore,
      createdAt: new Date(),
      projectionVersions: rebuild.projectionVersions,
    });

    if (!retrieval) {
      return {
        generatedAt: new Date().toISOString(),
        probeId: probe.id,
        queryText: probe.queryText,
        currentCorpus: true,
        modelRef: input.modelRef,
        requestTimeoutMs: input.requestTimeoutMs,
        requestSeed: input.requestSeed,
        promptPayload,
        providerTrace,
        parseValidationFailedAfterSuccessfulProviderResponse: false,
        retrieval: {
          action: "skip",
          selectedCount: 0,
          matchingKindCount: 0,
          matchingClassCount: 0,
          activeOnly: true,
          topResults: [],
        },
        context: {
          attempted: false,
          orderedSegmentCount: 0,
          estimatedInputTokens: 0,
          pruningUsed: false,
          retrievalPackIncluded: false,
          stableLayerHash: "",
          semiStableLayerHash: "",
          volatileLayerHash: "",
        },
      };
    }

    const retrievalPack = buildRetrievalPackArtifact({
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
    const persistedPack =
      await input.runtime.runtimeRepository.persistContextArtifact(retrievalPack);
    await input.runtime.retrievalStore.updatePackedArtifactId?.(
      retrieval.retrievalResultSet.id,
      persistedPack.id,
    );

    const artifacts = await input.runtime.runtimeRepository.listContextArtifacts();
    const sessionState = await input.runtime.runtimeRepository.getSessionContextState(
      `trace-${probe.id}`,
    );
    const engine = runModelMemoryContextEngine({
      sessionId: `trace-${probe.id}`,
      agentId: "model-memory-retrieval-trace",
      sessionState,
      projectionVersions: rebuild.projectionVersions,
      projectionTexts: rebuild.projectionOutputs,
      artifacts,
      recentTurns: [],
      toolResults: [],
      currentTurn: probe.currentTurn,
      maxTokens: DEFAULT_CONTEXT_MAX_TOKENS,
      provider: "openrouter",
      model: input.modelRef,
      includeRetrievalPacks: true,
    });
    await input.runtime.runtimeRepository.persistContextRun(
      engine.ledger.run,
      engine.ledger.segments,
    );

    const objectById = new Map(rebuild.memoryObjects.map((record) => [record.id, record] as const));
    const matching = countMatchingItems(
      retrieval.retrievalResultItems,
      objectById,
      probe.acceptedCanonicalClasses,
      probe.acceptedKinds,
    );

    return {
      generatedAt: new Date().toISOString(),
      probeId: probe.id,
      queryText: probe.queryText,
      currentCorpus: true,
      modelRef: input.modelRef,
      requestTimeoutMs: input.requestTimeoutMs,
      requestSeed: input.requestSeed,
      promptPayload,
      providerTrace,
      parseValidationFailedAfterSuccessfulProviderResponse: false,
      retrieval: {
        action: "retrieve",
        selectedCount: retrieval.retrievalResultItems.filter((entry) => entry.selectedForContext)
          .length,
        matchingKindCount: matching.matchingKindCount,
        matchingClassCount: matching.matchingClassCount,
        activeOnly: matching.activeOnly,
        topResults: retrieval.retrievalResultItems
          .filter((entry) => entry.selectedForContext)
          .map((entry) => {
            const object = objectById.get(entry.memoryObjectId);
            return {
              objectId: entry.memoryObjectId,
              canonicalClass: object?.canonicalClass ?? "unknown",
              kind: object?.kind ?? "unknown",
              rankBand: entry.rankBand,
              reasonCodes: entry.retrievalReasonCodes,
            };
          }),
      },
      context: {
        attempted: true,
        orderedSegmentCount: engine.assembled.orderedSegments.length,
        estimatedInputTokens: engine.ledger.run.estimatedInputTokens,
        pruningUsed: engine.assembled.pruningUsed,
        retrievalPackIncluded: engine.assembled.orderedSegments.some(
          (segment) => segment.segmentType === "retrieval_pack" && !segment.dropped,
        ),
        stableLayerHash: engine.ledger.run.stableLayerHash,
        semiStableLayerHash: engine.ledger.run.semiStableLayerHash,
        volatileLayerHash: engine.ledger.run.volatileLayerHash,
      },
    };
  } catch (error) {
    const parseValidationFailedAfterSuccessfulProviderResponse =
      error instanceof JsonModelOutputError ||
      (error instanceof ModelMemoryLiveExecutionError &&
        error.trace.failureStage !== "request_time" &&
        error.trace.responseOk);

    return {
      generatedAt: new Date().toISOString(),
      probeId: probe.id,
      queryText: probe.queryText,
      currentCorpus: true,
      modelRef: input.modelRef,
      requestTimeoutMs: input.requestTimeoutMs,
      requestSeed: input.requestSeed,
      promptPayload,
      providerTrace,
      failureStage: parseValidationFailedAfterSuccessfulProviderResponse
        ? "parse_time"
        : "request_time",
      parseValidationFailedAfterSuccessfulProviderResponse,
      errorMessage: error instanceof Error ? error.message : String(error),
      retrieval: {
        action: "failed",
        selectedCount: 0,
        matchingKindCount: 0,
        matchingClassCount: 0,
        activeOnly: false,
        topResults: [],
      },
      context: {
        attempted: false,
        orderedSegmentCount: 0,
        estimatedInputTokens: 0,
        pruningUsed: false,
        retrievalPackIncluded: false,
        stableLayerHash: "",
        semiStableLayerHash: "",
        volatileLayerHash: "",
      },
    };
  }
}

export function renderModelMemoryRetrievalTraceMarkdown(report: RetrievalTraceReport): string {
  const lines: string[] = [];
  lines.push("# Model Memory Retrieval Trace");
  lines.push("");
  lines.push(`- Probe: ${report.probeId}`);
  lines.push(`- Query: ${report.queryText}`);
  lines.push(`- Current corpus: ${report.currentCorpus}`);
  lines.push(`- Model: ${report.modelRef}`);
  lines.push(`- Timeout ms: ${report.requestTimeoutMs}`);
  lines.push(`- Seed: ${report.requestSeed ?? "none"}`);
  lines.push(`- Failure stage: ${report.failureStage ?? "none"}`);
  lines.push(
    `- Parse/validation failed after successful provider response: ${report.parseValidationFailedAfterSuccessfulProviderResponse}`,
  );
  if (report.errorMessage) {
    lines.push(`- Error: ${report.errorMessage}`);
  }
  lines.push("");
  lines.push("## Prompt");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.promptPayload, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Provider Trace");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.providerTrace ?? null, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Retrieval");
  lines.push("");
  lines.push(`- Action: ${report.retrieval.action}`);
  lines.push(`- Selected count: ${report.retrieval.selectedCount}`);
  lines.push(`- Matching kinds: ${report.retrieval.matchingKindCount}`);
  lines.push(`- Matching classes: ${report.retrieval.matchingClassCount}`);
  lines.push(`- Active-only: ${report.retrieval.activeOnly}`);
  lines.push("");
  lines.push("## Context");
  lines.push("");
  lines.push(`- Attempted: ${report.context.attempted}`);
  lines.push(`- Ordered segments: ${report.context.orderedSegmentCount}`);
  lines.push(`- Estimated tokens: ${report.context.estimatedInputTokens}`);
  lines.push(`- Pruning used: ${report.context.pruningUsed}`);
  lines.push(`- Retrieval pack included: ${report.context.retrievalPackIncluded}`);
  lines.push(`- Stable hash: ${report.context.stableLayerHash}`);
  lines.push(`- Semi-stable hash: ${report.context.semiStableLayerHash}`);
  lines.push(`- Volatile hash: ${report.context.volatileLayerHash}`);
  return lines.join("\n");
}
