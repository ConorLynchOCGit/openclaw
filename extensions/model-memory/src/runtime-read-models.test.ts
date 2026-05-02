import { describe, expect, it } from "vitest";
import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "./mmv2/contracts.ts";
import { getCurrentMemoryObjects, listRuntimeMemoryRecords } from "./runtime-read-models.ts";
import { buildSourceAuthorityMetadata } from "./source-authority.ts";
import type { ModelMemoryObjectRecord } from "./storage-database-contract.ts";

function buildMemoryObjectRecord(
  overrides: Partial<ModelMemoryObjectRecord>,
): ModelMemoryObjectRecord {
  return {
    id: overrides.id ?? "memory-001",
    canonicalClass: overrides.canonicalClass ?? "project",
    kind: overrides.kind ?? "fact",
    payload: overrides.payload ?? { subject: "deployment region", value: "region-001" },
    normalizedSubject: overrides.normalizedSubject ?? "deployment region",
    normalizedTitle: overrides.normalizedTitle,
    normalizedSearchText: overrides.normalizedSearchText ?? "deployment region region-001",
    scope: overrides.scope ?? { projectId: "project-001" },
    scopeKey: overrides.scopeKey ?? "scope-project-001",
    confidence: overrides.confidence ?? "strong",
    durability: overrides.durability ?? "durable",
    suggestedReviewMode: overrides.suggestedReviewMode ?? "auto_accept",
    executedReviewMode: overrides.executedReviewMode ?? "auto_accept",
    rationaleCodes: overrides.rationaleCodes ?? [],
    identityKey: overrides.identityKey ?? `identity-${overrides.id ?? "memory-001"}`,
    slotKey: overrides.slotKey ?? `slot-${overrides.id ?? "memory-001"}`,
    contractName: overrides.contractName ?? "semantic_extraction",
    contractVersion: overrides.contractVersion ?? "v1",
    modelId: overrides.modelId ?? "model-001",
    createdAt: overrides.createdAt ?? new Date(0),
    supersededAt: overrides.supersededAt,
    lifecycleState: overrides.lifecycleState,
    activationBasis: overrides.activationBasis,
    activatedAt: overrides.activatedAt,
    expiredAt: overrides.expiredAt,
  };
}

function buildDurableMemoryRecord(overrides: Partial<DurableMemoryRecord>): DurableMemoryRecord {
  const now = "2026-04-21T00:00:00.000Z";
  return {
    memory_id: overrides.memory_id ?? "memory-001",
    schema_version: "durable_memory.v1",
    status: overrides.status ?? "active",
    unit_type: "atomic",
    kind: overrides.kind ?? "claim",
    artifact_type: null,
    canonical_text: overrides.canonical_text ?? "Project fact.",
    search_text: overrides.search_text ?? "Project fact.",
    scope: overrides.scope ?? {
      tenant_id: "default",
      user_id: "unknown-user",
      project_id: "project-001",
      workspace_id: "workspace-001",
      subject_type: "project",
      subject_id: "project-001",
      applies_to: "current_project",
    },
    payload: overrides.payload ?? { claim_type: "project_fact" },
    validity: overrides.validity ?? {
      temporal_status: "current",
      valid_at: now,
      invalid_at: null,
      ttl_seconds: null,
    },
    confidence: overrides.confidence ?? 0.9,
    quality: overrides.quality ?? {
      atomicity: 0.9,
      specificity: 0.9,
      durability: 0.9,
      actionability: 0.8,
      grounding: 1,
    },
    source_refs: overrides.source_refs ?? [],
    lineage: overrides.lineage ?? {
      candidate_ids: [],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: overrides.created_at ?? now,
    updated_at: overrides.updated_at ?? now,
    last_accessed_at: overrides.last_accessed_at ?? null,
    access_count: overrides.access_count ?? 0,
    tags: overrides.tags ?? [],
  };
}

describe("runtime-read-models", () => {
  it("returns active objects only by default", () => {
    const records = [
      buildMemoryObjectRecord({ id: "active-explicit", lifecycleState: "active" }),
      buildMemoryObjectRecord({ id: "active-legacy" }),
      buildMemoryObjectRecord({
        id: "provisional-001",
        lifecycleState: "provisional",
      }),
      buildMemoryObjectRecord({
        id: "expired-001",
        lifecycleState: "expired",
        expiredAt: new Date(1_000),
      }),
      buildMemoryObjectRecord({
        id: "superseded-001",
        lifecycleState: "superseded",
        supersededAt: new Date(2_000),
      }),
      buildMemoryObjectRecord({
        id: "conflict-001",
        lifecycleState: "conflict_hold",
      }),
    ];

    expect(getCurrentMemoryObjects(records).map((record) => record.id)).toEqual([
      "active-explicit",
      "active-legacy",
    ]);
  });

  it("threads MMV2 memory event and edge ids into runtime provenance", async () => {
    const records = await listRuntimeMemoryRecords({
      listDurableMemories: async () => [buildDurableMemoryRecord({ memory_id: "memory-001" })],
      listMemoryEvents: async () => [
        {
          memory_event_id: "event-001",
          schema_version: "memory_event.v1",
          event_type: "memory_inserted",
          occurred_at: "2026-04-21T00:00:00.000Z",
          actor: "system",
          source_ingest_event_id: "source-event-001",
          candidate_id: "candidate-001",
          memory_id: "memory-001",
          target_memory_ids: [],
          payload: {},
        } satisfies MemoryEvent,
      ],
      listMemoryEdges: async () => [
        {
          edge_id: "edge-001",
          schema_version: "memory_edge.v1",
          from_memory_id: "memory-001",
          to_memory_id: "memory-older",
          edge_type: "supersedes",
          created_at: "2026-04-21T00:00:00.000Z",
          metadata: {},
        } satisfies MemoryEdge,
      ],
    });

    expect(records[0]?.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memoryEventId: "event-001" }),
        expect.objectContaining({ memoryEdgeId: "edge-001" }),
      ]),
    );
  });

  it("projects source authority metadata from durable payloads into runtime records", async () => {
    const records = await listRuntimeMemoryRecords({
      listDurableMemories: async () => [
        buildDurableMemoryRecord({
          payload: {
            claim_type: "project_fact",
            sourceAuthority: buildSourceAuthorityMetadata("researcher_report_artifact"),
          },
        }),
      ],
    });

    expect(records[0]).toMatchObject({
      sourceAuthorityTier: "cited_soft",
      sourceProfileId: "researcher_report_artifact",
    });
  });

  it("preserves durable canonical and search text for structural retrieval recall", async () => {
    const records = await listRuntimeMemoryRecords({
      listDurableMemories: async () => [
        buildDurableMemoryRecord({
          memory_id: "memory-marker",
          canonical_text:
            "Validation marker PHASE2-RUNTIME-SEARCH identifies retrieval final inclusion.",
          search_text:
            "validation marker PHASE2-RUNTIME-SEARCH retrieval final inclusion model owned",
          payload: {
            claim_type: "project_fact",
            subject: "retrieval final inclusion",
            predicate: "is",
            object: "model owned",
          },
        }),
      ],
    });

    expect(records[0]?.normalizedSearchText).toContain("phase2-runtime-search");
    expect(records[0]?.normalizedSearchText).toContain("retrieval final inclusion");
    expect(records[0]?.identityKey).toBeTruthy();
  });
});
