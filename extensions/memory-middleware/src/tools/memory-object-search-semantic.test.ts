import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryObjectSearchSemanticTool,
  normalizeMemoryObjectSearchSemanticInput,
} from "./memory-object-search-semantic.js";

function createAcceptedSearchResult() {
  return {
    accepted: true,
    status: "ok",
    scope: "include_validated_procedures",
    embeddingModel: "text-embedding-3-small",
    embeddingVersion: "2026-04",
    records: [
      {
        objectType: "procedure",
        readSurface: "validated_procedure_read_model",
        id: "procedure-1",
        memoryState: "validated",
        status: "validated",
        title: "Deploy agent update",
        body: "Deploy the agent update in a bounded way.",
        latestValidationRunOutcome: "passed",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 0.92,
        distance: 0.08,
        chunkIndex: 0,
        embeddingModel: "text-embedding-3-small",
        embeddingVersion: "2026-04",
        matchedFields: ["semantic_embedding"],
      },
    ],
  };
}

function createRuntime() {
  return {
    memoryObjectQuery: {
      get: vi.fn(),
      list: vi.fn(),
      searchBasic: vi.fn(),
      searchHybrid: vi.fn(),
      searchSemantic: vi.fn(async () => createAcceptedSearchResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory object semantic search tool", () => {
  it("normalizes a semantic search payload", () => {
    expect(
      normalizeMemoryObjectSearchSemanticInput({
        embedding: [0.25, 0.5, 0.75],
        embeddingModel: " text-embedding-3-small ",
        embeddingVersion: " 2026-04 ",
        scope: "include_validated_procedures",
        kind: "procedure",
        projectId: " project-1 ",
        limit: "6",
      }),
    ).toEqual({
      embedding: [0.25, 0.5, 0.75],
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
      scope: "include_validated_procedures",
      kind: "procedure",
      projectId: "project-1",
      limit: 6,
    });
  });

  it("routes semantic search through the object query seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectSearchSemanticTool({ runtime });

    const result = await tool.execute("call-1", {
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
      scope: "include_validated_procedures",
      kind: "procedure",
    });

    expect(runtime.memoryObjectQuery.searchSemantic).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
      scope: "include_validated_procedures",
      kind: "procedure",
    });
    expect(result.details).toEqual(createAcceptedSearchResult());
  });

  it("surfaces empty semantic results without writes", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchSemantic = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
      records: [],
    }));
    const tool = createMemoryObjectSearchSemanticTool({ runtime });

    const result = await tool.execute("call-2", {
      embedding: [0.4, 0.5, 0.6],
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      embeddingModel: "text-embedding-3-small",
      embeddingVersion: "2026-04",
      records: [],
    });
  });

  it("rejects unsupported semantic-search payloads", () => {
    expect(() =>
      normalizeMemoryObjectSearchSemanticInput({
        embedding: [0.1],
        embeddingModel: "model",
        embeddingVersion: "v1",
        scope: "include_candidates",
      }),
    ).toThrow("scope must be one of: approved_only, include_validated_procedures");

    expect(() =>
      normalizeMemoryObjectSearchSemanticInput({
        embedding: ["bad"],
        embeddingModel: "model",
        embeddingVersion: "v1",
      }),
    ).toThrow("embedding must contain only numbers");
  });
});
