import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadLatestWorkEpisodeOutcomePack } from "../../../../src/infra/model-memory-proactivity-runtime.ts";
import { evaluateWorkEpisodeOutcomePackEligibility } from "../../../../src/infra/work-episode-outcome-pack.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout,
  ExecutionPlatformWorkEpisodeCloseoutRepository,
  validateExecutionPlatformCloseoutPack,
} from "./work-episode-closeout.ts";

async function withCloseoutHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    closeout: ExecutionPlatformWorkEpisodeCloseoutRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "execution-platform-closeout-"));
  let now = new Date("2026-05-02T12:00:00.000Z");
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const closeout = new ExecutionPlatformWorkEpisodeCloseoutRepository(runtimeJobs, {
      now: () => now,
      artifactRoot,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    return await work({
      runtimeJobs,
      closeout,
      artifactRoot,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    if (previousPackRoot === undefined) {
      delete process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
    } else {
      process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = previousPackRoot;
    }
    await database.close();
  }
}

function smokeResult() {
  return {
    artifactKind: "local_codex_live_smoke_result",
    liveSmokeRunId: "live-smoke-closeout",
    runtimeJobId: "bridge-closeout",
    requestId: "request-closeout",
    preflightId: "preflight-closeout",
    runbookId: "runbook-closeout",
    smokeTestId: "smoke-closeout",
    sessionId: "session-closeout",
    startedAt: "2026-05-02T12:00:00.000Z",
    completedAt: "2026-05-02T12:01:00.000Z",
    operatorApprovedBy: "operator",
    executorSessionIsSeparate: true,
    manualOperatorSessionSharedWithExecutor: false,
    codexCliInvoked: true,
    commandExecuted: true,
    liveExecutionEnabled: true,
    processResult: {
      status: "completed",
      exitCode: 0,
      errorMessage: null,
      finalMessage: "observe-only smoke final",
      emittedEventCount: 4,
      codexCliInvoked: true,
      acpSessionStarted: false,
      shellCommandExecuted: false,
      providerCallMade: false,
      rebuildPerformed: false,
      schedulerStarted: false,
      daemonStarted: false,
      subagentStarted: false,
      liveExecutionEnabled: true,
      commandExecuted: true,
    },
    eventCount: 4,
    finalResponsePresent: true,
    finalResponseCandidate: "observe-only smoke final",
    completedWorkPathSatisfied: false,
    validationEvidencePresent: false,
    workQueueLifecycleMutated: false,
    rebuildPerformed: false,
    autobailoutPerformed: false,
    subagentStarted: false,
    acpSessionStarted: false,
    providerCallMade: false,
    blockingReasons: [],
    successCriteria: {
      preflightAllowed: true,
      codexInvokedThroughBridgePath: true,
      processResultRecorded: true,
      streamOrProcessEvidenceRecorded: true,
      noFileChangesRequiredOrRequested: true,
      workQueueLifecycleNotMutated: true,
      noRebuildAutobailoutSubagentAcpOrPromotion: true,
      processCompletionIsOnlySmokeSuccess: true,
      smokeSucceeded: true,
      taskSuccessClaimed: false,
    },
  };
}

async function seedBridgeJob(runtimeJobs: RuntimeJobRepository) {
  await runtimeJobs.enqueueJob({
    jobId: "bridge-closeout",
    jobType: "executor.codex_bridge",
    queueName: "executor",
    payload: {
      family: "codex_bridge",
      executorKind: "codex_cli",
      executionMode: "fake_stream_proof",
      prompt: {
        artifactKind: "finalized_prompt",
        promptId: "prompt-closeout",
        sourceKind: "manual",
        objective: "Run a local Codex observe-only smoke test through the bridge.",
        promptText: "Observe only.",
        workItemId: null,
        versionId: null,
        finalizedAt: "2026-05-02T12:00:00.000Z",
        metadata: {},
      },
      trustPolicy: {
        profileId: "observe_only",
        requiresHumanApproval: true,
        allowsLocalYolo: false,
        allowsRebuild: false,
        allowsAutobailout: false,
        livePermissionGrant: false,
      },
      autobailoutPolicy: {
        allowAutobailout: false,
        maxBailoutAttempts: 0,
        allowedRepoPaths: ["/root/services/openclaw-roles/live"],
        requiresOriginalObjective: true,
        requiresFailureLogs: true,
        requiresPriorStreamEvidence: true,
        requiresRebuildEvidence: true,
      },
      supervisor: {
        supervisorName: "execution-supervisor",
        runsOutsideOpenClawAppContainer: true,
        ownsFutureProcessContinuity: true,
        openClawOwnsDurableTruth: true,
        liveDaemonImplemented: false,
        supportedFutureExecutors: ["codex_cli"],
      },
      environment: {
        artifactKind: "environment_contract",
        repoPath: "/root/services/openclaw-roles/live",
        workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
        containerService: { supervisorBoundary: "execution-supervisor" },
        rebuildCommands: [],
        validationCommands: [],
        safeUiBridge: { tailscaleRequired: true, descriptor: "Tailscale safe UI bridge" },
        knownHazards: [],
        prohibitedPatterns: [],
        secretsIncluded: false,
      },
    },
  });
  await runtimeJobs.attachArtifact({
    jobId: "bridge-closeout",
    artifactType: "codex_bridge.live_smoke_result",
    storageKind: "metadata",
    uri: "runtime-job://bridge-closeout/codex-bridge/live-smoke-result",
    contentType: "application/json",
    metadata: smokeResult(),
  });
}

describe("execution platform work episode closeout", () => {
  it("builds and validates an outcome pack from Execution Platform smoke evidence", async () => {
    await withCloseoutHarness(async ({ runtimeJobs, closeout }) => {
      await seedBridgeJob(runtimeJobs);

      const input = await closeout.buildCloseoutInputFromRuntimeJobEvidence({
        runtimeJobId: "bridge-closeout",
      });
      const pack = buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout(input);

      expect(validateExecutionPlatformCloseoutPack(pack)).toEqual(pack);
      expect(pack.schemaVersion).toBe("work_episode_outcome_pack.v1");
      expect(pack.testsRun[0]).toMatchObject({ status: "passed" });
      expect(pack.followUpCandidates[0]?.title).toContain("Pause Redirect Cancel");
      expect(JSON.stringify(pack).toLowerCase()).not.toContain("raw full transcript");
    });
  });

  it("rejects prohibited raw, prompt, and secret-like content", () => {
    expect(() =>
      buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout({
        runtimeJobId: "bridge-closeout",
        completedAt: "2026-05-02T12:00:00.000Z",
        userGoal: "Build a closeout pack from unsafe evidence.",
        workSummary: "raw-tool-log-marker includes sk-testsecret123456789",
        finalOutcome: "Unsafe content should be rejected.",
      }),
    ).toThrow(/prohibited raw\/private content/u);
  });

  it("writes, persists, and gates a meaningful closeout pack", async () => {
    await withCloseoutHarness(async ({ runtimeJobs, closeout, artifactRoot }) => {
      await seedBridgeJob(runtimeJobs);

      await expect(closeout.produceCloseoutGateReport("bridge-closeout")).resolves.toMatchObject({
        allowed: false,
        pauseOrRedirectWorthy: true,
        blockingReasons: expect.arrayContaining(["work_episode_closeout_missing"]),
      });

      const result = await closeout.emitCloseoutForRuntimeJob({
        runtimeJobId: "bridge-closeout",
        filesTouched: [
          {
            path: "extensions/execution-platform/src/codex-bridge/work-episode-closeout.ts",
            changeKind: "created",
            summary: "Adapts runtime job evidence into Work Episode Outcome Packs.",
          },
        ],
        testsRun: [
          {
            command:
              "pnpm test:file extensions/execution-platform/src/codex-bridge/work-episode-closeout.test.ts",
            status: "passed",
            summary: "Focused closeout integration tests passed.",
          },
        ],
      });

      expect(result.eligibility).toMatchObject({ status: "eligible", reviewEligible: true });
      expect(result.packArtifact.jsonPath).toContain(artifactRoot);
      await expect(runtimeJobs.listArtifacts("bridge-closeout")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactType: "execution_platform.work_episode_outcome_pack",
            uri: result.packArtifact.jsonPath,
            sha256: result.packArtifact.packHash,
          }),
        ]),
      );
      await expect(runtimeJobs.listEvents("bridge-closeout", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "execution_platform.work_episode_closeout_emitted",
          }),
        ]),
      );
      await expect(closeout.readCloseoutStatus("bridge-closeout")).resolves.toMatchObject({
        closeoutPresent: true,
        closeoutRequired: true,
        closeoutEligible: true,
        closeoutSafe: true,
        artifactPointerPersisted: true,
        discoverableByModelMemory: true,
        blockingReasons: [],
      });
      await expect(closeout.produceCloseoutGateReport("bridge-closeout")).resolves.toMatchObject({
        allowed: true,
        pauseOrRedirectWorthy: false,
      });
    });
  });

  it("reuses the existing closeout for the same bridge smoke result", async () => {
    await withCloseoutHarness(async ({ runtimeJobs, closeout }) => {
      await seedBridgeJob(runtimeJobs);

      const first = await closeout.emitCloseoutForRuntimeJob({
        runtimeJobId: "bridge-closeout",
      });
      const second = await closeout.emitCloseoutForRuntimeJob({
        runtimeJobId: "bridge-closeout",
      });

      expect(second.metadata).toMatchObject({
        episodeId: first.metadata.episodeId,
        packHash: first.metadata.packHash,
        sourceLiveSmokeRunId: "live-smoke-closeout",
        sourceRequestId: "request-closeout",
      });
      expect(second.runtimeArtifact.artifactId).toBe(first.runtimeArtifact.artifactId);
      const closeoutArtifacts = (await runtimeJobs.listArtifacts("bridge-closeout")).filter(
        (artifact) => artifact.artifactType === "execution_platform.work_episode_outcome_pack",
      );
      expect(closeoutArtifacts).toHaveLength(1);
    });
  });

  it("blocks and then passes the next-run closeout gate for a prior meaningful job", async () => {
    await withCloseoutHarness(async ({ runtimeJobs, closeout }) => {
      await seedBridgeJob(runtimeJobs);

      await expect(
        closeout.produceNextRunCloseoutGateReport("bridge-closeout"),
      ).resolves.toMatchObject({
        previousRuntimeJobId: "bridge-closeout",
        nextExecutionAllowed: false,
        pauseOrRedirectWorthy: true,
        blockingReasons: expect.arrayContaining(["work_episode_closeout_missing"]),
      });

      await closeout.emitCloseoutForRuntimeJob({ runtimeJobId: "bridge-closeout" });

      await expect(
        closeout.produceNextRunCloseoutGateReport("bridge-closeout"),
      ).resolves.toMatchObject({
        previousRuntimeJobId: "bridge-closeout",
        nextExecutionAllowed: true,
        pauseOrRedirectWorthy: false,
        blockingReasons: [],
      });
    });
  });

  it("marks no-op closeout packs ineligible without raw transcript fallback", () => {
    const pack = buildWorkEpisodeOutcomePackFromExecutionPlatformCloseout({
      runtimeJobId: "noop-job",
      completedAt: "2026-05-02T12:00:00.000Z",
      outcomeStatus: "completed",
      userGoal: "Acknowledge a status update.",
      workSummary: "No durable work happened.",
      finalOutcome: "No files, tests, failures, follow-ups, or skill evidence were created.",
    });

    expect(pack.filesTouched).toHaveLength(0);
    expect(pack.testsRun).toHaveLength(0);
    expect(pack.followUpCandidates).toHaveLength(0);
    expect(evaluateWorkEpisodeOutcomePackEligibility(pack)).toMatchObject({
      status: "ineligible",
      reviewEligible: false,
      reasonCodes: expect.arrayContaining(["evidence_bearing_fields_missing"]),
    });
  });

  it("emitted packs are discoverable by the Model Memory proactivity runtime", async () => {
    await withCloseoutHarness(async ({ runtimeJobs, closeout }) => {
      await seedBridgeJob(runtimeJobs);
      const result = await closeout.emitCloseoutForRuntimeJob({
        runtimeJobId: "bridge-closeout",
        testsRun: [
          {
            command: "focused closeout proof",
            status: "passed",
            summary: "Pack can be discovered through the configured Model Memory root.",
          },
        ],
      });

      const latest = await loadLatestWorkEpisodeOutcomePack();

      expect(latest?.episodeId).toBe(result.pack.episodeId);
      expect(latest?.sourceRefs).toContain("runtime-job://bridge-closeout");
    });
  });
});
