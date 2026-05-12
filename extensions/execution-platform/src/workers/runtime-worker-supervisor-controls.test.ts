import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { applyRuntimeWorkerSupervisorControl } from "./runtime-worker-supervisor-controls.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-09T00:00:00.000Z"),
    });
    return await work(repository);
  } finally {
    await database.close();
  }
}

describe("runtime worker supervisor controls", () => {
  it("records pause, redirect, cancel, status, and closeout controls without live application", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-running",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
      });

      for (const controlKind of [
        "pause",
        "redirect",
        "cancel",
        "status_readback",
        "closeout_readback",
      ] as const) {
        const decision = await applyRuntimeWorkerSupervisorControl({
          runtimeJobs,
          request: {
            controlId: `control-${controlKind}`,
            controlKind,
            runtimeJobId: "control-running",
            actorId: "operator",
            authenticated: true,
            reason: `${controlKind} requested for runtime-backed proof`,
            redirectSummary: controlKind === "redirect" ? "redirect to bounded next step" : null,
            targetValidation: {
              fresh: true,
              authorized: true,
              source: "fixture_runtime_state",
            },
          },
        });

        expect(decision).toMatchObject({
          accepted: true,
          appliedLiveControl: false,
          workQueueLifecycleMutated: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        });
      }

      const artifacts = await runtimeJobs.listArtifacts("control-running");
      expect(
        artifacts.filter((artifact) => artifact.artifactType === "runtime_worker.control_request"),
      ).toHaveLength(5);
      await expect(runtimeJobs.getJob("control-running")).resolves.toMatchObject({
        state: "pending",
      });
    });
  });

  it("records retry only for terminal failed or canceled jobs", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-retry-running",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
      });
      await runtimeJobs.enqueueJob({
        jobId: "control-retry-failed",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
        maxAttempts: 1,
      });
      const claim = await runtimeJobs.claimNextJob({
        workerId: "worker",
        runtimeJobId: "control-retry-failed",
      });
      await runtimeJobs.failJob({
        leaseToken: claim!.leaseToken,
        error: { code: "fixture_failure" },
      });

      await expect(
        applyRuntimeWorkerSupervisorControl({
          runtimeJobs,
          request: {
            controlId: "retry-running",
            controlKind: "retry",
            runtimeJobId: "control-retry-running",
            actorId: "operator",
            authenticated: true,
            reason: "retry while running",
            targetValidation: { fresh: true, authorized: true, source: "fixture_runtime_state" },
          },
        }),
      ).resolves.toMatchObject({
        accepted: false,
        reasonCodes: ["runtime_control_retry_requires_terminal_failed_or_canceled_job"],
      });

      await expect(
        applyRuntimeWorkerSupervisorControl({
          runtimeJobs,
          request: {
            controlId: "retry-failed",
            controlKind: "retry",
            runtimeJobId: "control-retry-failed",
            actorId: "operator",
            authenticated: true,
            reason: "retry after failed fixture",
            targetValidation: { fresh: true, authorized: true, source: "fixture_runtime_state" },
          },
        }),
      ).resolves.toMatchObject({
        accepted: true,
        appliedLiveControl: false,
      });
    });
  });

  it("rejects missing, stale, unauthorized, and non-workflow targets", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "control-chat-target",
        jobType: "chat.response",
        payload: { route: "chat_response" },
      });

      await expect(
        applyRuntimeWorkerSupervisorControl({
          runtimeJobs,
          request: {
            controlId: "missing-target",
            controlKind: "cancel",
            actorId: "operator",
            authenticated: true,
            reason: "missing target",
          },
        }),
      ).resolves.toMatchObject({
        accepted: false,
        reasonCodes: expect.arrayContaining(["runtime_control_target_required"]),
      });

      await expect(
        applyRuntimeWorkerSupervisorControl({
          runtimeJobs,
          request: {
            controlId: "stale-target",
            controlKind: "cancel",
            runtimeJobId: "control-chat-target",
            actorId: "operator",
            authenticated: true,
            reason: "stale target",
            targetValidation: {
              fresh: false,
              authorized: false,
              source: "fixture_runtime_state",
            },
          },
        }),
      ).resolves.toMatchObject({
        accepted: false,
        reasonCodes: expect.arrayContaining([
          "runtime_control_target_stale",
          "runtime_control_target_unauthorized",
          "runtime_control_target_not_workflow_runtime_job",
        ]),
      });
    });
  });
});
