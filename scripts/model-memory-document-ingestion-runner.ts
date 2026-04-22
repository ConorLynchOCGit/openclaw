import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JsonFileDocumentIngestionRunRecordStore,
  ModelMemoryDocumentIngestionRunnerService,
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
import { OpenAICompatibleLiveJsonExecutor } from "../src/agents/model-memory.live-json-executor.js";
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
const DEFAULT_RUN_ID = process.env.MODEL_MEMORY_RUNNER_RUN_ID?.trim() || "document-ingestion-run";
const DEFAULT_RUN_RECORD_PATH =
  process.env.MODEL_MEMORY_RUNNER_RECORD_PATH?.trim() ||
  "checkpoints/model-memory/document-ingestion-run.json";
const RUNNER_PLAN_PATH = process.env.MODEL_MEMORY_RUNNER_PLAN_PATH?.trim();
const RUNNER_SOURCES = process.env.MODEL_MEMORY_RUNNER_SOURCES?.trim();
const RESUME_RUN = process.env.MODEL_MEMORY_RUNNER_RESUME?.trim() !== "0";
const RETRY_FAILED_SOURCES = process.env.MODEL_MEMORY_RUNNER_RETRY_FAILED?.trim() === "1";

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
  constructor(private readonly executor: OpenAICompatibleLiveJsonExecutor) {}

  async interpret(input: SemanticInterpreterInput) {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    return {
      action: "capture" as const,
      objects: [parseMmV2RawJsonOutput(response.outputText)],
    };
  }
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

async function loadSourcePlan(repoRoot: string): Promise<DocumentIngestionRunnerSource[]> {
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
    sources.push({
      sourceId: `runner-source-${index + 1}`,
      displayPath: normalized.displayPath?.trim() || relativePath,
      chunkIndex: normalized.chunkIndex ?? Math.floor(index / DEFAULT_CHUNK_SIZE) + 1,
      document: {
        externalSourceId: normalized.displayPath?.trim() || relativePath,
        text,
        projectId: normalized.projectId,
        sourceKind: normalized.sourceKind,
        sourceMetadata: normalized.sourceMetadata
          ? {
              relativePath,
              ...normalized.sourceMetadata,
            }
          : { relativePath },
        maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
      },
    });
  }

  return sources;
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

  const runtime = await createModelMemoryDatabaseRuntime({ config });
  try {
    const sources = await loadSourcePlan(repoRoot);
    const executor = new OpenAICompatibleLiveJsonExecutor({
      config,
      requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
      requestSeed: DEFAULT_REQUEST_SEED,
    });
    const interpreter = new ExecutorBackedMmV2SemanticInterpreter(executor);
    const service = new ModelMemoryDocumentIngestionRunnerService({
      canonicalRepository: runtime.canonicalRepository,
      runtimeRepository: runtime.runtimeRepository,
    });
    const recordStore = new JsonFileDocumentIngestionRunRecordStore(
      path.resolve(repoRoot, DEFAULT_RUN_RECORD_PATH),
    );

    const record = await service.executeRun({
      runId: DEFAULT_RUN_ID,
      sources,
      interpreter,
      modelId: DEFAULT_MODEL_REF,
      candidateModelId: DEFAULT_CANDIDATE_MODEL_REF,
      chunkSize: DEFAULT_CHUNK_SIZE,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
      maxWordsPerWindow: DEFAULT_MAX_WORDS_PER_WINDOW,
      recordStore,
      resume: RESUME_RUN,
      retryFailed: RETRY_FAILED_SOURCES,
      onProgress: (event) => {
        process.stderr.write(`[model-memory-runner] ${event.message}\n`);
      },
    });

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
