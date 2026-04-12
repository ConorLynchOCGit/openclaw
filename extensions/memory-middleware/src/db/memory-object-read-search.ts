import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  normalizeMemoryObjectScope,
  normalizeMemoryObjectSemanticScope,
  scopeIncludesCandidates,
  scopeIncludesValidatedProcedures,
} from "../memory-object-retrieval-scope.js";
import { buildMemoryObjectRetrievalControlDecision } from "../retrieval-control-plane.js";
import {
  buildApprovedMemoryRetrievalFeatureSql,
  buildReviewableCandidateRetrievalFeatureSql,
  buildValidatedProcedureRetrievalFeatureSql,
} from "../retrieval-feature-framework.js";
import { buildHybridMemoryObjectSurfaceScaffolding } from "./hybrid-memory-surface-scaffolding.js";
import {
  NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
  normalizeMemoryObjectListLimit,
  normalizeMemoryObjectRecord,
  normalizeMemoryObjectSearchLimit,
  normalizeRankedMemoryObjectRecord,
  normalizeRankedProcedureObjectRecord,
  normalizeProcedureObjectRecord,
  normalizeSemanticMemoryObjectRecord,
  normalizeSemanticProcedureObjectRecord,
  shapeProjectIntentRankedRecords,
  sortRankedRetrievedRecords,
  sortRetrievedRecordsByUpdatedAtDesc,
  sortRetrievedRowsByUpdatedAtDesc,
  summarizeMemoryObjectQueryError,
  type RankedMemoryObjectSearchRow,
  type RankedProcedureSearchRow,
  type RetrievedMemoryObjectRow,
  type RetrievedProcedureRow,
  type SemanticMemoryObjectSearchRow,
  type SemanticProcedureSearchRow,
} from "./memory-object-query-runtime.js";
import {
  buildApprovedMemoryArtifactVisibilityCondition,
  buildMemoryObjectSurfaceReadScaffolding,
} from "./memory-object-surface-read-scaffolding.js";
import type {
  MemoryObjectGetInput,
  MemoryObjectGetResult,
  MemoryObjectListInput,
  MemoryObjectListResult,
  MemoryObjectSearchBasicInput,
  MemoryObjectSearchBasicResult,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchHybridResult,
  MemoryObjectSearchScope,
  MemoryObjectSearchSemanticInput,
  MemoryObjectSearchSemanticResult,
} from "./runtime.js";
import { quoteQualifiedTable, withConfiguredClient } from "./shared.js";

function resolveSearchMemoryKinds(
  kind: MemoryObjectSearchBasicInput["kind"] | MemoryObjectSearchHybridInput["kind"],
): readonly ("project" | "feedback" | "procedure")[] | null {
  switch (kind) {
    case "project":
      // Project retrieval is allowed to surface project-scoped facts plus feedback-backed workflow
      // guidance and rules. The canonical retrieval plan already models this mixed surface.
      return ["project", "feedback"];
    case "feedback":
      return ["feedback"];
    case "procedure":
      return ["procedure"];
    default:
      return null;
  }
}

export async function getMemoryObjectInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectGetInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectGetResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const result = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObject = await selectMemoryObjectById({
          client,
          schema: params.schema,
          objectId: params.input.objectId,
          scope,
        });
        if (memoryObject) {
          return {
            record: normalizeMemoryObjectRecord(memoryObject),
          } as const;
        }
        if (!scopeIncludesValidatedProcedures(scope)) {
          return null;
        }
        const procedure = await selectValidatedProcedureById({
          client,
          schema: params.schema,
          objectId: params.input.objectId,
        });
        return procedure ? ({ record: normalizeProcedureObjectRecord(procedure) } as const) : null;
      },
    });

    if (!result) {
      return {
        accepted: false,
        status: "not_found",
        reason: "memory object not found in requested retrieval scope",
      };
    }

    params.logger.debug?.(
      [
        "memory-middleware memory object get completed",
        `objectId=${params.input.objectId}`,
        `objectType=${result.record.objectType}`,
        `scope=${scope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      record: result.record,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object get failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function listMemoryObjectsInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectListInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectListResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await listMemoryObjectRows({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return retrieved;
        }
        const procedures = await listValidatedProcedureRows({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRetrievedRecordsByUpdatedAtDesc([
          ...retrieved,
          ...procedures.map(normalizeProcedureObjectRecord),
        ]);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object list completed",
        `scope=${scope}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object list failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function searchMemoryObjectsBasicInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchBasicInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchBasicResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await searchMemoryObjectRowsBasic({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return retrieved;
        }
        const procedures = await searchValidatedProcedureRowsBasic({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRetrievedRecordsByUpdatedAtDesc([
          ...retrieved,
          ...procedures.map(normalizeProcedureObjectRecord),
        ]);
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object basic search completed",
        `scope=${scope}`,
        `query=${params.input.query}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      query: params.input.query,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object basic search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function searchMemoryObjectsHybridInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchHybridInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchHybridResult> {
  const scope = normalizeMemoryObjectScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const memoryObjects = await searchMemoryObjectRowsHybrid({
          client,
          schema: params.schema,
          input: params.input,
          scope,
        });
        const retrieved = memoryObjects.map(normalizeRankedMemoryObjectRecord);
        if (!scopeIncludesValidatedProcedures(scope)) {
          return sortRankedRetrievedRecords(retrieved);
        }
        const procedures = await searchValidatedProcedureRowsHybrid({
          client,
          schema: params.schema,
          input: params.input,
        });
        return sortRankedRetrievedRecords([
          ...retrieved,
          ...procedures.map(normalizeRankedProcedureObjectRecord),
        ]);
      },
    });
    const shapedRecords = shapeProjectIntentRankedRecords({
      records,
      query: params.input.query,
      scope,
      kind: params.input.kind,
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object hybrid search completed",
        `scope=${scope}`,
        `query=${params.input.query}`,
        `count=${String(shapedRecords.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      query: params.input.query,
      records: shapedRecords,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object hybrid search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function searchMemoryObjectsSemanticInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: MemoryObjectSearchSemanticInput;
  logger: PluginLogger;
  schema: string;
}): Promise<MemoryObjectSearchSemanticResult> {
  const scope = normalizeMemoryObjectSemanticScope(params.input.scope);

  try {
    const records = await withConfiguredClient({
      config: params.config,
      run: async (client) => {
        const approved = await searchApprovedMemorySurfaceRowsSemantic({
          client,
          schema: params.schema,
          input: params.input,
        });
        const retrieved = approved.map(normalizeSemanticMemoryObjectRecord);
        if (scope !== "include_validated_procedures") {
          return retrieved;
        }
        const procedures = await searchValidatedProcedureRowsSemantic({
          client,
          schema: params.schema,
          input: params.input,
        });
        return [...retrieved, ...procedures.map(normalizeSemanticProcedureObjectRecord)].sort(
          (left, right) =>
            right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
      },
    });

    params.logger.debug?.(
      [
        "memory-middleware memory object semantic search completed",
        `scope=${scope}`,
        `embeddingModel=${params.input.embeddingModel}`,
        `embeddingVersion=${params.input.embeddingVersion}`,
        `count=${String(records.length)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "ok",
      scope,
      embeddingModel: params.input.embeddingModel,
      embeddingVersion: params.input.embeddingVersion,
      records,
    };
  } catch (error) {
    const reason = summarizeMemoryObjectQueryError(error);
    params.logger.error(`memory-middleware memory object semantic search failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function listApprovedMemorySurfaceRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  return listMemoryObjectSurfaceRows({
    ...params,
    surfaceKind: "approved",
  });
}

async function listReviewableCandidateSurfaceRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  return listMemoryObjectSurfaceRows({
    ...params,
    surfaceKind: "reviewable_candidate",
  });
}

async function listMemoryObjectSurfaceRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
  surfaceKind: "approved" | "reviewable_candidate";
}): Promise<RetrievedMemoryObjectRow[]> {
  const surfaceScaffolding = buildMemoryObjectSurfaceReadScaffolding({
    alias: "v",
    surfaceKind: params.surfaceKind,
    hiddenApprovedArtifactFamilies: NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
  });
  const memorySurfaceView = quoteQualifiedTable({
    schema: params.schema,
    table: surfaceScaffolding.internalViewName,
  });
  const conditions = [...surfaceScaffolding.baseConditions];
  const values: unknown[] = [];

  if (params.input.kind) {
    values.push(params.input.kind);
    conditions.push(`v.memory_kind::text = $${values.length}::text`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }
  if (params.input.agentId) {
    values.push(params.input.agentId);
    conditions.push(`v.agent_id = $${values.length}::uuid`);
  }
  if (params.input.sessionId) {
    values.push(params.input.sessionId);
    conditions.push(`v.session_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectListLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        '${surfaceScaffolding.readSurface}'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        ${surfaceScaffolding.reviewStateExpression} as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${memorySurfaceView} v
      where ${conditions.join("\n        and ")}
      order by v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );
  return result.rows;
}

async function selectApprovedMemorySurfaceById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedMemoryObjectRow | null> {
  return selectMemoryObjectSurfaceById({
    ...params,
    surfaceKind: "approved",
  });
}

async function selectReviewableCandidateSurfaceById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedMemoryObjectRow | null> {
  return selectMemoryObjectSurfaceById({
    ...params,
    surfaceKind: "reviewable_candidate",
  });
}

async function selectMemoryObjectSurfaceById(params: {
  client: Client;
  schema: string;
  objectId: string;
  surfaceKind: "approved" | "reviewable_candidate";
}): Promise<RetrievedMemoryObjectRow | null> {
  const surfaceScaffolding = buildMemoryObjectSurfaceReadScaffolding({
    alias: "v",
    surfaceKind: params.surfaceKind,
    hiddenApprovedArtifactFamilies: NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
  });
  const memorySurfaceView = quoteQualifiedTable({
    schema: params.schema,
    table: surfaceScaffolding.internalViewName,
  });
  const conditions = [...surfaceScaffolding.baseConditions, "v.id = $1::uuid"];
  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        '${surfaceScaffolding.readSurface}'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        ${surfaceScaffolding.reviewStateExpression} as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${memorySurfaceView} v
      where ${conditions.join("\n        and ")}
      limit 1
    `,
    [params.objectId],
  );
  return result.rows[0] ?? null;
}

async function selectMemoryObjectById(params: {
  client: Client;
  schema: string;
  objectId: string;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow | null> {
  if (scopeIncludesCandidates(params.scope)) {
    const reviewableCandidate = await selectReviewableCandidateSurfaceById(params);
    if (reviewableCandidate) {
      return reviewableCandidate;
    }
  }

  return selectApprovedMemorySurfaceById(params);
}

async function selectValidatedProcedureById(params: {
  client: Client;
  schema: string;
  objectId: string;
}): Promise<RetrievedProcedureRow | null> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where p.id = $1::uuid
        and p.status = 'validated'
      limit 1
    `,
    [params.objectId],
  );

  return result.rows[0] ?? null;
}

async function listMemoryObjectRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approved = await listApprovedMemorySurfaceRows(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await listReviewableCandidateSurfaceRows(params)
    : [];
  return sortRetrievedRowsByUpdatedAtDesc([...approved, ...reviewableCandidates]);
}

export async function listValidatedProcedureRows(params: {
  client: Client;
  schema: string;
  input: MemoryObjectListInput;
}): Promise<RetrievedProcedureRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const conditions = ["p.status::text = 'validated'"];
  const values: unknown[] = [];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectListLimit(params.input.limit));

  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchApprovedMemorySurfaceRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  return searchMemoryObjectSurfaceRowsBasic({
    ...params,
    surfaceKind: "approved",
  });
}

async function searchReviewableCandidateSurfaceRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedMemoryObjectRow[]> {
  return searchMemoryObjectSurfaceRowsBasic({
    ...params,
    surfaceKind: "reviewable_candidate",
  });
}

async function searchMemoryObjectSurfaceRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
  surfaceKind: "approved" | "reviewable_candidate";
}): Promise<RetrievedMemoryObjectRow[]> {
  const surfaceScaffolding = buildMemoryObjectSurfaceReadScaffolding({
    alias: "v",
    surfaceKind: params.surfaceKind,
    hiddenApprovedArtifactFamilies: NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
  });
  const memorySurfaceView = quoteQualifiedTable({
    schema: params.schema,
    table: surfaceScaffolding.internalViewName,
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const conditions = [
    ...surfaceScaffolding.baseConditions,
    `(mo.search_document @@ websearch_to_tsquery('english', $1::text) or ${combinedTextExpression} like lower($2::text))`,
  ];
  const values: unknown[] = [params.input.query, `%${params.input.query}%`];

  const requestedMemoryKinds = resolveSearchMemoryKinds(params.input.kind);
  if (requestedMemoryKinds) {
    values.push(requestedMemoryKinds);
    conditions.push(`v.memory_kind::text = any($${values.length}::text[])`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RetrievedMemoryObjectRow>(
    `
      select
        'memory_object'::text as object_type,
        '${surfaceScaffolding.readSurface}'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        ${surfaceScaffolding.reviewStateExpression} as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at
      from ${memorySurfaceView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchMemoryObjectRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
  scope: MemoryObjectSearchScope;
}): Promise<RetrievedMemoryObjectRow[]> {
  const approved = await searchApprovedMemorySurfaceRowsBasic(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await searchReviewableCandidateSurfaceRowsBasic(params)
    : [];
  return sortRetrievedRowsByUpdatedAtDesc([...approved, ...reviewableCandidates]);
}

async function searchValidatedProcedureRowsBasic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchBasicInput;
}): Promise<RetrievedProcedureRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const conditions = [
    "p.status::text = 'validated'",
    "(p.search_document @@ websearch_to_tsquery('english', $1::text) or lower(coalesce(p.title, '') || ' ' || coalesce(p.body, '')) like lower($2::text))",
  ];
  const values: unknown[] = [params.input.query, `%${params.input.query}%`];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<RetrievedProcedureRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchMemoryObjectSurfaceRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
  surfaceKind: "approved" | "reviewable_candidate";
}): Promise<RankedMemoryObjectSearchRow[]> {
  const retrievalDecision = buildMemoryObjectRetrievalControlDecision({
    input: params.input,
  });
  const memorySurfaceView = quoteQualifiedTable({
    schema: params.schema,
    table:
      params.surfaceKind === "approved"
        ? "internal_approved_memory_v"
        : "internal_reviewable_candidates_v",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const combinedTextExpression = "lower(coalesce(v.title, '') || ' ' || coalesce(v.content, ''))";
  const surfaceScaffolding = buildHybridMemoryObjectSurfaceScaffolding({
    alias: "v",
    surfaceKind: params.surfaceKind,
  });
  const conditions = [
    `(
      mo.search_document @@ websearch_to_tsquery('english', $1::text)
      or ${combinedTextExpression} like lower($2::text)
      or similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
    )`,
    ...(params.surfaceKind === "approved"
      ? [
          buildApprovedMemoryArtifactVisibilityCondition({
            alias: "v",
            hiddenArtifactFamilies: NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
          }),
        ]
      : ["v.review_state = 'candidate'"]),
  ];
  const values: unknown[] = [
    params.input.query,
    `${params.input.query}%`,
    retrievalDecision.responseStyleHint?.template ?? "",
    retrievalDecision.responseStyleHint?.normalizedSubject ?? "",
    retrievalDecision.projectFactHint?.fieldKey ?? "",
    retrievalDecision.workflowImprovementHint?.captureClass ?? "",
    retrievalDecision.normalizedQuery,
    retrievalDecision.projectMemoryIntentProfile,
    retrievalDecision.generalizedWorkflowPatternHint,
  ];

  const requestedMemoryKinds = resolveSearchMemoryKinds(params.input.kind);
  if (requestedMemoryKinds) {
    values.push(requestedMemoryKinds);
    conditions.push(`v.memory_kind::text = any($${values.length}::text[])`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));
  const retrievalFeatureSql =
    params.surfaceKind === "approved"
      ? buildApprovedMemoryRetrievalFeatureSql({
          expressions: {
            compatibilityFamilyIdExpression: surfaceScaffolding.compatibilityFamilyIdExpression,
            autoCaptureTemplateExpression: surfaceScaffolding.autoCaptureTemplateExpression,
            autoCaptureFactFamilyExpression: surfaceScaffolding.autoCaptureFactFamilyExpression,
            autoCaptureGuidancePatternExpression:
              surfaceScaffolding.autoCaptureGuidancePatternExpression,
            autoCaptureNormalizedSubjectExpression:
              surfaceScaffolding.autoCaptureNormalizedSubjectExpression,
            autoCaptureNormalizedProjectFactLabelExpression:
              surfaceScaffolding.autoCaptureNormalizedProjectFactLabelExpression,
            autoCaptureNormalizedProjectScopeExpression:
              surfaceScaffolding.autoCaptureNormalizedProjectScopeExpression,
            autoCaptureNormalizedRecommendedActionExpression:
              surfaceScaffolding.autoCaptureNormalizedRecommendedActionExpression,
            autoCaptureNormalizedAvoidActionExpression:
              surfaceScaffolding.autoCaptureNormalizedAvoidActionExpression,
            autoCaptureNormalizedNeededCapabilityExpression:
              surfaceScaffolding.autoCaptureNormalizedNeededCapabilityExpression,
            autoCaptureNormalizedValueExpression:
              surfaceScaffolding.autoCaptureNormalizedValueExpression,
          },
          paramRefs: {
            responseStyleNormalizedSubjectHintRef: "$4::text",
            normalizedQueryRef: "$7::text",
            projectMemoryIntentProfileRef: "$8::text",
            generalizedWorkflowPatternHintRef: "$9::text",
          },
        })
      : buildReviewableCandidateRetrievalFeatureSql({
          expressions: {
            compatibilityFamilyIdExpression: surfaceScaffolding.compatibilityFamilyIdExpression,
            autoCaptureTemplateExpression: surfaceScaffolding.autoCaptureTemplateExpression,
            autoCaptureFactFamilyExpression: surfaceScaffolding.autoCaptureFactFamilyExpression,
            autoCaptureGuidancePatternExpression:
              surfaceScaffolding.autoCaptureGuidancePatternExpression,
            autoCaptureNormalizedSubjectExpression:
              surfaceScaffolding.autoCaptureNormalizedSubjectExpression,
            autoCaptureNormalizedProjectFactLabelExpression:
              surfaceScaffolding.autoCaptureNormalizedProjectFactLabelExpression,
            autoCaptureNormalizedProjectScopeExpression:
              surfaceScaffolding.autoCaptureNormalizedProjectScopeExpression,
            autoCaptureNormalizedRecommendedActionExpression:
              surfaceScaffolding.autoCaptureNormalizedRecommendedActionExpression,
            autoCaptureNormalizedAvoidActionExpression:
              surfaceScaffolding.autoCaptureNormalizedAvoidActionExpression,
            autoCaptureNormalizedNeededCapabilityExpression:
              surfaceScaffolding.autoCaptureNormalizedNeededCapabilityExpression,
            autoCaptureNormalizedValueExpression:
              surfaceScaffolding.autoCaptureNormalizedValueExpression,
          },
          paramRefs: {
            responseStyleNormalizedSubjectHintRef: "$4::text",
            normalizedQueryRef: "$7::text",
            projectMemoryIntentProfileRef: "$8::text",
            generalizedWorkflowPatternHintRef: "$9::text",
          },
        });

  const result = await params.client.query<RankedMemoryObjectSearchRow>(
    `
      select
        'memory_object'::text as object_type,
        '${surfaceScaffolding.readSurface}'::text as read_surface,
        v.id::text as id,
        v.memory_kind::text as memory_kind,
        ${surfaceScaffolding.reviewStateExpression} as review_state,
        v.content,
        v.project_id::text as project_id,
        v.agent_id::text as agent_id,
        v.session_id::text as session_id,
        null::text as source_event_id,
        v.metadata,
        v.created_at::text as created_at,
        v.updated_at::text as updated_at,
        (
          case when lower(coalesce(v.title, '')) = lower($1::text) then 140 else 0 end
          + case when ${combinedTextExpression} = lower($1::text) then 120 else 0 end
          + case when lower(coalesce(v.title, '')) like lower($2::text) then 110 else 0 end
          + case when ${combinedTextExpression} like lower($2::text) then 90 else 0 end
          + case when $3::text <> '' and ${surfaceScaffolding.autoCaptureTemplateExpression} = $3::text then 135 else 0 end
          + case when $5::text <> '' and ${surfaceScaffolding.autoCaptureFieldKeyExpression} = $5::text then 220 else 0 end
          + case when $6::text <> '' and ${surfaceScaffolding.autoCaptureCaptureClassExpression} = $6::text then 185 else 0 end
          ${retrievalFeatureSql.scoreClauses.map((clause) => `+ ${clause}`).join("\n          ")}
          + (ts_rank_cd(mo.search_document, websearch_to_tsquery('english', $1::text)) * 100.0)
          + (similarity(${combinedTextExpression}, lower($1::text)) * 40.0)
        )::float8 as score,
        array_remove(
          array[
            case when lower(coalesce(v.title, '')) = lower($1::text) then 'title_exact' end,
            case when ${combinedTextExpression} = lower($1::text) then 'content_exact' end,
            case when lower(coalesce(v.title, '')) like lower($2::text) then 'title_prefix' end,
            case when ${combinedTextExpression} like lower($2::text) then 'content_prefix' end,
            case when $3::text <> '' and ${surfaceScaffolding.autoCaptureTemplateExpression} = $3::text
              then 'auto_capture_template_match'
            end,
            case when $5::text <> '' and ${surfaceScaffolding.autoCaptureFieldKeyExpression} = $5::text
              then 'auto_capture_field_match'
            end,
            case when $6::text <> '' and ${surfaceScaffolding.autoCaptureCaptureClassExpression} = $6::text
              then 'auto_capture_capture_class_match'
            end,
            ${retrievalFeatureSql.matchedFieldClauses.join(",\n            ")},
            case when mo.search_document @@ websearch_to_tsquery('english', $1::text)
              then 'fts_search_document'
            end,
            case when similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
              then 'trigram_similarity'
            end
          ],
          null
        )::text[] as matched_fields
      from ${memorySurfaceView} v
      inner join ${memoryObjectsTable} mo
        on mo.id = v.id
      where ${conditions.join("\n        and ")}
      order by score desc, v.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchApprovedMemorySurfaceRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedMemoryObjectSearchRow[]> {
  return searchMemoryObjectSurfaceRowsHybrid({
    ...params,
    surfaceKind: "approved",
  });
}

async function searchReviewableCandidateSurfaceRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedMemoryObjectSearchRow[]> {
  return searchMemoryObjectSurfaceRowsHybrid({
    ...params,
    surfaceKind: "reviewable_candidate",
  });
}

async function searchMemoryObjectRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
  scope: MemoryObjectSearchScope;
}): Promise<RankedMemoryObjectSearchRow[]> {
  const approved = await searchApprovedMemorySurfaceRowsHybrid(params);
  const reviewableCandidates = scopeIncludesCandidates(params.scope)
    ? await searchReviewableCandidateSurfaceRowsHybrid(params)
    : [];
  return [...approved, ...reviewableCandidates].sort(
    (left, right) =>
      right.score - left.score || Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

async function searchValidatedProcedureRowsHybrid(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchHybridInput;
}): Promise<RankedProcedureSearchRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const combinedTextExpression = "lower(coalesce(p.title, '') || ' ' || coalesce(p.body, ''))";
  const procedureSubjectExpression = [
    "coalesce(",
    "lower(p.metadata->'autoPromotion'->>'normalizedSubject'),",
    "lower(p.metadata->'candidateMetadata'->'autoCapture'->>'normalizedSubject'),",
    "lower(p.title),",
    "''",
    ")",
  ].join(" ");
  const procedureKeyExpression = [
    "coalesce(",
    "p.metadata->'autoPromotion'->>'procedureKey',",
    "p.metadata->'candidateMetadata'->'autoCapture'->>'procedureKey',",
    "p.metadata->'promotionMetadata'->'autoPromotion'->>'procedureKey',",
    "''",
    ")",
  ].join(" ");
  const retrievalDecision = buildMemoryObjectRetrievalControlDecision({
    input: params.input,
  });
  const conditions = [
    "p.status::text = 'validated'",
    `(
      p.search_document @@ websearch_to_tsquery('english', $1::text)
      or ${combinedTextExpression} like lower($2::text)
      or similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
      or ($3::text <> '' and ${procedureKeyExpression} = $3::text)
      or ($4::text <> '' and ${procedureSubjectExpression} = $4::text)
      or ($4::text <> '' and ${procedureSubjectExpression} like ($4::text || '%'))
    )`,
  ];
  const values: unknown[] = [
    params.input.query,
    `${params.input.query}%`,
    retrievalDecision.procedureHint?.procedureKey ?? "",
    retrievalDecision.procedureHint?.normalizedSubject ?? "",
  ];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));
  const procedureRetrievalFeatureSql = buildValidatedProcedureRetrievalFeatureSql({
    expressions: {
      procedureSubjectExpression,
    },
    paramRefs: {
      normalizedSubjectRef: "$4::text",
    },
  });

  const result = await params.client.query<RankedProcedureSearchRow>(
    `
      select
        'procedure'::text as object_type,
        'validated_procedure_read_model'::text as read_surface,
        p.id::text as id,
        p.status::text as status,
        p.title,
        p.body,
        p.project_id::text as project_id,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'sourceCandidateId' as source_candidate_id,
        vr.id::text as latest_validation_run_id,
        vr.outcome::text as latest_validation_run_outcome,
        p.metadata,
        p.created_at::text as created_at,
        p.updated_at::text as updated_at,
        greatest(
          case when lower(p.title) = lower($1::text) then 160 else 0 end,
          case when lower(p.title) like lower($2::text) then 130 else 0 end,
          case when $3::text <> '' and ${procedureKeyExpression} = $3::text then 220 else 0 end,
          ${procedureRetrievalFeatureSql.scoreClauses.join(",\n          ")},
          (ts_rank_cd(p.search_document, websearch_to_tsquery('english', $1::text)) * 110.0),
          (similarity(${combinedTextExpression}, lower($1::text)) * 45.0)
        )::float8 as score,
        array_remove(
          array[
            case when lower(p.title) = lower($1::text) then 'title_exact' end,
            case when lower(p.title) like lower($2::text) then 'title_prefix' end,
            case when $3::text <> '' and ${procedureKeyExpression} = $3::text
              then 'procedure_key_match'
            end,
            ${procedureRetrievalFeatureSql.matchedFieldClauses.join(",\n            ")},
            case when p.search_document @@ websearch_to_tsquery('english', $1::text)
              then 'fts_search_document'
            end,
            case when similarity(${combinedTextExpression}, lower($1::text)) >= 0.15
              then 'trigram_similarity'
            end
          ],
          null
        )::text[] as matched_fields
      from ${proceduresTable} p
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc
        limit 1
      ) vr on true
      where ${conditions.join("\n        and ")}
      order by score desc, p.updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

function serializeVectorLiteral(values: number[]): string {
  if (values.length === 0) {
    throw new Error("semantic embedding query vector must not be empty");
  }

  return `[${values.join(",")}]`;
}

async function searchApprovedMemorySurfaceRowsSemantic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchSemanticInput;
}): Promise<SemanticMemoryObjectSearchRow[]> {
  const approvedMemoryView = quoteQualifiedTable({
    schema: params.schema,
    table: "internal_approved_memory_v",
  });
  const memoryEmbeddingsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_embeddings",
  });
  const conditions = [
    "me.embedding is not null",
    "me.embedding_model = $2::text",
    "me.embedding_version = $3::text",
    buildApprovedMemoryArtifactVisibilityCondition({
      alias: "v",
      hiddenArtifactFamilies: NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES,
    }),
  ];
  const values: unknown[] = [
    serializeVectorLiteral(params.input.embedding),
    params.input.embeddingModel,
    params.input.embeddingVersion,
  ];

  const requestedMemoryKinds = resolveSearchMemoryKinds(params.input.kind);
  if (requestedMemoryKinds) {
    values.push(requestedMemoryKinds);
    conditions.push(`v.memory_kind::text = any($${values.length}::text[])`);
  }
  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`v.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<SemanticMemoryObjectSearchRow>(
    `
      with ranked as (
        select
          'memory_object'::text as object_type,
          'approved_memory_view'::text as read_surface,
          v.id::text as id,
          v.memory_kind::text as memory_kind,
          'approved'::text as review_state,
          v.content,
          v.project_id::text as project_id,
          v.agent_id::text as agent_id,
          v.session_id::text as session_id,
          null::text as source_event_id,
          v.metadata,
          v.created_at::text as created_at,
          v.updated_at::text as updated_at,
          me.embedding_model,
          me.embedding_version,
          me.chunk_index,
          (me.embedding <=> $1::vector)::float8 as distance
        from ${approvedMemoryView} v
        inner join ${memoryEmbeddingsTable} me
          on me.memory_object_id = v.id
        where ${conditions.join("\n          and ")}
      ),
      deduped as (
        select distinct on (id)
          object_type,
          read_surface,
          id,
          memory_kind,
          review_state,
          content,
          project_id,
          agent_id,
          session_id,
          source_event_id,
          metadata,
          created_at,
          updated_at,
          embedding_model,
          embedding_version,
          chunk_index,
          distance
        from ranked
        order by id, distance asc, updated_at desc
      )
      select
        object_type,
        read_surface,
        id,
        memory_kind,
        review_state,
        content,
        project_id,
        agent_id,
        session_id,
        source_event_id,
        metadata,
        created_at,
        updated_at,
        embedding_model,
        embedding_version,
        chunk_index,
        distance,
        (1.0 / (1.0 + distance))::float8 as score,
        array['semantic_embedding']::text[] as matched_fields
      from deduped
      order by score desc, updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}

async function searchValidatedProcedureRowsSemantic(params: {
  client: Client;
  schema: string;
  input: MemoryObjectSearchSemanticInput;
}): Promise<SemanticProcedureSearchRow[]> {
  if (params.input.kind && params.input.kind !== "procedure") {
    return [];
  }

  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEmbeddingsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_embeddings",
  });
  const conditions = [
    "p.status::text = 'validated'",
    "p.source_memory_object_id is not null",
    "me.embedding is not null",
    "me.embedding_model = $2::text",
    "me.embedding_version = $3::text",
  ];
  const values: unknown[] = [
    serializeVectorLiteral(params.input.embedding),
    params.input.embeddingModel,
    params.input.embeddingVersion,
  ];

  if (params.input.projectId) {
    values.push(params.input.projectId);
    conditions.push(`p.project_id = $${values.length}::uuid`);
  }

  values.push(normalizeMemoryObjectSearchLimit(params.input.limit));

  const result = await params.client.query<SemanticProcedureSearchRow>(
    `
      with ranked as (
        select
          'procedure'::text as object_type,
          'validated_procedure_read_model'::text as read_surface,
          p.id::text as id,
          p.status::text as status,
          p.title,
          p.body,
          p.project_id::text as project_id,
          p.source_memory_object_id::text as source_memory_object_id,
          p.metadata->>'sourceCandidateId' as source_candidate_id,
          vr.id::text as latest_validation_run_id,
          vr.outcome::text as latest_validation_run_outcome,
          p.metadata,
          p.created_at::text as created_at,
          p.updated_at::text as updated_at,
          me.embedding_model,
          me.embedding_version,
          me.chunk_index,
          (me.embedding <=> $1::vector)::float8 as distance
        from ${proceduresTable} p
        inner join ${memoryEmbeddingsTable} me
          on me.memory_object_id = p.source_memory_object_id
        left join lateral (
          select id, outcome
          from ${procedureRunsTable}
          where procedure_id = p.id
          order by created_at desc
          limit 1
        ) vr on true
        where ${conditions.join("\n          and ")}
      ),
      deduped as (
        select distinct on (id)
          object_type,
          read_surface,
          id,
          status,
          title,
          body,
          project_id,
          source_memory_object_id,
          source_candidate_id,
          latest_validation_run_id,
          latest_validation_run_outcome,
          metadata,
          created_at,
          updated_at,
          embedding_model,
          embedding_version,
          chunk_index,
          distance
        from ranked
        order by id, distance asc, updated_at desc
      )
      select
        object_type,
        read_surface,
        id,
        status,
        title,
        body,
        project_id,
        source_memory_object_id,
        source_candidate_id,
        latest_validation_run_id,
        latest_validation_run_outcome,
        metadata,
        created_at,
        updated_at,
        embedding_model,
        embedding_version,
        chunk_index,
        distance,
        (1.0 / (1.0 + distance))::float8 as score,
        array['semantic_embedding']::text[] as matched_fields
      from deduped
      order by score desc, updated_at desc
      limit $${values.length}::int
    `,
    values,
  );

  return result.rows;
}
