import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverWorkEpisodeOutcomePackArtifacts } from "../../../../src/infra/work-episode-outcome-pack.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  LocalCodexSmokeLiveEntrypointRepository,
  LocalCodexSmokePreflightRepository,
  LocalCodexSmokeRequestRepository,
  LocalCodexSmokeTestRepository,
  SupervisorAdapterRepository,
  createFutureLocalCodexRunPackageMetadata,
  createLocalCodexSmokeRunRequest,
  createManualPromptSource,
  createOperatorAcceptanceMetadata,
  isCodexBridgeJobPayload,
  produceReadinessReport,
  type LocalCodexSmokeRunAcknowledgements,
  type LocalCodexSmokeRunRequest,
  type LocalCodexSmokeTestPlan,
  type OperatorAcceptanceMetadata,
  type ReadinessEvidence,
  type SupervisorProcessRunner,
} from "./index.ts";

async function withLiveEntrypointHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    adapter: SupervisorAdapterRepository;
    smoke: LocalCodexSmokeTestRepository;
    requests: LocalCodexSmokeRequestRepository;
    preflight: LocalCodexSmokePreflightRepository;
    liveEntrypoint: LocalCodexSmokeLiveEntrypointRepository;
    workQueue: WorkQueueRepository;
    artifactRoot: string;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "execution-platform-live-smoke-"));
  let now = new Date("2026-05-02T00:00:00.000Z");
  const previousPackRoot = process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT;
  process.env.MODEL_MEMORY_PHASE2_WORK_EPISODE_OUTCOME_PACK_ROOT = artifactRoot;
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const adapter = new SupervisorAdapterRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const smoke = new LocalCodexSmokeTestRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const requests = new LocalCodexSmokeRequestRepository(runtimeJobs, smoke, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const preflight = new LocalCodexSmokePreflightRepository(runtimeJobs, requests, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const liveEntrypoint = new LocalCodexSmokeLiveEntrypointRepository(
      runtimeJobs,
      requests,
      preflight,
      {
        now: () => now,
        maxArtifactMetadataBytes: 64 * 1024,
        workEpisodeCloseoutArtifactRoot: artifactRoot,
      },
    );
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      adapter,
      smoke,
      requests,
      preflight,
      liveEntrypoint,
      workQueue,
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

function completeReadinessReport() {
  const gateIds = [
    "role_docs_present",
    "required_skill_docs_present",
    "supervisor_protocol_accepted",
    "trust_handoff_accepted",
    "work_queue_oversight_semantics_accepted",
    "validation_policy_accepted",
    "rebuild_recovery_policy_accepted",
    "stream_artifact_capture_policy_accepted",
    "model_lane_policy_accepted",
    "alternative_model_qualification_policy_accepted",
  ] as const;
  const evidence: ReadinessEvidence[] = gateIds.map((gateId) => ({
    gateId,
    accepted: true,
    evidenceRef: `doc://${gateId}`,
    acceptedBy: "user",
    acceptedAt: "2026-05-02T00:00:00.000Z",
    details: {
      roleDocs: true,
      skillDocs: true,
      restartResumeHandshake: true,
      idempotentEventReplay: true,
      heartbeat: true,
      streamEventDelivery: true,
      artifactPointers: true,
      cancellation: true,
      pauseRedirect: true,
      rebuildSemantics: true,
      autobailoutHandoff: true,
      failureTaxonomy: true,
      liveDaemonImplemented: false,
      explicitUserAcceptance: true,
      repoScope: ["/root/services/openclaw-roles/live"],
      commandShellBoundaries: true,
      rebuildBoundaries: true,
      bailoutBoundaries: true,
      maxAttemptsAndStopConditions: true,
      auditArtifactsRequired: true,
      rollbackPath: true,
      livePermissionGrant: false,
      finalizedPromptsBecomeCandidates: true,
      streamAttachesToItemRunStep: true,
      runningRequiresRuntimeEvidence: true,
      completedRequiresRuntimeEvidence: true,
      executorCompletedDistinctFromValidationPassed: true,
      completedWorkArtifactPlacement: true,
      noFakeDisabledExecutionUi: true,
      pauseRedirectCancelServerBackedFutureOnly: true,
      validationCommands: true,
      restartRecovery: true,
      failureBailout: true,
      boundedStreams: true,
      redaction: true,
      modelLanes: true,
      soakFlood: true,
      frontierBaseline: true,
      promotionGate: true,
    },
  }));
  return produceReadinessReport({
    evidence,
    presentRoleDocIds: [
      "orchestrator",
      "architect_spec_writer",
      "implementation_engineer",
      "test_engineer",
      "reviewer",
      "refactor_engineer",
      "rebuild_bailout_engineer",
      "observability_scribe",
      "docs_skills_writer",
      "guardrail_auditor",
    ],
    presentSkillDocIds: [
      "openclaw-engineering-standards",
      "repo-boundary-and-path-awareness",
      "tailscale-safe-ui-bridge",
      "deterministic-vs-model-judgment-guardrail",
      "prohibited-semantic-drift-guardrail",
      "execution-platform-runtime-truth",
      "work-queue-lifecycle-semantics",
      "rebuild-and-container-recovery",
      "codex-bailout-protocol",
      "validation-and-proof-policy",
      "artifact-and-stream-capture-policy",
      "orchestrator-role-contract",
      "implementer-role-contract",
      "tester-role-contract",
      "reviewer-role-contract",
      "bailout-role-contract",
      "docs-skills-writer-role-contract",
    ],
  });
}

function acceptance(overrides: Partial<OperatorAcceptanceMetadata> = {}) {
  return createOperatorAcceptanceMetadata({
    acceptedBy: "operator",
    acceptedAt: "2026-05-02T00:00:00.000Z",
    runtimeJobId: "bridge-smoke",
    trustProfileId: "observe_only",
    executionMode: "observe_only_live_local_codex",
    repoPath: "/root/services/openclaw-roles/live",
    maxRuntimeMs: 60_000,
    reason: "operator-approved live smoke entrypoint test",
    expiresAt: "2026-05-02T01:00:00.000Z",
    ...overrides,
  });
}

const allAcknowledgements: LocalCodexSmokeRunAcknowledgements = {
  acknowledgeSeparateExecutorSession: true,
  acknowledgeNoSharedManualSession: true,
  acknowledgeObserveOnlyLimitations: true,
  acknowledgeNoRebuild: true,
  acknowledgeNoAutobailout: true,
  acknowledgeNoSubagents: true,
  acknowledgeNoWorkQueueLifecycleMutation: true,
};

async function createPlan(input: {
  bridge: CodexBridgeRepository;
  adapter: SupervisorAdapterRepository;
  smoke: LocalCodexSmokeTestRepository;
  executorKind?: "codex_cli" | "acp";
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}): Promise<LocalCodexSmokeTestPlan> {
  const job = await input.bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-smoke",
    executorKind: input.executorKind ?? "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Live smoke entrypoint objective",
      promptText: "State that this is an observe-only bridge smoke test and do not request tools.",
      createdBy: "user",
    }),
    workQueueLink: input.workQueueLink,
  });
  if (!isCodexBridgeJobPayload(job.payload)) {
    throw new Error("expected codex bridge payload");
  }
  const readinessReport = completeReadinessReport();
  const runPackage = createFutureLocalCodexRunPackageMetadata({
    packageId: "future-run-package",
    payload: job.payload,
    runtimeJobId: job.jobId,
    readinessReport,
  });
  const eligibility = await input.adapter.evaluateObserveOnlyReadiness({
    runtimeJobId: job.jobId,
    readinessReport,
  });
  const result = await input.smoke.evaluateEligibility({
    runtimeJobId: "bridge-smoke",
    runPackage,
    eligibilityReport: eligibility,
    operatorAcceptance: acceptance(),
    smokeTestId: "smoke-1",
    sessionId: "smoke-session",
  });
  if (!result.plan) {
    throw new Error(`expected smoke plan: ${result.blockingReasons.join(",")}`);
  }
  return result.plan;
}

function liveRequest(
  plan: LocalCodexSmokeTestPlan,
  overrides: Partial<LocalCodexSmokeRunRequest> = {},
): LocalCodexSmokeRunRequest {
  return {
    ...createLocalCodexSmokeRunRequest({
      requestId: "request-live",
      requestedBy: "operator",
      expiresAt: "2026-05-02T01:00:00.000Z",
      reason: "run one live observe-only smoke test",
      requestedMode: "live_observe_only",
      operatorAcceptance: acceptance(),
      smokeTestPlan: plan,
      acknowledgements: allAcknowledgements,
      enableLiveCodexPilot: true,
      enableOperatorApprovedSmokeTest: true,
      now: new Date("2026-05-02T00:00:00.000Z"),
    }),
    ...overrides,
  };
}

function liveShapeFakeRunner(): SupervisorProcessRunner {
  return {
    async run(_descriptor, callbacks) {
      await callbacks.onJsonlLine?.(
        JSON.stringify({ type: "thread.started", thread_id: "thread-live-fake" }),
      );
      await callbacks.onJsonlLine?.(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "bridge live smoke final response" },
        }),
      );
      await callbacks.onHeartbeat?.();
      return {
        status: "completed",
        exitCode: 0,
        errorMessage: null,
        finalMessage: "bridge live smoke final response",
        emittedEventCount: 2,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: false,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
        liveExecutionEnabled: false,
        commandExecuted: true,
      };
    },
  };
}

function realShapeInjectedRunner(): SupervisorProcessRunner {
  return {
    async run(_descriptor, callbacks) {
      await callbacks.onJsonlLine?.(
        JSON.stringify({ type: "thread.started", thread_id: "thread-live-real-shaped" }),
      );
      await callbacks.onJsonlLine?.(
        JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "real-shaped bridge final response" },
        }),
      );
      await callbacks.onHeartbeat?.();
      return {
        status: "completed",
        exitCode: 0,
        errorMessage: null,
        finalMessage: "real-shaped bridge final response",
        emittedEventCount: 2,
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
      };
    },
  };
}

describe("local Codex live smoke entrypoint", () => {
  it("blocks when no accepted live smoke request exists", async () => {
    await withLiveEntrypointHarness(async ({ bridge, liveEntrypoint, runtimeJobs }) => {
      await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-smoke",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Missing request",
          promptText: "Do not run.",
          createdBy: "user",
        }),
      });
      const result = await liveEntrypoint.runApprovedLiveSmoke({
        runtimeJobId: "bridge-smoke",
        operatorApprovedBy: "operator",
        runner: liveShapeFakeRunner(),
      });
      expect(result).toMatchObject({
        commandExecuted: false,
        blockingReasons: expect.arrayContaining(["smoke_run_request_required"]),
        successCriteria: expect.objectContaining({ smokeSucceeded: false }),
      });
      await expect(runtimeJobs.listEvents("bridge-smoke", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.live_smoke_blocked" }),
        ]),
      );
    });
  });

  it("blocks non-live requests, missing live flags, and prior command execution evidence", async () => {
    await withLiveEntrypointHarness(async ({ bridge, adapter, smoke, liveEntrypoint }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const planOnly = createLocalCodexSmokeRunRequest({
        requestId: "plan-only",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "not live",
        requestedMode: "plan_only",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const blocked = await liveEntrypoint.runApprovedLiveSmoke({
        runtimeJobId: "bridge-smoke",
        operatorApprovedBy: "operator",
        request: planOnly,
        runner: liveShapeFakeRunner(),
      });
      expect(blocked.blockingReasons).toEqual(
        expect.arrayContaining(["request_mode_not_live_observe_only"]),
      );
      const noFlags = liveRequest(plan, {
        requestId: "no-flags",
        enableLiveCodexPilot: false,
        enableOperatorApprovedSmokeTest: false,
        smokeRunGate: {
          ...planOnly.smokeRunGate,
          allowed: false,
          blockingReasons: ["enable_live_codex_pilot_required"],
        },
      });
      const noFlagsResult = await liveEntrypoint.runApprovedLiveSmoke({
        runtimeJobId: "bridge-smoke",
        operatorApprovedBy: "operator",
        request: noFlags,
        runner: liveShapeFakeRunner(),
      });
      expect(noFlagsResult.blockingReasons).toEqual(
        expect.arrayContaining(["enable_live_codex_pilot_required"]),
      );
    });
  });

  it("blocks prior command execution evidence", async () => {
    await withLiveEntrypointHarness(
      async ({ bridge, adapter, smoke, requests, liveEntrypoint, runtimeJobs }) => {
        const plan = await createPlan({ bridge, adapter, smoke });
        const request = liveRequest(plan, { requestId: "prior" });
        await requests.executeAcceptedRequest({ request });
        await runtimeJobs.attachArtifact({
          jobId: "bridge-smoke",
          artifactType: "codex_bridge.smoke_run_request_result",
          storageKind: "metadata",
          uri: "runtime-job://bridge-smoke/codex-bridge/prior-command-execution",
          contentType: "application/json",
          metadata: {
            artifactKind: "local_codex_smoke_run_request_result",
            requestId: "prior",
            runtimeJobId: "bridge-smoke",
            commandExecuted: true,
          },
        });
        const prior = await liveEntrypoint.runApprovedLiveSmoke({
          runtimeJobId: "bridge-smoke",
          operatorApprovedBy: "operator",
          runner: liveShapeFakeRunner(),
        });
        expect(prior.blockingReasons).toContain("prior_command_execution_evidence_found");
      },
    );
  });

  it("records live-smoke-shaped evidence with an injected runner without mutating Work Queue", async () => {
    await withLiveEntrypointHarness(
      async ({ bridge, adapter, smoke, liveEntrypoint, runtimeJobs, workQueue }) => {
        await workQueue.createWorkItem({
          workItemId: "work-item-1",
          itemType: "build_plan",
          title: "Linked live smoke item",
        });
        const plan = await createPlan({
          bridge,
          adapter,
          smoke,
          workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
        });
        const result = await liveEntrypoint.runApprovedLiveSmoke({
          runtimeJobId: "bridge-smoke",
          operatorApprovedBy: "operator",
          request: liveRequest(plan),
          liveSmokeRunId: "live-smoke-1",
          preflightId: "preflight-1",
          runbookId: "runbook-1",
          runner: liveShapeFakeRunner(),
        });
        expect(result).toMatchObject({
          liveSmokeRunId: "live-smoke-1",
          requestId: "request-live",
          preflightId: "preflight-1",
          runbookId: "runbook-1",
          smokeTestId: "smoke-1",
          sessionId: "smoke-session",
          commandExecuted: true,
          codexCliInvoked: false,
          liveExecutionEnabled: false,
          eventCount: 2,
          finalResponsePresent: true,
          finalResponseCandidate: "bridge live smoke final response",
          workQueueLifecycleMutated: false,
          rebuildPerformed: false,
          autobailoutPerformed: false,
          subagentStarted: false,
          acpSessionStarted: false,
          successCriteria: expect.objectContaining({
            preflightAllowed: true,
            codexInvokedThroughBridgePath: true,
            processResultRecorded: true,
            smokeSucceeded: true,
            taskSuccessClaimed: false,
          }),
        });
        expect(result.completedWorkPathSatisfied).toBe(false);
        await expect(
          liveEntrypoint.readLatestLiveSmokeResult("bridge-smoke"),
        ).resolves.toMatchObject({ liveSmokeRunId: "live-smoke-1" });
        await expect(runtimeJobs.listEvents("bridge-smoke", 200)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ eventType: "codex_bridge.smoke_preflight_checked" }),
            expect.objectContaining({ eventType: "codex_bridge.smoke_operator_runbook_created" }),
            expect.objectContaining({ eventType: "codex_bridge.smoke_test_stream_event" }),
            expect.objectContaining({ eventType: "codex_bridge.live_smoke_completed" }),
          ]),
        );
        const artifacts = await runtimeJobs.listArtifacts("bridge-smoke");
        expect(
          artifacts.some(
            (artifact) => artifact.artifactType === "execution_platform.work_episode_outcome_pack",
          ),
        ).toBe(false);
        await expect(workQueue.readWorkItemTruth("work-item-1")).resolves.toMatchObject({
          item: expect.objectContaining({ lifecycleState: "draft" }),
        });
      },
    );
  });

  it("auto-emits a Work Episode Outcome Pack after a real-shaped bridge runner result", async () => {
    await withLiveEntrypointHarness(
      async ({ bridge, adapter, smoke, liveEntrypoint, runtimeJobs, artifactRoot }) => {
        const plan = await createPlan({ bridge, adapter, smoke });
        const result = await liveEntrypoint.runApprovedLiveSmoke({
          runtimeJobId: "bridge-smoke",
          operatorApprovedBy: "operator",
          request: liveRequest(plan),
          liveSmokeRunId: "live-smoke-real-shaped",
          preflightId: "preflight-real-shaped",
          runbookId: "runbook-real-shaped",
          runner: realShapeInjectedRunner(),
        });

        expect(result).toMatchObject({
          liveSmokeRunId: "live-smoke-real-shaped",
          commandExecuted: true,
          codexCliInvoked: true,
          liveExecutionEnabled: true,
          finalResponseCandidate: "real-shaped bridge final response",
        });
        const artifacts = await runtimeJobs.listArtifacts("bridge-smoke");
        const closeoutArtifacts = artifacts.filter(
          (artifact) => artifact.artifactType === "execution_platform.work_episode_outcome_pack",
        );
        expect(closeoutArtifacts).toHaveLength(1);
        expect(closeoutArtifacts[0]?.metadata).toMatchObject({
          artifactKind: "execution_platform_work_episode_closeout",
          runtimeJobId: "bridge-smoke",
          sourceLiveSmokeRunId: "live-smoke-real-shaped",
          sourceRequestId: "request-live",
          promptPersisted: false,
          rawResponsePersisted: false,
          rawFullTranscriptPersisted: false,
          discoverableByModelMemory: true,
        });
        await expect(runtimeJobs.listEvents("bridge-smoke", 300)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              eventType: "execution_platform.work_episode_closeout_emitted",
            }),
          ]),
        );
        const discovered = await discoverWorkEpisodeOutcomePackArtifacts([artifactRoot]);
        expect(discovered.map((record) => record.pack.episodeId)).toContain(
          (closeoutArtifacts[0]?.metadata as { episodeId: string }).episodeId,
        );
      },
    );
  });

  it("keeps smoke success distinct from task success", async () => {
    await withLiveEntrypointHarness(async ({ bridge, adapter, smoke, liveEntrypoint }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const result = await liveEntrypoint.runApprovedLiveSmoke({
        runtimeJobId: "bridge-smoke",
        operatorApprovedBy: "operator",
        request: liveRequest(plan),
        runner: liveShapeFakeRunner(),
      });
      expect(result.successCriteria).toMatchObject({
        smokeSucceeded: true,
        taskSuccessClaimed: false,
        processCompletionIsOnlySmokeSuccess: true,
      });
      expect(result.completedWorkPathSatisfied).toBe(false);
    });
  });
});
