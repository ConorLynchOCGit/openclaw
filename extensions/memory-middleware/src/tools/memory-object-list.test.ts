import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryObjectListTool,
  normalizeMemoryObjectListInput,
} from "./memory-object-list.js";

function createAcceptedListResult() {
  return {
    accepted: true,
    status: "ok",
    scope: "include_validated_procedures",
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
      list: vi.fn(async () => createAcceptedListResult()),
      searchBasic: vi.fn(),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory object list tool", () => {
  it("normalizes optional list filters", () => {
    expect(
      normalizeMemoryObjectListInput({
        scope: "include_candidates",
        kind: "procedure",
        projectId: " project-1 ",
        agentId: " agent-1 ",
        sessionId: " session-1 ",
        limit: "7",
      }),
    ).toEqual({
      scope: "include_candidates",
      kind: "procedure",
      projectId: "project-1",
      agentId: "agent-1",
      sessionId: "session-1",
      limit: 7,
    });
  });

  it("routes list requests through the object query seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectListTool({ runtime });

    const result = await tool.execute("call-1", {
      scope: "include_validated_procedures",
      projectId: "project-1",
      limit: 5,
    });

    expect(runtime.memoryObjectQuery.list).toHaveBeenCalledWith({
      scope: "include_validated_procedures",
      projectId: "project-1",
      limit: 5,
    });
    expect(result.details).toEqual(createAcceptedListResult());
  });

  it("surfaces disabled list results without writes", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.list = vi.fn(async () => ({
      accepted: false as const,
      status: "disabled" as const,
      reason: "memory object query mode is not enabled",
    }));
    const tool = createMemoryObjectListTool({ runtime });

    const result = await tool.execute("call-2", {});

    expect(result.details).toEqual({
      accepted: false,
      status: "disabled",
      reason: "memory object query mode is not enabled",
    });
  });

  it("rejects unsupported list payloads", () => {
    expect(() =>
      normalizeMemoryObjectListInput({
        kind: "memory",
      }),
    ).toThrow("kind must be one of");

    expect(() =>
      normalizeMemoryObjectListInput({
        limit: ["bad"],
      }),
    ).toThrow("limit must be a number");
  });
});
