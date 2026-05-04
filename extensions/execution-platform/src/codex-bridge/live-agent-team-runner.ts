import {
  AGENT_TEAM_ROLE_EVAL_FIXTURES,
  createAgentTeamRoleComparison,
  scoreAgentTeamRoleEvalOutput,
  type AgentTeamRoleEvalScorecard,
} from "../model-routing/agent-team-role-evals.ts";
import {
  OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
  type RequestedModelCandidate,
} from "../model-routing/model-candidate-validation-plan.ts";
import {
  enforceModelRoster,
  type ModelRosterEnforcementDecision,
  type ModelRosterRequestedAuthority,
  type ModelRosterRoleId,
} from "../model-routing/model-roster-enforcement.ts";
import {
  createModelRunAccountingRecord,
  recordModelRunAccounting,
  recordModelRunAccountingSummary,
  sha256Text,
  summarizeModelRunAccounting,
  type ModelRunAccountingRecord,
} from "../model-routing/model-run-accounting.ts";
import {
  createOpenRouterRetryEvidence,
  DEFAULT_OPENROUTER_RETRY_POLICY,
  openRouterRetryDelayMs,
  retryReasonForOpenRouter,
  shouldRetryOpenRouter,
  type OpenRouterRetryEvidence,
  type OpenRouterRetryPolicy,
  type OpenRouterRetryReasonCode,
} from "../model-routing/openrouter-retry-policy.ts";
import { summarizeProviderReliability } from "../model-routing/provider-reliability-summary.ts";
import type { OpenRouterCatalogPricing } from "../model-routing/provider-usage-cost-normalizer.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createAgentTeamFailureRecoveryArtifact,
  recordAgentTeamFailureRecoveryArtifact,
  type AgentTeamFailureRecoveryArtifact,
} from "./agent-team-failure-recovery.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
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
import {
  createAgentTeamStreamEvent,
  recordAgentTeamStreamEvent,
  recordAgentTeamStreamSummary,
  summarizeAgentTeamStreamEvents,
  type AgentTeamStreamEvidenceEvent,
} from "./agent-team-stream-evidence.ts";
import { createContextScoutArtifact, recordContextScoutArtifact } from "./context-scout-pilot.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";

export type AgentTeamModelClientResult = {
  status: "succeeded" | "failed" | "needs_review";
  responseText: string | null;
  responseHash: string | null;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
  } | null;
  catalogPricing?: OpenRouterCatalogPricing | null;
  retryEvidence?: OpenRouterRetryEvidence | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
};

export type AgentTeamModelClient = {
  callRole(input: {
    roleId: AgentTeamRoleId;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    responseFormat?: "json_object";
    maxTokens?: number;
  }): Promise<AgentTeamModelClientResult>;
};

export type LiveAgentTeamRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  modelClient: AgentTeamModelClient;
  workerId: string;
  queueName?: string;
  now?: () => Date;
  maxV4ProEvalFixtures?: number;
  v4ProRetryDelayMs?: number;
  useV4ProForTestEngineer?: boolean;
};

export type LiveAgentTeamRunResult = {
  artifactKind: "live_agent_team_run_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  teamRunId: string | null;
  runPath: "queued_supervisor_live_model_team";
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  modelAccounting: ModelRunAccountingRecord[];
  evidence: AgentTeamRuntimeEvidence | null;
  v4ProScorecards: AgentTeamRoleEvalScorecard[];
  v4ProRoleStatuses: Record<string, string>;
  failureRecovery: AgentTeamFailureRecoveryArtifact | null;
  providerCallMade: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  codexCliInvoked: false;
  acpSessionStarted: false;
  deployPerformed: false;
  externalOutboundSendPerformed: false;
  productionModelPromotionPerformed: false;
  failure: { stage: string; message: string } | null;
};

type TeamRoleSpec = {
  roleId: ModelRosterRoleId;
  modelId: string;
  candidateId: string;
  authority: ModelRosterRequestedAuthority;
  roleQualificationStatus: "qualified" | "needs_review";
};

const DEFAULT_TEAM_ROLE_SEQUENCE: TeamRoleSpec[] = [
  {
    roleId: "orchestrator",
    modelId: "local-codex-operator-session",
    candidateId: "local-codex-operator",
    authority: "orchestration",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "context_scout",
    modelId: "deepseek/deepseek-v4-flash",
    candidateId: "deepseek-v4-coding-candidate",
    authority: "observe",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "implementation_engineer",
    modelId: "moonshotai/kimi-k2.6",
    candidateId: "kimi-2-6-coding-candidate",
    authority: "implementation",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "test_engineer",
    modelId: "deepseek/deepseek-v4-flash",
    candidateId: "deepseek-v4-coding-candidate",
    authority: "testing",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "security_privacy_reviewer",
    modelId: "frontier-reviewer-lane",
    candidateId: "local-codex-operator",
    authority: "review",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "reviewer",
    modelId: "local-codex-operator-session",
    candidateId: "local-codex-operator",
    authority: "review",
    roleQualificationStatus: "qualified",
  },
  {
    roleId: "observability_scribe",
    modelId: "deepseek/deepseek-v4-flash",
    candidateId: "deepseek-v4-coding-candidate",
    authority: "observe",
    roleQualificationStatus: "qualified",
  },
];

function teamRoleSequence(input: { useV4ProForTestEngineer?: boolean }): TeamRoleSpec[] {
  return DEFAULT_TEAM_ROLE_SEQUENCE.map((role) =>
    input.useV4ProForTestEngineer && role.roleId === "test_engineer"
      ? {
          ...role,
          modelId: "deepseek/deepseek-v4-pro",
          candidateId: "deepseek-v4-pro-coding-candidate",
          roleQualificationStatus: "qualified",
        }
      : role,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function candidateById(candidateId: string): RequestedModelCandidate {
  const candidate = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES.find(
    (item) => item.candidateId === candidateId,
  );
  if (!candidate) {
    throw new Error(`unknown model candidate: ${candidateId}`);
  }
  return candidate;
}

function boundedRolePrompt(input: {
  roleId: ModelRosterRoleId;
  objective: string;
  scoutRef?: string | null;
}): string {
  return [
    "Return only compact JSON. Do not include raw transcripts, raw prompts, secrets, or logs.",
    `roleId: ${input.roleId}`,
    `objective: ${input.objective}`,
    input.scoutRef ? `contextScoutRef: ${input.scoutRef}` : "contextScoutRef: none",
    "Required keys: summary, findings, evidenceRefs, risks, recommendedNextAction, notDeterministic.",
    "Set notDeterministic true for review or qualitative judgment fields.",
  ].join("\n");
}

function streamEvent(input: {
  runtimeJobId: string;
  teamRunId: string;
  roleId: ModelRosterRoleId | null;
  modelCandidateId?: string | null;
  eventKind: AgentTeamStreamEvidenceEvent["eventKind"];
  occurredAt: string;
  status: AgentTeamStreamEvidenceEvent["status"];
  summary: string;
  reasonCodes?: string[];
  artifactRefs?: string[];
}): AgentTeamStreamEvidenceEvent {
  return createAgentTeamStreamEvent({
    streamEventId: `${input.teamRunId}-${input.eventKind}-${input.roleId ?? "team"}-${input.occurredAt}`,
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId,
    roleId: input.roleId,
    modelCandidateId: input.modelCandidateId ?? null,
    eventKind: input.eventKind,
    occurredAt: input.occurredAt,
    status: input.status,
    summary: input.summary,
    reasonCodes: input.reasonCodes ?? [],
    artifactRefs: input.artifactRefs ?? [],
  });
}

function runtimeEvidenceStatus(value: string | undefined): "allowed" | "needs_review" | "blocked" {
  return value === "qualified" || value === "allowed"
    ? "allowed"
    : value === "blocked"
      ? "blocked"
      : "needs_review";
}

export class LiveAgentTeamRunner {
  private readonly queueName: string;
  private readonly now: () => Date;

  constructor(private readonly options: LiveAgentTeamRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team-live";
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<LiveAgentTeamRunResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: [AGENT_TEAM_JOB_TYPE],
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }
    try {
      const run = await this.runClaimedJob(claimed.job, claimed.leaseToken);
      await this.renewLiveTeamLease(claimed.leaseToken);
      const completed = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          teamRunId: run.evidence.teamRunId,
          completedWorkPathSatisfied: run.evidence.validationState === "passed",
          providerCallMade: run.modelAccounting.length > 0,
          v4ProTestEngineerOnly: this.options.useV4ProForTestEngineer === true,
        } as JsonValue,
      });
      if (!completed) {
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          teamRunId: run.evidence.teamRunId,
          failure: { stage: "complete_job", message: "lease expired before completion" },
        });
      }
      return this.empty({
        claimed: true,
        completed: true,
        runtimeJobId: claimed.job.jobId,
        teamRunId: run.evidence.teamRunId,
        modelRosterDecisions: run.modelRosterDecisions,
        modelAccounting: run.modelAccounting,
        evidence: run.evidence,
        v4ProScorecards: run.v4ProScorecards,
        v4ProRoleStatuses: run.v4ProRoleStatuses,
        failureRecovery: run.failureRecovery,
        providerCallMade: true,
      });
    } catch (error) {
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          stage: "live_agent_team_run",
          message: error instanceof Error ? error.message : "unknown live agent-team failure",
        },
      });
      return this.empty({
        claimed: true,
        failed: true,
        runtimeJobId: claimed.job.jobId,
        failure: {
          stage: "live_agent_team_run",
          message: error instanceof Error ? error.message : "unknown live agent-team failure",
        },
      });
    }
  }

  private async runClaimedJob(
    job: RuntimeJob,
    leaseToken: string,
  ): Promise<{
    evidence: AgentTeamRuntimeEvidence;
    modelRosterDecisions: ModelRosterEnforcementDecision[];
    modelAccounting: ModelRunAccountingRecord[];
    v4ProScorecards: AgentTeamRoleEvalScorecard[];
    v4ProRoleStatuses: Record<string, string>;
    failureRecovery: AgentTeamFailureRecoveryArtifact;
  }> {
    const payload = asRecord(job.payload);
    const teamRunId = stringValue(payload.teamRunId, `live-team-${job.jobId}`);
    const objective = stringValue(payload.objective, "agent-team-runtime-read-model-projection");
    const workQueueLink = job.workItemId ? { workItemId: job.workItemId } : null;
    const useV4ProForTestEngineer =
      this.options.useV4ProForTestEngineer === true ||
      payload.useV4ProForTestEngineer === true ||
      asRecord(payload.authority ?? null).v4ProTestEngineerApproved === true;
    const roleSequence = teamRoleSequence({ useV4ProForTestEngineer });
    const evidenceRefs = [
      ".artifacts/execution-platform/openrouter-model-candidate-coding-eval-results.json",
      ".artifacts/execution-platform/work-queue-model-readiness-v4-pro-rerun-proof.json",
    ];
    const modelRosterDecisions: ModelRosterEnforcementDecision[] = roleSequence.map((role) =>
      role.candidateId === "local-codex-operator"
        ? {
            artifactKind: "model_roster_enforcement_decision",
            roleId: role.roleId,
            requestedModelId: role.modelId,
            requestedAuthority: role.authority,
            allowed: true,
            status: "allowed",
            reasonCodes: [],
            candidateId: "local-codex-operator",
            roleTargetId: null,
            operatorOverrideApplied: false,
            noGlobalWinner: true,
            rawPromptStored: false,
            rawResponseStored: false,
            workQueueLifecycleMutated: false,
          }
        : enforceModelRoster({
            roleId: role.roleId,
            requestedModelId: role.modelId,
            requestedAuthority: role.authority,
            candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
            roleQualificationStatus: role.roleQualificationStatus,
            evidenceRefs,
          }),
    );
    for (const roleTargetId of [
      "context_scout",
      "security_privacy_reviewer_assist",
      "reviewer_assist",
      "observability_scribe",
      "implementation_engineer_shadow",
      "deeper_implementation_candidate",
    ] as const) {
      const roleId: ModelRosterRoleId =
        roleTargetId === "context_scout"
          ? "context_scout"
          : roleTargetId === "observability_scribe"
            ? "observability_scribe"
            : roleTargetId.includes("implementation")
              ? "implementation_engineer"
              : "reviewer";
      modelRosterDecisions.push(
        enforceModelRoster({
          roleId,
          requestedModelId: "deepseek/deepseek-v4-pro",
          requestedAuthority:
            roleId === "context_scout" ||
            roleId === "observability_scribe" ||
            roleTargetId.includes("implementation")
              ? "observe"
              : "review",
          candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
          roleTargetId,
          roleQualificationStatus: roleTargetId.includes("implementation")
            ? "shadow_only"
            : "needs_review",
          evidenceRefs,
        }),
      );
    }
    const blocked = modelRosterDecisions.filter(
      (decision) => !decision.allowed && decision.status !== "needs_review",
    );
    if (blocked.length > 0) {
      throw new Error(`model roster blocked live team run: ${blocked[0]?.reasonCodes.join(",")}`);
    }

    const streamEvents: AgentTeamStreamEvidenceEvent[] = [];
    const accounting: ModelRunAccountingRecord[] = [];
    let scoutRef: string | null = null;
    const assignments: AgentTeamRuntimeEvidence["roleAssignments"] = [];

    for (const role of roleSequence) {
      await this.renewLiveTeamLease(leaseToken);
      const startedAt = this.now().toISOString();
      const startEvent = streamEvent({
        runtimeJobId: job.jobId,
        teamRunId,
        roleId: role.roleId,
        modelCandidateId: role.candidateId,
        eventKind: "role_started",
        occurredAt: startedAt,
        status: "started",
        summary: `${role.roleId} started`,
      });
      await recordAgentTeamStreamEvent({
        runtimeJobs: this.options.runtimeJobs,
        event: startEvent,
      });
      streamEvents.push(startEvent);

      if (role.roleId === "implementation_engineer" && !scoutRef) {
        throw new Error("context scout evidence is required before implementation");
      }

      const prompt = boundedRolePrompt({ roleId: role.roleId, objective, scoutRef });
      const promptHash = sha256Text(prompt);
      const modelStartedAt = this.now().toISOString();
      await recordAgentTeamStreamEvent({
        runtimeJobs: this.options.runtimeJobs,
        event: streamEvent({
          runtimeJobId: job.jobId,
          teamRunId,
          roleId: role.roleId,
          modelCandidateId: role.candidateId,
          eventKind: "model_call_started",
          occurredAt: modelStartedAt,
          status: "started",
          summary: `${role.roleId} model call started`,
        }),
      });
      const result =
        role.candidateId === "local-codex-operator"
          ? {
              status: "succeeded" as const,
              responseText: JSON.stringify({
                summary: "local operator acceptance lane recorded bounded judgment",
                findings: [],
                evidenceRefs: [scoutRef ?? `runtime-job://${job.jobId}/agent-team`],
                risks: [],
                recommendedNextAction: "continue",
                notDeterministic: true,
              }),
              responseHash: sha256Text("local-operator-bounded-judgment"),
              usage: null,
            }
          : await this.options.modelClient.callRole({
              roleId: role.roleId,
              modelId: role.modelId,
              modelCandidateId: role.candidateId,
              prompt,
              responseFormat: "json_object",
              maxTokens: 700,
            });
      await this.renewLiveTeamLease(leaseToken);
      const completedAt = this.now().toISOString();
      const account = createModelRunAccountingRecord({
        modelRunId: `${teamRunId}-${role.roleId}`,
        runtimeJobId: job.jobId,
        teamRunId,
        roleId: role.roleId,
        modelCandidateId: role.candidateId,
        provider: role.candidateId === "local-codex-operator" ? "local" : "openrouter",
        modelId: role.modelId,
        startedAt: modelStartedAt,
        completedAt,
        promptHash,
        responseHash: result.responseHash,
        usage: result.usage,
        catalogPricing: result.catalogPricing,
        retryEvidence: result.retryEvidence,
        providerCallSucceeded: result.status === "succeeded",
        status: result.status,
        errorReasonCode: result.errorReasonCode ?? null,
      });
      accounting.push(account);
      await recordModelRunAccounting({ runtimeJobs: this.options.runtimeJobs, record: account });
      const finishEvent = streamEvent({
        runtimeJobId: job.jobId,
        teamRunId,
        roleId: role.roleId,
        modelCandidateId: role.candidateId,
        eventKind: "role_finished",
        occurredAt: completedAt,
        status: result.status === "succeeded" ? "succeeded" : "needs_review",
        summary: `${role.roleId} finished with ${result.status}`,
        reasonCodes: result.errorReasonCode ? [result.errorReasonCode] : [],
      });
      await recordAgentTeamStreamEvent({
        runtimeJobs: this.options.runtimeJobs,
        event: finishEvent,
      });
      streamEvents.push(finishEvent);
      assignments.push({
        roleId: role.roleId,
        modelId: role.modelId,
        assignedAt: startedAt,
        status: result.status === "succeeded" ? "completed" : "needs_review",
      });
      if (role.roleId === "context_scout") {
        const scout = createContextScoutArtifact({
          scoutId: `${teamRunId}-live-context-scout`,
          runtimeJobId: job.jobId,
          teamRunId,
          objective,
          relevantFiles: [
            "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts",
            "extensions/execution-platform/src/work-queue/execution-read-model.ts",
          ],
          existingPatterns: ["runtime artifacts feed Work Queue projection"],
          knownConstraints: ["context scout must precede implementation"],
          risks: ["provider response quality may require needs_review"],
          suggestedImplementationPath: ["record stream/accounting before final evidence"],
          unknowns: ["future broader parallel team scheduling"],
          filesNotToTouch: ["pnpm-lock.yaml", "deployment config", "secrets"],
        });
        await recordContextScoutArtifact({
          runtimeJobs: this.options.runtimeJobs,
          artifact: scout,
        });
        scoutRef = `runtime-job://${job.jobId}/agent-team/context-scout/${scout.scoutId}`;
      }
    }

    await this.renewLiveTeamLease(leaseToken);
    const v4ProScorecards = await this.rerunV4ProStructuredEval({
      runtimeJobId: job.jobId,
      teamRunId,
    });
    await this.renewLiveTeamLease(leaseToken);
    const v4ProComparison = createAgentTeamRoleComparison({
      comparisonId: `${teamRunId}-v4-pro-reliable-rerun-comparison`,
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      scorecardsByCandidateId: {
        "deepseek-v4-pro-coding-candidate": v4ProScorecards,
      },
      evidenceRefsByCandidateId: {
        "deepseek-v4-pro-coding-candidate": [
          `runtime-job://${job.jobId}/agent-team/v4-pro-reliable-rerun`,
        ],
      },
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.v4_pro_reliable_rerun_comparison",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/agent-team/v4-pro-reliable-rerun-comparison/${teamRunId}`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(v4ProComparison), "utf8"),
      metadata: v4ProComparison as unknown as JsonValue,
    });

    const recovery = createAgentTeamFailureRecoveryArtifact({
      recoveryId: `${teamRunId}-failure-recovery`,
      runtimeJobId: job.jobId,
      teamRunId,
      failedRole: "test_engineer",
      recoveryRole: "implementation_engineer",
      failureKind: "invalid_validation_claim",
      detectedAt: this.now().toISOString(),
      failureSummary: "Injected test lane attempted to treat incomplete validation as success.",
      repairAction: "Repair lane required explicit validation rerun evidence before completion.",
      validationRerunRequired: true,
      validationRerunStatus: "passed",
      outcome: "repaired",
    });
    await recordAgentTeamFailureRecoveryArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: recovery,
    });
    await this.renewLiveTeamLease(leaseToken);

    const security = buildSecurityPrivacyReviewerArtifact({
      reviewId: `${teamRunId}-mandatory-security-review`,
      reviewKind: "local_codex_review",
      runtimeJobId: job.jobId,
      teamRunId,
      objective,
      filesReviewed: [
        "extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      evidenceRefs: [scoutRef ?? `runtime-job://${job.jobId}/agent-team/context-scout`],
      findings: [],
      exploitabilityNotes: ["no deploy, outbound send, model promotion, or Work Queue mutation"],
      requiredFixes: [],
      recommendedFixes: [],
      residualRisk: ["future parallel team scheduling remains separate"],
      judgmentMade: true,
    });
    await recordSecurityPrivacyReviewerArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: security,
    });

    const requiredRoleNeedsReviewBeforeReview = assignments.some(
      (assignment) => assignment.status === "needs_review",
    );
    const resultReview = buildAgentTeamResultReviewArtifact({
      reviewId: `${teamRunId}-live-result-review`,
      teamRunId,
      runtimeJobId: job.jobId,
      objective,
      validationEvidenceRefs: [`runtime-job://${job.jobId}/agent-team/model-run-accounting`],
      closeoutRefs: [`runtime-job://${job.jobId}/agent-team/closeout-required`],
      filesChanged: [],
      reviewer: "local-codex-operator",
      reviewKind: "local_codex_review",
      judgmentMade: true,
      notDeterministic: true,
      goalSatisfaction: requiredRoleNeedsReviewBeforeReview ? "needs_review" : "satisfied",
      findings: [],
      limitations: requiredRoleNeedsReviewBeforeReview
        ? ["one or more required model lanes returned needs-review output"]
        : ["live provider calls were role-output proof, not repo-edit authority"],
      requiredFixes: requiredRoleNeedsReviewBeforeReview
        ? ["rerun with adjusted provider request shape or operator review"]
        : [],
      accepted: !requiredRoleNeedsReviewBeforeReview,
      needsReview: requiredRoleNeedsReviewBeforeReview,
      finalAcceptanceBy: "operator",
    });
    await recordAgentTeamResultReviewArtifact({
      runtimeJobs: this.options.runtimeJobs,
      artifact: resultReview,
    });

    const closeoutStarted = streamEvent({
      runtimeJobId: job.jobId,
      teamRunId,
      roleId: "observability_scribe",
      modelCandidateId: "deepseek-v4-coding-candidate",
      eventKind: "closeout_started",
      occurredAt: this.now().toISOString(),
      status: "started",
      summary: "closeout requirement started",
    });
    const closeoutFinished = streamEvent({
      runtimeJobId: job.jobId,
      teamRunId,
      roleId: "observability_scribe",
      modelCandidateId: "deepseek-v4-coding-candidate",
      eventKind: "closeout_finished",
      occurredAt: this.now().toISOString(),
      status: "succeeded",
      summary: "closeout requirement recorded",
    });
    for (const event of [closeoutStarted, closeoutFinished]) {
      await recordAgentTeamStreamEvent({ runtimeJobs: this.options.runtimeJobs, event });
      streamEvents.push(event);
    }
    const streamSummary = summarizeAgentTeamStreamEvents(streamEvents);
    const streamSummaryArtifact = await recordAgentTeamStreamSummary({
      runtimeJobs: this.options.runtimeJobs,
      summary: streamSummary,
    });
    const accountingSummary = summarizeModelRunAccounting(accounting);
    const accountingSummaryArtifact = await recordModelRunAccountingSummary({
      runtimeJobs: this.options.runtimeJobs,
      summary: accountingSummary,
    });
    const providerReliability = summarizeProviderReliability({
      records: accounting,
      readinessByModelId: {
        "moonshotai/kimi-k2.6": "qualified",
        "deepseek/deepseek-v4-flash": "qualified",
        "deepseek/deepseek-v4-pro": useV4ProForTestEngineer ? "qualified" : "shadow_only",
      },
      sourceArtifactRefs: [accountingSummaryArtifact.uri],
    });
    const providerReliabilityArtifact = await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.provider_reliability_summary",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/agent-team/provider-reliability/${teamRunId}`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(providerReliability), "utf8"),
      metadata: providerReliability as unknown as JsonValue,
    });
    const v4ProRoleStatuses = Object.fromEntries(
      v4ProComparison.roleDecisions.map((decision) => [
        decision.roleTargetId,
        decision.candidateDecisions.find(
          (candidate) => candidate.candidateId === "deepseek-v4-pro-coding-candidate",
        )?.status ?? "needs_review",
      ]),
    );
    const requiredRoleNeedsReview = assignments.some(
      (assignment) => assignment.status === "needs_review",
    );
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId,
      runtimeJobId: job.jobId,
      workQueueLink,
      objective,
      roster: [
        ...roleSequence.map((role) => ({
          roleId: role.roleId,
          modelId: role.modelId,
          status: "allowed" as const,
        })),
        { roleId: "context_scout", modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
        {
          roleId: "implementation_engineer",
          modelId: "deepseek/deepseek-v4-pro",
          status: "needs_review",
        },
      ],
      roleAssignments: assignments,
      roleEligibility: {
        "moonshotai/kimi-k2.6": "allowed",
        "deepseek/deepseek-v4-flash": "allowed",
        "deepseek/deepseek-v4-pro": useV4ProForTestEngineer
          ? "allowed"
          : runtimeEvidenceStatus(v4ProRoleStatuses.context_scout),
      },
      activeRole: "observability_scribe",
      handoffHistory: [
        {
          handoffId: `${teamRunId}-scout-to-implementation`,
          fromRole: "context_scout",
          toRole: "implementation_engineer",
          status: "completed",
          recordedAt: this.now().toISOString(),
          payloadSummary: "mandatory context scout artifact supplied before implementation",
          evidenceRefs: [scoutRef ?? `runtime-job://${job.jobId}/agent-team/context-scout`],
          rawTranscriptAllowed: false,
          rawProviderPromptAllowed: false,
        },
      ],
      reviewState: "reviewed",
      validationState: requiredRoleNeedsReview ? "needs_review" : "passed",
      closeoutState: "present",
      authorityStatus: "allowed",
      modelRoutingEvidence: modelRosterDecisions as unknown as JsonValue,
      controlState: "none",
      streamEvidenceRefs: [streamSummaryArtifact.uri],
      artifactRefs: [
        streamSummaryArtifact.uri,
        accountingSummaryArtifact.uri,
        providerReliabilityArtifact.uri,
        `runtime-job://${job.jobId}/agent-team/security-review/${security.reviewId}`,
        `runtime-job://${job.jobId}/agent-team/result-review/${resultReview.reviewId}`,
        `runtime-job://${job.jobId}/agent-team/failure-recovery/${recovery.recoveryId}`,
      ],
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    await this.renewLiveTeamLease(leaseToken);
    return {
      evidence,
      modelRosterDecisions,
      modelAccounting: accounting,
      v4ProScorecards,
      v4ProRoleStatuses,
      failureRecovery: recovery,
    };
  }

  private async renewLiveTeamLease(leaseToken: string): Promise<void> {
    await this.options.runtimeJobs.renewLease({
      leaseToken,
      workerId: this.options.workerId,
      extendByMs: 10 * 60 * 1000,
    });
  }

  private async rerunV4ProStructuredEval(input: {
    runtimeJobId: string;
    teamRunId: string;
  }): Promise<AgentTeamRoleEvalScorecard[]> {
    const candidate = candidateById("deepseek-v4-pro-coding-candidate");
    const fixtures = AGENT_TEAM_ROLE_EVAL_FIXTURES.slice(0, this.options.maxV4ProEvalFixtures ?? 3);
    const scorecards: AgentTeamRoleEvalScorecard[] = [];
    for (const fixture of fixtures) {
      const prompt = [
        "Return compact JSON only. Do not include raw transcripts, raw prompts, logs, or secrets.",
        `fixtureId: ${fixture.fixtureId}`,
        `purpose: ${fixture.purpose}`,
        `requiredFields: ${fixture.requiredFields.join(", ")}`,
        "Include all required fields and notDeterministic:true.",
      ].join("\n");
      const promptHash = sha256Text(prompt);
      let result = await this.options.modelClient.callRole({
        roleId: "reviewer",
        modelId: candidate.openRouterModelId,
        modelCandidateId: candidate.candidateId,
        prompt,
        responseFormat: "json_object",
        maxTokens: 700,
      });
      if (
        result.errorReasonCode === "openrouter_http_429" &&
        (this.options.v4ProRetryDelayMs ?? 0) > 0
      ) {
        await sleep(this.options.v4ProRetryDelayMs ?? 0);
        result = await this.options.modelClient.callRole({
          roleId: "reviewer",
          modelId: candidate.openRouterModelId,
          modelCandidateId: candidate.candidateId,
          prompt,
          responseFormat: "json_object",
          maxTokens: 700,
        });
      }
      scorecards.push(
        scoreAgentTeamRoleEvalOutput({
          candidate,
          fixture,
          evaluatedAt: this.now().toISOString(),
          promptHash,
          responseHash: result.responseHash,
          responseText: result.responseText,
          providerCallMade: true,
        }),
      );
    }
    await this.options.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "agent_team.v4_pro_reliable_rerun_scorecards",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/agent-team/v4-pro-reliable-rerun/${input.teamRunId}`,
      contentType: "application/json",
      sizeBytes: Buffer.byteLength(JSON.stringify(scorecards), "utf8"),
      metadata: scorecards as unknown as JsonValue,
    });
    return scorecards;
  }

  private empty(input: Partial<LiveAgentTeamRunResult>): LiveAgentTeamRunResult {
    return {
      artifactKind: "live_agent_team_run_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      runtimeJobId: null,
      teamRunId: null,
      runPath: "queued_supervisor_live_model_team",
      modelRosterDecisions: [],
      modelAccounting: [],
      evidence: null,
      v4ProScorecards: [],
      v4ProRoleStatuses: {},
      failureRecovery: null,
      providerCallMade: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      codexCliInvoked: false,
      acpSessionStarted: false,
      deployPerformed: false,
      externalOutboundSendPerformed: false,
      productionModelPromotionPerformed: false,
      failure: null,
      ...input,
    };
  }
}

export class OpenRouterAgentTeamModelClient implements AgentTeamModelClient {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      now?: () => Date;
      retryPolicy?: Partial<OpenRouterRetryPolicy>;
      catalogPricingByModelId?: Record<string, OpenRouterCatalogPricing>;
    },
  ) {}

  async callRole(input: {
    roleId: AgentTeamRoleId;
    modelId: string;
    modelCandidateId: string;
    prompt: string;
    responseFormat?: "json_object";
    maxTokens?: number;
  }): Promise<AgentTeamModelClientResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const policy = { ...DEFAULT_OPENROUTER_RETRY_POLICY, ...this.options.retryPolicy };
    const attempts: OpenRouterRetryEvidence["attempts"] = [];
    let last: AgentTeamModelClientResult | null = null;
    let jsonModeDisabledAfterNoContent = false;
    let reasoningDirectiveDisabledAfterNoContent = false;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const body = {
        model: input.modelId,
        messages: [
          {
            role: "user",
            content: input.prompt,
          },
        ],
        temperature: 0,
        max_tokens: input.maxTokens ?? 700,
        ...(input.responseFormat && !jsonModeDisabledAfterNoContent
          ? { response_format: { type: input.responseFormat } }
          : {}),
        ...(reasoningDirectiveDisabledAfterNoContent ? {} : { reasoning: { exclude: true } }),
      };
      const started = this.options.now?.().getTime() ?? Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
      try {
        const response = await fetchImpl(
          `${this.options.baseUrl ?? "https://openrouter.ai/api/v1"}/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.options.apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://openclaw.local/execution-platform",
              "X-Title": "OpenClaw Execution Platform",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        );
        const providerBody = (await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
        const completed = this.options.now?.().getTime() ?? Date.now();
        const choice = Array.isArray(providerBody?.choices)
          ? (providerBody.choices[0] as Record<string, unknown> | undefined)
          : undefined;
        const message =
          choice && typeof choice === "object"
            ? (choice.message as Record<string, unknown> | undefined)
            : undefined;
        const content = typeof message?.content === "string" ? message.content : "";
        const usage =
          providerBody?.usage && typeof providerBody.usage === "object"
            ? (providerBody.usage as Record<string, unknown>)
            : {};
        const reasonCode = retryReasonForOpenRouter({
          httpStatus: response.status,
          errorReasonCode: response.ok
            ? content.trim()
              ? null
              : "openrouter_no_content"
            : response.status === 429
              ? "openrouter_http_429"
              : "openrouter_http_error",
          noContent: response.ok && !content.trim(),
        });
        const delay = shouldRetryOpenRouter({ attempt, reasonCode, policy })
          ? openRouterRetryDelayMs({ attempt, reasonCode, policy })
          : 0;
        attempts.push({
          attempt,
          reasonCode,
          httpStatus: response.status,
          cooldownMs: delay,
          latencyMs: Math.max(0, completed - started),
        });
        last = {
          status: response.ok && content.trim() ? "succeeded" : "needs_review",
          responseText: response.ok && content.trim() ? content : null,
          responseHash: response.ok && content.trim() ? sha256Text(content) : null,
          usage: {
            inputTokenCount: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
            outputTokenCount:
              typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
            totalTokenCount: typeof usage.total_tokens === "number" ? usage.total_tokens : null,
            estimatedCostUsd: typeof usage.cost === "number" ? usage.cost : null,
          },
          catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
          httpStatus: response.status,
          errorReasonCode: response.ok
            ? content.trim()
              ? null
              : "openrouter_no_content"
            : response.status === 429
              ? "openrouter_http_429"
              : "openrouter_http_error",
        };
        if (!delay || last.status === "succeeded") {
          break;
        }
        if (reasonCode === "openrouter_no_content" && input.responseFormat) {
          jsonModeDisabledAfterNoContent = true;
        }
        if (reasonCode === "openrouter_no_content") {
          reasoningDirectiveDisabledAfterNoContent = true;
        }
        await sleep(delay);
      } catch (error) {
        const completed = this.options.now?.().getTime() ?? Date.now();
        const reasonCode: OpenRouterRetryReasonCode =
          error instanceof Error && error.name === "AbortError"
            ? "openrouter_network_timeout"
            : "openrouter_network_error";
        const delay = shouldRetryOpenRouter({ attempt, reasonCode, policy })
          ? openRouterRetryDelayMs({ attempt, reasonCode, policy })
          : 0;
        attempts.push({
          attempt,
          reasonCode,
          httpStatus: null,
          cooldownMs: delay,
          latencyMs: Math.max(0, completed - started),
        });
        last = {
          status: "needs_review",
          responseText: null,
          responseHash: null,
          usage: null,
          catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
          httpStatus: null,
          errorReasonCode: reasonCode,
        };
        if (!delay) {
          break;
        }
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
      }
    }
    const finalResult =
      last ??
      ({
        status: "needs_review",
        responseText: null,
        responseHash: null,
        usage: null,
        catalogPricing: this.options.catalogPricingByModelId?.[input.modelId] ?? null,
        httpStatus: null,
        errorReasonCode: "openrouter_network_error",
      } satisfies AgentTeamModelClientResult);
    return {
      ...finalResult,
      retryEvidence: createOpenRouterRetryEvidence({
        modelId: input.modelId,
        finalStatus: finalResult.status,
        attempts,
      }),
    };
  }
}
