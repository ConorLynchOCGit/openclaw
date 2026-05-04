import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  SupervisorAdapterRepository,
  SupervisorDryRunRepository,
  createAcpAdapterContract,
  createCompletedWorkPathContract,
  createExpectedStreamContractMetadata,
  createFutureAcpRunPackageMetadata,
  createFutureLocalCodexRunPackageMetadata,
  createLocalCodexAdapterContract,
  createManualPromptSource,
  createNoLiveExecutionAuditReport,
  createSupervisorAdapterContract,
  createWorkQueuePromptSource,
  convertDryRunStatusToFutureRunEligibilityEvidence,
  isCodexBridgeJobPayload,
  produceReadinessReport,
  validateEnvironmentContractForFutureLiveLocalExecution,
  validateStreamEventsForFutureReplay,
  validateTrustProfileAgainstFutureExecutionMode,
  validateWorkQueueOversightPreconditions,
  type ReadinessEvidence,
  type TrustHandoffEvidence,
} from "./index.ts";

async function withAdapterRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    dryRun: SupervisorDryRunRepository;
    adapter: SupervisorAdapterRepository;
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
    const dryRun = new SupervisorDryRunRepository(runtimeJobs, {
      now: () => now,
      staleHeartbeatMs: 10_000,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const adapter = new SupervisorAdapterRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      dryRun,
      adapter,
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

const completeTrustHandoffEvidence: TrustHandoffEvidence = {
  explicitUserAcceptance: true,
  repoScope: ["/root/services/openclaw-roles/live"],
  commandShellBoundaries: true,
  rebuildBoundaries: true,
  bailoutBoundaries: true,
  maxAttemptsAndStopConditions: true,
  auditArtifactsRequired: true,
  rollbackPath: true,
  livePermissionGrant: false,
};

function assertNoLiveExecution(value: Record<string, unknown>) {
  expect(value).toMatchObject({
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
  });
}

describe("supervisor adapter and observe-only readiness", () => {
  it("creates supervisor, local Codex, and ACP adapter contracts without live starts", () => {
    const supervisor = createSupervisorAdapterContract();
    expect(supervisor).toMatchObject({
      supervisorName: "execution-supervisor",
      processBoundary: "external_to_openclaw_app_container",
      liveDaemonImplemented: false,
    });
    assertNoLiveExecution(supervisor);

    const codex = createLocalCodexAdapterContract();
    expect(codex).toMatchObject({
      executorKind: "codex_cli",
      startsProcessInSlice8D: false,
      commandDescriptor: {
        command: "codex",
        executable: false,
        streamFormat: "jsonl",
      },
    });
    assertNoLiveExecution(codex);

    const acp = createAcpAdapterContract();
    expect(acp).toMatchObject({
      executorKind: "acp",
      sessionProtocol: "json_rpc_2_0",
      startsSessionInSlice8D: false,
      expectedNotifications: ["session/update"],
    });
    assertNoLiveExecution(acp);
  });

  it("creates observe-only eligibility reports without execution", async () => {
    await withAdapterRepository(async ({ bridge, adapter }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-observe",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Plan future live run",
          promptText: "Do not execute",
          createdBy: "user",
        }),
      });

      const evaluation = await adapter.evaluateObserveOnlyReadiness({
        runtimeJobId: job.jobId,
        readinessReport: completeReadinessReport(),
        expectedSessionId: "future-session",
      });

      expect(evaluation).toMatchObject({
        allowed: true,
        futureRunEligible: true,
        eligibilityOnly: true,
        requiredUserApproval: false,
        supervisorIdentity: {
          expectedSessionId: "future-session",
        },
      });
      assertNoLiveExecution(evaluation);
    });
  });

  it("approve-run produces required-user-approval metadata", async () => {
    await withAdapterRepository(async ({ bridge, adapter }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-approve",
        executorKind: "codex_cli",
        trustProfileId: "approve_run",
        promptSource: createManualPromptSource({
          objective: "Approval required",
          promptText: "Plan only",
          createdBy: "user",
        }),
      });

      const evaluation = await adapter.evaluateObserveOnlyReadiness({
        runtimeJobId: job.jobId,
        executionMode: "approve_run_live_local_codex",
        readinessReport: completeReadinessReport(),
      });

      expect(evaluation.requiredUserApproval).toBe(true);
      expect(evaluation.allowed).toBe(true);
      assertNoLiveExecution(evaluation);
    });
  });

  it("blocks trusted-yolo local when readiness, repo scope, or command boundaries are missing", async () => {
    await withAdapterRepository(async ({ bridge, adapter }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-yolo",
        executorKind: "codex_cli",
        trustProfileId: "trusted_yolo_local",
        promptSource: createManualPromptSource({
          objective: "Trusted future",
          promptText: "Still inert",
          createdBy: "user",
        }),
      });

      const incomplete = await adapter.evaluateObserveOnlyReadiness({
        runtimeJobId: job.jobId,
        executionMode: "trusted_yolo_local_codex_future",
        readinessReport: produceReadinessReport({
          evidence: [],
          presentRoleDocIds: [],
          presentSkillDocIds: [],
        }),
      });
      expect(incomplete.allowed).toBe(false);
      expect(incomplete.blockingGates).toEqual(
        expect.arrayContaining(["trusted_yolo_local_requires_complete_readiness_gates"]),
      );

      const missingBoundaries = await adapter.evaluateObserveOnlyReadiness({
        runtimeJobId: job.jobId,
        executionMode: "trusted_yolo_local_codex_future",
        readinessReport: completeReadinessReport(),
      });
      expect(missingBoundaries.allowed).toBe(false);
      expect(missingBoundaries.blockingGates).toEqual(
        expect.arrayContaining(["trusted_yolo_local_command_boundaries_required"]),
      );

      const payload = job.payload;
      if (!isCodexBridgeJobPayload(payload)) {
        throw new Error("expected codex bridge payload");
      }
      const repoScope = validateEnvironmentContractForFutureLiveLocalExecution({
        environment: { ...payload.environment, repoPath: "/tmp/wrong" },
        expectedRepoPath: payload.environment.repoPath,
        expectedWorkspaceDocsPath: payload.environment.workspaceDocsPath,
      });
      expect(repoScope.blockingGates).toContain("repo_scope_mismatch");
    });
  });

  it("keeps trusted-yolo rebuild and autobailout future-only", async () => {
    await withAdapterRepository(async ({ bridge }) => {
      const rebuildJob = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-rebuild-future",
        executorKind: "codex_cli",
        trustProfileId: "trusted_yolo_rebuild",
        promptSource: createManualPromptSource({
          objective: "Future rebuild",
          promptText: "No rebuild",
          createdBy: "user",
        }),
      });
      const autobailoutJob = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-autobailout-future",
        executorKind: "codex_cli",
        trustProfileId: "trusted_yolo_autobailout",
        promptSource: createManualPromptSource({
          objective: "Future bailout",
          promptText: "No bailout",
          createdBy: "user",
        }),
      });
      for (const job of [rebuildJob, autobailoutJob]) {
        const payload = job.payload;
        if (!isCodexBridgeJobPayload(payload)) {
          throw new Error("expected codex bridge payload");
        }
        const result = validateTrustProfileAgainstFutureExecutionMode({
          trustPolicy: payload.trustPolicy,
          executionMode: "trusted_yolo_local_codex_future",
          readinessReport: completeReadinessReport(),
          environment: payload.environment,
          expectedRepoPath: payload.environment.repoPath,
          trustHandoffEvidence: completeTrustHandoffEvidence,
        });
        expect(result.allowed).toBe(false);
        expect(result.blockingGates[0]).toMatch(/future_only_in_slice_8d/);
      }
    });
  });

  it("creates future local Codex and ACP run package metadata with inert commands", async () => {
    await withAdapterRepository(async ({ bridge }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-package",
        executorKind: "codex_cli",
        promptSource: createWorkQueuePromptSource({
          workItemId: "work-item-1",
          versionId: "version-1",
          title: "Future package",
          objective: "Create metadata",
          promptText: "Plan only",
          approvedBy: "user",
        }),
        workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
      });
      const payload = job.payload;
      if (!isCodexBridgeJobPayload(payload)) {
        throw new Error("expected codex bridge payload");
      }

      const localPackage = createFutureLocalCodexRunPackageMetadata({
        packageId: "local-package",
        payload,
        runtimeJobId: job.jobId,
        readinessReport: completeReadinessReport(),
      });
      expect(localPackage).toMatchObject({
        finalizedPromptArtifact: { artifactKind: "finalized_prompt" },
        runtimeJobId: "adapter-package",
        workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
        expectedRepoPath: "/root/services/openclaw-roles/live",
        safeUiBridgeMetadata: { tailscaleRequired: true },
        commandDescriptorsAreInert: true,
      });
      expect(localPackage.validationCommandMetadata.length).toBeGreaterThan(0);
      expect(localPackage.rebuildCommandMetadata.length).toBeGreaterThan(0);
      assertNoLiveExecution(localPackage);

      const acpPackage = createFutureAcpRunPackageMetadata({
        packageId: "acp-package",
        payload: { ...payload, executorKind: "acp" },
        runtimeJobId: job.jobId,
        readinessReport: completeReadinessReport(),
      });
      expect(acpPackage).toMatchObject({
        executorKind: "acp",
        executionMode: "observe_only_live_acp_future",
      });
      assertNoLiveExecution(acpPackage);
    });
  });

  it("validates Work Queue oversight preconditions without mutating lifecycle", () => {
    const fakeRunning = validateWorkQueueOversightPreconditions({
      requestedState: "running",
      runtimeJobLinked: true,
      supervisorHandshakeObserved: true,
      firstLiveStreamEventObserved: false,
    });
    expect(fakeRunning).toMatchObject({
      allowed: false,
      workQueueLifecycleMutated: false,
    });
    expect(fakeRunning.blockingReasons).toContain("first_live_stream_event_required");

    const fakeCompleted = validateWorkQueueOversightPreconditions({
      requestedState: "succeeded",
      runtimeJobLinked: true,
      supervisorHandshakeObserved: true,
      firstLiveStreamEventObserved: true,
      runtimeJobTerminal: false,
      finalResponseArtifactPresent: false,
      validationEvidencePresent: false,
    });
    expect(fakeCompleted.allowed).toBe(false);
    expect(fakeCompleted.blockingReasons).toEqual(
      expect.arrayContaining([
        "final_response_artifact_required",
        "validation_or_needs_review_required",
        "runtime_job_terminal_state_required",
      ]),
    );
  });

  it("does not let process completion alone satisfy completed work", () => {
    const processOnly = createCompletedWorkPathContract({ executorProcessCompleted: true });
    expect(processOnly).toMatchObject({
      processExitImpliesTaskSuccess: false,
      satisfied: false,
    });
    expect(processOnly.blockingReasons).toEqual(
      expect.arrayContaining([
        "final_response_artifact_required",
        "validation_or_needs_review_required",
      ]),
    );

    const complete = createCompletedWorkPathContract({
      executorProcessCompleted: true,
      assistantFinalResponseReceived: true,
      validationPassed: true,
    });
    expect(complete.satisfied).toBe(true);
  });

  it("defines stream contract channels and replay rules", () => {
    const stream = createExpectedStreamContractMetadata();
    expect(stream.channels).toEqual(
      expect.arrayContaining([
        "raw_terminal_event_stream",
        "normalized_execution_event_stream",
        "heartbeat_stream",
        "artifact_pointer_stream",
        "control_command_stream",
      ]),
    );
    expect(stream.ordering).toMatchObject({
      perSessionMonotonicSequence: true,
      replaySafeEventIds: true,
      missingSequenceDetection: true,
    });

    const replay = validateStreamEventsForFutureReplay([
      { sequence: 1 },
      { sequence: 3 },
      { sequence: 3 },
    ]);
    expect(replay).toMatchObject({
      lastSequence: 3,
      missingSequences: [2],
      duplicateSequences: [3],
      replaySafeEventIds: true,
    });
    expect(replay.monotonic).toBe(false);
  });

  it("records eligibility reports as bounded runtime evidence", async () => {
    await withAdapterRepository(async ({ bridge, adapter, runtimeJobs }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-record",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Record report",
          promptText: "No live run",
          createdBy: "user",
        }),
      });
      const evaluation = await adapter.evaluateObserveOnlyReadiness({
        runtimeJobId: job.jobId,
        readinessReport: completeReadinessReport(),
      });
      const artifact = await adapter.recordEligibilityReport({
        runtimeJobId: job.jobId,
        evaluation,
      });

      expect(artifact).toMatchObject({
        artifactType: "supervisor_adapter.eligibility_report",
        storageKind: "metadata",
      });
      await expect(runtimeJobs.listEvents(job.jobId)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "supervisor_adapter.eligibility_reported" }),
        ]),
      );
      await expect(adapter.readEligibilityReports(job.jobId)).resolves.toHaveLength(1);
    });
  });

  it("converts dry-run supervisor status into future-run eligibility evidence", async () => {
    await withAdapterRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "adapter-dry-run-evidence",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Dry run evidence",
          promptText: "No live run",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-evidence",
        readinessReport: completeReadinessReport(),
      });
      await bridge.recordNormalizedStreamEvent(job.jobId, {
        source: "codex_cli",
        type: "assistant_update",
        sequence: 1,
        timestamp: "2026-05-02T00:00:01.000Z",
        message: "Planning",
      });
      await dryRun.recordHeartbeat({
        runtimeJobId: job.jobId,
        sessionId: "session-evidence",
        sequence: 2,
      });
      const status = await dryRun.readDryRunStatus({
        runtimeJobId: job.jobId,
        sessionId: "session-evidence",
      });
      const evidence = convertDryRunStatusToFutureRunEligibilityEvidence(status);

      expect(evidence).toMatchObject({
        artifactKind: "dry_run_eligibility_evidence",
        sessionId: "session-evidence",
        runtimeJobId: job.jobId,
        lastSequence: 1,
        controlCommandCount: 0,
        rebuildEventCount: 0,
      });
      assertNoLiveExecution(evidence);
    });
  });

  it("reports no live execution for explicit audit helper", () => {
    const audit = createNoLiveExecutionAuditReport();
    assertNoLiveExecution(audit);
    expect(audit.liveExecutionEnabled).toBe(false);
  });
});
