import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  DisabledSupervisorProcessRunner,
  FakeSupervisorProcessRunner,
  LocalCodexSmokeTestRepository,
  SupervisorAdapterRepository,
  createFutureLocalCodexRunPackageMetadata,
  createManualPromptSource,
  createOperatorAcceptanceMetadata,
  evaluateLocalCodexSmokeRunGate,
  evaluateObserveOnlyLocalCodexPilotGate,
  isCodexBridgeJobPayload,
  produceReadinessReport,
  type FutureRunPackageMetadata,
  type LocalCodexSmokeTestPlan,
  type ObserveOnlyReadinessEvaluation,
  type OperatorAcceptanceMetadata,
  type ReadinessEvidence,
} from "./index.ts";

async function withSmokeHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    adapter: SupervisorAdapterRepository;
    smoke: LocalCodexSmokeTestRepository;
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
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      adapter,
      smoke,
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
    reason: "operator-approved smoke harness test",
    expiresAt: "2026-05-02T01:00:00.000Z",
    ...overrides,
  });
}

async function createPackageAndEligibility(input: {
  bridge: CodexBridgeRepository;
  adapter: SupervisorAdapterRepository;
  executorKind?: "codex_cli" | "acp";
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}): Promise<{
  runPackage: FutureRunPackageMetadata;
  eligibility: ObserveOnlyReadinessEvaluation;
}> {
  const job = await input.bridge.enqueueFakeCodexBridgeJob({
    jobId: "bridge-smoke",
    executorKind: input.executorKind ?? "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Smoke test objective",
      promptText: "Return a final response without live execution.",
      createdBy: "user",
    }),
    workQueueLink: input.workQueueLink,
  });
  if (!isCodexBridgeJobPayload(job.payload)) {
    throw new Error("expected codex bridge payload");
  }
  const readinessReport = completeReadinessReport();
  return {
    runPackage: createFutureLocalCodexRunPackageMetadata({
      packageId: "future-run-package",
      payload: job.payload,
      runtimeJobId: job.jobId,
      readinessReport,
    }),
    eligibility: await input.adapter.evaluateObserveOnlyReadiness({
      runtimeJobId: job.jobId,
      readinessReport,
    }),
  };
}

async function createPlan(input: {
  bridge: CodexBridgeRepository;
  adapter: SupervisorAdapterRepository;
  smoke: LocalCodexSmokeTestRepository;
}): Promise<LocalCodexSmokeTestPlan> {
  const { runPackage, eligibility } = await createPackageAndEligibility(input);
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

describe("local Codex smoke test harness", () => {
  it("rejects missing and non-bridge runtime jobs", async () => {
    await withSmokeHarness(async ({ runtimeJobs, smoke }) => {
      await expect(
        smoke.evaluateEligibility({
          runtimeJobId: "missing",
          runPackage: null,
          eligibilityReport: null,
          operatorAcceptance: null,
        }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["runtime_job_required"]),
      });
      await runtimeJobs.enqueueJob({
        jobId: "not-bridge",
        jobType: "demo.other",
        payload: {},
      });
      await expect(
        smoke.evaluateEligibility({
          runtimeJobId: "not-bridge",
          runPackage: null,
          eligibilityReport: null,
          operatorAcceptance: null,
        }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["runtime_job_not_codex_bridge"]),
      });
    });
  });

  it("rejects non-Codex executor kind and missing package or gate evidence", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({
        bridge,
        adapter,
        executorKind: "acp",
      });
      const result = await smoke.evaluateEligibility({
        runtimeJobId: "bridge-smoke",
        runPackage: null,
        eligibilityReport: null,
        operatorAcceptance: acceptance(),
      });
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          "executor_kind_not_codex_cli",
          "future_run_package_required",
          "eligibility_report_required",
        ]),
      );
      const blockedGate = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-smoke",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: null,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      await expect(
        smoke.evaluateEligibility({
          runtimeJobId: "bridge-smoke",
          runPackage,
          eligibilityReport: eligibility,
          operatorAcceptance: acceptance(),
          pilotGate: blockedGate,
        }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["pilot_gate_not_allowed"]),
      });
    });
  });

  it("rejects invalid acceptance, repo, safe UI, descriptor, authority, and Work Queue mutation", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({ bridge, adapter });
      const gate = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-smoke",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const badDescriptorGate = {
        ...gate,
        expectedProcessDescriptor: {
          ...gate.expectedProcessDescriptor!,
          command: "bash",
          args: ["run"],
          cwd: "/tmp/wrong",
          sourcePackageId: "",
          allowRebuild: true,
        },
      } as unknown as typeof gate;
      const result = await smoke.evaluateEligibility({
        runtimeJobId: "bridge-smoke",
        runPackage: {
          ...runPackage,
          expectedRepoPath: "/tmp/wrong",
          safeUiBridgeMetadata: { tailscaleRequired: false, descriptor: "missing" },
          validationCommandMetadata: [],
        },
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance({ expiresAt: "2026-05-01T00:00:00.000Z" }),
        pilotGate: badDescriptorGate,
        requestWorkQueueLifecycleMutation: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.blockingReasons).toEqual(
        expect.arrayContaining([
          "operator_acceptance_expired",
          "repo_scope_mismatch",
          "safe_ui_bridge_metadata_required",
          "validation_command_metadata_required",
          "invalid_command",
          "invalid_args_prefix",
          "descriptor_source_package_id_required",
          "descriptor_forbidden_future_authority",
          "work_queue_lifecycle_mutation_blocked",
        ]),
      );
    });
  });

  it("produces a plan with separate executor session semantics", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      expect(plan).toMatchObject({
        smokeTestId: "smoke-1",
        runtimeJobId: "bridge-smoke",
        sessionId: "smoke-session",
        manualOperatorSessionSharedWithExecutor: false,
        separateExecutorSessionRequired: true,
        workQueueLifecycleMutationAllowed: false,
        allowRebuild: false,
        allowAutobailout: false,
        allowSubagents: false,
        commandExecuted: false,
      });
      expect(plan.controlReadiness).toMatchObject({
        commandsTargetSeparateExecutorSession: true,
        commandsTargetManualOperatorSession: false,
      });
    });
  });

  it("requires explicit live smoke gate acknowledgements and allows fake dry-run when complete", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const blocked = evaluateLocalCodexSmokeRunGate({
        plan,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockingReasons).toEqual(
        expect.arrayContaining([
          "enable_live_codex_pilot_required",
          "enable_operator_approved_smoke_test_required",
          "separate_executor_session_acknowledgement_required",
          "no_shared_manual_session_acknowledgement_required",
        ]),
      );
      const allowed = evaluateLocalCodexSmokeRunGate({
        plan,
        operatorAcceptance: acceptance(),
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        acknowledgeSeparateExecutorSession: true,
        acknowledgeNoSharedManualSession: true,
        acknowledgeObserveOnlyLimitations: true,
        maxRuntimeMs: 60_000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(allowed).toMatchObject({
        allowed: true,
        mode: "fake_dry_run",
        commandExecuted: false,
      });
      const realPlan = evaluateLocalCodexSmokeRunGate({
        plan,
        operatorAcceptance: acceptance(),
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        acknowledgeSeparateExecutorSession: true,
        acknowledgeNoSharedManualSession: true,
        acknowledgeObserveOnlyLimitations: true,
        maxRuntimeMs: 60_000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
        dryRunMode: false,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(realPlan).toMatchObject({ allowed: true, mode: "real_runner_plan" });
    });
  });

  it("records fake-run smoke evidence and read model without mutating Work Queue lifecycle", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke, workQueue, runtimeJobs }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-1",
        itemType: "build_plan",
        title: "Smoke linked item",
      });
      const { runPackage, eligibility } = await createPackageAndEligibility({
        bridge,
        adapter,
        workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
      });
      const eligibilityResult = await smoke.evaluateEligibility({
        runtimeJobId: "bridge-smoke",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        smokeTestId: "smoke-1",
        sessionId: "smoke-session",
      });
      const gate = evaluateLocalCodexSmokeRunGate({
        plan: eligibilityResult.plan,
        operatorAcceptance: acceptance(),
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        acknowledgeSeparateExecutorSession: true,
        acknowledgeNoSharedManualSession: true,
        acknowledgeObserveOnlyLimitations: true,
        maxRuntimeMs: 60_000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const report = await smoke.runSmokeTest({
        plan: eligibilityResult.plan,
        gate,
        runner: new FakeSupervisorProcessRunner([
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
          JSON.stringify({ type: "turn.completed" }),
        ]),
      });
      expect(report).toMatchObject({
        eventCount: 3,
        finalResponseCandidate: "done",
        processResult: expect.objectContaining({ status: "completed", commandExecuted: false }),
        manualOperatorSessionSharedWithExecutor: false,
        separateExecutorSessionRequired: true,
      });
      expect(report.completedWorkPath.satisfied).toBe(false);
      await expect(runtimeJobs.listEvents("bridge-smoke", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_planned" }),
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_gate_evaluated" }),
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_handshake" }),
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_stream_event" }),
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_heartbeat" }),
          expect.objectContaining({ eventType: "codex_bridge.smoke_test_process_completed" }),
        ]),
      );
      const status = await smoke.readSmokeTestStatus("bridge-smoke");
      expect(status.finalResponseCandidate).toBe("done");
      expect(status.orderedStreamEvents.map((event) => event.sequence)).toEqual([1, 2, 3]);
      expect(status.controlReadiness).toMatchObject({
        commandsTargetSeparateExecutorSession: true,
        liveControlImplemented: false,
      });
      const truth = await workQueue.readWorkItemTruth("work-item-1");
      expect(truth?.item.lifecycleState).toBe("draft");
    });
  });

  it("records disabled runner refusal as blocking process evidence", async () => {
    await withSmokeHarness(async ({ bridge, adapter, smoke }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const gate = evaluateLocalCodexSmokeRunGate({
        plan,
        operatorAcceptance: acceptance(),
        enableLiveCodexPilot: true,
        enableOperatorApprovedSmokeTest: true,
        acknowledgeSeparateExecutorSession: true,
        acknowledgeNoSharedManualSession: true,
        acknowledgeObserveOnlyLimitations: true,
        maxRuntimeMs: 60_000,
        maxStdoutBytes: 1024,
        maxStderrBytes: 1024,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      const report = await smoke.runSmokeTest({
        plan,
        gate,
        runner: new DisabledSupervisorProcessRunner(),
      });
      expect(report).toMatchObject({
        eventCount: 0,
        finalResponsePresent: false,
        processResult: expect.objectContaining({ status: "refused", commandExecuted: false }),
      });
      expect(report.completedWorkPath.blockingReasons).toContain(
        "final_response_artifact_required",
      );
    });
  });
});
