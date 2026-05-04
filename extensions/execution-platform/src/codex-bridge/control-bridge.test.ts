import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  CodexBridgeRepository,
  createManualPromptSource,
  createWorkQueuePromptSource,
  classifyCodexBridgeControlReason,
  type CodexBridgeRedirectPromptMetadata,
} from "./index.ts";

async function withControlHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    bridge: CodexBridgeRepository;
    control: CodexBridgeControlBridgeRepository;
    workQueue: WorkQueueRepository;
    setNow: (next: Date) => void;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-02T20:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, { now: () => now });
    const control = new CodexBridgeControlBridgeRepository(runtimeJobs, {
      now: () => now,
      commandTtlMs: 5_000,
      staleHeartbeatMs: 10_000,
      maxArtifactMetadataBytes: 64 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now: () => now });
    return await work({
      runtimeJobs,
      bridge,
      control,
      workQueue,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    await database.close();
  }
}

async function seedBridgeJob(input: {
  bridge: CodexBridgeRepository;
  jobId?: string;
  workQueueLink?: { workItemId: string; runId?: string | null; stepId?: string | null };
}) {
  return input.bridge.enqueueFakeCodexBridgeJob({
    jobId: input.jobId ?? "bridge-controls",
    executorKind: "codex_cli",
    promptSource: createManualPromptSource({
      objective: "Control bridge proof",
      promptText: "Observe only.",
      createdBy: "operator",
    }),
    workQueueLink: input.workQueueLink,
  });
}

async function seedSession(runtimeJobs: RuntimeJobRepository, jobId = "bridge-controls") {
  await runtimeJobs.attachArtifact({
    jobId,
    artifactType: "supervisor_session",
    storageKind: "metadata",
    uri: `runtime-job://${jobId}/supervisor/session-controls/supervisor_session`,
    contentType: "application/json",
    metadata: {
      artifactKind: "supervisor_session",
      sessionId: "session-controls",
      runtimeJobId: jobId,
    },
  });
}

function redirectPrompt(
  overrides: Partial<CodexBridgeRedirectPromptMetadata> = {},
): CodexBridgeRedirectPromptMetadata {
  return {
    objective: "Redirect the separate executor back to the configured runtime substrate.",
    scope: [
      "Use the existing repo and workspace docs paths.",
      "Check configured runtime resolvers.",
    ],
    nonGoals: ["Do not rebuild.", "Do not use subagents.", "Do not mutate Work Queue lifecycle."],
    repoPath: "/root/services/openclaw-roles/live",
    workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
    safeUiBridge: { tailscaleRequired: true, descriptor: "Tailscale safe UI bridge" },
    promptText:
      "Pause and redirect: verify configured Supabase runtime before claiming live DB is absent.",
    ...overrides,
  };
}

describe("Codex bridge pause redirect cancel control bridge", () => {
  it("records pause command as durable runtime evidence", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);

      const command = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "runtime substrate mismatch seen in stream",
          commandId: "pause-1",
        }),
      });

      expect(command).toMatchObject({
        commandId: "pause-1",
        commandKind: "pause",
        status: "recorded",
        reasonCategory: "runtime_substrate_mismatch",
        appliesToSeparateExecutorSession: true,
        manualOperatorSessionSharedWithExecutor: false,
        liveProcessSignalSent: false,
      });
      await expect(runtimeJobs.listEvents("bridge-controls", 100)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "codex_bridge.control_command_recorded" }),
        ]),
      );
      await expect(runtimeJobs.listArtifacts("bridge-controls")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.control_command" }),
          expect.objectContaining({ artifactType: "codex_bridge.control_command_history" }),
        ]),
      );
    });
  });

  it("records redirect command with bounded prompt metadata", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);

      const command = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "OpenClaw needs safe UI bridge context restored",
          commandId: "redirect-1",
          redirectPrompt: redirectPrompt(),
        }),
      });

      expect(command).toMatchObject({
        commandKind: "redirect",
        status: "recorded",
        reasonCategory: "missing_safe_ui_bridge_context",
        redirectPrompt: expect.objectContaining({
          repoPath: "/root/services/openclaw-roles/live",
          safeUiBridge: expect.objectContaining({ tailscaleRequired: true }),
        }),
        promptInjectedIntoLiveProcess: false,
      });
      await expect(runtimeJobs.listArtifacts("bridge-controls")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "codex_bridge.redirect_prompt_metadata" }),
        ]),
      );
    });
  });

  it("records cancel as model-only intent by default and can cancel runtime job only explicitly", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);

      const modelOnly = await control.recordControlCommand({
        command: await control.createCancelCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "cancel-model-only",
        }),
      });
      expect(modelOnly).toMatchObject({
        commandKind: "cancel",
        runtimeStateChanged: false,
        actualEffect: null,
      });
      await expect(runtimeJobs.getJob("bridge-controls")).resolves.toMatchObject({
        state: "pending",
      });

      const explicit = await control.recordControlCommand({
        command: await control.createCancelCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator explicitly requested runtime job cancellation",
          commandId: "cancel-explicit",
        }),
        cancelRuntimeJob: true,
      });
      expect(explicit).toMatchObject({
        status: "applied",
        runtimeStateChanged: true,
        actualEffect: "runtime_job_canceled",
      });
      await expect(runtimeJobs.getJob("bridge-controls")).resolves.toMatchObject({
        state: "canceled",
      });
    });
  });

  it("rejects non-bridge jobs and unknown sessions when session evidence exists", async () => {
    await withControlHarness(async ({ runtimeJobs, bridge, control }) => {
      await runtimeJobs.enqueueJob({ jobId: "plain-job", jobType: "demo.job" });
      await expect(
        control.createPauseCommand({
          runtimeJobId: "plain-job",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
        }),
      ).rejects.toThrow("not a codex bridge job");

      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);
      const command = await control.createPauseCommand({
        runtimeJobId: "bridge-controls",
        sessionId: "unknown-session",
        actor: "operator",
        reason: "operator manual intervention",
      });
      await expect(control.recordControlCommand({ command })).rejects.toThrow(
        "unknown executor session id",
      );
    });
  });

  it("rejects unsafe redirect prompt content and authority requests", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);

      await expect(
        control.createRedirectCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "unsafe redirect",
          redirectPrompt: redirectPrompt({
            promptText: "raw-transcript-marker sk-testsecret123456789",
          }),
        }),
      ).rejects.toThrow("prohibited raw/private content");

      await expect(
        control.createRedirectCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "unsafe redirect",
          redirectPrompt: redirectPrompt({
            promptText: "Please execute shell command pnpm build and use subagents.",
          }),
        }),
      ).rejects.toThrow("outside Slice 8N bounds");
    });
  });

  it("classifies runtime substrate mismatch and missing closeout evidence deterministically", () => {
    expect(
      classifyCodexBridgeControlReason({
        reason: "Executor claimed Supabase was unavailable after only checking shell env.",
      }),
    ).toBe("runtime_substrate_mismatch");
    expect(
      classifyCodexBridgeControlReason({
        reason: "Previous run has no Work Episode Outcome Pack closeout.",
      }),
    ).toBe("missing_closeout_evidence");
  });

  it("control readiness surfaces missing closeout gate blocker", async () => {
    await withControlHarness(async ({ bridge, control }) => {
      await seedBridgeJob({ bridge });
      const summary = await control.produceControlReadinessSummary({
        runtimeJobId: "bridge-controls",
        sessionId: "session-controls",
        previousRuntimeJobId: "bridge-controls",
      });

      expect(summary).toMatchObject({
        readyForControlCommands: false,
        blockingReasons: expect.arrayContaining(["missing_closeout_evidence"]),
        closeoutReasonCategory: "missing_closeout_evidence",
        closeoutGate: expect.objectContaining({
          nextExecutionAllowed: false,
          blockingReasons: expect.arrayContaining(["work_episode_closeout_missing"]),
        }),
      });
    });
  });

  it("acknowledges, applies, rejects, expires, and supersedes commands", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs, setNow }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);

      const pause = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "pause-transition",
        }),
      });
      await expect(
        control.acknowledgeControlCommand({
          runtimeJobId: "bridge-controls",
          commandId: pause.commandId,
          actor: "supervisor",
        }),
      ).resolves.toMatchObject({ status: "acknowledged" });
      await expect(
        control.markControlCommandApplied({
          runtimeJobId: "bridge-controls",
          commandId: pause.commandId,
          actualEffect: "pause_intent_observed_by_supervisor",
        }),
      ).resolves.toMatchObject({ status: "applied" });

      const rejected = await control.recordControlCommand({
        command: await control.createCancelCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "cancel-reject",
        }),
      });
      await expect(
        control.rejectControlCommand({
          runtimeJobId: "bridge-controls",
          commandId: rejected.commandId,
          reason: "no live process to cancel",
        }),
      ).resolves.toMatchObject({ status: "rejected", actualEffect: "no live process to cancel" });

      const stale = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "pause-expire",
        }),
      });
      expect(stale.status).toBe("recorded");
      setNow(new Date("2026-05-02T20:00:10.000Z"));
      await expect(control.expireStaleControlCommands("bridge-controls")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ commandId: "pause-expire", status: "expired" }),
        ]),
      );

      const redirectOne = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "wrong repo",
          commandId: "redirect-old",
          redirectPrompt: redirectPrompt({ objective: "First redirect" }),
        }),
      });
      const redirectTwo = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "wrong repo",
          commandId: "redirect-new",
          redirectPrompt: redirectPrompt({ objective: "Second redirect" }),
        }),
      });
      expect(redirectOne.status).toBe("recorded");
      expect(redirectTwo.status).toBe("recorded");
      await expect(
        control.readControlCommandById({
          runtimeJobId: "bridge-controls",
          commandId: "redirect-old",
        }),
      ).resolves.toMatchObject({ status: "superseded" });
    });
  });

  it("read models summarize command history and oversight stream state", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs }) => {
      await seedBridgeJob({ bridge });
      await seedSession(runtimeJobs);
      await bridge.recordNormalizedStreamEvent("bridge-controls", {
        source: "codex_cli",
        type: "assistant_update",
        sequence: 1,
        timestamp: "2026-05-02T20:00:01.000Z",
        message: "Working in the current repo.",
      });
      await bridge.recordNormalizedStreamEvent("bridge-controls", {
        source: "codex_cli",
        type: "final_response",
        sequence: 3,
        timestamp: "2026-05-02T20:00:03.000Z",
        message: "Final response candidate.",
      });
      await runtimeJobs.recordEvent({
        jobId: "bridge-controls",
        eventType: "supervisor.heartbeat",
        data: { sessionId: "session-controls", heartbeatAt: "2026-05-02T20:00:04.000Z" },
      });
      await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
          commandId: "pause-read-model",
        }),
      });

      await expect(
        control.readLatestControlState({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
        }),
      ).resolves.toMatchObject({
        latestCommand: expect.objectContaining({ commandId: "pause-read-model" }),
        pendingCommands: [expect.objectContaining({ commandId: "pause-read-model" })],
        oversight: {
          latestObservedSequence: 3,
          sequenceGaps: [2],
          latestHeartbeat: "2026-05-02T20:00:04.000Z",
          staleHeartbeat: false,
          latestAssistantUpdate: "Working in the current repo.",
          latestFinalResponse: "Final response candidate.",
        },
      });
      await expect(
        control.produceOperatorControlSummary({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
        }),
      ).resolves.toMatchObject({
        commandsTargetSeparateExecutorSession: true,
        liveProcessSignalAvailable: false,
        workQueueLifecycleMutationAllowed: false,
      });
    });
  });

  it("preserves Work Queue link without mutating lifecycle", async () => {
    await withControlHarness(async ({ bridge, control, runtimeJobs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "work-item-control",
        itemType: "build_plan",
        title: "Control-linked work",
      });
      const version = await workQueue.createWorkItemVersion({
        workItemId: item.workItemId,
        versionId: "work-item-control-v1",
        body: "Prompt",
      });
      await workQueue.finalizeWorkItemVersion({
        workItemId: item.workItemId,
        versionId: version.versionId,
      });
      await bridge.enqueueFakeCodexBridgeJob({
        jobId: "bridge-controls",
        executorKind: "codex_cli",
        promptSource: createWorkQueuePromptSource({
          workItemId: item.workItemId,
          versionId: version.versionId,
          title: item.title,
          objective: "Control linked work",
          promptText: "Observe only.",
        }),
        workQueueLink: { workItemId: item.workItemId, runId: "run-future", stepId: "step-future" },
      });
      await seedSession(runtimeJobs);
      const command = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-controls",
          sessionId: "session-controls",
          actor: "operator",
          reason: "operator manual intervention",
        }),
      });

      expect(command.workQueueLink).toEqual({
        workItemId: item.workItemId,
        runId: "run-future",
        stepId: "step-future",
      });
      await expect(workQueue.readWorkItemTruth(item.workItemId)).resolves.toMatchObject({
        item: { lifecycleState: "manual_ready" },
        runs: [],
      });
    });
  });
});
