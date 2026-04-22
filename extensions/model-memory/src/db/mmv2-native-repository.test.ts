import { describe, expect, it } from "vitest";
import type { DurableMemoryRecord } from "../mmv2/contracts.ts";
import { applyModelMemoryMigrations } from "./migrations.ts";
import { MmV2NativeRepository } from "./mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./pg-test.ts";

function buildMinimalDurableMemory(memoryId: string): DurableMemoryRecord {
  return {
    memory_id: memoryId,
    schema_version: "durable_memory.v1",
    status: "active",
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text: "The user prefers concise validation reports.",
    search_text: "user prefers concise validation reports",
    scope: {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "user",
      applies_to: "global",
    },
    payload: {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "user",
      predicate: "prefers",
      object: "concise validation reports",
      qualifiers: [],
      temporal_status: "currently_true",
    },
    validity: {
      valid_at: null,
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: 0.9,
    quality: {
      atomicity: 0.95,
      specificity: 0.8,
      durability: 0.72,
      actionability: 0.55,
      grounding: 1,
    },
    source_refs: [
      {
        source_ingest_event_id: "source-event-001",
        source_type: "conversation_turn",
        source_id: "source-001",
        speaker: "user",
        created_at: "2026-04-21T00:00:00.000Z",
        segment_id: "segment-001",
        start_char: 0,
        end_char: 0,
        evidence_quote: "I prefer concise validation reports.",
      },
    ],
    lineage: {
      candidate_ids: ["candidate-001"],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: "2026-04-21T00:00:00.000Z",
    updated_at: "2026-04-21T00:00:00.000Z",
    last_accessed_at: null,
    access_count: 0,
    tags: ["claim"],
  };
}

describe("MmV2NativeRepository", () => {
  it("persists durable memories, conflicts, composites, and compatibility projections", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.persistSource({
        id: "source-001",
        sourceKind: "document",
        externalSourceId: "doc-001",
        sourceFingerprint: "fingerprint-001",
        projectId: "project-001",
        sessionId: undefined,
        sourceMetadata: {},
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
      });
      await repository.persistSourceWindows([
        {
          id: "segment-001",
          sourceId: "source-001",
          windowIndex: 0,
          normalizedText: "Deployment region is us-east-1.",
          normalizedFingerprint: "segment-fingerprint-001",
          tokenEstimate: 12,
          headingPath: ["Project"],
          blockDescriptors: [],
          lineStart: 1,
          lineEnd: 1,
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
        },
      ]);

      await repository.upsertDurableMemory({
        memory_id: "memory-parent",
        schema_version: "durable_memory.v1",
        status: "active",
        unit_type: "composite",
        kind: null,
        artifact_type: "procedure",
        canonical_text: "Release checklist",
        search_text: "Release checklist ship validate announce",
        scope: {
          tenant_id: "openclaw",
          user_id: "unknown-user",
          project_id: "project-001",
          workspace_id: null,
          subject_type: "project",
          subject_id: "project-001",
          applies_to: "current_project",
        },
        payload: {
          title: "Release checklist",
          summary: "Validate and ship the release.",
          components: [
            {
              component_id: "component-1",
              order_index: 0,
              role: "step",
              content: "Validate the build.",
              embedded_atomic_kind: "none",
              promotion: "embedded_only",
              evidence_quote: "Validate the build.",
              required: true,
              conditions: [],
              outputs: [],
            },
            {
              component_id: "component-2",
              order_index: 1,
              role: "step",
              content: "Announce the release.",
              embedded_atomic_kind: "none",
              promotion: "embedded_only",
              evidence_quote: "Announce the release.",
              required: true,
              conditions: [],
              outputs: [],
            },
          ],
        },
        validity: {
          valid_at: "2026-04-20T00:00:00.000Z",
          invalid_at: null,
          ttl_seconds: null,
          temporal_status: "current",
        },
        confidence: 0.93,
        quality: {
          atomicity: 0.81,
          specificity: 0.9,
          durability: 0.92,
          actionability: 0.96,
          grounding: 0.88,
        },
        source_refs: [
          {
            source_ingest_event_id: "event-001",
            source_type: "document",
            source_id: "source-001",
            speaker: "unknown",
            created_at: "2026-04-20T00:00:00.000Z",
            segment_id: "segment-001",
            start_char: 0,
            end_char: 0,
            evidence_quote: "Release checklist",
          },
        ],
        lineage: {
          candidate_ids: ["candidate-001"],
          derived_from_memory_ids: [],
          supersedes_memory_ids: [],
          superseded_by_memory_id: null,
          conflicts_with_memory_ids: [],
          parent_memory_id: null,
          child_memory_ids: [],
        },
        created_at: "2026-04-20T00:00:00.000Z",
        updated_at: "2026-04-20T00:00:00.000Z",
        last_accessed_at: null,
        access_count: 0,
        tags: ["feedback", "procedure"],
      });

      await repository.upsertDurableMemory({
        memory_id: "memory-conflict",
        schema_version: "durable_memory.v1",
        status: "conflicted",
        unit_type: "atomic",
        kind: "claim",
        artifact_type: null,
        canonical_text: "Deployment region is us-east-1.",
        search_text: "Deployment region is us-east-1.",
        scope: {
          tenant_id: "openclaw",
          user_id: "unknown-user",
          project_id: "project-001",
          workspace_id: null,
          subject_type: "project",
          subject_id: "project-001",
          applies_to: "current_project",
        },
        payload: {
          payload_type: "claim",
          claim_type: "project_fact",
          subject: "deployment region",
          predicate: "is",
          object: "us-east-1",
          qualifiers: [],
          temporal_status: "currently_true",
        },
        validity: {
          valid_at: "2026-04-20T00:00:00.000Z",
          invalid_at: null,
          ttl_seconds: null,
          temporal_status: "current",
        },
        confidence: 0.88,
        quality: {
          atomicity: 0.98,
          specificity: 0.91,
          durability: 0.9,
          actionability: 0.78,
          grounding: 0.9,
        },
        source_refs: [
          {
            source_ingest_event_id: "event-002",
            source_type: "document",
            source_id: "source-001",
            speaker: "unknown",
            created_at: "2026-04-20T00:00:00.000Z",
            segment_id: "segment-001",
            start_char: 0,
            end_char: 0,
            evidence_quote: "Deployment region is us-east-1.",
          },
        ],
        lineage: {
          candidate_ids: ["candidate-002"],
          derived_from_memory_ids: [],
          supersedes_memory_ids: [],
          superseded_by_memory_id: null,
          conflicts_with_memory_ids: ["memory-parent"],
          parent_memory_id: null,
          child_memory_ids: [],
        },
        created_at: "2026-04-20T00:00:00.000Z",
        updated_at: "2026-04-20T00:00:00.000Z",
        last_accessed_at: null,
        access_count: 0,
        tags: ["project", "fact"],
      });

      await repository.insertMemoryEvent({
        memory_event_id: "event-row-001",
        schema_version: "memory_event.v1",
        event_type: "conflict_recorded",
        occurred_at: "2026-04-20T00:00:00.000Z",
        actor: "system",
        source_ingest_event_id: "event-002",
        candidate_id: "candidate-002",
        memory_id: "memory-conflict",
        target_memory_ids: ["memory-parent"],
        payload: { reason: "scope_narrowing" },
      });

      await repository.upsertMemoryEdge({
        edge_id: "edge-001",
        schema_version: "memory_edge.v1",
        from_memory_id: "memory-conflict",
        to_memory_id: "memory-parent",
        edge_type: "conflicts_with",
        created_at: "2026-04-20T00:00:00.000Z",
        metadata: { reason: "scope_narrowing" },
      });

      const durable = await repository.listDurableMemories();
      const projected = await repository.listMemoryObjects();
      const writeEvents = await repository.listWriteEvents();
      const summaries = await repository.listExistingMemorySummaries();

      expect(durable).toHaveLength(2);
      expect(summaries.find((entry) => entry.memory_id === "memory-conflict")?.artifact_type).toBe(
        null,
      );
      expect(projected.find((entry) => entry.id === "memory-parent")?.kind).toBe("procedure");
      expect(projected.find((entry) => entry.id === "memory-conflict")?.lifecycleState).toBe(
        "conflict_hold",
      );
      expect(writeEvents[0]?.decision).toBe("write");
    } finally {
      await database.close();
    }
  });

  it("refuses live batches that would create durable memories without event evidence", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await expect(
        repository.persistLiveMemoryBatch({
          durableMemories: [buildMinimalDurableMemory("memory-without-event")],
          memoryEdges: [],
          memoryEvents: [],
        }),
      ).rejects.toThrow("without event evidence");

      expect(await repository.listDurableMemories()).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it("defers invalid live memory edges instead of violating foreign keys", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.persistLiveMemoryBatch({
        durableMemories: [buildMinimalDurableMemory("memory-with-invalid-edge")],
        memoryEdges: [
          {
            edge_id: "edge-invalid-001",
            schema_version: "memory_edge.v1",
            from_memory_id: "memory-with-invalid-edge",
            to_memory_id: "memory-does-not-exist",
            edge_type: "supersedes",
            created_at: "2026-04-21T00:00:00.000Z",
            metadata: { reason: "test-invalid-edge" },
          },
        ],
        memoryEvents: [
          {
            memory_event_id: "event-with-deferred-edge",
            schema_version: "memory_event.v1",
            event_type: "memory_inserted",
            occurred_at: "2026-04-21T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "source-event-001",
            candidate_id: "candidate-001",
            memory_id: "memory-with-invalid-edge",
            target_memory_ids: [],
            payload: { decision: "write" },
          },
        ],
      });

      expect(await repository.listMemoryEdges()).toEqual([]);
      const events = await repository.listMemoryEvents();
      expect(events[0]?.payload).toMatchObject({
        deferred_memory_edges: [
          {
            edge_id: "edge-invalid-001",
            edge_type: "supersedes",
            from_memory_id: "memory-with-invalid-edge",
            to_memory_id: "memory-does-not-exist",
          },
        ],
      });
      expect((await repository.getDurableMemory("memory-with-invalid-edge"))?.status).toBe(
        "active",
      );
    } finally {
      await database.close();
    }
  });
});
