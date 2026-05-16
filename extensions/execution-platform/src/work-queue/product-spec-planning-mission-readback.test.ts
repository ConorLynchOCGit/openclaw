import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { recordWorkerCloseoutCapsule } from "../workers/worker-closeout-capsule.ts";
import { MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE } from "../workflows/mission-contract-ledger.ts";
import { buildWorkQueueExecutionReadModel } from "./execution-read-model.ts";
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

describe("product/spec planning mission readback", () => {
  it("maps each open mission commitment to changed-file and validation evidence refs", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const runtimeJobId = "product-spec-mission-readback-job";
      const workItemId = "product-spec-mission-readback-item";
      const sourceRef =
        "repo://extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.ts";
      const diffRef =
        "runtime-job://product-spec-mission-readback-job/codex-direct-main-repo/diff/main-repo-change-1";
      const validationRef = "validation://product-spec-planning/readback-focused";
      const repairValidationRef =
        "runtime-job://product-spec-mission-readback-job/runtime-work-graph/validation/repair-rerun-accepted";

      const job = await runtimeJobs.enqueueJob({
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        workItemId,
        payload: {
          workflowId: "agent_team.product_spec_planning",
          authorityProfile: "read_only",
        },
      });
      await workQueue.createWorkItem({
        workItemId,
        itemType: "execution_workflow",
        title: "Product/spec mission readback",
      });
      await workQueue.createWorkRun({
        workItemId,
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
        metadata: { workQueueLifecycleMutated: false },
      });
      await recordWorkerCloseoutCapsule({
        runtimeJobs,
        capsule: createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: job.jobId,
          teamRunId: "team-run-product-spec-mission-readback",
          workflowId: "agent_team.product_spec_planning",
        }),
      });
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: "runtime-job://product-spec-mission-readback-job/mission-contract-ledger/mission-1/1",
        metadata: {
          ledgerStatus: "pending",
          blockingCommitments: [
            {
              commitmentId: "commitment-source-validation-map",
              status: "partially_satisfied",
              commitmentText:
                "Map changed source evidence and focused validation evidence to the mission commitment.",
              acceptedEvidenceRefs: [
                sourceRef,
                diffRef,
                validationRef,
                repairValidationRef,
                "review://product-spec-planning/quality",
              ],
              remainingWork: ["Owner review still decides whether residual gaps are acceptable."],
            },
          ],
        },
      });

      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId,
      });

      expect(
        model.runtimeJobs[0]?.ownerReadback.missionContract.blockingCommitments[0],
      ).toMatchObject({
        commitmentId: "commitment-source-validation-map",
        changedFileRefs: [sourceRef, diffRef],
        validationRefs: [validationRef, repairValidationRef],
        remainingWork: ["Owner review still decides whether residual gaps are acceptable."],
      });
      expect(model.runtimeJobs[0]?.ownerReadback.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });
});
