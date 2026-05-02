import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelMemoryCanonicalRepository } from "../db/canonical-repository.ts";
import type { CapturedObjectWriteStore } from "../db/captured-object-write-compatibility.ts";
import type { RuntimeContextRepository } from "../db/runtime-context-repository.ts";
import {
  buildSectionMapDocument,
  buildSectionMapStrategyTelemetry,
  selectDocumentIngestStrategy,
  type SECTION_MAP_CANDIDATE_HINTS_STRATEGY,
} from "../ingestion/section-map-candidate-hints.ts";
import {
  classifyMemoryIngestionFailure,
  isMemoryIngestionProviderBoundaryFailure,
  type MemoryIngestionFailureClass,
} from "../ingestion/shared-pipeline.ts";
import { ingestDocumentLive } from "../live-document-ingestion-service.ts";
import { rebuildDerivedRuntimeState } from "../runtime-rebuild-orchestrator.ts";
import type { SemanticCollisionAdjudicator } from "../semantic-collision-adjudication.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
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
  | "completed_with_failures"
  | "interrupted";

export type DocumentIngestionRunnerRunError = {
  phase:
    | "processing_source"
    | "failure_circuit_breaker"
    | "runtime_rebuild_after_chunk"
    | "run_record_save";
  message: string;
  name?: string;
  chunkIndex?: number;
  sourceId?: string;
  displayPath?: string;
  occurredAt: string;
};

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
  ingestStrategy?: "direct_rigid_capture" | typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  strategyTelemetry?: {
    strategy: string;
    sourceId: string;
    sourceHash: string;
    sectionCount: number;
    hintCount: number;
    validatedCount: number;
    quarantinedCount: number;
    admittedCount: number;
    missedKnownFactCount: number;
    partial: boolean;
    retrySections: string[];
    stricterEvidenceRetrySections: string[];
  };
  activeStage?: string;
  activeModelStep?: DocumentIngestionRunnerModelStepEvent;
  modelStepEvents?: DocumentIngestionRunnerModelStepEvent[];
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};

export type DocumentIngestionRunnerModelStepEvent = {
  stepId: string;
  status: "running" | "completed" | "failed";
  contractName: string;
  contractVersion: string;
  sourceKind: string;
  sourceId: string;
  sourceWindowId: string;
  sourceWindowIndex: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string;
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
  runError?: DocumentIngestionRunnerRunError;
};

export type DocumentIngestionRunnerProgressTelemetry = {
  docsAttempted: number;
  docsCompleted: number;
  docsFailed: number;
  docsPending: number;
  totalSources: number;
  failureRate: number;
  estimatedRemainingCostUsd?: number;
  circuitBreakerReason?: string;
};

export type DocumentIngestionRunnerProgressEvent =
  | {
      type: "phase";
      phase: "start" | "start_chunk" | "resume_chunk" | "complete";
      message: string;
      telemetry?: DocumentIngestionRunnerProgressTelemetry;
    }
  | {
      type: "source_start";
      index: number;
      total: number;
      source: DocumentIngestionRunnerSource;
      message: string;
      telemetry?: DocumentIngestionRunnerProgressTelemetry;
    }
  | {
      type: "source_complete";
      index: number;
      total: number;
      source: DocumentIngestionRunnerSource;
      result: DocumentIngestionRunnerSourceRecord;
      message: string;
      telemetry?: DocumentIngestionRunnerProgressTelemetry;
    };

export type DocumentIngestionRunnerProcessedSource = {
  lineCount: number;
  windowCount: number;
  capturedClaimCount: number;
  writeDecisionCounts: Record<string, number>;
  ignoredWindowCount: number;
  rejectedWindowCount: number;
  rejectReasons: string[];
  ingestStrategy?: "direct_rigid_capture" | typeof SECTION_MAP_CANDIDATE_HINTS_STRATEGY;
  strategyTelemetry?: DocumentIngestionRunnerSourceRecord["strategyTelemetry"];
};

type DocumentIngestionRunnerModelStepCallback = (
  event: DocumentIngestionRunnerModelStepEvent,
) => void | Promise<void>;

export interface DocumentIngestionRunRecordStore {
  load(runId: string): Promise<DocumentIngestionRunnerRunRecord | undefined>;
  save(record: DocumentIngestionRunnerRunRecord): Promise<void>;
}

export type DocumentIngestionFailureClass = MemoryIngestionFailureClass;

export type DocumentIngestionFailureCircuitBreakerOptions = {
  enabled?: boolean;
  maxProviderBoundaryFailuresPerChunk?: number;
  maxConsecutiveProviderBoundaryFailures?: number;
  maxChunkFailureRatio?: number;
  minChunkAttemptsForFailureRatio?: number;
};

const DEFAULT_FAILURE_CIRCUIT_BREAKER: Required<DocumentIngestionFailureCircuitBreakerOptions> = {
  enabled: true,
  maxProviderBoundaryFailuresPerChunk: 5,
  maxConsecutiveProviderBoundaryFailures: 4,
  maxChunkFailureRatio: 0.8,
  minChunkAttemptsForFailureRatio: 6,
};

export function classifyDocumentIngestionFailure(message: string): DocumentIngestionFailureClass {
  return classifyMemoryIngestionFailure(message);
}

function isProviderBoundaryFailure(failureClass: DocumentIngestionFailureClass): boolean {
  return isMemoryIngestionProviderBoundaryFailure(failureClass);
}

class DocumentIngestionFailureCircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentIngestionFailureCircuitBreakerError";
  }
}

type ChunkFailureCircuitBreakerState = {
  attempted: number;
  failed: number;
  providerBoundaryFailures: number;
  consecutiveProviderBoundaryFailures: number;
  failureCounts: Record<DocumentIngestionFailureClass, number>;
};

function createChunkFailureCircuitBreakerState(): ChunkFailureCircuitBreakerState {
  return {
    attempted: 0,
    failed: 0,
    providerBoundaryFailures: 0,
    consecutiveProviderBoundaryFailures: 0,
    failureCounts: {
      provider_credit: 0,
      provider_empty_response: 0,
      provider_connection: 0,
      provider_json_boundary: 0,
      extraction_repair: 0,
      capture_routing_repair: 0,
      canonicalization: 0,
      db_persistence: 0,
      pool_pressure: 0,
      permission: 0,
      runtime_dirty_persistence: 0,
      timeout: 0,
      other: 0,
    },
  };
}

function mergeFailureCircuitBreakerOptions(
  input?: DocumentIngestionFailureCircuitBreakerOptions,
): Required<DocumentIngestionFailureCircuitBreakerOptions> {
  const merged: Required<DocumentIngestionFailureCircuitBreakerOptions> = {
    ...DEFAULT_FAILURE_CIRCUIT_BREAKER,
  };
  if (!input) {
    return merged;
  }
  if (input.enabled !== undefined) {
    merged.enabled = input.enabled;
  }
  if (input.maxProviderBoundaryFailuresPerChunk !== undefined) {
    merged.maxProviderBoundaryFailuresPerChunk = input.maxProviderBoundaryFailuresPerChunk;
  }
  if (input.maxConsecutiveProviderBoundaryFailures !== undefined) {
    merged.maxConsecutiveProviderBoundaryFailures = input.maxConsecutiveProviderBoundaryFailures;
  }
  if (input.maxChunkFailureRatio !== undefined) {
    merged.maxChunkFailureRatio = input.maxChunkFailureRatio;
  }
  if (input.minChunkAttemptsForFailureRatio !== undefined) {
    merged.minChunkAttemptsForFailureRatio = input.minChunkAttemptsForFailureRatio;
  }
  return merged;
}

function updateFailureCircuitBreaker(input: {
  state: ChunkFailureCircuitBreakerState;
  options: Required<DocumentIngestionFailureCircuitBreakerOptions>;
  sourceRecord: DocumentIngestionRunnerSourceRecord;
  chunkIndex: number;
}): void {
  const { state, options, sourceRecord, chunkIndex } = input;
  if (!options.enabled) {
    return;
  }

  state.attempted += 1;
  if (sourceRecord.status !== "failed") {
    state.consecutiveProviderBoundaryFailures = 0;
    return;
  }

  state.failed += 1;
  const failureClass = classifyDocumentIngestionFailure(sourceRecord.errorMessage ?? "");
  state.failureCounts[failureClass] += 1;

  if (failureClass === "provider_credit") {
    throw new DocumentIngestionFailureCircuitBreakerError(
      `document ingestion failure circuit breaker tripped in chunk ${chunkIndex}: provider_credit after ${state.failed}/${state.attempted} failed source(s)`,
    );
  }

  if (isProviderBoundaryFailure(failureClass)) {
    state.providerBoundaryFailures += 1;
    state.consecutiveProviderBoundaryFailures += 1;
  } else {
    state.consecutiveProviderBoundaryFailures = 0;
  }

  if (state.consecutiveProviderBoundaryFailures >= options.maxConsecutiveProviderBoundaryFailures) {
    throw new DocumentIngestionFailureCircuitBreakerError(
      `document ingestion failure circuit breaker tripped in chunk ${chunkIndex}: ${state.consecutiveProviderBoundaryFailures} consecutive provider-boundary failures`,
    );
  }

  if (state.providerBoundaryFailures >= options.maxProviderBoundaryFailuresPerChunk) {
    throw new DocumentIngestionFailureCircuitBreakerError(
      `document ingestion failure circuit breaker tripped in chunk ${chunkIndex}: ${state.providerBoundaryFailures} provider-boundary failures in one chunk`,
    );
  }

  if (
    state.attempted >= options.minChunkAttemptsForFailureRatio &&
    state.failed / state.attempted >= options.maxChunkFailureRatio
  ) {
    throw new DocumentIngestionFailureCircuitBreakerError(
      `document ingestion failure circuit breaker tripped in chunk ${chunkIndex}: ${state.failed}/${state.attempted} sources failed`,
    );
  }
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
  memoryStore?: CapturedObjectWriteStore;
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

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildDocumentIngestStrategyPreview(
  source: DocumentIngestionRunnerSource,
): Pick<DocumentIngestionRunnerProcessedSource, "ingestStrategy" | "strategyTelemetry"> {
  const ingestStrategy = selectDocumentIngestStrategy({
    requestedStrategy: process.env.MODEL_MEMORY_DOCUMENT_INGEST_STRATEGY,
    sourceText: source.document.text,
    largeDocWordThreshold: readPositiveIntegerEnv(
      "MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD",
      2500,
    ),
  });
  if (ingestStrategy !== "section_map_candidate_hints") {
    return { ingestStrategy };
  }
  const sectionMap = buildSectionMapDocument({
    sourceId: source.sourceId,
    sourcePath: source.displayPath,
    text: source.document.text,
  });
  return {
    ingestStrategy,
    strategyTelemetry: buildSectionMapStrategyTelemetry({
      document: sectionMap,
      validations: [],
    }),
  };
}

function createInstrumentedInterpreter(input: {
  interpreter: SemanticInterpreter;
  onModelStep?: DocumentIngestionRunnerModelStepCallback;
}): SemanticInterpreter {
  const onModelStep = input.onModelStep;
  if (!onModelStep) {
    return input.interpreter;
  }

  return {
    async interpret(
      interpreterInput: SemanticInterpreterInput,
    ): Promise<SemanticInterpreterResult> {
      const startedMs = Date.now();
      const startedAt = new Date(startedMs).toISOString();
      const stepId = [
        interpreterInput.prompt.contract.contractName,
        interpreterInput.prompt.contract.contractVersion,
        interpreterInput.sourceWindow.id,
        startedMs,
      ].join(":");
      const baseEvent = {
        stepId,
        contractName: interpreterInput.prompt.contract.contractName,
        contractVersion: interpreterInput.prompt.contract.contractVersion,
        sourceKind: interpreterInput.sourceKind,
        sourceId: interpreterInput.sourceId,
        sourceWindowId: interpreterInput.sourceWindow.id,
        sourceWindowIndex: interpreterInput.sourceWindow.windowIndex,
        startedAt,
      };

      await onModelStep({
        ...baseEvent,
        status: "running",
      });

      try {
        const result = await input.interpreter.interpret(interpreterInput);
        const completedMs = Date.now();
        await onModelStep({
          ...baseEvent,
          status: "completed",
          completedAt: new Date(completedMs).toISOString(),
          durationMs: completedMs - startedMs,
        });
        return result;
      } catch (error) {
        const completedMs = Date.now();
        await onModelStep({
          ...baseEvent,
          status: "failed",
          completedAt: new Date(completedMs).toISOString(),
          durationMs: completedMs - startedMs,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
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

function buildProgressTelemetry(input: {
  record: DocumentIngestionRunnerRunRecord;
  estimatedCostPerSourceUsd?: number;
  circuitBreakerReason?: string;
}): DocumentIngestionRunnerProgressTelemetry {
  const docsPending = input.record.sources.filter(
    (source) => source.status === "pending" || source.status === "running",
  ).length;
  const docsAttempted = input.record.totals.docsAttempted;
  const telemetry: DocumentIngestionRunnerProgressTelemetry = {
    docsAttempted,
    docsCompleted: input.record.totals.docsCompleted,
    docsFailed: input.record.totals.docsFailed,
    docsPending,
    totalSources: input.record.sources.length,
    failureRate: docsAttempted > 0 ? input.record.totals.docsFailed / docsAttempted : 0,
  };
  if (input.estimatedCostPerSourceUsd !== undefined) {
    telemetry.estimatedRemainingCostUsd = docsPending * input.estimatedCostPerSourceUsd;
  }
  if (input.circuitBreakerReason) {
    telemetry.circuitBreakerReason = input.circuitBreakerReason;
  }
  return telemetry;
}

async function runWithConcurrency<T>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  let stopError: unknown;
  const concurrency = Math.max(1, maxConcurrency);

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length && !stopError) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        await worker(items[currentIndex], currentIndex);
      } catch (error) {
        stopError ??= error;
        break;
      }
    }
  });

  await Promise.all(runners);
  if (stopError) {
    throw stopError;
  }
}

export class ModelMemoryDocumentIngestionRunnerService {
  private readonly memoryStore?: CapturedObjectWriteStore;

  constructor(private readonly deps: ModelMemoryDocumentIngestionRunnerServiceDependencies) {
    this.memoryStore = deps.memoryStore;
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
    retryFailed?: boolean;
    retryFailedClasses?: DocumentIngestionFailureClass[];
    rebuildRuntime?: boolean;
    failureCircuitBreaker?: DocumentIngestionFailureCircuitBreakerOptions;
    estimatedCostPerSourceUsd?: number;
    onProgress?: (event: DocumentIngestionRunnerProgressEvent) => void | Promise<void>;
  }): Promise<DocumentIngestionRunnerRunRecord> {
    const maxConcurrency = Math.max(1, input.maxConcurrency ?? 1);
    const failureCircuitBreaker = mergeFailureCircuitBreakerOptions(input.failureCircuitBreaker);
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

    let failurePhase: DocumentIngestionRunnerRunError["phase"] = "processing_source";
    let failureChunkIndex: number | undefined;
    let failureSource: DocumentIngestionRunnerSource | undefined;

    try {
      await input.onProgress?.({
        type: "phase",
        phase: "start",
        message: `starting document ingestion run ${input.runId} with ${input.sources.length} sources`,
        telemetry: buildProgressTelemetry({
          record,
          estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
        }),
      });

      const orderedChunks = [...new Set(input.sources.map((source) => source.chunkIndex))].toSorted(
        (left, right) => left - right,
      );
      const totalSources = input.sources.length;

      for (const chunkIndex of orderedChunks) {
        failureChunkIndex = chunkIndex;
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
            existingSource.status === "running" ||
            (input.retryFailed === true &&
              existingSource.status === "failed" &&
              (!input.retryFailedClasses ||
                input.retryFailedClasses.includes(
                  classifyDocumentIngestionFailure(existingSource.errorMessage ?? ""),
                )))
          );
        });

        if (pendingSources.length === 0) {
          await input.onProgress?.({
            type: "phase",
            phase: "resume_chunk",
            message: `skipping chunk ${chunkIndex}; already completed in prior run record`,
            telemetry: buildProgressTelemetry({
              record,
              estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
            }),
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
          telemetry: buildProgressTelemetry({
            record,
            estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
          }),
        });

        const failureCircuitBreakerState = createChunkFailureCircuitBreakerState();
        await runWithConcurrency(pendingSources, maxConcurrency, async (source) => {
          failurePhase = "processing_source";
          failureSource = source;
          const sourceIndex =
            input.sources.findIndex((entry) => entry.sourceId === source.sourceId) + 1;
          const sourceRecord = record.sources.find((entry) => entry.sourceId === source.sourceId);
          if (sourceRecord) {
            sourceRecord.status = "running";
            sourceRecord.activeStage = "source_started";
            sourceRecord.activeModelStep = undefined;
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
            telemetry: buildProgressTelemetry({
              record,
              estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
            }),
          });

          let nextRecord: DocumentIngestionRunnerSourceRecord;
          try {
            const onModelStep: DocumentIngestionRunnerModelStepCallback = async (event) => {
              const currentSourceRecord = record.sources.find(
                (entry) => entry.sourceId === source.sourceId,
              );
              if (!currentSourceRecord) {
                return;
              }
              const modelStepEvents = [...(currentSourceRecord.modelStepEvents ?? []), event].slice(
                -100,
              );
              currentSourceRecord.modelStepEvents = modelStepEvents;
              currentSourceRecord.activeModelStep = event.status === "running" ? event : undefined;
              currentSourceRecord.activeStage =
                event.status === "running"
                  ? `model:${event.contractName}/${event.contractVersion}`
                  : event.status === "failed"
                    ? `model_failed:${event.contractName}/${event.contractVersion}`
                    : `model_completed:${event.contractName}/${event.contractVersion}`;
              record = recalculateRunRecord(record);
              await input.recordStore?.save(record);
            };
            const processed = await this.processSource({
              runId: input.runId,
              source,
              interpreter: createInstrumentedInterpreter({
                interpreter: input.interpreter,
                onModelStep,
              }),
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
              ingestStrategy: processed.ingestStrategy,
              strategyTelemetry: processed.strategyTelemetry,
              activeStage: "completed",
              modelStepEvents: sourceRecord?.modelStepEvents,
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
              activeStage: "failed",
              modelStepEvents: sourceRecord?.modelStepEvents,
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
            telemetry: buildProgressTelemetry({
              record,
              estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
            }),
          });

          failurePhase = "failure_circuit_breaker";
          updateFailureCircuitBreaker({
            state: failureCircuitBreakerState,
            options: failureCircuitBreaker,
            sourceRecord: nextRecord,
            chunkIndex,
          });
        });

        failurePhase = "runtime_rebuild_after_chunk";
        failureSource = undefined;
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
        telemetry: buildProgressTelemetry({
          record,
          estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
        }),
      });

      return record;
    } catch (error) {
      const circuitBreakerReason =
        error instanceof DocumentIngestionFailureCircuitBreakerError ? error.message : undefined;
      record = {
        ...recalculateRunRecord(record),
        status: "interrupted",
        updatedAt: new Date().toISOString(),
        runError: {
          phase: failurePhase,
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : undefined,
          chunkIndex: failureChunkIndex,
          sourceId: failureSource?.sourceId,
          displayPath: failureSource?.displayPath,
          occurredAt: new Date().toISOString(),
        },
      };
      await input.recordStore?.save(record);
      await input.onProgress?.({
        type: "phase",
        phase: "complete",
        message: `document ingestion run ${input.runId} interrupted: ${record.runError?.message ?? "unknown error"}`,
        telemetry: buildProgressTelemetry({
          record,
          estimatedCostPerSourceUsd: input.estimatedCostPerSourceUsd,
          circuitBreakerReason,
        }),
      });
      throw error;
    }
  }

  private async processSource(input: {
    runId: string;
    source: DocumentIngestionRunnerSource;
    interpreter: SemanticInterpreter;
    modelId: string;
    candidateModelId: string;
    maxWordsPerWindow?: number;
    rebuildRuntime: boolean;
  }): Promise<DocumentIngestionRunnerProcessedSource> {
    if (this.deps.processSource) {
      const processed = await this.deps.processSource(input.source);
      const preview = buildDocumentIngestStrategyPreview(input.source);
      return {
        ...processed,
        ingestStrategy: processed.ingestStrategy ?? preview.ingestStrategy,
        strategyTelemetry: processed.strategyTelemetry ?? preview.strategyTelemetry,
      };
    }

    if (!this.deps.canonicalRepository) {
      throw new Error(
        "document ingestion runner requires canonicalRepository when no custom processSource is provided",
      );
    }

    const strategyPreview = buildDocumentIngestStrategyPreview(input.source);
    const result = await ingestDocumentLive({
      canonicalRepository: this.deps.canonicalRepository,
      runtimeRepository: this.deps.runtimeRepository,
      memoryStore: this.memoryStore,
      collisionAdjudicator: this.deps.collisionAdjudicator,
      rebuildRuntime: input.rebuildRuntime,
      closeoutRunId: input.runId,
      env: process.env,
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
    const capturedClaimCount =
      result.capturedObjects.length > 0
        ? result.capturedObjects.length
        : result.writeResults.filter(
            (entry) => entry.decision === "write" || entry.decision === "supersede",
          ).length;

    return {
      lineCount: countLines(input.source.document.text),
      windowCount: result.windows.length,
      capturedClaimCount,
      writeDecisionCounts: countBy(result.writeResults.map((entry) => entry.decision)),
      ignoredWindowCount: result.windowResults.filter((entry) => entry.action === "ignore").length,
      rejectedWindowCount: result.windowResults.filter((entry) => entry.action === "reject").length,
      rejectReasons: uniqueSorted(
        result.windowResults.flatMap((entry) =>
          entry.action === "reject" ? entry.errors.map((error) => error.message) : [],
        ),
      ),
      ingestStrategy: strategyPreview.ingestStrategy,
      strategyTelemetry: strategyPreview.strategyTelemetry,
    };
  }
}
