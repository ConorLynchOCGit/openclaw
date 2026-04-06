import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryObjectSearchHybridResult } from "./db/runtime.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";
import {
  maybeApplyApiWorkaroundSemanticFallback,
  maybeApplyEnvironmentConstraintSemanticFallback,
  maybeApplyProcedureSemanticFallback,
  maybeApplyWorkflowToolGotchaSemanticFallback,
} from "./semantic-retrieval-routing.js";

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
    config: {
      database: {
        driver: "postgres",
        schema: "memory_middleware",
        url: "",
      },
    },
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

function createWeakEnvironmentConstraintHybridResult(): MemoryObjectSearchHybridResult {
  return {
    accepted: true,
    status: "ok",
    scope: "approved_only",
    query: "what should I use for quick scripting here",
    records: [
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "env-weak",
        memoryKind: "project",
        reviewState: "approved",
        content:
          "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
        metadata: {
          autoCapture: {
            lessonKey: "python_command_unavailable",
            subject: "python command availability",
            value: "use node --input-type=module or tsx instead",
          },
        },
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 35,
        matchedFields: ["fts_search_document"],
      },
    ],
  };
}

function createWeakWorkflowToolGotchaHybridResult(): MemoryObjectSearchHybridResult {
  return {
    accepted: true,
    status: "ok",
    scope: "approved_only",
    query: "how should I keep staging narrow here",
    records: [
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "tool-gotcha-weak",
        memoryKind: "project",
        reviewState: "approved",
        content:
          'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
        metadata: {
          autoCapture: {
            lessonKey: "scripts_committer_required",
            subject: "scoped commit workflow",
            value: 'use scripts/committer "<msg>" <file...> instead of manual git add / git commit',
          },
        },
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 30,
        matchedFields: ["fts_search_document"],
      },
    ],
  };
}

function createWeakApiWorkaroundHybridResult(): MemoryObjectSearchHybridResult {
  return {
    accepted: true,
    status: "ok",
    scope: "approved_only",
    query: "how do I get semantic memory search working after ChatGPT sign-in",
    records: [
      {
        objectType: "memory_object",
        readSurface: "approved_memory_view",
        id: "api-workaround-weak",
        memoryKind: "project",
        reviewState: "approved",
        content:
          "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
        metadata: {
          autoCapture: {
            lessonKey: "openai_embeddings_api_key_required",
            subject: "OpenAI embeddings auth",
            value:
              "OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings",
          },
        },
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        score: 28,
        matchedFields: ["fts_search_document"],
      },
    ],
  };
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

  it("keeps strong typed environment-constraint matches on the hybrid path", async () => {
    const runtime = createRuntimeMock();
    const hybridResult: MemoryObjectSearchHybridResult = {
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: "python not available here use node",
      records: [
        {
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: "env-strong",
          memoryKind: "project",
          reviewState: "approved",
          content:
            "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
          metadata: {
            autoCapture: {
              lessonKey: "python_command_unavailable",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 220,
          matchedFields: ["auto_capture_lesson_match"],
        },
      ],
    };

    const result = await maybeApplyEnvironmentConstraintSemanticFallback({
      runtime,
      input: {
        query: "python not available here use node",
        kind: "project",
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

  it("uses semantic fallback for weak nearby environment-constraint asks", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed",
          embeddingVersion: "v1",
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "env-semantic",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content:
                "Environment constraint: python command is not available in this environment; use node --input-type=module or tsx instead.",
              metadata: {
                autoCapture: {
                  lessonKey: "python_command_unavailable",
                },
              },
              createdAt: "2026-04-02T00:00:00.000Z",
              updatedAt: "2026-04-02T00:00:00.000Z",
              score: 0.93,
              distance: 0.07,
              matchedFields: ["semantic_embedding"],
              embeddingModel: "test-embed",
              embeddingVersion: "v1",
              chunkIndex: 0,
            },
          ],
        })),
      },
    } as unknown as MemoryMiddlewareRuntime;

    const result = await maybeApplyEnvironmentConstraintSemanticFallback({
      runtime,
      input: {
        query: "what should I use for quick scripting here",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult: createWeakEnvironmentConstraintHybridResult(),
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).toHaveBeenCalledWith({
      cfg: { plugins: {} },
      agentId: "main",
      text: "what should I use for quick scripting here",
    });
    expect(runtime.memoryObjectQuery.searchSemantic).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embed",
      embeddingVersion: "v1",
      scope: "approved_only",
      kind: "project",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted result");
    }
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        id: "env-semantic",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
    expect(result.records[1]?.id).toBe("env-weak");
  });

  it("filters semantic fallback to supported approved environment constraints only", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed",
          embeddingVersion: "v1",
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "not-env",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content: "Project fact [atlas]: primary package manager is pnpm.",
              metadata: {
                autoCapture: {
                  fieldKey: "primary_package_manager",
                },
              },
              createdAt: "2026-04-02T00:00:00.000Z",
              updatedAt: "2026-04-02T00:00:00.000Z",
              score: 0.93,
              distance: 0.07,
              matchedFields: ["semantic_embedding"],
              embeddingModel: "test-embed",
              embeddingVersion: "v1",
              chunkIndex: 0,
            },
          ],
        })),
      },
    } as unknown as MemoryMiddlewareRuntime;

    const hybridResult = createWeakEnvironmentConstraintHybridResult();
    const result = await maybeApplyEnvironmentConstraintSemanticFallback({
      runtime,
      input: {
        query: "what should I use for quick scripting here",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(result).toEqual(hybridResult);
  });

  it("stays hybrid-only outside the approved project workflow-guidance lane", async () => {
    const runtime = createRuntimeMock();
    const hybridResult = createWeakEnvironmentConstraintHybridResult();

    const result = await maybeApplyEnvironmentConstraintSemanticFallback({
      runtime,
      input: {
        query: "what should I use for quick scripting here",
        kind: "project",
        scope: "include_candidates",
      } as never,
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).not.toHaveBeenCalled();
    expect(runtime.memoryObjectQuery.searchSemantic).not.toHaveBeenCalled();
    expect(result).toEqual(hybridResult);
  });

  it("keeps strong typed workflow tool-gotcha matches on the hybrid path", async () => {
    const runtime = createRuntimeMock();
    const hybridResult: MemoryObjectSearchHybridResult = {
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: "scoped commit workflow",
      records: [
        {
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: "tool-gotcha-strong",
          memoryKind: "project",
          reviewState: "approved",
          content:
            'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
          metadata: {
            autoCapture: {
              lessonKey: "scripts_committer_required",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 200,
          matchedFields: ["auto_capture_lesson_match"],
        },
      ],
    };

    const result = await maybeApplyWorkflowToolGotchaSemanticFallback({
      runtime,
      input: {
        query: "scoped commit workflow",
        kind: "project",
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

  it("uses semantic fallback for weak nearby workflow tool-gotcha asks", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed",
          embeddingVersion: "v1",
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "tool-gotcha-semantic",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content:
                'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
              metadata: {
                autoCapture: {
                  lessonKey: "scripts_committer_required",
                },
              },
              createdAt: "2026-04-02T00:00:00.000Z",
              updatedAt: "2026-04-02T00:00:00.000Z",
              score: 0.91,
              distance: 0.09,
              matchedFields: ["semantic_embedding"],
              embeddingModel: "test-embed",
              embeddingVersion: "v1",
              chunkIndex: 0,
            },
          ],
        })),
      },
    } as unknown as MemoryMiddlewareRuntime;

    const result = await maybeApplyWorkflowToolGotchaSemanticFallback({
      runtime,
      input: {
        query: "how should I keep staging narrow here",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult: createWeakWorkflowToolGotchaHybridResult(),
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).toHaveBeenCalledWith({
      cfg: { plugins: {} },
      agentId: "main",
      text: "how should I keep staging narrow here",
    });
    expect(runtime.memoryObjectQuery.searchSemantic).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embed",
      embeddingVersion: "v1",
      scope: "approved_only",
      kind: "project",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted result");
    }
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        id: "tool-gotcha-semantic",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
    expect(result.records[1]?.id).toBe("tool-gotcha-weak");
  });

  it("filters semantic fallback to supported approved workflow tool gotchas only", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed",
          embeddingVersion: "v1",
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "tool-gotcha-unsupported",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content:
                "Workflow improvement: do not use git stash during multi-agent repo work because it can disturb concurrent work.",
              metadata: {
                autoCapture: {
                  lessonKey: "git_stash_unsafe",
                },
              },
              createdAt: "2026-04-02T00:00:00.000Z",
              updatedAt: "2026-04-02T00:00:00.000Z",
              score: 0.91,
              distance: 0.09,
              matchedFields: ["semantic_embedding"],
              embeddingModel: "test-embed",
              embeddingVersion: "v1",
              chunkIndex: 0,
            },
          ],
        })),
      },
    } as unknown as MemoryMiddlewareRuntime;

    const hybridResult = createWeakWorkflowToolGotchaHybridResult();
    const result = await maybeApplyWorkflowToolGotchaSemanticFallback({
      runtime,
      input: {
        query: "how should I keep staging narrow here",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(result).toEqual(hybridResult);
  });

  it("keeps strong typed project-fact matches ahead of workflow tool-gotcha fallback", async () => {
    const runtime = createRuntimeMock();
    const hybridResult: MemoryObjectSearchHybridResult = {
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: "default branch",
      records: [
        {
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: "project-fact-strong",
          memoryKind: "project",
          reviewState: "approved",
          content: "Project fact: default branch is main.",
          metadata: {
            autoCapture: {
              fieldKey: "default_branch",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 220,
          matchedFields: ["auto_capture_field_match"],
        },
      ],
    };

    const result = await maybeApplyWorkflowToolGotchaSemanticFallback({
      runtime,
      input: {
        query: "default branch",
        kind: "project",
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

  it("keeps strong typed API workaround matches on the hybrid path", async () => {
    const runtime = createRuntimeMock();
    const hybridResult: MemoryObjectSearchHybridResult = {
      accepted: true,
      status: "ok",
      scope: "approved_only",
      query: "semantic memory search openai api key",
      records: [
        {
          objectType: "memory_object",
          readSurface: "approved_memory_view",
          id: "api-workaround-strong",
          memoryKind: "project",
          reviewState: "approved",
          content:
            "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
          metadata: {
            autoCapture: {
              lessonKey: "openai_embeddings_api_key_required",
            },
          },
          createdAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
          score: 210,
          matchedFields: ["auto_capture_lesson_match"],
        },
      ],
    };

    const result = await maybeApplyApiWorkaroundSemanticFallback({
      runtime,
      input: {
        query: "semantic memory search openai api key",
        kind: "project",
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

  it("uses semantic fallback for weak nearby API workaround asks", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed" as const,
          embeddingVersion: "v1" as const,
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "api-workaround-semantic",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content:
                "API workaround: OpenAI embeddings require a configured OPENAI_API_KEY or another embeddings provider; OpenClaw does not use openai-codex OAuth profiles directly for embeddings.",
              metadata: {
                autoCapture: {
                  lessonKey: "openai_embeddings_api_key_required",
                },
              },
              createdAt: "2026-04-02T00:00:00.000Z",
              updatedAt: "2026-04-02T00:00:00.000Z",
              score: 0.9,
              distance: 0.1,
              matchedFields: ["semantic_embedding"],
              embeddingModel: "test-embed",
              embeddingVersion: "v1",
              chunkIndex: 0,
            },
          ],
        })),
      },
    } as unknown as MemoryMiddlewareRuntime;

    const result = await maybeApplyApiWorkaroundSemanticFallback({
      runtime,
      input: {
        query: "how do I get semantic memory search working after ChatGPT sign-in",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult: createWeakApiWorkaroundHybridResult(),
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(embedMemorySearchQuery).toHaveBeenCalledWith({
      cfg: { plugins: {} },
      agentId: "main",
      text: "how do I get semantic memory search working after ChatGPT sign-in",
    });
    expect(runtime.memoryObjectQuery.searchSemantic).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "test-embed",
      embeddingVersion: "v1",
      scope: "approved_only",
      kind: "project",
    });
    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted result");
    }
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        id: "api-workaround-semantic",
        matchedFields: ["semantic_embedding", "semantic_fallback"],
      }),
    );
    expect(result.records[1]?.id).toBe("api-workaround-weak");
  });

  it("filters semantic fallback to supported approved API workaround lessons only", async () => {
    const runtime = {
      config: {
        database: {
          driver: "postgres",
          schema: "memory_middleware",
          url: "",
        },
      },
      memoryObjectQuery: {
        searchSemantic: vi.fn(async () => ({
          accepted: true as const,
          status: "ok" as const,
          scope: "approved_only" as const,
          embeddingModel: "test-embed" as const,
          embeddingVersion: "v1" as const,
          records: [
            {
              objectType: "memory_object" as const,
              readSurface: "approved_memory_view" as const,
              id: "api-workaround-unsupported",
              memoryKind: "project" as const,
              reviewState: "approved" as const,
              content:
                'Workflow improvement: use scripts/committer "<msg>" <file...> instead of manual git add / git commit so staging stays scoped.',
              metadata: {
                autoCapture: {
                  lessonKey: "scripts_committer_required",
                },
              },
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

    const hybridResult = createWeakApiWorkaroundHybridResult();
    const result = await maybeApplyApiWorkaroundSemanticFallback({
      runtime,
      input: {
        query: "how do I get semantic memory search working after ChatGPT sign-in",
        kind: "project",
        scope: "approved_only",
      },
      hybridResult,
      cfg: { plugins: {} } as never,
      agentId: "main",
      sessionKey: "agent:main:main",
    });

    expect(result).toEqual(hybridResult);
  });
});
