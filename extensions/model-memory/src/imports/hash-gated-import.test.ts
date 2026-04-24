import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyModelMemoryMigrations } from "../db/migrations.ts";
import { MmV2NativeRepository } from "../db/mmv2-native-repository.ts";
import { createPgMemTestDatabase } from "../db/pg-test.ts";
import type { DurableMemoryRecord, MemoryEvent } from "../mmv2/contracts.ts";
import { createHashGatedImportStore } from "./hash-gated-import.ts";

describe("hash-gated memory imports", () => {
  let tempDir: string;
  let sourcePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "hash-gated-import-"));
    sourcePath = path.join(tempDir, "MEMORY.md");
    await writeFile(sourcePath, "Human-owned memory file\n- stable fact\n", "utf8");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function buildImportMemory(memoryId: string, candidateId: string): DurableMemoryRecord {
    return {
      memory_id: memoryId,
      schema_version: "durable_memory.v1",
      status: "active",
      unit_type: "atomic",
      kind: "claim",
      artifact_type: null,
      canonical_text:
        candidateId === "candidate-valid"
          ? "The workspace import prefers result-first summaries."
          : "The workspace import prefers concise headings.",
      search_text:
        candidateId === "candidate-valid"
          ? "workspace import prefers result first summaries"
          : "workspace import prefers concise headings",
      scope: {
        tenant_id: "openclaw",
        user_id: "unknown-user",
        project_id: null,
        workspace_id: "workspace-001",
        subject_type: "workspace",
        subject_id: "workspace-001",
        applies_to: "current_workspace",
      },
      payload: {
        payload_type: "claim",
        claim_type: "preference_state",
        subject: "workspace import",
        predicate: "prefers",
        object: candidateId === "candidate-valid" ? "result-first summaries" : "concise headings",
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
          source_ingest_event_id: "import-event-001",
          source_type: "document",
          source_id: "import-source-001",
          speaker: "user",
          created_at: "2026-04-24T00:00:00.000Z",
          segment_id: "segment-001",
          start_char: 0,
          end_char: 0,
          evidence_quote: "Imported memory-file preference.",
        },
      ],
      lineage: {
        candidate_ids: [candidateId],
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

  class FailingImportRepository extends MmV2NativeRepository {
    constructor(
      sql: ConstructorParameters<typeof MmV2NativeRepository>[0],
      private readonly failingCandidateIds: ReadonlySet<string>,
    ) {
      super(sql);
    }

    override withTransaction<T>(
      work: (repository: FailingImportRepository) => Promise<T>,
    ): Promise<T> {
      return this.sql.withTransaction((tx) =>
        work(new FailingImportRepository(tx, this.failingCandidateIds)),
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

  it("imports changed content once and skips unchanged hashes without storing raw file text", async () => {
    const store = createHashGatedImportStore({
      baseDir: path.join(tempDir, "state"),
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: path.join(tempDir, "runtime-state"),
      },
    });
    const onChanged = vi.fn(async () => ({
      sourceId: "source-memory-md",
      memoryIds: ["memory-1"],
      eventIds: ["event-1"],
    }));

    const first = await store.evaluate({
      source: {
        sourceId: "root-memory-md",
        sourceType: "root_memory_md",
        absolutePath: sourcePath,
        authority: "root_compatibility",
        importedBy: "test",
      },
      importedAt: new Date("2026-04-23T00:00:00.000Z"),
      onChanged,
    });
    const second = await store.evaluate({
      source: {
        sourceId: "root-memory-md",
        sourceType: "root_memory_md",
        absolutePath: sourcePath,
        authority: "root_compatibility",
        importedBy: "test",
      },
      importedAt: new Date("2026-04-23T00:01:00.000Z"),
      onChanged,
    });

    expect(first.status).toBe("written");
    expect(second.status).toBe("skipped");
    expect(first.closeoutArtifact?.path).toContain(
      path.join("model-memory", "closeout-reports", "memory_file_import"),
    );
    expect(second.closeoutArtifact?.report.path).toBe("memory_file_import");
    expect(onChanged).toHaveBeenCalledTimes(1);
    const stateText = await readFile(path.join(tempDir, "state/state.json"), "utf8");
    const eventText = await readFile(path.join(tempDir, "state/events.jsonl"), "utf8");
    expect(stateText).toContain("model_memory_hash_gated_import_state.v1");
    expect(eventText).toContain("import_written");
    expect(eventText).toContain("import_skipped");
    expect(stateText).not.toContain("Human-owned memory file");
    expect(eventText).not.toContain("stable fact");
    expect(JSON.parse(stateText).records[0]).toMatchObject({
      source_id: "root-memory-md",
      source_type: "root_memory_md",
      raw_content_persisted: false,
      generated_root_write_back: false,
      import_count: 1,
    });
  });

  it("reimports changed content and records safe provenance metadata only", async () => {
    const store = createHashGatedImportStore({
      baseDir: path.join(tempDir, "state"),
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: path.join(tempDir, "runtime-state"),
      },
    });
    const source = {
      sourceId: "daily-note",
      sourceType: "daily_note" as const,
      absolutePath: sourcePath,
      authority: "workspace_note" as const,
      importedBy: "test",
    };

    await store.evaluate({ source });
    await writeFile(sourcePath, "Human-owned memory file\n- changed fact\n", "utf8");
    const result = await store.evaluate({ source });

    expect(result.status).toBe("written");
    const records = await store.readState();
    expect(records[0]?.import_count).toBe(2);
    expect(records[0]?.bounded_evidence_hashes[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(records)).not.toContain("changed fact");
    expect(result.closeoutArtifact?.report.counts.candidates_admitted).toBe(0);
  });

  it("emits bootstrap closeout artifacts for bootstrap imports and classifies failures safely", async () => {
    const store = createHashGatedImportStore({
      baseDir: path.join(tempDir, "state"),
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: path.join(tempDir, "runtime-state"),
      },
    });

    const result = await store.evaluate({
      source: {
        sourceId: "bootstrap-agent-main",
        sourceType: "agent_bootstrap",
        absolutePath: sourcePath,
        authority: "bootstrap",
        importedBy: "test",
      },
      onChanged: async () => {
        throw new Error("connection terminated while staging bootstrap import");
      },
    });

    expect(result.status).toBe("failed");
    expect(result.closeoutArtifact?.path).toContain(
      path.join("model-memory", "closeout-reports", "bootstrap_import"),
    );
    expect(result.closeoutArtifact?.report.failure_class_breakdown.provider_connection).toBe(1);
    expect(JSON.stringify(result.closeoutArtifact?.report)).not.toContain("stable fact");
  });

  it("keeps one imported candidate when a sibling event fails and an edge is deferred", async () => {
    const database = await createPgMemTestDatabase();
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new FailingImportRepository(database.sql, new Set(["candidate-bad"]));
      const store = createHashGatedImportStore({
        baseDir: path.join(tempDir, "state"),
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: path.join(tempDir, "runtime-state"),
        },
      });

      const result = await store.evaluate({
        source: {
          sourceId: "memory-file-persistence-proof",
          sourceType: "root_memory_md",
          absolutePath: sourcePath,
          authority: "root_compatibility",
          importedBy: "test",
        },
        importedAt: new Date("2026-04-24T00:00:00.000Z"),
        onChanged: async ({ sourceHash }) => {
          const persistenceResult = await repository.persistLiveMemoryBatch({
            durableMemories: [
              buildImportMemory("memory-valid", "candidate-valid"),
              buildImportMemory("memory-bad", "candidate-bad"),
            ],
            memoryEdges: [
              {
                edge_id: "edge-import-missing",
                schema_version: "memory_edge.v1",
                from_memory_id: "memory-valid",
                to_memory_id: "missing-import-target",
                edge_type: "conflicts_with",
                created_at: "2026-04-24T00:00:00.000Z",
                metadata: { source_hash: sourceHash },
              },
            ],
            memoryEvents: [
              {
                memory_event_id: "event-valid",
                schema_version: "memory_event.v1",
                event_type: "memory_inserted",
                occurred_at: "2026-04-24T00:00:00.000Z",
                actor: "system",
                source_ingest_event_id: "import-event-001",
                candidate_id: "candidate-valid",
                memory_id: "memory-valid",
                target_memory_ids: [],
                payload: { decision: "write" },
              },
              {
                memory_event_id: "event-bad",
                schema_version: "memory_event.v1",
                event_type: "memory_inserted",
                occurred_at: "2026-04-24T00:00:00.000Z",
                actor: "system",
                source_ingest_event_id: "import-event-001",
                candidate_id: "candidate-bad",
                memory_id: "memory-bad",
                target_memory_ids: [],
                payload: { decision: "write" },
              },
            ],
          });
          expect(persistenceResult.deferredCandidates).toHaveLength(1);
          expect(persistenceResult.deferredEdges).toEqual([
            expect.objectContaining({
              edge_id: "edge-import-missing",
              to_memory_id: "missing-import-target",
            }),
          ]);
          return {
            sourceId: "import-source-001",
            memoryIds: persistenceResult.durableMemoriesWritten,
            eventIds: persistenceResult.memoryEventsWritten,
          };
        },
      });

      expect(result.status).toBe("written");
      if (result.status !== "written") {
        throw new Error(`expected written import result, received ${result.status}`);
      }
      expect(await repository.getDurableMemory("memory-valid")).toBeDefined();
      expect(await repository.getDurableMemory("memory-bad")).toBeUndefined();
      expect(await repository.listMemoryEvents()).toEqual([
        expect.objectContaining({
          memory_event_id: "event-valid",
          payload: expect.objectContaining({
            deferred_memory_edges: [
              expect.objectContaining({
                edge_id: "edge-import-missing",
              }),
            ],
          }),
        }),
      ]);
      expect(result.importedIds).toEqual({
        sourceId: "import-source-001",
        memoryIds: ["memory-valid"],
        eventIds: ["event-valid"],
      });
      expect(result.closeoutArtifact?.report.counts.candidates_admitted).toBe(1);
      expect(result.closeoutArtifact?.report.failure_class_breakdown).toEqual({});
      expect(JSON.stringify(result.closeoutArtifact?.report)).not.toContain(
        "Human-owned memory file",
      );
    } finally {
      await database.close();
    }
  });
});
