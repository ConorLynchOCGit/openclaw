import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCapturedPluginRegistration } from "../../../src/test-utils/plugin-registration.ts";
import { createModelMemoryDocumentIngestionTool } from "./document-ingestion-tool.ts";

function fakeApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  const captured = createCapturedPluginRegistration();
  return {
    ...captured.api,
    config: {},
    ...overrides,
  };
}

function fakeCtx(workspaceDir: string) {
  return {
    config: {},
    workspaceDir,
    agentDir: workspaceDir,
    agentId: "main",
    sessionKey: "session-main",
    sessionId: "session-main",
    sandboxed: false,
  };
}

describe("model-memory document ingestion tool", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await import("node:fs/promises").then(({ rm }) =>
          rm(dir, { recursive: true, force: true }),
        );
      }
    }
  });

  it("runs the clean-room runner service with explicit workspace-relative sources", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-"));
    tempDirs.push(workspaceDir);
    await writeFile(path.join(workspaceDir, "doc-a.md"), "# A\n", "utf8");
    await writeFile(path.join(workspaceDir, "doc-b.md"), "# B\n", "utf8");

    const executeRun = vi.fn(async (input: Record<string, unknown>) => ({
      runId: input.runId,
      status: "completed",
      totals: {
        docsAttempted: 2,
        docsCompleted: 2,
        docsFailed: 0,
        capturedClaimCount: 3,
        ignoredWindowCount: 1,
        rejectedWindowCount: 0,
        writeDecisionCounts: { write: 3 },
        rejectReasons: [],
      },
    }));

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        createLiveJsonExecutor: vi.fn(
          async (_options: unknown) =>
            ({
              execute: vi.fn(),
              getRequestTimeoutMs: () => 180_000,
              getRequestSeed: () => 7,
            }) as never,
        ),
      }),
      createRunnerService: () =>
        ({
          executeRun: executeRun.mockImplementation(async (input: Record<string, unknown>) => ({
            runId: input.runId,
            status: "completed",
            createdAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T00:00:01.000Z",
            modelId: "openai-codex/gpt-5.4-mini",
            candidateModelId: "openai-codex/gpt-5.4-mini",
            chunkSize: 5,
            maxConcurrency: 1,
            maxWordsPerWindow: 1500,
            sources: [],
            chunks: [],
            totals: {
              docsAttempted: 2,
              docsCompleted: 2,
              docsFailed: 0,
              capturedClaimCount: 3,
              ignoredWindowCount: 1,
              rejectedWindowCount: 0,
              writeDecisionCounts: { write: 3 },
              rejectReasons: [],
            },
          })),
        }) as never,
    });

    const result = await tool.execute("tool-call-1", {
      sources: ["doc-a.md", "doc-b.md"],
      runId: "turn-proof-run",
      recordPath: "checkpoints/model-memory/test-run.json",
      chunkSize: 5,
      maxConcurrency: 1,
      resume: true,
    });

    expect(executeRun).toHaveBeenCalledOnce();
    expect(executeRun.mock.calls[0]?.[0]).toMatchObject({
      runId: "turn-proof-run",
      chunkSize: 5,
      maxConcurrency: 1,
      resume: true,
      modelId: "openai-codex/gpt-5.4-mini",
      candidateModelId: "openai-codex/gpt-5.4-mini",
      rebuildRuntime: false,
    });
    expect(executeRun.mock.calls[0]?.[0]?.sources).toHaveLength(2);
    expect((result as { details?: Record<string, unknown> }).details?.recordPath).toBe(
      "checkpoints/model-memory/test-run.json",
    );
  });

  it("accepts the single-document source form for natural-language tool calls", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-single-"));
    tempDirs.push(workspaceDir);
    await writeFile(path.join(workspaceDir, "roadmap.md"), "# Roadmap\n", "utf8");

    const executeRun = vi.fn(async (input: Record<string, unknown>) => ({
      runId: input.runId,
      status: "completed",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:01.000Z",
      modelId: "openai-codex/gpt-5.4-mini",
      candidateModelId: "openai-codex/gpt-5.4-mini",
      chunkSize: 10,
      maxConcurrency: 1,
      maxWordsPerWindow: 1500,
      sources: [],
      chunks: [],
      totals: {
        docsAttempted: 1,
        docsCompleted: 1,
        docsFailed: 0,
        capturedClaimCount: 2,
        ignoredWindowCount: 0,
        rejectedWindowCount: 0,
        writeDecisionCounts: { write: 2 },
        rejectReasons: [],
      },
    }));

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        createLiveJsonExecutor: vi.fn(
          async (_options: unknown) =>
            ({
              execute: vi.fn(),
              getRequestTimeoutMs: () => 180_000,
              getRequestSeed: () => 7,
            }) as never,
        ),
      }),
      createRunnerService: () =>
        ({
          executeRun,
        }) as never,
    });

    const result = await tool.execute("tool-call-single", {
      source: "roadmap.md",
      runId: "single-source-run",
    });

    expect(executeRun).toHaveBeenCalledOnce();
    const firstCall = executeRun.mock.calls[0]?.[0] as {
      sources?: Array<Record<string, unknown>>;
    };
    expect(firstCall.sources).toHaveLength(1);
    expect(firstCall.sources?.[0]).toMatchObject({
      displayPath: "roadmap.md",
    });
    expect((result as { details?: Record<string, unknown> }).details?.runId).toBe(
      "single-source-run",
    );
  });

  it("strips generated zones from root workspace memory files and marks daily notes lower authority", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-memory-"));
    tempDirs.push(workspaceDir);
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.join(workspaceDir, "memory"), { recursive: true }),
    );
    await writeFile(
      path.join(workspaceDir, "USER.md"),
      [
        "# USER.md",
        "",
        "- durable human note",
        "",
        "<!-- OPENCLAW:MEMORY-PROJECTION:START memory-projection:user-profile -->",
        "- generated projection",
        "<!-- OPENCLAW:MEMORY-PROJECTION:END memory-projection:user-profile -->",
        "",
        "<!-- BEGIN GENERATED: model-memory -->",
        "- generated model memory",
        "<!-- END GENERATED: model-memory -->",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(workspaceDir, "memory", "2026-04-21.md"),
      "# Daily\n\n- running context\n",
      "utf8",
    );

    const executeRun = vi.fn(async (input: Record<string, unknown>) => ({
      runId: input.runId,
      status: "completed",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:01.000Z",
      modelId: "openai-codex/gpt-5.4-mini",
      candidateModelId: "openai-codex/gpt-5.4-mini",
      chunkSize: 10,
      maxConcurrency: 1,
      maxWordsPerWindow: 1500,
      sources: [],
      chunks: [],
      totals: {
        docsAttempted: 2,
        docsCompleted: 2,
        docsFailed: 0,
        capturedClaimCount: 0,
        ignoredWindowCount: 0,
        rejectedWindowCount: 0,
        writeDecisionCounts: {},
        rejectReasons: [],
      },
    }));

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        createLiveJsonExecutor: vi.fn(
          async () =>
            ({
              execute: vi.fn(),
              getRequestTimeoutMs: () => 180_000,
              getRequestSeed: () => 7,
            }) as never,
        ),
      }),
      createRunnerService: () =>
        ({
          executeRun,
        }) as never,
    });

    await tool.execute("tool-call-memory", {
      sources: ["USER.md", "memory/2026-04-21.md"],
      runId: "memory-source-run",
    });

    const sources = (
      executeRun.mock.calls[0]?.[0] as {
        sources?: Array<{
          document?: {
            text?: string;
            sourceKind?: string;
            sourceMetadata?: Record<string, unknown>;
          };
        }>;
      }
    ).sources;
    expect(sources?.[0]?.document?.text).toContain("- durable human note");
    expect(sources?.[0]?.document?.text).not.toContain("generated projection");
    expect(sources?.[0]?.document?.sourceMetadata).toMatchObject({
      sourceAuthority: "workspace_root_human_owned",
      generatedZonesStripped: true,
    });
    expect(sources?.[1]?.document).toMatchObject({
      sourceKind: "daily_continuity",
      sourceMetadata: {
        sourceAuthority: "workspace_daily_note_lower_authority",
        generatedZonesStripped: false,
      },
    });
    expect(sources?.[1]?.document?.sourceMetadata?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves repo-canonical source paths through the product_live import", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-import-"));
    tempDirs.push(workspaceDir);
    const importDoc = path.join(
      workspaceDir,
      "imports",
      "product_live",
      "content",
      "docs",
      "projects",
      "model-memory",
      "roadmap.md",
    );
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.dirname(importDoc), { recursive: true }),
    );
    await writeFile(importDoc, "# Imported roadmap\n", "utf8");

    const executeRun = vi.fn(async (input: Record<string, unknown>) => ({
      runId: input.runId,
      status: "completed",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:01.000Z",
      modelId: "openai-codex/gpt-5.4-mini",
      candidateModelId: "openai-codex/gpt-5.4-mini",
      chunkSize: 10,
      maxConcurrency: 1,
      maxWordsPerWindow: 1500,
      sources: [],
      chunks: [],
      totals: {
        docsAttempted: 1,
        docsCompleted: 1,
        docsFailed: 0,
        capturedClaimCount: 2,
        ignoredWindowCount: 0,
        rejectedWindowCount: 0,
        writeDecisionCounts: { write: 2 },
        rejectReasons: [],
      },
    }));

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        createLiveJsonExecutor: vi.fn(
          async () =>
            ({
              execute: vi.fn(),
              getRequestTimeoutMs: () => 180_000,
              getRequestSeed: () => 7,
            }) as never,
        ),
      }),
      createRunnerService: () =>
        ({
          executeRun,
        }) as never,
    });

    await tool.execute("tool-call-import", {
      source: "docs/projects/model-memory/roadmap.md",
      runId: "repo-import-run",
    });

    expect(executeRun).toHaveBeenCalledOnce();
    const firstCall = executeRun.mock.calls[0]?.[0] as {
      sources?: Array<Record<string, unknown>>;
    };
    expect(firstCall.sources?.[0]).toMatchObject({
      displayPath: "docs/projects/model-memory/roadmap.md",
      document: {
        externalSourceId: "docs/projects/model-memory/roadmap.md",
        sourceMetadata: {
          relativePath: "docs/projects/model-memory/roadmap.md",
        },
      },
    });
  });

  it("emits bounded tool updates for ingest progress", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-progress-"));
    tempDirs.push(workspaceDir);
    await writeFile(path.join(workspaceDir, "roadmap.md"), "# Roadmap\n", "utf8");

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => ({
        createDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        createLiveJsonExecutor: vi.fn(
          async (_options: unknown) =>
            ({
              execute: vi.fn(),
              getRequestTimeoutMs: () => 180_000,
              getRequestSeed: () => 7,
            }) as never,
        ),
      }),
      createRunnerService: () =>
        ({
          executeRun: async (input: {
            onProgress?: (event: {
              type: string;
              phase?: string;
              index?: number;
              total?: number;
              source?: { displayPath: string };
              message: string;
            }) => Promise<void> | void;
            runId: string;
          }) => {
            await input.onProgress?.({
              type: "phase",
              phase: "start",
              message: "starting run",
            });
            await input.onProgress?.({
              type: "source_start",
              index: 1,
              total: 1,
              source: { displayPath: "roadmap.md" },
              message: "ingesting source",
            });
            await input.onProgress?.({
              type: "source_complete",
              index: 1,
              total: 1,
              source: { displayPath: "roadmap.md" },
              message: "completed source",
            });
            await input.onProgress?.({
              type: "phase",
              phase: "complete",
              message: "complete",
            });
            return {
              runId: input.runId,
              status: "completed",
              createdAt: "2026-04-15T00:00:00.000Z",
              updatedAt: "2026-04-15T00:00:01.000Z",
              modelId: "openai-codex/gpt-5.4-mini",
              candidateModelId: "openai-codex/gpt-5.4-mini",
              chunkSize: 10,
              maxConcurrency: 1,
              maxWordsPerWindow: 1500,
              sources: [],
              chunks: [],
              totals: {
                docsAttempted: 1,
                docsCompleted: 1,
                docsFailed: 0,
                capturedClaimCount: 2,
                ignoredWindowCount: 0,
                rejectedWindowCount: 0,
                writeDecisionCounts: { write: 2 },
                rejectReasons: [],
              },
            };
          },
        }) as never,
    });

    const onUpdate = vi.fn();
    await tool.execute(
      "tool-call-progress",
      {
        source: "roadmap.md",
        runId: "progress-run",
      },
      undefined,
      onUpdate,
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [
          {
            type: "text",
            text: "Document ingest started: 1 sources",
          },
        ],
      }),
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [
          {
            type: "text",
            text: "Document ingest 1/1: roadmap.md",
          },
        ],
      }),
    );
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [
          {
            type: "text",
            text: "Document ingest completed: checkpoints/model-memory/progress-run.json",
          },
        ],
      }),
    );
  });

  it("rejects absolute or escaping paths", async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-tool-"));
    tempDirs.push(workspaceDir);
    await writeFile(path.join(workspaceDir, "doc-a.md"), "# A\n", "utf8");

    const tool = createModelMemoryDocumentIngestionTool(fakeApi(), fakeCtx(workspaceDir), {
      loadInternalRuntimeDeps: async () => {
        throw new Error("should not load runtime for invalid paths");
      },
    });

    await expect(
      tool.execute("tool-call-2", {
        sources: ["../outside.md"],
      }),
    ).rejects.toThrow(/escapes workspace root/i);

    await expect(
      tool.execute("tool-call-3", {
        sources: ["doc-a.md"],
        recordPath: "/tmp/absolute.json",
      }),
    ).rejects.toThrow(/workspace-relative/i);
  });
});
