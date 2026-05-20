import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { DEFAULT_WORKFLOW_DEFINITION_REGISTRY } from "../workflows/workflow-definition-registry.ts";
import {
  WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
  workflowDefinitionResolutionArtifactMetadata,
  workflowDefinitionResolutionFor,
  type WorkflowDefinition,
} from "../workflows/workflow-definition.ts";
import { DEFAULT_WORKFLOW_PLUGIN_REGISTRY } from "../workflows/workflow-plugin-registry.ts";
import {
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";

export const GENERIC_WORKFLOW_RUNNER_RETIREMENT_WORK_ITEM_ID =
  "openclaw-convergence.workflow-runtime-03-generic-runner-retirement";

export const GENERIC_WORKFLOW_RUNNER_RETIREMENT_ARTIFACT_TYPE =
  "execution.generic_workflow_runner_retirement";

export type GenericWorkflowRunnerRetirementStatus =
  | "canonical_engine_required"
  | "blocked_migration_required"
  | "definition_missing"
  | "test_only";

export type GenericWorkflowRunnerRetirementMetadata = {
  artifactKind: "generic_workflow_runner_retirement";
  workflowId: string;
  status: GenericWorkflowRunnerRetirementStatus;
  definitionId: string | null;
  definitionStatus: string | null;
  productionEnabled: boolean | null;
  schedulerBacked: boolean | null;
  pluginRegistered: boolean;
  genericProductionSuccessAllowed: false;
  canonicalWorkflowEngineRequired: true;
  workflowQueuedRunnerRole: "migration_shim_only";
  reasonCodes: string[];
  ownerSummary: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type WorkflowQueuedRunOnceResult = {
  artifactKind: "workflow_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  status: GenericWorkflowRunnerRetirementStatus | null;
  runtimeJobId: string | null;
  workflowId: string | null;
  jobType: string | null;
  failure: { stage: string; message: string } | null;
  reasonCodes: string[];
  canonicalWorkflowEngineRequired: true;
  genericProductionSuccessAllowed: false;
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
  runtimeToolKernel?: RuntimeToolKernel | null;
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

function workflowSpecificRetirementReasonCodes(workflowId: string): string[] {
  if (workflowId === "agent_team.product_spec_planning") {
    return [
      "product_spec_planning_requires_scheduler_backed_runner",
      "product_spec_planning_generic_runner_cannot_emit_contract_artifacts",
    ];
  }
  return [];
}

export class WorkflowQueuedRunner {
  private readonly queueName: string;
  private readonly jobTypes: string[];
  private readonly leaseRenewalIntervalMs = 10_000;
  private readonly leaseRenewalExtendByMs = 120_000;

  constructor(private readonly options: WorkflowQueuedRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.jobTypes = options.jobTypes ?? ["executor.single_agent", "executor.workflow"];
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
      const definition = DEFAULT_WORKFLOW_DEFINITION_REGISTRY.getWorkflowDefinition(workflowId);
      if (!definition) {
        const metadata = await this.recordGenericWorkflowRetirement({
          job: claimed.job,
          workflowId,
          definition: null,
          status: "definition_missing",
          reasonCodes: ["workflow_definition_missing", "generic_workflow_runner_retired"],
        });
        await this.options.runtimeJobs.failJob({
          leaseToken: claimed.leaseToken,
          error: metadata as unknown as JsonValue,
        });
        return this.empty({
          claimed: true,
          failed: true,
          status: metadata.status,
          runtimeJobId: claimed.job.jobId,
          workflowId,
          jobType: claimed.job.jobType,
          failure: { stage: "workflow_run_once", message: "generic_workflow_runner_retired" },
          reasonCodes: metadata.reasonCodes,
        });
      }
      await this.options.runtimeJobs.attachArtifact({
        jobId: claimed.job.jobId,
        artifactType: WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: `runtime-job://${claimed.job.jobId}/execution/workflow-definition/${workflowId}`,
        contentType: "application/json",
        metadata: workflowDefinitionResolutionArtifactMetadata(
          workflowDefinitionResolutionFor(definition),
        ),
      });
      const status: GenericWorkflowRunnerRetirementStatus = definition.productionEnabled
        ? "canonical_engine_required"
        : "blocked_migration_required";
      const metadata = await this.recordGenericWorkflowRetirement({
        job: claimed.job,
        workflowId,
        definition,
        status,
        reasonCodes: [
          "generic_workflow_runner_retired",
          "canonical_workflow_runtime_engine_required",
          ...workflowSpecificRetirementReasonCodes(workflowId),
          ...(definition.productionEnabled ? ["workflow_definition_production_enabled"] : []),
          ...(definition.productionEnabled ? [] : ["workflow_definition_not_production_enabled"]),
          ...(definition.schedulerBacked ? ["workflow_definition_scheduler_backed"] : []),
          ...(DEFAULT_WORKFLOW_PLUGIN_REGISTRY.hasWorkflowPlugin(workflowId)
            ? ["workflow_plugin_registered"]
            : ["workflow_plugin_missing_or_not_required"]),
        ],
      });
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: metadata as unknown as JsonValue,
      });
      return this.empty({
        claimed: true,
        failed: true,
        status,
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
        failure: { stage: "workflow_run_once", message: "generic_workflow_runner_retired" },
        reasonCodes: metadata.reasonCodes,
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
        status: "blocked_migration_required",
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
        failure: {
          stage: "workflow_run_once",
          message: error instanceof Error ? error.message : "unknown workflow run failure",
        },
        reasonCodes: ["generic_workflow_runner_retired", "workflow_run_once_failed"],
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

  private async recordGenericWorkflowRetirement(input: {
    job: RuntimeJob;
    workflowId: string;
    definition: WorkflowDefinition | null;
    status: GenericWorkflowRunnerRetirementStatus;
    reasonCodes: string[];
  }): Promise<GenericWorkflowRunnerRetirementMetadata> {
    const metadata: GenericWorkflowRunnerRetirementMetadata = {
      artifactKind: "generic_workflow_runner_retirement",
      workflowId: input.workflowId,
      status: input.status,
      definitionId: input.definition?.definitionId ?? null,
      definitionStatus: input.definition?.status ?? null,
      productionEnabled: input.definition?.productionEnabled ?? null,
      schedulerBacked: input.definition?.schedulerBacked ?? null,
      pluginRegistered: DEFAULT_WORKFLOW_PLUGIN_REGISTRY.hasWorkflowPlugin(input.workflowId),
      genericProductionSuccessAllowed: false,
      canonicalWorkflowEngineRequired: true,
      workflowQueuedRunnerRole: "migration_shim_only",
      reasonCodes: input.reasonCodes,
      ownerSummary:
        "Generic workflow dispatch is retired for production success. This workflow must run through the canonical workflow runtime engine with definition/plugin readiness, runtime tool traces, evidence profile, completion review, and model-authored closeout.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
    await this.options.runtimeJobs.recordEvent({
      jobId: input.job.jobId,
      eventType: "execution.generic_workflow_runner_retired",
      workerId: this.options.workerId,
      data: metadata as unknown as JsonValue,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.job.jobId,
      artifactType: GENERIC_WORKFLOW_RUNNER_RETIREMENT_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: `runtime-job://${input.job.jobId}/execution/generic-workflow-runner-retirement/${input.workflowId}`,
      contentType: "application/json",
      metadata: metadata as unknown as JsonValue,
    });
    return metadata;
  }

  private empty(input: Partial<WorkflowQueuedRunOnceResult>): WorkflowQueuedRunOnceResult {
    return {
      artifactKind: "workflow_queued_run_once_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      status: null,
      runtimeJobId: null,
      workflowId: null,
      jobType: null,
      failure: null,
      reasonCodes: [],
      canonicalWorkflowEngineRequired: true,
      genericProductionSuccessAllowed: false,
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
