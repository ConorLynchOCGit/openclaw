import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  normalizeConsolidationSelectionIds,
  normalizeMetadataString,
  planConsolidationInConfiguredDatabase,
} from "./maintenance-planning.js";
import type {
  ConsolidationExecuteAction,
  ConsolidationExecuteInput,
  ConsolidationExecuteResult,
  ConsolidationExecuteSelection,
  DriftCheckExecuteAction,
  DriftCheckExecuteInput,
  DriftCheckExecuteResult,
  DriftCheckExecuteSelection,
} from "./runtime.js";
import { quoteQualifiedTable, toClientConfig } from "./shared.js";

type ConsolidationExecutionMemoryRow = {
  id: string;
  project_id: string | null;
  memory_kind: "user" | "feedback" | "project" | "reference" | "procedure" | "policy";
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  metadata: Record<string, unknown> | null;
  created_at: string;
  superseded_at: string | null;
};

type DriftCheckExecutionProcedureRow = {
  id: string;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

function summarizeConsolidationExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown consolidation execution failure";
}

function normalizeConsolidationExecuteSelection(
  selection: ConsolidationExecuteSelection,
): ConsolidationExecuteSelection {
  return {
    actionType: selection.actionType,
    affectedObjectIds: normalizeConsolidationSelectionIds(selection.affectedObjectIds),
  };
}

function summarizeDriftCheckExecutionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown drift-check execution failure";
}

function normalizeDriftCheckExecuteSelection(
  selection: DriftCheckExecuteSelection,
): DriftCheckExecuteSelection {
  return {
    actionType: "drift_check_review",
    affectedObjectIds: normalizeConsolidationSelectionIds(selection.affectedObjectIds),
  };
}

async function selectConsolidationExecutionMemoryRows(params: {
  client: Client;
  schema: string;
  objectIds: string[];
}): Promise<ConsolidationExecutionMemoryRow[]> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const result = await params.client.query<ConsolidationExecutionMemoryRow>(
    `
      select
        id::text as id,
        project_id::text as project_id,
        memory_kind::text as memory_kind,
        review_state::text as review_state,
        metadata,
        created_at,
        superseded_at
      from ${memoryObjectsTable}
      where id = any($1::uuid[])
      order by created_at asc, id asc
    `,
    [params.objectIds],
  );
  return result.rows;
}

async function insertConsolidationSupersedeReview(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  reviewerAgentId?: string;
  rationale: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const result = await params.client.query<{ id: string }>(
    `
      insert into ${memoryReviewsTable} (
        memory_object_id,
        reviewer_agent_id,
        action,
        resulting_state,
        rationale,
        metadata
      )
      values ($1::uuid, $2::uuid, 'supersede', 'superseded', $3::text, $4::jsonb)
      returning id::text as id
    `,
    [
      params.memoryObjectId,
      params.reviewerAgentId ?? null,
      params.rationale,
      JSON.stringify(params.metadata),
    ],
  );
  const reviewId = result.rows[0]?.id;
  if (!reviewId) {
    throw new Error("consolidation execution did not return a review id");
  }
  return reviewId;
}

async function updateMemoryObjectToSuperseded(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  metadata: Record<string, unknown>;
  supersededAt: string;
}): Promise<void> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  await params.client.query(
    `
      update ${memoryObjectsTable}
      set
        review_state = 'superseded',
        superseded_at = coalesce(superseded_at, $2::timestamptz),
        metadata = metadata || $3::jsonb
      where id = $1::uuid
    `,
    [params.memoryObjectId, params.supersededAt, JSON.stringify(params.metadata)],
  );
}

async function ensureConsolidationSupersedesLink(params: {
  client: Client;
  schema: string;
  sourceMemoryObjectId: string;
  targetMemoryObjectId: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryLinksTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_links",
  });
  const existing = await params.client.query<{ id: string }>(
    `
      select id::text as id
      from ${memoryLinksTable}
      where source_memory_object_id = $1::uuid
        and target_memory_object_id = $2::uuid
        and link_kind = 'supersedes'
      limit 1
    `,
    [params.sourceMemoryObjectId, params.targetMemoryObjectId],
  );
  const existingId = existing.rows[0]?.id;
  if (existingId) {
    return existingId;
  }

  const inserted = await params.client.query<{ id: string }>(
    `
      insert into ${memoryLinksTable} (
        source_memory_object_id,
        target_memory_object_id,
        link_kind,
        metadata
      )
      values ($1::uuid, $2::uuid, 'supersedes', $3::jsonb)
      returning id::text as id
    `,
    [params.sourceMemoryObjectId, params.targetMemoryObjectId, JSON.stringify(params.metadata)],
  );
  const linkId = inserted.rows[0]?.id;
  if (!linkId) {
    throw new Error("consolidation execution did not return a memory link id");
  }
  return linkId;
}

function chooseCanonicalConsolidationSurvivor(
  rows: ConsolidationExecutionMemoryRow[],
): ConsolidationExecutionMemoryRow | undefined {
  return [...rows]
    .filter((row) => row.review_state === "approved")
    .sort((left, right) => {
      const createdAtDelta = Date.parse(left.created_at) - Date.parse(right.created_at);
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }
      return left.id.localeCompare(right.id);
    })[0];
}

async function executeDuplicateConsolidationSelection(params: {
  client: Client;
  schema: string;
  selection: ConsolidationExecuteSelection;
  reviewerAgentId?: string;
}): Promise<ConsolidationExecuteAction> {
  const rows = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: params.selection.affectedObjectIds,
  });

  if (rows.length !== params.selection.affectedObjectIds.length) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["duplicate execution requires all affected durable memory objects to exist"],
    };
  }

  if (rows.some((row) => row.memory_kind === "policy")) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["policy memory is out of scope for bounded consolidation execution"],
    };
  }

  const survivor = chooseCanonicalConsolidationSurvivor(rows);
  if (!survivor) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["duplicate execution requires at least one approved durable memory survivor"],
    };
  }

  const duplicates = rows.filter((row) => row.id !== survivor.id);
  const executableDuplicates = duplicates.filter(
    (row) => row.review_state === "approved" && row.superseded_at === null,
  );

  if (executableDuplicates.length === 0) {
    const duplicateRowsAlreadySuperseded =
      duplicates.length > 0 &&
      duplicates.every((row) => row.review_state === "superseded" || row.superseded_at !== null);
    return {
      actionType: params.selection.actionType,
      status: duplicateRowsAlreadySuperseded ? "already_executed" : "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: duplicates.map((row) => row.id).sort((a, b) => a.localeCompare(b)),
      survivorObjectId: survivor.id,
      reviewIds: [],
      linkIds: [],
      rationale: duplicateRowsAlreadySuperseded
        ? [
            "duplicate durable memory objects were already superseded in favor of the canonical survivor",
          ]
        : [
            "duplicate execution only supports approved durable memory objects that are not already superseded",
          ],
    };
  }

  const executedAt = new Date().toISOString();
  const supersededObjectIds: string[] = [];
  const reviewIds: string[] = [];
  const linkIds: string[] = [];

  for (const duplicate of executableDuplicates) {
    const reviewId = await insertConsolidationSupersedeReview({
      client: params.client,
      schema: params.schema,
      memoryObjectId: duplicate.id,
      reviewerAgentId: params.reviewerAgentId,
      rationale: "duplicate durable memory was superseded by bounded consolidation execution",
      metadata: {
        source: "memory-consolidation-execute-tool",
        actionType: "duplicate_merge_review",
        survivorObjectId: survivor.id,
        affectedObjectIds: params.selection.affectedObjectIds,
        executedAt,
      },
    });
    await updateMemoryObjectToSuperseded({
      client: params.client,
      schema: params.schema,
      memoryObjectId: duplicate.id,
      supersededAt: executedAt,
      metadata: {
        supersededByObjectId: survivor.id,
        lifecycleHint: "superseded",
        consolidationActionType: "duplicate_merge_review",
        consolidationExecutedAt: executedAt,
      },
    });
    const linkId = await ensureConsolidationSupersedesLink({
      client: params.client,
      schema: params.schema,
      sourceMemoryObjectId: duplicate.id,
      targetMemoryObjectId: survivor.id,
      metadata: {
        source: "memory-consolidation-execute-tool",
        actionType: "duplicate_merge_review",
        executedAt,
      },
    });
    supersededObjectIds.push(duplicate.id);
    reviewIds.push(reviewId);
    linkIds.push(linkId);
  }

  return {
    actionType: params.selection.actionType,
    status: "executed",
    affectedObjectIds: params.selection.affectedObjectIds,
    supersededObjectIds: supersededObjectIds.sort((a, b) => a.localeCompare(b)),
    survivorObjectId: survivor.id,
    reviewIds,
    linkIds,
    rationale: [
      "duplicate durable memory objects were conservatively superseded in favor of the canonical approved survivor",
    ],
  };
}

async function executeStaleSupersededConsolidationSelection(params: {
  client: Client;
  schema: string;
  selection: ConsolidationExecuteSelection;
  reviewerAgentId?: string;
}): Promise<ConsolidationExecuteAction> {
  if (params.selection.affectedObjectIds.length !== 1) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution currently supports exactly one durable memory object at a time",
      ],
    };
  }

  const sourceObjectId = params.selection.affectedObjectIds[0];
  const [sourceRow] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [sourceObjectId],
  });
  if (!sourceRow) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["stale or superseded execution requires the durable memory object to exist"],
    };
  }
  if (sourceRow.memory_kind === "policy") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: ["policy memory is out of scope for bounded consolidation execution"],
    };
  }

  const targetObjectId = normalizeMetadataString(
    sourceRow.metadata ?? undefined,
    "supersededByObjectId",
  );
  const targetProcedureId = normalizeMetadataString(
    sourceRow.metadata ?? undefined,
    "supersededByProcedureId",
  );
  if (!targetObjectId || targetProcedureId) {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution currently requires metadata.supersededByObjectId and does not auto-resolve procedure-target supersession",
      ],
    };
  }

  const [targetRow] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [targetObjectId],
  });
  if (!targetRow || targetRow.memory_kind === "policy" || targetRow.review_state !== "approved") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale: [
        "stale or superseded execution requires an existing approved durable memory target",
      ],
    };
  }

  if (sourceRow.review_state === "superseded" || sourceRow.superseded_at !== null) {
    return {
      actionType: params.selection.actionType,
      status:
        normalizeMetadataString(sourceRow.metadata ?? undefined, "supersededByObjectId") ===
        targetObjectId
          ? "already_executed"
          : "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [sourceObjectId],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale:
        normalizeMetadataString(sourceRow.metadata ?? undefined, "supersededByObjectId") ===
        targetObjectId
          ? ["stale durable memory was already superseded by the bounded target object"]
          : [
              "stale or superseded execution only supports approved durable memory that is not already superseded",
            ],
    };
  }

  if (sourceRow.review_state !== "approved") {
    return {
      actionType: params.selection.actionType,
      status: "skipped_ineligible",
      affectedObjectIds: params.selection.affectedObjectIds,
      supersededObjectIds: [],
      survivorObjectId: targetObjectId,
      reviewIds: [],
      linkIds: [],
      rationale: ["stale or superseded execution only supports approved durable memory objects"],
    };
  }

  const executedAt = new Date().toISOString();
  const reviewId = await insertConsolidationSupersedeReview({
    client: params.client,
    schema: params.schema,
    memoryObjectId: sourceObjectId,
    reviewerAgentId: params.reviewerAgentId,
    rationale: "stale durable memory was superseded by bounded consolidation execution",
    metadata: {
      source: "memory-consolidation-execute-tool",
      actionType: "stale_superseded_review",
      survivorObjectId: targetObjectId,
      affectedObjectIds: params.selection.affectedObjectIds,
      executedAt,
    },
  });
  await updateMemoryObjectToSuperseded({
    client: params.client,
    schema: params.schema,
    memoryObjectId: sourceObjectId,
    supersededAt: executedAt,
    metadata: {
      supersededByObjectId: targetObjectId,
      lifecycleHint: "superseded",
      consolidationActionType: "stale_superseded_review",
      consolidationExecutedAt: executedAt,
    },
  });
  const linkId = await ensureConsolidationSupersedesLink({
    client: params.client,
    schema: params.schema,
    sourceMemoryObjectId: sourceObjectId,
    targetMemoryObjectId: targetObjectId,
    metadata: {
      source: "memory-consolidation-execute-tool",
      actionType: "stale_superseded_review",
      executedAt,
    },
  });

  return {
    actionType: params.selection.actionType,
    status: "executed",
    affectedObjectIds: params.selection.affectedObjectIds,
    supersededObjectIds: [sourceObjectId],
    survivorObjectId: targetObjectId,
    reviewIds: [reviewId],
    linkIds: [linkId],
    rationale: [
      "stale durable memory was conservatively superseded using its existing bounded supersededByObjectId metadata",
    ],
  };
}

export async function executeConsolidationInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: ConsolidationExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<ConsolidationExecuteResult> {
  const executionMode = params.input.approvedFindings?.length
    ? "approved_subset"
    : "plan_all_eligible";
  const planResult = await planConsolidationInConfiguredDatabase({
    config: params.config,
    input: params.input,
    logger: params.logger,
    schema: params.schema,
  });

  if (!planResult.accepted) {
    if (planResult.status === "failed") {
      params.logger.error(`memory-middleware consolidation execution failed: ${planResult.reason}`);
    }
    return {
      accepted: false,
      status: planResult.status,
      reason: planResult.reason,
    };
  }

  const selectedFindings =
    executionMode === "approved_subset"
      ? params.input.approvedFindings!.map(normalizeConsolidationExecuteSelection)
      : planResult.findings.map((finding) =>
          normalizeConsolidationExecuteSelection({
            actionType: finding.actionType,
            affectedObjectIds: finding.affectedObjectIds,
          }),
        );

  if (selectedFindings.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      executionMode,
      reviewedFindingCount: 0,
      executedActionCount: 0,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
      actions: [],
      rationale: ["no bounded consolidation findings were selected for execution"],
    };
  }

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const actions: ConsolidationExecuteAction[] = [];

    for (const selection of selectedFindings) {
      switch (selection.actionType) {
        case "duplicate_merge_review":
          actions.push(
            await executeDuplicateConsolidationSelection({
              client,
              schema: params.schema,
              selection,
              reviewerAgentId: params.input.reviewerAgentId,
            }),
          );
          break;
        case "stale_superseded_review":
          actions.push(
            await executeStaleSupersededConsolidationSelection({
              client,
              schema: params.schema,
              selection,
              reviewerAgentId: params.input.reviewerAgentId,
            }),
          );
          break;
        case "contradiction_review":
        case "drift_check_review":
          actions.push({
            actionType: selection.actionType,
            status: "skipped_ineligible",
            affectedObjectIds: selection.affectedObjectIds,
            supersededObjectIds: [],
            reviewIds: [],
            linkIds: [],
            rationale: [
              `${selection.actionType} remains advisory-only in this bounded consolidation slice`,
            ],
          });
          break;
      }
    }

    const executedActionCount = actions.filter((action) => action.status === "executed").length;
    const alreadyExecutedCount = actions.filter(
      (action) => action.status === "already_executed",
    ).length;
    const skippedFindingCount = actions.filter(
      (action) => action.status === "skipped_ineligible",
    ).length;

    if (executedActionCount === 0) {
      await client.query("rollback");
      return {
        accepted: true,
        status:
          alreadyExecutedCount > 0 && skippedFindingCount === 0 ? "already_executed" : "no_op",
        executionMode,
        reviewedFindingCount: selectedFindings.length,
        executedActionCount,
        alreadyExecutedCount,
        skippedFindingCount,
        actions,
        rationale:
          alreadyExecutedCount > 0 && skippedFindingCount === 0
            ? [
                "selected consolidation findings had already been materialized by prior bounded execution",
              ]
            : ["selected consolidation findings were not eligible for bounded execution changes"],
      };
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware consolidation execution completed",
        `mode=${executionMode}`,
        `reviewedFindings=${String(selectedFindings.length)}`,
        `executedActions=${String(executedActionCount)}`,
        `alreadyExecuted=${String(alreadyExecutedCount)}`,
        `skipped=${String(skippedFindingCount)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "executed",
      executionMode,
      reviewedFindingCount: selectedFindings.length,
      executedActionCount,
      alreadyExecutedCount,
      skippedFindingCount,
      actions,
      rationale: [
        `${String(executedActionCount)} bounded consolidation action${executedActionCount === 1 ? "" : "s"} executed without touching contradiction or drift findings`,
      ],
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeConsolidationExecutionError(error);
    params.logger.error(`memory-middleware consolidation execution failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function selectDriftCheckExecutionProcedureRows(params: {
  client: Client;
  schema: string;
  procedureIds: string[];
}): Promise<DriftCheckExecutionProcedureRow[]> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const result = await params.client.query<DriftCheckExecutionProcedureRow>(
    `
      select
        id::text as id,
        project_id::text as project_id,
        metadata,
        updated_at
      from ${proceduresTable}
      where id = any($1::uuid[])
      order by id asc
    `,
    [params.procedureIds],
  );
  return result.rows;
}

async function insertDriftCheckExecutionEvent(params: {
  client: Client;
  schema: string;
  projectId?: string;
  reviewerAgentId?: string;
  eventName: "memory_object.drift_check" | "procedure.drift_check";
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });
  const result = await params.client.query<{ id: string }>(
    `
      insert into ${memoryEventsTable} (
        project_id,
        agent_id,
        event_kind,
        event_name,
        payload,
        metadata
      )
      values ($1::uuid, $2::uuid, 'review', $3::text, $4::jsonb, $5::jsonb)
      returning id::text as id
    `,
    [
      params.projectId ?? null,
      params.reviewerAgentId ?? null,
      params.eventName,
      JSON.stringify(params.payload),
      JSON.stringify(params.metadata),
    ],
  );
  const eventId = result.rows[0]?.id;
  if (!eventId) {
    throw new Error("drift-check execution did not return an event id");
  }
  return eventId;
}

async function updateMemoryObjectDriftMetadata(params: {
  client: Client;
  schema: string;
  memoryObjectId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  await params.client.query(
    `
      update ${memoryObjectsTable}
      set metadata = metadata || $2::jsonb
      where id = $1::uuid
    `,
    [params.memoryObjectId, JSON.stringify(params.metadata)],
  );
}

async function updateProcedureDriftMetadata(params: {
  client: Client;
  schema: string;
  procedureId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  await params.client.query(
    `
      update ${proceduresTable}
      set metadata = metadata || $2::jsonb
      where id = $1::uuid
    `,
    [params.procedureId, JSON.stringify(params.metadata)],
  );
}

async function executeMemoryObjectDriftCheckSelection(params: {
  client: Client;
  schema: string;
  objectId: string;
  reviewerAgentId?: string;
}): Promise<DriftCheckExecuteAction> {
  const [row] = await selectConsolidationExecutionMemoryRows({
    client: params.client,
    schema: params.schema,
    objectIds: [params.objectId],
  });
  if (!row) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires the durable memory object to exist"],
    };
  }
  if (row.memory_kind === "policy") {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["policy memory is out of scope for bounded drift-check execution"],
    };
  }

  const driftCheckDueAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckDueAt");
  if (!driftCheckDueAt) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires bounded driftCheckDueAt metadata"],
    };
  }

  const dueAt = Date.parse(driftCheckDueAt);
  if (!Number.isFinite(dueAt) || dueAt > Date.now()) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.objectId,
      affectedObjectType: "memory_object",
      driftCheckDueAt,
      rationale: ["drift-check execution requires an overdue bounded driftCheckDueAt timestamp"],
    };
  }

  const driftCheckedAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckedAt");
  if (driftCheckedAt) {
    const checkedAt = Date.parse(driftCheckedAt);
    if (Number.isFinite(checkedAt) && checkedAt >= dueAt) {
      return {
        actionType: "drift_check_review",
        status: "already_executed",
        affectedObjectId: params.objectId,
        affectedObjectType: "memory_object",
        driftCheckDueAt,
        driftCheckedAt,
        rationale: [
          "bounded drift-check metadata already records a check after the current due timestamp",
        ],
      };
    }
  }

  const executedAt = new Date().toISOString();
  const eventId = await insertDriftCheckExecutionEvent({
    client: params.client,
    schema: params.schema,
    projectId: row.project_id ?? undefined,
    reviewerAgentId: params.reviewerAgentId,
    eventName: "memory_object.drift_check",
    payload: {
      objectType: "memory_object",
      objectId: params.objectId,
      driftCheckDueAt,
      driftCheckedAt: executedAt,
      outcome: "review_recorded",
    },
    metadata: {
      source: "memory-drift-check-execute-tool",
      actionType: "drift_check_review",
    },
  });
  await updateMemoryObjectDriftMetadata({
    client: params.client,
    schema: params.schema,
    memoryObjectId: params.objectId,
    metadata: {
      driftCheckedAt: executedAt,
      driftCheckOutcome: "review_recorded",
      driftCheckEventId: eventId,
    },
  });

  return {
    actionType: "drift_check_review",
    status: "executed",
    affectedObjectId: params.objectId,
    affectedObjectType: "memory_object",
    driftCheckDueAt,
    driftCheckedAt: executedAt,
    eventId,
    rationale: ["overdue durable memory drift check was recorded without rewriting stored content"],
  };
}

async function executeProcedureDriftCheckSelection(params: {
  client: Client;
  schema: string;
  procedureId: string;
  reviewerAgentId?: string;
}): Promise<DriftCheckExecuteAction> {
  const [row] = await selectDriftCheckExecutionProcedureRows({
    client: params.client,
    schema: params.schema,
    procedureIds: [params.procedureId],
  });
  if (!row) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires the validated procedure to exist"],
    };
  }

  const driftCheckDueAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckDueAt");
  if (!driftCheckDueAt) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt: "",
      rationale: ["drift-check execution requires bounded driftCheckDueAt metadata"],
    };
  }

  const dueAt = Date.parse(driftCheckDueAt);
  if (!Number.isFinite(dueAt) || dueAt > Date.now()) {
    return {
      actionType: "drift_check_review",
      status: "skipped_ineligible",
      affectedObjectId: params.procedureId,
      affectedObjectType: "procedure",
      driftCheckDueAt,
      rationale: ["drift-check execution requires an overdue bounded driftCheckDueAt timestamp"],
    };
  }

  const driftCheckedAt = normalizeMetadataString(row.metadata ?? undefined, "driftCheckedAt");
  if (driftCheckedAt) {
    const checkedAt = Date.parse(driftCheckedAt);
    if (Number.isFinite(checkedAt) && checkedAt >= dueAt) {
      return {
        actionType: "drift_check_review",
        status: "already_executed",
        affectedObjectId: params.procedureId,
        affectedObjectType: "procedure",
        driftCheckDueAt,
        driftCheckedAt,
        rationale: [
          "bounded procedure drift-check metadata already records a check after the current due timestamp",
        ],
      };
    }
  }

  const executedAt = new Date().toISOString();
  const eventId = await insertDriftCheckExecutionEvent({
    client: params.client,
    schema: params.schema,
    projectId: row.project_id ?? undefined,
    reviewerAgentId: params.reviewerAgentId,
    eventName: "procedure.drift_check",
    payload: {
      objectType: "procedure",
      objectId: params.procedureId,
      driftCheckDueAt,
      driftCheckedAt: executedAt,
      outcome: "review_recorded",
    },
    metadata: {
      source: "memory-drift-check-execute-tool",
      actionType: "drift_check_review",
    },
  });
  await updateProcedureDriftMetadata({
    client: params.client,
    schema: params.schema,
    procedureId: params.procedureId,
    metadata: {
      driftCheckedAt: executedAt,
      driftCheckOutcome: "review_recorded",
      driftCheckEventId: eventId,
    },
  });

  return {
    actionType: "drift_check_review",
    status: "executed",
    affectedObjectId: params.procedureId,
    affectedObjectType: "procedure",
    driftCheckDueAt,
    driftCheckedAt: executedAt,
    eventId,
    rationale: [
      "overdue validated-procedure drift check was recorded without rewriting stored procedure content",
    ],
  };
}

export async function executeDriftCheckInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: DriftCheckExecuteInput;
  logger: PluginLogger;
  schema: string;
}): Promise<DriftCheckExecuteResult> {
  const executionMode = params.input.approvedFindings?.length
    ? "approved_subset"
    : "plan_all_eligible";
  const planResult = await planConsolidationInConfiguredDatabase({
    config: params.config,
    input: params.input,
    logger: params.logger,
    schema: params.schema,
  });

  if (!planResult.accepted) {
    if (planResult.status === "failed") {
      params.logger.error(`memory-middleware drift-check execution failed: ${planResult.reason}`);
    }
    return {
      accepted: false,
      status: planResult.status,
      reason: planResult.reason,
    };
  }

  const selectedFindings =
    executionMode === "approved_subset"
      ? params.input.approvedFindings!.map(normalizeDriftCheckExecuteSelection)
      : planResult.findings
          .filter((finding) => finding.actionType === "drift_check_review")
          .map((finding) =>
            normalizeDriftCheckExecuteSelection({
              actionType: "drift_check_review",
              affectedObjectIds: finding.affectedObjectIds,
            }),
          );

  if (selectedFindings.length === 0) {
    return {
      accepted: true,
      status: "no_op",
      executionMode,
      reviewedFindingCount: 0,
      executedActionCount: 0,
      alreadyExecutedCount: 0,
      skippedFindingCount: 0,
      actions: [],
      rationale: ["no bounded drift-check findings were selected for execution"],
    };
  }

  const client = new Client(toClientConfig(params.config));
  try {
    await client.connect();
    await client.query("begin");

    const actions: DriftCheckExecuteAction[] = [];
    for (const selection of selectedFindings) {
      if (selection.affectedObjectIds.length !== 1) {
        actions.push({
          actionType: "drift_check_review",
          status: "skipped_ineligible",
          affectedObjectId: selection.affectedObjectIds[0] ?? "",
          affectedObjectType: "memory_object",
          driftCheckDueAt: "",
          rationale: [
            "bounded drift-check execution currently supports exactly one object id per finding",
          ],
        });
        continue;
      }

      const targetId = selection.affectedObjectIds[0];
      const memoryRows = await selectConsolidationExecutionMemoryRows({
        client,
        schema: params.schema,
        objectIds: [targetId],
      });
      if (memoryRows.length > 0) {
        actions.push(
          await executeMemoryObjectDriftCheckSelection({
            client,
            schema: params.schema,
            objectId: targetId,
            reviewerAgentId: params.input.reviewerAgentId,
          }),
        );
        continue;
      }

      actions.push(
        await executeProcedureDriftCheckSelection({
          client,
          schema: params.schema,
          procedureId: targetId,
          reviewerAgentId: params.input.reviewerAgentId,
        }),
      );
    }

    const executedActionCount = actions.filter((action) => action.status === "executed").length;
    const alreadyExecutedCount = actions.filter(
      (action) => action.status === "already_executed",
    ).length;
    const skippedFindingCount = actions.filter(
      (action) => action.status === "skipped_ineligible",
    ).length;

    if (executedActionCount === 0) {
      await client.query("rollback");
      return {
        accepted: true,
        status:
          alreadyExecutedCount > 0 && skippedFindingCount === 0 ? "already_executed" : "no_op",
        executionMode,
        reviewedFindingCount: selectedFindings.length,
        executedActionCount,
        alreadyExecutedCount,
        skippedFindingCount,
        actions,
        rationale:
          alreadyExecutedCount > 0 && skippedFindingCount === 0
            ? [
                "selected drift-check findings had already been materialized by prior bounded execution",
              ]
            : ["selected drift-check findings were not eligible for bounded execution changes"],
      };
    }

    await client.query("commit");
    params.logger.debug?.(
      [
        "memory-middleware drift-check execution completed",
        `mode=${executionMode}`,
        `reviewedFindings=${String(selectedFindings.length)}`,
        `executedActions=${String(executedActionCount)}`,
        `alreadyExecuted=${String(alreadyExecutedCount)}`,
        `skipped=${String(skippedFindingCount)}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "executed",
      executionMode,
      reviewedFindingCount: selectedFindings.length,
      executedActionCount,
      alreadyExecutedCount,
      skippedFindingCount,
      actions,
      rationale: [
        `${String(executedActionCount)} bounded drift-check action${executedActionCount === 1 ? "" : "s"} recorded without rewriting stored facts`,
      ],
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeDriftCheckExecutionError(error);
    params.logger.error(`memory-middleware drift-check execution failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
