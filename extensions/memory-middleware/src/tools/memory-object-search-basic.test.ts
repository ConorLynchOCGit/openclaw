import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryObjectSearchBasicTool,
  normalizeMemoryObjectSearchBasicInput,
} from "./memory-object-search-basic.js";

function createAcceptedSearchResult() {
  return {
    accepted: true,
    status: "ok",
    scope: "approved_only",
    query: "bounded",
    records: [
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "memory-1",
        memoryKind: "project",
        memoryState: "approved",
        reviewState: "approved",
        content: "Approved bounded memory.",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
      },
    ],
  };
}

function createRuntime() {
  return {
    memoryObjectQuery: {
      get: vi.fn(),
      list: vi.fn(),
      searchBasic: vi.fn(async () => createAcceptedSearchResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory object basic search tool", () => {
  it("normalizes a basic search payload", () => {
    expect(
      normalizeMemoryObjectSearchBasicInput({
        query: " bounded ",
        scope: "include_candidates_and_validated_procedures",
        kind: "project",
        projectId: " project-1 ",
        limit: "6",
      }),
    ).toEqual({
      query: "bounded",
      scope: "include_candidates_and_validated_procedures",
      kind: "project",
      projectId: "project-1",
      limit: 6,
    });
  });

  it("routes basic search requests through the object query seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectSearchBasicTool({ runtime });

    const result = await tool.execute("call-1", {
      query: "bounded",
      scope: "approved_only",
      kind: "project",
    });

    expect(runtime.memoryObjectQuery.searchBasic).toHaveBeenCalledWith({
      query: "bounded",
      scope: "approved_only",
      kind: "project",
    });
    expect(result.details).toEqual(createAcceptedSearchResult());
  });

  it("surfaces not-found-like empty results without writes", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchBasic = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "missing",
      records: [],
    }));
    const tool = createMemoryObjectSearchBasicTool({ runtime });

    const result = await tool.execute("call-2", {
      query: "missing",
    });

    expect(result.details).toEqual({
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: "missing",
      records: [],
    });
  });

  it("rejects unsupported basic search payloads", () => {
    expect(() =>
      normalizeMemoryObjectSearchBasicInput({
        query: "bounded",
        kind: "memory",
      }),
    ).toThrow("kind must be one of");
  });
});
