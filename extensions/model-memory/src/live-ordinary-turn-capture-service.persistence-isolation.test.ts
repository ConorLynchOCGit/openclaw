import { afterEach, describe, expect, it, vi } from "vitest";
import { applyModelMemoryMigrations } from "./db/migrations.ts";
import { MmV2NativeRepository } from "./db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeContextRepository } from "./db/runtime-context-repository.ts";
import { captureOrdinaryTurnLive } from "./live-ordinary-turn-capture-service.ts";
import type { DurableMemoryRecord, MemoryEvent } from "./mmv2/contracts.ts";
import { adaptOrdinaryTurnSource } from "./source-adapters/ordinary-turn-source-adapter.ts";

const captureOrdinaryTurnV2ForLiveStorageMock = vi.hoisted(() => vi.fn());

vi.mock("./mmv2/live-document-ingestion.ts", async (importActual) => {
  const actual = await importActual<typeof import("./mmv2/live-document-ingestion.ts")>();
  return {
    ...actual,
    captureOrdinaryTurnV2ForLiveStorage: captureOrdinaryTurnV2ForLiveStorageMock,
  };
});

class FailingOrdinaryTurnRepository extends MmV2NativeRepository {
  constructor(
    sql: ConstructorParameters<typeof MmV2NativeRepository>[0],
    private readonly failingCandidateIds: ReadonlySet<string>,
  ) {
    super(sql);
  }

  override withTransaction<T>(
    work: (repository: FailingOrdinaryTurnRepository) => Promise<T>,
  ): Promise<T> {
    return this.sql.withTransaction((tx) =>
      work(new FailingOrdinaryTurnRepository(tx, this.failingCandidateIds)),
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
}

function buildOrdinaryTurnMemory(input: {
  memoryId: string;
  candidateId: string;
  canonicalText: string;
  searchText: string;
  object: string;
  sourceId: string;
  sourceEventId: string;
  segmentId: string;
}): DurableMemoryRecord {
  return {
    memory_id: input.memoryId,
    schema_version: "durable_memory.v1",
    status: "active",
    unit_type: "atomic",
    kind: "claim",
    artifact_type: null,
    canonical_text: input.canonicalText,
    search_text: input.searchText,
    scope: {
      tenant_id: "openclaw",
      user_id: "unknown-user",
      project_id: null,
      workspace_id: null,
      subject_type: "user",
      subject_id: "unknown-user",
      applies_to: "global",
    },
    payload: {
      payload_type: "claim",
      claim_type: "preference_state",
      subject: "status update ordering",
      predicate: "prefers",
      object: input.object,
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
        source_ingest_event_id: input.sourceEventId,
        source_type: "conversation_turn",
        source_id: input.sourceId,
        speaker: "user",
        created_at: "2026-04-24T00:00:00.000Z",
        segment_id: input.segmentId,
        start_char: 0,
        end_char: 0,
        evidence_quote: input.canonicalText,
      },
    ],
    lineage: {
      candidate_ids: [input.candidateId],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: "2026-04-24T00:00:00.000Z",
    updated_at: "2026-04-24T00:00:00.000Z",
    last_accessed_at: null,
    access_count: 0,
    tags: ["claim"],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("live-ordinary-turn-capture-service persistence isolation", () => {
  it("keeps one ordinary-turn candidate live when a sibling event fails and an edge is deferred", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new FailingOrdinaryTurnRepository(
        database.sql,
        new Set(["candidate-bad"]),
      );
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const envelope = adaptOrdinaryTurnSource({
        currentTurnText:
          "Standing preference: start with the outcome first. Standing preference: use concise headings for status updates.",
        sessionId: "session-persistence-isolation",
      });
      const segmentId = envelope.windows[0]?.blockDescriptors[0]?.id ?? envelope.windows[0].id;
      captureOrdinaryTurnV2ForLiveStorageMock.mockResolvedValue({
        source: envelope.source,
        windows: envelope.windows,
        windowResults: [
          {
            sourceWindowId: envelope.windows[0].id,
            action: "capture",
            objects: [],
          },
        ],
        capturedObjects: [],
        mmv2LiveRecording: {
          durableMemories: [
            buildOrdinaryTurnMemory({
              memoryId: "memory-valid",
              candidateId: "candidate-valid",
              canonicalText: "Status update ordering prefers outcome first.",
              searchText: "status update ordering prefers outcome first",
              object: "outcome first",
              sourceId: envelope.source.id,
              sourceEventId: "ordinary-turn-source-event-001",
              segmentId,
            }),
            buildOrdinaryTurnMemory({
              memoryId: "memory-bad",
              candidateId: "candidate-bad",
              canonicalText: "Status update ordering prefers concise headings.",
              searchText: "status update ordering prefers concise headings",
              object: "concise headings",
              sourceId: envelope.source.id,
              sourceEventId: "ordinary-turn-source-event-001",
              segmentId,
            }),
          ],
          memoryEvents: [
            {
              memory_event_id: "event-valid",
              schema_version: "memory_event.v1",
              event_type: "memory_inserted",
              occurred_at: "2026-04-24T00:00:00.000Z",
              actor: "system",
              source_ingest_event_id: "ordinary-turn-source-event-001",
              candidate_id: "candidate-valid",
              memory_id: "memory-valid",
              target_memory_ids: ["missing-conflict-target"],
              payload: {
                admission_decision: "admit",
                reconciliation_decision: "record_as_conflict",
                reconciliation_conflict_type: "scope_narrowing",
              },
            },
            {
              memory_event_id: "event-bad",
              schema_version: "memory_event.v1",
              event_type: "memory_inserted",
              occurred_at: "2026-04-24T00:00:00.000Z",
              actor: "system",
              source_ingest_event_id: "ordinary-turn-source-event-001",
              candidate_id: "candidate-bad",
              memory_id: "memory-bad",
              target_memory_ids: [],
              payload: {
                admission_decision: "admit",
                reconciliation_decision: "insert_new",
                reconciliation_conflict_type: "none",
              },
            },
          ],
          memoryEdges: [
            {
              edge_id: "edge-ordinary-missing",
              schema_version: "memory_edge.v1",
              from_memory_id: "memory-valid",
              to_memory_id: "missing-conflict-target",
              edge_type: "conflicts_with",
              created_at: "2026-04-24T00:00:00.000Z",
              metadata: { candidate_id: "candidate-valid" },
            },
          ],
        },
      });

      const result = await captureOrdinaryTurnLive({
        canonicalRepository,
        runtimeRepository,
        capture: {
          turn: {
            currentTurnText:
              "Standing preference: start with the outcome first. Standing preference: use concise headings for status updates.",
            sessionId: "session-persistence-isolation",
          },
          modelId: "model-turn-001",
          candidateModelId: "model-turn-001",
          interpreter: {
            interpret: async () => {
              throw new Error("ordinary-turn live storage mock should bypass interpreter use");
            },
          },
        },
      });

      expect(result.persistenceResult?.durableMemoriesWritten).toEqual(["memory-valid"]);
      expect(result.persistenceResult?.memoryEventsWritten).toEqual(["event-valid"]);
      expect(result.persistenceResult?.deferredCandidates).toEqual([
        expect.objectContaining({
          memory_id: "memory-bad",
          reason: expect.stringContaining("forced event failure for candidate-bad"),
        }),
      ]);
      expect(result.persistenceResult?.deferredEdges).toEqual([
        expect.objectContaining({
          edge_id: "edge-ordinary-missing",
          to_memory_id: "missing-conflict-target",
        }),
      ]);
      expect(await canonicalRepository.getDurableMemory("memory-valid")).toBeDefined();
      expect(await canonicalRepository.getDurableMemory("memory-bad")).toBeUndefined();
      expect(await canonicalRepository.listMemoryEvents()).toEqual([
        expect.objectContaining({
          memory_event_id: "event-valid",
          payload: expect.objectContaining({
            deferred_memory_edges: [
              expect.objectContaining({
                edge_id: "edge-ordinary-missing",
                to_memory_id: "missing-conflict-target",
              }),
            ],
          }),
        }),
      ]);
      expect(result.writeResults).toHaveLength(1);
      expect(result.writeResults[0]?.memoryId).toBe("memory-valid");
      expect(result.ingestionTelemetry[1]?.candidate_counts).toMatchObject({
        admitted: 1,
        rejected: 1,
      });
      expect(result.ingestionTelemetry[1]?.ids?.memory_ids).toEqual(["memory-valid"]);
    } finally {
      await database.close();
    }
  });
});
