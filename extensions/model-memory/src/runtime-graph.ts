import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { sha256JsonValue } from "./hashing.ts";
import type { DurableMemoryRecord, ExistingMemorySummary, MemoryEvent } from "./mmv2/contracts.ts";
import {
  SourceAuthorityMetadataSchema,
  type SourceAuthorityTier,
  type SourceProfileId,
} from "./source-authority.ts";

export const RUNTIME_GRAPH_SCHEMA_VERSION = "runtime_graph.v1" as const;

export type RuntimeGraphNodeType =
  | "memory_object"
  | "subject"
  | "document"
  | "project"
  | "reference_source"
  | "runtime_artifact";

export type RuntimeGraphEdgeType =
  | "mentions"
  | "supports"
  | "derived_from"
  | "belongs_to_project"
  | "parent_of"
  | "child_of"
  | "supersedes"
  | "contradicts"
  | "references";

export type RuntimeGraphEdgeAuthorityTier =
  | "authoritative_structural"
  | "derived_structural"
  | "probationary_inferred"
  | "promoted_inferred"
  | "blocked_or_decayed";

export type RuntimeGraphVisibility = "normal" | "conflict_only" | "inspection_only";

export type RuntimeGraphMemoryStatus =
  | "active"
  | "inactive"
  | "superseded"
  | "conflicted"
  | "quarantined"
  | "deleted"
  | "stale";

export type RuntimeGraphSourceRef = {
  sourceId: string;
  segmentId?: string;
  sourceType?: string;
  sourceIngestEventId?: string;
  contentHash?: string;
};

export type RuntimeGraphMemoryInput = {
  memoryId: string;
  status: RuntimeGraphMemoryStatus;
  unitType: "atomic" | "composite" | string;
  kind: string | null;
  artifactType: string | null;
  canonicalText: string;
  searchText: string;
  scope: Record<string, unknown>;
  payload: Record<string, unknown>;
  validity: {
    valid_at?: string | null;
    invalid_at?: string | null;
    temporal_status?: string | null;
  };
  sourceRefs: RuntimeGraphSourceRef[];
  lineage?: {
    derivedFromMemoryIds?: string[];
    supersedesMemoryIds?: string[];
    supersededByMemoryId?: string | null;
    conflictsWithMemoryIds?: string[];
    parentMemoryId?: string | null;
    childMemoryIds?: string[];
  };
  sourceAuthorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  sourceEventIds?: string[];
  sourceEdgeIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type RuntimeGraphNode = {
  nodeId: string;
  schemaVersion: typeof RUNTIME_GRAPH_SCHEMA_VERSION;
  nodeType: RuntimeGraphNodeType;
  displayKey: string;
  projectId?: string;
  scopeKey?: string;
  kind?: string | null;
  artifactType?: string | null;
  sourceMemoryIds: string[];
  sourceRefs: RuntimeGraphSourceRef[];
  authorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  visibility: RuntimeGraphVisibility;
  lifecycleState: RuntimeGraphMemoryStatus;
  validAt?: string | null;
  invalidAt?: string | null;
  derivationHash: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeGraphEdge = {
  edgeId: string;
  schemaVersion: typeof RUNTIME_GRAPH_SCHEMA_VERSION;
  edgeType: RuntimeGraphEdgeType;
  fromNodeId: string;
  toNodeId: string;
  strength: number;
  edgeAuthorityTier: RuntimeGraphEdgeAuthorityTier;
  sourceAuthorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  sourceMemoryIds: string[];
  sourceEventIds: string[];
  sourceEdgeIds: string[];
  provenanceRefs: RuntimeGraphSourceRef[];
  derivedFromRule: string;
  promotionState: "structural" | "read_time_only";
  ttlExpiresAt?: string;
  visibility: RuntimeGraphVisibility;
  validAt?: string | null;
  invalidAt?: string | null;
  derivationHash: string;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeGraphBuildError = {
  code:
    | "missing_source_memory_id"
    | "missing_edge_endpoint"
    | "excluded_source_authority"
    | "excluded_memory_status"
    | "stale_memory";
  memoryId?: string;
  targetMemoryId?: string;
  detail: string;
};

export type RuntimeGraphBuildResult = {
  schemaVersion: typeof RUNTIME_GRAPH_SCHEMA_VERSION;
  nodes: RuntimeGraphNode[];
  edges: RuntimeGraphEdge[];
  excludedMemoryIds: Array<{
    memoryId: string;
    reason: RuntimeGraphBuildError["code"];
  }>;
  errors: RuntimeGraphBuildError[];
  inputHash: string;
  outputHash: string;
  builtAt: string;
};

export type RuntimeGraphDirtyTarget = {
  targetType: "runtime_graph";
  targetId: string;
  memoryIds: string[];
  reason: "memory_event" | "source_ref" | "explicit_memory";
};

export type RuntimeGraphBuildOptions = {
  now?: Date;
  includeConflictOnly?: boolean;
  includeInspectionOnly?: boolean;
};

function stableId(namespace: string, value: unknown): string {
  return buildDeterministicUuid(namespace, JSON.stringify(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function scopeKey(scope: Record<string, unknown>): string | undefined {
  const entries = Object.entries(scope)
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .toSorted(([left], [right]) => left.localeCompare(right));
  return entries.length > 0 ? sha256JsonValue(entries) : undefined;
}

function projectId(scope: Record<string, unknown>): string | undefined {
  return readString(scope.project_id) ?? readString(scope.projectId);
}

function isStaleMemory(memory: RuntimeGraphMemoryInput, now: Date): boolean {
  if (memory.status === "stale") {
    return true;
  }
  const invalidAt = memory.validity.invalid_at;
  return typeof invalidAt === "string" && Date.parse(invalidAt) <= now.getTime();
}

function memoryVisibility(memory: RuntimeGraphMemoryInput): RuntimeGraphVisibility {
  if (memory.sourceAuthorityTier === "inspection_only") {
    return "inspection_only";
  }
  if (memory.status === "conflicted") {
    return "conflict_only";
  }
  return "normal";
}

function memoryNodeId(memoryId: string): string {
  return stableId("runtime-graph-node:memory", { memoryId });
}

function sourceNodeId(sourceRef: RuntimeGraphSourceRef): string {
  return stableId("runtime-graph-node:source", {
    sourceId: sourceRef.sourceId,
    segmentId: sourceRef.segmentId,
  });
}

function edgeId(input: {
  edgeType: RuntimeGraphEdgeType;
  fromNodeId: string;
  toNodeId: string;
  sourceMemoryIds: string[];
  derivedFromRule: string;
}): string {
  return stableId("runtime-graph-edge", input);
}

function deriveNodeHash(node: Omit<RuntimeGraphNode, "derivationHash">): string {
  return sha256JsonValue({
    nodeType: node.nodeType,
    displayKey: node.displayKey,
    projectId: node.projectId,
    scopeKey: node.scopeKey,
    kind: node.kind,
    artifactType: node.artifactType,
    sourceMemoryIds: node.sourceMemoryIds,
    sourceRefs: node.sourceRefs,
    authorityTier: node.authorityTier,
    sourceProfileId: node.sourceProfileId,
    visibility: node.visibility,
    lifecycleState: node.lifecycleState,
    validAt: node.validAt,
    invalidAt: node.invalidAt,
  });
}

function deriveEdgeHash(edge: Omit<RuntimeGraphEdge, "derivationHash">): string {
  return sha256JsonValue({
    edgeType: edge.edgeType,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    strength: edge.strength,
    edgeAuthorityTier: edge.edgeAuthorityTier,
    sourceAuthorityTier: edge.sourceAuthorityTier,
    sourceProfileId: edge.sourceProfileId,
    sourceMemoryIds: edge.sourceMemoryIds,
    sourceEventIds: edge.sourceEventIds,
    sourceEdgeIds: edge.sourceEdgeIds,
    provenanceRefs: edge.provenanceRefs,
    derivedFromRule: edge.derivedFromRule,
    promotionState: edge.promotionState,
    ttlExpiresAt: edge.ttlExpiresAt,
    visibility: edge.visibility,
    validAt: edge.validAt,
    invalidAt: edge.invalidAt,
  });
}

function buildMemoryNode(memory: RuntimeGraphMemoryInput): RuntimeGraphNode {
  const nodeWithoutHash: Omit<RuntimeGraphNode, "derivationHash"> = {
    nodeId: memoryNodeId(memory.memoryId),
    schemaVersion: RUNTIME_GRAPH_SCHEMA_VERSION,
    nodeType: "memory_object",
    displayKey: memory.memoryId,
    projectId: projectId(memory.scope),
    scopeKey: scopeKey(memory.scope),
    kind: memory.kind,
    artifactType: memory.artifactType,
    sourceMemoryIds: [memory.memoryId],
    sourceRefs: memory.sourceRefs,
    authorityTier: memory.sourceAuthorityTier,
    sourceProfileId: memory.sourceProfileId,
    visibility: memoryVisibility(memory),
    lifecycleState: memory.status,
    validAt: memory.validity.valid_at,
    invalidAt: memory.validity.invalid_at,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
  return {
    ...nodeWithoutHash,
    derivationHash: deriveNodeHash(nodeWithoutHash),
  };
}

function buildSourceNode(
  memory: RuntimeGraphMemoryInput,
  sourceRef: RuntimeGraphSourceRef,
): RuntimeGraphNode {
  const nodeWithoutHash: Omit<RuntimeGraphNode, "derivationHash"> = {
    nodeId: sourceNodeId(sourceRef),
    schemaVersion: RUNTIME_GRAPH_SCHEMA_VERSION,
    nodeType: "reference_source",
    displayKey: sourceRef.segmentId
      ? `${sourceRef.sourceId}:${sourceRef.segmentId}`
      : sourceRef.sourceId,
    projectId: projectId(memory.scope),
    scopeKey: scopeKey(memory.scope),
    sourceMemoryIds: [memory.memoryId],
    sourceRefs: [sourceRef],
    authorityTier: memory.sourceAuthorityTier,
    sourceProfileId: memory.sourceProfileId,
    visibility: memoryVisibility(memory),
    lifecycleState: memory.status,
    validAt: memory.validity.valid_at,
    invalidAt: memory.validity.invalid_at,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  };
  return {
    ...nodeWithoutHash,
    derivationHash: deriveNodeHash(nodeWithoutHash),
  };
}

function buildStructuralEdge(input: {
  edgeType: RuntimeGraphEdgeType;
  fromNodeId: string;
  toNodeId: string;
  memory: RuntimeGraphMemoryInput;
  derivedFromRule: string;
  edgeAuthorityTier?: RuntimeGraphEdgeAuthorityTier;
  sourceEdgeIds?: string[];
}): RuntimeGraphEdge {
  const sourceMemoryIds = [input.memory.memoryId];
  const edgeWithoutHash: Omit<RuntimeGraphEdge, "edgeId" | "derivationHash"> = {
    schemaVersion: RUNTIME_GRAPH_SCHEMA_VERSION,
    edgeType: input.edgeType,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    strength: input.edgeAuthorityTier === "probationary_inferred" ? 0.25 : 1,
    edgeAuthorityTier: input.edgeAuthorityTier ?? "authoritative_structural",
    sourceAuthorityTier: input.memory.sourceAuthorityTier,
    sourceProfileId: input.memory.sourceProfileId,
    sourceMemoryIds,
    sourceEventIds: input.memory.sourceEventIds ?? [],
    sourceEdgeIds: input.sourceEdgeIds ?? input.memory.sourceEdgeIds ?? [],
    provenanceRefs: input.memory.sourceRefs,
    derivedFromRule: input.derivedFromRule,
    promotionState:
      input.edgeAuthorityTier === "probationary_inferred" ? "read_time_only" : "structural",
    visibility: memoryVisibility(input.memory),
    validAt: input.memory.validity.valid_at,
    invalidAt: input.memory.validity.invalid_at,
    createdAt: input.memory.createdAt,
    updatedAt: input.memory.updatedAt,
  };
  const fullEdge = {
    edgeId: edgeId({
      edgeType: edgeWithoutHash.edgeType,
      fromNodeId: edgeWithoutHash.fromNodeId,
      toNodeId: edgeWithoutHash.toNodeId,
      sourceMemoryIds,
      derivedFromRule: edgeWithoutHash.derivedFromRule,
    }),
    ...edgeWithoutHash,
  };
  return {
    ...fullEdge,
    derivationHash: deriveEdgeHash(fullEdge),
  };
}

function maybeAddNode(nodes: Map<string, RuntimeGraphNode>, node: RuntimeGraphNode): void {
  if (!nodes.has(node.nodeId)) {
    nodes.set(node.nodeId, node);
  }
}

function maybeAddEdge(edges: Map<string, RuntimeGraphEdge>, edge: RuntimeGraphEdge): void {
  if (!edges.has(edge.edgeId)) {
    edges.set(edge.edgeId, edge);
  }
}

function includeMemory(
  memory: RuntimeGraphMemoryInput,
  options: Required<
    Pick<RuntimeGraphBuildOptions, "includeConflictOnly" | "includeInspectionOnly">
  > &
    Pick<RuntimeGraphBuildOptions, "now">,
): RuntimeGraphBuildError | undefined {
  if (!memory.memoryId) {
    return {
      code: "missing_source_memory_id",
      detail: "Graph memory input is missing memoryId.",
    };
  }
  if (memory.sourceAuthorityTier === "inspection_only" && !options.includeInspectionOnly) {
    return {
      code: "excluded_source_authority",
      memoryId: memory.memoryId,
      detail: "inspection_only sources are excluded from normal graph output.",
    };
  }
  if (isStaleMemory(memory, options.now ?? new Date())) {
    return {
      code: "stale_memory",
      memoryId: memory.memoryId,
      detail: "Stale memories are excluded from normal graph output.",
    };
  }
  if (
    memory.status === "inactive" ||
    memory.status === "superseded" ||
    memory.status === "quarantined" ||
    memory.status === "deleted"
  ) {
    return {
      code: "excluded_memory_status",
      memoryId: memory.memoryId,
      detail: `${memory.status} memories are excluded from normal graph output.`,
    };
  }
  if (memory.status === "conflicted" && !options.includeConflictOnly) {
    return {
      code: "excluded_memory_status",
      memoryId: memory.memoryId,
      detail: "conflicted memories are excluded unless conflict-only graph output is requested.",
    };
  }
  return undefined;
}

function addLineageEdge(input: {
  edges: Map<string, RuntimeGraphEdge>;
  errors: RuntimeGraphBuildError[];
  memoriesById: Map<string, RuntimeGraphMemoryInput>;
  memory: RuntimeGraphMemoryInput;
  targetMemoryId: string;
  edgeType: RuntimeGraphEdgeType;
  derivedFromRule: string;
}): void {
  const target = input.memoriesById.get(input.targetMemoryId);
  if (!target) {
    input.errors.push({
      code: "missing_edge_endpoint",
      memoryId: input.memory.memoryId,
      targetMemoryId: input.targetMemoryId,
      detail: "Graph lineage edge target memory is not present in the included graph input.",
    });
    return;
  }
  maybeAddEdge(
    input.edges,
    buildStructuralEdge({
      edgeType: input.edgeType,
      fromNodeId: memoryNodeId(input.memory.memoryId),
      toNodeId: memoryNodeId(target.memoryId),
      memory: input.memory,
      derivedFromRule: input.derivedFromRule,
    }),
  );
}

export function buildRuntimeGraph(
  memories: RuntimeGraphMemoryInput[],
  options: RuntimeGraphBuildOptions = {},
): RuntimeGraphBuildResult {
  const buildOptions = {
    includeConflictOnly: options.includeConflictOnly ?? false,
    includeInspectionOnly: options.includeInspectionOnly ?? false,
    now: options.now ?? new Date(),
  };
  const errors: RuntimeGraphBuildError[] = [];
  const excludedMemoryIds: RuntimeGraphBuildResult["excludedMemoryIds"] = [];
  const includedMemories: RuntimeGraphMemoryInput[] = [];

  for (const memory of memories.toSorted((left, right) =>
    left.memoryId.localeCompare(right.memoryId),
  )) {
    const exclusion = includeMemory(memory, buildOptions);
    if (exclusion) {
      errors.push(exclusion);
      excludedMemoryIds.push({
        memoryId: memory.memoryId || "missing",
        reason: exclusion.code,
      });
      continue;
    }
    includedMemories.push(memory);
  }

  const memoriesById = new Map(includedMemories.map((memory) => [memory.memoryId, memory]));
  const nodes = new Map<string, RuntimeGraphNode>();
  const edges = new Map<string, RuntimeGraphEdge>();

  for (const memory of includedMemories) {
    const memoryNode = buildMemoryNode(memory);
    maybeAddNode(nodes, memoryNode);

    for (const sourceRef of memory.sourceRefs) {
      if (!sourceRef.sourceId) {
        errors.push({
          code: "missing_edge_endpoint",
          memoryId: memory.memoryId,
          detail: "Graph source reference is missing sourceId.",
        });
        continue;
      }
      const sourceNode = buildSourceNode(memory, sourceRef);
      maybeAddNode(nodes, sourceNode);
      maybeAddEdge(
        edges,
        buildStructuralEdge({
          edgeType: "references",
          fromNodeId: memoryNode.nodeId,
          toNodeId: sourceNode.nodeId,
          memory,
          derivedFromRule: "source_ref",
        }),
      );
    }

    for (const targetMemoryId of memory.lineage?.derivedFromMemoryIds ?? []) {
      addLineageEdge({
        edges,
        errors,
        memoriesById,
        memory,
        targetMemoryId,
        edgeType: "derived_from",
        derivedFromRule: "lineage.derived_from_memory_ids",
      });
    }
    for (const targetMemoryId of memory.lineage?.supersedesMemoryIds ?? []) {
      addLineageEdge({
        edges,
        errors,
        memoriesById,
        memory,
        targetMemoryId,
        edgeType: "supersedes",
        derivedFromRule: "lineage.supersedes_memory_ids",
      });
    }
    for (const targetMemoryId of memory.lineage?.conflictsWithMemoryIds ?? []) {
      addLineageEdge({
        edges,
        errors,
        memoriesById,
        memory,
        targetMemoryId,
        edgeType: "contradicts",
        derivedFromRule: "lineage.conflicts_with_memory_ids",
      });
    }
    if (memory.lineage?.parentMemoryId) {
      addLineageEdge({
        edges,
        errors,
        memoriesById,
        memory,
        targetMemoryId: memory.lineage.parentMemoryId,
        edgeType: "child_of",
        derivedFromRule: "lineage.parent_memory_id",
      });
    }
    for (const targetMemoryId of memory.lineage?.childMemoryIds ?? []) {
      addLineageEdge({
        edges,
        errors,
        memoriesById,
        memory,
        targetMemoryId,
        edgeType: "parent_of",
        derivedFromRule: "lineage.child_memory_ids",
      });
    }
  }

  const nodeList = [...nodes.values()].toSorted((left, right) =>
    left.nodeId.localeCompare(right.nodeId),
  );
  const edgeList = [...edges.values()].toSorted((left, right) =>
    left.edgeId.localeCompare(right.edgeId),
  );
  const outputHash = sha256JsonValue({ nodes: nodeList, edges: edgeList, errors });
  return {
    schemaVersion: RUNTIME_GRAPH_SCHEMA_VERSION,
    nodes: nodeList,
    edges: edgeList,
    excludedMemoryIds,
    errors,
    inputHash: sha256JsonValue(memories),
    outputHash,
    builtAt: buildOptions.now.toISOString(),
  };
}

export function createReadTimeProbationaryEdge(input: {
  edgeType: RuntimeGraphEdgeType;
  fromNodeId: string;
  toNodeId: string;
  sourceMemoryIds: string[];
  sourceAuthorityTier?: SourceAuthorityTier;
  sourceProfileId?: SourceProfileId;
  provenanceRefs?: RuntimeGraphSourceRef[];
  ttlExpiresAt: string;
  now?: Date;
}): RuntimeGraphEdge {
  const now = (input.now ?? new Date()).toISOString();
  const edgeWithoutHash: Omit<RuntimeGraphEdge, "edgeId" | "derivationHash"> = {
    schemaVersion: RUNTIME_GRAPH_SCHEMA_VERSION,
    edgeType: input.edgeType,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    strength: 0.25,
    edgeAuthorityTier: "probationary_inferred",
    sourceAuthorityTier: input.sourceAuthorityTier,
    sourceProfileId: input.sourceProfileId,
    sourceMemoryIds: [...input.sourceMemoryIds],
    sourceEventIds: [],
    sourceEdgeIds: [],
    provenanceRefs: input.provenanceRefs ?? [],
    derivedFromRule: "read_time_probationary_inference",
    promotionState: "read_time_only",
    ttlExpiresAt: input.ttlExpiresAt,
    visibility: input.sourceAuthorityTier === "inspection_only" ? "inspection_only" : "normal",
    createdAt: now,
    updatedAt: now,
  };
  const fullEdge = {
    edgeId: edgeId({
      edgeType: edgeWithoutHash.edgeType,
      fromNodeId: edgeWithoutHash.fromNodeId,
      toNodeId: edgeWithoutHash.toNodeId,
      sourceMemoryIds: edgeWithoutHash.sourceMemoryIds,
      derivedFromRule: edgeWithoutHash.derivedFromRule,
    }),
    ...edgeWithoutHash,
  };
  return {
    ...fullEdge,
    derivationHash: deriveEdgeHash(fullEdge),
  };
}

export function createRuntimeGraphReader(graph: Pick<RuntimeGraphBuildResult, "nodes" | "edges">) {
  const nodesById = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const edgesById = new Map(graph.edges.map((edge) => [edge.edgeId, edge]));
  return {
    getNode(nodeId: string): RuntimeGraphNode | undefined {
      return nodesById.get(nodeId);
    },
    getEdgesByMemoryId(memoryId: string): RuntimeGraphEdge[] {
      return graph.edges.filter((edge) => edge.sourceMemoryIds.includes(memoryId));
    },
    getEdgesByNodeId(nodeId: string): RuntimeGraphEdge[] {
      return graph.edges.filter((edge) => edge.fromNodeId === nodeId || edge.toNodeId === nodeId);
    },
    getEdgesByType(edgeType: RuntimeGraphEdgeType): RuntimeGraphEdge[] {
      return graph.edges.filter((edge) => edge.edgeType === edgeType);
    },
    snapshot(): { nodes: RuntimeGraphNode[]; edges: RuntimeGraphEdge[] } {
      return {
        nodes: [...nodesById.values()],
        edges: [...edgesById.values()],
      };
    },
  };
}

export function deriveRuntimeGraphDirtyTargets(input: {
  memoryIds?: string[];
  events?: MemoryEvent[];
  sourceRefs?: RuntimeGraphSourceRef[];
}): RuntimeGraphDirtyTarget[] {
  const memoryIds = new Set(input.memoryIds ?? []);
  for (const event of input.events ?? []) {
    if (event.memory_id) {
      memoryIds.add(event.memory_id);
    }
    for (const targetMemoryId of event.target_memory_ids) {
      memoryIds.add(targetMemoryId);
    }
  }
  for (const sourceRef of input.sourceRefs ?? []) {
    if (sourceRef.sourceId) {
      memoryIds.add(`source:${sourceRef.sourceId}`);
    }
  }
  return [...memoryIds].toSorted().map((memoryId) => ({
    targetType: "runtime_graph",
    targetId: memoryId.startsWith("source:") ? memoryId : `memory:${memoryId}`,
    memoryIds: memoryId.startsWith("source:") ? [] : [memoryId],
    reason: memoryId.startsWith("source:")
      ? "source_ref"
      : input.memoryIds?.includes(memoryId)
        ? "explicit_memory"
        : "memory_event",
  }));
}

export function normalizeDurableMemoryForRuntimeGraph(
  memory: DurableMemoryRecord,
  authority?: {
    authorityTier?: SourceAuthorityTier;
    sourceProfileId?: SourceProfileId;
    sourceEventIds?: string[];
    sourceEdgeIds?: string[];
  },
): RuntimeGraphMemoryInput {
  const payloadAuthority = SourceAuthorityMetadataSchema.safeParse(
    (memory.payload as { sourceAuthority?: unknown }).sourceAuthority,
  );
  const authorityTier =
    authority?.authorityTier ??
    (payloadAuthority.success ? payloadAuthority.data.authorityTier : undefined);
  const sourceProfileId =
    authority?.sourceProfileId ??
    (payloadAuthority.success ? payloadAuthority.data.sourceProfileId : undefined);
  return {
    memoryId: memory.memory_id,
    status: memory.status,
    unitType: memory.unit_type,
    kind: memory.kind,
    artifactType: memory.artifact_type,
    canonicalText: memory.canonical_text,
    searchText: memory.search_text,
    scope: memory.scope,
    payload: memory.payload,
    validity: memory.validity,
    sourceRefs: memory.source_refs.map((sourceRef) => ({
      sourceId: sourceRef.source_id,
      segmentId: sourceRef.segment_id,
      sourceType: sourceRef.source_type,
      sourceIngestEventId: sourceRef.source_ingest_event_id,
    })),
    lineage: {
      derivedFromMemoryIds: memory.lineage.derived_from_memory_ids,
      supersedesMemoryIds: memory.lineage.supersedes_memory_ids,
      supersededByMemoryId: memory.lineage.superseded_by_memory_id,
      conflictsWithMemoryIds: memory.lineage.conflicts_with_memory_ids,
      parentMemoryId: memory.lineage.parent_memory_id,
      childMemoryIds: memory.lineage.child_memory_ids,
    },
    sourceAuthorityTier: authorityTier,
    sourceProfileId,
    sourceEventIds: authority?.sourceEventIds,
    sourceEdgeIds: authority?.sourceEdgeIds,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at,
  };
}

export function normalizeExistingMemorySummaryForRuntimeGraph(
  memory: ExistingMemorySummary,
  authority?: {
    authorityTier?: SourceAuthorityTier;
    sourceProfileId?: SourceProfileId;
  },
): RuntimeGraphMemoryInput {
  return {
    memoryId: memory.memory_id,
    status: "active",
    unitType: memory.unit_type,
    kind: memory.kind,
    artifactType: memory.artifact_type,
    canonicalText: memory.canonical_text,
    searchText: memory.canonical_text,
    scope: memory.scope,
    payload: memory.payload,
    validity: {
      valid_at: readString(memory.validity.valid_at),
      invalid_at: readString(memory.validity.invalid_at),
      temporal_status: readString(memory.validity.temporal_status),
    },
    sourceRefs: [],
    sourceAuthorityTier: authority?.authorityTier,
    sourceProfileId: authority?.sourceProfileId,
    createdAt: memory.created_at,
    updatedAt: memory.updated_at,
  };
}
