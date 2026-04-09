import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  buildSkillCandidatePlan,
  buildSkillCandidateProcurementPlan,
  buildSkillCandidateSkillVetterHandoffPlan,
} from "./governance-plan-builders.js";
import type {
  CandidateReviewOutcome,
  ProcedureStatus,
  SkillCandidateCreateInput,
  SkillCandidateCreateResult,
  SkillCandidatePlanInput,
  SkillCandidatePlanResult,
  SkillCandidateProcurementPlanInput,
  SkillCandidateProcurementPlanResult,
  SkillCandidateProcurementRecordInput,
  SkillCandidateProcurementRecordResult,
  SkillCandidateSkillVetterHandoffInput,
  SkillCandidateSkillVetterHandoffResult,
  SkillCandidateStatus,
  SkillCandidateVettingResultInput,
  SkillCandidateVettingResultRecordResult,
} from "./runtime.js";
import {
  parseProcedureStatus,
  quoteQualifiedTable,
  toClientConfig,
  withConfiguredClient,
} from "./shared.js";

type ProcedureValidationPlanTargetRow = {
  id: string;
  project_id: string | null;
  status: ProcedureStatus;
  title: string;
  body: string;
  source_memory_object_id: string | null;
  promoted_from_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  source_candidate_kind: string | null;
  source_candidate_review_state:
    | "candidate"
    | "approved"
    | "corrected"
    | "rejected"
    | "superseded"
    | null;
  latest_candidate_review_id: string | null;
  latest_candidate_review_outcome: CandidateReviewOutcome | null;
  latest_validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
};

type SkillCandidateRow = {
  id: string;
  status: SkillCandidateStatus;
};

type SkillCandidateProcurementTargetRow = {
  id: string;
  project_id: string | null;
  status: SkillCandidateStatus;
  name: string;
  summary: string;
  source_procedure_id: string | null;
  source_procedure_status: ProcedureStatus | null;
  source_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
};

type SkillCandidateSkillVetterHandoffTargetRow = {
  id: string;
  project_id: string | null;
  status: SkillCandidateStatus;
  name: string;
  summary: string;
  source_procedure_id: string | null;
  source_procedure_status: ProcedureStatus | null;
  source_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | "failed" | "partial" | "cancelled" | null;
  procurement_record_id: string | null;
  procurement_record_payload: Record<string, unknown> | null;
  procurement_record_created_at: string | null;
};

type PgErrorLike = Error & {
  code?: string;
};

function summarizeSkillCandidatePlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateCreateError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate creation references missing procedure provenance rows";
    case "23514":
      return "skill-candidate creation violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate creation used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate creation failed: ${pgError.message}`;
}

function summarizeSkillCandidateProcurementPlanningError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate procurement planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateProcurementRecordError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate procurement record references missing provenance rows";
    case "23514":
      return "skill-candidate procurement record violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate procurement record used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate procurement record failed: ${pgError.message}`;
}

function summarizeSkillCandidateSkillVetterHandoffError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate Skill Vetter handoff planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateVettingResultError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate vetting result references missing provenance rows";
    case "23514":
      return "skill-candidate vetting result violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate vetting result used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate vetting result failed: ${pgError.message}`;
}

function buildSkillCandidatePlanFromProcedureTarget(target: ProcedureValidationPlanTargetRow) {
  const sourceCandidateId =
    target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
  return buildSkillCandidatePlan({
    procedureId: target.id,
    procedureStatus: parseProcedureStatus(target.status),
    ...(sourceCandidateId ? { sourceCandidateId } : {}),
    ...(target.latest_validation_run_outcome
      ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
      : {}),
    hasValidationRun: Boolean(target.latest_validation_run_id),
    hasPromotedReviewProvenance: Boolean(target.promoted_from_review_id),
    hasSourceEventProvenance: Boolean(target.source_event_id),
  });
}

function buildSkillCandidateProcurementPlanFromTarget(target: SkillCandidateProcurementTargetRow) {
  return buildSkillCandidateProcurementPlan({
    skillCandidateId: target.id,
    skillCandidateStatus: target.status,
    name: target.name,
    summary: target.summary,
    ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
    ...(target.source_procedure_status
      ? { sourceProcedureStatus: target.source_procedure_status }
      : {}),
    ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
    ...(target.promoted_from_review_id
      ? { promotedFromReviewId: target.promoted_from_review_id }
      : {}),
    ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
    ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
    ...(target.latest_validation_run_outcome
      ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
      : {}),
  });
}

function buildSkillVetterHandoffPlanFromTarget(target: SkillCandidateSkillVetterHandoffTargetRow) {
  return buildSkillCandidateSkillVetterHandoffPlan({
    skillCandidateId: target.id,
    skillCandidateStatus: target.status,
    ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
    ...(target.source_procedure_status
      ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
      : {}),
    ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
    ...(target.promoted_from_review_id
      ? { promotedFromReviewId: target.promoted_from_review_id }
      : {}),
    ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
    ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
    ...(target.latest_validation_run_outcome
      ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
      : {}),
    ...(target.procurement_record_id ? { procurementRecordId: target.procurement_record_id } : {}),
    ...(target.procurement_record_payload
      ? { procurementRecordPayload: target.procurement_record_payload }
      : {}),
    ...(target.procurement_record_created_at
      ? { procurementRecordCreatedAt: target.procurement_record_created_at }
      : {}),
  });
}

export async function selectProcedureValidationPlanTarget(params: {
  client: Client;
  schema: string;
  procedureId: string;
}): Promise<ProcedureValidationPlanTargetRow | undefined> {
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });

  const result = await params.client.query<ProcedureValidationPlanTargetRow>(
    `
      select
        p.id::text as id,
        p.project_id::text as project_id,
        p.status::text as status,
        p.title,
        p.body,
        p.source_memory_object_id::text as source_memory_object_id,
        p.metadata->>'promotedFromCandidateId' as promoted_from_candidate_id,
        p.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        p.metadata->>'sourceEventId' as source_event_id,
        mo.metadata->>'submissionKind' as source_candidate_kind,
        mo.review_state as source_candidate_review_state,
        mr.id::text as latest_candidate_review_id,
        case
          when mr.action = 'approve' then 'accepted'
          when mr.action = 'reject' then 'rejected'
          when mr.action = 'correct' then 'needs_revision'
          else null
        end as latest_candidate_review_outcome,
        pr.id::text as latest_validation_run_id,
        pr.outcome::text as latest_validation_run_outcome
      from ${proceduresTable} p
      left join ${memoryObjectsTable} mo
        on mo.id = p.source_memory_object_id
      left join lateral (
        select id, action
        from ${memoryReviewsTable}
        where memory_object_id = p.source_memory_object_id
        order by created_at desc, id desc
        limit 1
      ) mr on true
      left join lateral (
        select id, outcome
        from ${procedureRunsTable}
        where procedure_id = p.id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      where p.id = $1::uuid
      limit 1
    `,
    [params.procedureId],
  );

  return result.rows[0];
}

async function selectSkillCandidateProcurementTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateProcurementTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });

  const result = await params.client.query<SkillCandidateProcurementTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function selectSkillCandidateSkillVetterHandoffTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateSkillVetterHandoffTargetRow | undefined> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const proceduresTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedures",
  });
  const procedureRunsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "procedure_runs",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const result = await params.client.query<SkillCandidateSkillVetterHandoffTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.name,
        sc.summary,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        me.id::text as procurement_record_id,
        me.payload as procurement_record_payload,
        to_char(me.created_at at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as procurement_record_created_at
      from ${skillCandidatesTable} sc
      left join ${proceduresTable} p
        on p.id = sc.source_procedure_id
      left join lateral (
        select outcome
        from ${procedureRunsTable}
        where procedure_id = sc.source_procedure_id
        order by created_at desc, id desc
        limit 1
      ) pr on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) me on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

export async function planSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidatePlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidatePlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectProcedureValidationPlanTarget({
          client,
          schema: params.schema,
          procedureId: params.input.procedureId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const plan = buildSkillCandidatePlanFromProcedureTarget(target);

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate plan prepared",
        `procedureId=${params.input.procedureId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidatePlanningError(error);
    params.logger.error(`memory-middleware skill-candidate plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function createSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateCreateInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateCreateResult> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectProcedureValidationPlanTarget({
      client,
      schema: params.schema,
      procedureId: params.input.procedureId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "procedure not found",
      };
    }

    const sourceCandidateId =
      target.source_memory_object_id ?? target.promoted_from_candidate_id ?? undefined;
    const plan = buildSkillCandidatePlanFromProcedureTarget(target);

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_skill_candidate") || !plan.eligible) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingSkillCandidate = await client.query<SkillCandidateRow>(
      `
        select
          id::text as id,
          status::text as status
        from ${skillCandidatesTable}
        where source_procedure_id = $1::uuid
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.procedureId],
    );
    const existingRow = existingSkillCandidate.rows[0];
    if (existingRow) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        procedureId: params.input.procedureId,
        skillCandidateId: existingRow.id,
        skillCandidateStatus: existingRow.status,
        ...(sourceCandidateId ? { sourceCandidateId } : {}),
      };
    }

    const name = params.input.name?.trim() || target.title;
    const summary = params.input.summary?.trim() || target.body;
    const insertResult = await client.query<{ id: string }>(
      `
        insert into ${skillCandidatesTable} (
          project_id,
          source_procedure_id,
          status,
          name,
          summary,
          metadata
        )
        values ($1::uuid, $2::uuid, 'candidate', $3, $4, $5::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.procedureId,
        name,
        summary,
        JSON.stringify({
          source: "skill-candidate-create-tool",
          createdFromProcedureId: params.input.procedureId,
          ...(sourceCandidateId ? { sourceCandidateId } : {}),
          ...(target.promoted_from_review_id
            ? { promotedFromReviewId: target.promoted_from_review_id }
            : {}),
          ...(target.source_event_id ? { sourceEventId: target.source_event_id } : {}),
          ...(target.latest_validation_run_id
            ? { validationRunId: target.latest_validation_run_id }
            : {}),
          ...(params.input.creatorAgentId ? { creatorAgentId: params.input.creatorAgentId } : {}),
          ...(params.input.rationale ? { creationRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { skillCandidateMetadata: params.input.metadata } : {}),
        }),
      ],
    );

    const skillCandidateId = insertResult.rows[0]?.id;
    if (!skillCandidateId) {
      throw new Error("skill-candidate creation did not return a skill candidate id");
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate creation recorded",
        `procedureId=${params.input.procedureId}`,
        `skillCandidateId=${skillCandidateId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      procedureId: params.input.procedureId,
      skillCandidateId,
      skillCandidateStatus: "candidate",
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateCreateError(error);
    params.logger.error(
      `memory-middleware skill-candidate creation failed procedureId=${params.input.procedureId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function planSkillCandidateProcurementInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateProcurementPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateProcurementPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateProcurementTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateProcurementPlanFromTarget(target);

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate procurement plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateProcurementPlanningError(error);
    params.logger.error(`memory-middleware skill-candidate procurement plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function createSkillCandidateProcurementRecordInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateProcurementRecordInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateProcurementRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateProcurementTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillCandidateProcurementPlanFromTarget(target);

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate procurement plan could not be evaluated",
      };
    }

    if (!plan.possibleTargets.includes("propose_procurement_handoff") || !plan.eligible) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingRecord = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.procurement_record'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingRecordId = existingRecord.rows[0]?.id;
    if (existingRecordId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        procurementRecordId: existingRecordId,
        skillCandidateStatus: target.status,
        ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
        ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
      };
    }

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.procurement_record', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.recorderAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-procurement-record-tool",
          handoff: plan.handoff,
          rationale: plan.rationale,
          requiredGates: plan.requiredGates,
        }),
        JSON.stringify({
          source: "skill-candidate-procurement-record-tool",
          skillCandidateId: params.input.skillCandidateId,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
          ...(params.input.recorderAgentId
            ? { recorderAgentId: params.input.recorderAgentId }
            : {}),
          ...(params.input.rationale ? { recordRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { procurementRecordMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const procurementRecordId = eventInsert.rows[0]?.id;
    if (!procurementRecordId) {
      throw new Error(
        "skill-candidate procurement record creation did not return a procurement record id",
      );
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate procurement record created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `procurementRecordId=${procurementRecordId}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      procurementRecordId,
      skillCandidateStatus: target.status,
      ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
      ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateProcurementRecordError(error);
    params.logger.error(
      `memory-middleware skill-candidate procurement record failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function planSkillCandidateSkillVetterHandoffInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateSkillVetterHandoffInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateSkillVetterHandoffResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateSkillVetterHandoffTarget({
          client,
          schema: params.schema,
          skillCandidateId: params.input.skillCandidateId,
        }),
    });

    if (!target) {
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const plan = buildSkillVetterHandoffPlanFromTarget(target);

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate Skill Vetter handoff plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${plan.accepted ? String(plan.eligible) : "false"}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateSkillVetterHandoffError(error);
    params.logger.error(
      `memory-middleware skill-candidate Skill Vetter handoff plan failed: ${reason}`,
    );
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function createSkillCandidateVettingResultInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateVettingResultInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateVettingResultRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateSkillVetterHandoffTarget({
      client,
      schema: params.schema,
      skillCandidateId: params.input.skillCandidateId,
    });

    if (!target) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "not_found",
        reason: "skill candidate not found",
      };
    }

    const handoffPlan = buildSkillVetterHandoffPlanFromTarget(target);

    if (!handoffPlan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate Skill Vetter handoff plan could not be evaluated",
      };
    }

    if (
      !handoffPlan.possibleTargets.includes("propose_skill_vetter_handoff") ||
      !handoffPlan.eligible
    ) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: handoffPlan.rationale.join(" "),
      };
    }

    const procurementRecordId = handoffPlan.procurementRecordId;
    const handoff = handoffPlan.handoff;
    if (!procurementRecordId || !handoff) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: "manual Skill Vetter handoff package is incomplete",
      };
    }

    const existingRecord = await client.query<{ id: string; decision: string | null }>(
      `
        select id::text as id, payload->>'decision' as decision
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = $1
        order by created_at desc, id desc
        limit 1
      `,
      [params.input.skillCandidateId],
    );
    const existingRecordId = existingRecord.rows[0]?.id;
    if (existingRecordId) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        procurementRecordId,
        vettingResultRecordId: existingRecordId,
        decision:
          existingRecord.rows[0]?.decision === "reject" ||
          existingRecord.rows[0]?.decision === "defer" ||
          existingRecord.rows[0]?.decision === "approve_limited" ||
          existingRecord.rows[0]?.decision === "approve_normal"
            ? existingRecord.rows[0].decision
            : params.input.decision,
        skillCandidateStatus: target.status,
        ...(handoffPlan.sourceProcedureId
          ? { sourceProcedureId: handoffPlan.sourceProcedureId }
          : {}),
        ...(handoffPlan.sourceCandidateId
          ? { sourceCandidateId: handoffPlan.sourceCandidateId }
          : {}),
      };
    }

    const eventInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.vetting_result', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.reviewerAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-vetting-result-tool",
          procurementRecordId,
          handoff,
          decision: params.input.decision,
          ...(params.input.summary ? { summary: params.input.summary } : {}),
          result: {
            permissionsRisk: params.input.permissionsRisk,
            suspiciousPatterns: params.input.suspiciousPatterns,
            operationalFit: params.input.operationalFit,
            approvalRecommendation: params.input.approvalRecommendation,
          },
          requiredGates: handoffPlan.requiredGates,
        }),
        JSON.stringify({
          source: "skill-candidate-vetting-result-tool",
          skillCandidateId: params.input.skillCandidateId,
          procurementRecordId,
          vettingDecision: params.input.decision,
          ...(handoffPlan.sourceProcedureId
            ? { sourceProcedureId: handoffPlan.sourceProcedureId }
            : {}),
          ...(handoffPlan.sourceCandidateId
            ? { sourceCandidateId: handoffPlan.sourceCandidateId }
            : {}),
          ...(params.input.reviewerAgentId
            ? { reviewerAgentId: params.input.reviewerAgentId }
            : {}),
          ...(params.input.summary ? { vettingSummary: params.input.summary } : {}),
          ...(params.input.metadata ? { vettingResultMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const vettingResultRecordId = eventInsert.rows[0]?.id;
    if (!vettingResultRecordId) {
      throw new Error(
        "skill-candidate vetting result creation did not return a vetting-result record id",
      );
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate vetting result created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `vettingResultRecordId=${vettingResultRecordId}`,
        `decision=${params.input.decision}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      procurementRecordId,
      vettingResultRecordId,
      decision: params.input.decision,
      skillCandidateStatus: target.status,
      ...(handoffPlan.sourceProcedureId
        ? { sourceProcedureId: handoffPlan.sourceProcedureId }
        : {}),
      ...(handoffPlan.sourceCandidateId
        ? { sourceCandidateId: handoffPlan.sourceCandidateId }
        : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateVettingResultError(error);
    params.logger.error(
      `memory-middleware skill-candidate vetting result failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
    );

    return {
      accepted: false,
      status: "failed",
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
