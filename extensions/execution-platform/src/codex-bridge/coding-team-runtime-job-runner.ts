import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import type {
  CodingResourcePacket,
  NodeExecutionPacket,
} from "../workflows/node-resource-materialization.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  AGENT_TEAM_JOB_TYPE,
  type AgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import { DynamicAgentTeamGraphRunner } from "./dynamic-agent-team-graph-runner.ts";
import type { DynamicCodingTeamModelClient } from "./dynamic-coding-team-orchestrator.ts";
import type { DynamicValidationRunner } from "./dynamic-test-repair-loop.ts";
import type { AgentTeamModelClient } from "./live-agent-team-runner.ts";
import {
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";

export type CodingTeamRuntimeRunOnceResult = {
  artifactKind: "coding_team_runtime_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  teamRunId: string | null;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  evidence: AgentTeamRuntimeEvidence | null;
  failure: { stage: string; message: string; reasonCodes?: string[] } | null;
  closeoutRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type CodingTeamRuntimeJobRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  runtimeJobId?: string;
  sourcePromptSessionRoots?: string[];
  closeoutReporter?: {
    createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
  };
  roleModelClient?: AgentTeamModelClient;
  implementationBridge?: AgentTeamImplementationBridge;
  runtimeWorkGraphs?: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue?: WorkQueueRepository;
  dynamicOrchestratorModelClient?: DynamicCodingTeamModelClient;
  missionContractModelClient?: DynamicCodingTeamModelClient;
  dynamicValidationRunner?: DynamicValidationRunner;
  now?: () => Date;
};

export type AgentTeamClaimedJobExecutionResult = {
  artifactKind: "agent_team_claimed_job_execution_result";
  evidence: AgentTeamRuntimeEvidence;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  closeoutCapsule: CloseoutCapsuleReporterResult["capsule"];
  cleanSuccessAccepted: boolean;
  blockingReasonCodes: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export type AgentTeamImplementationBridgeRunInput = {
  runtimeJob: RuntimeJob;
  teamRunId: string;
  objective: string;
  roleId: "implementation_engineer";
  assignedTaskSummary: string;
  evidenceRefs: string[];
  validationRefs: string[];
  approvedRepoScopePaths?: string[];
  nodeExecutionPacket?: NodeExecutionPacket;
  codingResourcePacket?: CodingResourcePacket;
  nodeReadinessStateRef?: string | null;
  nodeExecutionPacketRef?: string | null;
  resourcePacketRef?: string | null;
};

export type AgentTeamImplementationBridgeRunResult = {
  status: "completed" | "needs_review" | "failed";
  transportKind: "codex_app_server" | "acp_codex" | "codex_parity_runtime_adapter";
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  summary: string;
  changedFileRefs: string[];
  validationRefs: string[];
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type AgentTeamImplementationBridge = {
  run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult>;
};

export class CodingTeamRuntimeJobRunner {
  private readonly queueName: string;
  private readonly now: () => Date;
  private readonly leaseRenewalIntervalMs = 10_000;
  private readonly leaseRenewalExtendByMs = 120_000;

  constructor(private readonly options: CodingTeamRuntimeJobRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<CodingTeamRuntimeRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: [AGENT_TEAM_JOB_TYPE],
      runtimeJobId: this.options.runtimeJobId,
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }

    const stopLeaseRenewal = this.startLeaseRenewal(claimed.leaseToken);
    try {
      const run = await this.runClaimedJob(claimed.job);
      if (!run.cleanSuccessAccepted) {
        const message = run.blockingReasonCodes[0] ?? "agent_team_clean_success_not_accepted";
        await this.options.runtimeJobs.failJob({
          leaseToken: claimed.leaseToken,
          error: {
            stage: "agent_team_run_once",
            message,
            reasonCodes: run.blockingReasonCodes,
          },
        });
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          teamRunId: run.evidence.teamRunId,
          failure: {
            stage: "agent_team_run_once",
            message,
            reasonCodes: run.blockingReasonCodes.slice(0, 40),
          },
          modelRosterDecisions: run.modelRosterDecisions,
          evidence: run.evidence,
        });
      }
      const completed = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          teamRunId: run.evidence.teamRunId,
          completedWorkPathSatisfied: true,
          modelRosterAllowed: run.modelRosterDecisions.every((decision) => decision.allowed),
        } as JsonValue,
      });
      if (!completed) {
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          teamRunId: run.evidence.teamRunId,
          failure: { stage: "complete_job", message: "lease expired before completion" },
          modelRosterDecisions: run.modelRosterDecisions,
          evidence: run.evidence,
        });
      }
      return this.empty({
        claimed: true,
        completed: true,
        runtimeJobId: claimed.job.jobId,
        teamRunId: run.evidence.teamRunId,
        modelRosterDecisions: run.modelRosterDecisions,
        evidence: run.evidence,
      });
    } catch (error) {
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          stage: "agent_team_run_once",
          message: error instanceof Error ? error.message : "unknown agent-team run failure",
        },
      });
      return this.empty({
        claimed: true,
        failed: true,
        runtimeJobId: claimed.job.jobId,
        failure: {
          stage: "agent_team_run_once",
          message: error instanceof Error ? error.message : "unknown agent-team run failure",
        },
      });
    } finally {
      stopLeaseRenewal();
    }
  }

  private startLeaseRenewal(leaseToken: string): () => void {
    let stopped = false;
    const renew = (): void => {
      if (stopped) {
        return;
      }
      void this.options.runtimeJobs
        .renewLease({
          leaseToken,
          workerId: this.options.workerId,
          extendByMs: this.leaseRenewalExtendByMs,
        })
        .catch(() => undefined);
    };
    renew();
    const interval = setInterval(renew, this.leaseRenewalIntervalMs);
    interval.unref?.();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }

  async runClaimedJobForAdapter(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    return this.runClaimedJob(job);
  }

  private async runClaimedJob(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const payload = asRecord(job.payload);
    if (
      payload.legacyFixedDynamicRunner === true ||
      payload.proofOnlyLegacyFixedDynamicRunner === true
    ) {
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.legacy_fixed_runner_rejected",
        data: {
          artifactKind: "agent_team_legacy_fixed_runner_rejected",
          runtimeJobId: job.jobId,
          reasonCodes: ["legacy_fixed_dynamic_runner_retired"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        } as JsonValue,
      });
      throw new Error("legacy_fixed_dynamic_runner_retired");
    }
    const workflowId = stringValue(payload.workflowId, "agent_team.coding");
    const executorId = `workflow-executor:${workflowId}`;
    const authorityProfile = stringValue(payload.authorityProfile, "local_yolo");
    const permissionEvidence = createWorkflowPermissionReadback({ workflowId, authorityProfile });
    await this.options.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.workflow_dispatch_started",
      workerId: this.options.workerId,
      data: {
        workflowId,
        jobType: job.jobType,
        executorId,
        genericWorkflowDispatch: true,
        permissionDecision: permissionEvidence.decision,
      },
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_dispatch",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-dispatch/${workflowId}`,
      contentType: "application/json",
      metadata: {
        workflowId,
        jobType: job.jobType,
        executorId,
        dispatchedTo: "coding_team_runtime_job_runner",
        codingTeamSpecialPath: false,
        permissionEvidence,
        closeoutRequired: true,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    const liveQualityPathConfigured = Boolean(
      this.options.roleModelClient &&
      this.options.implementationBridge &&
      this.options.closeoutReporter,
    );
    if (workflowId === "agent_team.coding") {
      if (
        !liveQualityPathConfigured ||
        !this.options.runtimeWorkGraphs ||
        !this.options.runtimeToolKernel
      ) {
        throw new Error(
          "dynamic_runtime_work_graph_required:live coding-team execution requires configured role model, implementation bridge, closeout reporter, runtime work graph, and scheduler tool kernel",
        );
      }
    }
    if (
      liveQualityPathConfigured &&
      this.options.runtimeWorkGraphs &&
      workflowId === "agent_team.coding"
    ) {
      return new DynamicAgentTeamGraphRunner({
        runtimeJobs: this.options.runtimeJobs,
        runtimeWorkGraphs: this.options.runtimeWorkGraphs,
        runtimeToolKernel: this.options.runtimeToolKernel ?? null,
        requireSchedulerToolKernel: true,
        workQueue: this.options.workQueue,
        workerId: this.options.workerId,
        sourcePromptSessionRoots: this.options.sourcePromptSessionRoots,
        roleModelClient: this.options.roleModelClient!,
        orchestratorModelClient: this.options.dynamicOrchestratorModelClient,
        missionContractModelClient: this.options.missionContractModelClient,
        validationRunner: this.options.dynamicValidationRunner,
        implementationBridge: this.options.implementationBridge!,
        closeoutReporter: this.options.closeoutReporter,
        now: this.now,
      }).run(job);
    }
    if (liveQualityPathConfigured && workflowId === "agent_team.coding") {
      throw new Error(
        "dynamic_runtime_work_graph_required:live coding-team execution cannot fall back to the static single-job role sequence",
      );
    }
    throw new Error(
      "dynamic_runtime_work_graph_required:live coding-team execution must use the scheduler-backed dynamic runtime work graph",
    );
  }

  private empty(input: Partial<CodingTeamRuntimeRunOnceResult>): CodingTeamRuntimeRunOnceResult {
    return {
      artifactKind: "coding_team_runtime_run_once_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      runtimeJobId: null,
      teamRunId: null,
      modelRosterDecisions: [],
      evidence: null,
      failure: null,
      closeoutRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      daemonStarted: false,
      schedulerStarted: false,
      ...input,
    };
  }
}
