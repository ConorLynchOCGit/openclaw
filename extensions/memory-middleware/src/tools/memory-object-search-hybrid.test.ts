import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryObjectSearchHybridTool,
  normalizeMemoryObjectSearchHybridInput,
} from "./memory-object-search-hybrid.js";

const maybeApplyProcedureSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);
const maybeApplyApiWorkaroundSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);
const maybeApplyEnvironmentConstraintSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);
const maybeApplyWorkflowToolGotchaSemanticFallback = vi.hoisted(() =>
  vi.fn(async ({ hybridResult }) => hybridResult),
);
const createSemanticFallbackSharedState = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("../semantic-retrieval-routing.js", () => ({
  createSemanticFallbackSharedState,
  maybeApplyApiWorkaroundSemanticFallback,
  maybeApplyProcedureSemanticFallback,
  maybeApplyEnvironmentConstraintSemanticFallback,
  maybeApplyWorkflowToolGotchaSemanticFallback,
}));

function createAcceptedSearchResult() {
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
        memoryState: "validated",
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
  beforeEach(() => {
    maybeApplyProcedureSemanticFallback.mockClear();
    maybeApplyEnvironmentConstraintSemanticFallback.mockClear();
    maybeApplyWorkflowToolGotchaSemanticFallback.mockClear();
    maybeApplyApiWorkaroundSemanticFallback.mockClear();
  });

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
    expect(maybeApplyEnvironmentConstraintSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyWorkflowToolGotchaSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyApiWorkaroundSemanticFallback).not.toHaveBeenCalled();
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

  it("keeps the text-ranked hybrid result when a semantic fallback throws", async () => {
    const runtime = createRuntime();
    maybeApplyWorkflowToolGotchaSemanticFallback.mockImplementationOnce(async () => {
      throw new Error("memory embeddings query timed out after 60s");
    });
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-fallback-timeout", {
      query: "how should I land this carefully",
      scope: "approved_only",
      kind: "project",
    });

    expect(result.details).toEqual(createAcceptedSearchResult());
    expect(maybeApplyProcedureSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyEnvironmentConstraintSemanticFallback).toHaveBeenCalledTimes(1);
    expect(maybeApplyWorkflowToolGotchaSemanticFallback).toHaveBeenCalledTimes(1);
    expect(maybeApplyApiWorkaroundSemanticFallback).toHaveBeenCalledTimes(1);
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
    expect(maybeApplyProcedureSemanticFallback).toHaveBeenCalledTimes(1);
    expect(maybeApplyWorkflowToolGotchaSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyApiWorkaroundSemanticFallback).not.toHaveBeenCalled();
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
    expect(maybeApplyEnvironmentConstraintSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyWorkflowToolGotchaSemanticFallback).not.toHaveBeenCalled();
    expect(maybeApplyApiWorkaroundSemanticFallback).not.toHaveBeenCalled();
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

  it("returns semantic fallback ordering when the family router rewrites weak workflow tool-gotcha results", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "how should I keep staging narrow here",
      records: [],
    }));
    maybeApplyWorkflowToolGotchaSemanticFallback.mockImplementationOnce(async ({ hybridResult }) =>
      hybridResult.accepted && hybridResult.status === "ok"
        ? {
            ...hybridResult,
            records: [
              {
                objectType: "memory_object" as const,
                readSurface: "approved_memory_view" as const,
                id: "tool-gotcha-semantic-1",
                memoryKind: "project" as const,
                reviewState: "approved" as const,
                content:
                  'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
                metadata: {
                  autoCapture: {
                    lessonFamily: "generalized_workflow_lesson",
                    captureClass: "workflow_generalized_guidance",
                    guidancePattern: "use_instead_of",
                  },
                },
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-04-01T00:00:00.000Z",
                score: 999,
                matchedFields: ["semantic_embedding", "semantic_fallback"],
              },
            ],
          }
        : hybridResult,
    );
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-tool-gotcha", {
      query: "how should I keep staging narrow here",
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
        id: "tool-gotcha-semantic-1",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
  });

  it("returns semantic fallback ordering for nearby git stash safety asks", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "is it safe to stash my work while another agent is editing here",
      records: [],
    }));
    maybeApplyWorkflowToolGotchaSemanticFallback.mockImplementationOnce(async ({ hybridResult }) =>
      hybridResult.accepted && hybridResult.status === "ok"
        ? {
            ...hybridResult,
            records: [
              {
                objectType: "memory_object" as const,
                readSurface: "approved_memory_view" as const,
                id: "tool-gotcha-stash-semantic-1",
                memoryKind: "project" as const,
                reviewState: "approved" as const,
                content:
                  "Workflow improvement: do not use git stash during multi-agent repo work because it can disturb concurrent work.",
                metadata: {
                  autoCapture: {
                    lessonFamily: "generalized_workflow_lesson",
                    captureClass: "workflow_generalized_guidance",
                    guidancePattern: "avoid_only",
                  },
                },
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-04-01T00:00:00.000Z",
                score: 999,
                matchedFields: ["semantic_embedding", "semantic_fallback"],
              },
            ],
          }
        : hybridResult,
    );
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-tool-gotcha-stash", {
      query: "is it safe to stash my work while another agent is editing here",
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
        id: "tool-gotcha-stash-semantic-1",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
  });

  it("returns semantic fallback ordering when the family router rewrites weak API workaround results", async () => {
    const runtime = createRuntime();
    runtime.memoryObjectQuery.searchHybrid = vi.fn(async () => ({
      accepted: true as const,
      status: "ok" as const,
      scope: "approved_only" as const,
      query: "how do I get semantic memory search working after ChatGPT sign-in",
      records: [],
    }));
    maybeApplyApiWorkaroundSemanticFallback.mockImplementationOnce(async ({ hybridResult }) =>
      hybridResult.accepted && hybridResult.status === "ok"
        ? {
            ...hybridResult,
            records: [
              {
                objectType: "memory_object" as const,
                readSurface: "approved_memory_view" as const,
                id: "api-workaround-semantic-1",
                memoryKind: "project" as const,
                reviewState: "approved" as const,
                content:
                  "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
                metadata: {
                  autoCapture: {
                    lessonKey: "openai_embeddings_api_key_required",
                  },
                },
                createdAt: "2026-04-01T00:00:00.000Z",
                updatedAt: "2026-04-01T00:00:00.000Z",
                score: 999,
                matchedFields: ["semantic_embedding", "semantic_fallback"],
              },
            ],
          }
        : hybridResult,
    );
    const tool = createMemoryObjectSearchHybridTool({ runtime });

    const result = await tool.execute("call-api-workaround", {
      query: "how do I get semantic memory search working after ChatGPT sign-in",
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
        id: "api-workaround-semantic-1",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
  });
});
