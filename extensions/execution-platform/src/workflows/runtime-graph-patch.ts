import type { JsonValue, RuntimeJobArtifact } from "../runtime-job-repository.ts";

export const RUNTIME_GRAPH_PATCH_ARTIFACT_TYPE = "execution_platform.runtime_graph_patch";

export type RuntimeGraphPatchBody = {
  artifactKind: "execution_platform_runtime_graph_patch";
  schemaVersion: "execution-platform.runtime-graph-patch.v1";
  patchId: string;
  runtimeJobId: string;
  workflowId: string | null;
  graphId: string;
  schedulerIteration: number | null;
  superstepId: string | null;
  patchKind: string;
  stage: string;
  status: string;
  nodeId: string | null;
  roleId: string | null;
  affectedNodeIds: string[];
  affectedBranchIds: string[];
  nodeAdds: JsonValue[];
  edgeAdds: JsonValue[];
  nodeUpdates: JsonValue[];
  readinessUpdates: JsonValue[];
  workQueueChildRefs: string[];
  evidenceRefs: string[];
  reasonCodes: string[];
  progressDetail: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type RuntimeGraphPatchManifestSummary = {
  graphPatchRef: string;
  graphPatchPayloadRef: string | null;
  graphPatchSha256: string | null;
  graphPatchByteCount: number | null;
  graphPatchKind: string;
  graphPatchNodeCount: number;
  graphPatchEdgeCount: number;
  graphPatchNodeUpdateCount: number;
  graphPatchReadinessUpdateCount: number;
  graphPatchAffectedNodeIds: string[];
  graphPatchAffectedBranchIds: string[];
  graphPatchReasonCodes: string[];
};

function bounded(value: unknown, max = 260): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function boundedStrings(values: unknown, maxItems = 24, maxChars = 260): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => bounded(value, maxChars))
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, maxItems);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES = 48 * 1024;

function collectStrings(
  value: unknown,
  keys: Set<string>,
  output: Set<string>,
  maxItems: number,
): void {
  if (output.size >= maxItems || value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) {
      collectStrings(item, keys, output, maxItems);
      if (output.size >= maxItems) {
        return;
      }
    }
    return;
  }
  const object = record(value);
  if (!object) {
    return;
  }
  for (const [key, child] of Object.entries(object)) {
    if (keys.has(key)) {
      const item = bounded(child, 260);
      if (item) {
        output.add(item);
      }
    }
    collectStrings(child, keys, output, maxItems);
    if (output.size >= maxItems) {
      return;
    }
  }
}

function summarizeCollection(value: unknown, maxItems: number): JsonValue {
  if (!Array.isArray(value)) {
    return null;
  }
  return {
    count: value.length,
    sample: value.slice(0, maxItems).map((item) => compactJson(item, 3, maxItems)),
    truncated: value.length > maxItems,
  };
}

function compactJson(value: unknown, depth = 4, maxArrayItems = 8): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return bounded(value, 900);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((item) => compactJson(item, depth - 1, maxArrayItems));
  }
  if (depth <= 0) {
    const object = record(value);
    return object
      ? {
          objectKeyCount: Object.keys(object).length,
          jsonByteCount: jsonBytes(value),
          compacted: true,
        }
      : null;
  }
  const object = record(value);
  if (!object) {
    return null;
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    if (Array.isArray(child) && child.length > maxArrayItems) {
      output[key] = summarizeCollection(child, maxArrayItems);
    } else {
      output[key] = compactJson(child, depth - 1, maxArrayItems);
    }
  }
  return output;
}

function compactSchedulerFrontierStateForManifest(value: unknown): JsonValue {
  const frontier = record(value);
  if (!frontier) {
    return null;
  }
  return {
    currentSuperstep:
      typeof frontier.currentSuperstep === "number" ? Math.trunc(frontier.currentSuperstep) : null,
    nextLegalTransition: bounded(frontier.nextLegalTransition, 180),
    selectedExecutableNodeIds: boundedStrings(frontier.selectedExecutableNodeIds, 24),
    blockedFrontierNodeIds: boundedStrings(frontier.blockedFrontierNodeIds, 24),
    executableReadyNodeIds: boundedStrings(frontier.executableReadyNodeIds, 24),
    aggregateBlockedNodeIds: boundedStrings(frontier.aggregateBlockedNodeIds, 24),
    dependencyBlockedNodeIds: boundedStrings(frontier.dependencyBlockedNodeIds, 24),
    contextBlockedNodeIds: boundedStrings(frontier.contextBlockedNodeIds, 24),
    resourceBlockedNodeIds: boundedStrings(frontier.resourceBlockedNodeIds, 24),
    readinessRefs: boundedStrings(frontier.readinessRefs, 24),
    resourceRefs: boundedStrings(frontier.resourceRefs, 24),
    contextRefs: boundedStrings(frontier.contextRefs, 24),
    openCommitmentIds: boundedStrings(frontier.openCommitmentIds, 24),
    graphNodeCount: Array.isArray(frontier.graphNodes) ? frontier.graphNodes.length : null,
    graphEdgeCount: Array.isArray(frontier.graphEdges) ? frontier.graphEdges.length : null,
    reasonCodes: boundedStrings(frontier.reasonCodes, 24, 160),
    compactedForManifest: true,
  };
}

function compactBranchResultForManifest(value: unknown): JsonValue {
  const branch = record(value);
  if (!branch) {
    return null;
  }
  return {
    branchId: bounded(branch.branchId, 260),
    nodeId: bounded(branch.nodeId, 260),
    nodeKind: bounded(branch.nodeKind, 160),
    status: bounded(branch.status, 120),
    capabilityId: bounded(branch.capabilityId, 160),
    failureClass: bounded(branch.failureClass, 160),
    nextTransition: bounded(branch.nextTransition, 180),
    nodeLifecycleProjectionRef: bounded(branch.nodeLifecycleProjectionRef, 320),
    blockerSummary: bounded(branch.blockerSummary, 180),
    errorPath: bounded(branch.errorPath, 180),
    errorSummary: bounded(branch.errorSummary, 180),
    evidenceRefs: boundedStrings(branch.evidenceRefs, 3, 220),
    targetCommitmentIds: boundedStrings(branch.targetCommitmentIds, 6, 160),
    reasonCodes: boundedStrings(branch.reasonCodes, 6, 140),
  };
}

function compactParallelFrontierForManifest(value: unknown): JsonValue {
  const frontier = record(value);
  if (!frontier) {
    return null;
  }
  const branchResults = Array.isArray(frontier.branchResults) ? frontier.branchResults : [];
  const dependencyLayers = Array.isArray(frontier.dependencyLayers)
    ? frontier.dependencyLayers
    : [];
  const conflictDomains = Array.isArray(frontier.conflictDomains) ? frontier.conflictDomains : [];
  const branchScopedFrontierStates = Array.isArray(frontier.branchScopedFrontierStates)
    ? frontier.branchScopedFrontierStates
    : [];
  return {
    artifactKind: bounded(frontier.artifactKind, 160),
    schemaVersion: bounded(frontier.schemaVersion, 160),
    currentSuperstep:
      typeof frontier.currentSuperstep === "number" ? Math.trunc(frontier.currentSuperstep) : null,
    maxParallelNodeExecutions:
      typeof frontier.maxParallelNodeExecutions === "number"
        ? Math.trunc(frontier.maxParallelNodeExecutions)
        : null,
    dependencyLayerCount:
      typeof frontier.dependencyLayerCount === "number"
        ? Math.trunc(frontier.dependencyLayerCount)
        : dependencyLayers.length,
    dependencyLayers: dependencyLayers.slice(0, 4).map((layer) => {
      const layerRecord = record(layer);
      return layerRecord
        ? {
            layerId: bounded(layerRecord.layerId, 160),
            nodeIds: boundedStrings(layerRecord.nodeIds, 12, 180),
            reasonCodes: boundedStrings(layerRecord.reasonCodes, 6, 140),
          }
        : null;
    }),
    readyNodeIds: boundedStrings(frontier.readyNodeIds, 24),
    selectedNodeIds: boundedStrings(frontier.selectedNodeIds, 24),
    rawRunnableNodeIds: boundedStrings(frontier.rawRunnableNodeIds, 24),
    completedNodeIds: boundedStrings(frontier.completedNodeIds, 24),
    needsReviewNodeIds: boundedStrings(frontier.needsReviewNodeIds, 24),
    failedNodeIds: boundedStrings(frontier.failedNodeIds, 24),
    blockedNodeIds: boundedStrings(frontier.blockedNodeIds, 24),
    runningNodeIds: boundedStrings(frontier.runningNodeIds, 24),
    waitingForHumanNodeIds: boundedStrings(frontier.waitingForHumanNodeIds, 24),
    joinReadyNodeIds: boundedStrings(frontier.joinReadyNodeIds, 24),
    skippedReasonCodes: boundedStrings(frontier.skippedReasonCodes, 24, 140),
    providerConcurrencyBudgetCount: Array.isArray(frontier.providerConcurrencyBudgets)
      ? frontier.providerConcurrencyBudgets.length
      : null,
    conflictDomainCount: conflictDomains.length,
    conflictDomains: conflictDomains.slice(0, 6).map((domain) => compactJson(domain, 2, 3)),
    branchResultCount: branchResults.length,
    branchResults: branchResults.slice(0, 8).map(compactBranchResultForManifest),
    branchScopedFrontierStateCount: branchScopedFrontierStates.length,
    branchScopedFrontierStates: compactBranchScopedFrontierStatesForManifest(
      branchScopedFrontierStates,
    ),
    compactedForManifest: true,
  };
}

function compactBranchScopedFrontierStatesForManifest(value: unknown): JsonValue {
  if (!Array.isArray(value)) {
    return [];
  }
  return {
    count: value.length,
    states: value.slice(0, 12).map((item) => {
      const state = record(item);
      if (!state) {
        return null;
      }
      return {
        branchId: bounded(state.branchId, 180),
        nodeId: bounded(state.nodeId, 180),
        nodeKind: bounded(state.nodeKind, 120),
        capabilityId: bounded(state.capabilityId, 120),
        status: bounded(state.status, 120),
        failureClass: bounded(state.failureClass, 140),
        blocker: bounded(state.blockerSummary, 180),
        nextLegalTransition: bounded(state.nextLegalTransition, 140),
        readinessRef: bounded(state.readinessRef, 220),
        sourceMaterialRef: bounded(state.sourceMaterialRef, 220),
        sourceMaterialRequirementRefCount: Array.isArray(state.sourceMaterialRequirementRefs)
          ? state.sourceMaterialRequirementRefs.length
          : null,
        sourceMaterialRequirementRefs: boundedStrings(state.sourceMaterialRequirementRefs, 2, 220),
        consumerNodeIds: boundedStrings(state.consumerNodeIds, 3, 180),
        dependentConsumerNodeIds: boundedStrings(state.dependentConsumerNodeIds, 3, 180),
        successfulEvidenceRefCount: Array.isArray(state.successfulEvidenceRefs)
          ? state.successfulEvidenceRefs.length
          : null,
        successfulEvidenceRefs: boundedStrings(state.successfulEvidenceRefs, 2, 220),
        failedEvidenceRefCount: Array.isArray(state.failedEvidenceRefs)
          ? state.failedEvidenceRefs.length
          : null,
        failedEvidenceRefs: boundedStrings(state.failedEvidenceRefs, 2, 220),
        repairNodeRefs: boundedStrings(state.repairNodeRefs, 2, 220),
        diagnosticOnlyNodeRefs: boundedStrings(state.diagnosticOnlyNodeRefs, 2, 220),
        missingFields: boundedStrings(state.missingFields, 6, 140),
        reasonCodes: boundedStrings(state.reasonCodes, 6, 140),
      };
    }),
    truncated: value.length > 12,
    compactedForManifest: true,
  };
}

function pruneManifestValue(value: JsonValue): JsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => pruneManifestValue(item))
      .filter((item): item is JsonValue => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const output: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const pruned = pruneManifestValue(child as JsonValue);
      if (pruned !== undefined) {
        output[key] = pruned;
      }
    }
    return Object.keys(output).length > 0 ? output : undefined;
  }
  if (typeof value === "string" && value.length === 0) {
    return undefined;
  }
  return value;
}

function compactSchedulerProgressManifest(
  value: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    const pruned = pruneManifestValue(child);
    if (pruned !== undefined) {
      output[key] = pruned;
    }
  }
  return fitSchedulerProgressManifestBudget(output);
}

function countFromRecord(value: unknown, field = "count"): number | null {
  const object = record(value);
  const count = object?.[field];
  return typeof count === "number" ? Math.trunc(count) : null;
}

function compactFrontierManifestSummary(value: unknown): JsonValue {
  const frontier = record(value);
  if (!frontier) {
    return null;
  }
  return {
    compactedForManifestBudget: true,
    currentSuperstep:
      typeof frontier.currentSuperstep === "number" ? Math.trunc(frontier.currentSuperstep) : null,
    nextLegalTransition: bounded(frontier.nextLegalTransition, 120),
    selectedNodeCount: Array.isArray(frontier.selectedNodeIds)
      ? frontier.selectedNodeIds.length
      : Array.isArray(frontier.selectedExecutableNodeIds)
        ? frontier.selectedExecutableNodeIds.length
        : null,
    blockedNodeCount: Array.isArray(frontier.blockedNodeIds)
      ? frontier.blockedNodeIds.length
      : Array.isArray(frontier.blockedFrontierNodeIds)
        ? frontier.blockedFrontierNodeIds.length
        : null,
    completedNodeCount: Array.isArray(frontier.completedNodeIds)
      ? frontier.completedNodeIds.length
      : null,
    needsReviewNodeCount: Array.isArray(frontier.needsReviewNodeIds)
      ? frontier.needsReviewNodeIds.length
      : null,
    branchResultCount:
      typeof frontier.branchResultCount === "number"
        ? Math.trunc(frontier.branchResultCount)
        : Array.isArray(frontier.branchResults)
          ? frontier.branchResults.length
          : null,
    branchScopedFrontierStateCount:
      typeof frontier.branchScopedFrontierStateCount === "number"
        ? Math.trunc(frontier.branchScopedFrontierStateCount)
        : countFromRecord(frontier.branchScopedFrontierStates),
    readyNodeIds: boundedStrings(frontier.readyNodeIds, 8, 160),
    selectedNodeIds: boundedStrings(
      Array.isArray(frontier.selectedNodeIds)
        ? frontier.selectedNodeIds
        : frontier.selectedExecutableNodeIds,
      8,
      160,
    ),
    blockedNodeIds: boundedStrings(
      Array.isArray(frontier.blockedNodeIds)
        ? frontier.blockedNodeIds
        : frontier.blockedFrontierNodeIds,
      8,
      160,
    ),
    reasonCodes: boundedStrings(frontier.reasonCodes, 8, 120),
  };
}

function compactBranchScopedFrontierBudgetSummary(value: unknown): JsonValue {
  const branch = record(value);
  if (!branch) {
    return null;
  }
  return {
    count:
      typeof branch.count === "number"
        ? Math.trunc(branch.count)
        : Array.isArray(value)
          ? value.length
          : null,
    stateSample: Array.isArray(branch.states)
      ? branch.states.slice(0, 3).map((item) => {
          const state = record(item);
          return state
            ? {
                nodeId: bounded(state.nodeId, 140),
                branchId: bounded(state.branchId, 140),
                status: bounded(state.status, 100),
                capabilityId: bounded(state.capabilityId, 100),
                nextLegalTransition: bounded(state.nextLegalTransition, 100),
                reasonCodes: boundedStrings(state.reasonCodes, 3, 100),
              }
            : null;
        })
      : [],
    truncated: true,
    compactedForManifest: true,
    compactedForManifestBudget: true,
  };
}

function fitSchedulerProgressManifestBudget(
  metadata: Record<string, JsonValue>,
): Record<string, JsonValue> {
  if (jsonBytes(metadata) <= SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES) {
    return metadata;
  }
  const output: Record<string, JsonValue> = {
    ...metadata,
    schedulerProgressManifestCompaction: {
      state: "compacted_to_fit_byte_budget",
      originalByteCount: jsonBytes(metadata),
      targetByteCount: SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES,
      graphPatchPayloadRef: metadata.graphPatchPayloadRef ?? null,
    },
  };
  if (output.parallelFrontier !== undefined) {
    output.parallelFrontier = compactFrontierManifestSummary(output.parallelFrontier);
  }
  if (output.schedulerFrontierState !== undefined) {
    output.schedulerFrontierState = compactFrontierManifestSummary(output.schedulerFrontierState);
  }
  if (output.branchScopedFrontierStates !== undefined) {
    output.branchScopedFrontierStates = compactBranchScopedFrontierBudgetSummary(
      output.branchScopedFrontierStates,
    );
  }
  if (jsonBytes(output) <= SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES) {
    return output;
  }
  for (const key of [
    "modelTaskTelemetry",
    "modelTaskClassification",
    "schedulerModelCallEnvelope",
    "modelProviderDiagnostics",
    "modelRetryEvidence",
    "packetAuthorFanout",
    "missionLedgerCanonicalCommitments",
    "expansionAdmissionDecision",
    "frontierRootCauseArtifact",
  ]) {
    if (output[key] !== undefined) {
      output[key] = {
        compactedForManifestBudget: true,
        omittedFromManifest: true,
        graphPatchPayloadRef: output.graphPatchPayloadRef ?? null,
      };
    }
    if (jsonBytes(output) <= SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES) {
      return output;
    }
  }
  for (const key of [
    "targetRefs",
    "inputHandoffRefs",
    "contextSnapshotRefs",
    "sourceMaterialRequirementRefs",
    "contextBrokerRequestRefs",
    "verifiedContextFileRefs",
    "candidateConcreteFileRefs",
    "targetFileSnapshotRefs",
    "workerInternalInputPacketRefs",
    "graphPatchAffectedNodeIds",
    "graphPatchAffectedBranchIds",
    "graphPatchReasonCodes",
  ]) {
    if (Array.isArray(output[key])) {
      output[key] = boundedStrings(output[key], 6, 160);
    }
    if (jsonBytes(output) <= SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES) {
      return output;
    }
  }
  return compactSchedulerProgressManifestToMinimum(output);
}

function compactSchedulerProgressManifestToMinimum(
  metadata: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return {
    artifactKind: "agent_team_scheduler_progress",
    schemaVersion: "execution-platform.scheduler-progress-manifest.v1",
    graphId: metadata.graphId ?? null,
    runtimeJobId: metadata.runtimeJobId ?? null,
    teamRunId: metadata.teamRunId ?? null,
    executionSpanRef: metadata.executionSpanRef ?? null,
    stage: metadata.stage ?? null,
    status: metadata.status ?? null,
    roleId: metadata.roleId ?? null,
    nodeId: metadata.nodeId ?? null,
    currentPhase: metadata.currentPhase ?? null,
    schedulerPhase: metadata.schedulerPhase ?? null,
    schedulerToolId: metadata.schedulerToolId ?? null,
    activeNodeKind: metadata.activeNodeKind ?? null,
    capabilityId: metadata.capabilityId ?? null,
    modelRef: metadata.modelRef ?? null,
    providerPath: metadata.providerPath ?? null,
    currentObjective: bounded(metadata.currentObjective, 220),
    blockerSummary: bounded(metadata.blockerSummary, 220),
    eli5Progress: bounded(metadata.eli5Progress, 220),
    nextDecisionNeeded: metadata.nextDecisionNeeded ?? null,
    reasonCodes: boundedStrings(metadata.reasonCodes, 12, 140),
    artifactRefs: boundedStrings(metadata.artifactRefs, 6, 180),
    schedulerToolInvocationRefs: boundedStrings(metadata.schedulerToolInvocationRefs, 6, 180),
    evidenceProducedRefs: boundedStrings(metadata.evidenceProducedRefs, 6, 180),
    branchScopedFrontierStates: compactBranchScopedFrontierBudgetSummary(
      metadata.branchScopedFrontierStates,
    ),
    parallelFrontier: compactFrontierManifestSummary(metadata.parallelFrontier),
    schedulerFrontierState: compactFrontierManifestSummary(metadata.schedulerFrontierState),
    schedulerProgressManifestCompaction: {
      state: "minimum_manifest_after_byte_budget_pressure",
      originalByteCount: jsonBytes(metadata),
      targetByteCount: SCHEDULER_PROGRESS_MANIFEST_TARGET_BYTES,
      graphPatchPayloadRef: metadata.graphPatchPayloadRef ?? null,
    },
    graphPatchStoredInPayload: true,
    graphPatchRef: metadata.graphPatchRef ?? null,
    graphPatchPayloadRef: metadata.graphPatchPayloadRef ?? null,
    graphPatchSha256: metadata.graphPatchSha256 ?? null,
    graphPatchByteCount: metadata.graphPatchByteCount ?? null,
    graphPatchKind: metadata.graphPatchKind ?? null,
    graphPatchNodeCount: metadata.graphPatchNodeCount ?? null,
    graphPatchEdgeCount: metadata.graphPatchEdgeCount ?? null,
    graphPatchNodeUpdateCount: metadata.graphPatchNodeUpdateCount ?? null,
    graphPatchReadinessUpdateCount: metadata.graphPatchReadinessUpdateCount ?? null,
    graphPatchAffectedNodeIds: boundedStrings(metadata.graphPatchAffectedNodeIds, 8, 160),
    graphPatchAffectedBranchIds: boundedStrings(metadata.graphPatchAffectedBranchIds, 8, 160),
    graphPatchReasonCodes: boundedStrings(metadata.graphPatchReasonCodes, 8, 140),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function buildRuntimeGraphPatchBody(input: {
  patchId: string;
  runtimeJobId: string;
  workflowId?: string | null;
  graphId: string;
  schedulerIteration?: number | null;
  superstepId?: string | null;
  patchKind: string;
  stage: string;
  status: string;
  nodeId?: string | null;
  roleId?: string | null;
  progressMetadata: Record<string, JsonValue>;
}): RuntimeGraphPatchBody {
  const nodeIds = new Set<string>();
  const branchIds = new Set<string>();
  collectStrings(input.progressMetadata, new Set(["nodeId", "targetNodeId"]), nodeIds, 80);
  collectStrings(input.progressMetadata, new Set(["branchId"]), branchIds, 80);

  const graphNodes = record(input.progressMetadata.schedulerFrontierState)?.graphNodes;
  const graphEdges = record(input.progressMetadata.schedulerFrontierState)?.graphEdges;
  const branchResults = record(input.progressMetadata.parallelFrontier)?.branchResults;
  const readinessUpdates = Array.isArray(branchResults)
    ? branchResults.map((branch) => compactJson(branch, 3, 8))
    : [];

  return {
    artifactKind: "execution_platform_runtime_graph_patch",
    schemaVersion: "execution-platform.runtime-graph-patch.v1",
    patchId: input.patchId,
    runtimeJobId: input.runtimeJobId,
    workflowId: input.workflowId ?? null,
    graphId: input.graphId,
    schedulerIteration: input.schedulerIteration ?? null,
    superstepId: input.superstepId ?? null,
    patchKind: input.patchKind,
    stage: input.stage,
    status: input.status,
    nodeId: input.nodeId ?? null,
    roleId: input.roleId ?? null,
    affectedNodeIds: [...nodeIds].slice(0, 80),
    affectedBranchIds: [...branchIds].slice(0, 80),
    nodeAdds: Array.isArray(graphNodes)
      ? graphNodes.map((node) => compactJson(node, 3, 8)).slice(0, 200)
      : [],
    edgeAdds: Array.isArray(graphEdges)
      ? graphEdges.map((edge) => compactJson(edge, 3, 8)).slice(0, 300)
      : [],
    nodeUpdates: [],
    readinessUpdates,
    workQueueChildRefs: boundedStrings(input.progressMetadata.workQueueChildRefs, 80),
    evidenceRefs: boundedStrings(input.progressMetadata.evidenceProducedRefs, 80),
    reasonCodes: boundedStrings(input.progressMetadata.reasonCodes, 120, 200),
    progressDetail: compactJson(input.progressMetadata, 5, 16),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function summarizeRuntimeGraphPatchArtifact(input: {
  artifact: RuntimeJobArtifact;
  body: RuntimeGraphPatchBody;
}): RuntimeGraphPatchManifestSummary {
  const metadata = record(input.artifact.metadata);
  return {
    graphPatchRef: input.artifact.uri,
    graphPatchPayloadRef: bounded(metadata?.payloadRef, 600),
    graphPatchSha256:
      typeof input.artifact.sha256 === "string"
        ? input.artifact.sha256
        : bounded(metadata?.sha256, 120),
    graphPatchByteCount:
      typeof input.artifact.sizeBytes === "number"
        ? input.artifact.sizeBytes
        : typeof metadata?.byteCount === "number"
          ? metadata.byteCount
          : null,
    graphPatchKind: input.body.patchKind,
    graphPatchNodeCount: input.body.nodeAdds.length,
    graphPatchEdgeCount: input.body.edgeAdds.length,
    graphPatchNodeUpdateCount: input.body.nodeUpdates.length,
    graphPatchReadinessUpdateCount: input.body.readinessUpdates.length,
    graphPatchAffectedNodeIds: input.body.affectedNodeIds.slice(0, 24),
    graphPatchAffectedBranchIds: input.body.affectedBranchIds.slice(0, 24),
    graphPatchReasonCodes: input.body.reasonCodes.slice(0, 24),
  };
}

export function compactSchedulerProgressForManifest(
  metadata: Record<string, JsonValue>,
  graphPatchSummary: RuntimeGraphPatchManifestSummary,
): Record<string, JsonValue> {
  return compactSchedulerProgressManifest({
    artifactKind: "agent_team_scheduler_progress",
    schemaVersion: "execution-platform.scheduler-progress-manifest.v1",
    graphId: metadata.graphId ?? null,
    runtimeJobId: metadata.runtimeJobId ?? null,
    teamRunId: metadata.teamRunId ?? null,
    executionSpanRef: metadata.executionSpanRef ?? null,
    stage: metadata.stage ?? null,
    status: metadata.status ?? null,
    roleId: metadata.roleId ?? null,
    nodeId: metadata.nodeId ?? null,
    activeNodeKind: metadata.activeNodeKind ?? null,
    currentPhase: metadata.currentPhase ?? null,
    schedulerPhase: metadata.schedulerPhase ?? null,
    schedulerToolId: metadata.schedulerToolId ?? null,
    latestToolEventKind: metadata.latestToolEventKind ?? null,
    currentObjective: metadata.currentObjective ?? null,
    whyThisNodeWasChosen: metadata.whyThisNodeWasChosen ?? null,
    blockerSummary: metadata.blockerSummary ?? null,
    eli5Progress: metadata.eli5Progress ?? null,
    nextDecisionNeeded: metadata.nextDecisionNeeded ?? null,
    modelRef: metadata.modelRef ?? null,
    providerPath: metadata.providerPath ?? null,
    modelTaskClass: metadata.modelTaskClass ?? null,
    modelTaskPolicyRef: metadata.modelTaskPolicyRef ?? null,
    reasoningMode: metadata.reasoningMode ?? null,
    parserMode: metadata.parserMode ?? null,
    modelCallSpanId: metadata.modelCallSpanId ?? null,
    modelCallPhase: metadata.modelCallPhase ?? null,
    modelCallSpanInputHash: metadata.modelCallSpanInputHash ?? null,
    modelCallSpanResponseHash: metadata.modelCallSpanResponseHash ?? null,
    modelCallSpanElapsedMs: metadata.modelCallSpanElapsedMs ?? null,
    modelCallSpanTimeoutMs: metadata.modelCallSpanTimeoutMs ?? null,
    modelCallSpanHeartbeatCount: metadata.modelCallSpanHeartbeatCount ?? null,
    modelTaskClassification: compactJson(metadata.modelTaskClassification, 3, 6),
    modelTaskTelemetry: compactJson(metadata.modelTaskTelemetry, 3, 6),
    modelRetryEvidence: compactJson(metadata.modelRetryEvidence, 3, 6),
    modelProviderDiagnostics: compactJson(metadata.modelProviderDiagnostics, 3, 6),
    schedulerModelCallEnvelope: compactJson(metadata.schedulerModelCallEnvelope, 3, 6),
    modelCallSpanResponseShapeSummary: compactJson(
      metadata.modelCallSpanResponseShapeSummary,
      3,
      6,
    ),
    capabilityId: metadata.capabilityId ?? null,
    selectedCapabilityId: metadata.selectedCapabilityId ?? null,
    selectedProviderCapabilityProfileId: metadata.selectedProviderCapabilityProfileId ?? null,
    workerRef: metadata.workerRef ?? null,
    capabilityRoleClass: metadata.capabilityRoleClass ?? null,
    capabilityCostClass: metadata.capabilityCostClass ?? null,
    capabilityLatencyClass: metadata.capabilityLatencyClass ?? null,
    capabilityContextCapacity: metadata.capabilityContextCapacity ?? null,
    providerProfileProductionSelectable: metadata.providerProfileProductionSelectable ?? null,
    providerProfileRequiresQualification: metadata.providerProfileRequiresQualification ?? null,
    selectedModelQualificationProfileId: metadata.selectedModelQualificationProfileId ?? null,
    qualificationEvidenceRefs: boundedStrings(metadata.qualificationEvidenceRefs, 12),
    consideredCapabilityIds: boundedStrings(metadata.consideredCapabilityIds, 12),
    consideredProviderCapabilityProfileIds: boundedStrings(
      metadata.consideredProviderCapabilityProfileIds,
      12,
    ),
    capabilityUtilityRationale: metadata.capabilityUtilityRationale ?? null,
    capabilityCostRationale: metadata.capabilityCostRationale ?? null,
    whyCheaperOptionsWereInsufficient: metadata.whyCheaperOptionsWereInsufficient ?? null,
    artifactRefs: boundedStrings(metadata.artifactRefs, 12),
    targetRefs: boundedStrings(metadata.targetRefs, 12),
    inputHandoffRefs: boundedStrings(metadata.inputHandoffRefs, 12),
    changedFileRefs: boundedStrings(metadata.changedFileRefs, 20),
    validationRefs: boundedStrings(metadata.validationRefs, 20),
    reviewArtifactRefs: boundedStrings(metadata.reviewArtifactRefs, 20),
    evidenceProducedRefs: boundedStrings(metadata.evidenceProducedRefs, 12),
    evidenceClaimRefs: boundedStrings(metadata.evidenceClaimRefs, 20),
    reasonCodes: boundedStrings(metadata.reasonCodes, 40, 200),
    contextRequestRefs: boundedStrings(metadata.contextRequestRefs, 20),
    sourceMaterialRequirementRefs: boundedStrings(metadata.sourceMaterialRequirementRefs, 20),
    sourceMaterialRequirementStatuses: compactJson(
      metadata.sourceMaterialRequirementStatuses,
      3,
      6,
    ),
    sourceMaterialRequirementReasonCodes: boundedStrings(
      metadata.sourceMaterialRequirementReasonCodes,
      40,
    ),
    contextBrokerRequestRefs: boundedStrings(metadata.contextBrokerRequestRefs, 20),
    contextBrokerStatuses: compactJson(metadata.contextBrokerStatuses, 3, 6),
    contextBrokerDedupeKeys: boundedStrings(metadata.contextBrokerDedupeKeys, 20),
    contextBrokerConsumerNodeIds: boundedStrings(metadata.contextBrokerConsumerNodeIds, 20),
    contextBrokerReasonCodes: boundedStrings(metadata.contextBrokerReasonCodes, 40),
    contextBrokerNextTransition: metadata.contextBrokerNextTransition ?? null,
    contextSnapshotRefs: boundedStrings(metadata.contextSnapshotRefs, 40),
    staleContextSnapshotRefs: boundedStrings(metadata.staleContextSnapshotRefs, 40),
    missingContextSnapshotRefs: boundedStrings(metadata.missingContextSnapshotRefs, 40),
    rejectedContextSnapshotRefs: boundedStrings(metadata.rejectedContextSnapshotRefs, 40),
    contextFreshnessStatus: metadata.contextFreshnessStatus ?? null,
    contextRefreshAction: metadata.contextRefreshAction ?? null,
    contextFreshnessSummary: metadata.contextFreshnessSummary ?? null,
    verifiedContextFileRefs: boundedStrings(metadata.verifiedContextFileRefs, 30),
    contextQualityState: metadata.contextQualityState ?? null,
    openContextBlockers: boundedStrings(metadata.openContextBlockers, 12),
    resolvedTargetFileRefs: boundedStrings(metadata.resolvedTargetFileRefs, 40),
    readableTargetFileRefs: boundedStrings(metadata.readableTargetFileRefs, 40),
    missingTargetRefs: boundedStrings(metadata.missingTargetRefs, 40),
    unreadableTargetRefs: boundedStrings(metadata.unreadableTargetRefs, 40),
    directoryOnlyTargetRefs: boundedStrings(metadata.directoryOnlyTargetRefs, 30),
    candidateConcreteFileRefs: boundedStrings(metadata.candidateConcreteFileRefs, 50),
    targetFileSnapshotRefs: boundedStrings(metadata.targetFileSnapshotRefs, 40),
    targetFileSnapshotHashes: boundedStrings(metadata.targetFileSnapshotHashes, 40),
    implementationContextRepairAction: metadata.implementationContextRepairAction ?? null,
    nodeExecutionContractRef: metadata.nodeExecutionContractRef ?? null,
    nodeExecutionContractVersion: metadata.nodeExecutionContractVersion ?? null,
    nodeExecutionContractHash: metadata.nodeExecutionContractHash ?? null,
    sourceMaterialKind: metadata.sourceMaterialKind ?? null,
    sourceMaterialRef: metadata.sourceMaterialRef ?? null,
    resourceReadinessReasonCodes: boundedStrings(metadata.resourceReadinessReasonCodes, 40),
    resourceBlockingLimitations: boundedStrings(metadata.resourceBlockingLimitations, 20),
    resourceNonblockingLimitations: boundedStrings(metadata.resourceNonblockingLimitations, 20),
    workerInternalInputPacketRefs: boundedStrings(metadata.workerInternalInputPacketRefs, 20),
    workerInternalContextRefs: boundedStrings(metadata.workerInternalContextRefs, 30),
    workerInternalToolStatus: metadata.workerInternalToolStatus ?? null,
    workerInternalOutputHash: metadata.workerInternalOutputHash ?? null,
    workerInternalOutputContentLength: metadata.workerInternalOutputContentLength ?? null,
    workerInternalProviderLatencyMs: metadata.workerInternalProviderLatencyMs ?? null,
    workerInternalProviderTimeoutMs: metadata.workerInternalProviderTimeoutMs ?? null,
    workerInternalProviderFinishReason: metadata.workerInternalProviderFinishReason ?? null,
    workerInternalProviderTokenCount: metadata.workerInternalProviderTokenCount ?? null,
    workerInternalCompoundToolId: metadata.workerInternalCompoundToolId ?? null,
    workerInternalCompoundSubEventCount: metadata.workerInternalCompoundSubEventCount ?? null,
    workerInternalCompoundSubEventPhases: boundedStrings(
      metadata.workerInternalCompoundSubEventPhases,
      20,
    ),
    validationState: metadata.validationState ?? null,
    validationQaToolInvocationRefs: boundedStrings(metadata.validationQaToolInvocationRefs, 30),
    validationTaskPacketRefs: boundedStrings(metadata.validationTaskPacketRefs, 20),
    validationPlanRefs: boundedStrings(metadata.validationPlanRefs, 20),
    validationCommandRefs: boundedStrings(metadata.validationCommandRefs, 20),
    validationCommandSummaries: compactJson(metadata.validationCommandSummaries, 3, 6),
    currentValidationCommandRef: metadata.currentValidationCommandRef ?? null,
    currentValidationCommandSummary: metadata.currentValidationCommandSummary ?? null,
    currentValidationCommandStatus: metadata.currentValidationCommandStatus ?? null,
    validationResultRefs: boundedStrings(metadata.validationResultRefs, 20),
    validationFailureRefs: boundedStrings(metadata.validationFailureRefs, 20),
    validationRepairPlanRefs: boundedStrings(metadata.validationRepairPlanRefs, 20),
    validationRepairNodeRefs: boundedStrings(metadata.validationRepairNodeRefs, 20),
    validationRepairHandoffRefs: boundedStrings(metadata.validationRepairHandoffRefs, 20),
    validationCoverageReviewRefs: boundedStrings(metadata.validationCoverageReviewRefs, 20),
    validationQaReviewRefs: boundedStrings(metadata.validationQaReviewRefs, 20),
    validationQaEvidencePacketRefs: boundedStrings(metadata.validationQaEvidencePacketRefs, 20),
    validationBlockingCommitmentIds: boundedStrings(metadata.validationBlockingCommitmentIds, 20),
    validationQaLatestSummary: metadata.validationQaLatestSummary ?? null,
    closeoutFinalizationState: metadata.closeoutFinalizationState ?? null,
    closeoutFinalizationEvidencePacketRefs: boundedStrings(
      metadata.closeoutFinalizationEvidencePacketRefs,
      20,
    ),
    closeoutFinalizationHandoffRefs: boundedStrings(metadata.closeoutFinalizationHandoffRefs, 20),
    closeoutFinalizationToolInvocationRefs: boundedStrings(
      metadata.closeoutFinalizationToolInvocationRefs,
      30,
    ),
    closeoutFinalizationAcceptRefs: boundedStrings(metadata.closeoutFinalizationAcceptRefs, 20),
    closeoutFinalizationRejectRefs: boundedStrings(metadata.closeoutFinalizationRejectRefs, 20),
    closeoutFinalizationMissingReasonCodes: boundedStrings(
      metadata.closeoutFinalizationMissingReasonCodes,
      30,
    ),
    closeoutFinalizationRecommendedNextAction:
      metadata.closeoutFinalizationRecommendedNextAction ?? null,
    parallelFrontier: compactParallelFrontierForManifest(metadata.parallelFrontier),
    schedulerFrontierState: compactSchedulerFrontierStateForManifest(
      metadata.schedulerFrontierState,
    ),
    branchScopedFrontierStates: compactBranchScopedFrontierStatesForManifest(
      metadata.branchScopedFrontierStates,
    ),
    noProgressSignature: compactJson(metadata.noProgressSignature, 3, 6),
    frontierRootCauseArtifact: compactJson(metadata.frontierRootCauseArtifact, 3, 6),
    expansionAdmissionDecision: compactJson(metadata.expansionAdmissionDecision, 3, 6),
    packetAuthorFanout: compactJson(metadata.packetAuthorFanout, 3, 6),
    missionLedgerCanonicalCommitments: compactJson(
      metadata.missionLedgerCanonicalCommitments,
      3,
      6,
    ),
    recordedAt: metadata.recordedAt ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
    graphPatchStoredInPayload: true,
    ...graphPatchSummary,
  } as Record<string, JsonValue>);
}
