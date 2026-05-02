import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import { applyModelMemoryMigrations } from "../db/migrations.ts";
import { createPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import {
  JsonFileDocumentIngestionRunRecordStore,
  ModelMemoryDocumentIngestionRunnerService,
  type DocumentIngestionRunnerSource,
} from "./document-ingestion-runner-service.ts";

function buildSources(): DocumentIngestionRunnerSource[] {
  return [
    {
      sourceId: "source-001",
      displayPath: "docs/a.md",
      chunkIndex: 1,
      document: {
        externalSourceId: "docs/a.md",
        text: "# A\nAlpha",
      },
    },
    {
      sourceId: "source-002",
      displayPath: "docs/b.md",
      chunkIndex: 1,
      document: {
        externalSourceId: "docs/b.md",
        text: "# B\nBeta",
      },
    },
    {
      sourceId: "source-003",
      displayPath: "docs/c.md",
      chunkIndex: 2,
      document: {
        externalSourceId: "docs/c.md",
        text: "# C\nGamma",
      },
    },
  ];
}

function buildManySources(count: number): DocumentIngestionRunnerSource[] {
  return Array.from({ length: count }, (_, index) => {
    const sourceNumber = index + 1;
    return {
      sourceId: `source-${String(sourceNumber).padStart(3, "0")}`,
      displayPath: `docs/${sourceNumber}.md`,
      chunkIndex: 1,
      document: {
        externalSourceId: `docs/${sourceNumber}.md`,
        text: `# ${sourceNumber}\nBody ${sourceNumber}`,
      },
    };
  });
}

describe("document-ingestion-runner-service", () => {
  it("persists durable run records with per-source failure containment", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const calls: string[] = [];
    const service = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        calls.push(source.sourceId);
        if (source.sourceId === "source-002") {
          throw new Error("boom");
        }
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    const record = await service.executeRun({
      runId: "run-001",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
    });

    expect(calls).toEqual(["source-001", "source-002", "source-003"]);
    expect(record.status).toBe("completed_with_failures");
    expect(record.totals.docsCompleted).toBe(2);
    expect(record.totals.docsFailed).toBe(1);
    expect(record.chunks[0]?.status).toBe("completed_with_failures");
    expect(record.chunks[1]?.status).toBe("completed");

    const persisted = JSON.parse(await readFile(recordPath, "utf8")) as {
      totals: { docsCompleted: number; docsFailed: number };
    };
    expect(persisted.totals.docsCompleted).toBe(2);
    expect(persisted.totals.docsFailed).toBe(1);
  });

  it("persists model-step diagnostics when a source fails inside interpretation", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-model-step-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const database = await createPgMemTestDatabase();

    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new ModelMemoryCanonicalRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const service = new ModelMemoryDocumentIngestionRunnerService({
        canonicalRepository,
        runtimeRepository,
      });

      const record = await service.executeRun({
        runId: "run-model-step-diagnostics",
        sources: [buildSources()[0]!],
        interpreter: {
          async interpret() {
            throw new Error("forced model-step failure");
          },
        },
        modelId: "openai-codex/gpt-5.4-mini",
        candidateModelId: "openai-codex/gpt-5.4-mini",
        chunkSize: 1,
        recordStore: store,
        resume: true,
        rebuildRuntime: false,
      });

      expect(record.status).toBe("completed_with_failures");
      const persisted = JSON.parse(await readFile(recordPath, "utf8")) as {
        sources: Array<{
          status: string;
          activeStage?: string;
          activeModelStep?: unknown;
          modelStepEvents?: Array<{
            status: string;
            contractName: string;
            contractVersion: string;
            sourceWindowId: string;
            sourceWindowIndex: number;
            errorMessage?: string;
          }>;
        }>;
      };
      expect(persisted.sources[0]?.status).toBe("failed");
      expect(persisted.sources[0]?.activeStage).toBe("failed");
      expect(persisted.sources[0]?.activeModelStep).toBeUndefined();
      expect(persisted.sources[0]?.modelStepEvents?.at(-1)).toMatchObject({
        status: "failed",
        sourceWindowIndex: 0,
        errorMessage: "forced model-step failure",
      });
      expect(persisted.sources[0]?.modelStepEvents?.[0]?.contractName).toBeTruthy();
      expect(JSON.stringify(persisted.sources[0]?.modelStepEvents)).not.toContain("Alpha");
    } finally {
      await database.close();
    }
  });

  it("records section-map candidate-hints strategy telemetry for auto large docs without live writes", async () => {
    const originalStrategy = process.env.MODEL_MEMORY_DOCUMENT_INGEST_STRATEGY;
    const originalThreshold = process.env.MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD;
    process.env.MODEL_MEMORY_DOCUMENT_INGEST_STRATEGY = "auto";
    process.env.MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD = "10";
    try {
      const service = new ModelMemoryDocumentIngestionRunnerService({
        async processSource() {
          return {
            lineCount: 4,
            windowCount: 0,
            capturedClaimCount: 0,
            writeDecisionCounts: {},
            ignoredWindowCount: 0,
            rejectedWindowCount: 0,
            rejectReasons: [],
          };
        },
      });
      const [source] = buildSources();
      const record = await service.executeRun({
        runId: "run-section-map",
        sources: [
          {
            ...source,
            document: {
              externalSourceId: "docs/large.md",
              text: `# Large\n${"word ".repeat(60)}\n\n## Decisions\nDecision: keep benchmark artifacts out of durable memory.`,
            },
          },
        ],
        interpreter: {
          interpret() {
            throw new Error("unused");
          },
        },
        modelId: "openai-codex/gpt-5.4-mini",
        candidateModelId: "openai-codex/gpt-5.4-mini",
        chunkSize: 1,
      });

      expect(record.sources[0]).toMatchObject({
        ingestStrategy: "section_map_candidate_hints",
      });
      expect(record.sources[0]?.strategyTelemetry).toMatchObject({
        strategy: "section_map_candidate_hints",
        hintCount: 0,
        validatedCount: 0,
        quarantinedCount: 0,
      });
      expect(JSON.stringify(record.sources[0]?.strategyTelemetry)).not.toContain(
        "Decision: keep benchmark artifacts",
      );
    } finally {
      if (originalStrategy === undefined) {
        delete process.env.MODEL_MEMORY_DOCUMENT_INGEST_STRATEGY;
      } else {
        process.env.MODEL_MEMORY_DOCUMENT_INGEST_STRATEGY = originalStrategy;
      }
      if (originalThreshold === undefined) {
        delete process.env.MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD;
      } else {
        process.env.MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD = originalThreshold;
      }
    }
  });

  it("resumes by skipping sources already recorded as completed or failed", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-resume-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const firstCalls: string[] = [];
    const secondCalls: string[] = [];

    const firstService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        firstCalls.push(source.sourceId);
        if (source.sourceId === "source-003") {
          throw new Error("boom");
        }
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    await firstService.executeRun({
      runId: "run-002",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
    });

    const secondService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        secondCalls.push(source.sourceId);
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    const resumed = await secondService.executeRun({
      runId: "run-002",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
    });

    expect(firstCalls).toEqual(["source-001", "source-002", "source-003"]);
    expect(secondCalls).toEqual([]);
    expect(resumed.totals.docsCompleted).toBe(2);
    expect(resumed.totals.docsFailed).toBe(1);
  });

  it("can explicitly retry failed sources on resume", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-retry-failed-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const retriedCalls: string[] = [];

    const firstService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        if (source.sourceId === "source-002") {
          throw new Error("temporary provider failure");
        }
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    await firstService.executeRun({
      runId: "run-retry-failed",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
    });

    const secondService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        retriedCalls.push(source.sourceId);
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    const resumed = await secondService.executeRun({
      runId: "run-retry-failed",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
      retryFailed: true,
    });

    expect(retriedCalls).toEqual(["source-002"]);
    expect(resumed.totals.docsCompleted).toBe(3);
    expect(resumed.totals.docsFailed).toBe(0);
  });

  it("retries only selected failed-source classes after a targeted fix", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-retry-class-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const retriedCalls: string[] = [];
    const progressTelemetry: Array<{ docsFailed: number; estimatedRemainingCostUsd?: number }> = [];

    const firstService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        if (source.sourceId === "source-001") {
          throw new Error(
            "model-memory live execution failed for openrouter/openai/gpt-5.4-nano: provider_response missing text content in model response",
          );
        }
        if (source.sourceId === "source-002") {
          throw new Error("canonicalization_invalid_output: missing canonical_text");
        }
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    await firstService.executeRun({
      runId: "run-retry-class",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
      estimatedCostPerSourceUsd: 0.25,
      onProgress(event) {
        if (event.telemetry) {
          progressTelemetry.push(event.telemetry);
        }
      },
    });

    const secondService = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        retriedCalls.push(source.sourceId);
        return {
          lineCount: 2,
          windowCount: 1,
          capturedClaimCount: 1,
          writeDecisionCounts: { write: 1 },
          ignoredWindowCount: 0,
          rejectedWindowCount: 0,
          rejectReasons: [],
        };
      },
    });

    const resumed = await secondService.executeRun({
      runId: "run-retry-class",
      sources: buildSources(),
      interpreter: {
        interpret() {
          throw new Error("unused");
        },
      },
      modelId: "openrouter/openai/gpt-5.4-nano",
      candidateModelId: "openrouter/openai/gpt-5.4-nano",
      chunkSize: 2,
      recordStore: store,
      resume: true,
      retryFailed: true,
      retryFailedClasses: ["provider_empty_response"],
    });

    expect(retriedCalls).toEqual(["source-001"]);
    expect(resumed.totals.docsCompleted).toBe(2);
    expect(resumed.totals.docsFailed).toBe(1);
    expect(progressTelemetry.some((entry) => entry.estimatedRemainingCostUsd !== undefined)).toBe(
      true,
    );
  });

  it("interrupts immediately on provider credit failures", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-credit-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const calls: string[] = [];
    const service = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        calls.push(source.sourceId);
        throw new Error(
          "model-memory live execution failed for openrouter/openai/gpt-5.4-nano: 402 Insufficient credits.",
        );
      },
    });

    await expect(
      service.executeRun({
        runId: "run-provider-credit",
        sources: buildManySources(3),
        interpreter: {
          interpret() {
            throw new Error("unused");
          },
        },
        modelId: "openrouter/openai/gpt-5.4-nano",
        candidateModelId: "openrouter/openai/gpt-5.4-nano",
        chunkSize: 3,
        recordStore: store,
        resume: true,
      }),
    ).rejects.toThrow("provider_credit");

    expect(calls).toEqual(["source-001"]);
    const persisted = JSON.parse(await readFile(recordPath, "utf8")) as {
      status: string;
      runError?: { phase?: string; message?: string };
      sources: Array<{ status: string }>;
      totals: { docsCompleted: number; docsFailed: number };
    };
    expect(persisted.status).toBe("interrupted");
    expect(persisted.runError?.phase).toBe("failure_circuit_breaker");
    expect(persisted.runError?.message).toContain("provider_credit");
    expect(persisted.totals.docsCompleted).toBe(0);
    expect(persisted.totals.docsFailed).toBe(1);
    expect(persisted.sources.map((source) => source.status)).toEqual([
      "failed",
      "pending",
      "pending",
    ]);
  });

  it("interrupts provider-boundary cascades before consuming the whole chunk", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-boundary-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const calls: string[] = [];
    const service = new ModelMemoryDocumentIngestionRunnerService({
      async processSource(source) {
        calls.push(source.sourceId);
        throw new Error(
          "model-memory live execution failed for openrouter/openai/gpt-5.4-nano: provider_response missing text content in model response",
        );
      },
    });

    await expect(
      service.executeRun({
        runId: "run-provider-boundary",
        sources: buildManySources(5),
        interpreter: {
          interpret() {
            throw new Error("unused");
          },
        },
        modelId: "openrouter/openai/gpt-5.4-nano",
        candidateModelId: "openrouter/openai/gpt-5.4-nano",
        chunkSize: 5,
        recordStore: store,
        resume: true,
        failureCircuitBreaker: {
          maxConsecutiveProviderBoundaryFailures: 2,
        },
      }),
    ).rejects.toThrow("consecutive provider-boundary failures");

    expect(calls).toEqual(["source-001", "source-002"]);
    const persisted = JSON.parse(await readFile(recordPath, "utf8")) as {
      status: string;
      runError?: { phase?: string; message?: string };
      sources: Array<{ status: string }>;
      totals: { docsCompleted: number; docsFailed: number };
    };
    expect(persisted.status).toBe("interrupted");
    expect(persisted.runError?.phase).toBe("failure_circuit_breaker");
    expect(persisted.totals.docsCompleted).toBe(0);
    expect(persisted.totals.docsFailed).toBe(2);
    expect(persisted.sources.map((source) => source.status)).toEqual([
      "failed",
      "failed",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("records interrupted status when chunk-end runtime rebuild fails", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "model-memory-runner-interrupted-"));
    const recordPath = path.join(tempDir, "run.json");
    const store = new JsonFileDocumentIngestionRunRecordStore(recordPath);
    const database = await createPgMemTestDatabase();

    try {
      await applyModelMemoryMigrations(database.sql);
      const canonicalRepository = new ModelMemoryCanonicalRepository(database.sql);
      const runtimeRepository = new RuntimeContextRepository(database.sql);
      const service = new ModelMemoryDocumentIngestionRunnerService({
        canonicalRepository,
        runtimeRepository,
        async processSource() {
          return {
            lineCount: 2,
            windowCount: 1,
            capturedClaimCount: 1,
            writeDecisionCounts: { write: 1 },
            ignoredWindowCount: 0,
            rejectedWindowCount: 0,
            rejectReasons: [],
          };
        },
      });

      const original = runtimeRepository.withRuntimeRebuildLock.bind(runtimeRepository);
      runtimeRepository.withRuntimeRebuildLock = async (work) =>
        original(async (repository) => {
          const error = new Error("forced rebuild failure");
          await work(repository);
          throw error;
        });

      await expect(
        service.executeRun({
          runId: "run-003",
          sources: buildSources(),
          interpreter: {
            interpret() {
              throw new Error("unused");
            },
          },
          modelId: "openrouter/openai/gpt-5.4-nano",
          candidateModelId: "openrouter/openai/gpt-5.4-nano",
          chunkSize: 2,
          recordStore: store,
          resume: true,
        }),
      ).rejects.toThrow("forced rebuild failure");

      const persisted = JSON.parse(await readFile(recordPath, "utf8")) as {
        status: string;
        runError?: { phase?: string; chunkIndex?: number };
        totals: { docsCompleted: number; docsFailed: number };
      };
      expect(persisted.status).toBe("interrupted");
      expect(persisted.runError?.phase).toBe("runtime_rebuild_after_chunk");
      expect(persisted.runError?.chunkIndex).toBe(1);
      expect(persisted.totals.docsCompleted).toBe(2);
      expect(persisted.totals.docsFailed).toBe(0);
    } finally {
      await database.close();
    }
  });
});
