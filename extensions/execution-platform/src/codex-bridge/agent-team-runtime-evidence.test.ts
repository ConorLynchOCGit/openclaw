import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  applyAgentTeamHandoffControl,
  recordAgentTeamHandoffControl,
} from "./agent-team-handoff-controls.ts";
import {
  buildAgentTeamHumanCloseoutSummary,
  buildAgentTeamResultReviewArtifact,
  validateAgentTeamResultReviewArtifact,
} from "./agent-team-result-review.ts";
import {
  AGENT_TEAM_JOB_TYPE,
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import {
  buildSecurityPrivacyReviewerArtifact,
  recordSecurityPrivacyReviewerArtifact,
  validateSecurityPrivacyReviewerArtifact,
} from "./security-privacy-reviewer.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-03T16:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T16:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

describe("agent-team runtime evidence", () => {
  it("persists role assignments, handoffs, validation, review, closeout, and Work Queue projection", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "agent-team-work-item",
        itemType: "agent_team_task",
        title: "Agent-team projection",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "agent-team-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        workItemId: workItem.workItemId,
        payload: { objective: "agent-team-runtime-read-model-projection" },
      });
      await workQueue.createWorkRun({
        runId: "agent-team-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        metadata: { runKind: "agent_team" },
      });
      const evidence = createAgentTeamRuntimeEvidence({
        teamRunId: "team-run-1",
        runtimeJobId: runtimeJob.jobId,
        workQueueLink: { workItemId: workItem.workItemId, runId: "agent-team-work-run" },
        objective: "agent-team-runtime-read-model-projection",
        roster: [
          { roleId: "implementation_engineer", modelId: "moonshotai/kimi-k2.6", status: "allowed" },
          { roleId: "context_scout", modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
        ],
        roleAssignments: [
          {
            roleId: "implementation_engineer",
            modelId: "moonshotai/kimi-k2.6",
            assignedAt: "2026-05-03T16:00:00.000Z",
            status: "completed",
          },
        ],
        roleEligibility: {
          "moonshotai/kimi-k2.6": "allowed",
          "deepseek/deepseek-v4-pro": "needs_review",
        },
        activeRole: "observability_scribe",
        handoffHistory: [
          {
            handoffId: "handoff-1",
            fromRole: "context_scout",
            toRole: "implementation_engineer",
            status: "completed",
            recordedAt: "2026-05-03T16:00:00.000Z",
            payloadSummary: "bounded scout output",
            evidenceRefs: ["artifact:scout"],
            rawTranscriptAllowed: false,
            rawProviderPromptAllowed: false,
          },
        ],
        reviewState: "reviewed",
        validationState: "passed",
        closeoutState: "present",
        authorityStatus: "allowed",
      });

      await recordAgentTeamRuntimeEvidence({ runtimeJobs, evidence });
      const events = await runtimeJobs.listEvents(runtimeJob.jobId);
      const artifacts = await runtimeJobs.listArtifacts(runtimeJob.jobId);
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
        now: new Date("2026-05-03T16:00:00.000Z"),
      });

      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "agent_team.role_assigned",
          "agent_team.handoff_recorded",
          "agent_team.validation_recorded",
          "agent_team.review_recorded",
          "agent_team.closeout_recorded",
          "agent_team.authority_status_recorded",
          "agent_team.run_completed",
        ]),
      );
      expect(artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "agent_team.runtime_evidence" }),
        ]),
      );
      expect(model.runtimeJobs[0]?.agentTeam).toMatchObject({
        agentTeamRunId: "team-run-1",
        currentTeamState: "completed",
        activeRole: "observability_scribe",
        completedRoles: ["implementation_engineer"],
        needsReviewRoles: ["context_scout"],
        validationState: "passed",
        reviewState: "reviewed",
        closeoutState: "present",
        workQueueLifecycleMutationAllowed: false,
      });
      expect(model.runtimeJobs[0]?.agentTeam.modelReadiness).toEqual(
        expect.arrayContaining([{ modelId: "deepseek/deepseek-v4-pro", status: "needs_review" }]),
      );
    });
  });

  it("records security/privacy review separately from final acceptance", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "security-review-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const artifact = buildSecurityPrivacyReviewerArtifact({
        reviewId: "security-review-1",
        reviewKind: "model_review_assist",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        objective: "review projection helper",
        filesReviewed: [
          "extensions/execution-platform/src/codex-bridge/agent-team-runtime-evidence.ts",
        ],
        evidenceRefs: ["artifact:evidence"],
        findings: [
          { severity: "medium", title: "authority boundary needs evidence", requiredFix: null },
        ],
        exploitabilityNotes: ["no exploit path in test fixture"],
        requiredFixes: [],
        recommendedFixes: ["keep V4 Pro needs_review"],
        residualRisk: ["future live runner not covered"],
        judgmentMade: true,
      });

      expect(validateSecurityPrivacyReviewerArtifact(artifact)).toMatchObject({ valid: true });
      await recordSecurityPrivacyReviewerArtifact({ runtimeJobs, artifact });
      expect(
        (await runtimeJobs.listArtifacts(runtimeJob.jobId)).map((item) => item.artifactType),
      ).toContain("agent_team.security_privacy_review");
      expect(
        validateSecurityPrivacyReviewerArtifact({
          ...artifact,
          findings: [{ severity: "high", title: "high risk", requiredFix: "fix" }],
        }),
      ).toMatchObject({ valid: false, blockingReasons: ["high_risk_finding_blocks_completion"] });
    });
  });

  it("applies pause redirect cancel controls at handoff boundaries", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "handoff-control-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const redirect = applyAgentTeamHandoffControl({
        commandId: "redirect-1",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        commandKind: "redirect",
        targetHandoffId: "handoff-1",
        actor: "operator",
        reason: "send to tester",
        nextRole: "test_engineer",
        redirectPayloadSummary: "rerun validation before review",
      });
      const unsafe = applyAgentTeamHandoffControl({
        commandId: "redirect-unsafe",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run-1",
        commandKind: "redirect",
        targetHandoffId: "handoff-1",
        actor: "operator",
        reason: "include raw prompt",
        nextRole: "test_engineer",
        redirectPayloadSummary: "raw prompt marker",
      });

      await recordAgentTeamHandoffControl({ runtimeJobs, command: redirect });
      expect(redirect).toMatchObject({
        status: "applied",
        nextRole: "test_engineer",
        liveProcessSignalSent: false,
        promptInjectedIntoLiveProcess: false,
        workQueueLifecycleMutated: false,
      });
      expect(unsafe).toMatchObject({ status: "rejected", nextRole: null });
      expect(
        (await runtimeJobs.listArtifacts(runtimeJob.jobId)).map((item) => item.artifactType),
      ).toContain("agent_team.handoff_control");
    });
  });

  it("requires qualitative result review before completed-work success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "result-review-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
      });
      const artifact = buildAgentTeamResultReviewArtifact({
        reviewId: "result-review-1",
        teamRunId: "team-run-1",
        runtimeJobId: runtimeJob.jobId,
        objective: "projection helper",
        validationEvidenceRefs: ["validation:passed"],
        closeoutRefs: ["closeout:pack"],
        filesChanged: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        reviewer: "operator",
        reviewKind: "local_codex_review",
        judgmentMade: true,
        notDeterministic: true,
        goalSatisfaction: "satisfied",
        findings: [],
        limitations: [],
        requiredFixes: [],
        humanCloseoutSummary: buildAgentTeamHumanCloseoutSummary({
          whatChanged: "Recorded a bounded result review.",
          whyItChanged: "The operator needs readable closeout.",
          filesTouched: [
            "extensions/execution-platform/src/codex-bridge/agent-team-result-review.ts",
          ],
          testsRun: ["focused result review test"],
          result: "accepted",
          nextStep: "continue",
          eli5Progress: "The review now explains the result in plain language.",
        }),
        accepted: true,
        needsReview: false,
        finalAcceptanceBy: "operator",
      });

      expect(validateAgentTeamResultReviewArtifact(artifact)).toEqual({
        valid: false,
        blockingReasons: ["accepted_result_requires_model_closeout_capsule"],
      });
    });
  });
});
