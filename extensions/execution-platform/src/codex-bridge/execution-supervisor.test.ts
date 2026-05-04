import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  DisabledSupervisorProcessRunner,
  ExecutionSupervisorRepository,
  FakeSupervisorProcessRunner,
  SupervisorAdapterRepository,
  createFutureLocalCodexRunPackageMetadata,
  createManualPromptSource,
  createOperatorAcceptanceMetadata,
  evaluateObserveOnlyLocalCodexPilotGate,
  isCodexBridgeJobPayload,
  materializeLocalCodexProcessDescriptor,
  normalizeParsedCodexJsonlEvent,
  parseCodexJsonlEventLine,
  produceReadinessReport,
  validateOperatorAcceptanceForObserveOnlyLocalCodex,
  type FutureRunPackageMetadata,
  type ObserveOnlyReadinessEvaluation,
  type OperatorAcceptanceMetadata,
  type ReadinessEvidence,
} from "./index.ts";

async function withExecutionSupervisor<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    adapter: SupervisorAdapterRepository;
    supervisor: ExecutionSupervisorRepository;
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
    const supervisor = new ExecutionSupervisorRepository(runtimeJobs, {
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      adapter,
      supervisor,
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

function assertNoLive(value: Record<string, unknown>) {
  expect(value).toMatchObject({
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
  });
}

function acceptance(overrides: Partial<OperatorAcceptanceMetadata> = {}) {
  return createOperatorAcceptanceMetadata({
    acceptedBy: "operator",
    acceptedAt: "2026-05-02T00:00:00.000Z",
    runtimeJobId: "bridge-pilot",
    trustProfileId: "observe_only",
    executionMode: "observe_only_live_local_codex",
    repoPath: "/root/services/openclaw-roles/live",
    maxRuntimeMs: 60_000,
    reason: "observe-only pilot gate",
    expiresAt: "2026-05-02T01:00:00.000Z",
    ...overrides,
  });
}

async function createPackageAndEligibility(input: {
  bridge: CodexBridgeRepository;
  adapter: SupervisorAdapterRepository;
  jobId?: string;
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}): Promise<{
  runPackage: FutureRunPackageMetadata;
  eligibility: ObserveOnlyReadinessEvaluation;
}> {
  const job = await input.bridge.enqueueFakeCodexBridgeJob({
    jobId: input.jobId ?? "bridge-pilot",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Observe-only pilot",
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

describe("execution supervisor scaffold and observe-only pilot gate", () => {
  it("validates operator acceptance requirements and rejects observe-only authority expansion", () => {
    expect(
      validateOperatorAcceptanceForObserveOnlyLocalCodex({
        acceptance: null,
        runtimeJobId: "bridge-pilot",
        now: new Date("2026-05-02T00:00:00.000Z"),
      }).blockingReasons,
    ).toContain("operator_acceptance_required");

    const invalid = validateOperatorAcceptanceForObserveOnlyLocalCodex({
      acceptance: acceptance({
        runtimeJobId: "",
        maxRuntimeMs: 0,
        expiresAt: "",
        allowFileWrites: true,
        allowShellCommands: true,
        allowNetwork: true,
        allowRebuild: true,
        allowAutobailout: true,
        allowSubagents: true,
      }),
      runtimeJobId: "bridge-pilot",
      now: new Date("2026-05-02T00:00:00.000Z"),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.blockingReasons).toEqual(
      expect.arrayContaining([
        "runtime_job_id_mismatch",
        "max_runtime_ms_required",
        "expires_at_required",
        "observe_only_file_writes_blocked",
        "observe_only_shell_commands_blocked",
        "observe_only_network_blocked",
        "observe_only_rebuild_blocked",
        "observe_only_autobailout_blocked",
        "observe_only_subagents_blocked",
      ]),
    );
    assertNoLive(invalid);
  });

  it("blocks trusted YOLO profiles in Slice 8E", () => {
    const result = validateOperatorAcceptanceForObserveOnlyLocalCodex({
      acceptance: acceptance({ trustProfileId: "trusted_yolo_local" }),
      runtimeJobId: "bridge-pilot",
      now: new Date("2026-05-02T00:00:00.000Z"),
    });
    expect(result.valid).toBe(false);
    expect(result.blockingReasons).toContain("trusted_yolo_profiles_blocked_in_slice_8e");
  });

  it("rejects pilot gate when readiness, eligibility, repo, safe UI, or acceptance evidence is missing", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({ bridge, adapter });
      const noReadiness = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage: {
          ...runPackage,
          readinessReportSnapshot: produceReadinessReport({
            evidence: [],
            presentRoleDocIds: [],
            presentSkillDocIds: [],
          }),
        },
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(noReadiness.blockingReasons).toContain("readiness_report_required");

      const noEligibility = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: null,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(noEligibility.blockingReasons).toContain("eligibility_report_required");

      const badRepo = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage: { ...runPackage, expectedRepoPath: "/tmp/wrong" },
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(badRepo.blockingReasons).toContain("repo_scope_mismatch");

      const noSafeUi = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage: {
          ...runPackage,
          safeUiBridgeMetadata: { tailscaleRequired: false, descriptor: "missing" },
        },
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(noSafeUi.blockingReasons).toContain("safe_ui_bridge_metadata_required");

      const noAcceptance = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: null,
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(noAcceptance.blockingReasons).toContain("operator_acceptance_required");
    });
  });

  it("allows observe-only future run only as a gated plan with no-live flags", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({ bridge, adapter });
      const gate = evaluateObserveOnlyLocalCodexPilotGate({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        now: new Date("2026-05-02T00:00:00.000Z"),
      });
      expect(gate).toMatchObject({
        allowed: true,
        operatorApprovalRequired: true,
        operatorApprovalSatisfied: true,
        expectedStreamParser: "codex_exec_jsonl",
      });
      assertNoLive(gate);
      expect(gate.expectedProcessDescriptor).toMatchObject({
        command: "codex",
        args: expect.arrayContaining([
          "exec",
          "--json",
          "--cd",
          "/root/services/openclaw-roles/live",
        ]),
        commandExecuted: false,
      });
    });
  });

  it("materializes inert Codex process descriptors from internal run package metadata", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter }) => {
      const { runPackage } = await createPackageAndEligibility({ bridge, adapter });
      const descriptor = materializeLocalCodexProcessDescriptor({
        runPackage,
        acceptance: acceptance(),
      });
      expect(descriptor).toMatchObject({
        command: "codex",
        cwd: "/root/services/openclaw-roles/live",
        expectedStream: "codex_exec_jsonl",
        commandExecuted: false,
        executionAllowed: false,
        envPolicy: {
          secretsIncluded: false,
          inheritedEnvAllowed: false,
        },
      });
      expect(descriptor.args).toEqual(
        expect.arrayContaining(["exec", "--json", "--cd", "/root/services/openclaw-roles/live"]),
      );
      assertNoLive(descriptor);
    });
  });

  it("parses and normalizes Codex JSONL events deterministically", () => {
    expect(parseCodexJsonlEventLine("{nope").ok).toBe(false);
    expect(() => parseCodexJsonlEventLine("{nope", { fatalMalformedJson: true })).toThrow();

    const started = parseCodexJsonlEventLine(
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    );
    if (!started.ok) {
      throw new Error("expected parsed event");
    }
    expect(normalizeParsedCodexJsonlEvent({ event: started.event, sequence: 1 })).toMatchObject({
      eventKind: "session_started",
      sourceProtocol: "codex_cli",
    });

    const completed = parseCodexJsonlEventLine(JSON.stringify({ type: "turn.completed" }));
    if (!completed.ok) {
      throw new Error("expected parsed event");
    }
    expect(normalizeParsedCodexJsonlEvent({ event: completed.event, sequence: 2 })).toMatchObject({
      eventKind: "session_completed",
    });

    const failed = parseCodexJsonlEventLine(
      JSON.stringify({ type: "turn.failed", message: "failed" }),
    );
    if (!failed.ok) {
      throw new Error("expected parsed event");
    }
    expect(normalizeParsedCodexJsonlEvent({ event: failed.event, sequence: 3 })).toMatchObject({
      eventKind: "error",
      summary: "failed",
    });

    const final = parseCodexJsonlEventLine(
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "final answer" },
      }),
    );
    if (!final.ok) {
      throw new Error("expected parsed event");
    }
    expect(normalizeParsedCodexJsonlEvent({ event: final.event, sequence: 4 })).toMatchObject({
      eventKind: "final_response",
      summary: "final answer",
    });
  });

  it("fake and disabled runners never spawn or execute commands", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter }) => {
      const { runPackage } = await createPackageAndEligibility({ bridge, adapter });
      const descriptor = materializeLocalCodexProcessDescriptor({
        runPackage,
        acceptance: acceptance(),
      });
      const fake = await new FakeSupervisorProcessRunner([
        JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      ]).run(descriptor, {});
      expect(fake).toMatchObject({
        status: "completed",
        emittedEventCount: 1,
        commandExecuted: false,
      });
      assertNoLive(fake);

      const disabled = await new DisabledSupervisorProcessRunner().run(descriptor, {});
      expect(disabled).toMatchObject({
        status: "refused",
        commandExecuted: false,
      });
      assertNoLive(disabled);
    });
  });

  it("supervisor plan records handshake, stream, heartbeat, final response, and process completion evidence", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter, supervisor, runtimeJobs }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({ bridge, adapter });
      const report = await supervisor.runObserveOnlyPilot({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        sessionId: "pilot-session",
        runner: new FakeSupervisorProcessRunner([
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
          JSON.stringify({ type: "turn.completed" }),
        ]),
      });

      expect(report).toMatchObject({
        sessionId: "pilot-session",
        gateAllowed: true,
        eventCount: 3,
        finalResponsePresent: true,
        validationEvidencePresent: false,
        commandExecuted: false,
      });
      expect(report.completedWorkPath.satisfied).toBe(false);
      expect(report.completedWorkPath.blockingReasons).toContain(
        "validation_or_needs_review_required",
      );
      assertNoLive(report);

      await expect(runtimeJobs.listEvents("bridge-pilot", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "supervisor.live_pilot_gate_evaluated" }),
          expect.objectContaining({ eventType: "supervisor.live_pilot_handshake" }),
          expect.objectContaining({ eventType: "codex_bridge.stream_event" }),
          expect.objectContaining({ eventType: "supervisor.live_pilot_heartbeat" }),
          expect.objectContaining({ eventType: "supervisor.executor_process_completed" }),
        ]),
      );
      await expect(runtimeJobs.listArtifacts("bridge-pilot")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.completed_work.final_response" }),
          expect.objectContaining({ artifactType: "supervisor.pilot_report" }),
        ]),
      );
      await expect(supervisor.readSupervisorPilotReports("bridge-pilot")).resolves.toHaveLength(1);
    });
  });

  it("preserves Work Queue linkage without mutating lifecycle", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter, supervisor, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "work-item-1",
        itemType: "build_plan",
        title: "Linked item",
      });
      const { runPackage, eligibility } = await createPackageAndEligibility({
        bridge,
        adapter,
        workQueueLink: { workItemId: "work-item-1", runId: "run-1", stepId: "step-1" },
      });
      const report = await supervisor.runObserveOnlyPilot({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: acceptance(),
        runner: new FakeSupervisorProcessRunner([
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
        ]),
      });
      expect(report.workQueueLink).toEqual({
        workItemId: "work-item-1",
        runId: "run-1",
        stepId: "step-1",
      });
      const truth = await workQueue.readWorkItemTruth("work-item-1");
      expect(truth?.item.lifecycleState).toBe("draft");
    });
  });

  it("blocked supervisor pilot records only gate evidence and no execution", async () => {
    await withExecutionSupervisor(async ({ bridge, adapter, supervisor, runtimeJobs }) => {
      const { runPackage, eligibility } = await createPackageAndEligibility({ bridge, adapter });
      const report = await supervisor.runObserveOnlyPilot({
        runtimeJobId: "bridge-pilot",
        runPackage,
        eligibilityReport: eligibility,
        operatorAcceptance: null,
        runner: new FakeSupervisorProcessRunner([
          JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
        ]),
      });
      expect(report).toMatchObject({
        gateAllowed: false,
        eventCount: 0,
        finalResponsePresent: false,
        processResult: null,
      });
      expect(report.blockingReasons).toContain("operator_acceptance_required");
      assertNoLive(report);
      await expect(runtimeJobs.listEvents("bridge-pilot", 100)).resolves.not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.stream_event" }),
        ]),
      );
    });
  });
});
