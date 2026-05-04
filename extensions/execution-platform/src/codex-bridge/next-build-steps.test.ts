import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  LiveCodexRunner,
  QueuedBridgeRunner,
  buildBridgeResultReviewArtifact,
  createAcpBridgeTransportRequest,
  createRebuildAuthorityProfile,
  createTrustedLocalYoloProfile,
  createYoloBridgeLiveRequest,
  pollLatestControlForRunningExecution,
  recordBridgeResultReviewArtifact,
  runAcpBridgeLoopbackPilot,
  runControlledRebuild,
  trustedLocalYoloProfileToLiveRequestAuthorityBlock,
  validateBridgeResultReviewArtifact,
  validateRebuildAuthorityProfile,
  validateTrustedLocalYoloProfile,
  validateYoloBridgeLiveRequest,
  type CodeWritingPilotLiveResult,
  type CodexRunnerChildProcess,
  type CodexRunnerSpawn,
} from "./index.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

class HangingFakeChildProcess extends EventEmitter implements CodexRunnerChildProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    queueMicrotask(() => this.emit("close", null, typeof signal === "string" ? signal : null));
    return true;
  }

  override on(
    event: "error" | "exit" | "close",
    listener: (codeOrError?: number | Error | null, signal?: NodeJS.Signals | null) => void,
  ): this {
    return super.on(event, listener);
  }
}

async function withRuntimeHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
    now: Date;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const now = new Date("2026-05-03T08:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 160 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({ runtimeJobs, workQueue, now });
  } finally {
    await database.close();
  }
}

function minimalLiveResult(runtimeJobId: string): CodeWritingPilotLiveResult {
  return {
    artifactKind: "codex_bridge_code_writing_pilot_live_result",
    liveCodeWritingPilotRunId: "live-run-next-steps",
    runtimeJobId,
    pilotPlanId: "pilot-plan-next-steps",
    requestId: "request-next-steps",
    promptPackageId: "prompt-package-next-steps",
    sessionId: "session-next-steps",
    startedAt: "2026-05-03T08:00:00.000Z",
    completedAt: "2026-05-03T08:00:01.000Z",
    operatorApprovedBy: "operator",
    executorSessionIsSeparate: true,
    manualOperatorSessionSharedWithExecutor: false,
    selectedObjectiveId: "next-steps-feature",
    approvedTargetFiles: [],
    actualFilesChanged: [],
    fileScopeSatisfied: true,
    codexCliInvoked: false,
    commandExecuted: false,
    liveExecutionEnabled: false,
    processResult: null,
    eventCount: 0,
    finalResponsePresent: false,
    finalResponseCandidate: null,
    executorValidationCommandAllowed: true,
    approvedValidationCommands: ["pnpm test:file next-build-steps.test.ts"],
    validationRepairMaxAttempts: 1,
    diagnosticShellAuthorityScope: "approved_read_only_diagnostic_commands_only",
    shellCommandAuthorityScope: "approved_validation_commands_only",
    validationEvidence: null,
    validationRecovery: {
      status: "validation_not_run",
      reason: "fake queued runner did not run validation",
      validationEvidence: null,
    },
    completedWorkPathSatisfied: false,
    completedWorkPathReason: "fake queued runner result",
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
        reason: "fake queued runner result",
        validationEvidence: null,
      },
      completedWorkPathSatisfied: false,
    },
  };
}

describe("Execution Platform next build steps", () => {
  it("validates trusted local YOLO profile and live request hard bans", () => {
    const profile = createTrustedLocalYoloProfile();
    expect(validateTrustedLocalYoloProfile(profile).valid).toBe(true);
    const authorityBlock = trustedLocalYoloProfileToLiveRequestAuthorityBlock(profile);
    expect(authorityBlock.shellAuthority).toBe("operator_equivalent_local");
    expect(authorityBlock.hardBans).toContain("deploy");

    const unsafe = validateTrustedLocalYoloProfile({
      ...(profile as object),
      deployAllowed: true,
      hiddenWorkQueueLifecycleMutationAllowed: true,
    } as never);
    expect(unsafe.blockingReasons).toContain("deploy_not_allowed");
    expect(unsafe.blockingReasons).toContain("hidden_work_queue_lifecycle_mutation_not_allowed");

    const request = createYoloBridgeLiveRequest({
      runtimeJobId: "runtime-yolo",
      sessionId: "session-yolo",
      objective: "Add focused helper and tests.",
      repoPath: "/root/services/openclaw-roles/live",
      allowedPaths: ["extensions/execution-platform/src/codex-bridge"],
      validationPlan: {
        commands: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/next-build-steps.test.ts",
        ],
        maxRepairAttempts: 2,
      },
      rollbackPlan: {
        summary: "revert focused patch",
        expectations: ["git diff remains inspectable"],
      },
      expiresAt: "2026-05-03T09:00:00.000Z",
    });
    expect(validateYoloBridgeLiveRequest({ request, authorityProfile: profile }).valid).toBe(true);
    expect(request.liveFlags.enableLiveCodexPilot).toBe(false);
  });

  it("claims exactly one queued bridge job and completes it through an injected entrypoint", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "queued-bridge-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
        payload: { workQueueLifecycleMutationAllowed: false },
      });
      const runner = new QueuedBridgeRunner({
        runtimeJobs,
        workerId: "worker-1",
        entrypoint: {
          async runApprovedLivePilot() {
            return minimalLiveResult("queued-bridge-job");
          },
        },
        async buildLiveInput() {
          return {} as never;
        },
      });
      const result = await runner.runOnce();
      expect(result.claimed).toBe(true);
      expect(result.completed).toBe(true);
      expect(result.liveRunId).toBe("live-run-next-steps");
      expect(result.workQueueLifecycleMutated).toBe(false);
      expect(await runner.runOnce()).toMatchObject({ claimed: false });
    });
  });

  it("polls active controls during a live runner and aborts on cancel without prompt injection", async () => {
    const spawn: CodexRunnerSpawn = () => new HangingFakeChildProcess();
    let polled = false;
    const runner = new LiveCodexRunner({
      enableLiveCodexPilot: true,
      maxRuntimeMs: 10_000,
      controlPollIntervalMs: 1,
      controlPoller: () => {
        if (polled) {
          return null;
        }
        polled = true;
        return {
          commandId: "cancel-1",
          commandKind: "cancel",
          reason: "operator cancel",
        };
      },
      spawn,
    });
    const result = await runner.runPrevalidatedDescriptor(
      {
        descriptor: {
          artifactKind: "codex_process_descriptor",
          descriptorId: "codex-process-control",
          command: "codex",
          args: ["exec", "--json", "--cd", "/root/services/openclaw-roles/live", "noop"],
          cwd: "/root/services/openclaw-roles/live",
          envPolicy: { secretsIncluded: false, inheritedEnvAllowed: false },
          promptStrategy: "inline_finalized_prompt_text",
          expectedStdout: "jsonl_events",
          expectedStderr: "progress_events",
          expectedStream: "codex_exec_jsonl",
          maxRuntimeMs: 10_000,
          executionAllowed: true,
          sourcePackageId: "source",
          codexCliInvoked: false,
          acpSessionStarted: false,
          shellCommandExecuted: false,
          providerCallMade: false,
          rebuildPerformed: false,
          schedulerStarted: false,
          daemonStarted: false,
          subagentStarted: false,
          liveExecutionEnabled: false,
          commandExecuted: false,
        },
      },
      {},
    );
    expect(result.status).toBe("killed");
    expect(result.controlDecision?.commandKind).toBe("cancel");
    expect(result.promptInjectedIntoLiveProcess).toBe(false);
  });

  it("applies durable control commands through the running-execution poll helper", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
        payload: {
          family: "codex_bridge",
          executorKind: "codex_cli",
          executionMode: "fake_stream_proof",
          prompt: {},
          trustPolicy: {},
          autobailoutPolicy: {},
          supervisor: {},
          environment: {},
        },
      });
      const controlBridge = new CodexBridgeControlBridgeRepository(runtimeJobs);
      const command = await controlBridge.createRedirectCommand({
        runtimeJobId: "control-job",
        sessionId: "session-control",
        actor: "operator",
        reason: "redirect to safer objective",
        reasonCategory: "operator_manual_intervention",
        redirectPrompt: {
          objective: "Check runtime truth first.",
          scope: ["extensions/execution-platform/src/codex-bridge"],
          nonGoals: ["Do not mutate Work Queue lifecycle."],
          repoPath: "/root/services/openclaw-roles/live",
          workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
          safeUiBridge: null,
        },
      });
      await controlBridge.recordControlCommand({ command });
      const decision = await pollLatestControlForRunningExecution({
        controlBridge,
        runtimeJobId: "control-job",
        sessionId: "session-control",
      });
      expect(decision?.supportedEffect).toBe("redirect_requires_stop_and_next_turn");
      expect(decision?.promptInjectedIntoLiveProcess).toBe(false);
      const state = await controlBridge.readLatestControlState({
        runtimeJobId: "control-job",
        sessionId: "session-control",
      });
      expect(state.appliedCommands).toHaveLength(1);
    });
  });

  it("builds Work Queue execution read model from runtime truth", async () => {
    await withRuntimeHarness(async ({ runtimeJobs, workQueue, now }) => {
      await runtimeJobs.enqueueJob({
        jobId: "read-model-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
      });
      const item = await workQueue.createWorkItem({
        workItemId: "work-item-read-model",
        itemType: "execution",
        title: "Read execution truth",
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: "read-model-job",
        runState: "pending",
      });
      await runtimeJobs.recordEvent({
        jobId: "read-model-job",
        eventType: "codex_bridge.code_writing_pilot_stream_event",
        data: { normalized: { summary: "final update" } },
      });
      await runtimeJobs.attachArtifact({
        jobId: "read-model-job",
        artifactType: "codex_bridge.code_writing_pilot_validation_report",
        storageKind: "metadata",
        uri: "runtime-job://read-model-job/validation",
        metadata: { status: "passed" },
      });
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-read-model",
        now,
      });
      expect(model.executionTruthSource).toBe("execution_platform_runtime_jobs");
      expect(model.uiMutationAllowed).toBe(false);
      expect(model.runtimeJobs[0]?.validationStatus).toBe("passed");
      expect(model.runtimeJobs[0]?.closeoutStatus).toBe("missing");
    });
  });

  it("records bridge result review separately from deterministic validation", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "review-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
      });
      const review = buildBridgeResultReviewArtifact({
        reviewId: "review-1",
        reviewKind: "no_review_performed",
        reviewedAt: "2026-05-03T08:00:00.000Z",
        objective: "Review bridge result.",
        runtimeJobId: "review-job",
        evidenceRefs: ["runtime-job://review-job/result"],
        validationResult: "passed",
        filesChanged: ["extensions/execution-platform/src/codex-bridge/example.ts"],
      });
      expect(validateBridgeResultReviewArtifact(review).valid).toBe(true);
      expect(review.judgmentMade).toBe(false);
      await recordBridgeResultReviewArtifact({ runtimeJobs, artifact: review });
      const artifacts = await runtimeJobs.listArtifacts("review-job");
      expect(
        artifacts.some((artifact) => artifact.artifactType === "codex_bridge.result_review"),
      ).toBe(true);
    });
  });

  it("models controlled rebuild authority and records bounded command results", async () => {
    const profile = createRebuildAuthorityProfile({
      explicitRebuildCommands: ["pnpm tsgo:full"],
      maxAttempts: 1,
    });
    expect(validateRebuildAuthorityProfile(profile).valid).toBe(true);
    const refused = await runControlledRebuild({
      profile,
      command: "pnpm install",
      cwd: "/root/services/openclaw-roles/live",
      runner: async () => ({ status: "succeeded", exitCode: 0, outputPreview: null }),
    });
    expect(refused.status).toBe("refused");
    const result = await runControlledRebuild({
      profile,
      command: "pnpm tsgo:full",
      cwd: "/root/services/openclaw-roles/live",
      runner: async () => ({ status: "failed", exitCode: 1, outputPreview: "type error" }),
    });
    expect(result.failureCaptured).toBe(true);
    expect(result.bailoutBoundaryReached).toBe(true);
    expect(result.deployPerformed).toBe(false);
  });

  it("normalizes ACP transport into shared runtime truth without provider-direct calls", async () => {
    await withRuntimeHarness(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "acp-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "executor",
      });
      const request = createAcpBridgeTransportRequest({
        requestId: "acp-request",
        runtimeJobId: "acp-job",
        sessionId: "acp-session",
        mode: "local_loopback_fake_pilot",
        objective: "Prove ACP transport envelope.",
        authorityProfileId: "trusted-local-yolo-9h",
      });
      const result = await runAcpBridgeLoopbackPilot({ runtimeJobs, request });
      expect(result.workQueueReadModelCompatible).toBe(true);
      expect(result.providerDirectCallMade).toBe(false);
      const events = await runtimeJobs.listEvents("acp-job");
      expect(events.some((event) => event.eventType === "acp_bridge.normalized_stream_event")).toBe(
        true,
      );
    });
  });
});
describe("trusted local YOLO hard-ban summary", () => {
  it("keeps UI/read-model hard bans bounded and explicit", async () => {
    const { getTrustedLocalYoloHardBanSummary } = await import("./trusted-local-yolo-profile.ts");
    type HardBanSummaryItem = ReturnType<typeof getTrustedLocalYoloHardBanSummary>[number];

    const summary = getTrustedLocalYoloHardBanSummary();

    expect(summary).toHaveLength(6);
    expect(summary.map((item: HardBanSummaryItem) => item.key)).toEqual([
      "deploy",
      "outbound_sending",
      "model_promotion",
      "hidden_work_queue_lifecycle_mutation",
      "hidden_rebuild",
      "raw_transcript_prompt_log_storage",
    ]);
    expect(summary.every((item: HardBanSummaryItem) => item.banned)).toBe(true);
    expect(
      summary.every(
        (item: HardBanSummaryItem) => Object.keys(item).toSorted().join(",") === "banned,key,label",
      ),
    ).toBe(true);
  });
});
