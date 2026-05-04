import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  LocalCodexSmokePreflightRepository,
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
  type LocalCodexSmokeRunAcknowledgements,
  type LocalCodexSmokeRunRequest,
  type LocalCodexSmokeTestPlan,
  type OperatorAcceptanceMetadata,
  type ReadinessEvidence,
} from "./index.ts";

async function withPreflightHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    adapter: SupervisorAdapterRepository;
    smoke: LocalCodexSmokeTestRepository;
    requests: LocalCodexSmokeRequestRepository;
    preflight: LocalCodexSmokePreflightRepository;
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
    const preflight = new LocalCodexSmokePreflightRepository(runtimeJobs, requests, {
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
      preflight,
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
    reason: "operator-approved smoke preflight test",
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
      objective: "Smoke preflight objective",
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

async function persistLiveRequest(input: {
  requests: LocalCodexSmokeRequestRepository;
  plan: LocalCodexSmokeTestPlan;
  requestOverrides?: Partial<LocalCodexSmokeRunRequest>;
  acceptanceOverrides?: Partial<OperatorAcceptanceMetadata>;
}): Promise<LocalCodexSmokeRunRequest> {
  const request = createLocalCodexSmokeRunRequest({
    requestId: "request-live",
    requestedBy: "operator",
    expiresAt: "2026-05-02T01:00:00.000Z",
    reason: "preflight live observe-only request",
    requestedMode: "live_observe_only",
    operatorAcceptance: acceptance(input.acceptanceOverrides),
    smokeTestPlan: input.plan,
    acknowledgements: allAcknowledgements,
    enableLiveCodexPilot: true,
    enableOperatorApprovedSmokeTest: true,
    now: new Date("2026-05-02T00:00:00.000Z"),
  });
  await input.requests.executeAcceptedRequest({
    request: { ...request, ...input.requestOverrides },
  });
  const persisted = await input.requests.readLatestSmokeRunRequest("bridge-smoke");
  if (!persisted) {
    throw new Error("expected persisted live request");
  }
  return persisted;
}

describe("local Codex smoke preflight", () => {
  it("rejects missing, non-bridge, non-Codex, and missing-request jobs", async () => {
    await withPreflightHarness(async ({ runtimeJobs, bridge, preflight }) => {
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "missing", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining([
          "runtime_job_required",
          "smoke_run_request_required",
        ]),
      });
      await runtimeJobs.enqueueJob({ jobId: "not-bridge", jobType: "demo.other", payload: {} });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "not-bridge", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["runtime_job_not_codex_bridge"]),
      });
      await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-smoke",
        executorKind: "acp",
        promptSource: createManualPromptSource({
          objective: "Wrong executor",
          promptText: "Do not run.",
          createdBy: "user",
        }),
      });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining([
          "executor_kind_not_codex_cli",
          "smoke_run_request_required",
        ]),
      });
    });
  });

  it("rejects non-live, expired, invalid-acceptance, and blocked-gate requests", async () => {
    await withPreflightHarness(async ({ bridge, adapter, smoke, requests, preflight, setNow }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      await requests.executeAcceptedRequest({
        request: createLocalCodexSmokeRunRequest({
          requestId: "plan-only",
          requestedBy: "operator",
          expiresAt: "2026-05-02T01:00:00.000Z",
          reason: "not live",
          requestedMode: "plan_only",
          operatorAcceptance: acceptance(),
          smokeTestPlan: plan,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }),
      });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["request_mode_not_live_observe_only"]),
      });
      await persistLiveRequest({ requests, plan });
      setNow(new Date("2026-05-02T02:00:00.000Z"));
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        nextOperatorAction: "refresh_operator_acceptance",
        blockingReasons: expect.arrayContaining(["request_expired", "operator_acceptance_expired"]),
      });
    });

    await withPreflightHarness(async ({ bridge, adapter, smoke, requests, preflight }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      await persistLiveRequest({
        requests,
        plan,
        acceptanceOverrides: { allowNetwork: true },
      });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["observe_only_network_blocked"]),
      });
    });

    await withPreflightHarness(async ({ bridge, adapter, smoke, requests, preflight }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      await requests.executeAcceptedRequest({
        request: createLocalCodexSmokeRunRequest({
          requestId: "blocked-gate",
          requestedBy: "operator",
          expiresAt: "2026-05-02T01:00:00.000Z",
          reason: "blocked gate",
          requestedMode: "live_observe_only",
          operatorAcceptance: acceptance(),
          smokeTestPlan: plan,
          acknowledgements: { acknowledgeSeparateExecutorSession: true },
          enableLiveCodexPilot: false,
          enableOperatorApprovedSmokeTest: false,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }),
      });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining([
          "smoke_run_gate_not_allowed",
          "all_smoke_request_acknowledgements_required",
        ]),
      });
    });
  });

  it("rejects missing plan, descriptor problems, missing metadata, and unsafe authority", async () => {
    await withPreflightHarness(async ({ bridge, requests, preflight }) => {
      await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-smoke",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Missing plan request",
          promptText: "Do not run.",
          createdBy: "user",
        }),
      });
      await requests.executeAcceptedRequest({
        request: createLocalCodexSmokeRunRequest({
          requestId: "missing-plan",
          requestedBy: "operator",
          expiresAt: "2026-05-02T01:00:00.000Z",
          reason: "missing plan",
          requestedMode: "live_observe_only",
          operatorAcceptance: acceptance(),
          smokeTestPlan: null,
          acknowledgements: allAcknowledgements,
          enableLiveCodexPilot: true,
          enableOperatorApprovedSmokeTest: true,
          now: new Date("2026-05-02T00:00:00.000Z"),
        }),
      });
      await expect(
        preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
      ).resolves.toMatchObject({
        allowed: false,
        blockingReasons: expect.arrayContaining(["smoke_test_plan_required"]),
      });
    });

    await withPreflightHarness(async ({ bridge, adapter, smoke, requests, preflight }) => {
      const plan = await createPlan({ bridge, adapter, smoke });
      const badPlan = {
        ...plan,
        repoPath: "/tmp/wrong",
        workspaceDocsPath: "/tmp/docs",
        allowRebuild: true,
        allowAutobailout: true,
        allowSubagents: true,
        workQueueLifecycleMutationAllowed: true,
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
          commandExecuted: true,
          envPolicy: { secretsIncluded: true, inheritedEnvAllowed: false },
          allowSubagents: true,
        },
      } as unknown as LocalCodexSmokeTestPlan;
      await persistLiveRequest({ requests, plan: badPlan });
      expect(
        (
          await preflight.createPreflightReport({
            runtimeJobId: "bridge-smoke",
            checkedBy: "operator",
          })
        ).blockingReasons,
      ).toEqual(
        expect.arrayContaining([
          "repo_scope_mismatch",
          "workspace_docs_path_mismatch",
          "safe_ui_bridge_metadata_required",
          "validation_command_metadata_required",
          "rebuild_authority_blocked",
          "autobailout_authority_blocked",
          "subagent_authority_blocked",
          "work_queue_lifecycle_mutation_blocked",
          "invalid_command",
          "invalid_args_prefix",
          "descriptor_source_package_id_required",
          "descriptor_already_executed",
          "descriptor_env_secrets_not_allowed",
          "descriptor_forbidden_future_authority",
        ]),
      );
    });
  });

  it("rejects prior command execution evidence", async () => {
    await withPreflightHarness(
      async ({ bridge, adapter, smoke, requests, preflight, runtimeJobs }) => {
        const plan = await createPlan({ bridge, adapter, smoke });
        const request = await persistLiveRequest({ requests, plan });
        await runtimeJobs.attachArtifact({
          jobId: "bridge-smoke",
          artifactType: "codex_bridge.smoke_run_request_result",
          storageKind: "metadata",
          uri: "runtime-job://bridge-smoke/codex-bridge/prior-command-execution",
          contentType: "application/json",
          metadata: {
            artifactKind: "local_codex_smoke_run_request_result",
            requestId: request.requestId,
            runtimeJobId: "bridge-smoke",
            commandExecuted: true,
          },
        });
        await expect(
          preflight.createPreflightReport({ runtimeJobId: "bridge-smoke", checkedBy: "operator" }),
        ).resolves.toMatchObject({
          allowed: false,
          blockingReasons: expect.arrayContaining(["prior_command_execution_evidence_found"]),
        });
      },
    );
  });

  it("accepts one valid live-observe-only request and persists preflight/runbook evidence", async () => {
    await withPreflightHarness(
      async ({ bridge, adapter, smoke, requests, preflight, runtimeJobs, workQueue }) => {
        await workQueue.createWorkItem({
          workItemId: "work-item-1",
          itemType: "build_plan",
          title: "Preflight linked item",
        });
        const plan = await createPlan({
          bridge,
          adapter,
          smoke,
          workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
        });
        const request = await persistLiveRequest({ requests, plan });
        const report = await preflight.checkAndPersistPreflight({
          runtimeJobId: "bridge-smoke",
          checkedBy: "operator",
          preflightId: "preflight-1",
        });
        expect(report).toMatchObject({
          preflightId: "preflight-1",
          requestId: request.requestId,
          allowed: true,
          nextOperatorAction: "run_single_observe_only_smoke_test",
          codexCliInvoked: false,
          commandExecuted: false,
          manualOperatorSessionSharedWithExecutor: false,
          separateExecutorSessionRequired: true,
          liveSmokeTestRunInThisSlice: false,
        });
        await expect(preflight.readLatestPreflightReport("bridge-smoke")).resolves.toMatchObject({
          preflightId: "preflight-1",
          allowed: true,
        });
        await expect(
          preflight.requestAlreadyHasPreflight("bridge-smoke", request.requestId),
        ).resolves.toBe(true);
        const runbook = await preflight.createAndPersistOperatorRunbook({
          report,
          createdBy: "operator",
          runbookId: "runbook-1",
        });
        expect(runbook).toMatchObject({
          runbookId: "runbook-1",
          allowedToRun: true,
          nextOperatorAction: "run_single_observe_only_smoke_test",
          manualOperatorSessionSharedWithExecutor: false,
          separateExecutorSessionRequired: true,
          processCompletionIsTaskSuccess: false,
          actualCommandExecutionPerformedByThisSlice: false,
        });
        expect(runbook.verificationAfterRun).toContain(
          "completed_work_path_not_task_success_without_validation_or_needs_review",
        );
        await expect(runtimeJobs.listEvents("bridge-smoke", 100)).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ eventType: "codex_bridge.smoke_preflight_checked" }),
            expect.objectContaining({ eventType: "codex_bridge.smoke_operator_runbook_created" }),
          ]),
        );
        await expect(workQueue.readWorkItemTruth("work-item-1")).resolves.toMatchObject({
          item: expect.objectContaining({ lifecycleState: "draft" }),
        });
      },
    );
  });
});

describe("local Codex smoke preflight dispatcher", () => {
  it("models preflight without opening DB or invoking Codex", () => {
    expect(
      dispatchLocalCodexSmokeCli(["preflight", "--runtime-job-id", "bridge-smoke"]),
    ).toMatchObject({
      command: "preflight",
      accepted: true,
      wouldRunPreflight: true,
      opensDbConnection: false,
      codexCliInvoked: false,
      commandExecuted: false,
    });
    expect(dispatchLocalCodexSmokeCli(["preflight"])).toMatchObject({
      accepted: false,
      blockingReasons: expect.arrayContaining(["runtime_job_id_required"]),
    });
  });
});
