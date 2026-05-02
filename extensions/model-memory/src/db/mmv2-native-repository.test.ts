import { describe, expect, it } from "vitest";
import type { DurableMemoryRecord, MemoryEvent } from "../mmv2/contracts.ts";
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

class FailingMmV2NativeRepository extends MmV2NativeRepository {
  constructor(
    sql: ConstructorParameters<typeof MmV2NativeRepository>[0],
    private readonly failingCandidateIds: ReadonlySet<string> = new Set(),
    private readonly failingSupersededTargetIds: ReadonlySet<string> = new Set(),
  ) {
    super(sql);
  }

  override withTransaction<T>(
    work: (repository: FailingMmV2NativeRepository) => Promise<T>,
  ): Promise<T> {
    return this.sql.withTransaction((tx) =>
      work(
        new FailingMmV2NativeRepository(
          tx,
          this.failingCandidateIds,
          this.failingSupersededTargetIds,
        ),
      ),
    );
  }

  override async insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent> {
    if (record.candidate_id && this.failingCandidateIds.has(record.candidate_id)) {
      throw new Error(`forced event failure for ${record.candidate_id}`);
    }
    return await super.insertMemoryEvent(record);
  }

  override async insertMemoryEvents(records: MemoryEvent[]): Promise<MemoryEvent[]> {
    if (
      records.some(
        (record) => record.candidate_id && this.failingCandidateIds.has(record.candidate_id),
      )
    ) {
      throw new Error("forced batched event failure");
    }
    return await super.insertMemoryEvents(records);
  }

  override async markDurableMemoryStatus(input: {
    memoryId: string;
    status: DurableMemoryRecord["status"];
    updatedAt: string;
    supersededByMemoryId?: string | null;
  }): Promise<DurableMemoryRecord | undefined> {
    if (this.failingSupersededTargetIds.has(input.memoryId)) {
      throw new Error(`forced superseded status failure for ${input.memoryId}`);
    }
    return await super.markDurableMemoryStatus(input);
  }
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

  it("defers live candidates that would create durable memories without event evidence", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      const result = await repository.persistLiveMemoryBatch({
        durableMemories: [buildMinimalDurableMemory("memory-without-event")],
        memoryEdges: [],
        memoryEvents: [],
      });

      expect(await repository.listDurableMemories()).toEqual([]);
      expect(result.deferredCandidates).toEqual([
        expect.objectContaining({
          memory_id: "memory-without-event",
          failure_class: "db_persistence",
        }),
      ]);
      expect(result.telemetry).toMatchObject({
        rowsAttempted: { durableMemories: 1, memoryEvents: 0, memoryEdges: 0 },
        rowsWritten: { durableMemories: 0, memoryEvents: 0, memoryEdges: 0 },
        rowsDeferred: { candidates: 1, memoryEdges: 0 },
      });
    } finally {
      await database.close();
    }
  });

  it("defers invalid live memory edges instead of violating foreign keys", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      const result = await repository.persistLiveMemoryBatch({
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
      expect(result.deferredEdges).toEqual([
        expect.objectContaining({
          edge_id: "edge-invalid-001",
          from_memory_id: "memory-with-invalid-edge",
          to_memory_id: "memory-does-not-exist",
        }),
      ]);
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

  it("persists valid siblings when one live candidate is deferred", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      const result = await repository.persistLiveMemoryBatch({
        durableMemories: [
          buildMinimalDurableMemory("memory-valid-sibling"),
          buildMinimalDurableMemory("memory-invalid-sibling"),
        ],
        memoryEdges: [],
        memoryEvents: [
          {
            memory_event_id: "event-valid-sibling",
            schema_version: "memory_event.v1",
            event_type: "memory_inserted",
            occurred_at: "2026-04-21T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "source-event-001",
            candidate_id: "candidate-valid",
            memory_id: "memory-valid-sibling",
            target_memory_ids: [],
            payload: { decision: "write" },
          },
        ],
      });

      expect(await repository.getDurableMemory("memory-valid-sibling")).toBeDefined();
      expect(await repository.getDurableMemory("memory-invalid-sibling")).toBeUndefined();
      expect(result.durableMemoriesWritten).toEqual(["memory-valid-sibling"]);
      expect(result.memoryEventsWritten).toEqual(["event-valid-sibling"]);
      expect(result.deferredCandidates).toEqual([
        expect.objectContaining({
          memory_id: "memory-invalid-sibling",
          reason: "durable memory candidate has no event evidence",
        }),
      ]);
      expect(result.telemetry.rowsWritten).toMatchObject({
        durableMemories: 1,
        memoryEvents: 1,
        memoryEdges: 0,
      });
    } finally {
      await database.close();
    }
  });

  it("rolls back only the failing candidate when one event write fails", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new FailingMmV2NativeRepository(database.sql, new Set(["candidate-bad"]));

      const result = await repository.persistLiveMemoryBatch({
        durableMemories: [
          {
            ...buildMinimalDurableMemory("memory-good"),
            lineage: {
              ...buildMinimalDurableMemory("memory-good").lineage,
              candidate_ids: ["candidate-good"],
            },
          },
          {
            ...buildMinimalDurableMemory("memory-bad"),
            lineage: {
              ...buildMinimalDurableMemory("memory-bad").lineage,
              candidate_ids: ["candidate-bad"],
            },
          },
        ],
        memoryEdges: [
          {
            edge_id: "edge-missing-endpoint",
            schema_version: "memory_edge.v1",
            from_memory_id: "memory-good",
            to_memory_id: "missing-memory",
            edge_type: "conflicts_with",
            created_at: "2026-04-21T00:00:00.000Z",
            metadata: { reason: "mixed-batch-proof" },
          },
        ],
        memoryEvents: [
          {
            memory_event_id: "event-good",
            schema_version: "memory_event.v1",
            event_type: "memory_inserted",
            occurred_at: "2026-04-21T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "source-event-001",
            candidate_id: "candidate-good",
            memory_id: "memory-good",
            target_memory_ids: [],
            payload: { decision: "write" },
          },
          {
            memory_event_id: "event-bad",
            schema_version: "memory_event.v1",
            event_type: "memory_inserted",
            occurred_at: "2026-04-21T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "source-event-001",
            candidate_id: "candidate-bad",
            memory_id: "memory-bad",
            target_memory_ids: [],
            payload: { decision: "write" },
          },
        ],
      });

      expect(await repository.getDurableMemory("memory-good")).toBeDefined();
      expect(await repository.getDurableMemory("memory-bad")).toBeUndefined();
      expect(await repository.listMemoryEvents()).toEqual([
        expect.objectContaining({
          memory_event_id: "event-good",
          memory_id: "memory-good",
          payload: expect.objectContaining({
            deferred_memory_edges: [
              expect.objectContaining({
                edge_id: "edge-missing-endpoint",
                to_memory_id: "missing-memory",
              }),
            ],
          }),
        }),
      ]);
      expect(result.durableMemoriesWritten).toEqual(["memory-good"]);
      expect(result.memoryEventsWritten).toEqual(["event-good"]);
      expect(result.deferredCandidates).toEqual([
        expect.objectContaining({
          memory_id: "memory-bad",
          reason: "forced event failure for candidate-bad",
        }),
      ]);
      expect(result.deferredEdges).toEqual([
        expect.objectContaining({
          edge_id: "edge-missing-endpoint",
          from_memory_id: "memory-good",
          to_memory_id: "missing-memory",
        }),
      ]);
    } finally {
      await database.close();
    }
  });

  it("defers only the failing supersession edge when a status update fails", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new FailingMmV2NativeRepository(
        database.sql,
        new Set(),
        new Set(["memory-target-fail"]),
      );

      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-target-fail"),
        status: "active",
      });
      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-target-ok"),
        status: "active",
      });

      const result = await repository.persistLiveMemoryBatch({
        durableMemories: [
          {
            ...buildMinimalDurableMemory("memory-superseder"),
            lineage: {
              ...buildMinimalDurableMemory("memory-superseder").lineage,
              candidate_ids: ["candidate-superseder"],
            },
          },
        ],
        memoryEdges: [
          {
            edge_id: "edge-fail-status",
            schema_version: "memory_edge.v1",
            from_memory_id: "memory-superseder",
            to_memory_id: "memory-target-fail",
            edge_type: "supersedes",
            created_at: "2026-04-21T00:00:00.000Z",
            metadata: { reason: "forced-status-failure" },
          },
          {
            edge_id: "edge-ok-status",
            schema_version: "memory_edge.v1",
            from_memory_id: "memory-superseder",
            to_memory_id: "memory-target-ok",
            edge_type: "supersedes",
            created_at: "2026-04-21T00:00:00.000Z",
            metadata: { reason: "valid" },
          },
        ],
        memoryEvents: [
          {
            memory_event_id: "event-superseder",
            schema_version: "memory_event.v1",
            event_type: "memory_inserted",
            occurred_at: "2026-04-21T00:00:00.000Z",
            actor: "system",
            source_ingest_event_id: "source-event-001",
            candidate_id: "candidate-superseder",
            memory_id: "memory-superseder",
            target_memory_ids: ["memory-target-fail", "memory-target-ok"],
            payload: { decision: "write" },
          },
        ],
      });

      expect(await repository.getDurableMemory("memory-superseder")).toBeDefined();
      expect(await repository.listMemoryEdges()).toEqual([
        expect.objectContaining({
          edge_id: "edge-ok-status",
          to_memory_id: "memory-target-ok",
        }),
      ]);
      expect((await repository.getDurableMemory("memory-target-ok"))?.status).toBe("superseded");
      expect((await repository.getDurableMemory("memory-target-fail"))?.status).toBe("active");
      expect(result.deferredEdges).toEqual([
        expect.objectContaining({
          edge_id: "edge-fail-status",
          to_memory_id: "memory-target-fail",
        }),
      ]);
    } finally {
      await database.close();
    }
  });

  it("reports integrity issues without mutating the database", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.upsertDurableMemory(buildMinimalDurableMemory("memory-no-event"));
      const before = await repository.listDurableMemories();

      const report = await repository.auditIntegrity();

      expect(report.memoriesWithoutEvents).toContain("memory-no-event");
      expect(await repository.listDurableMemories()).toEqual(before);
    } finally {
      await database.close();
    }
  });

  it("lists scoped projected summaries for capture without broad deleted/superseded rows", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-global"),
        scope: {
          ...buildMinimalDurableMemory("memory-global").scope,
          project_id: null,
        },
      });
      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-project"),
        scope: {
          ...buildMinimalDurableMemory("memory-project").scope,
          project_id: "project-001",
        },
      });
      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-other-project"),
        scope: {
          ...buildMinimalDurableMemory("memory-other-project").scope,
          project_id: "project-002",
        },
      });
      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-superseded"),
        status: "superseded",
      });

      const summaries = await repository.listExistingMemorySummariesForCapture({
        projectId: "project-001",
        limit: 10,
      });

      expect(summaries.map((entry) => entry.memory_id)).toEqual([
        "memory-project",
        "memory-global",
      ]);
      expect(JSON.stringify(summaries)).not.toContain("memory-other-project");
      expect(JSON.stringify(summaries)).not.toContain("memory-superseded");
      expect(summaries[0]).toMatchObject({
        memory_id: "memory-project",
        canonical_text: "The user prefers concise validation reports.",
      });
    } finally {
      await database.close();
    }
  });

  it("uses lexical recall text to prioritize reconciliation neighbors before recency", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-relevant-older"),
        canonical_text: "The project deploys model memory validation to us-east-1.",
        search_text: "project deploys model memory validation us-east-1",
        scope: {
          ...buildMinimalDurableMemory("memory-relevant-older").scope,
          project_id: "project-001",
        },
        updated_at: "2026-04-20T00:00:00.000Z",
      });
      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-unrelated-newer"),
        canonical_text: "The user prefers concise validation reports.",
        search_text: "user prefers concise validation reports",
        scope: {
          ...buildMinimalDurableMemory("memory-unrelated-newer").scope,
          project_id: "project-001",
        },
        updated_at: "2026-04-22T00:00:00.000Z",
      });

      const summaries = await repository.listExistingMemorySummariesForCapture({
        projectId: "project-001",
        queryText: "Confirm the model memory deployment remains in us-east-1.",
        limit: 10,
      });

      expect(summaries.map((entry) => entry.memory_id)).toEqual([
        "memory-relevant-older",
        "memory-unrelated-newer",
      ]);
    } finally {
      await database.close();
    }
  });

  it("includes exact structural memory_id targets in reconciliation recall pools", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new MmV2NativeRepository(database.sql);

      await repository.upsertDurableMemory({
        ...buildMinimalDurableMemory("memory-explicit-target"),
        canonical_text: "The user prefers detailed implementation notes.",
        search_text: "user prefers detailed implementation notes",
      });

      const summaries = await repository.listExistingMemorySummariesForCapture({
        memoryIds: ["memory-explicit-target"],
        queryText: "unrelated correction text with no lexical overlap",
        limit: 10,
      });

      expect(summaries.map((entry) => entry.memory_id)).toEqual(["memory-explicit-target"]);
    } finally {
      await database.close();
    }
  });
});
