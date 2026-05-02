import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "./mmv2/contracts.ts";
import type { JsonModelExecutor } from "./model-execution.ts";
import { summarizeModelMemoryPayload } from "./payload-summary.ts";
import {
  buildLexicalBaselineRetrievalRequest,
  type InterpretedRetrievalRequest,
  type RetrievalRequestInterpreter,
} from "./retrieval-request-interpreter.ts";
import { ExecutorBackedRetrievalFinalInclusionReviewer, executeRetrieval } from "./retrieval.ts";
import {
  listRuntimeMemoryRecords,
  type RuntimeMemoryRecord,
  type WorkspaceProjectionVersionRecord,
} from "./runtime-read-models.ts";
import { buildRetrievalPackArtifact } from "./runtime/context/retrieval-packs.ts";
import { deriveRuntimeMemoryStatus } from "./runtime/retrieval/candidate-recall.ts";

type ModelMemoryRuntimeApi = NonNullable<OpenClawPluginApi["runtime"]>["modelMemory"];
type ModelMemoryRuntime = Awaited<ReturnType<ModelMemoryRuntimeApi["createDatabaseRuntime"]>>;

type InternalRuntimeDeps = {
  createDatabaseRuntime: ModelMemoryRuntimeApi["createDatabaseRuntime"];
  createLiveJsonExecutor?: (
    options?: Parameters<ModelMemoryRuntimeApi["createLiveJsonExecutor"]>[0],
  ) => Promise<JsonModelExecutor>;
};

type ToolInternalDependencies = {
  loadInternalRuntimeDeps?: () => Promise<InternalRuntimeDeps>;
};

const SearchSchema = Type.Object(
  {
    query: Type.String({ minLength: 1 }),
    maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    requestPurpose: Type.Optional(Type.String({ minLength: 1 })),
    canonicalClasses: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 })),
    kinds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 })),
    projectId: Type.Optional(Type.String({ minLength: 1 })),
    workspaceId: Type.Optional(Type.String({ minLength: 1 })),
    subjectType: Type.Optional(Type.String({ minLength: 1 })),
    subjectId: Type.Optional(Type.String({ minLength: 1 })),
    appliesTo: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const GetSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("memory"), Type.Literal("projection")]),
    ),
    includeLineage: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

type SearchParams = {
  query?: unknown;
  maxResults?: unknown;
  requestPurpose?: unknown;
  canonicalClasses?: unknown;
  kinds?: unknown;
  projectId?: unknown;
  workspaceId?: unknown;
  subjectType?: unknown;
  subjectId?: unknown;
  appliesTo?: unknown;
};

type GetParams = {
  id?: unknown;
  kind?: unknown;
  includeLineage?: unknown;
};

const VALID_CANONICAL_CLASSES = new Set(["user", "feedback", "project", "reference"]);
const VALID_MEMORY_KINDS = new Set(["preference", "fact", "rule", "procedure", "reference"]);

type DurableAwareRepository = ModelMemoryRuntime["canonicalRepository"] & {
  getDurableMemory?: (memoryId: string) => Promise<DurableMemoryRecord | undefined>;
  listMemoryEvents?: () => Promise<MemoryEvent[]>;
  listMemoryEdges?: () => Promise<MemoryEdge[]>;
};

type RuntimeRepositoryWithProjections = ModelMemoryRuntime["runtimeRepository"] & {
  listProjectionVersions: () => Promise<WorkspaceProjectionVersionRecord[]>;
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

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => readTrimmedString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
}

function readAllowedStringArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T[] | undefined {
  const normalized = readStringArray(value)
    ?.map((entry) => entry.trim().toLowerCase())
    .filter((entry) => allowed.has(entry)) as T[] | undefined;
  return normalized && normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function boundText(value: string | undefined, maxLength = 240): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function summarizeRuntimeRecord(record: RuntimeMemoryRecord) {
  return {
    id: record.id,
    canonicalClass: record.canonicalClass,
    kind: record.kind,
    status: deriveRuntimeMemoryStatus(record),
    title: record.normalizedTitle ?? record.normalizedSubject ?? undefined,
    summary: boundText(
      summarizeModelMemoryPayload({
        kind: record.kind,
        payload: record.payload,
      }),
    ),
    scope: record.scope,
    scoreSurface: boundText(record.normalizedSearchText, 180),
    reasonCodes: record.rationaleCodes,
    sourceWindowId: record.sourceWindowId,
    sourceProfileId: record.sourceProfileId,
    authorityTier: record.sourceAuthorityTier,
  };
}

function summarizeRetrievalMetrics(metrics: Record<string, unknown>) {
  return {
    emptyRetrieval: metrics.emptyRetrieval,
    emptyRetrievalReason: metrics.emptyRetrievalReason,
    candidateCount: metrics.candidateCount,
    selectedCount: metrics.selectedCount,
    injectedCount: metrics.injectedCount,
    staleFilteredCount: metrics.staleFilteredCount,
    supersededFilteredCount: metrics.supersededFilteredCount,
    deletedFilteredCount: metrics.deletedFilteredCount,
    conflictedFilteredCount: metrics.conflictedFilteredCount,
    inactiveFilteredCount: metrics.inactiveFilteredCount,
    hashInvalidProjectionFilteredCount: metrics.hashInvalidProjectionFilteredCount,
    exclusionReasons: metrics.exclusionReasons,
    selectedProjectionIds: Array.isArray(metrics.selectedProjectionIds)
      ? metrics.selectedProjectionIds.slice(0, 8)
      : undefined,
    selectedSourceMemoryIdCount: Array.isArray(metrics.selectedSourceMemoryIds)
      ? metrics.selectedSourceMemoryIds.length
      : undefined,
    excludedIdCount: Array.isArray(metrics.excludedIds) ? metrics.excludedIds.length : undefined,
    missDiagnosticCount: Array.isArray(metrics.missDiagnostics)
      ? metrics.missDiagnostics.length
      : undefined,
    rankingFeatures: metrics.rankingFeatures,
  };
}

function buildScope(params: SearchParams): Record<string, string> | undefined {
  const scope = Object.fromEntries(
    Object.entries({
      project_id: readTrimmedString(params.projectId),
      workspace_id: readTrimmedString(params.workspaceId),
      subject_type: readTrimmedString(params.subjectType),
      subject_id: readTrimmedString(params.subjectId),
      applies_to: readTrimmedString(params.appliesTo),
    }).filter(([, value]) => typeof value === "string" && value.length > 0),
  ) as Record<string, string>;
  return Object.keys(scope).length > 0 ? scope : undefined;
}

function buildStaticRequest(params: SearchParams): InterpretedRetrievalRequest {
  const envelope = {
    queryText: readTrimmedString(params.query) ?? "",
    requestPurpose: readTrimmedString(params.requestPurpose) ?? "reference_lookup",
    scope: buildScope(params),
    maxResults: readPositiveInteger(params.maxResults, 5),
  };
  const baseline = buildLexicalBaselineRetrievalRequest(envelope);
  const canonicalClasses = readAllowedStringArray(
    params.canonicalClasses,
    VALID_CANONICAL_CLASSES,
  ) as InterpretedRetrievalRequest["canonicalClasses"] | undefined;
  const kinds = readAllowedStringArray(params.kinds, VALID_MEMORY_KINDS) as
    | InterpretedRetrievalRequest["kinds"]
    | undefined;
  return {
    ...baseline,
    canonicalClasses: canonicalClasses ?? baseline.canonicalClasses,
    kinds: kinds ?? baseline.kinds,
  };
}

function staticInterpreter(request: InterpretedRetrievalRequest): RetrievalRequestInterpreter {
  return {
    async interpret() {
      return {
        action: "retrieve",
        request,
      };
    },
  };
}

async function loadInternalRuntimeDeps(api: OpenClawPluginApi): Promise<InternalRuntimeDeps> {
  const runtime = api.runtime?.modelMemory;
  if (!runtime) {
    throw new Error("model-memory runtime helpers are not available from the plugin runtime");
  }
  return {
    createDatabaseRuntime: runtime.createDatabaseRuntime,
    createLiveJsonExecutor: runtime.createLiveJsonExecutor,
  };
}

async function withRuntime<T>(
  api: OpenClawPluginApi,
  deps: ToolInternalDependencies,
  work: (runtime: ModelMemoryRuntime, internal: InternalRuntimeDeps) => Promise<T>,
): Promise<T> {
  const internal = await (deps.loadInternalRuntimeDeps
    ? deps.loadInternalRuntimeDeps()
    : loadInternalRuntimeDeps(api));
  const runtime = await internal.createDatabaseRuntime({
    config: api.config,
    applyMigrations: false,
  });
  try {
    return await work(runtime, internal);
  } finally {
    await runtime.pool.end();
  }
}

function buildUnavailablePayload(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    unavailable: true,
    error: message,
  };
}

function jsonToolResult<TDetails>(payload: TDetails): AgentToolResult<TDetails> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    details: payload,
  };
}

export function createModelMemorySearchTool(
  api: OpenClawPluginApi,
  deps: ToolInternalDependencies = {},
): AnyAgentTool {
  return {
    name: "model_memory_search",
    label: "Model Memory Search",
    description:
      "Search active MMV2 model-memory runtime records and projection digests without using legacy memory-core file search. Use this when the active memory authority is model-memory/MMV2.",
    parameters: SearchSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const params = rawParams as SearchParams;
      const query = readTrimmedString(params.query);
      if (!query) {
        throw new Error("query is required");
      }
      try {
        return await withRuntime(api, deps, async (runtime, internal) => {
          const [memoryObjects, projectionVersions] = await Promise.all([
            listRuntimeMemoryRecords(runtime.canonicalRepository),
            (
              runtime.runtimeRepository as RuntimeRepositoryWithProjections
            ).listProjectionVersions(),
          ]);
          const request = buildStaticRequest(params);
          const envelope = {
            queryText: query,
            requestPurpose: readTrimmedString(params.requestPurpose) ?? "reference_lookup",
            scope: buildScope(params),
            maxResults: readPositiveInteger(params.maxResults, 5),
          };
          const finalInclusionModelId =
            process.env.MODEL_MEMORY_RETRIEVAL_FINAL_INCLUSION_MODEL_ID?.trim() ||
            process.env.MODEL_MEMORY_RETRIEVAL_MODEL_ID?.trim() ||
            "openai-codex/gpt-5.4-mini";
          const finalInclusionReviewer = internal.createLiveJsonExecutor
            ? new ExecutorBackedRetrievalFinalInclusionReviewer(
                await internal.createLiveJsonExecutor({ config: api.config }),
                {
                  modelId: finalInclusionModelId,
                  reasoningEffort: "low",
                },
              )
            : undefined;
          const execution = await executeRetrieval({
            envelope,
            interpreter: staticInterpreter(request),
            memoryObjects,
            modelId: "mmv2-runtime-read",
            finalInclusionReviewer,
            finalInclusionModelId,
            projectionVersions,
          });
          if (!execution) {
            return jsonToolResult({
              ok: true,
              results: [],
              projections: [],
              metrics: {
                emptyRetrieval: true,
                emptyRetrievalReason: "no_candidates_found",
              },
            });
          }
          const artifact = buildRetrievalPackArtifact({
            retrievalRequest: execution.retrievalRequest,
            retrievalResultSet: execution.retrievalResultSet,
            retrievalResultItems: execution.retrievalResultItems,
            memoryObjects,
            retrievalPlan: execution.retrievalPlan,
            retrievalCandidates: execution.retrievalCandidates,
            retrievalExclusions: execution.retrievalExclusions,
            selectedProjectionDigests: execution.selectedProjectionDigests,
            projectionVersions,
            buildPolicyVersion: "mmv2_read_tool.v1",
          });
          const metrics =
            ((artifact.structuredPayload as { retrievalRun?: { metrics?: unknown } } | undefined)
              ?.retrievalRun?.metrics as Record<string, unknown> | undefined) ?? {};
          const results = execution.retrievalResultItems
            .filter((item) => item.selectedForContext)
            .toSorted((left, right) => left.rankIndex - right.rankIndex)
            .map((item) => {
              const memory = memoryObjects.find((record) => record.id === item.memoryObjectId);
              return memory
                ? {
                    ...summarizeRuntimeRecord(memory),
                    rankIndex: item.rankIndex,
                    rankBand: item.rankBand,
                    retrievalReasonCodes: item.retrievalReasonCodes,
                  }
                : undefined;
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
          const topResult = results[0];

          return jsonToolResult({
            ok: true,
            authority: "mmv2_runtime",
            answerGuidance:
              "Use results[0] as the strongest answer-facing memory evidence unless the user explicitly asks for broader comparison.",
            requested: {
              query,
              maxResults: envelope.maxResults,
              requestPurpose: envelope.requestPurpose,
              scope: envelope.scope ?? {},
              canonicalClasses: request.canonicalClasses,
              kinds: request.kinds ?? [],
            },
            topResult,
            results,
            projections: execution.selectedProjectionDigests.map((digest) => ({
              projectionId: digest.projectionId,
              projectionType: digest.projectionType,
              title: digest.title,
              summary: digest.summary,
              freshness: digest.freshness ?? { status: digest.stale ? "stale" : "fresh" },
              sourceMemoryIdCount: digest.sourceMemoryIds.length,
              sourceMemoryIds: digest.sourceMemoryIds.slice(0, 8),
              sourceEventIdCount: digest.sourceEventIds.length,
              sourceEventIds: digest.sourceEventIds.slice(0, 8),
              digestPath: digest.digestPath,
            })),
            metrics: summarizeRetrievalMetrics(metrics),
          });
        });
      } catch (error) {
        return jsonToolResult(buildUnavailablePayload(error));
      }
    },
  };
}

export function createModelMemoryGetTool(
  api: OpenClawPluginApi,
  deps: ToolInternalDependencies = {},
): AnyAgentTool {
  return {
    name: "model_memory_get",
    label: "Model Memory Get",
    description:
      "Read a specific MMV2 memory record or projection by id. Use the ids returned from model_memory_search instead of legacy file-oriented memory_get.",
    parameters: GetSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const params = rawParams as GetParams;
      const id = readTrimmedString(params.id);
      const kind = readTrimmedString(params.kind) ?? "auto";
      const includeLineage = params.includeLineage !== false;
      if (!id) {
        throw new Error("id is required");
      }
      try {
        return await withRuntime(api, deps, async (runtime) => {
          const canonicalRepository = runtime.canonicalRepository as DurableAwareRepository;
          const runtimeRepository = runtime.runtimeRepository as RuntimeRepositoryWithProjections;
          const [memoryObjects, projectionVersions, durableMemory, allEvents, allEdges] =
            await Promise.all([
              kind === "projection"
                ? Promise.resolve([])
                : listRuntimeMemoryRecords(canonicalRepository),
              runtimeRepository.listProjectionVersions(),
              kind === "projection"
                ? Promise.resolve(undefined)
                : canonicalRepository.getDurableMemory?.(id),
              includeLineage && canonicalRepository.listMemoryEvents
                ? canonicalRepository.listMemoryEvents()
                : Promise.resolve([]),
              includeLineage && canonicalRepository.listMemoryEdges
                ? canonicalRepository.listMemoryEdges()
                : Promise.resolve([]),
            ]);

          const memoryRecord =
            kind === "projection" ? undefined : memoryObjects.find((record) => record.id === id);
          if (memoryRecord) {
            const relatedEvents = includeLineage
              ? allEvents
                  .filter(
                    (event) =>
                      event.memory_id === id || (event.target_memory_ids ?? []).includes(id),
                  )
                  .map((event) => ({
                    id: event.memory_event_id,
                    eventType: event.event_type,
                    occurredAt: event.occurred_at,
                    candidateId: event.candidate_id,
                    memoryId: event.memory_id,
                    targetMemoryIds: event.target_memory_ids,
                  }))
              : [];
            const relatedEdges = includeLineage
              ? allEdges
                  .filter((edge) => edge.from_memory_id === id || edge.to_memory_id === id)
                  .map((edge) => ({
                    id: edge.edge_id,
                    edgeType: edge.edge_type,
                    fromMemoryId: edge.from_memory_id,
                    toMemoryId: edge.to_memory_id,
                    createdAt: edge.created_at,
                  }))
              : [];
            return jsonToolResult({
              ok: true,
              authority: "mmv2_runtime",
              lookupKind: "memory",
              record: {
                ...summarizeRuntimeRecord(memoryRecord),
                payload: memoryRecord.payload,
                provenance: memoryRecord.provenance ?? [],
                identityKey: memoryRecord.identityKey,
                slotKey: memoryRecord.slotKey,
                contractName: memoryRecord.contractName,
                contractVersion: memoryRecord.contractVersion,
                modelId: memoryRecord.modelId,
                createdAt: memoryRecord.createdAt.toISOString(),
                activatedAt: memoryRecord.activatedAt?.toISOString(),
                expiredAt: memoryRecord.expiredAt?.toISOString(),
                supersededAt: memoryRecord.supersededAt?.toISOString(),
              },
              durableMemory: durableMemory
                ? {
                    memoryId: durableMemory.memory_id,
                    status: durableMemory.status,
                    unitType: durableMemory.unit_type,
                    kind: durableMemory.kind,
                    canonicalText: durableMemory.canonical_text,
                    searchText: durableMemory.search_text,
                    scope: durableMemory.scope,
                    payload: durableMemory.payload,
                    sourceRefs: durableMemory.source_refs.slice(0, 5),
                    tags: durableMemory.tags,
                    updatedAt: durableMemory.updated_at,
                  }
                : undefined,
              lineage: includeLineage
                ? {
                    relatedEvents,
                    relatedEdges,
                  }
                : undefined,
            });
          }

          const projection = projectionVersions.find((entry) => entry.id === id);
          if (projection) {
            return jsonToolResult({
              ok: true,
              authority: "mmv2_runtime",
              lookupKind: "projection",
              projection: {
                id: projection.id,
                targetId: projection.targetId,
                projectionType: projection.projectionType,
                contentHash: projection.contentHash,
                canonicalArtifactPath: projection.canonicalArtifactPath,
                sourceObjectIds: projection.sourceObjectIds,
                sourceEventIds: projection.sourceEventIds ?? [],
                sourceEdgeIds: projection.sourceEdgeIds ?? [],
                freshness: projection.freshness,
                staleMarkers: projection.staleMarkers ?? [],
                conflictMarkers: projection.conflictMarkers ?? [],
                retrievalDigest: projection.retrievalDigest,
                builtAt: projection.builtAt.toISOString(),
              },
            });
          }

          return jsonToolResult({
            ok: false,
            notFound: true,
            id,
            kind,
          });
        });
      } catch (error) {
        return jsonToolResult(buildUnavailablePayload(error));
      }
    },
  };
}
