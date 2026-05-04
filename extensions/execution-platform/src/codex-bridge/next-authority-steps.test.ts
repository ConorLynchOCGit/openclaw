import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  WorkQueueExecutionControlApi,
  buildWorkQueueExecutionReadModel,
} from "../work-queue/index.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  buildDefaultExecutionAuthorityProfileRegistry,
  createDeployAuthorityProfile,
  createInstallDependencyAuthorityProfile,
  createModelPromotionAuthorityProfile,
  createOutboundNetworkAuthorityProfile,
  createRebuildAuthorityProfile,
  createTrustedLocalYoloProfile,
  recordDeployAuthorityProof,
  recordInstallDependencyAuthorityProof,
  recordModelPromotionDryRunDecision,
  recordOutboundNetworkAuthorityProof,
  runControlledRebuild,
  runQueuedBridgeRunnerCommand,
  trustedLocalYoloProfileToLiveRequestAuthorityBlock,
  validateDeployAuthorityProfile,
  validateInstallDependencyAuthorityProfile,
  validateModelPromotionAuthorityProfile,
  validateOutboundNetworkAuthorityProfile,
  validateTrustedLocalYoloProfile,
  type CodeWritingPilotLiveResult,
} from "./index.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

async function withHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
    now: Date;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const now = new Date("2026-05-03T10:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 256 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({ runtimeJobs, workQueue, now });
  } finally {
    await database.close();
  }
}

function bridgePayload() {
  return {
    family: "codex_bridge",
    executorKind: "codex_cli",
    executionMode: "fake_stream_proof",
    prompt: {},
    trustPolicy: {},
    autobailoutPolicy: {},
    supervisor: {},
    environment: {},
    workQueueLink: { workItemId: "work-item-authority" },
  };
}

function fakeLiveResult(runtimeJobId: string): CodeWritingPilotLiveResult {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_live_result",
    liveCodeWritingPilotRunId: "live-authority-proof",
    runtimeJobId,
    pilotPlanId: "pilot-authority-proof",
    requestId: "request-authority-proof",
    promptPackageId: "prompt-authority-proof",
    sessionId: "session-authority-proof",
    startedAt: "2026-05-03T10:00:00.000Z",
    completedAt: "2026-05-03T10:00:01.000Z",
    operatorApprovedBy: "operator",
    executorSessionIsSeparate: true,
    manualOperatorSessionSharedWithExecutor: false,
    selectedObjectiveId: "full-production-yolo-proof",
    approvedTargetFiles: [],
    actualFilesChanged: [],
    fileScopeSatisfied: true,
    codexCliInvoked: false,
    commandExecuted: false,
    liveExecutionEnabled: false,
    processResult: null,
    eventCount: 1,
    finalResponsePresent: false,
    finalResponseCandidate: null,
    executorValidationCommandAllowed: true,
    approvedValidationCommands: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/next-authority-steps.test.ts",
    ],
    validationRepairMaxAttempts: 1,
    diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only",
    shellCommandAuthorityScope: "operator_equivalent_yolo_future",
    validationEvidence: {
      command:
        "pnpm test:file extensions/execution-platform/src/codex-bridge/next-authority-steps.test.ts",
      status: "passed",
      summary: "fake full production YOLO proof validation passed",
      checkedAt: "2026-05-03T10:00:01.000Z",
    },
    validationRecovery: {
      status: "validation_passed",
      reason: "fake runner validation evidence supplied",
      validationEvidence: {
        command:
          "pnpm test:file extensions/execution-platform/src/codex-bridge/next-authority-steps.test.ts",
        status: "passed",
        summary: "fake full production YOLO proof validation passed",
        checkedAt: "2026-05-03T10:00:01.000Z",
      },
    },
    completedWorkPathSatisfied: true,
    completedWorkPathReason: "fake queued full production proof completed",
    workEpisodeCloseout: {
      emitted: true,
      packPath: "/tmp/full-production-yolo-pack.json",
      packHash: "hash",
      eligibilityStatus: "eligible",
    },
    workQueueLifecycleMutated: false,
    rebuildPerformed: false,
    autobailoutPerformed: false,
    subagentStarted: false,
    acpSessionStarted: false,
    providerCallMadeDirectly: false,
    modelPromotionPerformed: false,
    installDeployOutboundPerformed: false,
    blockingReasons: [],
    successCriteria: {
      preRunGatesPassed: true,
      codexInvokedThroughBridgePath: false,
      commandExecutionAllowlisted: false,
      processResultRecorded: true,
      streamOrProcessEvidenceRecorded: true,
      fileScopeSatisfied: true,
      focusedValidationPassed: true,
      workQueueLifecycleNotMutated: true,
      noRebuildAutobailoutSubagentAcpPromotionInstallDeployOutbound: true,
      closeoutPackEmitted: true,
      validationRecovery: {
        status: "validation_passed",
        reason: "fake runner validation evidence supplied",
        validationEvidence: {
          command:
            "pnpm test:file extensions/execution-platform/src/codex-bridge/next-authority-steps.test.ts",
          status: "passed",
          summary: "fake full production YOLO proof validation passed",
          checkedAt: "2026-05-03T10:00:01.000Z",
        },
      },
      completedWorkPathSatisfied: true,
    },
  };
}

describe("Execution Platform next authority productionization steps", () => {
  it("runs the operator-invoked queue command once with dry-run and isolated execution", async () => {
    await withHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "operator-command-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "operator-command",
        payload: bridgePayload(),
      });
      const dryRun = await runQueuedBridgeRunnerCommand({
        workerId: "operator-worker",
        queueName: "operator-command",
        dryRun: true,
        runtime: { runtimeJobs, runtimeResolverSource: "pg-mem", runtimeLogicalDatabase: "test" },
      });
      expect(dryRun.eligibleRuntimeJobIds).toEqual(["operator-command-job"]);
      expect(dryRun.runOnceResult).toBeNull();

      const result = await runQueuedBridgeRunnerCommand({
        workerId: "operator-worker",
        queueName: "operator-command",
        runtimeJobId: "operator-command-job",
        runtime: { runtimeJobs, runtimeResolverSource: "pg-mem", runtimeLogicalDatabase: "test" },
        entrypoint: {
          async runApprovedLivePilot() {
            return fakeLiveResult("operator-command-job");
          },
        },
        async buildLiveInput() {
          return {} as never;
        },
      });
      expect(result.runOnceResult?.completed).toBe(true);
      expect(result.daemonStarted).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("promotes trusted local YOLO v1 while keeping high-blast-radius authority separate", () => {
    const profile = createTrustedLocalYoloProfile();
    const validation = validateTrustedLocalYoloProfile(profile);
    const block = trustedLocalYoloProfileToLiveRequestAuthorityBlock(profile);
    expect(profile.profileId).toBe("trusted-local-yolo-v1");
    expect(validation.valid).toBe(true);
    expect(block.shellAuthority).toBe("operator_equivalent_local");
    expect(block.hardBans).toContain("deploy");
    expect(block.hardBans).toContain("model_promotion");
  });

  it("records server-backed Work Queue pause redirect and cancel controls without lifecycle mutation", async () => {
    await withHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-api-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "controls",
        payload: bridgePayload(),
      });
      const controlBridge = new CodexBridgeControlBridgeRepository(runtimeJobs);
      const api = new WorkQueueExecutionControlApi();
      const pause = await api.pause({
        controlBridge,
        workItemId: "work-item-authority",
        runtimeJobId: "control-api-job",
        sessionId: "session-control",
        actor: "operator",
        reason: "operator requested pause",
      });
      expect(pause.command.commandKind).toBe("pause");
      const redirect = await api.redirect({
        controlBridge,
        workItemId: "work-item-authority",
        runtimeJobId: "control-api-job",
        sessionId: "session-control",
        actor: "operator",
        reason: "operator requested redirect",
        redirectPrompt: {
          objective: "Check runtime truth before continuing.",
          scope: ["extensions/execution-platform/src"],
          nonGoals: ["Do not mutate Work Queue lifecycle."],
          repoPath: "/root/services/openclaw-roles/live",
          workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
        },
      });
      expect(redirect.command.commandKind).toBe("redirect");
      const cancel = await api.cancel({
        controlBridge,
        workItemId: "work-item-authority",
        runtimeJobId: "control-api-job",
        sessionId: "session-control",
        actor: "operator",
        reason: "operator requested cancel",
      });
      expect(cancel.command.commandKind).toBe("cancel");
      expect(cancel.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("models high-blast-radius authority profiles as dry-run or bounded proof surfaces", async () => {
    await withHarness(async ({ runtimeJobs, workQueue }) => {
      await runtimeJobs.enqueueJob({
        jobId: "authority-profile-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "authority",
        payload: bridgePayload(),
      });
      const item = await workQueue.createWorkItem({
        workItemId: "work-item-authority",
        itemType: "execution",
        title: "Authority proof",
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: "authority-profile-job",
      });

      const installProfile = createInstallDependencyAuthorityProfile();
      expect(validateInstallDependencyAuthorityProfile(installProfile).valid).toBe(true);
      const install = await recordInstallDependencyAuthorityProof({
        runtimeJobs,
        runtimeJobId: "authority-profile-job",
        profile: installProfile,
        command: "pnpm install --lockfile-only --dry-run",
      });
      expect(install.status).toBe("dry_run_allowed");

      const rebuildProfile = createRebuildAuthorityProfile({
        explicitRebuildCommands: ["pnpm tsgo:full"],
      });
      const rebuild = await runControlledRebuild({
        profile: rebuildProfile,
        command: "pnpm tsgo:full",
        cwd: "/root/services/openclaw-roles/live",
        runtimeJobs,
        runtimeJobId: "authority-profile-job",
        runner: async () => ({ status: "succeeded", exitCode: 0, outputPreview: "ok" }),
      });
      expect(rebuild.status).toBe("succeeded");

      const outboundProfile = createOutboundNetworkAuthorityProfile();
      expect(validateOutboundNetworkAuthorityProfile(outboundProfile).valid).toBe(true);
      const outbound = await recordOutboundNetworkAuthorityProof({
        runtimeJobs,
        runtimeJobId: "authority-profile-job",
        profile: outboundProfile,
        targetDomain: "localhost",
        action: "local_mock_request",
        localMock: true,
      });
      expect(outbound.realExternalSendPerformed).toBe(false);

      const deployProfile = createDeployAuthorityProfile();
      expect(validateDeployAuthorityProfile(deployProfile).valid).toBe(true);
      const deploy = await recordDeployAuthorityProof({
        runtimeJobs,
        runtimeJobId: "authority-profile-job",
        profile: deployProfile,
        command: "deploy --dry-run",
        localMock: true,
      });
      expect(deploy.realDeployPerformed).toBe(false);

      const modelProfile = createModelPromotionAuthorityProfile();
      expect(validateModelPromotionAuthorityProfile(modelProfile).valid).toBe(true);
      const modelPromotion = await recordModelPromotionDryRunDecision({
        runtimeJobs,
        runtimeJobId: "authority-profile-job",
        profile: modelProfile,
        candidateModelId: "candidate",
        baselineModelId: "baseline",
        evalEvidenceRefs: ["artifact://eval"],
        canaryCriteria: ["quality >= baseline"],
        ownerApproval: "operator",
        rollbackPlan: "restore baseline route",
      });
      expect(modelPromotion.productionPromotionPerformed).toBe(false);

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-authority",
      });
      expect(model.runtimeJobs[0]?.authorityStatuses.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("summarizes authority profile progression for the production YOLO pilot gate", () => {
    const registry = buildDefaultExecutionAuthorityProfileRegistry();
    expect(
      registry.entries.find((entry) => entry.profileId === "trusted-local-yolo-v1")?.status,
    ).toBe("live_proven");
    expect(
      registry.entries.find((entry) => entry.profileId === "rebuild-authority-v2")?.status,
    ).toBe("live_ready");
    expect(registry.entries.find((entry) => entry.profileKind === "deploy")?.status).toBe(
      "dry_run_only",
    );
    expect(registry.entries.find((entry) => entry.profileKind === "model_promotion")?.status).toBe(
      "dry_run_only",
    );
    expect(registry.entries.filter((entry) => entry.realExternalSideEffectAllowed)).toHaveLength(0);
    expect(registry.deployOutboundOrModelPromotionPerformed).toBe(false);
  });
});
