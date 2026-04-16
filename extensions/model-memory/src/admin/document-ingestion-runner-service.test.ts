import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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
});
