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

async function upsertMemoryObjectSemanticEmbedding(params: {
  config: MemoryMiddlewareConfig;
  memoryObjectId: string;
  chunkText: string;
  embedding: number[];
  embeddingModel: string;
  embeddingVersion: string;
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
        JSON.stringify({
          source: "semantic_retrieval_routing_v1",
          family: "recurring_procedure",
          mode: "validated_procedure_source_embedding",
        }),
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

export async function maybeApplyProcedureSemanticFallback(params: {
  runtime: MemoryMiddlewareRuntime;
  input: MemoryObjectSearchHybridInput;
  hybridResult: MemoryObjectSearchHybridResult;
  cfg?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
}): Promise<MemoryObjectSearchHybridResult> {
  if (!params.hybridResult.accepted || params.hybridResult.status !== "ok") {
    return params.hybridResult;
  }
  const scope = params.input.scope ?? "approved_only";
  if (
    !params.cfg ||
    params.input.kind !== "procedure" ||
    scope !== "include_validated_procedures" ||
    hasStrongProcedureHybridMatch(params.hybridResult.records[0])
  ) {
    return params.hybridResult;
  }

  const queryEmbedding = await embedMemorySearchQuery({
    cfg: params.cfg,
    agentId: resolveAgentId({
      cfg: params.cfg,
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

  const existingById = new Map(params.hybridResult.records.map((record) => [record.id, record]));
  const scoreBase =
    Math.max(
      1,
      ...params.hybridResult.records.map((record) => record.score),
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

  for (const record of params.hybridResult.records) {
    if (!seen.has(record.id)) {
      records.push(record);
    }
  }

  return {
    ...params.hybridResult,
    records,
  };
}
