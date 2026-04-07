import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import {
  extractCandidateConfirmationState,
  extractCandidateExpiresAt,
  isExpiredPendingClusteredMemoryCandidate,
  quoteQualifiedTable,
  summarizeClusteredLifecycleError,
} from "./clustered-memory-lifecycle.js";
import type { MemoryMiddlewareConfig } from "./config.js";

type ProcedureCandidateLifecycleRow = {
  id: string;
  source_event_id: string | null;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_key: string | null;
  resolved_subject_key: string | null;
};

type ValidatedProcedureLifecycleRow = {
  id: string;
  status: "validated" | "superseded" | "draft" | "rejected" | "archived";
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_key: string | null;
  resolved_subject_key: string | null;
};

export type RecurringProcedurePendingCandidate = {
  id: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmationState?: string;
};

export type RecurringProcedureLifecycleInspection = {
  matchingValidatedProcedureId?: string;
  pendingCandidate?: RecurringProcedurePendingCandidate;
  activeValidatedSubjectProcedureIds: string[];
  pendingSubjectCandidateIds: string[];
};

export type RecurringProcedureSupersedeResult =
  | {
      accepted: true;
      status: "superseded" | "already_superseded";
      supersededProcedureIds: string[];
    }
  | {
      accepted: false;
      status: "not_configured" | "failed";
      reason: string;
    };

export function isExpiredPendingRecurringProcedureCandidate(
  candidate: RecurringProcedurePendingCandidate,
  now = new Date(),
): boolean {
  return isExpiredPendingClusteredMemoryCandidate(candidate, now);
}

export async function inspectRecurringProcedureLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  logger?: PluginLogger;
}): Promise<RecurringProcedureLifecycleInspection | null> {
  if (!params.config.database.url) {
    return null;
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = quoteQualifiedTable({ schema, table: "memory_objects" });
  const proceduresTable = quoteQualifiedTable({ schema, table: "procedures" });
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();

    const candidateResult = await client.query<ProcedureCandidateLifecycleRow>(
      `
        select
          id::text as id,
          source_event_id::text as source_event_id,
          review_state::text as review_state,
          metadata,
          created_at::text as created_at,
          updated_at::text as updated_at,
          coalesce(
            metadata->'autoCapture'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key',
            metadata->'promotionMetadata'->'autoPromotion'->>'key'
          ) as resolved_key,
          coalesce(
            metadata->'autoCapture'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey'
          ) as resolved_subject_key
        from ${memoryObjectsTable}
        where memory_kind = 'procedure'
          and (
            coalesce(
              metadata->'autoCapture'->>'key',
              metadata->'candidateMetadata'->'autoCapture'->>'key',
              metadata->'promotionMetadata'->'autoPromotion'->>'key'
            ) = $1::text
            or coalesce(
              metadata->'autoCapture'->>'subjectKey',
              metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
              metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey'
            ) = $2::text
          )
        order by created_at desc, id desc
      `,
      [params.key, params.subjectKey],
    );

    const procedureResult = await client.query<ValidatedProcedureLifecycleRow>(
      `
        select
          id::text as id,
          status::text as status,
          metadata,
          created_at::text as created_at,
          updated_at::text as updated_at,
          coalesce(
            metadata->'autoPromotion'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key',
            metadata->'promotionMetadata'->'autoPromotion'->>'key'
          ) as resolved_key,
          coalesce(
            metadata->'autoPromotion'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey'
          ) as resolved_subject_key
        from ${proceduresTable}
        where (
          coalesce(
            metadata->'autoPromotion'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key',
            metadata->'promotionMetadata'->'autoPromotion'->>'key'
          ) = $1::text
          or coalesce(
            metadata->'autoPromotion'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey'
          ) = $2::text
        )
        order by created_at desc, id desc
      `,
      [params.key, params.subjectKey],
    );

    const candidateRows = candidateResult.rows;
    const procedureRows = procedureResult.rows;
    const pendingCandidateRow = candidateRows.find(
      (row) =>
        row.resolved_key === params.key &&
        row.review_state === "candidate" &&
        (extractCandidateConfirmationState(row.metadata ?? undefined) === "pending_confirmation" ||
          extractCandidateConfirmationState(row.metadata ?? undefined) ===
            "hold_for_more_evidence"),
    );

    return {
      ...(procedureRows.find((row) => row.resolved_key === params.key && row.status === "validated")
        ?.id
        ? {
            matchingValidatedProcedureId: procedureRows.find(
              (row) => row.resolved_key === params.key && row.status === "validated",
            )?.id,
          }
        : {}),
      ...(pendingCandidateRow
        ? {
            pendingCandidate: {
              id: pendingCandidateRow.id,
              ...(pendingCandidateRow.source_event_id
                ? { sourceEventId: pendingCandidateRow.source_event_id }
                : {}),
              createdAt: pendingCandidateRow.created_at,
              updatedAt: pendingCandidateRow.updated_at,
              ...(extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined)
                ? {
                    expiresAt: extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined),
                  }
                : {}),
              ...(extractCandidateConfirmationState(pendingCandidateRow.metadata ?? undefined)
                ? {
                    confirmationState: extractCandidateConfirmationState(
                      pendingCandidateRow.metadata ?? undefined,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      activeValidatedSubjectProcedureIds: procedureRows
        .filter(
          (row) => row.resolved_subject_key === params.subjectKey && row.status === "validated",
        )
        .map((row) => row.id),
      pendingSubjectCandidateIds: candidateRows
        .filter(
          (row) =>
            row.resolved_subject_key === params.subjectKey && row.review_state === "candidate",
        )
        .map((row) => row.id),
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware recurring-procedure lifecycle inspection failed ${JSON.stringify({
        error: summarizeClusteredLifecycleError("recurring-procedure", error),
        key: params.key,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function supersedeValidatedProceduresBySubjectKey(params: {
  config: MemoryMiddlewareConfig;
  subjectKey: string;
  supersededByProcedureId: string;
  metadata?: Record<string, unknown>;
}): Promise<RecurringProcedureSupersedeResult> {
  if (!params.config.database.url) {
    return {
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    };
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const proceduresTable = quoteQualifiedTable({ schema, table: "procedures" });
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    await client.query("begin");

    const targets = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${proceduresTable}
        where status = 'validated'
          and id <> $2::uuid
          and coalesce(
            metadata->'autoPromotion'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey'
          ) = $1::text
        order by created_at desc, id desc
      `,
      [params.subjectKey, params.supersededByProcedureId],
    );

    if (targets.rows.length === 0) {
      await client.query("commit");
      return {
        accepted: true,
        status: "already_superseded",
        supersededProcedureIds: [],
      };
    }

    const supersededAt = new Date().toISOString();
    const supersededIds = targets.rows.map((row) => row.id);
    await client.query(
      `
        update ${proceduresTable}
        set
          status = 'superseded',
          updated_at = now(),
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'supersededAt', $2::text,
              'supersededByProcedureId', $3::text,
              'supersedeMetadata', $4::jsonb
            )
        where id = any($1::uuid[])
      `,
      [
        supersededIds,
        supersededAt,
        params.supersededByProcedureId,
        JSON.stringify(params.metadata ?? {}),
      ],
    );

    await client.query("commit");
    return {
      accepted: true,
      status: "superseded",
      supersededProcedureIds: supersededIds,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    return {
      accepted: false,
      status: "failed",
      reason: summarizeClusteredLifecycleError("recurring-procedure", error),
    };
  } finally {
    await client.end().catch(() => {});
  }
}
