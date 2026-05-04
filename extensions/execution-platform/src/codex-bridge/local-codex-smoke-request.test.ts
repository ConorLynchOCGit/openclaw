import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  DisabledSupervisorProcessRunner,
  FakeSupervisorProcessRunner,
  LocalCodexSmokeRequestRepository,
  LocalCodexSmokeTestRepository,
  SupervisorAdapterRepository,
  createFutureLocalCodexRunPackageMetadata,
  createLocalCodexSmokeRunRequest,
  createManualPromptSource,
  createOperatorAcceptanceMetadata,
  dispatchLocalCodexSmokeCli,
  isCodexBridgeJobPayload,
  produceReadinessReport,
  validateLocalCodexSmokeRunRequest,
  type LocalCodexSmokeRunAcknowledgements,
  type LocalCodexSmokeTestPlan,
  type OperatorAcceptanceMetadata,
  type ReadinessEvidence,
} from "./index.ts";

async function withRequestHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    adapter: SupervisorAdapterRepository;
    smoke: LocalCodexSmokeTestRepository;
    requests: LocalCodexSmokeRequestRepository;
    workQueue: WorkQueueRepository;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-02T00:00:00.000Z");
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
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      adapter,
      smoke,
      requests,
      workQueue,
      setNow(next) {
        now = next;
      },
    });
  } finally {
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
    reason: "operator-approved smoke request test",
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
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}): Promise<LocalCodexSmokeTestPlan> {
  const job = await input.bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-smoke",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Smoke request objective",
      promptText: "Return a final response without live execution.",
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

describe("local Codex smoke run requests", () => {
  it("persists a plan-only request and does not run a process", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke, requests, runtimeJobs }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const request = createLocalCodexSmokeRunRequest({
        requestId: "request-1",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "plan the first smoke test",
        requestedMode: "plan_only",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const result = await requests.executeAcceptedRequest({ request });
      expect(result).toMatchObject({
        status: "accepted_for_plan",
        planOnly: true,
        executablePlanOnly: true,
        smokeReport: null,
        commandExecuted: false,
      });
      expect(result.safetySummary).toMatchObject({
        manualOperatorSessionSharedWithExecutor: false,
        separateExecutorSessionRequired: true,
        processCompletionMeaning: "executor_process_completed_only",
      });
      await expect(requests.readLatestSmokeRunRequest("bridge-smoke")).resolves.toMatchObject({
        requestId: "request-1",
      });
      await expect(runtimeJobs.listEvents("bridge-smoke", 50)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.smoke_run_request_persisted" }),
          expect.objectContaining({
            eventType: "codex_bridge.smoke_run_request_result_recorded",
          }),
        ]),
      );
    });
  });

  it("validates missing, expired, unacknowledged, and authority-bearing requests", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const missing = createLocalCodexSmokeRunRequest({
        requestId: "missing",
        requestedBy: "",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "invalid",
        requestedMode: "fake_dry_run",
        operatorAcceptance: null,
        smokeTestPlan: null,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(
        validateLocalCodexSmokeRunRequest({
          request: missing,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }).blockingReasons,
      ).toEqual(
        expect.arrayContaining([
          "runtime_job_id_required",
          "smoke_test_plan_required",
          "operator_acceptance_required",
          "requested_by_required",
        ]),
      );
      const expired = createLocalCodexSmokeRunRequest({
        requestId: "expired",
        requestedBy: "operator",
        expiresAt: "2026-05-01T00:00:00.000Z",
        reason: "expired",
        requestedMode: "fake_dry_run",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        acknowledgements: allAcknowledgements,
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(
        validateLocalCodexSmokeRunRequest({
          request: expired,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }),
      ).toMatchObject({
        status: "expired",
        blockingReasons: expect.arrayContaining(["request_expired"]),
      });
      const badAuthorityPlan = {
        ...plan,
        allowRebuild: true,
        workQueueLifecycleMutationAllowed: true,
      } as unknown as LocalCodexSmokeTestPlan;
      const blocked = createLocalCodexSmokeRunRequest({
        requestId: "blocked",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "blocked",
        requestedMode: "live_observe_only",
        operatorAcceptance: acceptance(),
        smokeTestPlan: badAuthorityPlan,
        acknowledgements: { acknowledgeSeparateExecutorSession: true },
        enableLiveCodexPilot: false,
        enableOperatorApprovedSmokeTest: false,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(
        validateLocalCodexSmokeRunRequest({
          request: blocked,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }).blockingReasons,
      ).toEqual(
        expect.arrayContaining([
          "all_smoke_request_acknowledgements_required",
          "enable_live_codex_pilot_required",
          "enable_operator_approved_smoke_test_required",
          "rebuild_authority_blocked",
          "work_queue_lifecycle_mutation_blocked",
        ]),
      );
    });
  });

  it("rejects wrong repo, missing safe UI metadata, and non-allowlisted descriptor", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const badPlan = {
        ...plan,
        repoPath: "/tmp/wrong",
        futureRunPackage: {
          ...plan.futureRunPackage,
          safeUiBridgeMetadata: { tailscaleRequired: false, descriptor: "missing" },
          validationCommandMetadata: [],
        },
        processDescriptor: {
          ...plan.processDescriptor,
          command: "bash",
          args: ["run"],
          cwd: "/tmp/wrong",
          sourcePackageId: "",
        },
      } as unknown as LocalCodexSmokeTestPlan;
      const request = createLocalCodexSmokeRunRequest({
        requestId: "bad-descriptor",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "bad descriptor",
        requestedMode: "fake_dry_run",
        operatorAcceptance: acceptance(),
        smokeTestPlan: badPlan,
        acknowledgements: allAcknowledgements,
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(
        validateLocalCodexSmokeRunRequest({
          request,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }).blockingReasons,
      ).toEqual(
        expect.arrayContaining([
          "repo_scope_mismatch",
          "safe_ui_bridge_metadata_required",
          "validation_command_metadata_required",
          "invalid_command",
          "invalid_args_prefix",
          "descriptor_source_package_id_required",
        ]),
      );
    });
  });

  it("runs fake requests with an injected fake runner and records disabled-runner refusal", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke, requests }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const request = createLocalCodexSmokeRunRequest({
        requestId: "fake",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "fake dry-run",
        requestedMode: "fake_dry_run",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        acknowledgements: allAcknowledgements,
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const result = await requests.executeAcceptedRequest({
        request,
        runner: new FakeSupervisorProcessRunner([
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
        ]),
      });
      expect(result).toMatchObject({
        status: "completed",
        fakeDryRunUsed: true,
        commandExecuted: false,
        smokeReport: expect.objectContaining({ finalResponseCandidate: "done" }),
      });
      const disabled = await requests.executeAcceptedRequest({
        request: { ...request, requestId: "disabled" },
        runner: new DisabledSupervisorProcessRunner(),
      });
      expect(disabled).toMatchObject({
        status: "failed",
        smokeReport: expect.objectContaining({
          processResult: expect.objectContaining({ status: "refused", commandExecuted: false }),
        }),
      });
    });
  });

  it("keeps live observe-only as an executable plan unless a runner is explicitly supplied", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke, requests }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const request = createLocalCodexSmokeRunRequest({
        requestId: "live-plan",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "future live smoke",
        requestedMode: "live_observe_only",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        acknowledgements: allAcknowledgements,
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const result = await requests.executeAcceptedRequest({ request });
      expect(result).toMatchObject({
        status: "accepted_for_live_observe_only",
        executablePlanOnly: true,
        liveRunnerSupplied: false,
        smokeReport: null,
        codexCliInvoked: false,
        commandExecuted: false,
      });
    });
  });

  it("preserves Work Queue lifecycle and returns latest request result", async () => {
    await withRequestHarness(async ({ bridge, adapter, smoke, requests, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-1",
        itemType: "build_plan",
        title: "Linked smoke request",
      });
      const plan = await createPlan({
        bridge,
        adapter,
        smoke,
        workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
      });
      const request = createLocalCodexSmokeRunRequest({
        requestId: "linked",
        requestedBy: "operator",
        expiresAt: "2026-05-02T01:00:00.000Z",
        reason: "linked plan",
        requestedMode: "plan_only",
        operatorAcceptance: acceptance(),
        smokeTestPlan: plan,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      await requests.executeAcceptedRequest({ request });
      await expect(requests.readLatestSmokeRunResult("bridge-smoke")).resolves.toMatchObject({
        requestId: "linked",
        status: "accepted_for_plan",
      });
      await expect(workQueue.readWorkItemTruth("work-item-1")).resolves.toMatchObject({
        item: expect.objectContaining({ lifecycleState: "draft" }),
      });
    });
  });
});

describe("local Codex smoke CLI dispatcher", () => {
  it("defaults to plan-only and never opens DB or invokes Codex", () => {
    expect(dispatchLocalCodexSmokeCli(["plan"])).toMatchObject({
      command: "plan",
      accepted: true,
      mode: "plan_only",
      opensDbConnection: false,
      codexCliInvoked: false,
      commandExecuted: false,
    });
  });

  it("rejects mutating commands and requires explicit live flags", () => {
    expect(dispatchLocalCodexSmokeCli(["cancel", "--runtime-job-id", "job"])).toMatchObject({
      command: "unknown",
      accepted: false,
      blockingReasons: expect.arrayContaining(["unsupported_or_mutating_command"]),
    });
    const live = dispatchLocalCodexSmokeCli([
      "request",
      "--mode",
      "live_observe_only",
      "--runtime-job-id",
      "bridge-smoke",
      "--requested-by",
      "operator",
    ]);
    expect(live.accepted).toBe(false);
    expect(live.blockingReasons).toEqual(
      expect.arrayContaining([
        "enable_live_codex_pilot_required",
        "enable_operator_approved_smoke_test_required",
        "acknowledge_separate_executor_session_required",
      ]),
    );
  });
});
