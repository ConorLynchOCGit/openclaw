import { createHash } from "node:crypto";
import {
  assembleBoundedContextPack,
  type ContextPackAssemblyDecision,
} from "../../../../extensions/execution-platform/src/model-memory-runtime/context-pack-policy.ts";
import {
  decidePromptRouterMemoryPolicy,
  type PromptRouterMemoryPolicyDecision,
  type PromptRouterMemoryRouteKind,
} from "../../../../extensions/execution-platform/src/model-memory-runtime/prompt-router-memory-policy.ts";
import type { OpenClawConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import {
  buildRetrievalPackArtifact,
  executeRetrieval,
  readMemoryTraceIdFromScope,
  type ContextArtifactRecord,
} from "../../../plugin-sdk/model-memory.js";
import { buildOrdinaryTurnMemoryTraceId } from "../../../plugin-sdk/model-memory.js";
import { emitModelMemoryActivityFeedEvent } from "../../model-memory.activity-feed.js";
import {
  resolveLiveRetrievalMaxResults,
  resolveModelMemoryBootstrapOverlayEnabled,
  resolveModelMemoryLiveRuntimeStatus,
  resolveRetrievalModelRef,
  type ModelMemoryLiveRuntimeStatus,
} from "./config.js";
import {
  BOOTSTRAP_PROJECTION_TARGET_IDS,
  MODEL_MEMORY_CONTEXT_PATH_PREFIX,
  MODEL_MEMORY_RETRIEVAL_CONTEXT_PATH,
} from "./constants.js";
import {
  getLiveRuntime,
  loadRuntimeReadModels,
  type LiveRuntimeDeps,
  type LiveRuntimeReadModels,
  type ProjectionVersionRecord,
} from "./runtime-deps.js";
import { recordModelMemoryRuntimeDbOperationEvidence } from "./runtime-middleware-bridge.js";

const log = createSubsystemLogger("model-memory/live-runtime");

export type LiveRetrievalContextInput = {
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText?: string;
  memoryRouteKind?: PromptRouterMemoryRouteKind;
  contextBudgetRemainingTokens?: number;
  untrustedExternalContentPresent?: boolean;
  stateVersionMismatch?: boolean;
  workspaceDir?: string;
  maxResults?: number;
};

export type ModelMemoryBootstrapOverlay = {
  contextFiles: Array<{ path: string; content: string }>;
  projectionOutputs: Record<string, string>;
  projectionVersions: ProjectionVersionRecord[];
  memoryPolicyDecision: PromptRouterMemoryPolicyDecision;
  contextPackDecision: ContextPackAssemblyDecision;
  status: ModelMemoryLiveRuntimeStatus;
};

function normalizeRetrievalTurnText(text: string | undefined): string {
  return text?.replace(/\s+/g, " ").trim() ?? "";
}

function hashPromptForPolicy(text: string | undefined): string {
  return createHash("sha256").update(normalizeRetrievalTurnText(text), "utf8").digest("hex");
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function shouldAttemptLiveRetrievalContext(params: {
  status: ModelMemoryLiveRuntimeStatus;
  currentTurnText?: string;
  memoryPolicyDecision?: PromptRouterMemoryPolicyDecision;
}): boolean {
  const policyDecision = params.memoryPolicyDecision?.decision;
  return (
    params.status.enabled &&
    params.status.databaseConfigured &&
    params.status.includeRetrievalPacks &&
    (!policyDecision ||
      policyDecision === "bounded_chat_retrieval" ||
      policyDecision === "bounded_advanced_retrieval") &&
    normalizeRetrievalTurnText(params.currentTurnText).length > 0
  );
}

export function assembleRouteAwareBootstrapContextPack(params: {
  contextFiles: Array<{ path: string; content: string }>;
  memoryPolicyDecision: PromptRouterMemoryPolicyDecision;
  contextBudgetRemainingTokens?: number;
}): {
  contextFiles: Array<{ path: string; content: string }>;
  contextPackDecision: ContextPackAssemblyDecision;
} {
  const maxTotal = Math.max(
    0,
    Math.min(
      params.contextBudgetRemainingTokens ?? 4_000,
      params.memoryPolicyDecision.maxRetrievalPackTokens +
        params.memoryPolicyDecision.maxProjectionTokens +
        params.memoryPolicyDecision.maxCloseoutContextTokens,
    ),
  );
  const budget = {
    maxTotalTokens: maxTotal,
    maxRetrievalPackTokens: params.memoryPolicyDecision.maxRetrievalPackTokens,
    maxProjectionTokens: params.memoryPolicyDecision.maxProjectionTokens,
    maxStableMemoryTokens: Math.max(0, maxTotal),
    maxToolResultSummaryTokens: 0,
    maxCloseoutContextTokens: params.memoryPolicyDecision.maxCloseoutContextTokens,
    sessionContextRemainingTokens: params.contextBudgetRemainingTokens ?? maxTotal,
  };
  const fileByRef = new Map<string, { path: string; content: string }>();
  const segments = params.contextFiles.map((file) => {
    const ref = `bootstrap-context://${file.path}`;
    fileByRef.set(ref, file);
    return {
      segmentId: ref,
      ref,
      kind: file.path.includes("retrieval")
        ? ("retrieval_pack" as const)
        : file.path.includes("session")
          ? ("closeout_capsule" as const)
          : ("projection" as const),
      boundedSummary: `Bounded bootstrap context file ${file.path}`,
      tokenEstimate: estimateTokens(file.content),
    };
  });
  const contextPackDecision =
    params.memoryPolicyDecision.decision === "no_memory" ||
    params.memoryPolicyDecision.decision === "triage_state_facts_only" ||
    maxTotal <= 0
      ? assembleBoundedContextPack({ segments: [], budget })
      : assembleBoundedContextPack({ segments, budget });
  return {
    contextFiles: contextPackDecision.selectedRefs
      .map((ref) => fileByRef.get(ref.ref))
      .filter((file): file is { path: string; content: string } => Boolean(file)),
    contextPackDecision,
  };
}

export function buildLiveRetrievalEnvelope(params: {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText: string;
  maxResults?: number;
  traceId?: string;
}) {
  const scope: Record<string, unknown> = {
    liveContextPath: "bootstrap_context",
    retrievalScope: "live_ordinary_turn",
  };
  if (params.sessionKey) {
    scope.sessionKey = params.sessionKey;
  }
  if (params.agentId) {
    scope.agentId = params.agentId;
  }
  if (params.traceId) {
    scope.memoryTraceId = params.traceId;
  }

  return {
    queryText: normalizeRetrievalTurnText(params.currentTurnText),
    requestPurpose: "live_context_injection",
    scope,
    sessionId: params.sessionId,
    agentId: params.agentId,
    maxResults: params.maxResults ?? 8,
  };
}

function buildExtraContextFiles(params: {
  artifacts: LiveRuntimeReadModels["contextArtifacts"];
  sessionSummaryArtifactId?: string;
}): Array<{ path: string; content: string }> {
  const latestArtifactByKey = new Map<string, LiveRuntimeReadModels["contextArtifacts"][number]>();
  for (const artifact of [...params.artifacts].toSorted((left, right) => {
    const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
    if (byBuiltAt !== 0) {
      return byBuiltAt;
    }
    return right.contentHash.localeCompare(left.contentHash);
  })) {
    if (
      artifact.artifactType !== "user_memory_pack" &&
      artifact.artifactType !== "project_memory_pack" &&
      artifact.artifactType !== "procedure_memory_pack" &&
      artifact.artifactType !== "session_summary_pack"
    ) {
      continue;
    }
    if (!artifact.renderedText?.trim()) {
      continue;
    }
    const key =
      artifact.artifactType === "session_summary_pack"
        ? params.sessionSummaryArtifactId && artifact.id === params.sessionSummaryArtifactId
          ? "session_summary_pack:current"
          : artifact.id
        : `${artifact.artifactType}:${artifact.scopeKey ?? "global"}`;
    if (!latestArtifactByKey.has(key)) {
      latestArtifactByKey.set(key, artifact);
    }
  }

  return [...latestArtifactByKey.values()].map((artifact, index) => ({
    path: `${MODEL_MEMORY_CONTEXT_PATH_PREFIX}/${index + 1}-${artifact.artifactType}.md`,
    content: artifact.renderedText ?? "",
  }));
}

function retrievalContextFileFromArtifact(
  artifact: ContextArtifactRecord | undefined,
): Array<{ path: string; content: string }> {
  const content = artifact?.renderedText?.trim();
  if (!content) {
    return [];
  }
  return [
    {
      path: MODEL_MEMORY_RETRIEVAL_CONTEXT_PATH,
      content,
    },
  ];
}

async function buildLiveRetrievalContextArtifact(params: {
  runtime: LiveRuntimeDeps;
  readModels: LiveRuntimeReadModels;
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  currentTurnText: string;
  maxResults?: number;
  traceId?: string;
}): Promise<ContextArtifactRecord | undefined> {
  const envelope = buildLiveRetrievalEnvelope({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    currentTurnText: params.currentTurnText,
    maxResults: params.maxResults ?? resolveLiveRetrievalMaxResults(params.config),
    traceId: params.traceId,
  });
  if (!envelope.queryText) {
    return undefined;
  }

  const retrieval = await executeRetrieval({
    envelope,
    interpreter: params.runtime.retrievalInterpreter,
    memoryObjects: params.readModels.memoryObjects,
    modelId: resolveRetrievalModelRef(params.config),
    finalInclusionReviewer: params.runtime.retrievalFinalInclusionReviewer,
    finalInclusionModelId: resolveRetrievalModelRef(params.config),
    store: params.runtime.retrievalStore,
    createdAt: new Date(),
    projectionVersions: params.readModels.projectionVersions,
  });
  if (!retrieval) {
    return undefined;
  }

  const artifact = buildRetrievalPackArtifact({
    retrievalRequest: retrieval.retrievalRequest,
    retrievalResultSet: retrieval.retrievalResultSet,
    retrievalResultItems: retrieval.retrievalResultItems,
    memoryObjects: params.readModels.memoryObjects,
    buildPolicyVersion: "memory-retrieval-runtime.live.v1",
    retrievalPlan: retrieval.retrievalPlan,
    retrievalCandidates: retrieval.retrievalCandidates,
    retrievalExclusions: retrieval.retrievalExclusions,
    selectedProjectionDigests: retrieval.selectedProjectionDigests,
    projectionVersions: params.readModels.projectionVersions,
  });
  const persisted = await params.runtime.runtimeRepository.persistContextArtifact(artifact);
  await recordModelMemoryRuntimeDbOperationEvidence({
    operationName: "model_memory.retrieval_context_pack_write",
    operationKind: "write",
    lane: "interactive",
    boundedSummary:
      "Retrieval context pack artifact persisted through route-aware memory retrieval path.",
    params: {
      retrievalRequestId: retrieval.retrievalRequest.id,
      retrievalResultSetId: retrieval.retrievalResultSet.id,
      retrievalPackArtifactId: persisted.id,
      selectedCount: retrieval.retrievalResultItems.filter((item) => item.selectedForContext)
        .length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
    },
  }).catch(() => null);
  await params.runtime.retrievalStore.updatePackedArtifactId?.(
    retrieval.retrievalResultSet.id,
    persisted.id,
  );
  const memoryTraceId = readMemoryTraceIdFromScope(retrieval.retrievalRequest.scope);
  void emitModelMemoryActivityFeedEvent({
    kind: "retrieval",
    status: "completed",
    config: params.config,
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    stableId: memoryTraceId ?? retrieval.retrievalResultSet.id,
    safeLabels: {
      purpose: retrieval.retrievalRequest.requestPurpose,
      artifact: "retrieval_pack",
    },
    ids: {
      memoryTraceId,
      retrievalRequestId: retrieval.retrievalRequest.id,
      retrievalResultSetId: retrieval.retrievalResultSet.id,
      retrievalPackArtifactId: persisted.id,
      selectedMemoryIds: retrieval.retrievalResultItems
        .filter((item) => item.selectedForContext)
        .map((item) => item.memoryObjectId),
      projectionIds: retrieval.selectedProjectionDigests.map((digest) => digest.projectionId),
    },
    metrics: {
      candidates: retrieval.retrievalCandidates.length,
      selected: retrieval.retrievalResultItems.filter((item) => item.selectedForContext).length,
      excluded: retrieval.retrievalExclusions.length,
      projections: retrieval.selectedProjectionDigests.length,
    },
  }).catch(() => undefined);
  return persisted;
}

export function buildProjectionBootstrapContextFiles(params: {
  projectionVersions: ProjectionVersionRecord[];
  projectionOutputs: Record<string, string>;
}): Array<{ path: string; content: string }> {
  const latestProjectionByTarget = new Map<string, ProjectionVersionRecord>();
  for (const version of [...params.projectionVersions].toSorted((left, right) => {
    const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
    if (byBuiltAt !== 0) {
      return byBuiltAt;
    }
    return right.id.localeCompare(left.id);
  })) {
    if (!BOOTSTRAP_PROJECTION_TARGET_IDS.has(version.targetId)) {
      continue;
    }
    if (!latestProjectionByTarget.has(version.targetId)) {
      latestProjectionByTarget.set(version.targetId, version);
    }
  }

  return [...latestProjectionByTarget.values()]
    .toSorted((left, right) => left.targetId.localeCompare(right.targetId))
    .flatMap((version) => {
      const content = params.projectionOutputs[version.targetId]?.trim();
      if (!content) {
        return [];
      }
      return [
        {
          path: version.canonicalArtifactPath,
          content,
        },
      ];
    });
}

export async function resolveModelMemoryBootstrapOverlay(params: {
  config?: OpenClawConfig;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  currentTurnText?: string;
  memoryRouteKind?: PromptRouterMemoryRouteKind;
  contextBudgetRemainingTokens?: number;
  untrustedExternalContentPresent?: boolean;
  stateVersionMismatch?: boolean;
  traceId?: string;
}): Promise<ModelMemoryBootstrapOverlay | null> {
  if (!resolveModelMemoryBootstrapOverlayEnabled(params.config)) {
    return null;
  }
  const status = resolveModelMemoryLiveRuntimeStatus(params.config);
  if (!status.enabled || !status.databaseConfigured) {
    return null;
  }

  try {
    const memoryPolicyDecision = decidePromptRouterMemoryPolicy({
      routeKind: params.memoryRouteKind ?? "chat_send",
      promptHash: hashPromptForPolicy(params.currentTurnText),
      boundedPromptSummary: normalizeRetrievalTurnText(params.currentTurnText).slice(0, 500),
      contextBudgetRemainingTokens: params.contextBudgetRemainingTokens ?? 4_000,
      runtimeStatePresent: params.memoryRouteKind === "workflow_execution",
      untrustedExternalContentPresent: params.untrustedExternalContentPresent,
      stateVersionMismatch: params.stateVersionMismatch,
    });
    if (memoryPolicyDecision.decision === "runtime_context_refs_only") {
      const routeAwarePack = assembleRouteAwareBootstrapContextPack({
        contextFiles: [],
        memoryPolicyDecision,
        contextBudgetRemainingTokens: params.contextBudgetRemainingTokens,
      });
      return {
        contextFiles: [],
        projectionOutputs: {},
        projectionVersions: [],
        memoryPolicyDecision,
        contextPackDecision: routeAwarePack.contextPackDecision,
        status,
      };
    }
    const runtime = await getLiveRuntime(params.config);
    const readModels = await loadRuntimeReadModels({
      config: params.config,
      sessionId: params.sessionId,
      workspaceDir: params.workspaceDir,
    });
    let retrievalArtifact: ContextArtifactRecord | undefined;
    const memoryTraceId =
      params.currentTurnText && params.currentTurnText.trim().length > 0
        ? (params.traceId ??
          buildOrdinaryTurnMemoryTraceId({
            sessionId: params.sessionId,
            sessionKey: params.sessionKey,
            agentId: params.agentId,
            currentTurnText: params.currentTurnText,
          }))
        : undefined;
    if (
      shouldAttemptLiveRetrievalContext({
        status,
        currentTurnText: params.currentTurnText,
        memoryPolicyDecision,
      })
    ) {
      void emitModelMemoryActivityFeedEvent({
        kind: "retrieval",
        status: "started",
        eventType: "retrieval_started",
        config: params.config,
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        stableId: memoryTraceId ?? params.sessionId ?? params.sessionKey,
        safeLabels: {
          purpose: "live_context_injection",
        },
        ids: {
          memoryTraceId,
        },
      }).catch(() => undefined);
      try {
        retrievalArtifact = await buildLiveRetrievalContextArtifact({
          runtime,
          readModels,
          config: params.config,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          currentTurnText: params.currentTurnText!,
          traceId: memoryTraceId,
        });
      } catch (error) {
        log.warn(`model-memory live retrieval context unavailable: ${String(error)}`);
        void emitModelMemoryActivityFeedEvent({
          kind: "retrieval",
          status: "failed",
          eventType: "retrieval_unavailable",
          config: params.config,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          stableId: memoryTraceId ?? params.sessionId ?? params.sessionKey,
          safeLabels: {
            purpose: "live_context_injection",
            reason: "retrieval_unavailable",
          },
          ids: {
            memoryTraceId,
          },
        }).catch(() => undefined);
      }
    }

    const unboundedCompatibilityFiles = [
      ...buildProjectionBootstrapContextFiles({
        projectionVersions: readModels.projectionVersions,
        projectionOutputs: readModels.projectionOutputs,
      }),
      ...retrievalContextFileFromArtifact(retrievalArtifact),
      ...buildExtraContextFiles({
        artifacts: readModels.contextArtifacts,
        sessionSummaryArtifactId: readModels.sessionState?.sessionSummaryArtifactId,
      }),
    ];
    const routeAwarePack = assembleRouteAwareBootstrapContextPack({
      contextFiles: unboundedCompatibilityFiles,
      memoryPolicyDecision,
      contextBudgetRemainingTokens: params.contextBudgetRemainingTokens,
    });

    return {
      contextFiles: routeAwarePack.contextFiles,
      projectionOutputs: readModels.projectionOutputs,
      projectionVersions: readModels.projectionVersions,
      memoryPolicyDecision,
      contextPackDecision: routeAwarePack.contextPackDecision,
      status,
    };
  } catch (error) {
    log.warn(`model-memory bootstrap overlay unavailable: ${String(error)}`);
    return null;
  }
}
