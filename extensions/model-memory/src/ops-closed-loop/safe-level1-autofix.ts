import { createHash } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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

export type SafeLevel1AutoFixExecutionMode = "dry_run" | "execute";

export type SafeLevel1AutoFixExecutionResult = {
  action_id: string;
  action_kind: SafeLevel1AutoFixActionKind;
  target_id: string;
  mode: SafeLevel1AutoFixExecutionMode;
  status: "executed" | "dry_run" | "skipped";
  reason: string;
  artifact_path?: string;
  rollback: string;
  raw_content_persisted: false;
  contains_prompt_text: false;
  contains_transcript: false;
  contains_raw_tool_log: false;
  semantic_truth_mutated: false;
};

export type SafeLevel1AutoFixExecutionReport = {
  schema_version: "memory_ops_safe_level1_autofix_execution.v1";
  generated_at: string;
  mode: SafeLevel1AutoFixExecutionMode;
  enabled: boolean;
  action_count: number;
  executed_count: number;
  dry_run_count: number;
  skipped_count: number;
  results: SafeLevel1AutoFixExecutionResult[];
  forbidden_semantic_truth_actions: string[];
  raw_content_persisted: false;
  contains_prompt_text: false;
  contains_transcript: false;
  contains_raw_tool_log: false;
  semantic_truth_mutated: false;
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

function safeFileSegment(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.slice(0, 96) || stableActionId(["safe-file", value]);
}

function actionArtifactRelativePath(action: SafeLevel1AutoFixAction): string {
  switch (action.action_kind) {
    case "retry_failed_capture_job":
      return `auto-fix/capture-retries/${safeFileSegment(action.target_id)}.json`;
    case "mark_runtime_dirty_and_schedule_rebuild":
      return `auto-fix/runtime-dirty-schedule/${safeFileSegment(action.target_id)}.json`;
    case "rebuild_stale_projection_artifact":
      return `auto-fix/projection-rebuilds/${safeFileSegment(action.target_id)}.json`;
    case "quarantine_invalid_projection_artifact":
      return `auto-fix/projection-quarantine/${safeFileSegment(action.target_id)}.json`;
    case "rotate_runtime_state_jsonl":
      return `auto-fix/runtime-state-rotation/${stableActionId([action.target_id])}.json`;
    case "refresh_provider_scorecard":
      return `auto-fix/provider-scorecards/${safeFileSegment(action.target_id)}.json`;
    case "disable_failover_safe_model_route":
      return `auto-fix/provider-route-disable/${safeFileSegment(action.target_id)}.json`;
    case "operator_approval_ticket":
      return `auto-fix/operator-approval-tickets/${safeFileSegment(action.target_id)}.json`;
    default:
      return `auto-fix/unknown/${stableActionId([action.target_id, action.action_kind])}.json`;
  }
}

async function writeJsonArtifact(baseDir: string, relativePath: string, value: unknown) {
  const outputPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (!outputPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`unsafe safe-level1 artifact path: ${relativePath}`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return outputPath;
}

async function appendJsonLine(baseDir: string, relativePath: string, value: unknown) {
  const outputPath = path.resolve(baseDir, relativePath);
  const resolvedBase = path.resolve(baseDir);
  if (!outputPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`unsafe safe-level1 JSONL path: ${relativePath}`);
  }
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(value)}\n`, { flag: "a", mode: 0o600 });
}

async function maybeRotateRuntimeStateJsonl(input: {
  baseDir: string;
  targetId: string;
  enabled: boolean;
  now: Date;
}): Promise<{ rotated: boolean; reason: string; rotatedPath?: string }> {
  if (!input.enabled) {
    return { rotated: false, reason: "dry_run" };
  }
  const baseDir = path.resolve(input.baseDir);
  const targetPath = path.resolve(input.baseDir, input.targetId);
  if (!targetPath.startsWith(`${baseDir}${path.sep}`) || !targetPath.endsWith(".jsonl")) {
    return { rotated: false, reason: "path_not_under_base_dir_or_not_jsonl" };
  }
  try {
    const info = await stat(targetPath);
    if (!info.isFile() || info.size === 0) {
      return { rotated: false, reason: "empty_or_not_file" };
    }
    const rotatedPath = `${targetPath}.${input.now.toISOString().replace(/[:.]/gu, "-")}.bak`;
    await rename(targetPath, rotatedPath);
    await writeFile(targetPath, "", { mode: 0o600 });
    return { rotated: true, reason: "rotated", rotatedPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { rotated: false, reason: "missing" };
    }
    throw error;
  }
}

export async function executeSafeLevel1AutoFixPlan(input: {
  plan: SafeLevel1AutoFixPlan;
  baseDir: string;
  mode?: SafeLevel1AutoFixExecutionMode;
  enabled?: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<SafeLevel1AutoFixExecutionReport> {
  const now = input.now ?? new Date();
  const mode = input.mode ?? "dry_run";
  const env = input.env ?? process.env;
  const enabled =
    input.enabled ?? /^(1|true|yes|on)$/iu.test(env.MODEL_MEMORY_SAFE_LEVEL1_AUTOFIX_ENABLED ?? "");
  const results: SafeLevel1AutoFixExecutionResult[] = [];

  for (const planned of input.plan.actions) {
    const actionEnvName = `MODEL_MEMORY_SAFE_LEVEL1_${planned.action_kind.toUpperCase()}_ENABLED`;
    const actionEnabled = /^(1|true|yes|on)$/iu.test(env[actionEnvName] ?? "true");
    const shouldExecute = enabled && actionEnabled && planned.enabled && mode === "execute";
    const relativePath = actionArtifactRelativePath(planned);
    const artifactPayload = {
      schema_version: "memory_ops_safe_level1_action.v1",
      generated_at: now.toISOString(),
      mode,
      action: planned,
      semantic_truth_mutated: false,
      raw_content_persisted: false,
      contains_prompt_text: false,
      contains_transcript: false,
      contains_raw_tool_log: false,
    };
    let reason = shouldExecute ? planned.reason : enabled ? "dry_run" : "global_disabled";
    if (!actionEnabled) {
      reason = "action_disabled";
    }
    let artifactPath: string | undefined;
    if (shouldExecute || mode === "dry_run") {
      if (planned.action_kind === "rotate_runtime_state_jsonl") {
        const rotation = await maybeRotateRuntimeStateJsonl({
          baseDir: input.baseDir,
          targetId: planned.target_id,
          enabled: shouldExecute,
          now,
        });
        reason = rotation.reason;
        artifactPath = await writeJsonArtifact(input.baseDir, relativePath, {
          ...artifactPayload,
          rotation,
        });
      } else {
        artifactPath = await writeJsonArtifact(input.baseDir, relativePath, artifactPayload);
      }
    }
    const result: SafeLevel1AutoFixExecutionResult = {
      action_id: planned.action_id,
      action_kind: planned.action_kind,
      target_id: planned.target_id,
      mode,
      status: shouldExecute ? "executed" : mode === "dry_run" && enabled ? "dry_run" : "skipped",
      reason,
      artifact_path: artifactPath ? path.relative(input.baseDir, artifactPath) : undefined,
      rollback: planned.rollback,
      raw_content_persisted: false,
      contains_prompt_text: false,
      contains_transcript: false,
      contains_raw_tool_log: false,
      semantic_truth_mutated: false,
    };
    results.push(result);
    await appendJsonLine(input.baseDir, "auto-fix/actions.jsonl", result);
  }

  const report: SafeLevel1AutoFixExecutionReport = {
    schema_version: "memory_ops_safe_level1_autofix_execution.v1",
    generated_at: now.toISOString(),
    mode,
    enabled,
    action_count: results.length,
    executed_count: results.filter((result) => result.status === "executed").length,
    dry_run_count: results.filter((result) => result.status === "dry_run").length,
    skipped_count: results.filter((result) => result.status === "skipped").length,
    results,
    forbidden_semantic_truth_actions: input.plan.forbidden_semantic_truth_actions,
    raw_content_persisted: false,
    contains_prompt_text: false,
    contains_transcript: false,
    contains_raw_tool_log: false,
    semantic_truth_mutated: false,
  };
  await writeJsonArtifact(input.baseDir, "auto-fix/safe-level1-execution.json", report);
  return report;
}
