import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelMemoryDocumentIngestionTool } from "./document-ingestion-tool.ts";

function fakeApi(overrides: Partial<OpenClawPluginApi> = {}): OpenClawPluginApi {
  return {
    id: "model-memory",
    name: "Model Memory",
    description: "Model Memory",
    source: "test",
    config: {},
    pluginConfig: {},
    runtime: { version: "test" } as never,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    registerTool() {},
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerService() {},
    registerProvider() {},
    registerCommand() {},
    resolvePath(input: string) {
      return input;
    },
    on() {},
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
        createModelMemoryDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        OpenAICompatibleLiveJsonExecutor: class {
          constructor(_options: unknown) {}
        } as never,
      }),
      createRunnerService: () =>
        ({
          executeRun: executeRun.mockImplementation(async (input: Record<string, unknown>) => ({
            runId: input.runId,
            status: "completed",
            createdAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T00:00:01.000Z",
            modelId: "openrouter/openai/gpt-5.4-nano",
            candidateModelId: "openrouter/openai/gpt-5.4-nano",
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
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
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
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
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
        createModelMemoryDatabaseRuntime: vi.fn(async () => ({
          canonicalRepository: {},
          runtimeRepository: {},
          pool: { end: vi.fn(async () => undefined) },
        })) as never,
        OpenAICompatibleLiveJsonExecutor: class {
          constructor(_options: unknown) {}
        } as never,
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
