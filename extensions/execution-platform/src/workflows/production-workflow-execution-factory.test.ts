import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { ProductionWorkflowExecutionFactory } from "./production-workflow-execution-factory.ts";

async function withRepository<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-19T00:00:00.000Z"),
      maxArtifactMetadataBytes: 20_000,
    });
    return await work(runtimeJobs);
  } finally {
    await database.close();
  }
}

describe("ProductionWorkflowExecutionFactory", () => {
  it("fails closed for retired generic workflow execution instead of using queued-runner production success", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "product-spec-retired-generic-job",
        jobType: "workflow.product_spec_planning",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.product_spec_planning" },
      });

      const result = await new ProductionWorkflowExecutionFactory({ runtimeJobs }).runOnce({
        runtimeJobId: "product-spec-retired-generic-job",
        workerId: "test-worker",
        queueName: "agent-team",
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: false,
        failed: true,
        status: "canceled",
        workflowId: "agent_team.product_spec_planning",
      });
      expect(result.reasonCodes).toContain("generic_workflow_queued_runner_retired");

      await expect(runtimeJobs.getJob("product-spec-retired-generic-job")).resolves.toMatchObject({
        state: "canceled",
        cancellationReason: "canonical_workflow_runtime_engine_required",
      });
      await expect(runtimeJobs.listEvents("product-spec-retired-generic-job")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "execution.production_workflow_factory_retired_path_rejected",
          }),
          expect.objectContaining({ eventType: "job.canceled" }),
        ]),
      );
      await expect(runtimeJobs.listArtifacts("product-spec-retired-generic-job")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactType: "execution.production_workflow_factory_retired_path_rejected",
            metadata: expect.objectContaining({
              genericWorkflowRunnerUsed: false,
              queuedRunnerProductionSuccessAllowed: false,
              canonicalWorkflowEngineRequired: true,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
            }),
          }),
        ]),
      );
    });
  });

  it("delegates agent-team jobs to the configured production scheduler adapter", async () => {
    await withRepository(async (runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "agent-team-production-job",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });

      const result = await new ProductionWorkflowExecutionFactory({
        runtimeJobs,
        agentTeamRuntimeRunOnce: async ({ runtimeJobId, workerId, queueName }) => ({
          claimed: true,
          completed: true,
          failed: false,
          status: "succeeded",
          runtimeJobId,
          teamRunId: "team-run-agent-team-production-job",
          workflowId: "agent_team.coding",
          workerId,
          reasonCodes: [`queue:${queueName ?? "missing"}`, "agent_team_scheduler_adapter_used"],
        }),
      }).runOnce({
        runtimeJobId: "agent-team-production-job",
        workerId: "test-worker",
        queueName: "agent-team",
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: true,
        failed: false,
        status: "succeeded",
        runtimeJobId: "agent-team-production-job",
        teamRunId: "team-run-agent-team-production-job",
        workflowId: "agent_team.coding",
      });
      expect(result.reasonCodes).toContain("agent_team_scheduler_adapter_used");
    });
  });
});
