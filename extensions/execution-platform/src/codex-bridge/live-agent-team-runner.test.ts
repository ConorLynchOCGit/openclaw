import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createAgentTeamFailureRecoveryArtifact,
  recordAgentTeamFailureRecoveryArtifact,
} from "./agent-team-failure-recovery.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { LiveAgentTeamRunner, type AgentTeamModelClient } from "./live-agent-team-runner.ts";

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
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

function fakeClient(): AgentTeamModelClient {
  return {
    async callRole(input) {
      const responseText = JSON.stringify({
        summary: `${input.roleId} completed bounded role output`,
        findings: [],
        evidenceRefs: [`artifact://${input.roleId}`],
        risks: [],
        recommendedNextAction: "continue",
        notDeterministic: true,
        relevantFiles: ["extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts"],
        existingPatterns: ["runtime job evidence"],
        knownConstraints: ["no raw prompt storage"],
        suggestedImplementationPath: ["persist evidence before projection"],
        unknowns: [],
        behaviorTestGaps: [],
        brittleSchemaConcerns: [],
        missingNegativeCases: [],
        validationRepairExpectations: ["rerun focused tests"],
        severity: "low",
        exploitabilityNotes: [],
        requiredFixes: [],
        recommendedFixes: [],
        residualRisk: [],
        validationFailed: false,
        diagnosis: "bounded",
        repairPlan: [],
        rerunPlan: [],
        needsReviewIfUnresolved: true,
        boundedPayloadFields: ["summary", "artifactRefs"],
        rejectedContent: ["raw prompts"],
        scopeBoundary: "agent-team runtime",
        artifactRefs: [`artifact://${input.roleId}`],
        workQueueLifecycleMutationAllowed: false,
        validationResult: "passed",
        qualitativeJudgment: "bounded assist only",
        judgmentMade: true,
        limitations: [],
      });
      return {
        status: "succeeded",
        responseText,
        responseHash: `sha256:${input.roleId}`,
        usage: {
          inputTokenCount: 100,
          outputTokenCount: 50,
          totalTokenCount: 150,
          estimatedCostUsd: 0.001,
        },
      } as const;
    },
  };
}

describe("live agent-team runner", () => {
  it("claims one team job, records live-shaped stream/accounting/review evidence, and projects to Work Queue", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const workItem = await workQueue.createWorkItem({
        workItemId: "live-team-work-item",
        itemType: "agent_team_task",
        title: "Live team projection",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "live-team-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team-live",
        workItemId: workItem.workItemId,
        payload: {
          teamRunId: "live-team-run",
          objective: "agent-team-runtime-read-model-projection",
        },
      });
      await workQueue.createWorkRun({
        runId: "live-team-work-run",
        workItemId: workItem.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
      });

      const result = await new LiveAgentTeamRunner({
        runtimeJobs,
        workerId: "live-team-worker",
        queueName: "agent-team-live",
        modelClient: fakeClient(),
        maxV4ProEvalFixtures: 2,
      }).runOnce();
      const artifacts = await runtimeJobs.listArtifacts(runtimeJob.jobId);
      const events = await runtimeJobs.listEvents(runtimeJob.jobId);
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
        now: new Date("2026-05-03T17:00:00.000Z"),
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: true,
        providerCallMade: true,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
        codexCliInvoked: false,
      });
      expect(result.modelRosterDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            requestedModelId: "deepseek/deepseek-v4-pro",
            allowed: false,
            status: "needs_review",
          }),
        ]),
      );
      expect(events.map((event) => event.eventType)).toContain("agent_team.stream_event");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "agent_team.stream_summary",
          "agent_team.model_run_accounting_summary",
          "agent_team.failure_recovery",
          "agent_team.security_privacy_review",
          "agent_team.result_review",
          "agent_team.runtime_evidence",
        ]),
      );
      expect(model.runtimeJobs[0]?.agentTeam).toMatchObject({
        agentTeamRunId: "live-team-run",
        validationState: "passed",
        reviewState: "reviewed",
        closeoutState: "present",
        securityReviewState: "local_codex_review",
        failureRecoveryState: "repaired",
      });
      expect(model.runtimeJobs[0]?.agentTeam.teamStreamSummary.eventCount).toBeGreaterThan(0);
      expect(model.runtimeJobs[0]?.agentTeam.modelAccountingSummary.runCount).toBeGreaterThan(0);
      expect(model.runtimeJobs[0]?.agentTeam.needsReviewRoles).toContain("context_scout");
    });
  });

  it("records irreparable failure recovery as needs_review without false success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "failure-recovery-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team-live",
      });
      const recovery = createAgentTeamFailureRecoveryArtifact({
        recoveryId: "recovery-needs-review",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run",
        failedRole: "implementation_engineer",
        recoveryRole: "reviewer",
        failureKind: "scope_drift",
        detectedAt: "2026-05-03T17:00:00.000Z",
        failureSummary: "Role attempted to change a file outside the approved module.",
        outcome: "needs_review",
        needsReviewReason: "scope drift requires operator decision",
      });
      await recordAgentTeamFailureRecoveryArtifact({ runtimeJobs, artifact: recovery });

      expect(recovery).toMatchObject({
        outcome: "needs_review",
        falseSuccessClaimed: false,
        scopeDriftDetected: true,
        workQueueLifecycleMutated: false,
      });
    });
  });
});
