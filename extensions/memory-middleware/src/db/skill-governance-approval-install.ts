import { Client } from "pg";
import type { PluginLogger } from "../../api.js";
import type { MemoryMiddlewareDbConfig } from "../config.js";
import {
  approvalScopeToPlanningTarget,
  approvalScopeToSkillCandidateStatus,
  buildSkillCandidateApprovalPlan,
  buildSkillCandidateInstallHandoffPlan,
} from "./governance-plan-builders.js";
import {
  type SkillCandidateApprovalPlanInput,
  type SkillCandidateApprovalPlanResult,
  type SkillCandidateApproveInput,
  type SkillCandidateApproveResult,
  type SkillCandidateApprovalScope,
  type SkillCandidateInstallHandoffInput,
  type SkillCandidateInstallHandoffResult,
  type SkillCandidateInstallRecordInput,
  type SkillCandidateInstallRecordResult,
  type SkillCandidateStatus,
} from "./runtime.js";
import {
  parseProcedureStatus,
  quoteQualifiedTable,
  toClientConfig,
  withConfiguredClient,
} from "./shared.js";

type LatestValidationRunOutcome = "passed" | "failed" | "partial" | "cancelled";

type SkillCandidateApprovalPlanTargetRow = {
  id: string;
  project_id: string;
  status: SkillCandidateStatus;
  source_procedure_id: string | null;
  source_procedure_status: string | null;
  source_candidate_id: string | null;
  promoted_from_review_id: string | null;
  source_event_id: string | null;
  validation_run_id: string | null;
  latest_validation_run_outcome: LatestValidationRunOutcome | null;
  procurement_record_id: string | null;
  procurement_record_payload: Record<string, unknown> | null;
  procurement_record_created_at: string | null;
  vetting_result_id: string | null;
  vetting_result_payload: Record<string, unknown> | null;
};

type SkillCandidateInstallHandoffTargetRow = SkillCandidateApprovalPlanTargetRow & {
  approval_record_id: string | null;
  approval_record_payload: Record<string, unknown> | null;
  approval_record_created_at: string | null;
};

type SkillCandidateApprovalRecordRow = {
  id: string;
  approved_scope: SkillCandidateApprovalScope | null;
};

type SkillCandidateInstallRecordRow = {
  id: string;
  installed_scope: SkillCandidateApprovalScope | null;
};

type PgErrorLike = Error & {
  code?: string;
  message: string;
};

function summarizeSkillCandidateApprovalPlanError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate approval planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateApprovalError(error: unknown): string {
  const pgError = error as PgErrorLike;

  switch (pgError.code) {
    case "23503":
      return "skill-candidate approval references missing provenance rows";
    case "23514":
      return "skill-candidate approval violated a memory middleware constraint";
    case "22P02":
      return "skill-candidate approval used an invalid identifier value";
    default:
      break;
  }

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate approval failed: ${pgError.message}`;
}

function summarizeSkillCandidateInstallHandoffError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate install handoff planning failed: ${pgError.message}`;
}

function summarizeSkillCandidateInstallRecordError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `skill-candidate install record creation failed: ${pgError.message}`;
}

async function selectSkillCandidateApprovalPlanTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateApprovalPlanTargetRow | undefined> {
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

  const result = await params.client.query<SkillCandidateApprovalPlanTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        procurement.id::text as procurement_record_id,
        procurement.payload as procurement_record_payload,
        to_char(procurement.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as procurement_record_created_at,
        vetting.id::text as vetting_result_id,
        vetting.payload as vetting_result_payload
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
      ) procurement on true
      left join lateral (
        select id, payload
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) vetting on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

async function selectSkillCandidateInstallHandoffTarget(params: {
  client: Client;
  schema: string;
  skillCandidateId: string;
}): Promise<SkillCandidateInstallHandoffTargetRow | undefined> {
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

  const result = await params.client.query<SkillCandidateInstallHandoffTargetRow>(
    `
      select
        sc.id::text as id,
        sc.project_id::text as project_id,
        sc.status::text as status,
        sc.source_procedure_id::text as source_procedure_id,
        p.status::text as source_procedure_status,
        sc.metadata->>'sourceCandidateId' as source_candidate_id,
        sc.metadata->>'promotedFromReviewId' as promoted_from_review_id,
        sc.metadata->>'sourceEventId' as source_event_id,
        sc.metadata->>'validationRunId' as validation_run_id,
        pr.outcome::text as latest_validation_run_outcome,
        procurement.id::text as procurement_record_id,
        procurement.payload as procurement_record_payload,
        to_char(procurement.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as procurement_record_created_at,
        vetting.id::text as vetting_result_id,
        vetting.payload as vetting_result_payload,
        approval.id::text as approval_record_id,
        approval.payload as approval_record_payload,
        to_char(approval.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as approval_record_created_at
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
      ) procurement on true
      left join lateral (
        select id, payload
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.vetting_result'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) vetting on true
      left join lateral (
        select id, payload, created_at
        from ${memoryEventsTable}
        where event_name = 'skill_candidate.approval'
          and metadata->>'skillCandidateId' = sc.id::text
        order by created_at desc, id desc
        limit 1
      ) approval on true
      where sc.id = $1::uuid
      limit 1
    `,
    [params.skillCandidateId],
  );

  return result.rows[0];
}

function buildApprovalPlanFromTarget(target: SkillCandidateApprovalPlanTargetRow) {
  return buildSkillCandidateApprovalPlan({
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
    ...(target.vetting_result_id ? { vettingResultId: target.vetting_result_id } : {}),
    ...(target.vetting_result_payload
      ? { vettingResultPayload: target.vetting_result_payload }
      : {}),
  });
}

function buildInstallHandoffFromTarget(target: SkillCandidateInstallHandoffTargetRow) {
  return buildSkillCandidateInstallHandoffPlan({
    skillCandidateId: target.id,
    skillCandidateStatus: target.status,
    ...(target.source_procedure_id ? { sourceProcedureId: target.source_procedure_id } : {}),
    ...(target.source_procedure_status
      ? { sourceProcedureStatus: parseProcedureStatus(target.source_procedure_status) }
      : {}),
    ...(target.source_candidate_id ? { sourceCandidateId: target.source_candidate_id } : {}),
    ...(target.validation_run_id ? { validationRunId: target.validation_run_id } : {}),
    ...(target.latest_validation_run_outcome
      ? { latestValidationRunOutcome: target.latest_validation_run_outcome }
      : {}),
    ...(target.procurement_record_id ? { procurementRecordId: target.procurement_record_id } : {}),
    ...(target.vetting_result_id ? { vettingResultRecordId: target.vetting_result_id } : {}),
    ...(target.approval_record_id ? { approvalRecordId: target.approval_record_id } : {}),
    ...(target.approval_record_created_at
      ? { approvalRecordCreatedAt: target.approval_record_created_at }
      : {}),
    ...(target.approval_record_payload
      ? { approvalRecordPayload: target.approval_record_payload }
      : {}),
  });
}

async function selectLatestApprovalRecord(params: {
  client: Client;
  memoryEventsTable: string;
  skillCandidateId: string;
}): Promise<SkillCandidateApprovalRecordRow | undefined> {
  const existingApproval = await params.client.query<SkillCandidateApprovalRecordRow>(
    `
      select
        id::text as id,
        payload->>'approvedScope' as approved_scope
      from ${params.memoryEventsTable}
      where event_name = 'skill_candidate.approval'
        and metadata->>'skillCandidateId' = $1
      order by created_at desc, id desc
      limit 1
    `,
    [params.skillCandidateId],
  );
  return existingApproval.rows[0];
}

async function selectLatestInstallRecord(params: {
  client: Client;
  memoryEventsTable: string;
  skillCandidateId: string;
}): Promise<SkillCandidateInstallRecordRow | undefined> {
  const existingInstallRecord = await params.client.query<SkillCandidateInstallRecordRow>(
    `
      select
        id::text as id,
        payload->>'installedScope' as installed_scope
      from ${params.memoryEventsTable}
      where event_name = 'skill_candidate.install_record'
        and metadata->>'skillCandidateId' = $1
      order by created_at desc, id desc
      limit 1
    `,
    [params.skillCandidateId],
  );
  return existingInstallRecord.rows[0];
}

export async function planSkillCandidateApprovalInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateApprovalPlanInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateApprovalPlanResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateApprovalPlanTarget({
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

    const plan = buildApprovalPlanFromTarget(target);

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate approval plan prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${String(plan.accepted && plan.eligible)}`,
      ].join(" "),
    );

    return plan;
  } catch (error) {
    const reason = summarizeSkillCandidateApprovalPlanError(error);
    params.logger.error(`memory-middleware skill-candidate approval plan failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function approveSkillCandidateInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateApproveInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateApproveResult> {
  const skillCandidatesTable = quoteQualifiedTable({
    schema: params.schema,
    table: "skill_candidates",
  });
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateApprovalPlanTarget({
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

    const plan = buildApprovalPlanFromTarget(target);

    if (!plan.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate approval plan could not be evaluated",
      };
    }

    const requiredTarget = approvalScopeToPlanningTarget(params.input.scope);
    const approvedStatus = approvalScopeToSkillCandidateStatus(params.input.scope);

    if (target.status === approvedStatus) {
      const existingApprovalRow = await selectLatestApprovalRecord({
        client,
        memoryEventsTable,
        skillCandidateId: params.input.skillCandidateId,
      });
      if (existingApprovalRow) {
        await client.query("commit");
        return {
          accepted: true,
          status: "already_approved",
          skillCandidateId: params.input.skillCandidateId,
          approvalRecordId: existingApprovalRow.id,
          approvedScope: existingApprovalRow.approved_scope === "normal" ? "normal" : "limited",
          skillCandidateStatus: approvedStatus,
          procurementRecordId: plan.procurementRecordId!,
          vettingResultRecordId: plan.vettingResultRecordId!,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
        };
      }
    }

    if (!plan.eligible || !plan.possibleTargets.includes(requiredTarget)) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: plan.rationale.join(" "),
      };
    }

    const existingApprovalRow = await selectLatestApprovalRecord({
      client,
      memoryEventsTable,
      skillCandidateId: params.input.skillCandidateId,
    });
    if (existingApprovalRow) {
      const existingScope = existingApprovalRow.approved_scope === "normal" ? "normal" : "limited";
      await client.query("commit");
      return {
        accepted: true,
        status: "already_approved",
        skillCandidateId: params.input.skillCandidateId,
        approvalRecordId: existingApprovalRow.id,
        approvedScope: existingScope,
        skillCandidateStatus: approvalScopeToSkillCandidateStatus(existingScope),
        procurementRecordId: plan.procurementRecordId!,
        vettingResultRecordId: plan.vettingResultRecordId!,
        ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
        ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
      };
    }

    const approvalInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.approval', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.approverAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-approve-tool",
          approvedScope: params.input.scope,
          procurementRecordId: plan.procurementRecordId,
          vettingResultRecordId: plan.vettingResultRecordId,
          installGuardrails: plan.installGuardrails,
          requiredGates: plan.requiredGates,
          remainingBlockers: plan.remainingBlockers,
          rationale: plan.rationale,
        }),
        JSON.stringify({
          source: "skill-candidate-approve-tool",
          skillCandidateId: params.input.skillCandidateId,
          approvedScope: params.input.scope,
          procurementRecordId: plan.procurementRecordId,
          vettingResultRecordId: plan.vettingResultRecordId,
          ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
          ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
          ...(params.input.approverAgentId
            ? { approverAgentId: params.input.approverAgentId }
            : {}),
          ...(params.input.rationale ? { approvalRationale: params.input.rationale } : {}),
          ...(params.input.metadata ? { approvalMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const approvalRecordId = approvalInsert.rows[0]?.id;
    if (!approvalRecordId) {
      throw new Error("skill-candidate approval did not return an approval record id");
    }

    await client.query(
      `
        update ${skillCandidatesTable}
        set
          status = $2,
          vetted_at = coalesce(vetted_at, now()),
          metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb
        where id = $1::uuid
      `,
      [
        params.input.skillCandidateId,
        approvedStatus,
        JSON.stringify({
          latestApprovalRecordId: approvalRecordId,
          latestApprovedScope: params.input.scope,
          latestApprovalProcurementRecordId: plan.procurementRecordId,
          latestApprovalVettingResultRecordId: plan.vettingResultRecordId,
          installGuardrails: plan.installGuardrails,
          ...(params.input.approverAgentId
            ? { latestApproverAgentId: params.input.approverAgentId }
            : {}),
        }),
      ],
    );

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate approval recorded",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `approvalRecordId=${approvalRecordId}`,
        `scope=${params.input.scope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "approved",
      skillCandidateId: params.input.skillCandidateId,
      approvalRecordId,
      approvedScope: params.input.scope,
      skillCandidateStatus: approvedStatus,
      procurementRecordId: plan.procurementRecordId!,
      vettingResultRecordId: plan.vettingResultRecordId!,
      ...(plan.sourceProcedureId ? { sourceProcedureId: plan.sourceProcedureId } : {}),
      ...(plan.sourceCandidateId ? { sourceCandidateId: plan.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateApprovalError(error);
    params.logger.error(
      `memory-middleware skill-candidate approval failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
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

export async function planSkillCandidateInstallHandoffInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateInstallHandoffInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateInstallHandoffResult> {
  try {
    const target = await withConfiguredClient({
      config: params.config,
      run: async (client) =>
        selectSkillCandidateInstallHandoffTarget({
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

    const handoff = buildInstallHandoffFromTarget(target);

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate install handoff prepared",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `eligible=${String(handoff.accepted && handoff.eligible)}`,
      ].join(" "),
    );

    return handoff;
  } catch (error) {
    const reason = summarizeSkillCandidateInstallHandoffError(error);
    params.logger.error(`memory-middleware skill-candidate install handoff failed: ${reason}`);
    return {
      accepted: false,
      status: "failed",
      reason,
    };
  }
}

export async function createSkillCandidateInstallRecordInConfiguredDatabase(params: {
  config: MemoryMiddlewareDbConfig;
  input: SkillCandidateInstallRecordInput;
  logger: PluginLogger;
  schema: string;
}): Promise<SkillCandidateInstallRecordResult> {
  const memoryEventsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_events",
  });

  const client = new Client(toClientConfig(params.config));

  try {
    await client.connect();
    await client.query("begin");

    const target = await selectSkillCandidateInstallHandoffTarget({
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

    const handoff = buildInstallHandoffFromTarget(target);

    if (!handoff.accepted) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "failed",
        reason: "skill-candidate install handoff plan could not be evaluated",
      };
    }

    if (
      !handoff.eligible ||
      !handoff.possibleTargets.includes("propose_manual_install_handoff") ||
      !handoff.approvedScope ||
      !handoff.approvalRecordId ||
      !handoff.procurementRecordId ||
      !handoff.vettingResultRecordId
    ) {
      await client.query("rollback");
      return {
        accepted: false,
        status: "ineligible",
        reason: handoff.rationale.join(" "),
      };
    }

    const existingInstallRecordRow = await selectLatestInstallRecord({
      client,
      memoryEventsTable,
      skillCandidateId: params.input.skillCandidateId,
    });
    if (existingInstallRecordRow) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_created",
        skillCandidateId: params.input.skillCandidateId,
        installRecordId: existingInstallRecordRow.id,
        installedScope:
          existingInstallRecordRow.installed_scope === "normal" ? "normal" : handoff.approvedScope,
        skillCandidateStatus:
          handoff.approvedScope === "normal" ? "approved_normal" : "approved_limited",
        approvalRecordId: handoff.approvalRecordId,
        procurementRecordId: handoff.procurementRecordId,
        vettingResultRecordId: handoff.vettingResultRecordId,
        ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
        ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
      };
    }

    const installRecordInsert = await client.query<{ id: string }>(
      `
        insert into ${memoryEventsTable} (
          project_id,
          agent_id,
          event_kind,
          event_name,
          payload,
          metadata
        )
        values ($1::uuid, $2::uuid, 'review', 'skill_candidate.install_record', $3::jsonb, $4::jsonb)
        returning id::text as id
      `,
      [
        target.project_id,
        params.input.installerAgentId ?? null,
        JSON.stringify({
          source: "skill-candidate-install-record-create-tool",
          installedScope: handoff.approvedScope,
          approvalRecordId: handoff.approvalRecordId,
          procurementRecordId: handoff.procurementRecordId,
          vettingResultRecordId: handoff.vettingResultRecordId,
          installGuardrails: handoff.installGuardrails,
          manualSteps: handoff.handoff?.manualSteps ?? [],
          requiredGates: handoff.requiredGates,
          remainingBlockers: handoff.remainingBlockers,
          rationale: handoff.rationale,
          ...(params.input.installNotes ? { installNotes: params.input.installNotes } : {}),
        }),
        JSON.stringify({
          source: "skill-candidate-install-record-create-tool",
          skillCandidateId: params.input.skillCandidateId,
          installedScope: handoff.approvedScope,
          approvalRecordId: handoff.approvalRecordId,
          procurementRecordId: handoff.procurementRecordId,
          vettingResultRecordId: handoff.vettingResultRecordId,
          ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
          ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
          ...(params.input.installerAgentId
            ? { installerAgentId: params.input.installerAgentId }
            : {}),
          ...(params.input.installNotes ? { installNotes: params.input.installNotes } : {}),
          ...(params.input.metadata ? { installMetadata: params.input.metadata } : {}),
        }),
      ],
    );
    const installRecordId = installRecordInsert.rows[0]?.id;
    if (!installRecordId) {
      throw new Error("skill-candidate install record creation did not return a record id");
    }

    await client.query("commit");

    params.logger.debug?.(
      [
        "memory-middleware skill-candidate install record created",
        `skillCandidateId=${params.input.skillCandidateId}`,
        `installRecordId=${installRecordId}`,
        `installedScope=${handoff.approvedScope}`,
      ].join(" "),
    );

    return {
      accepted: true,
      status: "created",
      skillCandidateId: params.input.skillCandidateId,
      installRecordId,
      installedScope: handoff.approvedScope,
      skillCandidateStatus:
        handoff.approvedScope === "normal" ? "approved_normal" : "approved_limited",
      approvalRecordId: handoff.approvalRecordId,
      procurementRecordId: handoff.procurementRecordId,
      vettingResultRecordId: handoff.vettingResultRecordId,
      ...(handoff.sourceProcedureId ? { sourceProcedureId: handoff.sourceProcedureId } : {}),
      ...(handoff.sourceCandidateId ? { sourceCandidateId: handoff.sourceCandidateId } : {}),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }

    const reason = summarizeSkillCandidateInstallRecordError(error);
    params.logger.error(
      `memory-middleware skill-candidate install record failed skillCandidateId=${params.input.skillCandidateId}: ${reason}`,
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
