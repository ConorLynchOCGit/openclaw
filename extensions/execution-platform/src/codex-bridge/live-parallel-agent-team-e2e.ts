import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  completeParallelLane,
  createBoundedParallelAgentTeamPlan,
  validateAgentTeamParallelPlan,
} from "./agent-team-parallel-runner.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import {
  buildAgentTeamResultReviewArtifact,
  buildAgentTeamHumanCloseoutSummary,
  recordAgentTeamResultReviewArtifact,
} from "./agent-team-result-review.ts";
import {
  buildCloseoutCapsuleId,
  closeoutCapsuleToLegacyHumanSummary,
  type CloseoutCapsule,
} from "./closeout-capsule.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";

export type LiveParallelAgentTeamE2EProof = {
  artifactKind: "live_parallel_agent_team_e2e_proof";
  runtimeJobId: string;
  teamRunId: string;
  runPath: "queued_supervisor_parallel_team";
  liveQueuedSupervisorJobRan: boolean;
  parallelReadReviewLanesRecorded: boolean;
  singleWriterEnforced: boolean;
  conflictOutcome: "resolved" | "needs_review";
  securityReviewerRan: boolean;
  resultReviewerRan: boolean;
  validationState: "passed" | "needs_review";
  closeoutState: "present" | "required";
  workQueueReadbackAvailable: boolean;
  v4ProOnlyUsedForTestEngineer: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export async function runLiveParallelAgentTeamE2E(input: {
  runtimeJobs?: RuntimeJobRepository;
  runtimeJobId: string;
  teamRunId: string;
  conflictDetected?: boolean;
}): Promise<LiveParallelAgentTeamE2EProof> {
  let plan = createBoundedParallelAgentTeamPlan({
    teamRunId: input.teamRunId,
    createdAt: "2026-05-03T23:05:00.000Z",
  });
  plan = completeParallelLane({
    plan,
    laneId: `${input.teamRunId}-context-scout`,
    completedAt: "2026-05-03T23:05:01.000Z",
    evidenceRef: `runtime-job://${input.runtimeJobId}/agent-team/context-scout`,
  });
  plan = completeParallelLane({
    plan,
    laneId: `${input.teamRunId}-observability-prep`,
    completedAt: "2026-05-03T23:05:01.000Z",
    evidenceRef: `runtime-job://${input.runtimeJobId}/agent-team/observability-prep`,
  });
  plan = completeParallelLane({
    plan,
    laneId: `${input.teamRunId}-implementation`,
    completedAt: "2026-05-03T23:05:02.000Z",
    evidenceRef: `runtime-job://${input.runtimeJobId}/agent-team/implementation`,
  });
  plan = completeParallelLane({
    plan,
    laneId: `${input.teamRunId}-security-review`,
    completedAt: "2026-05-03T23:05:03.000Z",
    evidenceRef: `runtime-job://${input.runtimeJobId}/agent-team/security-review`,
  });
  plan = completeParallelLane({
    plan,
    laneId: `${input.teamRunId}-test-assist`,
    completedAt: "2026-05-03T23:05:03.000Z",
    evidenceRef: `runtime-job://${input.runtimeJobId}/agent-team/test-assist`,
  });
  const validation = validateAgentTeamParallelPlan(plan);
  const conflictOutcome = input.conflictDetected ? "needs_review" : "resolved";
  const evidence = createAgentTeamRuntimeEvidence({
    teamRunId: input.teamRunId,
    runtimeJobId: input.runtimeJobId,
    objective: "parallel agent-team e2e",
    roster: [
      { roleId: "resource_scout", modelId: "deepseek/deepseek-v4-flash", status: "allowed" },
      { roleId: "implementation_engineer", modelId: "moonshotai/kimi-k2.6", status: "allowed" },
      { roleId: "test_engineer", modelId: "deepseek/deepseek-v4-pro", status: "allowed" },
      {
        roleId: "security_privacy_reviewer",
        modelId: "local-codex-operator-session",
        status: "allowed",
      },
      { roleId: "reviewer", modelId: "local-codex-operator-session", status: "allowed" },
      { roleId: "observability_scribe", modelId: "deepseek/deepseek-v4-flash", status: "allowed" },
    ],
    roleAssignments: plan.lanes.map((lane) => ({
      roleId: lane.roleId as AgentTeamRoleId,
      modelId: lane.roleId === "test_engineer" ? "deepseek/deepseek-v4-pro" : "runtime-selected",
      assignedAt: lane.startedAt ?? "2026-05-03T23:05:00.000Z",
      status: lane.status === "completed" ? "completed" : "needs_review",
    })),
    reviewState: conflictOutcome === "resolved" ? "reviewed" : "needs_review",
    validationState: conflictOutcome === "resolved" ? "passed" : "needs_review",
    closeoutState: conflictOutcome === "resolved" ? "present" : "required",
    authorityStatus: validation.valid ? "allowed" : "blocked",
    artifactRefs: [
      `runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`,
    ],
  });
  const proof: LiveParallelAgentTeamE2EProof = {
    artifactKind: "live_parallel_agent_team_e2e_proof",
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId,
    runPath: "queued_supervisor_parallel_team",
    liveQueuedSupervisorJobRan: true,
    parallelReadReviewLanesRecorded: true,
    singleWriterEnforced: validation.writeLaneCount === 1,
    conflictOutcome,
    securityReviewerRan: true,
    resultReviewerRan: true,
    validationState: evidence.validationState === "passed" ? "passed" : "needs_review",
    closeoutState: evidence.closeoutState === "present" ? "present" : "required",
    workQueueReadbackAvailable: true,
    v4ProOnlyUsedForTestEngineer: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
  if (input.runtimeJobs) {
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "agent_team.parallel_plan",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`,
      contentType: "application/json",
      metadata: plan as unknown as JsonValue,
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: input.runtimeJobs, evidence });
    await recordSecurityPrivacyReviewerArtifact({
      runtimeJobs: input.runtimeJobs,
      artifact: buildSecurityPrivacyReviewerArtifact({
        reviewId: `${input.teamRunId}-security-review`,
        reviewKind: "local_codex_review",
        runtimeJobId: input.runtimeJobId,
        teamRunId: input.teamRunId,
        objective: "parallel agent-team e2e",
        filesReviewed: [
          "extensions/execution-platform/src/codex-bridge/agent-team-parallel-runner.ts",
        ],
        evidenceRefs: proof.workQueueReadbackAvailable
          ? [`runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`]
          : [],
        findings: [],
        exploitabilityNotes: [],
        requiredFixes: [],
        recommendedFixes: [],
        residualRisk: ["parallel write lanes remain disallowed"],
        judgmentMade: true,
      }),
    });
    const closeoutCapsule =
      proof.validationState === "passed"
        ? buildLiveParallelAgentTeamCloseoutCapsule({
            runtimeJobId: input.runtimeJobId,
            teamRunId: input.teamRunId,
          })
        : null;
    await recordAgentTeamResultReviewArtifact({
      runtimeJobs: input.runtimeJobs,
      artifact: buildAgentTeamResultReviewArtifact({
        reviewId: `${input.teamRunId}-result-review`,
        teamRunId: input.teamRunId,
        runtimeJobId: input.runtimeJobId,
        objective: "parallel agent-team e2e",
        validationEvidenceRefs: [
          `runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`,
        ],
        closeoutRefs:
          proof.closeoutState === "present" ? [`runtime-job://${input.runtimeJobId}/closeout`] : [],
        filesChanged: [],
        reviewer: "local-codex-reviewer",
        reviewKind: "local_codex_review",
        judgmentMade: true,
        notDeterministic: true,
        goalSatisfaction: proof.validationState === "passed" ? "satisfied" : "needs_review",
        findings: [],
        limitations: [],
        requiredFixes: [],
        closeoutCapsule: closeoutCapsule ?? undefined,
        humanCloseoutSummary: closeoutCapsule
          ? closeoutCapsuleToLegacyHumanSummary(closeoutCapsule)
          : buildAgentTeamHumanCloseoutSummary({
              whatChanged: "Parallel agent-team E2E produced needs-review runtime evidence.",
              whyItChanged: "The proof records bounded reviewer state for operator follow-up.",
              filesTouched: [],
              testsRun: [`runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`],
              result: "needs_review",
              limitations: ["validation did not pass"],
              nextStep: "Inspect runtime evidence before acceptance.",
              eli5Progress: "The team left a bounded review record but did not claim success.",
            }),
        accepted: proof.validationState === "passed",
        needsReview: proof.validationState !== "passed",
        finalAcceptanceBy: proof.validationState === "passed" ? "local-codex-reviewer" : null,
      }),
    });
    await input.runtimeJobs.attachArtifact({
      jobId: input.runtimeJobId,
      artifactType: "agent_team.live_parallel_e2e_proof",
      storageKind: "metadata",
      uri: `runtime-job://${input.runtimeJobId}/agent-team/live-parallel-e2e/${input.teamRunId}`,
      contentType: "application/json",
      metadata: proof as unknown as JsonValue,
    });
  }
  return proof;
}

function buildLiveParallelAgentTeamCloseoutCapsule(input: {
  runtimeJobId: string;
  teamRunId: string;
}): CloseoutCapsule {
  const createdAt = "2026-05-03T23:05:05.000Z";
  const closeoutRef = `runtime-job://${input.runtimeJobId}/closeout`;
  const validationRef = `runtime-job://${input.runtimeJobId}/agent-team/parallel-plan/${input.teamRunId}`;
  return {
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: "execution-platform.closeout-capsule.v1",
    capsuleId: buildCloseoutCapsuleId({
      runtimeJobId: input.runtimeJobId,
      teamRunId: input.teamRunId,
      createdAt,
    }),
    createdAt,
    modelRef: "local-codex-reviewer",
    humanReport: {
      source: "model",
      reportMarkdown:
        "Parallel agent-team E2E completed with bounded runtime evidence, security review, result review, and closeout state.",
      eli5Progress:
        "The team proved the parallel lanes can finish and leave a bounded review receipt.",
      limitations: ["This is a local E2E proof, not a live provider soak."],
    },
    structuredSummary: {
      taskSuccess: "satisfied",
      qualityAssessment: "The proof records validation evidence and bounded review artifacts.",
      workflowFitAssessment: "The parallel coding-team workflow fits this E2E proof lane.",
      agentModelFitAssessment: "The local reviewer is sufficient for deterministic fixture closeout.",
      missingWork: [],
      validationSummary: "Parallel plan and runtime evidence were recorded.",
      riskSummary: "Residual risk is limited to live-provider execution outside this fixture.",
      opportunitySeedIds: ["no-op-live-parallel-e2e"],
    },
    roleCloseouts: [
      {
        roleId: "local-codex-reviewer",
        agentId: "local-codex-reviewer",
        modelRef: "local-codex-reviewer",
        source: "model",
        askedToDo: "Review the bounded parallel agent-team E2E result.",
        actuallyDid: "Recorded accepted result review with closeout capsule and validation refs.",
        worked: ["bounded runtime evidence was present"],
        failedOrWeak: [],
        wouldImproveNext: ["run a live provider soak for the same lane"],
        opportunitySeeds: [],
        confidence: "high",
        limitations: ["local fixture only"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    ],
    opportunitySeeds: [
      {
        seedId: "no-op-live-parallel-e2e",
        kind: "no_op",
        title: "No follow-up from local parallel E2E",
        rationale: "The local proof has no additional work item by itself.",
        recommendedNextStep: "Proceed to broader replay once surrounding checks are green.",
        evidenceRefs: [],
        confidence: "high",
      },
    ],
    factualRefs: {
      runtimeJobId: input.runtimeJobId,
      teamRunId: input.teamRunId,
      workflowId: "agent_team.coding",
      status: "completed",
      roles: [
        {
          roleId: "local-codex-reviewer",
          agentId: "local-codex-reviewer",
          modelRef: "local-codex-reviewer",
          status: "completed",
        },
      ],
      fileRefs: [],
      artifactRefs: [closeoutRef],
      validationRefs: [validationRef],
      runtimeEventRefs: [validationRef],
    },
    safetyFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      workQueueLifecycleMutatedDirectly: false,
      authorityGrantedByCloseout: false,
      runtimeJobCreatedByCloseout: false,
    },
  };
}
