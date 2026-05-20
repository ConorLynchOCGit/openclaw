import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";

async function withRepository<T>(work: (repository: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    return await work(repository);
  } finally {
    await database.close();
  }
}

async function withRepositoryClock<T>(
  work: (input: { repository: RuntimeJobRepository; setNow(value: Date): void }) => Promise<T>,
) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-08T00:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
    });
    return await work({
      repository,
      setNow(value) {
        now = value;
      },
    });
  } finally {
    await database.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runtime worker supervisor", () => {
  it("claims pending runtime jobs and completes only with task-specific evidence", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-complete",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => ({
              status: "completed",
              summary: "coded and validated bounded change",
              result: { ok: true },
              artifactRefs: ["runtime-job://job-supervisor-complete/closeout"],
              completedWorkEvidenceRefs: ["runtime-job://job-supervisor-complete/test-proof"],
              reasonCodes: ["adapter_completed_with_evidence"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            }),
          },
        ],
      });

      const result = await supervisor.runOnce();

      expect(result).toMatchObject({
        status: "completed",
        claimed: true,
        completed: true,
        runtimeJobId: "job-supervisor-complete",
        adapterId: "worker.acp-codex.coding",
        workQueueLifecycleMutated: false,
      });
      await expect(repository.getJob("job-supervisor-complete")).resolves.toMatchObject({
        state: "succeeded",
        result: { ok: true },
      });
      await expect(repository.listEvents("job-supervisor-complete")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "runtime_worker.supervisor_heartbeat" }),
          expect.objectContaining({
            eventType: "runtime_worker.adapter_started",
            data: expect.objectContaining({
              adapterId: "worker.acp-codex.coding",
              currentPhase: "adapter_execute",
            }),
          }),
          expect.objectContaining({
            eventType: "runtime_worker.adapter_completed",
            data: expect.objectContaining({
              adapterId: "worker.acp-codex.coding",
              status: "completed",
            }),
          }),
          expect.objectContaining({
            eventType: "runtime_execution.span",
            data: expect.objectContaining({
              executionSpan: expect.objectContaining({
                artifactKind: "runtime_execution_span",
                spanKind: "worker_phase",
                status: "succeeded",
                adapterId: "worker.acp-codex.coding",
                evidenceRefs: ["runtime-job://job-supervisor-complete/test-proof"],
                rawPromptStored: false,
                rawResponseStored: false,
              }),
            }),
          }),
          expect.objectContaining({ eventType: "job.succeeded" }),
        ]),
      );
    });
  });

  it("renews the runtime lease while adapter execution is in progress", async () => {
    await withRepositoryClock(async ({ repository, setNow }) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-long-adapter",
        jobType: "executor.agent_team",
        leaseTimeoutMs: 50,
        payload: { workflowId: "agent_team.coding" },
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        leaseRenewalIntervalMs: 10,
        leaseRenewalExtendByMs: 200,
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => {
              setNow(new Date("2026-05-08T00:00:00.100Z"));
              await sleep(35);
              return {
                status: "completed",
                summary: "long adapter completed after original lease expiry",
                result: { ok: true },
                artifactRefs: ["runtime-job://job-supervisor-long-adapter/closeout"],
                completedWorkEvidenceRefs: ["runtime-job://job-supervisor-long-adapter/test-proof"],
                reasonCodes: ["adapter_completed_after_lease_renewal"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        ],
      });

      const result = await supervisor.runOnce({ runtimeJobId: "job-supervisor-long-adapter" });
      const events = await repository.listEvents("job-supervisor-long-adapter");

      expect(result).toMatchObject({
        status: "completed",
        completed: true,
      });
      expect(events.map((event) => event.eventType)).toContain("job.lease_renewed");
      await expect(repository.getJob("job-supervisor-long-adapter")).resolves.toMatchObject({
        state: "succeeded",
      });
    });
  });

  it("stops lease renewal after adapter failure", async () => {
    await withRepositoryClock(async ({ repository, setNow }) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-failed-adapter-renewal",
        jobType: "executor.agent_team",
        leaseTimeoutMs: 50,
        maxAttempts: 1,
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        leaseRenewalIntervalMs: 10,
        leaseRenewalExtendByMs: 200,
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => {
              setNow(new Date("2026-05-08T00:00:00.100Z"));
              await sleep(20);
              return {
                status: "needs_review",
                summary: "validation needs review",
                reasonCodes: ["validation_needs_review"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        ],
      });

      await expect(
        supervisor.runOnce({ runtimeJobId: "job-supervisor-failed-adapter-renewal" }),
      ).resolves.toMatchObject({ status: "needs_review" });
      const eventCountAfterRun = (
        await repository.listEvents("job-supervisor-failed-adapter-renewal")
      ).length;
      await sleep(40);
      await expect(
        repository.listEvents("job-supervisor-failed-adapter-renewal"),
      ).resolves.toHaveLength(eventCountAfterRun);
      await expect(
        repository.getJob("job-supervisor-failed-adapter-renewal"),
      ).resolves.toMatchObject({
        state: "failed",
        result: { status: "needs_review" },
        error: { code: "worker_adapter_needs_review", retryScheduled: false },
      });
      expect(
        (await repository.listEvents("job-supervisor-failed-adapter-renewal")).map(
          (event) => event.eventType,
        ),
      ).toContain("job.needs_review");
    });
  });

  it("does not mark completion when evidence is missing", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-needs-review",
        jobType: "executor.agent_team",
        maxAttempts: 1,
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => ({
              status: "completed",
              summary: "claimed done without evidence",
              reasonCodes: ["adapter_claimed_done"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            }),
          },
        ],
      });

      const result = await supervisor.runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["completed_status_missing_task_specific_evidence"],
      });
      await expect(repository.getJob("job-supervisor-needs-review")).resolves.toMatchObject({
        state: "failed",
        error: { code: "completed_status_missing_task_specific_evidence" },
      });
    });
  });

  it("surfaces bounded adapter throw classes in supervisor result reason codes", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-adapter-throws",
        jobType: "executor.agent_team",
        maxAttempts: 1,
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => {
              throw new Error("artifact metadata exceeds 65536 bytes");
            },
          },
        ],
      });

      const result = await supervisor.runOnce({
        runtimeJobId: "job-supervisor-adapter-throws",
      });

      expect(result).toMatchObject({
        status: "failed",
        reasonCodes: ["worker_adapter_threw", "worker_adapter_threw:artifact_metadata_limit"],
      });
      await expect(repository.getJob("job-supervisor-adapter-throws")).resolves.toMatchObject({
        state: "failed",
        error: {
          code: "worker_adapter_threw",
          message: "artifact metadata exceeds 65536 bytes",
        },
      });
    });
  });

  it("handles unavailable adapters without false success", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({
        jobId: "job-supervisor-no-adapter",
        jobType: "executor.unknown",
        maxAttempts: 1,
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        adapters: [
          {
            adapterId: "worker.acp-codex.coding",
            jobTypes: ["executor.agent_team"],
            execute: async () => {
              throw new Error("should not run");
            },
          },
        ],
      });

      const result = await supervisor.runOnce({ runtimeJobId: "job-supervisor-no-adapter" });

      expect(result).toMatchObject({
        status: "idle",
        claimed: false,
      });
      await expect(repository.getJob("job-supervisor-no-adapter")).resolves.toMatchObject({
        state: "pending",
      });
    });
  });

  it("reports lease conflicts and terminal jobs instead of rerunning them", async () => {
    await withRepository(async (repository) => {
      await repository.enqueueJob({ jobId: "job-running", jobType: "executor.agent_team" });
      await repository.claimNextJob({ workerId: "worker-a", runtimeJobId: "job-running" });
      await repository.enqueueJob({ jobId: "job-done", jobType: "executor.agent_team" });
      const doneClaim = await repository.claimNextJob({
        workerId: "worker-a",
        runtimeJobId: "job-done",
      });
      await repository.completeJob({
        leaseToken: doneClaim!.leaseToken,
        result: { ok: true },
      });
      const supervisor = new RuntimeWorkerSupervisor({
        repository,
        workerId: "worker-supervisor",
        adapters: [],
      });

      await expect(supervisor.runOnce({ runtimeJobId: "job-running" })).resolves.toMatchObject({
        status: "lease_conflict",
        runtimeJobId: "job-running",
      });
      await expect(supervisor.runOnce({ runtimeJobId: "job-done" })).resolves.toMatchObject({
        status: "already_terminal",
        runtimeJobId: "job-done",
      });
    });
  });
});
