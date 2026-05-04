import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeRepository,
  SupervisorDryRunRepository,
  createManualPromptSource,
  createWorkQueuePromptSource,
  produceReadinessReport,
  type CodexBridgeNormalizedStreamEvent,
  type ReadinessEvidence,
} from "./index.ts";

async function withDryRunRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    dryRun: SupervisorDryRunRepository;
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
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      dryRun,
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

function streamEvent(sequence: number): CodexBridgeNormalizedStreamEvent {
  return {
    eventKind: "assistant_update",
    sourceProtocol: "codex_cli",
    sequence,
    occurredAt: `2026-05-02T00:00:0${Math.min(sequence, 9)}.000Z`,
    summary: `event ${sequence}`,
    data: { sequence },
    providerCallMade: false,
    liveExecutorCallMade: false,
  };
}

describe("supervisor dry-run contract", () => {
  it("creates a dry-run supervisor session from an executor bridge job", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-session",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Dry-run supervisor",
          promptText: "No live process",
          createdBy: "user",
        }),
      });

      const session = await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-1",
        readinessReport: completeReadinessReport(),
      });

      expect(session).toMatchObject({
        supervisorName: "execution-supervisor",
        sessionId: "session-1",
        runtimeJobId: "bridge-session",
        executionMode: "dry_run_only",
        repoPath: "/root/services/openclaw-roles/live",
        liveProcessStarted: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: false,
        rebuildPerformed: false,
      });
    });
  });

  it("rejects non-bridge runtime jobs and unsupported executor kinds", async () => {
    await withDryRunRepository(async ({ runtimeJobs, bridge, dryRun }) => {
      await runtimeJobs.enqueueJob({ jobId: "plain-job", jobType: "demo.echo" });
      await expect(
        dryRun.createDryRunSession({
          runtimeJobId: "plain-job",
          sessionId: "session-plain",
          readinessReport: completeReadinessReport(),
        }),
      ).rejects.toThrow("not a codex bridge job");

      const unsupported = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "multi-agent-job",
        executorKind: "multi_agent_future",
        promptSource: createManualPromptSource({
          objective: "unsupported",
          promptText: "unsupported",
          createdBy: "user",
        }),
      });
      await expect(
        dryRun.createDryRunSession({
          runtimeJobId: unsupported.jobId,
          sessionId: "session-multi",
          readinessReport: completeReadinessReport(),
        }),
      ).rejects.toThrow("multi_agent_future is not supported");
    });
  });

  it("requires readiness evidence and records handshake event/artifact idempotently", async () => {
    await withDryRunRepository(async ({ bridge, dryRun, runtimeJobs }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-handshake",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Handshake",
          promptText: "Handshake",
          createdBy: "user",
        }),
      });

      await expect(
        dryRun.createDryRunSession({
          runtimeJobId: job.jobId,
          sessionId: "session-handshake",
          readinessReport: produceReadinessReport({
            evidence: [],
            presentRoleDocIds: [],
            presentSkillDocIds: [],
          }),
        }),
      ).rejects.toThrow("readiness report evidence is required");

      const first = await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-handshake",
        readinessReport: completeReadinessReport(),
      });
      const second = await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-handshake",
        readinessReport: completeReadinessReport(),
      });

      expect(second).toEqual(first);
      await expect(runtimeJobs.listEvents(job.jobId)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ eventType: "supervisor.handshake" })]),
      );
      await expect(runtimeJobs.listArtifacts(job.jobId)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ artifactType: "supervisor_session" })]),
      );
    });
  });

  it("plans resume from prior stream events and detects sequence gaps", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-resume",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Resume",
          promptText: "Resume",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-resume",
        readinessReport: completeReadinessReport(),
      });
      await bridge.recordNormalizedStreamEvent(job.jobId, {
        source: "codex_cli",
        type: "assistant_update",
        sequence: 1,
        timestamp: "2026-05-02T00:00:01.000Z",
      });
      await bridge.recordNormalizedStreamEvent(job.jobId, {
        source: "codex_cli",
        type: "assistant_update",
        sequence: 3,
        timestamp: "2026-05-02T00:00:03.000Z",
      });

      await expect(
        dryRun.planResume({ runtimeJobId: job.jobId, sessionId: "session-resume" }),
      ).resolves.toMatchObject({
        lastSequence: 3,
        missingSequences: [2],
        replayIntoLiveProcess: false,
      });
    });
  });

  it("records heartbeat and detects stale heartbeat deterministically", async () => {
    await withDryRunRepository(async ({ bridge, dryRun, setNow }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-heartbeat",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Heartbeat",
          promptText: "Heartbeat",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-heartbeat",
        readinessReport: completeReadinessReport(),
      });
      await dryRun.recordHeartbeat({
        runtimeJobId: job.jobId,
        sessionId: "session-heartbeat",
        sequence: 1,
      });

      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-heartbeat" }),
      ).resolves.toMatchObject({
        latestHeartbeat: { sequence: 1 },
        staleHeartbeat: false,
      });

      setNow(new Date("2026-05-02T00:00:20.000Z"));
      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-heartbeat" }),
      ).resolves.toMatchObject({ staleHeartbeat: true });
    });
  });

  it("plans stream replay and reports duplicates and gaps", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-replay",
        executorKind: "acp",
        promptSource: createManualPromptSource({
          objective: "Replay",
          promptText: "Replay",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-replay",
        readinessReport: completeReadinessReport(),
      });

      await expect(
        dryRun.planStreamReplay({
          runtimeJobId: job.jobId,
          sessionId: "session-replay",
          events: [streamEvent(1), streamEvent(3), streamEvent(3), streamEvent(4)],
        }),
      ).resolves.toMatchObject({
        lastSequence: 4,
        missingSequences: [2],
        duplicateSequences: [3],
        monotonic: false,
        replayIntoLiveProcess: false,
      });
    });
  });

  it("records cancel, pause, and redirect control commands without runtime mutation by default", async () => {
    await withDryRunRepository(async ({ bridge, dryRun, runtimeJobs }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-controls",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Controls",
          promptText: "Controls",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-controls",
        readinessReport: completeReadinessReport(),
      });

      await expect(
        dryRun.recordControlCommand({
          runtimeJobId: job.jobId,
          sessionId: "session-controls",
          commandKind: "cancel",
          actorId: "user",
          reason: "observe only",
          sequence: 1,
        }),
      ).resolves.toMatchObject({ runtimeStateChanged: false });
      await dryRun.recordControlCommand({
        runtimeJobId: job.jobId,
        sessionId: "session-controls",
        commandKind: "pause",
        actorId: "user",
        reason: "inspect stream",
        sequence: 2,
      });
      await dryRun.recordControlCommand({
        runtimeJobId: job.jobId,
        sessionId: "session-controls",
        commandKind: "redirect",
        actorId: "user",
        reason: "adjust prompt",
        sequence: 3,
        redirectPrompt: "Stay in the correct repo",
      });

      await expect(runtimeJobs.getJob(job.jobId)).resolves.toMatchObject({ state: "pending" });
      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-controls" }),
      ).resolves.toMatchObject({
        controlCommands: [
          expect.objectContaining({ commandKind: "cancel", runtimeStateChanged: false }),
          expect.objectContaining({ commandKind: "pause" }),
          expect.objectContaining({
            commandKind: "redirect",
            redirectPrompt: "Stay in the correct repo",
          }),
        ],
      });
    });
  });

  it("can cancel the runtime job only when explicitly requested", async () => {
    await withDryRunRepository(async ({ bridge, dryRun, runtimeJobs }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-explicit-cancel",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Explicit cancel",
          promptText: "Explicit cancel",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-explicit-cancel",
        readinessReport: completeReadinessReport(),
      });

      await expect(
        dryRun.recordControlCommand({
          runtimeJobId: job.jobId,
          sessionId: "session-explicit-cancel",
          commandKind: "cancel",
          actorId: "user",
          reason: "explicit repository cancellation",
          sequence: 1,
          cancelRuntimeJob: true,
        }),
      ).resolves.toMatchObject({ runtimeStateChanged: true });
      await expect(runtimeJobs.getJob(job.jobId)).resolves.toMatchObject({ state: "canceled" });
    });
  });

  it("records rebuild events as dry-run evidence and creates autobailout plan only when policy permits", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-rebuild",
        executorKind: "codex_cli",
        trustProfileId: "trusted_yolo_autobailout",
        autobailoutPolicy: { allowAutobailout: true },
        promptSource: createManualPromptSource({
          objective: "Fix rebuild",
          promptText: "Fix rebuild",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-rebuild",
        readinessReport: completeReadinessReport(),
      });
      await dryRun.recordRebuildEvent({
        runtimeJobId: job.jobId,
        sessionId: "session-rebuild",
        rebuildEventKind: "started",
        rebuildDescriptorId: "app-rebuild",
        summary: "metadata only",
      });
      await dryRun.recordRebuildEvent({
        runtimeJobId: job.jobId,
        sessionId: "session-rebuild",
        rebuildEventKind: "completed",
        rebuildDescriptorId: "app-rebuild",
        summary: "metadata only",
      });
      const failed = await dryRun.recordRebuildEvent({
        runtimeJobId: job.jobId,
        sessionId: "session-rebuild",
        rebuildEventKind: "failed",
        rebuildDescriptorId: "app-rebuild",
        summary: "typecheck failed",
        artifactRefs: ["artifact://rebuild-log"],
        failureLogs: ["Type error"],
        priorStreamEvidenceRefs: ["event://stream"],
      });

      expect(failed).toMatchObject({
        autobailoutPlanCreated: true,
        rebuildEvent: {
          rebuildPerformed: false,
          autobailoutPlanCreated: true,
        },
      });
      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-rebuild" }),
      ).resolves.toMatchObject({
        rebuildEvents: [
          expect.objectContaining({ rebuildEventKind: "started", rebuildPerformed: false }),
          expect.objectContaining({ rebuildEventKind: "completed", rebuildPerformed: false }),
          expect.objectContaining({ rebuildEventKind: "failed", rebuildPerformed: false }),
        ],
        liveProcessStarted: false,
      });
    });
  });

  it("enforces bounded supervisor artifact metadata", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-bounds",
        executorKind: "codex_cli",
        promptSource: createManualPromptSource({
          objective: "Bounds",
          promptText: "Bounds",
          createdBy: "user",
        }),
      });
      const tinyDryRun = new SupervisorDryRunRepository(
        (dryRun as unknown as { runtimeJobs: RuntimeJobRepository }).runtimeJobs,
        {
          maxArtifactMetadataBytes: 50,
        },
      );
      await expect(
        tinyDryRun.createDryRunSession({
          runtimeJobId: job.jobId,
          sessionId: "session-bounds",
          readinessReport: completeReadinessReport(),
        }),
      ).rejects.toThrow("supervisor artifact metadata exceeds");
    });
  });

  it("preserves Work Queue linkage without mutating Work Queue lifecycle", async () => {
    await withDryRunRepository(async ({ bridge, dryRun, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "work-item-supervisor",
        itemType: "build_plan",
        title: "Supervisor dry run",
      });
      const version = await workQueue.createWorkItemVersion({
        versionId: "work-item-supervisor-v1",
        workItemId: item.workItemId,
        body: "Prompt",
      });
      await workQueue.finalizeWorkItemVersion({
        workItemId: item.workItemId,
        versionId: version.versionId,
      });
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-work-queue",
        executorKind: "codex_cli",
        promptSource: createWorkQueuePromptSource({
          workItemId: item.workItemId,
          versionId: version.versionId,
          title: item.title,
          objective: "Dry run linked item",
          promptText: "Dry run",
        }),
        workQueueLink: {
          workItemId: item.workItemId,
          runId: "future-run",
          stepId: "future-step",
        },
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-work-queue",
        readinessReport: completeReadinessReport(),
      });

      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-work-queue" }),
      ).resolves.toMatchObject({
        workQueueLink: {
          workItemId: item.workItemId,
          runId: "future-run",
          stepId: "future-step",
        },
      });
      await expect(workQueue.readWorkItemTruth(item.workItemId)).resolves.toMatchObject({
        item: { lifecycleState: "manual_ready" },
        runs: [],
      });
    });
  });

  it("keeps every live execution flag false", async () => {
    await withDryRunRepository(async ({ bridge, dryRun }) => {
      const job = await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-live-flags",
        executorKind: "codex_cloud_future",
        promptSource: createManualPromptSource({
          objective: "Flags",
          promptText: "Flags",
          createdBy: "user",
        }),
      });
      await dryRun.createDryRunSession({
        runtimeJobId: job.jobId,
        sessionId: "session-live-flags",
        readinessReport: completeReadinessReport(),
      });
      await dryRun.recordHeartbeat({
        runtimeJobId: job.jobId,
        sessionId: "session-live-flags",
        sequence: 1,
      });

      await expect(
        dryRun.readDryRunStatus({ runtimeJobId: job.jobId, sessionId: "session-live-flags" }),
      ).resolves.toMatchObject({
        liveProcessStarted: false,
        codexCliInvoked: false,
        acpSessionStarted: false,
        shellCommandExecuted: false,
        providerCallMade: false,
        rebuildPerformed: false,
        schedulerStarted: false,
        daemonStarted: false,
        subagentStarted: false,
      });
    });
  });
});
