import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { createMemoryObjectGetTool, normalizeMemoryObjectGetInput } from "./memory-object-get.js";

function createAcceptedGetResult() {
  return {
    accepted: true,
    status: "ok",
    record: {
      objectType: "memory_object",
      readSurface: "approved_memory_view",
      id: "memory-1",
      memoryKind: "project",
      memoryState: "approved",
      reviewState: "approved",
      content: "Bounded approved memory.",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
  };
}

function createRuntime() {
  return {
    memoryObjectQuery: {
      get: vi.fn(async () => createAcceptedGetResult()),
      list: vi.fn(),
      searchBasic: vi.fn(),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory object get tool", () => {
  it("normalizes a memory object get payload", () => {
    expect(
      normalizeMemoryObjectGetInput({
        objectId: " object-1 ",
        scope: "include_validated_procedures",
      }),
    ).toEqual({
      objectId: "object-1",
      scope: "include_validated_procedures",
    });
  });

  it("routes inspection through the memory object query seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectGetTool({ runtime });

    const result = await tool.execute("call-1", {
      objectId: "memory-1",
      scope: "approved_only",
    });

    expect(runtime.memoryObjectQuery.get).toHaveBeenCalledWith({
      objectId: "memory-1",
      scope: "approved_only",
    });
    expect(result.details).toEqual(createAcceptedGetResult());
  });

  it("surfaces not-found results without writes", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.get = vi.fn(async () => ({
      accepted: false as const,
      status: "not_found" as const,
      reason: "memory object not found in requested retrieval scope",
    }));
    const tool = createMemoryObjectGetTool({ runtime });

    const result = await tool.execute("call-2", {
      objectId: "missing",
    });

    expect(result.details).toEqual({
      accepted: false,
      status: "not_found",
      reason: "memory object not found in requested retrieval scope",
    });
  });

  it("rejects missing object ids", () => {
    expect(() =>
      normalizeMemoryObjectGetInput({
        objectId: "   ",
      }),
    ).toThrow("objectId required");
  });
});
