import { describe, expect, it, vi } from "vitest";
import type { MemoryObjectSearchHybridResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryObjectSearchHybridTool,
  normalizeMemoryObjectSearchHybridInput,
} from "./memory-object-search-hybrid.js";

const maybeApplyProcedureSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);
const maybeApplyEnvironmentConstraintSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);

vi.mock("../semantic-retrieval-routing.js", () => ({
  maybeApplyProcedureSemanticFallback,
  maybeApplyEnvironmentConstraintSemanticFallback,
}));

function createAcceptedSearchResult(): MemoryObjectSearchHybridResult {
  return {
    accepted: true,
    status: "ok",
    scope: "include_validated_procedures",
    query: "deploy agent",
    records: [
      {
        objectType: "procedure",
        readSurface: "validated_procedure_read_model",
        id: "procedure-1",
        status: "validated",
        title: "Deploy agent update",
        body: "Deploy the agent update in a bounded way.",
        latestValidationRunOutcome: "passed",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 110,
        matchedFields: ["title_prefix", "body_substring"],
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
      searchHybrid: vi.fn(async () => createAcceptedSearchResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory object hybrid search tool", () => {
  it("normalizes a hybrid search payload", () => {
    expect(
      normalizeMemoryObjectSearchHybridInput({
        query: " deploy agent ",
        scope: "include_validated_procedures",
        kind: "procedure",
        projectId: " project-1 ",
        limit: "6",
      }),
    ).toEqual({
      query: "deploy agent",
      scope: "include_validated_procedures",
      kind: "procedure",
      projectId: "project-1",
      limit: 6,
    });
  });

  it("routes ranked search through the object query seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-1", {
      query: "deploy agent",
      scope: "include_validated_procedures",
      kind: "procedure",
    });

    expect(runtime.memoryObjectQuery.searchHybrid).toHaveBeenCalledWith({
      query: "deploy agent",
      scope: "include_validated_procedures",
      kind: "procedure",
    });
    expect(maybeApplyProcedureSemanticFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          query: "deploy agent",
          scope: "include_validated_procedures",
          kind: "procedure",
        },
        cfg: undefined,
        agentId: undefined,
        sessionKey: undefined,
      }),
    );
    expect(maybeApplyEnvironmentConstraintSemanticFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          query: "deploy agent",
          scope: "include_validated_procedures",
          kind: "procedure",
        },
        cfg: undefined,
        agentId: undefined,
        sessionKey: undefined,
      }),
    );
    expect(result.details).toEqual(createAcceptedSearchResult());
  });

  it("surfaces empty ranked results without writes", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "missing",
      records: [],
    }));
    const tool = createMemoryObjectSearchHybridTool({ runtime });

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

  it("returns semantic fallback ordering when the family router rewrites weak procedure results", async () => {
    const runtime = createRuntime();
    maybeApplyProcedureSemanticFallback.mockImplementationOnce(async ({ hybridResult }) =>
      hybridResult.accepted && hybridResult.status === "ok"
        ? {
            ...hybridResult,
            records: [
              {
                ...hybridResult.records[0],
                id: "procedure-semantic-1",
                title: "Careful rollout checklist",
                score: 999,
                matchedFields: ["semantic_embedding", "semantic_fallback"],
              },
              ...hybridResult.records,
            ],
          }
        : hybridResult,
    );
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-semantic", {
      query: "how should I carefully put this live",
      scope: "include_validated_procedures",
      kind: "procedure",
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
    });
    expect(
      (
        result.details as {
          records: Array<{ id: string; matchedFields: string[] }>;
        }
      ).records[0],
    ).toEqual(
      expect.objectContaining({
        id: "procedure-semantic-1",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
  });

  it("rejects unsupported ranked-search payloads", () => {
    expect(() =>
      normalizeMemoryObjectSearchHybridInput({
        query: "deploy agent",
        kind: "memory",
      }),
    ).toThrow("kind must be one of");
  });

  it("passes tool context into family-scoped semantic fallback routing", async () => {
    const runtime = createRuntime();
    const tool = createMemoryObjectSearchHybridTool({
      runtime,
      context: {
        config: { plugins: {} },
        runtimeConfig: { plugins: { memory: { provider: "openai" } } },
        agentId: "main",
        sessionKey: "agent:main:main",
      } as never,
    });

    await tool.execute("call-3", {
      query: "how should I carefully put this live",
      scope: "include_validated_procedures",
      kind: "procedure",
    });

    expect(maybeApplyProcedureSemanticFallback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cfg: expect.objectContaining({ plugins: { memory: { provider: "openai" } } }),
        agentId: "main",
        sessionKey: "agent:main:main",
      }),
    );
    expect(maybeApplyEnvironmentConstraintSemanticFallback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cfg: expect.objectContaining({ plugins: { memory: { provider: "openai" } } }),
        agentId: "main",
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("returns semantic fallback ordering when the family router rewrites weak environment guidance results", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "what should I use for quick scripting here",
      records: [
        {
          objectType: "memory_object" as const,
          readSurface: "approved_memory_view" as const,
          id: "env-weak",
          memoryKind: "project" as const,
          reviewState: "approved" as const,
          content:
            "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
          metadata: {
            autoCapture: {
              lessonKey: "python_command_unavailable",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 55,
          matchedFields: ["fts_search_document"],
        },
      ],
    }));
    maybeApplyEnvironmentConstraintSemanticFallback.mockImplementationOnce(
      async ({ hybridResult }) =>
        hybridResult.accepted && hybridResult.status === "ok"
          ? {
              ...hybridResult,
              records: [
                {
                  ...hybridResult.records[0],
                  id: "env-semantic-1",
                  score: 999,
                  matchedFields: ["semantic_embedding", "semantic_fallback"],
                },
                ...hybridResult.records,
              ],
            }
          : hybridResult,
    );
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-env-semantic", {
      query: "what should I use for quick scripting here",
      scope: "approved_only",
      kind: "project",
    });

    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
    });
    expect(
      (
        result.details as {
          records: Array<{ id: string; matchedFields: string[] }>;
        }
      ).records[0],
    ).toEqual(
      expect.objectContaining({
        id: "env-semantic-1",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
  });
});
