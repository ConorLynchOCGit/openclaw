import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  JsonFileDocumentIngestionRunRecordStore,
  ModelMemoryDocumentIngestionRunnerService,
  type DocumentIngestionRunRecordStore,
  type DocumentIngestionRunnerRunRecord,
  type DocumentIngestionRunnerSource,
} from "./admin/document-ingestion-runner-service.ts";
import { isLegacyCapturedObjectWriteFallbackEnabled } from "./db/captured-object-write-compatibility.ts";
import type { JsonModelExecutor } from "./model-execution.ts";
import { ExecutorBackedSemanticInterpreter } from "./real-semantic-interpreter.ts";
import {
  buildWorkspaceMemorySourceMetadata,
  isDailyWorkspaceMemoryNote,
  stripGeneratedWorkspaceMemoryZones,
  resolveRepoCanonicalReadPath,
} from "./workspace-source-utils.ts";

const DEFAULT_MODEL_REF =
  process.env.MODEL_MEMORY_DOCUMENT_INGEST_MODEL_ID?.trim() ||
  process.env.MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID?.trim() ||
  "openai-codex/gpt-5.4-mini";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_REQUEST_SEED = 7;
const DEFAULT_MAX_WORDS_PER_WINDOW = 1500;
const DEFAULT_CHUNK_SIZE = 10;
const DEFAULT_MAX_CONCURRENCY = 1;

type ModelMemoryRuntimeApi = NonNullable<OpenClawPluginApi["runtime"]>["modelMemory"];
type ModelMemoryRuntime = Awaited<ReturnType<ModelMemoryRuntimeApi["createDatabaseRuntime"]>>;
type ModelMemoryLiveExecutor = JsonModelExecutor & {
  getRequestTimeoutMs: () => number;
  getRequestSeed: () => number | undefined;
};

type ModelMemoryToolContext = {
  workspaceDir?: string;
  sandboxed?: boolean;
};

type InternalRuntimeDeps = {
  createDatabaseRuntime: ModelMemoryRuntimeApi["createDatabaseRuntime"];
  createLiveJsonExecutor: (
    options?: Parameters<ModelMemoryRuntimeApi["createLiveJsonExecutor"]>[0],
  ) => Promise<ModelMemoryLiveExecutor>;
};

type ToolInternalDependencies = {
  loadInternalRuntimeDeps?: () => Promise<InternalRuntimeDeps>;
  readTextFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  createRecordStore?: (filePath: string) => DocumentIngestionRunRecordStore;
  createRunnerService?: (
    runtime: ModelMemoryRuntime,
  ) => Pick<ModelMemoryDocumentIngestionRunnerService, "executeRun">;
};

type DocumentIngestionToolParams = {
  source?: unknown;
  sources?: unknown;
  runId?: unknown;
  recordPath?: unknown;
  chunkSize?: unknown;
  maxConcurrency?: unknown;
  resume?: unknown;
  modelId?: unknown;
  candidateModelId?: unknown;
  requestTimeoutMs?: unknown;
  requestSeed?: unknown;
  maxWordsPerWindow?: unknown;
  projectId?: unknown;
  rebuildRuntime?: unknown;
};

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return fallback;
}

function readInteger(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  return fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "1" || raw === "true" || raw === "yes") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }
  return fallback;
}

function resolveWorkspaceRoot(ctx: ModelMemoryToolContext): string {
  return ctx.workspaceDir ? path.resolve(ctx.workspaceDir) : process.cwd();
}

async function emitDocumentIngestionToolProgress(
  onUpdate: AgentToolUpdateCallback<unknown> | undefined,
  text: string,
) {
  if (!onUpdate) {
    return;
  }
  await Promise.resolve(
    onUpdate({
      content: [
        {
          type: "text",
          text,
        },
      ],
      details: undefined,
    } satisfies AgentToolResult<unknown>),
  );
}

function assertWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error("paths must be workspace-relative, not absolute");
  }
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const relativeFromRoot = path.relative(workspaceRoot, absolutePath);
  if (
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot) ||
    (relativeFromRoot.length === 0 && absolutePath !== workspaceRoot)
  ) {
    throw new Error(`path escapes workspace root: ${relativePath}`);
  }
  return absolutePath;
}

async function loadInternalRuntimeDeps(api: OpenClawPluginApi): Promise<InternalRuntimeDeps> {
  const runtime = api.runtime?.modelMemory;
  if (!runtime) {
    throw new Error(
      "Internal error: model-memory runtime helpers are not available from the plugin runtime",
    );
  }
  return {
    createDatabaseRuntime: runtime.createDatabaseRuntime,
    createLiveJsonExecutor: runtime.createLiveJsonExecutor,
  };
}

function normalizeSources(params: DocumentIngestionToolParams): string[] {
  const single = readTrimmedString(params.source);
  if (single) {
    return [single];
  }
  if (!Array.isArray(params.sources) || params.sources.length === 0) {
    throw new Error(
      "provide source for one workspace-relative path or sources for a non-empty list of workspace-relative file paths",
    );
  }
  const normalized = params.sources
    .map((entry) => readTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (normalized.length === 0) {
    throw new Error("sources must include at least one non-empty workspace-relative path");
  }
  return normalized;
}

async function buildRunnerSources(input: {
  workspaceRoot: string;
  sources: string[];
  chunkSize: number;
  projectId?: string;
  maxWordsPerWindow: number;
  readTextFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
}): Promise<DocumentIngestionRunnerSource[]> {
  const records: DocumentIngestionRunnerSource[] = [];
  for (const [index, sourcePath] of input.sources.entries()) {
    const canonical = resolveRepoCanonicalReadPath({
      inputPath: sourcePath,
      workspaceRoot: input.workspaceRoot,
    });
    const absolutePath =
      canonical?.absolutePath ?? assertWorkspaceRelativePath(input.workspaceRoot, sourcePath);
    const displayPath = canonical?.logicalPath ?? sourcePath;
    const rawText = await input.readTextFile(absolutePath, "utf8");
    const text = stripGeneratedWorkspaceMemoryZones({
      relativePath: displayPath,
      content: rawText,
    });
    const memorySourceMetadata = buildWorkspaceMemorySourceMetadata({
      relativePath: displayPath,
      content: rawText,
    });
    records.push({
      sourceId: `model-memory-tool-source-${index + 1}`,
      displayPath,
      chunkIndex: Math.floor(index / input.chunkSize) + 1,
      document: {
        externalSourceId: displayPath,
        text,
        projectId: input.projectId,
        sourceKind: isDailyWorkspaceMemoryNote(displayPath) ? "daily_continuity" : "document",
        sourceMetadata: {
          relativePath: displayPath,
          sourceSurface: "model_memory_document_ingest_tool",
          contentHash: memorySourceMetadata.contentHash,
          sourceAuthority: memorySourceMetadata.sourceAuthority,
          generatedZonesStripped: memorySourceMetadata.generatedZonesStripped,
        },
        maxWordsPerWindow: input.maxWordsPerWindow,
      },
    });
  }
  return records;
}

export function createModelMemoryDocumentIngestionTool(
  api: OpenClawPluginApi,
  ctx: ModelMemoryToolContext,
  deps: ToolInternalDependencies = {},
): AnyAgentTool {
  const workspaceRoot = resolveWorkspaceRoot(ctx);
  const readTextFile = deps.readTextFile ?? readFile;

  return {
    name: "model_memory_document_ingest",
    label: "Model Memory Document Ingest",
    description:
      "Operator/admin tool for ingesting one or more workspace-relative documents into clean-room model-memory. Prefer source for the common single-document case, for example source=docs/projects/model-memory/roadmap.md. Use this when the user asks in natural language to ingest a document into model memory.",
    parameters: Type.Object({
      source: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Preferred common case: one workspace-relative document path to ingest, for example docs/projects/model-memory/roadmap.md.",
        }),
      ),
      sources: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          description:
            "Optional multi-document form: workspace-relative document paths to ingest in the given order.",
        }),
      ),
      runId: Type.Optional(Type.String({ minLength: 1 })),
      recordPath: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Workspace-relative JSON path for the durable run record. Defaults under checkpoints/model-memory/.",
        }),
      ),
      chunkSize: Type.Optional(Type.Number({ minimum: 1 })),
      maxConcurrency: Type.Optional(Type.Number({ minimum: 1 })),
      resume: Type.Optional(Type.Boolean()),
      modelId: Type.Optional(Type.String({ minLength: 1 })),
      candidateModelId: Type.Optional(Type.String({ minLength: 1 })),
      requestTimeoutMs: Type.Optional(Type.Number({ minimum: 1 })),
      requestSeed: Type.Optional(Type.Number()),
      maxWordsPerWindow: Type.Optional(Type.Number({ minimum: 1 })),
      projectId: Type.Optional(Type.String({ minLength: 1 })),
      rebuildRuntime: Type.Optional(
        Type.Boolean({
          description:
            "Optional inline runtime rebuild after ingestion. Defaults off for bounded operator latency; scheduled/runtime rebuilds remain separate.",
        }),
      ),
    }),

    async execute(
      _id: string,
      rawParams: Record<string, unknown>,
      _signal?: AbortSignal,
      onUpdate?: AgentToolUpdateCallback<unknown>,
    ) {
      const params = rawParams as DocumentIngestionToolParams;
      const sources = normalizeSources(params);
      const chunkSize = readPositiveInteger(params.chunkSize, DEFAULT_CHUNK_SIZE);
      const maxConcurrency = readPositiveInteger(params.maxConcurrency, DEFAULT_MAX_CONCURRENCY);
      const modelId = readTrimmedString(params.modelId) ?? DEFAULT_MODEL_REF;
      const candidateModelId = readTrimmedString(params.candidateModelId) ?? DEFAULT_MODEL_REF;
      const requestTimeoutMs = readPositiveInteger(
        params.requestTimeoutMs,
        DEFAULT_REQUEST_TIMEOUT_MS,
      );
      const requestSeed = readInteger(params.requestSeed, DEFAULT_REQUEST_SEED);
      const maxWordsPerWindow = readPositiveInteger(
        params.maxWordsPerWindow,
        DEFAULT_MAX_WORDS_PER_WINDOW,
      );
      const rebuildRuntime =
        typeof params.rebuildRuntime === "boolean"
          ? params.rebuildRuntime
          : readBooleanEnv("MODEL_MEMORY_DOCUMENT_INGEST_REBUILD_RUNTIME", false);
      const projectId = readTrimmedString(params.projectId);
      const runId = readTrimmedString(params.runId) ?? `model-memory-document-ingest-${Date.now()}`;
      const recordRelativePath =
        readTrimmedString(params.recordPath) ?? `checkpoints/model-memory/${runId}.json`;
      const recordAbsolutePath = assertWorkspaceRelativePath(workspaceRoot, recordRelativePath);
      const resume = typeof params.resume === "boolean" ? params.resume : true;
      await emitDocumentIngestionToolProgress(
        onUpdate,
        `Document ingest tool accepted invocation: ${sources.length} sources`,
      );
      for (const sourcePath of sources) {
        const canonical = resolveRepoCanonicalReadPath({
          inputPath: sourcePath,
          workspaceRoot,
        });
        if (!canonical) {
          assertWorkspaceRelativePath(workspaceRoot, sourcePath);
        }
      }

      await emitDocumentIngestionToolProgress(onUpdate, "Document ingest loading runtime deps");
      const internal = await (
        deps.loadInternalRuntimeDeps ?? (() => loadInternalRuntimeDeps(api))
      )();
      await emitDocumentIngestionToolProgress(
        onUpdate,
        "Document ingest creating database runtime",
      );
      const runtime = await internal.createDatabaseRuntime({ config: api.config });
      try {
        await emitDocumentIngestionToolProgress(
          onUpdate,
          "Document ingest building runner sources",
        );
        const runnerSources = await buildRunnerSources({
          workspaceRoot,
          sources,
          chunkSize,
          projectId,
          maxWordsPerWindow,
          readTextFile,
        });
        await emitDocumentIngestionToolProgress(
          onUpdate,
          `Document ingest built runner sources: ${runnerSources.length}`,
        );
        await emitDocumentIngestionToolProgress(onUpdate, "Document ingest creating live executor");
        const executor = await internal.createLiveJsonExecutor({
          config: api.config,
          requestTimeoutMs,
          requestSeed,
        });
        await emitDocumentIngestionToolProgress(onUpdate, "Document ingest created live executor");
        const interpreter = new ExecutorBackedSemanticInterpreter(executor);
        const collisionAdjudicator = isLegacyCapturedObjectWriteFallbackEnabled({
          env: process.env,
        })
          ? new (
              await import("./semantic-collision-adjudication.ts")
            ).ExecutorBackedSemanticCollisionAdjudicator(executor)
          : undefined;
        const service =
          deps.createRunnerService?.(runtime) ??
          new ModelMemoryDocumentIngestionRunnerService({
            canonicalRepository: runtime.canonicalRepository,
            runtimeRepository: runtime.runtimeRepository,
            collisionAdjudicator,
          });
        const recordStore =
          deps.createRecordStore?.(recordAbsolutePath) ??
          new JsonFileDocumentIngestionRunRecordStore(recordAbsolutePath);

        await emitDocumentIngestionToolProgress(onUpdate, "Document ingest executing runner");
        const record: DocumentIngestionRunnerRunRecord = await service.executeRun({
          runId,
          sources: runnerSources,
          interpreter,
          modelId,
          candidateModelId,
          chunkSize,
          maxConcurrency,
          maxWordsPerWindow,
          recordStore,
          resume,
          rebuildRuntime,
          onProgress: async (event) => {
            api.logger.info(`[model-memory-tool] ${event.message}`);
            if (!onUpdate) {
              return;
            }
            let progressText: string | undefined;
            if (event.type === "source_start" || event.type === "source_complete") {
              progressText = `Document ingest ${event.index}/${event.total}: ${event.source.displayPath}`;
            } else if (event.type === "phase" && event.phase === "complete") {
              progressText = `Document ingest completed: ${recordRelativePath}`;
            } else if (event.type === "phase" && event.phase === "start") {
              progressText = `Document ingest started: ${sources.length} sources`;
            }
            if (!progressText) {
              return;
            }
            await Promise.resolve(
              onUpdate({
                content: [
                  {
                    type: "text",
                    text: progressText,
                  },
                ],
                details: undefined,
              } satisfies AgentToolResult<unknown>),
            );
          },
        });
        await emitDocumentIngestionToolProgress(onUpdate, "Document ingest runner completed");

        return {
          content: [
            {
              type: "text",
              text: [
                `Run ${runId} completed with status ${record.status}.`,
                `Sources: ${record.totals.docsCompleted}/${record.totals.docsAttempted} completed, ${record.totals.docsFailed} failed.`,
                `Captured claims: ${record.totals.capturedClaimCount}.`,
                `Ignored windows: ${record.totals.ignoredWindowCount}. Rejected windows: ${record.totals.rejectedWindowCount}.`,
                `Record path: ${recordRelativePath}`,
              ].join(" "),
            },
          ],
          details: {
            runId,
            status: record.status,
            recordPath: recordRelativePath,
            workspaceRoot,
            modelId,
            candidateModelId,
            requestTimeoutMs,
            requestSeed,
            maxWordsPerWindow,
            chunkSize,
            maxConcurrency,
            resume,
            rebuildRuntime,
            totals: record.totals,
          },
        };
      } finally {
        await runtime.pool.end();
      }
    },
  };
}
