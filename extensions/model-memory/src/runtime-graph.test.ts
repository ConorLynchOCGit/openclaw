import { describe, expect, it } from "vitest";
import {
  buildRuntimeGraph,
  createReadTimeProbationaryEdge,
  createRuntimeGraphReader,
  deriveRuntimeGraphDirtyTargets,
  normalizeExistingMemorySummaryForRuntimeGraph,
  type RuntimeGraphMemoryInput,
} from "./runtime-graph.ts";

const baseMemory = (overrides: Partial<RuntimeGraphMemoryInput> = {}): RuntimeGraphMemoryInput => ({
  memoryId: "mem-a",
  status: "active",
  unitType: "atomic",
  kind: "claim",
  artifactType: null,
  canonicalText: "A durable memory exists.",
  searchText: "durable memory",
  scope: {
    tenant_id: "tenant-1",
    user_id: "user-1",
    project_id: "project-1",
    workspace_id: "workspace-1",
    subject_type: "project",
    subject_id: "project-1",
    applies_to: "current_project",
  },
  payload: { payload_type: "claim" },
  validity: {
    valid_at: "2026-04-25T00:00:00.000Z",
    invalid_at: null,
    temporal_status: "current",
  },
  sourceRefs: [
    {
      sourceId: "src-a",
      segmentId: "seg-a",
      sourceType: "document",
      sourceIngestEventId: "evt-a",
    },
  ],
  lineage: {},
  sourceAuthorityTier: "curated_authoritative",
  sourceProfileId: "curated_corpus",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z",
  ...overrides,
});

describe("runtime-graph", () => {
  it("generates deterministic node and edge ids", () => {
    const first = buildRuntimeGraph([baseMemory()], {
      now: new Date("2026-04-25T01:00:00.000Z"),
    });
    const second = buildRuntimeGraph([baseMemory()], {
      now: new Date("2026-04-25T01:00:00.000Z"),
    });

    expect(first.nodes.map((node) => node.nodeId)).toEqual(second.nodes.map((node) => node.nodeId));
    expect(first.edges.map((edge) => edge.edgeId)).toEqual(second.edges.map((edge) => edge.edgeId));
    expect(first.outputHash).toBe(second.outputHash);
  });

  it("builds graph output deterministically regardless of input order", () => {
    const memA = baseMemory({ memoryId: "mem-a" });
    const memB = baseMemory({
      memoryId: "mem-b",
      sourceRefs: [{ sourceId: "src-b", segmentId: "seg-b" }],
      lineage: { derivedFromMemoryIds: ["mem-a"] },
    });

    const first = buildRuntimeGraph([memA, memB], {
      now: new Date("2026-04-25T01:00:00.000Z"),
    });
    const second = buildRuntimeGraph([memB, memA], {
      now: new Date("2026-04-25T01:00:00.000Z"),
    });

    expect(first.nodes).toEqual(second.nodes);
    expect(first.edges).toEqual(second.edges);
    expect(first.outputHash).toBe(second.outputHash);
  });

  it("carries authority tier and source profile metadata onto graph nodes and edges", () => {
    const graph = buildRuntimeGraph([
      baseMemory({
        sourceAuthorityTier: "tool_grounded",
        sourceProfileId: "tool_result_capture",
      }),
    ]);

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeType: "memory_object",
          authorityTier: "tool_grounded",
          sourceProfileId: "tool_result_capture",
        }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeType: "references",
          sourceAuthorityTier: "tool_grounded",
          sourceProfileId: "tool_result_capture",
        }),
      ]),
    );
  });

  it("excludes inspection-only sources from normal graph output", () => {
    const graph = buildRuntimeGraph([
      baseMemory({
        sourceAuthorityTier: "inspection_only",
        sourceProfileId: "raw_transcript",
      }),
    ]);

    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.excludedMemoryIds).toEqual([
      { memoryId: "mem-a", reason: "excluded_source_authority" },
    ]);
  });

  it("keeps lower-authority soft-source graph edges visibly lower authority", () => {
    const graph = buildRuntimeGraph([
      baseMemory({
        sourceAuthorityTier: "cited_soft",
        sourceProfileId: "cited_assistant_answer",
      }),
    ]);

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          edgeAuthorityTier: "authoritative_structural",
          sourceAuthorityTier: "cited_soft",
          sourceProfileId: "cited_assistant_answer",
        }),
      ]),
    );
  });

  it("excludes inactive, superseded, conflicted, and stale memories by default", () => {
    const graph = buildRuntimeGraph(
      [
        baseMemory({ memoryId: "inactive", status: "inactive" }),
        baseMemory({ memoryId: "superseded", status: "superseded" }),
        baseMemory({ memoryId: "conflicted", status: "conflicted" }),
        baseMemory({
          memoryId: "stale",
          validity: {
            valid_at: "2026-04-01T00:00:00.000Z",
            invalid_at: "2026-04-02T00:00:00.000Z",
            temporal_status: "historical",
          },
        }),
      ],
      { now: new Date("2026-04-25T00:00:00.000Z") },
    );

    expect(graph.nodes).toHaveLength(0);
    expect(graph.excludedMemoryIds).toEqual([
      { memoryId: "conflicted", reason: "excluded_memory_status" },
      { memoryId: "inactive", reason: "excluded_memory_status" },
      { memoryId: "stale", reason: "stale_memory" },
      { memoryId: "superseded", reason: "excluded_memory_status" },
    ]);
  });

  it("can include conflicted memories only as conflict-only graph output", () => {
    const graph = buildRuntimeGraph([baseMemory({ status: "conflicted" })], {
      includeConflictOnly: true,
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lifecycleState: "conflicted",
          visibility: "conflict_only",
        }),
      ]),
    );
  });

  it("reports missing memory ids and invalid source refs as graph-build errors", () => {
    const graph = buildRuntimeGraph([
      baseMemory({ memoryId: "" }),
      baseMemory({ memoryId: "mem-invalid-source", sourceRefs: [{ sourceId: "" }] }),
      baseMemory({ memoryId: "mem-missing-edge", lineage: { derivedFromMemoryIds: ["missing"] } }),
    ]);

    expect(graph.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_source_memory_id" }),
        expect.objectContaining({
          code: "missing_edge_endpoint",
          memoryId: "mem-invalid-source",
        }),
        expect.objectContaining({
          code: "missing_edge_endpoint",
          memoryId: "mem-missing-edge",
          targetMemoryId: "missing",
        }),
      ]),
    );
  });

  it("maps memory events and source refs to bounded graph dirty targets", () => {
    expect(
      deriveRuntimeGraphDirtyTargets({
        memoryIds: ["mem-explicit"],
        events: [
          {
            memory_event_id: "evt-1",
            schema_version: "memory_event.v1",
            event_type: "memory_superseded",
            occurred_at: "2026-04-25T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "ingest-1",
            candidate_id: null,
            memory_id: "mem-event",
            target_memory_ids: ["mem-target"],
            payload: {},
          },
        ],
        sourceRefs: [{ sourceId: "src-a", segmentId: "seg-a" }],
      }),
    ).toEqual([
      {
        targetType: "runtime_graph",
        targetId: "memory:mem-event",
        memoryIds: ["mem-event"],
        reason: "memory_event",
      },
      {
        targetType: "runtime_graph",
        targetId: "memory:mem-explicit",
        memoryIds: ["mem-explicit"],
        reason: "explicit_memory",
      },
      {
        targetType: "runtime_graph",
        targetId: "memory:mem-target",
        memoryIds: ["mem-target"],
        reason: "memory_event",
      },
      {
        targetType: "runtime_graph",
        targetId: "source:src-a",
        memoryIds: [],
        reason: "source_ref",
      },
    ]);
  });

  it("exposes a read-only graph query seam without mutating graph state", () => {
    const graph = buildRuntimeGraph([baseMemory()]);
    const reader = createRuntimeGraphReader(graph);
    const references = reader.getEdgesByType("references");
    const snapshot = reader.snapshot();

    snapshot.nodes.length = 0;
    snapshot.edges.length = 0;

    expect(references).toHaveLength(1);
    expect(reader.getEdgesByMemoryId("mem-a")).toHaveLength(1);
    expect(reader.snapshot().nodes.length).toBe(graph.nodes.length);
  });

  it("keeps probationary inferred edges read-time only", () => {
    const graph = buildRuntimeGraph([baseMemory()]);
    const [from, to] = graph.nodes;
    const edge = createReadTimeProbationaryEdge({
      edgeType: "mentions",
      fromNodeId: from.nodeId,
      toNodeId: to.nodeId,
      sourceMemoryIds: ["mem-a"],
      sourceAuthorityTier: "cited_soft",
      sourceProfileId: "cited_assistant_answer",
      ttlExpiresAt: "2026-04-26T00:00:00.000Z",
      now: new Date("2026-04-25T00:00:00.000Z"),
    });

    expect(edge).toMatchObject({
      edgeAuthorityTier: "probationary_inferred",
      promotionState: "read_time_only",
      strength: 0.25,
      sourceAuthorityTier: "cited_soft",
    });
    expect(graph.edges).not.toContainEqual(edge);
  });

  it("normalizes existing memory summaries for graph nodes without adding lineage edges", () => {
    const memory = normalizeExistingMemorySummaryForRuntimeGraph(
      {
        memory_id: "summary-1",
        unit_type: "atomic",
        kind: "claim",
        artifact_type: null,
        canonical_text: "A summarized memory exists.",
        scope: {},
        payload: {},
        validity: {},
        confidence: 0.9,
        created_at: "2026-04-25T00:00:00.000Z",
        updated_at: "2026-04-25T00:00:00.000Z",
      },
      { authorityTier: "curated_authoritative", sourceProfileId: "curated_corpus" },
    );
    const graph = buildRuntimeGraph([memory]);

    expect(graph.nodes).toEqual([
      expect.objectContaining({
        displayKey: "summary-1",
        authorityTier: "curated_authoritative",
        sourceProfileId: "curated_corpus",
      }),
    ]);
    expect(graph.edges).toHaveLength(0);
  });
});
