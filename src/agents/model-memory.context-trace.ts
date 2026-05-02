import type { OpenClawConfig } from "../config/config.ts";
import {
  buildRetrievalPackArtifact,
  executeRetrieval,
  ExecutorBackedRetrievalFinalInclusionReviewer,
  ExecutorBackedRetrievalRequestInterpreter,
  rebuildDerivedRuntimeState,
  runModelMemoryContextEngine,
  type ContextArtifactRecord,
  type ModelMemoryObjectRecord,
  type RetrievalResultItemRecord,
  type WorkspaceProjectionVersionRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import { OpenAICompatibleLiveJsonExecutor } from "./model-memory.live-json-executor.ts";
import { RETRIEVAL_PROBES, type RetrievalProbeSpec } from "./model-memory.proof-phase.ts";

const DEFAULT_CONTEXT_MAX_TOKENS = 1400;

export type ContextTraceSegmentReport = {
  order: number;
  layer: "stable" | "semi_stable" | "volatile";
  segmentType: string;
  sourceKind: string;
  includeReason: string;
  estimatedTokens: number;
  dropped: boolean;
  trimmed: boolean;
  trimReason?: string;
  projectionTargetId?: string;
  projectionVersionId?: string;
  sourceArtifactId?: string;
  sourceArtifactType?: string;
  sourceArtifactScopeKey?: string;
  textPreview: string;
};

export type ModelMemoryContextTraceReport = {
  generatedAt: string;
  probeId: string;
  queryText: string;
  currentCorpus: true;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  sessionId: string;
  retrieval: {
    action: "retrieve" | "skip";
    selectedCount: number;
    topResults: Array<{
      objectId: string;
      canonicalClass: string;
      kind: string;
      rankBand: string;
      reasonCodes: string[];
    }>;
  };
  context: {
    orderedSegmentCount: number;
    estimatedInputTokens: number;
    pruningUsed: boolean;
    stableLayerHash: string;
    semiStableLayerHash: string;
    volatileLayerHash: string;
    segments: ContextTraceSegmentReport[];
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

function previewText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 137)}...`;
}

function buildIncludeReason(input: {
  segmentType: string;
  projection?: WorkspaceProjectionVersionRecord;
  artifact?: ContextArtifactRecord;
}): string {
  if (input.projection) {
    return `projection:${input.projection.targetId}`;
  }
  if (input.artifact) {
    return `artifact:${input.artifact.artifactType}${input.artifact.scopeKey ? `:${input.artifact.scopeKey}` : ""}`;
  }
  if (input.segmentType === "recent_turns") {
    return "current_turn_with_recent_history";
  }
  if (input.segmentType === "tool_results") {
    return "tool_result_context";
  }
  return input.segmentType;
}

function countMatchingItems(
  items: RetrievalResultItemRecord[],
  objectById: Map<string, ModelMemoryObjectRecord>,
): Array<{
  objectId: string;
  canonicalClass: string;
  kind: string;
  rankBand: string;
  reasonCodes: string[];
}> {
  return items
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
    });
}

export async function runModelMemoryContextTrace(input: {
  runtime: ModelMemoryDatabaseRuntime;
  config: OpenClawConfig;
  probeId: string;
  modelRef: string;
  requestTimeoutMs: number;
  requestSeed?: number;
  sessionSuffix?: string;
}): Promise<ModelMemoryContextTraceReport> {
  const probe = probeById(input.probeId);
  const sessionId = `context-trace-${probe.id}-${input.sessionSuffix ?? "primary"}`;
  const executor = new OpenAICompatibleLiveJsonExecutor({
    config: input.config,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
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
  const retrieval = await executeRetrieval({
    envelope: {
      queryText: probe.queryText,
      requestPurpose: probe.requestPurpose,
      sessionId,
      agentId: "model-memory-context-trace",
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
      sessionId,
      retrieval: {
        action: "skip",
        selectedCount: 0,
        topResults: [],
      },
      context: {
        orderedSegmentCount: 0,
        estimatedInputTokens: 0,
        pruningUsed: false,
        stableLayerHash: "",
        semiStableLayerHash: "",
        volatileLayerHash: "",
        segments: [],
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
  const persistedPack = await input.runtime.runtimeRepository.persistContextArtifact(retrievalPack);
  await input.runtime.retrievalStore.updatePackedArtifactId?.(
    retrieval.retrievalResultSet.id,
    persistedPack.id,
  );

  const artifacts = await input.runtime.runtimeRepository.listContextArtifacts();
  const sessionState = await input.runtime.runtimeRepository.getSessionContextState(sessionId);
  const engine = runModelMemoryContextEngine({
    sessionId,
    agentId: "model-memory-context-trace",
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
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact] as const));
  const projectionByVersionId = new Map(
    rebuild.projectionVersions.map((version) => [version.id, version] as const),
  );

  const segments: ContextTraceSegmentReport[] = engine.assembled.orderedSegments.map(
    (segment, index) => {
      const artifact = segment.sourceArtifactId
        ? artifactById.get(segment.sourceArtifactId)
        : undefined;
      const projection = segment.projectionVersionId
        ? projectionByVersionId.get(segment.projectionVersionId)
        : undefined;
      return {
        order: index,
        layer: segment.priority,
        segmentType: segment.segmentType,
        sourceKind: segment.sourceKind,
        includeReason: buildIncludeReason({
          segmentType: segment.segmentType,
          projection,
          artifact,
        }),
        estimatedTokens: segment.estimatedTokens,
        dropped: segment.dropped,
        trimmed: segment.trimmed,
        trimReason: segment.trimReason,
        projectionTargetId: projection?.targetId,
        projectionVersionId: segment.projectionVersionId,
        sourceArtifactId: segment.sourceArtifactId,
        sourceArtifactType: artifact?.artifactType,
        sourceArtifactScopeKey: artifact?.scopeKey,
        textPreview: previewText(segment.text),
      };
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    probeId: probe.id,
    queryText: probe.queryText,
    currentCorpus: true,
    modelRef: input.modelRef,
    requestTimeoutMs: input.requestTimeoutMs,
    requestSeed: input.requestSeed,
    sessionId,
    retrieval: {
      action: "retrieve",
      selectedCount: retrieval.retrievalResultItems.filter((entry) => entry.selectedForContext)
        .length,
      topResults: countMatchingItems(retrieval.retrievalResultItems, objectById),
    },
    context: {
      orderedSegmentCount: engine.assembled.orderedSegments.length,
      estimatedInputTokens: engine.ledger.run.estimatedInputTokens,
      pruningUsed: engine.assembled.pruningUsed,
      stableLayerHash: engine.ledger.run.stableLayerHash,
      semiStableLayerHash: engine.ledger.run.semiStableLayerHash,
      volatileLayerHash: engine.ledger.run.volatileLayerHash,
      segments,
    },
  };
}

export function renderModelMemoryContextTraceMarkdown(
  report: ModelMemoryContextTraceReport,
): string {
  const lines = [
    "# Model Memory Context Trace",
    "",
    `- Probe: ${report.probeId}`,
    `- Query: ${report.queryText}`,
    `- Model: ${report.modelRef}`,
    `- Session: ${report.sessionId}`,
    `- Retrieval action: ${report.retrieval.action}`,
    `- Selected results: ${report.retrieval.selectedCount}`,
    `- Ordered segments: ${report.context.orderedSegmentCount}`,
    `- Estimated input tokens: ${report.context.estimatedInputTokens}`,
    `- Pruning used: ${report.context.pruningUsed}`,
    `- Stable hash: ${report.context.stableLayerHash}`,
    `- Semi-stable hash: ${report.context.semiStableLayerHash}`,
    `- Volatile hash: ${report.context.volatileLayerHash}`,
    "",
    "## Top Results",
    "",
  ];

  if (report.retrieval.topResults.length === 0) {
    lines.push("- none");
  } else {
    for (const result of report.retrieval.topResults) {
      lines.push(
        `- ${result.objectId}: ${result.canonicalClass}/${result.kind} ${result.rankBand} reasons=${result.reasonCodes.join(",")}`,
      );
    }
  }

  lines.push("", "## Segments", "");
  lines.push(
    "| Order | Layer | Type | Reason | Tokens | Dropped | Artifact | Projection | Preview |",
  );
  lines.push("| --- | --- | --- | --- | ---: | --- | --- | --- | --- |");
  for (const segment of report.context.segments) {
    lines.push(
      `| ${segment.order} | ${segment.layer} | ${segment.segmentType} | ${segment.includeReason} | ${segment.estimatedTokens} | ${segment.dropped ? `yes (${segment.trimReason ?? "trim_budget"})` : "no"} | ${segment.sourceArtifactId ?? ""} | ${segment.projectionTargetId ?? ""} | ${segment.textPreview.replace(/\|/g, "\\|")} |`,
    );
  }

  return lines.join("\n");
}
