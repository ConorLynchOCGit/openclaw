import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapturedPluginRegistration } from "../../../src/test-utils/plugin-registration.ts";
import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "./mmv2/contracts.ts";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "./model-execution.ts";
import { createModelMemoryGetTool, createModelMemorySearchTool } from "./read-tools.ts";

function fakeApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  const captured = createCapturedPluginRegistration();
  return {
    ...captured.api,
    config: {},
    ...overrides,
  };
}

function buildDurableMemory(overrides: Partial<DurableMemoryRecord> = {}): DurableMemoryRecord {
  return {
    memory_id: overrides.memory_id ?? "memory-deployment",
    schema_version: "durable_memory.v1",
    status: overrides.status ?? "active",
    unit_type: overrides.unit_type ?? "atomic",
    kind: overrides.kind ?? "claim",
    artifact_type: overrides.artifact_type ?? null,
    canonical_text: overrides.canonical_text ?? "Deployment region is region-001.",
    search_text: overrides.search_text ?? "deployment region region-001",
    scope: overrides.scope ?? {
      tenant_id: "openclaw",
      user_id: "user-001",
      project_id: "project-001",
      workspace_id: null,
      subject_type: "project",
      subject_id: "project-001",
      applies_to: "current_project",
    },
    payload: overrides.payload ?? {
      claim_type: "project_fact",
      subject: "deployment region",
      predicate: "is",
      object: "region-001",
    },
    validity: overrides.validity ?? {
      valid_at: null,
      invalid_at: null,
      ttl_seconds: null,
      temporal_status: "current",
    },
    confidence: overrides.confidence ?? 0.92,
    quality: overrides.quality ?? {
      atomicity: 0.95,
      specificity: 0.8,
      durability: 0.75,
      actionability: 0.6,
      grounding: 1,
    },
    source_refs: overrides.source_refs ?? [
      {
        source_ingest_event_id: "event-001",
        source_type: "document",
        source_id: "doc-001",
        speaker: "system",
        created_at: "2026-04-23T00:00:00.000Z",
        segment_id: "segment-001",
        start_char: 0,
        end_char: 31,
        evidence_quote: "Deployment region is region-001.",
      },
    ],
    lineage: overrides.lineage ?? {
      candidate_ids: ["candidate-001"],
      derived_from_memory_ids: [],
      supersedes_memory_ids: [],
      superseded_by_memory_id: null,
      conflicts_with_memory_ids: [],
      parent_memory_id: null,
      child_memory_ids: [],
    },
    created_at: overrides.created_at ?? "2026-04-23T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2026-04-23T00:00:01.000Z",
    last_accessed_at: overrides.last_accessed_at ?? null,
    access_count: overrides.access_count ?? 0,
    tags: overrides.tags ?? ["project", "fact"],
  };
}

class FakeRetrievalFinalInclusionExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  async execute(request: JsonModelExecutionRequest) {
    this.requests.push(request);
    return {
      outputText: JSON.stringify({
        schemaVersion: "retrieval_final_inclusion_decision.v1",
        decision: "select",
        selectedMemoryObjectIds: ["memory-deployment"],
        why: "Scripted model final inclusion for the read tool search fixture.",
      }),
      resolvedModelId: request.contract.modelId,
      usage: { promptTokens: 100, outputTokens: 40 },
    };
  }
}

describe("model-memory read tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches MMV2 runtime records and reports selected projection digests", async () => {
    const poolEnd = vi.fn(async () => undefined);
    const finalInclusionExecutor = new FakeRetrievalFinalInclusionExecutor();
    const tool = createModelMemorySearchTool(fakeApi(), {
      loadInternalRuntimeDeps: async () => ({
        createLiveJsonExecutor: vi.fn(async () => finalInclusionExecutor),
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {
            listDurableMemories: vi.fn(async () => [buildDurableMemory()]),
            listMemoryEvents: vi.fn(async () => []),
            listMemoryEdges: vi.fn(async () => []),
          },
          runtimeRepository: {
            listProjectionVersions: vi.fn(async () => [
              {
                id: "projection-project",
                targetId: "project-page",
                projectionType: "project_page",
                contentHash: "hash-project",
                canonicalArtifactPath: ".openclaw/model-memory/projections/project.md",
                sourceObjectIds: ["memory-deployment"],
                sourceEventIds: ["event-001"],
                sourceEdgeIds: [],
                sourceSlotKeys: [],
                sourceSetKeys: [],
                tokenEstimate: 12,
                builtAt: new Date("2026-04-23T00:00:05.000Z"),
                freshness: { status: "fresh" },
                staleMarkers: [],
                conflictMarkers: [],
                retrievalDigest: {
                  title: "Project digest",
                  summary: "Deployment region remains region-001.",
                  sourceMemoryIds: ["memory-deployment"],
                  sourceEventIds: ["event-001"],
                  contentHash: "hash-project",
                },
              },
            ]),
          },
          pool: { end: poolEnd },
        })) as never,
      }),
    });

    const result = await tool.execute("tool-1", {
      query: "deployment region",
      maxResults: 3,
      projectId: "project-001",
    });
    const payload = result.details as {
      ok: boolean;
      results: Array<{ id: string; canonicalClass: string; kind: string }>;
      topResult?: { id: string };
      projections: Array<{ projectionId: string; sourceMemoryIdCount: number }>;
      metrics: {
        selectedProjectionIds?: string[];
        emptyRetrievalReason?: string;
        selectedSourceMemoryIdCount?: number;
        missDiagnosticCount?: number;
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.results[0]).toMatchObject({
      id: "memory-deployment",
      canonicalClass: "project",
      kind: "fact",
    });
    expect(payload.topResult).toMatchObject({ id: "memory-deployment" });
    expect(payload.projections[0]).toMatchObject({
      projectionId: "projection-project",
      sourceMemoryIdCount: 1,
    });
    expect(payload.metrics.selectedProjectionIds).toEqual(["projection-project"]);
    expect(payload.metrics.selectedSourceMemoryIdCount).toBe(1);
    expect(payload.metrics.emptyRetrievalReason).toBe("none");
    expect(JSON.stringify(payload)).not.toContain("missDiagnostics");
    expect(JSON.stringify(payload)).not.toContain("selectedSourceMemoryIds");
    expect(finalInclusionExecutor.requests[0]?.contract.contractName).toBe(
      "retrieval_final_inclusion",
    );
    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it("reads a specific MMV2 memory with bounded lineage details", async () => {
    const memory = buildDurableMemory();
    const event: MemoryEvent = {
      memory_event_id: "event-001",
      schema_version: "memory_event.v1",
      event_type: "memory_inserted",
      occurred_at: "2026-04-23T00:00:01.000Z",
      actor: "model",
      source_ingest_event_id: "ingest-001",
      candidate_id: "candidate-001",
      memory_id: "memory-deployment",
      target_memory_ids: [],
      payload: {},
    };
    const edge: MemoryEdge = {
      edge_id: "edge-001",
      schema_version: "memory_edge.v1",
      from_memory_id: "memory-deployment",
      to_memory_id: "memory-parent",
      edge_type: "references",
      created_at: "2026-04-23T00:00:02.000Z",
      metadata: {},
    };

    const tool = createModelMemoryGetTool(fakeApi(), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {
            listDurableMemories: vi.fn(async () => [memory]),
            listMemoryEvents: vi.fn(async () => [event]),
            listMemoryEdges: vi.fn(async () => [edge]),
            getDurableMemory: vi.fn(async () => memory),
          },
          runtimeRepository: {
            listProjectionVersions: vi.fn(async () => []),
          },
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
      }),
    });

    const result = await tool.execute("tool-2", {
      id: "memory-deployment",
      kind: "memory",
      includeLineage: true,
    });
    const payload = result.details as {
      ok: boolean;
      lookupKind: string;
      durableMemory?: { memoryId: string; canonicalText: string };
      lineage?: {
        relatedEvents: Array<{ id: string }>;
        relatedEdges: Array<{ id: string }>;
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.lookupKind).toBe("memory");
    expect(payload.durableMemory).toMatchObject({
      memoryId: "memory-deployment",
      canonicalText: "Deployment region is region-001.",
    });
    expect(payload.lineage?.relatedEvents).toEqual([
      {
        id: "event-001",
        eventType: "memory_inserted",
        occurredAt: "2026-04-23T00:00:01.000Z",
        candidateId: "candidate-001",
        memoryId: "memory-deployment",
        targetMemoryIds: [],
      },
    ]);
    expect(payload.lineage?.relatedEdges).toEqual([
      {
        id: "edge-001",
        edgeType: "references",
        fromMemoryId: "memory-deployment",
        toMemoryId: "memory-parent",
        createdAt: "2026-04-23T00:00:02.000Z",
      },
    ]);
  });

  it("reads a projection by id when requested", async () => {
    const tool = createModelMemoryGetTool(fakeApi(), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {
            listDurableMemories: vi.fn(async () => []),
          },
          runtimeRepository: {
            listProjectionVersions: vi.fn(async () => [
              {
                id: "projection-project",
                targetId: "project-page",
                projectionType: "project_page",
                contentHash: "hash-project",
                canonicalArtifactPath: ".openclaw/model-memory/projections/project.md",
                sourceObjectIds: ["memory-deployment"],
                sourceEventIds: ["event-001"],
                sourceEdgeIds: [],
                sourceSlotKeys: [],
                sourceSetKeys: [],
                tokenEstimate: 12,
                builtAt: new Date("2026-04-23T00:00:05.000Z"),
                freshness: { status: "fresh" },
                staleMarkers: [],
                conflictMarkers: [],
              },
            ]),
          },
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
      }),
    });

    const result = await tool.execute("tool-3", {
      id: "projection-project",
      kind: "projection",
    });
    const payload = result.details as {
      ok: boolean;
      lookupKind: string;
      projection?: { id: string; targetId: string };
    };

    expect(payload.ok).toBe(true);
    expect(payload.lookupKind).toBe("projection");
    expect(payload.projection).toMatchObject({
      id: "projection-project",
      targetId: "project-page",
    });
  });

  it("returns a bounded unavailable payload when runtime setup fails", async () => {
    const tool = createModelMemorySearchTool(fakeApi(), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => {
          throw new Error("database unavailable");
        }) as never,
      }),
    });

    const result = await tool.execute("tool-4", { query: "deployment" });
    expect(result.details).toMatchObject({
      ok: false,
      unavailable: true,
      error: "database unavailable",
    });
  });
});
