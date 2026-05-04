import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  handleWorkQueueCancelExecutionEndpoint,
  handleWorkQueuePauseExecutionEndpoint,
  handleWorkQueueRedirectExecutionEndpoint,
} from "../work-queue/execution-control-endpoints.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createDeployAuthorityProfile,
  createInstallDependencyAuthorityProfile,
  createProductionSupervisorLoopDesign,
  createRebuildAuthorityProfile,
  createTrustedLocalYoloProfile,
  createYoloBridgeLiveRequest,
  handleQueueRunnerRunOnceEndpoint,
  preflightAcpBridgeEndpoint,
  runAcpBridgeLoopbackPilot,
  runControlledRebuild,
  runDeployDryRunPilot,
  runInstallDependencyDryRunPilot,
  runInstallDependencyRealPilot,
  runModelPromotionDryRunPilot,
  runOutboundNetworkLocalMockPilot,
  validateProductionSupervisorLoopDesign,
  validateTrustedLocalYoloProfile,
  validateYoloBridgeLiveRequest,
  type CodeWritingPilotLiveResult,
} from "./index.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

async function withRuntimeHarness<T>(
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
      now: () => new Date("2026-05-03T11:00:00.000Z"),
      maxArtifactMetadataBytes: 256 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T11:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
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
    workQueueLink: { workItemId: "work-item-productionization" },
  };
}

function fakeLiveResult(runtimeJobId: string): CodeWritingPilotLiveResult {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_live_result",
    liveCodeWritingPilotRunId: "live-productionization-fake",
    runtimeJobId,
    pilotPlanId: "pilot-productionization",
    requestId: "request-productionization",
    promptPackageId: "prompt-productionization",
    sessionId: "session-productionization",
    startedAt: "2026-05-03T11:00:00.000Z",
    completedAt: "2026-05-03T11:00:01.000Z",
    operatorApprovedBy: "operator",
    executorSessionIsSeparate: true,
    manualOperatorSessionSharedWithExecutor: false,
    selectedObjectiveId: "productionization-fake",
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
    approvedValidationCommands: ["pnpm test:file productionization-next-steps.test.ts"],
    validationRepairMaxAttempts: 1,
    diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only",
    shellCommandAuthorityScope: "operator_equivalent_yolo_future",
    validationEvidence: null,
    validationRecovery: {
      status: "validation_not_run",
      reason: "fake endpoint runner",
      validationEvidence: null,
    },
    completedWorkPathSatisfied: true,
    completedWorkPathReason: "fake endpoint runner completed",
    workEpisodeCloseout: {
      emitted: true,
      packPath: "/tmp/pack.json",
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
      focusedValidationPassed: false,
      workQueueLifecycleNotMutated: true,
      noRebuildAutobailoutSubagentAcpPromotionInstallDeployOutbound: true,
      closeoutPackEmitted: true,
      validationRecovery: {
        status: "validation_not_run",
        reason: "fake endpoint runner",
        validationEvidence: null,
      },
      completedWorkPathSatisfied: true,
    },
  };
}

describe("Execution Platform next productionization steps", () => {
  it("exposes authenticated queue runner endpoint without daemon behavior", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "endpoint-bridge-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "endpoint-queue",
        payload: bridgePayload(),
      });
      await runtimeJobs.enqueueJob({
        jobId: "endpoint-other-job",
        jobType: "not.codex_bridge",
        queueName: "endpoint-queue",
      });
      const rejected = await handleQueueRunnerRunOnceEndpoint({
        auth: { actorId: "", authenticated: false, role: "operator" },
        workerId: "worker-endpoint",
        queueName: "endpoint-queue",
        dryRun: true,
        runtime: { runtimeJobs },
      });
      expect(rejected.accepted).toBe(false);

      const dryRun = await handleQueueRunnerRunOnceEndpoint({
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workerId: "worker-endpoint",
        queueName: "endpoint-queue",
        dryRun: true,
        runtime: { runtimeJobs },
      });
      expect(dryRun.accepted).toBe(true);
      expect(dryRun.commandResult?.eligibleRuntimeJobIds).toEqual(["endpoint-bridge-job"]);

      const run = await handleQueueRunnerRunOnceEndpoint({
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workerId: "worker-endpoint",
        queueName: "endpoint-queue",
        runtimeJobId: "endpoint-bridge-job",
        runtime: { runtimeJobs },
        entrypoint: {
          async runApprovedLivePilot() {
            return fakeLiveResult("endpoint-bridge-job");
          },
        },
        async buildLiveInput() {
          return {} as never;
        },
      });
      expect(run.commandResult?.runOnceResult?.completed).toBe(true);
      expect(run.daemonStarted).toBe(false);
      expect(run.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("exposes Work Queue control endpoints backed by runtime control truth", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-endpoint-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "controls",
        payload: bridgePayload(),
      });
      const auth = { actorId: "operator", authenticated: true, role: "operator" as const };
      const pause = await handleWorkQueuePauseExecutionEndpoint({
        auth,
        runtimeJobs,
        runtimeJobId: "control-endpoint-job",
        sessionId: "session-control",
        reason: "pause bridge executor",
      });
      expect(pause.accepted).toBe(true);
      expect(pause.result?.command.commandKind).toBe("pause");
      const redirect = await handleWorkQueueRedirectExecutionEndpoint({
        auth,
        runtimeJobs,
        runtimeJobId: "control-endpoint-job",
        sessionId: "session-control",
        reason: "redirect bridge executor",
        redirectPrompt: {
          objective: "Check runtime truth first.",
          scope: ["extensions/execution-platform/src"],
          nonGoals: ["Do not mutate Work Queue lifecycle."],
          repoPath: "/root/services/openclaw-roles/live",
          workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
        },
      });
      expect(redirect.accepted).toBe(true);
      expect(redirect.result?.command.commandKind).toBe("redirect");
      const cancel = await handleWorkQueueCancelExecutionEndpoint({
        auth,
        runtimeJobs,
        runtimeJobId: "control-endpoint-job",
        sessionId: "session-control",
        reason: "cancel bridge executor",
      });
      expect(cancel.accepted).toBe(true);
      expect(cancel.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("preflights ACP endpoint and records unavailable endpoint without fake success", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "acp-endpoint-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "acp",
        payload: bridgePayload(),
      });
      const unavailable = await preflightAcpBridgeEndpoint({ env: {} });
      expect(unavailable.endpointAvailable).toBe(false);
      expect(unavailable.blockingReasons).toContain("acp_endpoint_not_configured");
      const available = await preflightAcpBridgeEndpoint({
        endpointUrl: "http://127.0.0.1:1/acp",
        probe: async () => true,
      });
      expect(available.endpointAvailable).toBe(true);
      const result = await runAcpBridgeLoopbackPilot({
        runtimeJobs,
        preflight: unavailable,
        request: {
          artifactKind: "acp_bridge_transport_request",
          requestId: "acp-endpoint-request",
          runtimeJobId: "acp-endpoint-job",
          sessionId: "acp-session",
          mode: "live_ready_adapter",
          objective: "ACP endpoint pilot proof",
          authorityProfileId: "trusted-local-yolo-v1",
          providerDirectCallMade: false,
          deployPerformed: false,
          outboundSendingPerformed: false,
          modelPromotionPerformed: false,
        },
      });
      expect(result.providerDirectCallMade).toBe(false);
      expect(result.limitation).toContain("real ACP endpoint unavailable");
    });
  });

  it("runs authority pilots and surfaces status through Work Queue read model", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, workQueue }) => {
      await runtimeJobs.enqueueJob({
        jobId: "authority-pilot-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "authority",
        payload: bridgePayload(),
      });
      const item = await workQueue.createWorkItem({
        workItemId: "work-item-productionization",
        itemType: "execution",
        title: "Authority pilot read model",
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: "authority-pilot-job",
      });

      const rebuild = await runControlledRebuild({
        profile: createRebuildAuthorityProfile({
          profileId: "rebuild-authority-v2",
          explicitRebuildCommands: ["pnpm tsgo:full"],
        }),
        command: "pnpm tsgo:full",
        cwd: "/root/services/openclaw-roles/live",
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        runner: async () => ({ status: "succeeded", exitCode: 0, outputPreview: "ok" }),
      });
      expect(rebuild.status).toBe("succeeded");

      const dryRun = await runInstallDependencyDryRunPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        profile: createInstallDependencyAuthorityProfile(),
        proposedChange: "Evaluate tiny dependency metadata update.",
      });
      expect(dryRun.status).toBe("completed");
      const realInstall = await runInstallDependencyRealPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        dryRun,
        approveProductionDependencyMutation: true,
      });
      expect(realInstall.status).toBe("completed_controlled_fixture");
      expect(realInstall.productionDependencyMutationPerformed).toBe(false);

      const outbound = await runOutboundNetworkLocalMockPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
      });
      expect(outbound.status).toBe("completed");
      expect(outbound.realExternalSendPerformed).toBe(false);

      const deploy = await runDeployDryRunPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        profile: createDeployAuthorityProfile(),
      });
      expect(deploy.status).toBe("completed");
      expect(deploy.realDeployPerformed).toBe(false);

      const promotion = await runModelPromotionDryRunPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
      });
      expect(promotion.status).toBe("completed");
      expect(promotion.productionPromotionPerformed).toBe(false);

      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-productionization",
      });
      expect(readModel.runtimeJobs[0]?.authorityStatuses.length).toBeGreaterThanOrEqual(6);
    });
  });

  it("validates production supervisor loop design without starting a daemon", () => {
    const design = createProductionSupervisorLoopDesign();
    const report = validateProductionSupervisorLoopDesign(design);
    expect(report.readyForFutureImplementation).toBe(true);
    expect(report.daemonStarted).toBe(false);
    expect(report.schedulerStarted).toBe(false);
    expect(design.supabaseRuntimePersistenceRequired).toBe(true);
    expect(design.workQueueReadModelUpdateExpected).toBe(true);
    const unsafe = validateProductionSupervisorLoopDesign({
      ...design,
      maxConcurrency: 99,
      operatorKillSwitchRequired: false,
    } as unknown as Parameters<typeof validateProductionSupervisorLoopDesign>[0]);
    expect(unsafe.blockingReasons).toContain("unbounded_concurrency_not_allowed");
    expect(unsafe.blockingReasons).toContain("operator_kill_switch_required");
  });

  it("keeps Trusted Local YOLO request validation separate from high-blast-radius profiles", () => {
    const profile = createTrustedLocalYoloProfile();
    expect(validateTrustedLocalYoloProfile(profile).valid).toBe(true);
    const request = createYoloBridgeLiveRequest({
      runtimeJobId: "request-job",
      sessionId: "request-session",
      objective: "Run bounded productionization pilot.",
      repoPath: "/root/services/openclaw-roles/live",
      allowedPaths: ["extensions/execution-platform/src"],
      validationPlan: {
        commands: ["pnpm test:file extensions/execution-platform"],
        maxRepairAttempts: 1,
      },
      rollbackPlan: {
        summary: "revert focused diff",
        expectations: ["git diff remains inspectable"],
      },
      expiresAt: "2026-05-03T12:00:00.000Z",
    });
    expect(validateYoloBridgeLiveRequest({ request, authorityProfile: profile }).valid).toBe(true);
    expect(request.authorityBlock.hardBans).toContain("deploy");
  });
});
