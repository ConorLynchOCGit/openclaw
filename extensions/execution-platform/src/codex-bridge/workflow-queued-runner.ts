import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  parseCloseoutCapsule,
  recordCloseoutCapsuleArtifact,
  type CloseoutCapsule,
} from "./closeout-capsule.ts";
import {
  createDegradedSystemCloseoutCapsule,
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";
import { resolveRuntimeObjective } from "./source-prompt-ref.ts";

export type WorkflowQueuedRunOnceResult = {
  artifactKind: "workflow_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  workflowId: string | null;
  jobType: string | null;
  failure: { stage: string; message: string } | null;
  closeoutRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type WorkflowQueuedRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  jobTypes?: string[];
  runtimeJobId?: string;
  sourcePromptSessionRoots?: string[];
  closeoutReporter?: {
    createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
  };
  now?: () => Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

const SCHEDULER_BACKED_WORKFLOWS = new Set(["agent_team.product_spec_planning"]);

function closeoutIsModelAuthored(result: CloseoutCapsuleReporterResult): boolean {
  return (
    result.source === "model" &&
    result.capsule.humanReport.source === "model" &&
    result.capsule.structuredSummary.taskSuccess !== "unknown"
  );
}

export class WorkflowQueuedRunner {
  private readonly queueName: string;
  private readonly jobTypes: string[];
  private readonly now: () => Date;
  private readonly leaseRenewalIntervalMs = 10_000;
  private readonly leaseRenewalExtendByMs = 120_000;

  constructor(private readonly options: WorkflowQueuedRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.jobTypes = options.jobTypes ?? ["executor.single_agent", "executor.workflow"];
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<WorkflowQueuedRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: this.jobTypes,
      runtimeJobId: this.options.runtimeJobId,
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }
    const payload = asRecord(claimed.job.payload);
    const workflowId = stringValue(payload.workflowId, "unknown");
    const stopLeaseRenewal = this.startLeaseRenewal(claimed.leaseToken);
    try {
      if (SCHEDULER_BACKED_WORKFLOWS.has(workflowId)) {
        await this.options.runtimeJobs.recordEvent({
          jobId: claimed.job.jobId,
          eventType: "execution.workflow_scheduler_required",
          workerId: this.options.workerId,
          data: {
            workflowId,
            reasonCode: "product_spec_planning_requires_scheduler_backed_runner",
            genericWorkflowDispatchAllowed: false,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          } as JsonValue,
        });
        throw new Error("product_spec_planning_requires_scheduler_backed_runner");
      }
      await this.recordGenericWorkflowEvidence(claimed.job, workflowId);
      const completed = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          workflowId,
          completedWorkPathSatisfied: true,
          closeoutPresent: true,
        } as JsonValue,
      });
      if (!completed) {
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          workflowId,
          jobType: claimed.job.jobType,
          failure: { stage: "complete_job", message: "lease expired before completion" },
        });
      }
      return this.empty({
        claimed: true,
        completed: true,
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
      });
    } catch (error) {
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          stage: "workflow_run_once",
          message: error instanceof Error ? error.message : "unknown workflow run failure",
        },
      });
      return this.empty({
        claimed: true,
        failed: true,
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
        failure: {
          stage: "workflow_run_once",
          message: error instanceof Error ? error.message : "unknown workflow run failure",
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

  private async recordGenericWorkflowEvidence(job: RuntimeJob, workflowId: string): Promise<void> {
    const now = this.now().toISOString();
    const payload = asRecord(job.payload);
    const objectiveResolution = await resolveRuntimeObjective(payload, {
      sessionSearchRoots: this.options.sourcePromptSessionRoots,
    });
    const objective = objectiveResolution.objectiveForEvidence;
    if (objective === "task-specific-objective-missing") {
      throw new Error("task_specific_closeout_evidence_required_before_success");
    }
    await this.options.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.workflow_dispatch_started",
      workerId: this.options.workerId,
      data: {
        workflowId,
        jobType: job.jobType,
        executorId: `workflow-executor:${workflowId}`,
        genericWorkflowDispatch: true,
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
        executorId: `workflow-executor:${workflowId}`,
        dispatchedTo: "generic_workflow_queued_runner",
        codingTeamSpecialPath: false,
        closeoutRequired: true,
        sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_closeout",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-closeout/${workflowId}`,
      contentType: "application/json",
      metadata: {
        workflowId,
        objectiveSummary: objective,
        completedAt: now,
        status: "completed",
        boundedSummaryPresent: true,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    const capsuleInput: CloseoutCapsuleReporterInput = {
      factualRefs: {
        runtimeJobId: job.jobId,
        teamRunId: null,
        workflowId,
        status: "completed",
        roles: [
          {
            roleId: `workflow-executor:${workflowId}`,
            agentId: `workflow-executor:${workflowId}`,
            modelRef: null,
            status: "completed",
          },
        ],
        fileRefs: workflowFilesForCloseout(workflowId),
        artifactRefs: [
          `runtime-job://${job.jobId}/execution/workflow-dispatch/${workflowId}`,
          `runtime-job://${job.jobId}/execution/workflow-closeout/${workflowId}`,
        ],
        validationRefs: ["generic workflow runtime closeout evidence recorded"],
        runtimeEventRefs: [`runtime-job://${job.jobId}/events`],
      },
      objectiveSummary: objective,
      boundedRoleEvidence: [
        {
          roleId: `workflow-executor:${workflowId}`,
          agentId: `workflow-executor:${workflowId}`,
          modelRef: null,
          askedToDo: objective,
          evidenceSummary:
            "Generic workflow runner recorded bounded dispatch and closeout evidence.",
          artifactRefs: [`runtime-job://${job.jobId}/execution/workflow-closeout/${workflowId}`],
          validationRefs: ["generic workflow runtime closeout evidence recorded"],
          limitations: [
            "generic workflow runner records evidence; it does not prove independent agent edits",
          ],
        },
      ],
      boundedResultEvidence: {
        completed: true,
        needsReview: false,
        failed: false,
        findings: [],
        requiredFixes: [],
        limitations: [
          "generic workflow runner records evidence; it does not prove independent agent edits",
        ],
      },
    };
    const capsuleResult = this.options.closeoutReporter
      ? await this.options.closeoutReporter.createCapsule(capsuleInput)
      : createDegradedSystemCloseoutCapsule({
          ...capsuleInput,
          reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
        });
    if (!closeoutIsModelAuthored(capsuleResult)) {
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "execution.workflow_degraded_closeout_rejected",
        workerId: this.options.workerId,
        data: {
          workflowId,
          closeoutSource: capsuleResult.source,
          reasonCodes: [
            "degraded_closeout_diagnostic_only",
            "model_authored_closeout_required_before_success",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        } as JsonValue,
      });
      throw new Error("model_authored_closeout_required_before_success");
    }
    const capsule: CloseoutCapsule = parseCloseoutCapsule(capsuleResult.capsule);
    await recordCloseoutCapsuleArtifact({
      runtimeJobs: this.options.runtimeJobs,
      capsule,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "workflow_review.human_closeout_summary",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-human-closeout/${workflowId}`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(capsuleResult.legacyHumanSummary), "utf8"),
      metadata: {
        ...capsuleResult.legacyHumanSummary,
        closeoutCapsuleId: capsule.capsuleId,
        closeoutCapsuleSource: capsuleResult.source,
        modelAuthored: capsuleResult.source === "model",
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
  }

  private empty(input: Partial<WorkflowQueuedRunOnceResult>): WorkflowQueuedRunOnceResult {
    return {
      artifactKind: "workflow_queued_run_once_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      runtimeJobId: null,
      workflowId: null,
      jobType: null,
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

function workflowFilesForCloseout(workflowId: string): string[] {
  switch (workflowId) {
    case "agent_team.product_spec_planning":
      return [
        "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts",
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      ];
    case "workflow.docs_skills":
      return [
        "extensions/execution-platform/src/workflows/docs-skills-workflow.ts",
        "extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts",
      ];
    default:
      return ["extensions/execution-platform/src/codex-bridge/workflow-queued-runner.ts"];
  }
}
