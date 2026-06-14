import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { NATIVE_EXECUTION_SESSION_JOB_TYPE } from "../workflows/native-agentic-orchestration.ts";
import { buildWorkQueueExecutionEligibilityReadModel } from "./execution-eligibility-read-model.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
    return await work({ runtimeJobs, workQueue });
  } finally {
    await db.close();
  }
}

describe("Work Queue execution eligibility read model", () => {
  it("returns deterministic queue-rank eligibility and excluded reason codes", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "eligible-one",
        itemType: "platform_hardening",
        title: "Eligible one",
        description: "Implement the bounded native orchestration fix.",
        metadata: {
          sourceDocRefs: ["docs/projects/execution-platform/specs/native-orchestration.md"],
          artifactRefs: ["artifact://native-orchestration/context"],
          nextAction: "Start a native execution session with the linked spec ref.",
        },
      });
      await workQueue.createWorkItem({
        workItemId: "eligible-two",
        itemType: "platform_hardening",
        title: "Eligible two",
      });
      await workQueue.createWorkItem({
        workItemId: "blocked-lifecycle",
        itemType: "platform_hardening",
        title: "Blocked lifecycle",
      });
      await workQueue.updateWorkItemLifecycleState({
        workItemId: "blocked-lifecycle",
        lifecycleState: "blocked",
        reason: "fixture blocked",
      });
      await workQueue.createWorkItem({
        workItemId: "already-running",
        itemType: "platform_hardening",
        title: "Already running",
      });
      const runningJob = await runtimeJobs.enqueueJob({
        jobId: "already-running-job",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: "native-execution",
        workItemId: "already-running",
      });
      await runtimeJobs.claimNextJob({
        workerId: "fixture-worker",
        runtimeJobId: runningJob.jobId,
        queueName: "native-execution",
      });
      await workQueue.createWorkRun({
        runId: "already-running-run",
        workItemId: "already-running",
        executorKind: "runtime_job",
        runtimeJobId: runningJob.jobId,
        runState: "running",
      });

      const model = await buildWorkQueueExecutionEligibilityReadModel({
        runtimeJobs,
        workQueue,
        now: new Date("2100-01-01T00:31:00.000Z"),
      });

      expect(model).toMatchObject({
        artifactKind: "work_queue_execution_eligibility_read_model",
        source: "execution_platform_work_queue_db",
        ranking: "db_queue_rank_only",
        semanticExecutorSelection: false,
        rawPromptStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(model.eligible.map((item) => item.workItemId)).toEqual([
        "eligible-one",
        "eligible-two",
      ]);
      expect(model.eligible[0]?.reasonCodes).toEqual(["work_queue_item_eligible_by_queue_rank"]);
      expect(model.eligible[0]).toMatchObject({
        description: "Implement the bounded native orchestration fix.",
        sourceDocRefs: ["docs/projects/execution-platform/specs/native-orchestration.md"],
        artifactRefs: ["artifact://native-orchestration/context"],
        nextAction: "Start a native execution session with the linked spec ref.",
      });
      expect(model.excluded).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workItemId: "blocked-lifecycle",
            reasonCodes: expect.arrayContaining([
              "work_queue_item_lifecycle_state_excluded:blocked",
            ]),
          }),
          expect.objectContaining({
            workItemId: "already-running",
            reasonCodes: expect.arrayContaining([
              "work_queue_item_already_has_active_runtime_job",
              "work_queue_item_has_stale_running_runtime_job",
            ]),
          }),
        ]),
      );
    });
  });
});
