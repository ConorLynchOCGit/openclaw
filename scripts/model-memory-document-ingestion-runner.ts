import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDocumentIngestionFailure,
  JsonFileDocumentIngestionRunRecordStore,
  ModelMemoryDocumentIngestionRunnerService,
  type DocumentIngestionFailureClass,
  type DocumentIngestionRunnerRunRecord,
  type DocumentIngestionRunnerSource,
  type SemanticInterpreter,
  type SemanticInterpreterInput,
} from "../extensions/model-memory/runtime-api.js";
import { createModelMemoryDatabaseRuntime } from "../src/agents/model-memory.database.js";
import {
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED,
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS,
} from "../src/agents/model-memory.large-document-evidence.js";
import {
  ModelMemoryLiveExecutionError,
  OpenAICompatibleLiveJsonExecutor,
} from "../src/agents/model-memory.live-json-executor.js";
import {
  loadSanitizedModelMemoryRunnerConfig,
  writeSanitizedModelMemoryRunnerConfig,
} from "../src/agents/model-memory.run-config.js";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_EVIDENCE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_CANDIDATE_MODEL_REF =
  process.env.MODEL_MEMORY_CANDIDATE_MODEL?.trim() || "openrouter/openai/gpt-5.4-nano";
const DEFAULT_REQUEST_TIMEOUT_MS =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_TIMEOUT_MS?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_TIMEOUT_MS;
const DEFAULT_REQUEST_SEED =
  Number.parseInt(process.env.MODEL_MEMORY_REQUEST_SEED?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_REQUEST_SEED;
const DEFAULT_MAX_WORDS_PER_WINDOW =
  Number.parseInt(process.env.MODEL_MEMORY_EVIDENCE_MAX_WORDS_PER_WINDOW?.trim() ?? "", 10) ||
  LARGE_DOCUMENT_EVIDENCE_MAX_WORDS_PER_WINDOW;
const DEFAULT_CHUNK_SIZE =
  Number.parseInt(process.env.MODEL_MEMORY_RUNNER_CHUNK_SIZE?.trim() ?? "", 10) || 10;
const DEFAULT_MAX_CONCURRENCY =
  Number.parseInt(process.env.MODEL_MEMORY_RUNNER_MAX_CONCURRENCY?.trim() ?? "", 10) || 1;
const FAILURE_CIRCUIT_BREAKER_ENABLED =
  process.env.MODEL_MEMORY_RUNNER_FAILURE_CIRCUIT_BREAKER?.trim() !== "0";
const MAX_PROVIDER_BOUNDARY_FAILURES_PER_CHUNK =
  Number.parseInt(
    process.env.MODEL_MEMORY_RUNNER_MAX_PROVIDER_BOUNDARY_FAILURES_PER_CHUNK?.trim() ?? "",
    10,
  ) || undefined;
const MAX_CONSECUTIVE_PROVIDER_BOUNDARY_FAILURES =
  Number.parseInt(
    process.env.MODEL_MEMORY_RUNNER_MAX_CONSECUTIVE_PROVIDER_BOUNDARY_FAILURES?.trim() ?? "",
    10,
  ) || undefined;
const MAX_CHUNK_FAILURE_RATIO = Number.parseFloat(
  process.env.MODEL_MEMORY_RUNNER_MAX_CHUNK_FAILURE_RATIO?.trim() ?? "",
);
const MIN_CHUNK_ATTEMPTS_FOR_FAILURE_RATIO =
  Number.parseInt(
    process.env.MODEL_MEMORY_RUNNER_MIN_CHUNK_ATTEMPTS_FOR_FAILURE_RATIO?.trim() ?? "",
    10,
  ) || undefined;
const DEFAULT_RUN_ID = process.env.MODEL_MEMORY_RUNNER_RUN_ID?.trim() || "document-ingestion-run";
const DEFAULT_RUN_RECORD_PATH =
  process.env.MODEL_MEMORY_RUNNER_RECORD_PATH?.trim() ||
  "checkpoints/model-memory/document-ingestion-run.json";
const RUNNER_PLAN_PATH = process.env.MODEL_MEMORY_RUNNER_PLAN_PATH?.trim();
const RUNNER_SOURCES = process.env.MODEL_MEMORY_RUNNER_SOURCES?.trim();
const RESUME_RUN = process.env.MODEL_MEMORY_RUNNER_RESUME?.trim() !== "0";
const RETRY_FAILED_SOURCES = process.env.MODEL_MEMORY_RUNNER_RETRY_FAILED?.trim() === "1";
const RETRY_FAILED_CLASSES = process.env.MODEL_MEMORY_RUNNER_RETRY_FAILED_CLASSES?.trim();
const PROVIDER_PREFLIGHT_ENABLED = process.env.MODEL_MEMORY_RUNNER_PREFLIGHT?.trim() !== "0";
const ALTERNATE_MODEL_REF = process.env.MODEL_MEMORY_RUNNER_ALTERNATE_MODEL?.trim();
const EMPTY_RESPONSE_RETRY_CAP =
  Number.parseInt(process.env.MODEL_MEMORY_RUNNER_EMPTY_RESPONSE_RETRIES?.trim() ?? "", 10) || 1;
const SPLIT_LARGE_SOURCES = process.env.MODEL_MEMORY_RUNNER_SPLIT_LARGE_SOURCES?.trim() !== "0";
const MAX_WORDS_PER_SOURCE =
  Number.parseInt(process.env.MODEL_MEMORY_RUNNER_MAX_WORDS_PER_SOURCE?.trim() ?? "", 10) ||
  DEFAULT_MAX_WORDS_PER_WINDOW * 4;
const ESTIMATED_COST_PER_SOURCE_USD = Number.parseFloat(
  process.env.MODEL_MEMORY_RUNNER_ESTIMATED_COST_PER_SOURCE_USD?.trim() ?? "",
);
const FAILED_SOURCE_REPORT_PATH = process.env.MODEL_MEMORY_RUNNER_FAILED_SOURCE_REPORT_PATH?.trim();
const REPORT_ONLY = process.env.MODEL_MEMORY_RUNNER_REPORT_ONLY?.trim() === "1";

function stripOuterJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match?.[1]?.trim() ?? trimmed;
}

function extractStructuredJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return text.trim();
}

function parseMmV2RawJsonOutput(outputText: string): unknown {
  return JSON.parse(extractStructuredJsonCandidate(stripOuterJsonCodeFence(outputText)));
}

class ExecutorBackedMmV2SemanticInterpreter implements SemanticInterpreter {
  constructor(
    private readonly executor: OpenAICompatibleLiveJsonExecutor,
    private readonly options: {
      emptyResponseRetryCap: number;
      alternateModelId?: string;
    },
  ) {}

  async interpret(input: SemanticInterpreterInput) {
    const attempts = this.buildAttemptModelIds(input.prompt.contract.modelId);
    let lastError: unknown;
    for (const modelId of attempts) {
      try {
        const response = await this.executor.execute({
          contract: {
            ...input.prompt.contract,
            modelId,
          },
          systemPrompt: input.prompt.systemPrompt,
          userPrompt: input.prompt.userPrompt,
          responseFormat: input.prompt.responseFormat,
          responseOptions: input.prompt.responseOptions,
        });
        return {
          action: "capture" as const,
          objects: [parseMmV2RawJsonOutput(response.outputText)],
        };
      } catch (error) {
        if (!isProviderEmptyResponseError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private buildAttemptModelIds(primaryModelId: string): string[] {
    const attempts = [primaryModelId];
    const retryCap = Math.max(0, this.options.emptyResponseRetryCap);
    for (let index = 0; index < retryCap; index += 1) {
      attempts.push(primaryModelId);
    }
    if (this.options.alternateModelId && this.options.alternateModelId !== primaryModelId) {
      attempts.push(this.options.alternateModelId);
    }
    return attempts;
  }
}

function isProviderEmptyResponseError(error: unknown): boolean {
  return (
    error instanceof ModelMemoryLiveExecutionError &&
    error.trace.failureStage === "provider_response" &&
    (error.trace.errorMessage ?? "").toLowerCase().includes("missing text content")
  );
}

function parseFailureClassFilter(
  value: string | undefined,
): DocumentIngestionFailureClass[] | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<DocumentIngestionFailureClass>([
    "provider_credit",
    "provider_empty_response",
    "provider_connection",
    "provider_json_boundary",
    "extraction_repair",
    "capture_routing_repair",
    "canonicalization",
    "db_persistence",
    "timeout",
    "other",
  ]);
  const classes = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is DocumentIngestionFailureClass =>
      allowed.has(entry as DocumentIngestionFailureClass),
    );
  return classes.length > 0 ? classes : undefined;
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;
}

function splitTextByWordLimit(text: string, maxWords: number): string[] {
  if (maxWords <= 0 || countWords(text) <= maxWords) {
    return [text];
  }
  const tokens = text.match(/\S+\s*/gu) ?? [];
  const parts: string[] = [];
  for (let index = 0; index < tokens.length; index += maxWords) {
    const part = tokens
      .slice(index, index + maxWords)
      .join("")
      .trim();
    if (part.length > 0) {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts : [text];
}

function formatProgressTelemetry(
  telemetry:
    | {
        docsAttempted: number;
        docsCompleted: number;
        docsFailed: number;
        docsPending: number;
        failureRate: number;
        estimatedRemainingCostUsd?: number;
        circuitBreakerReason?: string;
      }
    | undefined,
): string {
  if (!telemetry) {
    return "";
  }
  const parts = [
    `attempted=${telemetry.docsAttempted}`,
    `completed=${telemetry.docsCompleted}`,
    `failed=${telemetry.docsFailed}`,
    `pending=${telemetry.docsPending}`,
    `failureRate=${telemetry.failureRate.toFixed(3)}`,
  ];
  if (telemetry.estimatedRemainingCostUsd !== undefined) {
    parts.push(`estimatedRemainingCostUsd=${telemetry.estimatedRemainingCostUsd.toFixed(4)}`);
  }
  if (telemetry.circuitBreakerReason) {
    parts.push(`circuitBreakerReason=${JSON.stringify(telemetry.circuitBreakerReason)}`);
  }
  return ` progress(${parts.join(" ")})`;
}

type SourcePlanEntry =
  | string
  | {
      relativePath: string;
      displayPath?: string;
      chunkIndex?: number;
      projectId?: string;
      sourceKind?: "document" | "daily_continuity";
      sourceMetadata?: Record<string, unknown>;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function loadSourcePlan(
  repoRoot: string,
  existingRecord?: DocumentIngestionRunnerRunRecord,
): Promise<DocumentIngestionRunnerSource[]> {
  let planEntries: SourcePlanEntry[] = [];

  if (RUNNER_PLAN_PATH) {
    const raw = await readFile(path.resolve(repoRoot, RUNNER_PLAN_PATH), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      planEntries = parsed as SourcePlanEntry[];
    } else if (isRecord(parsed) && Array.isArray(parsed.sources)) {
      planEntries = parsed.sources as SourcePlanEntry[];
    } else {
      throw new Error(
        'MODEL_MEMORY_RUNNER_PLAN_PATH must point to a JSON array or {"sources":[...]} file',
      );
    }
  } else if (RUNNER_SOURCES) {
    planEntries = RUNNER_SOURCES.split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  } else {
    throw new Error(
      "set MODEL_MEMORY_RUNNER_SOURCES or MODEL_MEMORY_RUNNER_PLAN_PATH for document ingestion runner",
    );
  }

  const sources: DocumentIngestionRunnerSource[] = [];
  for (const [index, entry] of planEntries.entries()) {
    const normalized = typeof entry === "string" ? { relativePath: entry } : entry;
    const relativePath = normalized.relativePath.trim();
    const absolutePath = path.resolve(repoRoot, relativePath);
    const text = await readFile(absolutePath, "utf8");
    const baseSourceId = `runner-source-${index + 1}`;
    const displayPath = normalized.displayPath?.trim() || relativePath;
    const chunkIndex = normalized.chunkIndex ?? Math.floor(index / DEFAULT_CHUNK_SIZE) + 1;
    const existingSource = existingRecord?.sources.some(
      (source) => source.sourceId === baseSourceId,
    );
    const parts =
      SPLIT_LARGE_SOURCES && !existingSource
        ? splitTextByWordLimit(text, MAX_WORDS_PER_SOURCE)
        : [text];
    for (const [partIndex, partText] of parts.entries()) {
      const splitMetadata =
        parts.length > 1
          ? {
              split_parent_relative_path: relativePath,
              split_part: partIndex + 1,
              split_total: parts.length,
              split_max_words_per_source: MAX_WORDS_PER_SOURCE,
            }
          : {};
      const sourceId =
        partIndex === 0
          ? baseSourceId
          : `${baseSourceId}-part-${String(partIndex + 1).padStart(3, "0")}`;
      sources.push({
        sourceId,
        displayPath:
          parts.length > 1
            ? `${displayPath}#part-${partIndex + 1}-of-${parts.length}`
            : displayPath,
        chunkIndex,
        document: {
          externalSourceId:
            parts.length > 1
              ? `${displayPath}#part-${partIndex + 1}-of-${parts.length}`
              : displayPath,
          text: partText,
          projectId: normalized.projectId,
          sourceKind: normalized.sourceKind,
          sourceMetadata: {
            relativePath,
            ...splitMetadata,
            ...normalized.sourceMetadata,
          },
          maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
        },
      });
    }
  }

  return sources;
}

function buildFailedSourceReport(record: DocumentIngestionRunnerRunRecord) {
  const failedSources = record.sources
    .filter((source) => source.status === "failed")
    .map((source) => {
      const failureClass = classifyDocumentIngestionFailure(source.errorMessage ?? "");
      return {
        sourceId: source.sourceId,
        displayPath: source.displayPath,
        chunkIndex: source.chunkIndex,
        failureClass,
        retryRecommendedAfterFix: failureClass !== "provider_credit",
        errorMessage: source.errorMessage?.slice(0, 500),
      };
    });
  const failureClassCounts: Record<string, number> = {};
  for (const source of failedSources) {
    failureClassCounts[source.failureClass] = (failureClassCounts[source.failureClass] ?? 0) + 1;
  }
  return {
    schema_version: "model_memory_failed_source_quarantine.v1",
    generated_at: new Date().toISOString(),
    runId: record.runId,
    runStatus: record.status,
    counts: {
      failed: failedSources.length,
      completed: record.totals.docsCompleted,
      pending: record.sources.filter(
        (source) => source.status === "pending" || source.status === "running",
      ).length,
    },
    failure_class_counts: failureClassCounts,
    retry_only_after_fix: true,
    retry_failed_classes_env: "MODEL_MEMORY_RUNNER_RETRY_FAILED_CLASSES",
    failed_sources: failedSources,
  };
}

async function writeFailedSourceReport(input: {
  repoRoot: string;
  record: DocumentIngestionRunnerRunRecord;
}): Promise<string> {
  const outputPath = path.resolve(
    input.repoRoot,
    FAILED_SOURCE_REPORT_PATH || `${DEFAULT_RUN_RECORD_PATH}.failed-sources.json`,
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(buildFailedSourceReport(input.record), null, 2)}\n`,
    "utf8",
  );
  return outputPath;
}

async function resolvePreflightModel(input: {
  executor: OpenAICompatibleLiveJsonExecutor;
  primaryModelId: string;
  alternateModelId?: string;
}): Promise<string> {
  if (!PROVIDER_PREFLIGHT_ENABLED) {
    return input.primaryModelId;
  }

  const primary = await input.executor.preflightModel(input.primaryModelId);
  if (primary.ok) {
    process.stderr.write(
      `[model-memory-runner] provider preflight ok provider=${primary.provider} model=${primary.providerModel}\n`,
    );
    return input.primaryModelId;
  }

  process.stderr.write(
    `[model-memory-runner] provider preflight failed provider=${primary.provider} model=${primary.providerModel} status=${primary.httpStatus ?? "n/a"} error=${primary.errorMessage ?? "unknown"}\n`,
  );
  if (input.alternateModelId) {
    const alternate = await input.executor.preflightModel(input.alternateModelId);
    if (alternate.ok) {
      process.stderr.write(
        `[model-memory-runner] alternate provider preflight ok provider=${alternate.provider} model=${alternate.providerModel}\n`,
      );
      return input.alternateModelId;
    }
    throw new Error(
      `model-memory provider preflight failed for primary and alternate models: primary=${primary.errorMessage ?? primary.httpStatus ?? "unknown"} alternate=${alternate.errorMessage ?? alternate.httpStatus ?? "unknown"}`,
    );
  }

  throw new Error(
    `model-memory provider preflight failed before runner start: ${primary.httpStatus ?? "n/a"} ${primary.errorMessage ?? "unknown"}`,
  );
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = await loadSanitizedModelMemoryRunnerConfig({
    purpose: "model-memory document ingestion runner",
  });
  process.env.OPENCLAW_CONFIG_PATH = await writeSanitizedModelMemoryRunnerConfig({
    config,
    tempPrefix: "openclaw-model-memory-document-runner-",
  });

  const recordStore = new JsonFileDocumentIngestionRunRecordStore(
    path.resolve(repoRoot, DEFAULT_RUN_RECORD_PATH),
  );
  const existingRecord = RESUME_RUN ? await recordStore.load(DEFAULT_RUN_ID) : undefined;
  if (REPORT_ONLY) {
    if (!existingRecord) {
      throw new Error(`no existing document-ingestion run record found for ${DEFAULT_RUN_ID}`);
    }
    const reportPath = await writeFailedSourceReport({ repoRoot, record: existingRecord });
    process.stdout.write(`${reportPath}\n`);
    return;
  }
  const sources = await loadSourcePlan(repoRoot, existingRecord);
  const executor = new OpenAICompatibleLiveJsonExecutor({
    config,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    requestSeed: DEFAULT_REQUEST_SEED,
  });
  const activeModelRef = await resolvePreflightModel({
    executor,
    primaryModelId: DEFAULT_MODEL_REF,
    alternateModelId: ALTERNATE_MODEL_REF,
  });
  let activeCandidateModelRef =
    DEFAULT_CANDIDATE_MODEL_REF === DEFAULT_MODEL_REF
      ? activeModelRef
      : DEFAULT_CANDIDATE_MODEL_REF;
  if (activeCandidateModelRef !== activeModelRef && PROVIDER_PREFLIGHT_ENABLED) {
    activeCandidateModelRef = await resolvePreflightModel({
      executor,
      primaryModelId: activeCandidateModelRef,
      alternateModelId: ALTERNATE_MODEL_REF,
    });
  }

  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const interpreter = new ExecutorBackedMmV2SemanticInterpreter(executor, {
      emptyResponseRetryCap: EMPTY_RESPONSE_RETRY_CAP,
      alternateModelId: ALTERNATE_MODEL_REF,
    });
    const service = new ModelMemoryDocumentIngestionRunnerService({
      canonicalRepository: runtime.canonicalRepository,
      runtimeRepository: runtime.runtimeRepository,
    });

    let record: DocumentIngestionRunnerRunRecord;
    try {
      record = await service.executeRun({
        runId: DEFAULT_RUN_ID,
        sources,
        interpreter,
        modelId: activeModelRef,
        candidateModelId: activeCandidateModelRef,
        chunkSize: DEFAULT_CHUNK_SIZE,
        maxConcurrency: DEFAULT_MAX_CONCURRENCY,
        maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
        failureCircuitBreaker: {
          enabled: FAILURE_CIRCUIT_BREAKER_ENABLED,
          maxProviderBoundaryFailuresPerChunk: MAX_PROVIDER_BOUNDARY_FAILURES_PER_CHUNK,
          maxConsecutiveProviderBoundaryFailures: MAX_CONSECUTIVE_PROVIDER_BOUNDARY_FAILURES,
          maxChunkFailureRatio: Number.isFinite(MAX_CHUNK_FAILURE_RATIO)
            ? MAX_CHUNK_FAILURE_RATIO
            : undefined,
          minChunkAttemptsForFailureRatio: MIN_CHUNK_ATTEMPTS_FOR_FAILURE_RATIO,
        },
        estimatedCostPerSourceUsd: Number.isFinite(ESTIMATED_COST_PER_SOURCE_USD)
          ? ESTIMATED_COST_PER_SOURCE_USD
          : undefined,
        recordStore,
        resume: RESUME_RUN,
        retryFailed: RETRY_FAILED_SOURCES,
        retryFailedClasses: parseFailureClassFilter(RETRY_FAILED_CLASSES),
        onProgress: (event) => {
          process.stderr.write(
            `[model-memory-runner] ${event.message}${formatProgressTelemetry(event.telemetry)}\n`,
          );
        },
      });
    } catch (error) {
      const interruptedRecord = await recordStore.load(DEFAULT_RUN_ID);
      if (interruptedRecord) {
        const reportPath = await writeFailedSourceReport({ repoRoot, record: interruptedRecord });
        process.stderr.write(
          `[model-memory-runner] failed-source quarantine report ${reportPath}\n`,
        );
      }
      throw error;
    }

    const reportPath = await writeFailedSourceReport({ repoRoot, record });
    process.stderr.write(`[model-memory-runner] failed-source quarantine report ${reportPath}\n`);

    process.stdout.write(
      `${path.resolve(repoRoot, DEFAULT_RUN_RECORD_PATH)}\n${JSON.stringify(record.totals, null, 2)}\n`,
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
