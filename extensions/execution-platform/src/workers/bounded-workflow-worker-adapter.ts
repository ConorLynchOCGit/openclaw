import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  RuntimeWorkerSupervisorAdapter,
  RuntimeWorkerSupervisorAdapterResult,
  RuntimeWorkerSupervisorAdapterResultStatus,
} from "./runtime-worker-supervisor.ts";
import {
  evaluateWorkerCloseoutCapsule,
  recordWorkerCloseoutCapsule,
} from "./worker-closeout-capsule.ts";

export type BoundedWorkflowWorkerRunResult = {
  status: RuntimeWorkerSupervisorAdapterResultStatus;
  summary: string;
  workflowId: string;
  runId: string | null;
  roleRefs: string[];
  modelRefs: string[];
  modelRunRefs?: string[];
  sourceRefs?: string[];
  citationRefs?: string[];
  validationRefs: string[];
  reviewRefs: string[];
  closeoutRefs: string[];
  completedWorkEvidenceRefs: string[];
  artifactRefs: string[];
  closeoutCapsule?: CloseoutCapsule | null;
  reasonCodes: string[];
  result?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawProviderLogStored?: false;
  rawToolLogStored?: false;
  workQueueLifecycleMutated: false;
};

export type BoundedWorkflowWorkerRunner = {
  run(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<BoundedWorkflowWorkerRunResult>;
};

export type BoundedWorkflowWorkerAdapterOptions = {
  adapterId: string;
  workflowId: string;
  jobTypes: string[];
  runtimeJobs: RuntimeJobRepository;
  runner: BoundedWorkflowWorkerRunner;
  completionReasonCode: string;
  wrongWorkflowReasonCode: string;
  evidenceMissingReasonCode: string;
  safetyRejectedReasonCode: string;
  requireCitationRefs?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasArbitraryCommandPayload(job: RuntimeJob): boolean {
  const payload = asRecord(job.payload);
  const forbiddenFields = [
    "command",
    "commands",
    "shellCommand",
    "shellCommands",
    "rawCommand",
    "rawCommands",
    "exec",
    "spawn",
  ];
  return forbiddenFields.some((field) => field in payload);
}

function boundedRefs(...refs: Array<string[] | undefined>): string[] {
  return [...new Set(refs.flatMap((value) => value ?? []))]
    .filter((ref) => typeof ref === "string" && ref.trim().length > 0)
    .map((ref) => ref.slice(0, 260))
    .slice(0, 60);
}

export class BoundedWorkflowWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId: string;
  readonly jobTypes: string[];

  constructor(private readonly options: BoundedWorkflowWorkerAdapterOptions) {
    this.adapterId = options.adapterId;
    this.jobTypes = options.jobTypes;
  }

  canHandle(job: RuntimeJob): boolean {
    return (
      this.options.jobTypes.includes(job.jobType) &&
      asRecord(job.payload).workflowId === this.options.workflowId
    );
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    if (!this.options.jobTypes.includes(input.job.jobType)) {
      return this.needsReview({
        summary: "Runtime job type is not supported by this workflow worker adapter.",
        reasonCodes: ["bounded_workflow_worker_job_type_not_supported"],
      });
    }
    const payload = asRecord(input.job.payload);
    if (payload.workflowId !== this.options.workflowId) {
      return this.needsReview({
        summary: "Runtime job workflow does not match this worker adapter.",
        reasonCodes: [this.options.wrongWorkflowReasonCode],
      });
    }
    if (hasArbitraryCommandPayload(input.job)) {
      return this.needsReview({
        summary: "Runtime job payload contained command-shaped fields that are not accepted.",
        reasonCodes: ["bounded_workflow_worker_arbitrary_command_payload_rejected"],
      });
    }

    const run = await this.options.runner.run(input);
    const artifactRefs = boundedRefs(
      run.artifactRefs,
      run.validationRefs,
      run.reviewRefs,
      run.closeoutRefs,
      run.completedWorkEvidenceRefs,
      run.sourceRefs,
      run.citationRefs,
    );
    const completedWorkEvidenceRefs = boundedRefs(
      run.completedWorkEvidenceRefs,
      run.validationRefs,
      run.reviewRefs,
      run.closeoutRefs,
      run.sourceRefs,
      run.citationRefs,
    );
    if (
      run.rawPromptStored ||
      run.rawResponseStored ||
      run.rawLogsStored ||
      run.rawProviderLogStored ||
      run.rawToolLogStored ||
      run.workQueueLifecycleMutated
    ) {
      return this.needsReview({
        summary: "Workflow worker result violated storage or lifecycle safety flags.",
        reasonCodes: [this.options.safetyRejectedReasonCode],
        artifactRefs,
        completedWorkEvidenceRefs,
      });
    }
    if (run.status !== "completed") {
      return {
        status: run.status,
        summary: run.summary.slice(0, 1_000),
        result: run.result,
        artifactRefs,
        completedWorkEvidenceRefs,
        reasonCodes: run.reasonCodes.slice(0, 30),
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    if (completedWorkEvidenceRefs.length === 0) {
      return this.needsReview({
        summary: "Workflow worker claimed completion without task-specific evidence refs.",
        reasonCodes: [this.options.evidenceMissingReasonCode],
        artifactRefs,
      });
    }
    if (this.options.requireCitationRefs && (run.citationRefs?.length ?? 0) === 0) {
      return this.needsReview({
        summary: "Web research worker completed without bounded citation refs.",
        reasonCodes: ["web_research_worker_citation_refs_missing"],
        artifactRefs,
        completedWorkEvidenceRefs,
      });
    }

    const closeoutEvaluation = evaluateWorkerCloseoutCapsule({
      capsule: run.closeoutCapsule,
    });
    if (run.closeoutCapsule) {
      await recordWorkerCloseoutCapsule({
        runtimeJobs: this.options.runtimeJobs,
        capsule: run.closeoutCapsule,
      });
    }
    if (!closeoutEvaluation.acceptedForCleanSuccess) {
      return this.needsReview({
        summary:
          "Workflow worker completion needs review because model-authored closeout is missing or unsafe.",
        reasonCodes: closeoutEvaluation.reasonCodes,
        artifactRefs,
        completedWorkEvidenceRefs,
      });
    }
    return {
      status: "completed",
      summary: run.summary.slice(0, 1_000),
      result:
        run.result ??
        ({
          workflowId: run.workflowId,
          runId: run.runId,
          modelRefs: run.modelRefs.slice(0, 20),
          modelRunRefs: (run.modelRunRefs ?? []).slice(0, 20),
          roleRefs: run.roleRefs.slice(0, 20),
          sourceRefs: (run.sourceRefs ?? []).slice(0, 20),
          citationRefs: (run.citationRefs ?? []).slice(0, 20),
          closeoutCapsuleId: run.closeoutCapsule?.capsuleId ?? null,
          closeoutCapsuleHash: closeoutEvaluation.capsuleHash,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        } satisfies JsonValue),
      artifactRefs: boundedRefs(artifactRefs, [
        `runtime-job://${input.job.jobId}/runtime-worker/closeout-capsule-evaluation`,
      ]),
      completedWorkEvidenceRefs,
      reasonCodes: [this.options.completionReasonCode, ...run.reasonCodes].slice(0, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private needsReview(input: {
    summary: string;
    reasonCodes: string[];
    artifactRefs?: string[];
    completedWorkEvidenceRefs?: string[];
  }): RuntimeWorkerSupervisorAdapterResult {
    return {
      status: "needs_review",
      summary: input.summary,
      artifactRefs: input.artifactRefs ?? [],
      completedWorkEvidenceRefs: input.completedWorkEvidenceRefs ?? [],
      reasonCodes: input.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
