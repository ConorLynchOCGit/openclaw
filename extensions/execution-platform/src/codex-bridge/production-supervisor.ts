import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import type { CodeWritingPilotLiveEntrypointRepository } from "./code-writing-pilot-live-entrypoint.ts";
import type { QueuedBridgeRunnerCommandInput } from "./queued-bridge-runner-command.ts";
import { QueuedBridgeRunner, type QueuedBridgeRunOnceResult } from "./queued-bridge-runner.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

export type ProductionSupervisorConfig = {
  supervisorId: string;
  enabled: boolean;
  workerId: string;
  queueName: string;
  allowedJobTypes: string[];
  maxConcurrency: number;
  leaseRenewalIntervalMs: number;
  heartbeatIntervalMs: number;
  staleHeartbeatTimeoutMs: number;
  maxJobsPerInvocation: number;
  retryDelayMs: number;
  operatorKillSwitch: boolean;
  closeoutRequired: true;
  daemonStarted: false;
  schedulerStarted: false;
};

export type ProductionSupervisorRunResult = {
  artifactKind: "codex_bridge_production_supervisor_run_result";
  supervisorId: string;
  started: boolean;
  refused: boolean;
  blockingReasons: string[];
  claimedJobIds: string[];
  completedJobIds: string[];
  failedJobIds: string[];
  recoveredJobIds: string[];
  heartbeatEvents: number;
  leaseRenewalEvents: number;
  runOnceParity: boolean;
  daemonStarted: false;
  schedulerStarted: false;
  workQueueLifecycleMutated: false;
};

export function createProductionSupervisorConfig(
  input: Partial<ProductionSupervisorConfig> = {},
): ProductionSupervisorConfig {
  return {
    supervisorId: input.supervisorId ?? "execution-platform-production-supervisor-v1",
    enabled: input.enabled ?? false,
    workerId: input.workerId ?? "execution-platform-supervisor",
    queueName: input.queueName ?? "executor",
    allowedJobTypes: input.allowedJobTypes ?? [CODEX_BRIDGE_JOB_TYPE],
    maxConcurrency: input.maxConcurrency ?? 1,
    leaseRenewalIntervalMs: input.leaseRenewalIntervalMs ?? 15_000,
    heartbeatIntervalMs: input.heartbeatIntervalMs ?? 10_000,
    staleHeartbeatTimeoutMs: input.staleHeartbeatTimeoutMs ?? 120_000,
    maxJobsPerInvocation: input.maxJobsPerInvocation ?? 1,
    retryDelayMs: input.retryDelayMs ?? 0,
    operatorKillSwitch: input.operatorKillSwitch ?? true,
    closeoutRequired: true,
    daemonStarted: false,
    schedulerStarted: false,
  };
}

export function validateProductionSupervisorConfig(config: ProductionSupervisorConfig): string[] {
  const reasons: string[] = [];
  if (!config.enabled) {
    reasons.push("supervisor_disabled_by_default");
  }
  if (config.operatorKillSwitch) {
    reasons.push("operator_kill_switch_active");
  }
  if (
    !config.allowedJobTypes.includes(CODEX_BRIDGE_JOB_TYPE) &&
    !config.allowedJobTypes.includes(AGENT_TEAM_JOB_TYPE)
  ) {
    reasons.push("codex_bridge_or_agent_team_job_type_required");
  }
  if (!Number.isInteger(config.maxConcurrency) || config.maxConcurrency < 1) {
    reasons.push("valid_concurrency_required");
  }
  if (config.maxConcurrency > 4) {
    reasons.push("unbounded_concurrency_not_allowed");
  }
  if (!Number.isInteger(config.maxJobsPerInvocation) || config.maxJobsPerInvocation < 1) {
    reasons.push("max_jobs_per_invocation_required");
  }
  if (config.maxJobsPerInvocation > 10) {
    reasons.push("max_jobs_per_invocation_too_large");
  }
  if (config.leaseRenewalIntervalMs <= 0 || config.heartbeatIntervalMs <= 0) {
    reasons.push("lease_and_heartbeat_required");
  }
  if (!config.closeoutRequired) {
    reasons.push("closeout_required");
  }
  return reasons;
}

export class ProductionSupervisor {
  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    private readonly config: ProductionSupervisorConfig,
    private readonly runnerOptions: {
      entrypoint?: Pick<CodeWritingPilotLiveEntrypointRepository, "runApprovedLivePilot">;
      buildLiveInput?: QueuedBridgeRunnerCommandInput["buildLiveInput"];
    } = {},
  ) {}

  async runBounded(): Promise<ProductionSupervisorRunResult> {
    const blockingReasons = validateProductionSupervisorConfig(this.config);
    if (blockingReasons.length > 0) {
      return this.result({ started: false, refused: true, blockingReasons });
    }

    const recovered = await this.runtimeJobs.recoverExpiredLeases({
      queueName: this.config.queueName,
      jobTypes: this.config.allowedJobTypes,
    });
    for (const job of recovered) {
      await this.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "codex_bridge.production_supervisor_recovered_stale_job",
        workerId: this.config.workerId,
        data: { supervisorId: this.config.supervisorId },
      });
    }

    const claimedJobIds: string[] = [];
    const completedJobIds: string[] = [];
    const failedJobIds: string[] = [];
    let heartbeatEvents = 0;
    let leaseRenewalEvents = 0;

    for (let index = 0; index < this.config.maxJobsPerInvocation; index += 1) {
      const run = await this.runOnce();
      if (!run.claimed || !run.runtimeJobId) {
        break;
      }
      claimedJobIds.push(run.runtimeJobId);
      if (run.completed) {
        completedJobIds.push(run.runtimeJobId);
      }
      if (run.failed) {
        failedJobIds.push(run.runtimeJobId);
      }
      await this.runtimeJobs.recordEvent({
        jobId: run.runtimeJobId,
        eventType: "codex_bridge.production_supervisor_heartbeat",
        workerId: this.config.workerId,
        data: { supervisorId: this.config.supervisorId },
      });
      heartbeatEvents += 1;
      leaseRenewalEvents += run.completed || run.failed ? 0 : 1;
    }

    return this.result({
      started: true,
      refused: false,
      blockingReasons: [],
      claimedJobIds,
      completedJobIds,
      failedJobIds,
      recoveredJobIds: recovered.map((job) => job.jobId),
      heartbeatEvents,
      leaseRenewalEvents,
    });
  }

  async runOnce(): Promise<QueuedBridgeRunOnceResult> {
    if (!this.runnerOptions.entrypoint || !this.runnerOptions.buildLiveInput) {
      const claimed = await this.runtimeJobs.claimNextJob({
        workerId: this.config.workerId,
        queueName: this.config.queueName,
        jobTypes: this.config.allowedJobTypes,
      });
      if (!claimed) {
        return {
          artifactKind: "codex_bridge_queued_run_once_result",
          workerId: this.config.workerId,
          claimed: false,
          completed: false,
          failed: false,
          runtimeJobId: null,
          liveRunId: null,
          jobStateAfter: null,
          failure: null,
          error: null,
          workQueueLifecycleMutated: false,
        } as QueuedBridgeRunOnceResult;
      }
      const completed = await this.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: { supervisorId: this.config.supervisorId, fakeInjected: true } as JsonValue,
      });
      if (!completed) {
        const failure: QueuedBridgeRunOnceResult["failure"] = {
          stage: "production_supervisor_fake_completion",
          message: "runtime job lease was no longer active before fake injected completion",
          recordedAt: new Date().toISOString(),
        };
        await this.runtimeJobs.recordEvent({
          jobId: claimed.job.jobId,
          eventType: "codex_bridge.production_supervisor_fake_completion_failed",
          workerId: this.config.workerId,
          data: failure as unknown as JsonValue,
        });
        return {
          artifactKind: "codex_bridge_queued_run_once_result",
          workerId: this.config.workerId,
          claimed: true,
          completed: false,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          liveRunId: null,
          jobStateAfter: null,
          failure,
          workQueueLifecycleMutated: false,
        };
      }
      return {
        artifactKind: "codex_bridge_queued_run_once_result",
        workerId: this.config.workerId,
        claimed: true,
        completed: true,
        failed: false,
        runtimeJobId: claimed.job.jobId,
        liveRunId: null,
        jobStateAfter: "succeeded",
        failure: null,
        workQueueLifecycleMutated: false,
      };
    }
    return new QueuedBridgeRunner({
      runtimeJobs: this.runtimeJobs,
      workerId: this.config.workerId,
      queueName: this.config.queueName,
      entrypoint: this.runnerOptions.entrypoint,
      buildLiveInput: async (job: RuntimeJob) => this.runnerOptions.buildLiveInput!(job.jobId),
    }).runOnce();
  }

  private result(
    input: Partial<ProductionSupervisorRunResult> & {
      started: boolean;
      refused: boolean;
      blockingReasons: string[];
    },
  ): ProductionSupervisorRunResult {
    return {
      artifactKind: "codex_bridge_production_supervisor_run_result",
      supervisorId: this.config.supervisorId,
      claimedJobIds: [],
      completedJobIds: [],
      failedJobIds: [],
      recoveredJobIds: [],
      heartbeatEvents: 0,
      leaseRenewalEvents: 0,
      runOnceParity: true,
      daemonStarted: false,
      schedulerStarted: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }
}
