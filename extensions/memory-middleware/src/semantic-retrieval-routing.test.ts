import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryObjectSearchHybridResult } from "./db/runtime.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";
import { maybeApplyProcedureSemanticFallback } from "./semantic-retrieval-routing.js";

const embedMemorySearchQuery = vi.hoisted(() =>
  vi.fn(async () => ({
    embedding: [0.1, 0.2, 0.3],
    embeddingModel: "test-embed",
    embeddingVersion: "v1",
  })),
);

vi.mock("openclaw/plugin-sdk/memory-core", () => ({
  embedMemorySearchQuery,
  parseAgentSessionKey: vi.fn((sessionKey?: string) =>
    sessionKey ? { agentId: "main", rest: "main" } : null,
  ),
  resolveDefaultAgentId: vi.fn(() => "main"),
}));

function createWeakProcedureHybridResult(): MemoryObjectSearchHybridResult {
  return {
    accepted: true,
    status: "ok",
    scope: "include_validated_procedures",
    query: "how should I carefully put this live",
    records: [
      {
        objectType: "procedure",
        readSurface: "validated_procedure_read_model",
        id: "procedure-weak",
        status: "validated",
        title: "Deploy checklist",
        body: "Open canary lane.\nVerify health.",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 45,
        matchedFields: ["fts_search_document"],
      },
    ],
  };
}

function createRuntimeMock() {
  return {
    memoryObjectQuery: {
      searchSemantic: vi.fn(async () => ({
        accepted: true as const,
        status: "ok" as const,
        scope: "include_validated_procedures" as const,
        embeddingModel: "test-embed",
        embeddingVersion: "v1",
        records: [
          {
            objectType: "procedure" as const,
            readSurface: "validated_procedure_read_model" as const,
            id: "procedure-semantic",
            status: "validated" as const,
            title: "Careful rollout checklist",
            body: "Open canary lane.\nVerify health.\nWatch error budget.",
            createdAt: "2026-04-02T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
            score: 0.92,
            distance: 0.08,
            matchedFields: ["semantic_embedding"],
            embeddingModel: "test-embed",
            embeddingVersion: "v1",
            chunkIndex: 0,
          },
        ],
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("semantic retrieval routing", () => {
  beforeEach(() => {
    embedMemorySearchQuery.mockClear();
  });

  it("keeps strong typed procedure matches on the hybrid path", async () => {
    const runtime = createRuntimeMock();
    const hybridResult: MemoryObjectSearchHybridResult = {
      accepted: true,
      status: "ok",
      scope: "include_validated_procedures",
      query: "deploy checklist",
      records: [
        {
          objectType: "procedure",
          readSurface: "validated_procedure_read_model",
          id: "procedure-strong",
          status: "validated",
          title: "Deploy checklist",
          body: "Open canary lane.\nVerify health.",
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 220,
          matchedFields: ["procedure_key_match"],
        },
      ],
    };

    const result = await maybeApplyProcedureSemanticFallback({
      runtime,
      input: {
        query: "deploy checklist",
        kind: "procedure",
        scope: "include_validated_procedures",
      },
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).not.toHaveBeenCalled();
    expect(runtime.memoryObjectQuery.searchSemantic).not.toHaveBeenCalled();
    expect(result).toEqual(hybridResult);
  });

  it("uses semantic fallback for weak nearby procedure asks", async () => {
    const runtime = createRuntimeMock();

    const result = await maybeApplyProcedureSemanticFallback({
      runtime,
      input: {
        query: "how should I carefully put this live",
        kind: "procedure",
        scope: "include_validated_procedures",
      },
      hybridResult: createWeakProcedureHybridResult(),
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).toHaveBeenCalledWith({
      cfg: { plugins: {} },
      agentId: "main",
      text: "how should I carefully put this live",
    });
    expect(runtime.memoryObjectQuery.searchSemantic).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embed",
      embeddingVersion: "v1",
      scope: "include_validated_procedures",
      kind: "procedure",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted result");
    }
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        id: "procedure-semantic",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
    expect(result.records[1]?.id).toBe("procedure-weak");
  });

  it("stays hybrid-only outside the procedure validated-procedure lane", async () => {
    const runtime = createRuntimeMock();
    const hybridResult = createWeakProcedureHybridResult();

    const result = await maybeApplyProcedureSemanticFallback({
      runtime,
      input: {
        query: "how should I carefully put this live",
        kind: "procedure",
        scope: "approved_only",
      },
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).not.toHaveBeenCalled();
    expect(runtime.memoryObjectQuery.searchSemantic).not.toHaveBeenCalled();
    expect(result).toEqual(hybridResult);
  });
});
