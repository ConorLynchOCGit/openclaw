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
    selectedExecutableNodeIds: boundedStrings(frontier.selectedExecutableNodeIds, 40),
    blockedFrontierNodeIds: boundedStrings(frontier.blockedFrontierNodeIds, 40),
    executableReadyNodeIds: boundedStrings(frontier.executableReadyNodeIds, 40),
    aggregateBlockedNodeIds: boundedStrings(frontier.aggregateBlockedNodeIds, 40),
    dependencyBlockedNodeIds: boundedStrings(frontier.dependencyBlockedNodeIds, 40),
    contextBlockedNodeIds: boundedStrings(frontier.contextBlockedNodeIds, 40),
    resourceBlockedNodeIds: boundedStrings(frontier.resourceBlockedNodeIds, 40),
    readinessRefs: boundedStrings(frontier.readinessRefs, 40),
    resourceRefs: boundedStrings(frontier.resourceRefs, 40),
    contextRefs: boundedStrings(frontier.contextRefs, 40),
    openCommitmentIds: boundedStrings(frontier.openCommitmentIds, 40),
    graphNodeCount: Array.isArray(frontier.graphNodes) ? frontier.graphNodes.length : null,
    graphEdgeCount: Array.isArray(frontier.graphEdges) ? frontier.graphEdges.length : null,
    reasonCodes: boundedStrings(frontier.reasonCodes, 40, 200),
    compactedForManifest: true,
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
  return {
    ...metadata,
    parallelFrontier: compactJson(metadata.parallelFrontier, 3, 8),
    schedulerFrontierState: compactSchedulerFrontierStateForManifest(
      metadata.schedulerFrontierState,
    ),
    modelTaskClassification: compactJson(metadata.modelTaskClassification, 3, 6),
    modelTaskTelemetry: compactJson(metadata.modelTaskTelemetry, 3, 6),
    modelRetryEvidence: compactJson(metadata.modelRetryEvidence, 3, 6),
    modelProviderDiagnostics: compactJson(metadata.modelProviderDiagnostics, 3, 6),
    packetAuthorFanout: compactJson(metadata.packetAuthorFanout, 3, 6),
    missionLedgerCanonicalCommitments: compactJson(
      metadata.missionLedgerCanonicalCommitments,
      3,
      6,
    ),
    graphPatchStoredInPayload: true,
    ...graphPatchSummary,
  };
}
