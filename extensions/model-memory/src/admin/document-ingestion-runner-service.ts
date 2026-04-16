import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import { DatabaseMemoryObjectStore } from "../db/database-memory-object-store.ts";
import { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import { ingestDocumentLive } from "../live-document-ingestion-service.ts";
import { rebuildDerivedRuntimeState } from "../runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "../semantic-collision-adjudication.ts";
import type { SemanticInterpreter } from "../semantic-interpreter.ts";
import type { DocumentSourceInput } from "../source-adapters/document-source-adapter.ts";

export type DocumentIngestionRunnerSource = {
  sourceId: string;
  displayPath: string;
  chunkIndex: number;
  document: DocumentSourceInput;
};

export type DocumentIngestionRunnerSourceStatus = "pending" | "running" | "completed" | "failed";

export type DocumentIngestionRunnerChunkStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_failures";

export type DocumentIngestionRunnerRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_with_failures";

export type DocumentIngestionRunnerSourceRecord = {
  sourceId: string;
  displayPath: string;
  chunkIndex: number;
  status: DocumentIngestionRunnerSourceStatus;
  lineCount: number;
  windowCount: number;
  capturedClaimCount: number;
  writeDecisionCounts: Record<string, number>;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  rejectReasons: string[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};

export type DocumentIngestionRunnerChunkRecord = {
  chunkIndex: number;
  sourceIds: string[];
  status: DocumentIngestionRunnerChunkStatus;
  attemptedCount: number;
  completedCount: number;
  failedCount: number;
  capturedClaimCount: number;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  writeDecisionCounts: Record<string, number>;
  rejectReasons: string[];
  startedAt?: string;
  completedAt?: string;
};

export type DocumentIngestionRunnerRunRecord = {
  runId: string;
  status: DocumentIngestionRunnerRunStatus;
  createdAt: string;
  updatedAt: string;
  modelId: string;
  candidateModelId: string;
  chunkSize: number;
  maxConcurrency: number;
  maxWordsPerWindow?: number;
  sources: DocumentIngestionRunnerSourceRecord[];
  chunks: DocumentIngestionRunnerChunkRecord[];
  totals: {
    docsAttempted: number;
    docsCompleted: number;
    docsFailed: number;
    capturedClaimCount: number;
    ignoredWindowCount: number;
    rejectedWindowCount: number;
    writeDecisionCounts: Record<string, number>;
    rejectReasons: string[];
  };
};

export type DocumentIngestionRunnerProgressEvent =
  | {
      type: "phase";
      phase: "start" | "start_chunk" | "resume_chunk" | "complete";
      message: string;
    }
  | {
      type: "source_start";
      index: number;
      total: number;
      source: DocumentIngestionRunnerSource;
      message: string;
    }
  | {
      type: "source_complete";
      index: number;
      total: number;
      source: DocumentIngestionRunnerSource;
      result: DocumentIngestionRunnerSourceRecord;
      message: string;
    };

export type DocumentIngestionRunnerProcessedSource = {
  lineCount: number;
  windowCount: number;
  capturedClaimCount: number;
  writeDecisionCounts: Record<string, number>;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  rejectReasons: string[];
};

export interface DocumentIngestionRunRecordStore {
  load(runId: string): Promise<DocumentIngestionRunnerRunRecord | undefined>;
  save(record: DocumentIngestionRunnerRunRecord): Promise<void>;
}

export class JsonFileDocumentIngestionRunRecordStore implements DocumentIngestionRunRecordStore {
  constructor(private readonly filePath: string) {}

  async load(runId: string): Promise<DocumentIngestionRunnerRunRecord | undefined> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as DocumentIngestionRunnerRunRecord;
      return parsed.runId === runId ? parsed : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async save(record: DocumentIngestionRunnerRunRecord): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

export type ModelMemoryDocumentIngestionRunnerServiceDependencies = {
  canonicalRepository?: ModelMemoryCanonicalRepository;
  runtimeRepository?: RuntimeContextRepository;
  memoryStore?: DatabaseMemoryObjectStore;
  collisionAdjudicator?: SemanticCollisionAdjudicator;
  processSource?: (
    source: DocumentIngestionRunnerSource,
  ) => Promise<DocumentIngestionRunnerProcessedSource>;
};

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function mergeCounts(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function buildInitialRunRecord(input: {
  runId: string;
  modelId: string;
  candidateModelId: string;
  chunkSize: number;
  maxConcurrency: number;
  maxWordsPerWindow?: number;
  sources: DocumentIngestionRunnerSource[];
}): DocumentIngestionRunnerRunRecord {
  const createdAt = new Date().toISOString();
  const chunks = [...new Set(input.sources.map((source) => source.chunkIndex))]
    .toSorted((left, right) => left - right)
    .map((chunkIndex) => ({
      chunkIndex,
      sourceIds: input.sources
        .filter((source) => source.chunkIndex === chunkIndex)
        .map((source) => source.sourceId),
      status: "pending" as const,
      attemptedCount: 0,
      completedCount: 0,
      failedCount: 0,
      capturedClaimCount: 0,
      ignoredWindowCount: 0,
      rejectedWindowCount: 0,
      writeDecisionCounts: {},
      rejectReasons: [],
    }));

  return {
    runId: input.runId,
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    modelId: input.modelId,
    candidateModelId: input.candidateModelId,
    chunkSize: input.chunkSize,
    maxConcurrency: input.maxConcurrency,
    maxWordsPerWindow: input.maxWordsPerWindow,
    sources: input.sources.map((source) => ({
      sourceId: source.sourceId,
      displayPath: source.displayPath,
      chunkIndex: source.chunkIndex,
      status: "pending",
      lineCount: countLines(source.document.text),
      windowCount: 0,
      capturedClaimCount: 0,
      writeDecisionCounts: {},
      ignoredWindowCount: 0,
      rejectedWindowCount: 0,
      rejectReasons: [],
    })),
    chunks,
    totals: {
      docsAttempted: 0,
      docsCompleted: 0,
      docsFailed: 0,
      capturedClaimCount: 0,
      ignoredWindowCount: 0,
      rejectedWindowCount: 0,
      writeDecisionCounts: {},
      rejectReasons: [],
    },
  };
}

function recalculateChunkRecord(
  chunk: DocumentIngestionRunnerChunkRecord,
  sourceRecords: DocumentIngestionRunnerSourceRecord[],
): DocumentIngestionRunnerChunkRecord {
  const chunkSources = sourceRecords.filter((source) => source.chunkIndex === chunk.chunkIndex);
  const failedCount = chunkSources.filter((source) => source.status === "failed").length;
  const completedCount = chunkSources.filter((source) => source.status === "completed").length;
  const pendingCount = chunkSources.filter(
    (source) => source.status === "pending" || source.status === "running",
  ).length;

  return {
    ...chunk,
    attemptedCount: chunkSources.filter((source) => source.status !== "pending").length,
    completedCount,
    failedCount,
    capturedClaimCount: chunkSources.reduce((sum, source) => sum + source.capturedClaimCount, 0),
    ignoredWindowCount: chunkSources.reduce((sum, source) => sum + source.ignoredWindowCount, 0),
    rejectedWindowCount: chunkSources.reduce((sum, source) => sum + source.rejectedWindowCount, 0),
    writeDecisionCounts: chunkSources.reduce<Record<string, number>>(
      (counts, source) => mergeCounts(counts, source.writeDecisionCounts),
      {},
    ),
    rejectReasons: uniqueSorted(chunkSources.flatMap((source) => source.rejectReasons)),
    status:
      pendingCount > 0 ? chunk.status : failedCount > 0 ? "completed_with_failures" : "completed",
  };
}

function recalculateRunRecord(
  record: DocumentIngestionRunnerRunRecord,
): DocumentIngestionRunnerRunRecord {
  const chunks = record.chunks.map((chunk) => recalculateChunkRecord(chunk, record.sources));
  const docsCompleted = record.sources.filter((source) => source.status === "completed").length;
  const docsFailed = record.sources.filter((source) => source.status === "failed").length;
  const docsAttempted = docsCompleted + docsFailed;
  const pendingCount = record.sources.filter(
    (source) => source.status === "pending" || source.status === "running",
  ).length;

  return {
    ...record,
    chunks,
    updatedAt: new Date().toISOString(),
    status: pendingCount > 0 ? "running" : docsFailed > 0 ? "completed_with_failures" : "completed",
    totals: {
      docsAttempted,
      docsCompleted,
      docsFailed,
      capturedClaimCount: record.sources.reduce(
        (sum, source) => sum + source.capturedClaimCount,
        0,
      ),
      ignoredWindowCount: record.sources.reduce(
        (sum, source) => sum + source.ignoredWindowCount,
        0,
      ),
      rejectedWindowCount: record.sources.reduce(
        (sum, source) => sum + source.rejectedWindowCount,
        0,
      ),
      writeDecisionCounts: record.sources.reduce<Record<string, number>>(
        (counts, source) => mergeCounts(counts, source.writeDecisionCounts),
        {},
      ),
      rejectReasons: uniqueSorted(record.sources.flatMap((source) => source.rejectReasons)),
    },
  };
}

async function runWithConcurrency<T>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const concurrency = Math.max(1, maxConcurrency);

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

export class ModelMemoryDocumentIngestionRunnerService {
  private readonly memoryStore?: DatabaseMemoryObjectStore;

  constructor(private readonly deps: ModelMemoryDocumentIngestionRunnerServiceDependencies) {
    this.memoryStore =
      deps.memoryStore ??
      (deps.canonicalRepository
        ? new DatabaseMemoryObjectStore(deps.canonicalRepository, deps.collisionAdjudicator)
        : undefined);
  }

  async executeRun(input: {
    runId: string;
    sources: DocumentIngestionRunnerSource[];
    interpreter: SemanticInterpreter;
    modelId: string;
    candidateModelId: string;
    chunkSize: number;
    maxConcurrency?: number;
    maxWordsPerWindow?: number;
    recordStore?: DocumentIngestionRunRecordStore;
    resume?: boolean;
    rebuildRuntime?: boolean;
    onProgress?: (event: DocumentIngestionRunnerProgressEvent) => void | Promise<void>;
  }): Promise<DocumentIngestionRunnerRunRecord> {
    const maxConcurrency = Math.max(1, input.maxConcurrency ?? 1);
    const existingRecord =
      input.resume && input.recordStore ? await input.recordStore.load(input.runId) : undefined;

    let record =
      existingRecord ??
      buildInitialRunRecord({
        runId: input.runId,
        modelId: input.modelId,
        candidateModelId: input.candidateModelId,
        chunkSize: input.chunkSize,
        maxConcurrency,
        maxWordsPerWindow: input.maxWordsPerWindow,
        sources: input.sources,
      });

    record.status = "running";
    record.updatedAt = new Date().toISOString();
    await input.recordStore?.save(record);

    await input.onProgress?.({
      type: "phase",
      phase: "start",
      message: `starting document ingestion run ${input.runId} with ${input.sources.length} sources`,
    });

    const orderedChunks = [...new Set(input.sources.map((source) => source.chunkIndex))].toSorted(
      (left, right) => left - right,
    );
    const totalSources = input.sources.length;

    for (const chunkIndex of orderedChunks) {
      const chunkSources = input.sources.filter((source) => source.chunkIndex === chunkIndex);
      const chunkRecord = record.chunks.find((chunk) => chunk.chunkIndex === chunkIndex);
      if (!chunkRecord) {
        continue;
      }

      const pendingSources = chunkSources.filter((source) => {
        const existingSource = record.sources.find((entry) => entry.sourceId === source.sourceId);
        return (
          !existingSource ||
          existingSource.status === "pending" ||
          existingSource.status === "running"
        );
      });

      if (pendingSources.length === 0) {
        await input.onProgress?.({
          type: "phase",
          phase: "resume_chunk",
          message: `skipping chunk ${chunkIndex}; already completed in prior run record`,
        });
        continue;
      }

      chunkRecord.status = "running";
      chunkRecord.startedAt ??= new Date().toISOString();
      record = recalculateRunRecord(record);
      await input.recordStore?.save(record);

      await input.onProgress?.({
        type: "phase",
        phase: "start_chunk",
        message: `starting chunk ${chunkIndex} with ${pendingSources.length} pending sources`,
      });

      await runWithConcurrency(pendingSources, maxConcurrency, async (source) => {
        const sourceIndex =
          input.sources.findIndex((entry) => entry.sourceId === source.sourceId) + 1;
        const sourceRecord = record.sources.find((entry) => entry.sourceId === source.sourceId);
        if (sourceRecord) {
          sourceRecord.status = "running";
          sourceRecord.startedAt ??= new Date().toISOString();
        }
        record = recalculateRunRecord(record);
        await input.recordStore?.save(record);

        await input.onProgress?.({
          type: "source_start",
          index: sourceIndex,
          total: totalSources,
          source,
          message: `ingesting ${sourceIndex}/${totalSources}: ${source.displayPath}`,
        });

        let nextRecord: DocumentIngestionRunnerSourceRecord;
        try {
          const processed = await this.processSource({
            source,
            interpreter: input.interpreter,
            modelId: input.modelId,
            candidateModelId: input.candidateModelId,
            maxWordsPerWindow: input.maxWordsPerWindow,
            rebuildRuntime: false,
          });
          nextRecord = {
            sourceId: source.sourceId,
            displayPath: source.displayPath,
            chunkIndex: source.chunkIndex,
            status: "completed",
            lineCount: processed.lineCount,
            windowCount: processed.windowCount,
            capturedClaimCount: processed.capturedClaimCount,
            writeDecisionCounts: processed.writeDecisionCounts,
            ignoredWindowCount: processed.ignoredWindowCount,
            rejectedWindowCount: processed.rejectedWindowCount,
            rejectReasons: processed.rejectReasons,
            startedAt: sourceRecord?.startedAt ?? new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
        } catch (error) {
          nextRecord = {
            sourceId: source.sourceId,
            displayPath: source.displayPath,
            chunkIndex: source.chunkIndex,
            status: "failed",
            lineCount: countLines(source.document.text),
            windowCount: 0,
            capturedClaimCount: 0,
            writeDecisionCounts: {},
            ignoredWindowCount: 0,
            rejectedWindowCount: 0,
            rejectReasons: [],
            errorMessage: error instanceof Error ? error.message : String(error),
            startedAt: sourceRecord?.startedAt ?? new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
        }

        const sourceRecordIndex = record.sources.findIndex(
          (entry) => entry.sourceId === source.sourceId,
        );
        if (sourceRecordIndex >= 0) {
          record.sources[sourceRecordIndex] = nextRecord;
        } else {
          record.sources.push(nextRecord);
        }

        record = recalculateRunRecord(record);
        await input.recordStore?.save(record);

        await input.onProgress?.({
          type: "source_complete",
          index: sourceIndex,
          total: totalSources,
          source,
          result: nextRecord,
          message:
            nextRecord.status === "completed"
              ? `completed ${sourceIndex}/${totalSources}: ${source.displayPath} captured=${nextRecord.capturedClaimCount} decisions=${JSON.stringify(nextRecord.writeDecisionCounts)}`
              : `failed ${sourceIndex}/${totalSources}: ${source.displayPath} error=${nextRecord.errorMessage}`,
        });
      });

      if (
        this.deps.canonicalRepository &&
        this.deps.runtimeRepository &&
        (input.rebuildRuntime ?? true)
      ) {
        await rebuildDerivedRuntimeState({
          canonicalRepository: this.deps.canonicalRepository,
          runtimeRepository: this.deps.runtimeRepository,
        });
      }

      const refreshedChunk = record.chunks.find((entry) => entry.chunkIndex === chunkIndex);
      if (refreshedChunk) {
        refreshedChunk.completedAt = new Date().toISOString();
      }
      record = recalculateRunRecord(record);
      await input.recordStore?.save(record);
    }

    record = recalculateRunRecord(record);
    await input.recordStore?.save(record);

    await input.onProgress?.({
      type: "phase",
      phase: "complete",
      message: `document ingestion run ${input.runId} complete: completed=${record.totals.docsCompleted} failed=${record.totals.docsFailed}`,
    });

    return record;
  }

  private async processSource(input: {
    source: DocumentIngestionRunnerSource;
    interpreter: SemanticInterpreter;
    modelId: string;
    candidateModelId: string;
    maxWordsPerWindow?: number;
    rebuildRuntime: boolean;
  }): Promise<DocumentIngestionRunnerProcessedSource> {
    if (this.deps.processSource) {
      return this.deps.processSource(input.source);
    }

    if (!this.deps.canonicalRepository || !this.memoryStore) {
      throw new Error(
        "document ingestion runner requires canonicalRepository and memoryStore when no custom processSource is provided",
      );
    }

    const result = await ingestDocumentLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.memoryStore,
      collisionAdjudicator: this.deps.collisionAdjudicator,
      rebuildRuntime: input.rebuildRuntime,
      ingestion: {
        document: {
          ...input.source.document,
          maxWordsPerWindow: input.maxWordsPerWindow ?? input.source.document.maxWordsPerWindow,
        },
        modelId: input.modelId,
        candidateModelId: input.candidateModelId,
        interpreter: input.interpreter,
      },
    });

    return {
      lineCount: countLines(input.source.document.text),
      windowCount: result.windows.length,
      capturedClaimCount: result.capturedObjects.length,
      writeDecisionCounts: countBy(result.writeResults.map((entry) => entry.decision)),
      ignoredWindowCount: result.windowResults.filter((entry) => entry.action === "ignore").length,
      rejectedWindowCount: result.windowResults.filter((entry) => entry.action === "reject").length,
      rejectReasons: uniqueSorted(
        result.windowResults.flatMap((entry) =>
          entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
        ),
      ),
    };
  }
}
