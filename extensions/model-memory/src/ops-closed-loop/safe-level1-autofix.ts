import { createHash } from "node:crypto";
import type { MemoryOpsClosedLoopConfig } from "./config.ts";

export type SafeLevel1AutoFixActionKind =
  | "retry_failed_capture_job"
  | "mark_runtime_dirty_and_schedule_rebuild"
  | "rebuild_stale_projection_artifact"
  | "quarantine_invalid_projection_artifact"
  | "rotate_runtime_state_jsonl"
  | "refresh_provider_scorecard"
  | "disable_failover_safe_model_route"
  | "operator_approval_ticket";

export type SafeLevel1AutoFixAction = {
  action_id: string;
  action_kind: SafeLevel1AutoFixActionKind;
  enabled: boolean;
  target_id: string;
  reason: string;
  safe_to_apply_without_semantic_truth_mutation: true;
  requires_operator_approval: boolean;
  rollback: string;
  raw_content_persisted: false;
  contains_prompt_text: false;
  contains_transcript: false;
  contains_raw_tool_log: false;
};

export type SafeLevel1CaptureJobInput = {
  jobId: string;
  status: string;
  failureClass?: string;
  retryCount?: number;
};

export type SafeLevel1RuntimeDirtyInput = {
  dirtyId: string;
  status: string;
  reason?: string;
};

export type SafeLevel1ProjectionInput = {
  projectionId: string;
  artifactPath?: string;
  freshnessStatus?: string;
  staleMarkers?: string[];
  conflictMarkers?: string[];
  hashValid?: boolean;
  activeSourceMemoryIdsValid?: boolean;
};

export type SafeLevel1ProviderRouteInput = {
  routeId: string;
  failoverSafe: boolean;
  schemaSuccessRate?: number;
  emptyResponseRate?: number;
  providerConnectionFailureRate?: number;
};

export type SafeLevel1AutoFixPlanInput = {
  config?: Pick<MemoryOpsClosedLoopConfig, "safeLevel1AutoFix">;
  captureJobs?: SafeLevel1CaptureJobInput[];
  runtimeDirtyStates?: SafeLevel1RuntimeDirtyInput[];
  projections?: SafeLevel1ProjectionInput[];
  providerRoutes?: SafeLevel1ProviderRouteInput[];
  runtimeStateJsonlPaths?: string[];
  semanticTruthTouchRequested?: Array<{ ticketId: string; reason: string }>;
};

export type SafeLevel1AutoFixPlan = {
  schema_version: "memory_ops_safe_level1_autofix_plan.v1";
  generated_at: string;
  actions: SafeLevel1AutoFixAction[];
  forbidden_semantic_truth_actions: string[];
};

const RETRYABLE_CAPTURE_FAILURES = new Set(["timeout", "provider_connection", "pool_pressure"]);

function stableActionId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function action(input: {
  actionKind: SafeLevel1AutoFixActionKind;
  targetId: string;
  reason: string;
  requiresOperatorApproval?: boolean;
  rollback: string;
}): SafeLevel1AutoFixAction {
  return {
    action_id: stableActionId([input.actionKind, input.targetId, input.reason]),
    action_kind: input.actionKind,
    enabled: true,
    target_id: input.targetId,
    reason: input.reason,
    safe_to_apply_without_semantic_truth_mutation: true,
    requires_operator_approval: input.requiresOperatorApproval ?? false,
    rollback: input.rollback,
    raw_content_persisted: false,
    contains_prompt_text: false,
    contains_transcript: false,
    contains_raw_tool_log: false,
  };
}

function safeLevel1Enabled(input: SafeLevel1AutoFixPlanInput): boolean {
  return input.config?.safeLevel1AutoFix.enabled ?? true;
}

export function buildSafeLevel1AutoFixPlan(
  input: SafeLevel1AutoFixPlanInput = {},
): SafeLevel1AutoFixPlan {
  const actions: SafeLevel1AutoFixAction[] = [];
  if (!safeLevel1Enabled(input)) {
    return {
      schema_version: "memory_ops_safe_level1_autofix_plan.v1",
      generated_at: new Date().toISOString(),
      actions,
      forbidden_semantic_truth_actions: ["semantic_truth_auto_fix_disabled"],
    };
  }

  for (const job of input.captureJobs ?? []) {
    if (
      (job.status === "failed" || job.status === "retry_scheduled") &&
      job.failureClass &&
      RETRYABLE_CAPTURE_FAILURES.has(job.failureClass)
    ) {
      actions.push(
        action({
          actionKind: "retry_failed_capture_job",
          targetId: job.jobId,
          reason: `retryable_capture_failure:${job.failureClass}`,
          rollback:
            "disable MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES or set retry worker concurrency to 0",
        }),
      );
    }
  }

  for (const dirty of input.runtimeDirtyStates ?? []) {
    if (dirty.status === "dirty" || dirty.status === "failed") {
      actions.push(
        action({
          actionKind: "mark_runtime_dirty_and_schedule_rebuild",
          targetId: dirty.dirtyId,
          reason: dirty.reason ?? "runtime_dirty_after_capture_write",
          rollback: "set MODEL_MEMORY_RUNTIME_REBUILD_ENABLED=false",
        }),
      );
    }
  }

  for (const projection of input.projections ?? []) {
    const invalid =
      projection.hashValid === false ||
      projection.activeSourceMemoryIdsValid === false ||
      (projection.conflictMarkers?.length ?? 0) > 0;
    if (invalid) {
      actions.push(
        action({
          actionKind: "quarantine_invalid_projection_artifact",
          targetId: projection.projectionId,
          reason: "projection_hash_source_or_conflict_validation_failed",
          rollback:
            "remove quarantine marker and rematerialize from active MMV2 source ids after validation",
        }),
      );
      continue;
    }
    if (projection.freshnessStatus === "stale" || (projection.staleMarkers?.length ?? 0) > 0) {
      actions.push(
        action({
          actionKind: "rebuild_stale_projection_artifact",
          targetId: projection.projectionId,
          reason: "stale_projection_artifact",
          rollback: "set MODEL_MEMORY_RUNTIME_REBUILD_ENABLED=false and leave runtime dirty",
        }),
      );
    }
  }

  for (const runtimeStatePath of input.runtimeStateJsonlPaths ?? []) {
    actions.push(
      action({
        actionKind: "rotate_runtime_state_jsonl",
        targetId: runtimeStatePath,
        reason: "runtime_state_jsonl_age_or_size_policy",
        rollback: "restore rotated JSONL from adjacent .bak artifact if needed",
      }),
    );
  }

  for (const route of input.providerRoutes ?? []) {
    actions.push(
      action({
        actionKind: "refresh_provider_scorecard",
        targetId: route.routeId,
        reason: "provider_scorecard_refresh",
        rollback: "ignore generated provider scorecard artifact",
      }),
    );
    if (
      route.failoverSafe &&
      ((route.schemaSuccessRate ?? 1) < 0.8 ||
        (route.emptyResponseRate ?? 0) > 0.2 ||
        (route.providerConnectionFailureRate ?? 0) > 0.2)
    ) {
      actions.push(
        action({
          actionKind: "disable_failover_safe_model_route",
          targetId: route.routeId,
          reason: "failover_safe_route_failed_scorecard_threshold",
          rollback: "remove generated route-disable recommendation artifact",
        }),
      );
    }
  }

  for (const requested of input.semanticTruthTouchRequested ?? []) {
    actions.push(
      action({
        actionKind: "operator_approval_ticket",
        targetId: requested.ticketId,
        reason: requested.reason,
        requiresOperatorApproval: true,
        rollback: "close approval ticket without applying semantic truth mutation",
      }),
    );
  }

  return {
    schema_version: "memory_ops_safe_level1_autofix_plan.v1",
    generated_at: new Date().toISOString(),
    actions,
    forbidden_semantic_truth_actions: [
      "auto_delete_memory",
      "auto_supersede_memory",
      "semantic_candidate_auto_repair",
      "fuzzy_correction_match",
      "root_user_memory_write_back",
    ],
  };
}
