import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyModelMemoryMigrations,
  createPgMemTestDatabase,
  MmV2NativeRepository,
  type MemoryEvent,
} from "../../extensions/model-memory/runtime-api.ts";
import type { OpenClawConfig } from "../config/config.js";
import { createModelMemoryRuntimeDirtyStore } from "./model-memory.runtime-dirty.js";

const createModelMemoryDatabaseRuntimeMock = vi.hoisted(() => vi.fn());
const buildToolResultProofLiveCaptureMock = vi.hoisted(() => vi.fn());

vi.mock("./model-memory.database.js", async (importActual) => {
  const actual = await importActual<typeof import("./model-memory.database.js")>();
  return {
    ...actual,
    createModelMemoryDatabaseRuntime: createModelMemoryDatabaseRuntimeMock,
  };
});

vi.mock("../plugin-sdk/model-memory.js", async (importActual) => {
  const actual = await importActual<typeof import("../plugin-sdk/model-memory.js")>();
  return {
    ...actual,
    buildToolResultProofLiveCapture: buildToolResultProofLiveCaptureMock,
  };
});

import {
  __resetModelMemoryLiveRuntimeForTest,
  captureModelMemoryToolResultProof,
} from "./model-memory.live-runtime.ts";

class FailingToolResultRepository extends MmV2NativeRepository {
  constructor(
    sql: ConstructorParameters<typeof MmV2NativeRepository>[0],
    private readonly failingCandidateIds: ReadonlySet<string>,
  ) {
    super(sql);
  }

  override withTransaction<T>(
    work: (repository: FailingToolResultRepository) => Promise<T>,
  ): Promise<T> {
    return this.sql.withTransaction((tx) =>
      work(new FailingToolResultRepository(tx, this.failingCandidateIds)),
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

afterEach(() => {
  __resetModelMemoryLiveRuntimeForTest();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("captureModelMemoryToolResultProof persistence isolation", () => {
  it("keeps one tool-result candidate when a sibling event fails and an edge is deferred", async () => {
    const database = await createPgMemTestDatabase();
    let stateDir: string | undefined;
    try {
      await applyModelMemoryMigrations(database.sql);
      const repository = new FailingToolResultRepository(database.sql, new Set(["candidate-bad"]));
      let canonicalRepository: {
        withDbLane: () => typeof canonicalRepository;
        withTransaction: (
          work: (repository: typeof canonicalRepository) => Promise<unknown>,
        ) => Promise<unknown>;
        persistSource: <T>(source: T) => Promise<T>;
        persistSourceWindows: <T>(windows: T[]) => Promise<T[]>;
        persistLiveMemoryBatch: typeof repository.persistLiveMemoryBatch;
      };
      canonicalRepository = {
        withDbLane: () => canonicalRepository,
        withTransaction: async (
          work: (repository: typeof canonicalRepository) => Promise<unknown>,
        ) => await work(canonicalRepository),
        persistSource: async <T>(source: T) => source,
        persistSourceWindows: async <T>(windows: T[]) => windows,
        persistLiveMemoryBatch: repository.persistLiveMemoryBatch.bind(repository),
      };
      createModelMemoryDatabaseRuntimeMock.mockResolvedValue({
        canonicalRepository,
        runtimeRepository: {},
        dbLaneController: {
          shouldDeferLane: () => false,
          snapshot: () => ({ reasons: [] }),
        },
      });
      buildToolResultProofLiveCaptureMock.mockReturnValue({
        source: {
          id: "tool-source-001",
          sourceFingerprint: "tool-source-hash-001",
        },
        windows: [{ id: "tool-segment-001" }],
        boundedFact: { toolName: "gateway_read", status: "success" },
        liveMemoryBatch: {
          durableMemories: [
            {
              memory_id: "memory-valid",
              schema_version: "durable_memory.v1",
              status: "active",
              unit_type: "atomic",
              kind: "claim",
              artifact_type: null,
              canonical_text: "The tool run found the operator-ready report path.",
              search_text: "tool run found operator ready report path",
              scope: {
                tenant_id: "openclaw",
                user_id: "unknown-user",
                project_id: null,
                workspace_id: null,
                subject_type: "system",
                subject_id: null,
                applies_to: "current_workspace",
              },
              payload: {
                payload_type: "claim",
                claim_type: "tool_fact",
                subject: "tool run",
                predicate: "found",
                object: "operator-ready report path",
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
                  source_ingest_event_id: "tool-source-event-001",
                  source_type: "conversation_turn",
                  source_id: "tool-source-001",
                  speaker: "system",
                  created_at: "2026-04-24T00:00:00.000Z",
                  segment_id: "tool-segment-001",
                  start_char: 0,
                  end_char: 0,
                  evidence_quote: "Tool result found operator-ready report path.",
                },
              ],
              lineage: {
                candidate_ids: ["candidate-valid"],
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
            },
            {
              memory_id: "memory-bad",
              schema_version: "durable_memory.v1",
              status: "active",
              unit_type: "atomic",
              kind: "claim",
              artifact_type: null,
              canonical_text: "The tool run found concise heading guidance.",
              search_text: "tool run found concise heading guidance",
              scope: {
                tenant_id: "openclaw",
                user_id: "unknown-user",
                project_id: null,
                workspace_id: null,
                subject_type: "system",
                subject_id: null,
                applies_to: "current_workspace",
              },
              payload: {
                payload_type: "claim",
                claim_type: "tool_fact",
                subject: "tool run",
                predicate: "found",
                object: "concise heading guidance",
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
                  source_ingest_event_id: "tool-source-event-001",
                  source_type: "conversation_turn",
                  source_id: "tool-source-001",
                  speaker: "system",
                  created_at: "2026-04-24T00:00:00.000Z",
                  segment_id: "tool-segment-001",
                  start_char: 0,
                  end_char: 0,
                  evidence_quote: "Tool result found concise heading guidance.",
                },
              ],
              lineage: {
                candidate_ids: ["candidate-bad"],
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
            },
          ],
          memoryEdges: [
            {
              edge_id: "edge-tool-missing",
              schema_version: "memory_edge.v1",
              from_memory_id: "memory-valid",
              to_memory_id: "missing-tool-target",
              edge_type: "conflicts_with",
              created_at: "2026-04-24T00:00:00.000Z",
              metadata: { reason: "mixed-batch-proof" },
            },
          ],
          memoryEvents: [
            {
              memory_event_id: "event-valid",
              schema_version: "memory_event.v1",
              event_type: "memory_inserted",
              occurred_at: "2026-04-24T00:00:00.000Z",
              actor: "system",
              source_ingest_event_id: "tool-source-event-001",
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
              source_ingest_event_id: "tool-source-event-001",
              candidate_id: "candidate-bad",
              memory_id: "memory-bad",
              target_memory_ids: [],
              payload: { decision: "write" },
            },
          ],
        },
      });
      stateDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-tool-result-persistence-"));
      vi.stubEnv("OPENCLAW_STATE_DIR", stateDir);
      vi.stubEnv("MODEL_MEMORY_CAPTURE_SEAMS_ENABLED", "1");
      vi.stubEnv("MODEL_MEMORY_RUNTIME_REBUILD_ENABLED", "false");
      const config: OpenClawConfig = {
        plugins: {
          entries: {
            "model-memory": {
              enabled: true,
              config: {
                database: {
                  url: "postgresql://user:pass@example.com:5432/model_memory_live",
                },
                live: {
                  enabled: true,
                },
              },
            },
          },
        },
      };

      const result = await captureModelMemoryToolResultProof({
        config,
        hookName: "after_tool_call",
        toolName: "gateway_read",
        toolCallId: "tool-call-001",
        runId: "run-001",
        sessionId: "session-001",
        sessionKey: "agent:main:main",
        agentId: "main",
        result: { ok: true },
      });

      expect(result).toMatchObject({
        captured: true,
        sourceId: "tool-source-001",
        memoryIds: ["memory-valid"],
        eventIds: ["event-valid"],
      });
      expect(await repository.getDurableMemory("memory-valid")).toBeDefined();
      expect(await repository.getDurableMemory("memory-bad")).toBeUndefined();
      expect(await repository.listMemoryEvents()).toEqual([
        expect.objectContaining({
          memory_event_id: "event-valid",
          payload: expect.objectContaining({
            deferred_memory_edges: [
              expect.objectContaining({
                edge_id: "edge-tool-missing",
                to_memory_id: "missing-tool-target",
              }),
            ],
          }),
        }),
      ]);
      const dirtyState = await createModelMemoryRuntimeDirtyStore({ env: process.env }).getState();
      expect(dirtyState.traceIds).toEqual([
        expect.stringMatching(/^memory_trace_tool_[a-f0-9]{24}$/),
      ]);
      const closeoutPath = path.join(
        stateDir,
        "model-memory",
        "closeout-reports",
        "tool_result_capture",
        "run-001.closeout.json",
      );
      const closeout = JSON.parse(await readFile(closeoutPath, "utf8")) as {
        trace_id?: string;
      };
      expect(closeout.trace_id).toMatch(/^memory_trace_tool_[a-f0-9]{24}$/);
    } finally {
      if (stateDir) {
        await rm(stateDir, { recursive: true, force: true });
      }
      await database.close();
    }
  });
});
