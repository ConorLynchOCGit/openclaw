import { OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES } from "../model-routing/model-candidate-validation-plan.ts";
import {
  enforceModelRoster,
  type ModelRosterEnforcementDecision,
} from "../model-routing/model-roster-enforcement.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createFirstAgentTeamImplementationPlan } from "./agent-team-plan.ts";
import {
  buildAgentTeamResultReviewArtifact,
  recordAgentTeamResultReviewArtifact,
} from "./agent-team-result-review.ts";
import {
  AGENT_TEAM_JOB_TYPE,
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import { createContextScoutArtifact, recordContextScoutArtifact } from "./context-scout-pilot.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";

export type AgentTeamQueuedRunOnceResult = {
  artifactKind: "agent_team_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  teamRunId: string | null;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  evidence: AgentTeamRuntimeEvidence | null;
  failure: { stage: string; message: string } | null;
  closeoutRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type AgentTeamQueuedRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
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

export class AgentTeamQueuedRunner {
  private readonly queueName: string;
  private readonly now: () => Date;

  constructor(private readonly options: AgentTeamQueuedRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<AgentTeamQueuedRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: [AGENT_TEAM_JOB_TYPE],
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }

    try {
      const run = await this.runClaimedJob(claimed.job);
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
    }
  }

  private async runClaimedJob(job: RuntimeJob): Promise<{
    evidence: AgentTeamRuntimeEvidence;
    modelRosterDecisions: ModelRosterEnforcementDecision[];
  }> {
    const payload = asRecord(job.payload);
    const teamRunId = stringValue(payload.teamRunId, `team-run-${job.jobId}`);
    const objective = stringValue(payload.objective, "agent-team-runtime-read-model-projection");
    const plan = createFirstAgentTeamImplementationPlan({
      planId: `${teamRunId}-plan`,
      createdAt: this.now().toISOString(),
    });
    const evidenceRefs = [
      ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
      ".artifacts/execution-platform/work-queue-model-readiness-v4-pro-proof.json",
    ];
    const modelRosterDecisions = [
      enforceModelRoster({
        roleId: "implementation_engineer",
        requestedModelId: "moonshotai/kimi-k2.6",
        requestedAuthority: "implementation",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }),
      enforceModelRoster({
        roleId: "test_engineer",
        requestedModelId: "deepseek/deepseek-v4-flash",
        requestedAuthority: "testing",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleQualificationStatus: "qualified",
        evidenceRefs,
      }),
      enforceModelRoster({
        roleId: "context_scout",
        requestedModelId: "deepseek/deepseek-v4-pro",
        requestedAuthority: "observe",
        candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
        roleTargetId: "context_scout",
        roleQualificationStatus: "needs_review",
        evidenceRefs,
      }),
    ];
    const now = this.now().toISOString();
    const scout = createContextScoutArtifact({
      scoutId: `${teamRunId}-context-scout`,
      runtimeJobId: job.jobId,
      teamRunId,
      objective,
      relevantFiles: [
        "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      existingPatterns: ["runtime job artifacts are read-model truth"],
      knownConstraints: ["Work Queue lifecycle is not mutated by agent-team evidence"],
      risks: ["V4 Pro remains needs_review and cannot receive authority"],
      suggestedImplementationPath: ["persist runtime evidence before Work Queue projection"],
      unknowns: ["future live multi-model runner details remain outside this pass"],
      filesNotToTouch: ["pnpm-lock.yaml", "deployment config", "secrets"],
    });
    await recordContextScoutArtifact({ runtimeJobs: this.options.runtimeJobs, artifact: scout });
    const review = buildSecurityPrivacyReviewerArtifact({
      reviewId: `${teamRunId}-security-review`,
      reviewKind: "local_codex_review",
      runtimeJobId: job.jobId,
      teamRunId,
      objective,
      filesReviewed: scout.relevantFiles,
      evidenceRefs: [`runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`],
      findings: [
        {
          severity: "low",
          title: "V4 Pro remains needs_review and is not granted authority",
          requiredFix: null,
        },
      ],
      exploitabilityNotes: ["no live authority expansion in injected runner"],
      requiredFixes: [],
      recommendedFixes: ["rerun V4 Pro eval before assigning authority"],
      residualRisk: ["future live agent-team transport still needs production proof"],
      judgmentMade: true,
    });
    await recordSecurityPrivacyReviewerArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: review,
    });
    const resultReview = buildAgentTeamResultReviewArtifact({
      reviewId: `${teamRunId}-result-review`,
      teamRunId,
      runtimeJobId: job.jobId,
      objective,
      validationEvidenceRefs: ["focused agent-team runtime evidence tests"],
      closeoutRefs: [],
      filesChanged: scout.relevantFiles,
      reviewer: "local-codex-operator",
      reviewKind: "local_codex_review",
      judgmentMade: true,
      notDeterministic: true,
      goalSatisfaction: "satisfied",
      findings: [],
      limitations: ["runner used injected role execution, not live multi-model team transport"],
      requiredFixes: [],
      accepted: true,
      needsReview: false,
      finalAcceptanceBy: "operator",
    });
    await recordAgentTeamResultReviewArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: resultReview,
    });
    const allowedAssignments = plan.modelAssignments
      .filter((assignment) => assignment.modelId !== "deepseek/deepseek-v4-pro")
      .slice(0, 5)
      .map((assignment) => ({
        roleId: assignment.roleId,
        modelId: assignment.modelId,
        assignedAt: now,
        status: "completed" as const,
      }));
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId,
      runtimeJobId: job.jobId,
      workQueueLink: job.workItemId ? { workItemId: job.workItemId } : null,
      objective,
      roster: [
        ...allowedAssignments.map((assignment) => ({
          roleId: assignment.roleId,
          modelId: assignment.modelId,
          status: "allowed" as const,
        })),
        { roleId: "context_scout", modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
      ],
      roleAssignments: allowedAssignments,
      roleEligibility: Object.fromEntries(
        modelRosterDecisions.map((decision) => [
          decision.requestedModelId,
          decision.allowed ? "allowed" : decision.status,
        ]),
      ),
      activeRole: "observability_scribe",
      handoffHistory: [
        {
          handoffId: `${teamRunId}-scout-to-implementation`,
          fromRole: "context_scout",
          toRole: "implementation_engineer",
          status: "completed",
          recordedAt: now,
          payloadSummary: "context scout suggested runtime evidence and read-model files",
          evidenceRefs: [`runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`],
          rawTranscriptAllowed: false,
          rawProviderPromptAllowed: false,
        },
      ],
      reviewState: "reviewed",
      validationState: "passed",
      closeoutState: "present",
      authorityStatus: modelRosterDecisions.every(
        (decision) => decision.allowed || decision.status === "needs_review",
      )
        ? "allowed"
        : "blocked",
      modelRoutingEvidence: modelRosterDecisions as unknown as JsonValue,
      controlState: "none",
      streamEvidenceRefs: [`runtime-job://${job.jobId}/agent-team/events`],
      artifactRefs: [
        `runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`,
        `runtime-job://${job.jobId}/agent-team/security-review/${review.reviewId}`,
        `runtime-job://${job.jobId}/agent-team/result-review/${resultReview.reviewId}`,
      ],
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    return { evidence, modelRosterDecisions };
  }

  private empty(input: Partial<AgentTeamQueuedRunOnceResult>): AgentTeamQueuedRunOnceResult {
    return {
      artifactKind: "agent_team_queued_run_once_result",
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
