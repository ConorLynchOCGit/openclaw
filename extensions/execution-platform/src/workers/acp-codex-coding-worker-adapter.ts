import type { AgentTeamRoleExecutionEvidence } from "../codex-bridge/agent-team-role-execution-evidence.ts";
import type { AgentTeamRuntimeEvidence } from "../codex-bridge/agent-team-runtime-evidence.ts";
import { AGENT_TEAM_JOB_TYPE } from "../codex-bridge/agent-team-runtime-evidence.ts";
import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  RuntimeWorkerSupervisorAdapter,
  RuntimeWorkerSupervisorAdapterResult,
} from "./runtime-worker-supervisor.ts";
import {
  evaluateWorkerCloseoutCapsule,
  recordWorkerCloseoutCapsule,
} from "./worker-closeout-capsule.ts";

export const ACP_CODEX_CODING_WORKER_ADAPTER_ID = "worker.acp-codex.coding" as const;

export type AcpCodexCodingWorkerRunResult = {
  status: "completed" | "needs_review" | "blocked" | "failed" | "deferred";
  summary: string;
  teamRunId: string | null;
  workflowId: "agent_team.coding";
  roleRefs: string[];
  modelRefs: string[];
  validationRefs: string[];
  reviewRefs: string[];
  closeoutRefs: string[];
  completedWorkEvidenceRefs: string[];
  artifactRefs: string[];
  closeoutCapsule?: CloseoutCapsule | null;
  evidence?: AgentTeamRuntimeEvidence | null;
  roleExecutionEvidence?: AgentTeamRoleExecutionEvidence[];
  reasonCodes: string[];
  retryDelayMs?: number;
  result?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type AcpCodexCodingWorkerRunner = {
  run(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<AcpCodexCodingWorkerRunResult>;
};

export type AcpCodexCodingWorkerAdapterOptions = {
  runtimeJobs: RuntimeJobRepository;
  runner: AcpCodexCodingWorkerRunner;
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
    .slice(0, 40);
}

export class AcpCodexCodingWorkerAdapter implements RuntimeWorkerSupervisorAdapter {
  readonly adapterId = ACP_CODEX_CODING_WORKER_ADAPTER_ID;
  readonly jobTypes = [AGENT_TEAM_JOB_TYPE];

  constructor(private readonly options: AcpCodexCodingWorkerAdapterOptions) {}

  canHandle(job: RuntimeJob): boolean {
    return (
      job.jobType === AGENT_TEAM_JOB_TYPE &&
      asRecord(job.payload).workflowId === "agent_team.coding"
    );
  }

  async execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    if (input.job.jobType !== AGENT_TEAM_JOB_TYPE) {
      return this.needsReview({
        summary: "Runtime job type is not supported by the ACP/Codex coding worker adapter.",
        reasonCodes: ["acp_codex_coding_worker_job_type_not_supported"],
      });
    }
    const payload = asRecord(input.job.payload);
    if (payload.workflowId !== "agent_team.coding") {
      return this.needsReview({
        summary: "Runtime job is not an agent_team.coding workflow.",
        reasonCodes: ["acp_codex_coding_worker_wrong_workflow"],
      });
    }
    if (hasArbitraryCommandPayload(input.job)) {
      return this.needsReview({
        summary: "Runtime job payload contained command-shaped fields that are not accepted.",
        reasonCodes: ["acp_codex_coding_worker_arbitrary_command_payload_rejected"],
      });
    }

    const run = await this.options.runner.run(input);
    const artifactRefs = boundedRefs(
      run.artifactRefs,
      run.validationRefs,
      run.reviewRefs,
      run.closeoutRefs,
      run.completedWorkEvidenceRefs,
      run.evidence?.artifactRefs,
    );
    const completedWorkEvidenceRefs = boundedRefs(
      run.completedWorkEvidenceRefs,
      run.validationRefs,
      run.reviewRefs,
      run.closeoutRefs,
    );
    if (
      run.rawPromptStored ||
      run.rawResponseStored ||
      run.rawLogsStored ||
      run.workQueueLifecycleMutated
    ) {
      return this.needsReview({
        summary: "Coding worker result violated storage or lifecycle safety flags.",
        reasonCodes: ["acp_codex_coding_worker_safety_flags_rejected"],
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
        retryDelayMs: run.retryDelayMs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    if (completedWorkEvidenceRefs.length === 0) {
      return this.needsReview({
        summary: "Coding worker claimed completion without task-specific evidence refs.",
        reasonCodes: ["acp_codex_coding_worker_completed_without_evidence"],
        artifactRefs,
      });
    }
    const closeoutEvaluation = evaluateWorkerCloseoutCapsule({
      capsule: run.closeoutCapsule,
    });
    if (!closeoutEvaluation.acceptedForCleanSuccess) {
      return this.needsReview({
        summary:
          "Coding worker completion needs review because model-authored closeout is missing or unsafe.",
        reasonCodes: closeoutEvaluation.reasonCodes,
        artifactRefs,
        completedWorkEvidenceRefs,
      });
    }
    await recordWorkerCloseoutCapsule({
      runtimeJobs: this.options.runtimeJobs,
      capsule: run.closeoutCapsule!,
    });
    return {
      status: "completed",
      summary: run.summary.slice(0, 1_000),
      result:
        run.result ??
        ({
          workflowId: run.workflowId,
          teamRunId: run.teamRunId,
          modelRefs: run.modelRefs.slice(0, 20),
          roleRefs: run.roleRefs.slice(0, 20),
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
      reasonCodes: ["acp_codex_coding_worker_completed", ...run.reasonCodes].slice(0, 30),
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
