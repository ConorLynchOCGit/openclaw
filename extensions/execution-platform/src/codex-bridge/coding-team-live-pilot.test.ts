import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import type { AgentTeamImplementationBridge } from "./agent-team-queued-runner.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import { runCodingTeamLivePilot } from "./coding-team-live-pilot.ts";

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
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

function modelCloseoutReporterFixture() {
  return {
    async createCapsule(input: {
      factualRefs: {
        runtimeJobId: string;
        teamRunId?: string | null;
        workflowId?: string | null;
      };
    }) {
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: input.factualRefs.runtimeJobId,
        teamRunId: input.factualRefs.teamRunId ?? null,
        workflowId: input.factualRefs.workflowId ?? "agent_team.coding",
      });
      return {
        source: "model" as const,
        capsule,
        legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
        reasonCodes: ["fixture_model_closeout_created"],
        rawPromptStored: false as const,
        rawResponseStored: false as const,
        rawProviderLogStored: false as const,
      };
    },
  };
}

function roleModelClientFixture() {
  return {
    async callRole(input: { roleId: string; modelId: string }) {
      if (input.roleId === "test_engineer") {
        return {
          status: "succeeded" as const,
          responseText: JSON.stringify({
            what_i_was_asked_to_do: `Complete ${input.roleId} work`,
            what_i_actually_did: `${input.roleId} reviewed the implementation validation refs and accepted the focused regression evidence for ${input.modelId}.`,
            evidence_refs: [`runtime-job://job/agent-team/inline-role-report/${input.roleId}`],
            files_or_artifacts_touched: [
              "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
            ],
            validation_i_performed:
              "Reviewed pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts and accepted the bounded validation evidence.",
            whatWorked: [`${input.roleId} produced bounded role-specific evidence.`],
            whatWasWeakOrFailed: ["broader managed soak remains future work"],
            recommendedNextStep: "Run the live single-job quality proof.",
            skillOrProcessOpportunitySeeds: [],
            confidence: "high",
            limitations: [`${input.roleId} fixture scope only`],
          }),
          responseHash: `hash-${input.roleId}`,
          usage: null,
          retryEvidence: null,
          errorReasonCode: null,
          httpStatus: 200,
        };
      }
      return {
        status: "succeeded" as const,
        responseText: JSON.stringify({
          whatIWasAskedToDo: `Complete ${input.roleId} work`,
          whatIActuallyDid: `${input.roleId} reviewed concrete runtime evidence for ${input.modelId}.`,
          evidenceRefs: [`runtime-job://job/agent-team/inline-role-report/${input.roleId}`],
          filesOrArtifactsTouched: [
            "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
          ],
          validationIPerformed: `${input.roleId} validated the bounded quality-proof fixture.`,
          whatWorked: [`${input.roleId} produced bounded role-specific evidence.`],
          whatWasWeakOrFailed: ["broader managed soak remains future work"],
          recommendedNextStep: "Run the live single-job quality proof.",
          skillOrProcessOpportunitySeeds: [],
          confidence: "high",
          limitations: [`${input.roleId} fixture scope only`],
        }),
        responseHash: `hash-${input.roleId}`,
        usage: null,
        retryEvidence: null,
        errorReasonCode: null,
        httpStatus: 200,
      };
    },
  };
}

function implementationBridgeFixture(): AgentTeamImplementationBridge {
  return {
    async run(input) {
      return {
        status: "completed",
        transportKind: "codex_app_server",
        modelRef: "openai-codex/gpt-5.4",
        providerPath: "codex_app_server",
        modelRunRef: `${input.teamRunId}-implementation-bridge-run`,
        responseHash: "hash-implementation-bridge",
        startedAt: "2026-05-08T00:00:00.000Z",
        completedAt: "2026-05-08T00:00:05.000Z",
        latencyMs: 5_000,
        summary:
          "The approved Codex file-editing bridge made the smallest product-safe readback change and recorded focused validation evidence.",
        changedFileRefs: [
          "extensions/execution-platform/src/codex-bridge/agent-team-queued-runner.ts",
          "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.ts",
        ],
        validationRefs: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
        ],
        artifactRefs: [
          "runtime-job://coding-team-single-job-quality-success-job/codex-bridge/code-writing-pilot-live/live-run/codex_bridge.code_writing_pilot_live_result",
        ],
        reasonCodes: ["implementation_bridge_completed"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

describe("coding team live pilot", () => {
  it("runs one bounded coding-team runtime job and projects Work Queue readback in a fixture", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runCodingTeamLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "coding-team-live-pilot-job",
        teamRunId: "coding-team-live-pilot-team-run",
        objectiveSummary:
          "Improve coding-team permission readback closeout quality with bounded local repo evidence.",
      });

      expect(result).toMatchObject({
        artifactKind: "coding_team_live_pilot_result",
        status: "failed",
        mode: "runtime_with_work_queue_fixture",
        runtimeJobId: "coding-team-live-pilot-job",
        teamRunId: "coding-team-live-pilot-team-run",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
        runtimeJobsCreated: true,
        authorityGranted: false,
        controlsApplied: false,
        deployPerformed: false,
        outboundSendPerformed: false,
        dependencyInstallPerformed: false,
        gatewayRestarted: false,
        modelPromotionPerformed: false,
        workQueueLifecycleMutated: false,
        workerSupervisorPathExercised: true,
        workerAdapterId: "worker.acp-codex.coding",
        supervisorResult: {
          status: "needs_review",
          adapterId: "worker.acp-codex.coding",
        },
      });
      expect(result.permissionEvidence).toMatchObject({
        localRepoWorkAllowed: true,
        deployRequiresApproval: true,
        outboundRequiresApproval: true,
        modelPromotionBlocked: true,
        workQueueLifecycleMutated: false,
      });
      expect(result.humanCloseoutSummary).toMatchObject({
        artifactKind: "agent_team_human_closeout_summary",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "coding-team-live-pilot-job",
        teamRunId: "coding-team-live-pilot-team-run",
        permissionEvidencePresent: true,
        closeoutState: "present",
        validationState: "needs_review",
        lifecycleTruthSource: "work_queue_repository",
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.eventTypes).toContain("runtime_worker.supervisor_heartbeat");
      expect(result.eventTypes).toContain("agent_team.result_review_recorded");
      expect(result.artifactTypes).toContain("runtime_worker.adapter_result");
      expect(result.artifactTypes).toContain("agent_team.runtime_evidence");
      await expect(runtimeJobs.getJob("coding-team-live-pilot-job")).resolves.toMatchObject({
        state: "failed",
      });
    });
  });

  it("supports live Work Queue-linked mode while runtime jobs remain lifecycle truth", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runCodingTeamLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueLinkage: true,
        runtimeJobId: "coding-team-live-linked-job",
        teamRunId: "coding-team-live-linked-team-run",
        objectiveSummary:
          "Run coding-team live Work Queue-linked proof with bounded local repo evidence.",
      });

      expect(result.mode).toBe("runtime_with_work_queue_linkage");
      expect(result.status).toBe("failed");
      expect(result.supervisorResult).toMatchObject({
        status: "needs_review",
        adapterId: "worker.acp-codex.coding",
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "coding-team-live-linked-job",
        teamRunId: "coding-team-live-linked-team-run",
        permissionEvidencePresent: true,
        closeoutState: "present",
        validationState: "needs_review",
        workQueueLifecycleMutationAllowed: false,
      });
      await expect(runtimeJobs.getJob("coding-team-live-linked-job")).resolves.toMatchObject({
        state: "failed",
      });
      expect(result.workQueueLifecycleMutated).toBe(false);
      expect(result.rawPromptStored).toBe(false);
      expect(result.rawResponseStored).toBe(false);
    });
  });

  it("succeeds through the runtime worker supervisor when model-authored closeout is present", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runCodingTeamLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueLinkage: true,
        runtimeJobId: "coding-team-live-supervised-success-job",
        teamRunId: "coding-team-live-supervised-success-team-run",
        objectiveSummary:
          "Run coding-team supervised worker proof with task-specific model-authored closeout.",
        closeoutReporter: modelCloseoutReporterFixture(),
      });

      expect(result).toMatchObject({
        status: "completed",
        mode: "runtime_with_work_queue_linkage",
        workerSupervisorPathExercised: true,
        workerAdapterId: "worker.acp-codex.coding",
        supervisorResult: {
          status: "completed",
          completed: true,
          adapterId: "worker.acp-codex.coding",
        },
        runnerResult: {
          completed: true,
          failed: false,
        },
      });
      expect(result.humanCloseoutSummary).toMatchObject({
        result: "satisfied",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(result.workQueueReadback).toMatchObject({
        runtimeJobId: "coding-team-live-supervised-success-job",
        validationState: "passed",
        closeoutState: "present",
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.eventTypes).toContain("runtime_worker.supervisor_heartbeat");
      expect(result.artifactTypes).toEqual(
        expect.arrayContaining([
          "runtime_worker.adapter_result",
          "runtime_worker.closeout_capsule_evaluation",
          "execution_platform.closeout_capsule",
        ]),
      );
      await expect(
        runtimeJobs.getJob("coding-team-live-supervised-success-job"),
      ).resolves.toMatchObject({
        state: "succeeded",
      });
    });
  });

  it("passes the single-job quality proof with live-role-shaped model evidence", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runCodingTeamLivePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueLinkage: true,
        runtimeJobId: "coding-team-single-job-quality-success-job",
        teamRunId: "coding-team-single-job-quality-success-team-run",
        objectiveSummary:
          "Use the full coding team to improve Work Queue Closeout Capsule readback.",
        closeoutReporter: modelCloseoutReporterFixture(),
        roleModelClient: roleModelClientFixture(),
        implementationBridge: implementationBridgeFixture(),
        extraRuntimePayload: {
          qualityGateId: "single_job_coding_team_end_to_end_quality_proof",
          requireSingleJobCodingTeamQualityProof: true,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.supervisorResult).toMatchObject({
        status: "completed",
        completed: true,
        adapterId: "worker.acp-codex.coding",
      });
      expect(result.runnerResult.evidence?.roleExecutionEvidence).toHaveLength(8);
      expect(result.artifactTypes).toEqual(
        expect.arrayContaining([
          "agent_team.inline_role_report",
          "agent_team.single_job_quality_evaluation",
          "execution_platform.closeout_capsule",
        ]),
      );
      await expect(
        runtimeJobs.getJob("coding-team-single-job-quality-success-job"),
      ).resolves.toMatchObject({
        state: "succeeded",
      });
    });
  });
});
