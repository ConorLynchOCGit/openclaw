import { createHash } from "node:crypto";
import {
  embedMemorySearchQuery,
  parseAgentSessionKey,
  resolveDefaultAgentId,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/memory-core";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import type {
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  RankedRetrievedMemoryRecord,
  SemanticRetrievedMemoryRecord,
} from "./db/runtime.js";
import type { MemoryMiddlewareRuntime } from "./runtime.js";

type ValidatedProcedureSemanticSource = {
  sourceMemoryObjectId: string;
  title: string;
  body: string;
};

type ApprovedWorkflowGuidanceSemanticSource<LessonKey extends string> = {
  memoryObjectId: string;
  lessonKey: LessonKey;
  subject?: string;
  value?: string;
  title?: string;
  content: string;
};

type ApprovedEnvironmentConstraintSemanticSource =
  ApprovedWorkflowGuidanceSemanticSource<SupportedEnvironmentConstraintLessonKey>;

type ApprovedWorkflowToolGotchaSemanticSource =
  ApprovedWorkflowGuidanceSemanticSource<SupportedWorkflowToolGotchaLessonKey>;

type ApprovedApiWorkaroundSemanticSource =
  ApprovedWorkflowGuidanceSemanticSource<SupportedApiWorkaroundLessonKey>;

type SupportedEnvironmentConstraintLessonKey =
  | "python_command_unavailable"
  | "gateway_tools_invoke_forbidden";

type SupportedWorkflowToolGotchaLessonKey =
  | "vitest_wrapper_required"
  | "scripts_committer_required"
  | "git_stash_unsafe";

type SupportedApiWorkaroundLessonKey =
  | "openai_embeddings_api_key_required"
  | "anthropic_context1m_eligible_credential_required";

export type SemanticFallbackFamily =
  | "procedure"
  | "environment_constraint"
  | "workflow_tool_gotcha"
  | "api_workaround";

export type SemanticFallbackEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason:
        | "hybrid_not_ok"
        | "missing_cfg"
        | "kind_mismatch"
        | "scope_mismatch"
        | "strong_hybrid_match";
    };

type AcceptedHybridSearchResult = Extract<
  MemoryObjectSearchHybridResult,
  { accepted: true; status: "ok" }
>;

const SUPPORTED_ENVIRONMENT_CONSTRAINT_LESSON_KEYS =
  new Set<SupportedEnvironmentConstraintLessonKey>([
    "python_command_unavailable",
    "gateway_tools_invoke_forbidden",
  ]);

const SUPPORTED_WORKFLOW_TOOL_GOTCHA_LESSON_KEYS = new Set<SupportedWorkflowToolGotchaLessonKey>([
  "vitest_wrapper_required",
  "scripts_committer_required",
  "git_stash_unsafe",
]);

const SUPPORTED_API_WORKAROUND_LESSON_KEYS = new Set<SupportedApiWorkaroundLessonKey>([
  "openai_embeddings_api_key_required",
  "anthropic_context1m_eligible_credential_required",
]);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function hasStrongProcedureHybridMatch(record: RankedRetrievedMemoryRecord | undefined): boolean {
  if (!record || record.objectType !== "procedure") {
    return false;
  }
  return record.matchedFields.some(
    (field) =>
      field === "procedure_key_match" || field === "title_exact" || field === "title_prefix",
  );
}

function readNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let cursor: unknown = metadata;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined;
}

function extractWorkflowImprovementLessonKey(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["autoCapture", "lessonKey"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "autoCapture", "lessonKey"]) ??
    readNestedMetadataString(metadata, ["promotionMetadata", "autoPromotion", "lessonKey"]) ??
    readNestedMetadataString(metadata, ["autoPromotion", "lessonKey"])
  );
}

function extractWorkflowImprovementSubject(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["autoCapture", "subject"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "autoCapture", "subject"]) ??
    readNestedMetadataString(metadata, ["promotionMetadata", "autoPromotion", "subject"]) ??
    readNestedMetadataString(metadata, ["autoPromotion", "subject"])
  );
}

function extractWorkflowImprovementValue(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["autoCapture", "value"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "autoCapture", "value"]) ??
    readNestedMetadataString(metadata, ["promotionMetadata", "autoPromotion", "value"]) ??
    readNestedMetadataString(metadata, ["autoPromotion", "value"])
  );
}

function isEnvironmentConstraintLessonKey(
  value: string | undefined,
): value is SupportedEnvironmentConstraintLessonKey {
  return Boolean(
    value &&
    SUPPORTED_ENVIRONMENT_CONSTRAINT_LESSON_KEYS.has(
      value as SupportedEnvironmentConstraintLessonKey,
    ),
  );
}

function isWorkflowToolGotchaLessonKey(
  value: string | undefined,
): value is SupportedWorkflowToolGotchaLessonKey {
  return Boolean(
    value &&
    SUPPORTED_WORKFLOW_TOOL_GOTCHA_LESSON_KEYS.has(value as SupportedWorkflowToolGotchaLessonKey),
  );
}

function isApiWorkaroundLessonKey(
  value: string | undefined,
): value is SupportedApiWorkaroundLessonKey {
  return Boolean(
    value && SUPPORTED_API_WORKAROUND_LESSON_KEYS.has(value as SupportedApiWorkaroundLessonKey),
  );
}

function hasStrongWorkflowGuidanceHybridMatch<LessonKey extends string>(
  record: RankedRetrievedMemoryRecord | undefined,
  isSupportedLessonKey: (value: string | undefined) => value is LessonKey,
): boolean {
  if (!record || record.objectType !== "memory_object" || record.memoryKind !== "project") {
    return false;
  }
  if (!isSupportedLessonKey(extractWorkflowImprovementLessonKey(record.metadata))) {
    return false;
  }
  return record.matchedFields.some(
    (field) =>
      field === "auto_capture_lesson_match" ||
      field === "title_exact" ||
      field === "content_exact" ||
      field === "title_prefix" ||
      field === "content_prefix",
  );
}

function hasStrongEnvironmentConstraintHybridMatch(
  record: RankedRetrievedMemoryRecord | undefined,
): boolean {
  return hasStrongWorkflowGuidanceHybridMatch(record, isEnvironmentConstraintLessonKey);
}

function hasStrongWorkflowToolGotchaHybridMatch(
  record: RankedRetrievedMemoryRecord | undefined,
): boolean {
  return hasStrongWorkflowGuidanceHybridMatch(record, isWorkflowToolGotchaLessonKey);
}

function hasStrongApiWorkaroundHybridMatch(
  record: RankedRetrievedMemoryRecord | undefined,
): boolean {
  return hasStrongWorkflowGuidanceHybridMatch(record, isApiWorkaroundLessonKey);
}

function hasStrongTypedProjectHybridMatch(
  record: RankedRetrievedMemoryRecord | undefined,
): boolean {
  if (!record || record.objectType !== "memory_object" || record.memoryKind !== "project") {
    return false;
  }
  return record.matchedFields.some(
    (field) =>
      field === "auto_capture_field_match" ||
      field === "auto_capture_lesson_match" ||
      field === "title_exact" ||
      field === "content_exact" ||
      field === "title_prefix" ||
      field === "content_prefix",
  );
}

export function resolveProcedureSemanticFallbackEligibility(params: {
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
}): SemanticFallbackEligibility {
  if (!params.hybridResult.accepted || params.hybridResult.status !== "ok") {
    return { eligible: false, reason: "hybrid_not_ok" };
  }
  if (!params.cfg) {
    return { eligible: false, reason: "missing_cfg" };
  }
  if (params.input.kind !== "procedure") {
    return { eligible: false, reason: "kind_mismatch" };
  }
  if ((params.input.scope ?? "approved_only") !== "include_validated_procedures") {
    return { eligible: false, reason: "scope_mismatch" };
  }
  if (hasStrongProcedureHybridMatch(params.hybridResult.records[0])) {
    return { eligible: false, reason: "strong_hybrid_match" };
  }
  return { eligible: true };
}

export function resolveProjectSemanticFallbackEligibility(params: {
  family: Exclude<SemanticFallbackFamily, "procedure">;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
}): SemanticFallbackEligibility {
  if (!params.hybridResult.accepted || params.hybridResult.status !== "ok") {
    return { eligible: false, reason: "hybrid_not_ok" };
  }
  if (!params.cfg) {
    return { eligible: false, reason: "missing_cfg" };
  }
  if (params.input.kind !== "project") {
    return { eligible: false, reason: "kind_mismatch" };
  }
  if ((params.input.scope ?? "approved_only") !== "approved_only") {
    return { eligible: false, reason: "scope_mismatch" };
  }
  if (hasStrongTypedProjectHybridMatch(params.hybridResult.records[0])) {
    return { eligible: false, reason: "strong_hybrid_match" };
  }

  const topRecord = params.hybridResult.records[0];
  if (
    (params.family === "environment_constraint" &&
      hasStrongEnvironmentConstraintHybridMatch(topRecord)) ||
    (params.family === "workflow_tool_gotcha" &&
      hasStrongWorkflowToolGotchaHybridMatch(topRecord)) ||
    (params.family === "api_workaround" && hasStrongApiWorkaroundHybridMatch(topRecord))
  ) {
    return { eligible: false, reason: "strong_hybrid_match" };
  }

  return { eligible: true };
}

function resolveAgentId(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
}): string {
  const fromSession = params.sessionKey ? parseAgentSessionKey(params.sessionKey)?.agentId : null;
  return params.agentId?.trim() || fromSession || resolveDefaultAgentId(params.cfg);
}

function buildProcedureSemanticText(params: { title: string; body: string }): string {
  return `${params.title.trim()}\n\n${params.body.trim()}`.trim();
}

function buildWorkflowGuidanceSemanticText(params: {
  familyLabel: "Environment constraint" | "Workflow improvement";
  lessonKey: string;
  subject?: string;
  value?: string;
  title?: string;
  content: string;
}): string {
  const parts = [
    params.familyLabel,
    params.title?.trim(),
    params.subject?.trim(),
    params.value?.trim(),
    params.content.trim(),
    `Lesson key: ${params.lessonKey}`,
  ];
  return parts.filter((value) => value && value.length > 0).join("\n\n");
}

async function loadValidatedProcedureSemanticSource(params: {
  config: MemoryMiddlewareConfig;
  procedureId: string;
}): Promise<ValidatedProcedureSemanticSource | null> {
  const connectionString = params.config.database.url;
  if (!connectionString) {
    return null;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const proceduresTable = `${quoteIdentifier(schema)}.${quoteIdentifier("procedures")}`;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query<{
      source_memory_object_id: string | null;
      title: string;
      body: string;
    }>(
      `
        select
          source_memory_object_id::text as source_memory_object_id,
          title,
          body
        from ${proceduresTable}
        where id = $1::uuid
          and status::text = 'validated'
        limit 1
      `,
      [params.procedureId],
    );
    const row = result.rows[0];
    if (!row?.source_memory_object_id) {
      return null;
    }
    return {
      sourceMemoryObjectId: row.source_memory_object_id,
      title: row.title,
      body: row.body,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function loadApprovedWorkflowGuidanceSemanticSourceById<LessonKey extends string>(params: {
  config: MemoryMiddlewareConfig;
  memoryObjectId: string;
  isSupportedLessonKey: (value: string | undefined) => value is LessonKey;
}): Promise<ApprovedWorkflowGuidanceSemanticSource<LessonKey> | null> {
  const connectionString = params.config.database.url;
  if (!connectionString) {
    return null;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const approvedMemoryView = `${quoteIdentifier(schema)}.${quoteIdentifier("internal_approved_memory_v")}`;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query<{
      id: string;
      title: string | null;
      content: string;
      metadata: Record<string, unknown> | null;
    }>(
      `
        select
          id::text as id,
          title,
          content,
          metadata
        from ${approvedMemoryView}
        where id = $1::uuid
          and memory_kind::text = 'project'
        limit 1
      `,
      [params.memoryObjectId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const lessonKey = extractWorkflowImprovementLessonKey(row.metadata ?? undefined);
    if (!params.isSupportedLessonKey(lessonKey)) {
      return null;
    }
    return {
      memoryObjectId: row.id,
      lessonKey,
      ...(extractWorkflowImprovementSubject(row.metadata ?? undefined)
        ? { subject: extractWorkflowImprovementSubject(row.metadata ?? undefined) }
        : {}),
      ...(extractWorkflowImprovementValue(row.metadata ?? undefined)
        ? { value: extractWorkflowImprovementValue(row.metadata ?? undefined) }
        : {}),
      ...(row.title ? { title: row.title } : {}),
      content: row.content,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function loadApprovedWorkflowGuidanceSourcesMissingEmbedding<
  LessonKey extends string,
>(params: {
  config: MemoryMiddlewareConfig;
  embeddingModel: string;
  embeddingVersion: string;
  projectId?: string;
  supportedLessonKeys: LessonKey[];
  isSupportedLessonKey: (value: string | undefined) => value is LessonKey;
}): Promise<ApprovedWorkflowGuidanceSemanticSource<LessonKey>[]> {
  const connectionString = params.config.database.url;
  if (!connectionString) {
    return [];
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const approvedMemoryView = `${quoteIdentifier(schema)}.${quoteIdentifier("internal_approved_memory_v")}`;
  const memoryEmbeddingsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("memory_embeddings")}`;
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query<{
      id: string;
      title: string | null;
      content: string;
      metadata: Record<string, unknown> | null;
    }>(
      `
        select
          v.id::text as id,
          v.title,
          v.content,
          v.metadata
        from ${approvedMemoryView} v
        left join ${memoryEmbeddingsTable} me
          on me.memory_object_id = v.id
          and me.embedding_model = $1::text
          and me.embedding_version = $2::text
          and me.chunk_index = 0
        where v.memory_kind::text = 'project'
          and me.memory_object_id is null
          and coalesce(
            v.metadata->'autoCapture'->>'lessonKey',
            v.metadata->'candidateMetadata'->'autoCapture'->>'lessonKey',
            v.metadata->'promotionMetadata'->'autoPromotion'->>'lessonKey',
            v.metadata->'autoPromotion'->>'lessonKey',
            ''
          ) = any($3::text[])
          and ($4::uuid is null or v.project_id = $4::uuid)
        order by v.updated_at desc
      `,
      [
        params.embeddingModel,
        params.embeddingVersion,
        params.supportedLessonKeys,
        params.projectId ?? null,
      ],
    );
    return result.rows.flatMap((row) => {
      const lessonKey = extractWorkflowImprovementLessonKey(row.metadata ?? undefined);
      if (!params.isSupportedLessonKey(lessonKey)) {
        return [];
      }
      return [
        {
          memoryObjectId: row.id,
          lessonKey,
          ...(extractWorkflowImprovementSubject(row.metadata ?? undefined)
            ? { subject: extractWorkflowImprovementSubject(row.metadata ?? undefined) }
            : {}),
          ...(extractWorkflowImprovementValue(row.metadata ?? undefined)
            ? { value: extractWorkflowImprovementValue(row.metadata ?? undefined) }
            : {}),
          ...(row.title ? { title: row.title } : {}),
          content: row.content,
        },
      ];
    });
  } finally {
    await client.end().catch(() => {});
  }
}

async function upsertMemoryObjectSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  memoryObjectId: string;
  chunkText: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const connectionString = params.config.database.url;
  if (!connectionString) {
    return;
  }
  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryEmbeddingsTable = `${quoteIdentifier(schema)}.${quoteIdentifier("memory_embeddings")}`;
  const contentHash = createHash("sha256").update(params.chunkText).digest("hex");
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(
      `
        insert into ${memoryEmbeddingsTable} (
          memory_object_id,
          content_hash_sha256,
          embedding_model,
          embedding_version,
          chunk_index,
          chunk_text,
          embedding,
          metadata
        )
        values ($1::uuid, $2::text, $3::text, $4::text, 0, $5::text, $6::vector, $7::jsonb)
        on conflict (memory_object_id, embedding_model, embedding_version, chunk_index)
        do update set
          content_hash_sha256 = excluded.content_hash_sha256,
          chunk_text = excluded.chunk_text,
          embedding = excluded.embedding,
          metadata = ${memoryEmbeddingsTable}.metadata || excluded.metadata,
          updated_at = now()
      `,
      [
        params.memoryObjectId,
        contentHash,
        params.embeddingModel,
        params.embeddingVersion,
        params.chunkText,
        `[${params.embedding.join(",")}]`,
        JSON.stringify(params.metadata),
      ],
    );
  } finally {
    await client.end().catch(() => {});
  }
}

function normalizeSemanticProcedureFallbackRecord(params: {
  record: SemanticRetrievedMemoryRecord;
  existing?: RankedRetrievedMemoryRecord;
  scoreBase: number;
  index: number;
}): RankedRetrievedMemoryRecord {
  const matchedFields = new Set<string>([
    ...(params.existing?.matchedFields ?? []),
    ...params.record.matchedFields,
    "semantic_fallback",
  ]);

  return {
    ...(params.record as RankedRetrievedMemoryRecord),
    score: params.scoreBase - params.index + params.record.score,
    matchedFields: [...matchedFields],
  };
}

function normalizeSemanticEnvironmentConstraintFallbackRecord(params: {
  record: SemanticRetrievedMemoryRecord;
  existing?: RankedRetrievedMemoryRecord;
  scoreBase: number;
  index: number;
}): RankedRetrievedMemoryRecord {
  const matchedFields = new Set<string>([
    ...(params.existing?.matchedFields ?? []),
    ...params.record.matchedFields,
    "semantic_fallback",
  ]);

  return {
    ...(params.record as RankedRetrievedMemoryRecord),
    score: params.scoreBase - params.index + params.record.score,
    matchedFields: [...matchedFields],
  };
}

function normalizeSemanticWorkflowToolGotchaFallbackRecord(params: {
  record: SemanticRetrievedMemoryRecord;
  existing?: RankedRetrievedMemoryRecord;
  scoreBase: number;
  index: number;
}): RankedRetrievedMemoryRecord {
  const matchedFields = new Set<string>([
    ...(params.existing?.matchedFields ?? []),
    ...params.record.matchedFields,
    "semantic_fallback",
  ]);

  return {
    ...(params.record as RankedRetrievedMemoryRecord),
    score: params.scoreBase - params.index + params.record.score,
    matchedFields: [...matchedFields],
  };
}

function normalizeSemanticApiWorkaroundFallbackRecord(params: {
  record: SemanticRetrievedMemoryRecord;
  existing?: RankedRetrievedMemoryRecord;
  scoreBase: number;
  index: number;
}): RankedRetrievedMemoryRecord {
  const matchedFields = new Set<string>([
    ...(params.existing?.matchedFields ?? []),
    ...params.record.matchedFields,
    "semantic_fallback",
  ]);

  return {
    ...(params.record as RankedRetrievedMemoryRecord),
    score: params.scoreBase - params.index + params.record.score,
    matchedFields: [...matchedFields],
  };
}

export async function storeValidatedProcedureSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  procedureId: string;
  logger?: PluginLogger;
}): Promise<boolean> {
  if (!params.cfg) {
    return false;
  }
  const procedure = await loadValidatedProcedureSemanticSource({
    config: params.config,
    procedureId: params.procedureId,
  });
  if (!procedure) {
    return false;
  }
  const chunkText = buildProcedureSemanticText({
    title: procedure.title,
    body: procedure.body,
  });
  const queryEmbedding = await embedMemorySearchQuery({
    cfg: params.cfg,
    agentId: resolveAgentId({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: chunkText,
  });
  if (!queryEmbedding) {
    return false;
  }
  await upsertMemoryObjectSemanticEmbedding({
    config: params.config,
    memoryObjectId: procedure.sourceMemoryObjectId,
    chunkText,
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    metadata: {
      source: "semantic_retrieval_routing_v1",
      family: "recurring_procedure",
      mode: "validated_procedure_source_embedding",
    },
  });
  params.logger?.debug?.(
    [
      "memory-middleware procedure semantic embedding upserted",
      `procedureId=${params.procedureId}`,
      `memoryObjectId=${procedure.sourceMemoryObjectId}`,
      `embeddingModel=${queryEmbedding.embeddingModel}`,
      `embeddingVersion=${queryEmbedding.embeddingVersion}`,
    ].join(" "),
  );
  return true;
}

export async function storeApprovedEnvironmentConstraintSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  memoryObjectId: string;
  logger?: PluginLogger;
}): Promise<boolean> {
  if (!params.cfg) {
    return false;
  }
  const source = await loadApprovedWorkflowGuidanceSemanticSourceById({
    config: params.config,
    memoryObjectId: params.memoryObjectId,
    isSupportedLessonKey: isEnvironmentConstraintLessonKey,
  });
  if (!source) {
    return false;
  }
  const chunkText = buildWorkflowGuidanceSemanticText({
    familyLabel: "Environment constraint",
    lessonKey: source.lessonKey,
    ...(source.subject ? { subject: source.subject } : {}),
    ...(source.value ? { value: source.value } : {}),
    ...(source.title ? { title: source.title } : {}),
    content: source.content,
  });
  const queryEmbedding = await embedMemorySearchQuery({
    cfg: params.cfg,
    agentId: resolveAgentId({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: chunkText,
  });
  if (!queryEmbedding) {
    return false;
  }
  await upsertMemoryObjectSemanticEmbedding({
    config: params.config,
    memoryObjectId: source.memoryObjectId,
    chunkText,
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    metadata: {
      source: "semantic_retrieval_routing_v2",
      family: "workflow_environment_constraint",
      lessonKey: source.lessonKey,
      mode: "approved_memory_source_embedding",
    },
  });
  params.logger?.debug?.(
    [
      "memory-middleware environment-constraint semantic embedding upserted",
      `memoryObjectId=${source.memoryObjectId}`,
      `lessonKey=${source.lessonKey}`,
      `embeddingModel=${queryEmbedding.embeddingModel}`,
      `embeddingVersion=${queryEmbedding.embeddingVersion}`,
    ].join(" "),
  );
  return true;
}

export async function storeApprovedWorkflowToolGotchaSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  memoryObjectId: string;
  logger?: PluginLogger;
}): Promise<boolean> {
  if (!params.cfg) {
    return false;
  }
  const source = await loadApprovedWorkflowGuidanceSemanticSourceById({
    config: params.config,
    memoryObjectId: params.memoryObjectId,
    isSupportedLessonKey: isWorkflowToolGotchaLessonKey,
  });
  if (!source) {
    return false;
  }
  const chunkText = buildWorkflowGuidanceSemanticText({
    familyLabel: "Workflow improvement",
    lessonKey: source.lessonKey,
    ...(source.subject ? { subject: source.subject } : {}),
    ...(source.value ? { value: source.value } : {}),
    ...(source.title ? { title: source.title } : {}),
    content: source.content,
  });
  const queryEmbedding = await embedMemorySearchQuery({
    cfg: params.cfg,
    agentId: resolveAgentId({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: chunkText,
  });
  if (!queryEmbedding) {
    return false;
  }
  await upsertMemoryObjectSemanticEmbedding({
    config: params.config,
    memoryObjectId: source.memoryObjectId,
    chunkText,
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    metadata: {
      source: "semantic_retrieval_routing_v5",
      family: "workflow_tool_gotcha",
      lessonKey: source.lessonKey,
      mode: "approved_memory_source_embedding",
    },
  });
  params.logger?.debug?.(
    [
      "memory-middleware workflow-tool-gotcha semantic embedding upserted",
      `memoryObjectId=${source.memoryObjectId}`,
      `lessonKey=${source.lessonKey}`,
      `embeddingModel=${queryEmbedding.embeddingModel}`,
      `embeddingVersion=${queryEmbedding.embeddingVersion}`,
    ].join(" "),
  );
  return true;
}

export async function storeApprovedApiWorkaroundSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  memoryObjectId: string;
  logger?: PluginLogger;
}): Promise<boolean> {
  if (!params.cfg) {
    return false;
  }
  const source = await loadApprovedWorkflowGuidanceSemanticSourceById({
    config: params.config,
    memoryObjectId: params.memoryObjectId,
    isSupportedLessonKey: isApiWorkaroundLessonKey,
  });
  if (!source) {
    return false;
  }
  const chunkText = buildWorkflowGuidanceSemanticText({
    familyLabel: "Workflow improvement",
    lessonKey: source.lessonKey,
    ...(source.subject ? { subject: source.subject } : {}),
    ...(source.value ? { value: source.value } : {}),
    ...(source.title ? { title: source.title } : {}),
    content: source.content,
  });
  const queryEmbedding = await embedMemorySearchQuery({
    cfg: params.cfg,
    agentId: resolveAgentId({
      cfg: params.cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: chunkText,
  });
  if (!queryEmbedding) {
    return false;
  }
  await upsertMemoryObjectSemanticEmbedding({
    config: params.config,
    memoryObjectId: source.memoryObjectId,
    chunkText,
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    metadata: {
      source: "semantic_retrieval_routing_v4",
      family: "workflow_api_workaround",
      lessonKey: source.lessonKey,
      mode: "approved_memory_source_embedding",
    },
  });
  params.logger?.debug?.(
    [
      "memory-middleware workflow-api-workaround semantic embedding upserted",
      `memoryObjectId=${source.memoryObjectId}`,
      `lessonKey=${source.lessonKey}`,
      `embeddingModel=${queryEmbedding.embeddingModel}`,
      `embeddingVersion=${queryEmbedding.embeddingVersion}`,
    ].join(" "),
  );
  return true;
}

async function ensureApprovedEnvironmentConstraintSemanticEmbeddings(params: {
  config: MemoryMiddlewareConfig;
  cfg: OpenClawConfig;
  embeddingModel: string;
  embeddingVersion: string;
  projectId?: string;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<void> {
  const missingSources = await loadApprovedWorkflowGuidanceSourcesMissingEmbedding({
    config: params.config,
    embeddingModel: params.embeddingModel,
    embeddingVersion: params.embeddingVersion,
    supportedLessonKeys: [...SUPPORTED_ENVIRONMENT_CONSTRAINT_LESSON_KEYS],
    isSupportedLessonKey: isEnvironmentConstraintLessonKey,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });

  for (const source of missingSources) {
    const chunkText = buildWorkflowGuidanceSemanticText({
      familyLabel: "Environment constraint",
      lessonKey: source.lessonKey,
      ...(source.subject ? { subject: source.subject } : {}),
      ...(source.value ? { value: source.value } : {}),
      ...(source.title ? { title: source.title } : {}),
      content: source.content,
    });
    const queryEmbedding = await embedMemorySearchQuery({
      cfg: params.cfg,
      agentId: resolveAgentId({
        cfg: params.cfg,
        agentId: params.agentId,
        sessionKey: params.sessionKey,
      }),
      text: chunkText,
    });
    if (!queryEmbedding) {
      return;
    }
    await upsertMemoryObjectSemanticEmbedding({
      config: params.config,
      memoryObjectId: source.memoryObjectId,
      chunkText,
      embedding: queryEmbedding.embedding,
      embeddingModel: queryEmbedding.embeddingModel,
      embeddingVersion: queryEmbedding.embeddingVersion,
      metadata: {
        source: "semantic_retrieval_routing_v2",
        family: "workflow_environment_constraint",
        lessonKey: source.lessonKey,
        mode: "approved_memory_backfill_embedding",
      },
    });
    params.logger?.debug?.(
      [
        "memory-middleware environment-constraint semantic embedding backfilled",
        `memoryObjectId=${source.memoryObjectId}`,
        `lessonKey=${source.lessonKey}`,
        `embeddingModel=${queryEmbedding.embeddingModel}`,
        `embeddingVersion=${queryEmbedding.embeddingVersion}`,
      ].join(" "),
    );
  }
}

async function ensureApprovedWorkflowToolGotchaSemanticEmbeddings(params: {
  config: MemoryMiddlewareConfig;
  cfg: OpenClawConfig;
  embeddingModel: string;
  embeddingVersion: string;
  projectId?: string;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<void> {
  const missingSources = await loadApprovedWorkflowGuidanceSourcesMissingEmbedding({
    config: params.config,
    embeddingModel: params.embeddingModel,
    embeddingVersion: params.embeddingVersion,
    supportedLessonKeys: [...SUPPORTED_WORKFLOW_TOOL_GOTCHA_LESSON_KEYS],
    isSupportedLessonKey: isWorkflowToolGotchaLessonKey,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });

  for (const source of missingSources) {
    const chunkText = buildWorkflowGuidanceSemanticText({
      familyLabel: "Workflow improvement",
      lessonKey: source.lessonKey,
      ...(source.subject ? { subject: source.subject } : {}),
      ...(source.value ? { value: source.value } : {}),
      ...(source.title ? { title: source.title } : {}),
      content: source.content,
    });
    const queryEmbedding = await embedMemorySearchQuery({
      cfg: params.cfg,
      agentId: resolveAgentId({
        cfg: params.cfg,
        agentId: params.agentId,
        sessionKey: params.sessionKey,
      }),
      text: chunkText,
    });
    if (!queryEmbedding) {
      return;
    }
    await upsertMemoryObjectSemanticEmbedding({
      config: params.config,
      memoryObjectId: source.memoryObjectId,
      chunkText,
      embedding: queryEmbedding.embedding,
      embeddingModel: queryEmbedding.embeddingModel,
      embeddingVersion: queryEmbedding.embeddingVersion,
      metadata: {
        source: "semantic_retrieval_routing_v5",
        family: "workflow_tool_gotcha",
        lessonKey: source.lessonKey,
        mode: "approved_memory_backfill_embedding",
      },
    });
    params.logger?.debug?.(
      [
        "memory-middleware workflow-tool-gotcha semantic embedding backfilled",
        `memoryObjectId=${source.memoryObjectId}`,
        `lessonKey=${source.lessonKey}`,
        `embeddingModel=${queryEmbedding.embeddingModel}`,
        `embeddingVersion=${queryEmbedding.embeddingVersion}`,
      ].join(" "),
    );
  }
}

async function ensureApprovedApiWorkaroundSemanticEmbeddings(params: {
  config: MemoryMiddlewareConfig;
  cfg: OpenClawConfig;
  embeddingModel: string;
  embeddingVersion: string;
  projectId?: string;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<void> {
  const missingSources = await loadApprovedWorkflowGuidanceSourcesMissingEmbedding({
    config: params.config,
    embeddingModel: params.embeddingModel,
    embeddingVersion: params.embeddingVersion,
    supportedLessonKeys: [...SUPPORTED_API_WORKAROUND_LESSON_KEYS],
    isSupportedLessonKey: isApiWorkaroundLessonKey,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });

  for (const source of missingSources) {
    const chunkText = buildWorkflowGuidanceSemanticText({
      familyLabel: "Workflow improvement",
      lessonKey: source.lessonKey,
      ...(source.subject ? { subject: source.subject } : {}),
      ...(source.value ? { value: source.value } : {}),
      ...(source.title ? { title: source.title } : {}),
      content: source.content,
    });
    const queryEmbedding = await embedMemorySearchQuery({
      cfg: params.cfg,
      agentId: resolveAgentId({
        cfg: params.cfg,
        agentId: params.agentId,
        sessionKey: params.sessionKey,
      }),
      text: chunkText,
    });
    if (!queryEmbedding) {
      return;
    }
    await upsertMemoryObjectSemanticEmbedding({
      config: params.config,
      memoryObjectId: source.memoryObjectId,
      chunkText,
      embedding: queryEmbedding.embedding,
      embeddingModel: queryEmbedding.embeddingModel,
      embeddingVersion: queryEmbedding.embeddingVersion,
      metadata: {
        source: "semantic_retrieval_routing_v4",
        family: "workflow_api_workaround",
        lessonKey: source.lessonKey,
        mode: "approved_memory_backfill_embedding",
      },
    });
    params.logger?.debug?.(
      [
        "memory-middleware workflow-api-workaround semantic embedding backfilled",
        `memoryObjectId=${source.memoryObjectId}`,
        `lessonKey=${source.lessonKey}`,
        `embeddingModel=${queryEmbedding.embeddingModel}`,
        `embeddingVersion=${queryEmbedding.embeddingVersion}`,
      ].join(" "),
    );
  }
}

export async function maybeApplyProcedureSemanticFallback(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
}): Promise<MemoryObjectSearchHybridResult> {
  const eligibility = resolveProcedureSemanticFallbackEligibility(params);
  if (!eligibility.eligible) {
    return params.hybridResult;
  }
  const hybridResult = params.hybridResult as AcceptedHybridSearchResult;
  const cfg = params.cfg as OpenClawConfig;

  const queryEmbedding = await embedMemorySearchQuery({
    cfg,
    agentId: resolveAgentId({
      cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: params.input.query,
  });
  if (!queryEmbedding) {
    return params.hybridResult;
  }

  const semanticResult = await params.runtime.memoryObjectQuery.searchSemantic({
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    scope: "include_validated_procedures",
    kind: "procedure",
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.limit !== undefined ? { limit: params.input.limit } : {}),
  });
  if (
    !semanticResult.accepted ||
    semanticResult.status !== "ok" ||
    semanticResult.records.length === 0
  ) {
    return params.hybridResult;
  }

  const existingById = new Map(
    hybridResult.records.map((record: RankedRetrievedMemoryRecord) => [record.id, record]),
  );
  const scoreBase =
    Math.max(
      1,
      ...hybridResult.records.map((record: RankedRetrievedMemoryRecord) => record.score),
      semanticResult.records.length,
    ) +
    semanticResult.records.length +
    1;
  const records: RankedRetrievedMemoryRecord[] = [];
  const seen = new Set<string>();

  semanticResult.records.forEach((record, index) => {
    records.push(
      normalizeSemanticProcedureFallbackRecord({
        record,
        existing: existingById.get(record.id),
        scoreBase,
        index,
      }),
    );
    seen.add(record.id);
  });

  for (const record of hybridResult.records) {
    if (!seen.has(record.id)) {
      records.push(record);
    }
  }

  return {
    ...hybridResult,
    records,
  };
}

export async function maybeApplyEnvironmentConstraintSemanticFallback(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<MemoryObjectSearchHybridResult> {
  const eligibility = resolveProjectSemanticFallbackEligibility({
    family: "environment_constraint",
    input: params.input,
    hybridResult: params.hybridResult,
    cfg: params.cfg,
  });
  if (!eligibility.eligible) {
    return params.hybridResult;
  }
  const hybridResult = params.hybridResult as AcceptedHybridSearchResult;
  const cfg = params.cfg as OpenClawConfig;

  const queryEmbedding = await embedMemorySearchQuery({
    cfg,
    agentId: resolveAgentId({
      cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: params.input.query,
  });
  if (!queryEmbedding) {
    return params.hybridResult;
  }

  await ensureApprovedEnvironmentConstraintSemanticEmbeddings({
    config: params.runtime.config,
    cfg,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
    ...(params.logger ? { logger: params.logger } : {}),
  });

  const semanticResult = await params.runtime.memoryObjectQuery.searchSemantic({
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    scope: "approved_only",
    kind: "project",
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.limit !== undefined ? { limit: params.input.limit } : {}),
  });
  if (
    !semanticResult.accepted ||
    semanticResult.status !== "ok" ||
    semanticResult.records.length === 0
  ) {
    return params.hybridResult;
  }

  const semanticEnvironmentRecords = semanticResult.records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      record.memoryKind === "project" &&
      isEnvironmentConstraintLessonKey(extractWorkflowImprovementLessonKey(record.metadata)),
  );
  if (semanticEnvironmentRecords.length === 0) {
    return params.hybridResult;
  }

  const existingById = new Map(
    hybridResult.records.map((record: RankedRetrievedMemoryRecord) => [record.id, record]),
  );
  const scoreBase =
    Math.max(
      1,
      ...hybridResult.records.map((record: RankedRetrievedMemoryRecord) => record.score),
      semanticEnvironmentRecords.length,
    ) +
    semanticEnvironmentRecords.length +
    1;
  const records: RankedRetrievedMemoryRecord[] = [];
  const seen = new Set<string>();

  semanticEnvironmentRecords.forEach((record, index) => {
    records.push(
      normalizeSemanticEnvironmentConstraintFallbackRecord({
        record,
        existing: existingById.get(record.id),
        scoreBase,
        index,
      }),
    );
    seen.add(record.id);
  });

  for (const record of hybridResult.records) {
    if (!seen.has(record.id)) {
      records.push(record);
    }
  }

  return {
    ...hybridResult,
    records,
  };
}

export async function maybeApplyWorkflowToolGotchaSemanticFallback(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<MemoryObjectSearchHybridResult> {
  const eligibility = resolveProjectSemanticFallbackEligibility({
    family: "workflow_tool_gotcha",
    input: params.input,
    hybridResult: params.hybridResult,
    cfg: params.cfg,
  });
  if (!eligibility.eligible) {
    return params.hybridResult;
  }
  const hybridResult = params.hybridResult as AcceptedHybridSearchResult;
  const cfg = params.cfg as OpenClawConfig;

  const queryEmbedding = await embedMemorySearchQuery({
    cfg,
    agentId: resolveAgentId({
      cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: params.input.query,
  });
  if (!queryEmbedding) {
    return params.hybridResult;
  }

  await ensureApprovedWorkflowToolGotchaSemanticEmbeddings({
    config: params.runtime.config,
    cfg,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
    ...(params.logger ? { logger: params.logger } : {}),
  });

  const semanticResult = await params.runtime.memoryObjectQuery.searchSemantic({
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    scope: "approved_only",
    kind: "project",
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.limit !== undefined ? { limit: params.input.limit } : {}),
  });
  if (
    !semanticResult.accepted ||
    semanticResult.status !== "ok" ||
    semanticResult.records.length === 0
  ) {
    return params.hybridResult;
  }

  const semanticToolGotchaRecords = semanticResult.records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      record.memoryKind === "project" &&
      isWorkflowToolGotchaLessonKey(extractWorkflowImprovementLessonKey(record.metadata)),
  );
  if (semanticToolGotchaRecords.length === 0) {
    return params.hybridResult;
  }

  const existingById = new Map(
    hybridResult.records.map((record: RankedRetrievedMemoryRecord) => [record.id, record]),
  );
  const scoreBase =
    Math.max(
      1,
      ...hybridResult.records.map((record: RankedRetrievedMemoryRecord) => record.score),
      semanticToolGotchaRecords.length,
    ) +
    semanticToolGotchaRecords.length +
    1;
  const records: RankedRetrievedMemoryRecord[] = [];
  const seen = new Set<string>();

  semanticToolGotchaRecords.forEach((record, index) => {
    records.push(
      normalizeSemanticWorkflowToolGotchaFallbackRecord({
        record,
        existing: existingById.get(record.id),
        scoreBase,
        index,
      }),
    );
    seen.add(record.id);
  });

  for (const record of hybridResult.records) {
    if (!seen.has(record.id)) {
      records.push(record);
    }
  }

  return {
    ...hybridResult,
    records,
  };
}

export async function maybeApplyApiWorkaroundSemanticFallback(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
  logger?: PluginLogger;
}): Promise<MemoryObjectSearchHybridResult> {
  const eligibility = resolveProjectSemanticFallbackEligibility({
    family: "api_workaround",
    input: params.input,
    hybridResult: params.hybridResult,
    cfg: params.cfg,
  });
  if (!eligibility.eligible) {
    return params.hybridResult;
  }
  const hybridResult = params.hybridResult as AcceptedHybridSearchResult;
  const cfg = params.cfg as OpenClawConfig;

  const queryEmbedding = await embedMemorySearchQuery({
    cfg,
    agentId: resolveAgentId({
      cfg,
      agentId: params.agentId,
      sessionKey: params.sessionKey,
    }),
    text: params.input.query,
  });
  if (!queryEmbedding) {
    return params.hybridResult;
  }

  await ensureApprovedApiWorkaroundSemanticEmbeddings({
    config: params.runtime.config,
    cfg,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
    ...(params.logger ? { logger: params.logger } : {}),
  });

  const semanticResult = await params.runtime.memoryObjectQuery.searchSemantic({
    embedding: queryEmbedding.embedding,
    embeddingModel: queryEmbedding.embeddingModel,
    embeddingVersion: queryEmbedding.embeddingVersion,
    scope: "approved_only",
    kind: "project",
    ...(params.input.projectId ? { projectId: params.input.projectId } : {}),
    ...(params.input.limit !== undefined ? { limit: params.input.limit } : {}),
  });
  if (
    !semanticResult.accepted ||
    semanticResult.status !== "ok" ||
    semanticResult.records.length === 0
  ) {
    return params.hybridResult;
  }

  const semanticApiWorkaroundRecords = semanticResult.records.filter(
    (record) =>
      record.objectType === "memory_object" &&
      record.memoryKind === "project" &&
      isApiWorkaroundLessonKey(extractWorkflowImprovementLessonKey(record.metadata)),
  );
  if (semanticApiWorkaroundRecords.length === 0) {
    return params.hybridResult;
  }

  const existingById = new Map(
    hybridResult.records.map((record: RankedRetrievedMemoryRecord) => [record.id, record]),
  );
  const scoreBase =
    Math.max(
      1,
      ...hybridResult.records.map((record: RankedRetrievedMemoryRecord) => record.score),
      semanticApiWorkaroundRecords.length,
    ) +
    semanticApiWorkaroundRecords.length +
    1;
  const records: RankedRetrievedMemoryRecord[] = [];
  const seen = new Set<string>();

  semanticApiWorkaroundRecords.forEach((record, index) => {
    records.push(
      normalizeSemanticApiWorkaroundFallbackRecord({
        record,
        existing: existingById.get(record.id),
        scoreBase,
        index,
      }),
    );
    seen.add(record.id);
  });

  for (const record of hybridResult.records) {
    if (!seen.has(record.id)) {
      records.push(record);
    }
  }

  return {
    ...hybridResult,
    records,
  };
}
