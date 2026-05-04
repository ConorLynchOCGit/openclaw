import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  CodexBridgeControlBridgeRepository,
  CodexBridgeRepository,
  applyControlCommandBeforeLaunch,
  createLiveControlAbortController,
  createManualPromptSource,
} from "./index.ts";

async function withHarness<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    control: CodexBridgeControlBridgeRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      now: () => new Date("2026-05-03T05:20:00.000Z"),
    });
    const bridge = new CodexBridgeRepository(runtimeJobs, {
      now: () => new Date("2026-05-03T05:20:00.000Z"),
    });
    await bridge.enqueueFakeCodexBridgeJob({
      jobId: "bridge-live-control-application",
      executorKind: "codex_cli",
      promptSource: createManualPromptSource({
        objective: "Live control application test",
        promptText: "Control application proof.",
        createdBy: "operator",
      }),
    });
    const control = new CodexBridgeControlBridgeRepository(runtimeJobs, {
      now: () => new Date("2026-05-03T05:20:00.000Z"),
    });
    return await work({ runtimeJobs, control });
  } finally {
    await database.close();
  }
}

describe("live control application", () => {
  it("applies pause and redirect before launch without mutating Work Queue lifecycle", async () => {
    await withHarness(async ({ control }) => {
      const pause = await control.recordControlCommand({
        command: await control.createPauseCommand({
          runtimeJobId: "bridge-live-control-application",
          sessionId: "session-live-control",
          actor: "operator",
          reason: "pause before launch",
          reasonCategory: "operator_manual_intervention",
        }),
      });
      const pauseApplied = await applyControlCommandBeforeLaunch({
        controlBridge: control,
        command: pause,
      });
      expect(pauseApplied).toMatchObject({
        launchAllowed: false,
        liveProcessSignalSent: false,
        workQueueLifecycleMutated: false,
        appliedEffect: "live_launch_paused_before_process_start",
      });

      const redirect = await control.recordControlCommand({
        command: await control.createRedirectCommand({
          runtimeJobId: "bridge-live-control-application",
          sessionId: "session-live-control",
          actor: "operator",
          reason: "redirect before launch",
          reasonCategory: "operator_manual_intervention",
          redirectPrompt: {
            objective: "Use redirected objective before process start.",
            scope: ["extensions/execution-platform/src/codex-bridge/"],
            nonGoals: ["Do not rebuild."],
            repoPath: "/root/services/openclaw-roles/live",
            workspaceDocsPath: "/root/.openclaw/workspace/docs/projects/execution-platform",
          },
        }),
      });
      const redirectApplied = await applyControlCommandBeforeLaunch({
        controlBridge: control,
        command: redirect,
      });
      expect(redirectApplied).toMatchObject({
        launchAllowed: true,
        promptInjectedIntoLiveProcess: true,
        appliedEffect: "redirect_materialized_before_process_start",
        redirectedPromptObjective: "Use redirected objective before process start.",
      });
    });
  });

  it("turns a cancel command into an abort signal for a running process", async () => {
    await withHarness(async ({ control }) => {
      const command = await control.createCancelCommand({
        runtimeJobId: "bridge-live-control-application",
        sessionId: "session-live-control",
        actor: "operator",
        reason: "cancel running process",
        reasonCategory: "operator_manual_intervention",
      });
      const liveControl = createLiveControlAbortController();
      const applied = liveControl.cancelFromControlCommand(command);
      expect(liveControl.controller.signal.aborted).toBe(true);
      expect(applied).toMatchObject({
        liveProcessSignalSent: true,
        promptInjectedIntoLiveProcess: false,
        appliedEffect: "running_process_canceled",
      });
    });
  });
});
