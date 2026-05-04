import type { JsonValue } from "../runtime-job-repository.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

export type ProductionSupervisorLoopDesign = {
  artifactKind: "codex_bridge_production_supervisor_loop_design";
  supervisorId: string;
  queueNames: string[];
  allowedJobTypes: string[];
  maxConcurrency: number;
  leaseRenewalIntervalMs: number;
  heartbeatIntervalMs: number;
  staleHeartbeatTimeoutMs: number;
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
  crashRecoveryPolicy: string[];
  operatorKillSwitchRequired: true;
  controlPollingRequired: true;
  closeoutRequired: true;
  authorityProfileConstraints: string[];
  supabaseRuntimePersistenceRequired: true;
  workQueueReadModelUpdateExpected: true;
  hiddenWorkQueueLifecycleMutationAllowed: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type ProductionSupervisorLoopDesignReport = {
  artifactKind: "codex_bridge_production_supervisor_loop_design_report";
  supervisorId: string;
  readyForFutureImplementation: boolean;
  blockingReasons: string[];
  daemonStarted: false;
  schedulerStarted: false;
  workQueueLifecycleMutated: false;
};

export function createProductionSupervisorLoopDesign(
  input: Partial<
    Pick<
      ProductionSupervisorLoopDesign,
      | "supervisorId"
      | "queueNames"
      | "allowedJobTypes"
      | "maxConcurrency"
      | "leaseRenewalIntervalMs"
      | "heartbeatIntervalMs"
      | "staleHeartbeatTimeoutMs"
      | "retryPolicy"
      | "crashRecoveryPolicy"
      | "authorityProfileConstraints"
    >
  > = {},
): ProductionSupervisorLoopDesign {
  return {
    artifactKind: "codex_bridge_production_supervisor_loop_design",
    supervisorId: input.supervisorId ?? "execution-platform-production-supervisor-v1",
    queueNames: input.queueNames ?? ["executor"],
    allowedJobTypes: input.allowedJobTypes ?? [CODEX_BRIDGE_JOB_TYPE],
    maxConcurrency: input.maxConcurrency ?? 1,
    leaseRenewalIntervalMs: input.leaseRenewalIntervalMs ?? 15_000,
    heartbeatIntervalMs: input.heartbeatIntervalMs ?? 10_000,
    staleHeartbeatTimeoutMs: input.staleHeartbeatTimeoutMs ?? 120_000,
    retryPolicy: input.retryPolicy ?? { maxAttempts: 2, backoffMs: 30_000 },
    crashRecoveryPolicy: input.crashRecoveryPolicy ?? [
      "recover stale running jobs by lease expiry",
      "record crash recovery event before retry",
      "require closeout or needs-review evidence before success",
    ],
    operatorKillSwitchRequired: true,
    controlPollingRequired: true,
    closeoutRequired: true,
    authorityProfileConstraints: input.authorityProfileConstraints ?? [
      "trusted-local-yolo-v1",
      "rebuild-authority-v2",
    ],
    supabaseRuntimePersistenceRequired: true,
    workQueueReadModelUpdateExpected: true,
    hiddenWorkQueueLifecycleMutationAllowed: false,
    daemonStarted: false,
    schedulerStarted: false,
  };
}

export function validateProductionSupervisorLoopDesign(
  design: ProductionSupervisorLoopDesign,
): ProductionSupervisorLoopDesignReport {
  const reasons: string[] = [];
  if (design.queueNames.length === 0) {
    reasons.push("queue_name_required");
  }
  if (!design.allowedJobTypes.includes(CODEX_BRIDGE_JOB_TYPE)) {
    reasons.push("codex_bridge_job_type_required");
  }
  if (!Number.isInteger(design.maxConcurrency) || design.maxConcurrency < 1) {
    reasons.push("valid_concurrency_required");
  }
  if (design.maxConcurrency > 4) {
    reasons.push("unbounded_concurrency_not_allowed");
  }
  if (design.leaseRenewalIntervalMs <= 0 || design.heartbeatIntervalMs <= 0) {
    reasons.push("lease_and_heartbeat_required");
  }
  if (!design.operatorKillSwitchRequired) {
    reasons.push("operator_kill_switch_required");
  }
  if (!design.controlPollingRequired) {
    reasons.push("control_polling_required");
  }
  if (!design.closeoutRequired) {
    reasons.push("closeout_required");
  }
  if (design.hiddenWorkQueueLifecycleMutationAllowed) {
    reasons.push("hidden_work_queue_lifecycle_mutation_not_allowed");
  }
  if (design.daemonStarted || design.schedulerStarted) {
    reasons.push("design_must_not_start_daemon_or_scheduler");
  }
  return {
    artifactKind: "codex_bridge_production_supervisor_loop_design_report",
    supervisorId: design.supervisorId,
    readyForFutureImplementation: reasons.length === 0,
    blockingReasons: reasons,
    daemonStarted: false,
    schedulerStarted: false,
    workQueueLifecycleMutated: false,
  };
}

export function summarizeProductionSupervisorLoopDesign(
  design: ProductionSupervisorLoopDesign,
): JsonValue {
  const report = validateProductionSupervisorLoopDesign(design);
  return {
    supervisorId: design.supervisorId,
    queueNames: design.queueNames,
    allowedJobTypes: design.allowedJobTypes,
    maxConcurrency: design.maxConcurrency,
    leaseRenewalIntervalMs: design.leaseRenewalIntervalMs,
    heartbeatIntervalMs: design.heartbeatIntervalMs,
    operatorKillSwitchRequired: design.operatorKillSwitchRequired,
    closeoutRequired: design.closeoutRequired,
    readyForFutureImplementation: report.readyForFutureImplementation,
    blockingReasons: report.blockingReasons,
    daemonStarted: false,
    schedulerStarted: false,
  };
}
