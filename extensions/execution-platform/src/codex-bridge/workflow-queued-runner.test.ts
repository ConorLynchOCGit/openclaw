import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import { WorkflowQueuedRunner } from "./workflow-queued-runner.ts";

function modelCloseoutReporterFixture() {
  return {
    async createCapsule(input: {
      factualRefs: {
        runtimeJobId: string;
        teamRunId?: string | null;
        workflowId?: string | null;
      };
    }) {
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: input.factualRefs.runtimeJobId,
        teamRunId: input.factualRefs.teamRunId ?? null,
        workflowId: input.factualRefs.workflowId ?? "workflow.docs_skills",
      });
      return {
        source: "model" as const,
        capsule,
        legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
        reasonCodes: ["fixture_model_closeout_created"],
        rawPromptStored: false as const,
        rawResponseStored: false as const,
        rawProviderLogStored: false as const,
      };
    },
  };
}

describe("WorkflowQueuedRunner production fallback boundaries", () => {
  it("rejects Product/Spec Planning in the generic runner because it requires a scheduler-backed path", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "product-spec-work-item",
        itemType: "execution_workflow",
        title: "Product/spec planning",
      });
      await runtimeJobs.enqueueJob({
        jobId: "product-spec-runtime-job",
        jobType: "executor.workflow",
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.product_spec_planning",
          objectiveSummary: "Create a Product/Spec Planning child action graph proposal.",
        },
        workItemId: workItem.workItemId,
      });

      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "product-spec-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      }).runOnce();

      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.failure?.message).toBe("product_spec_planning_requires_scheduler_backed_runner");
      const artifacts = await runtimeJobs.listArtifacts("product-spec-runtime-job");
      expect(artifacts.map((artifact) => artifact.artifactType)).not.toContain(
        "agent_team.product_spec_planning_worker_contract",
      );
      const events = await runtimeJobs.listEvents("product-spec-runtime-job");
      expect(events.map((event) => event.eventType)).toContain(
        "execution.workflow_scheduler_required",
      );
    } finally {
      await db.close();
    }
  });

  it("does not complete generic workflows with degraded/system closeout evidence", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await runtimeJobs.enqueueJob({
        jobId: "docs-runtime-job",
        jobType: "executor.workflow",
        queueName: "agent-team",
        payload: {
          workflowId: "workflow.docs_skills",
          objectiveSummary: "Update bounded docs/skills readback.",
        },
      });

      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "docs-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.failure?.message).toBe("model_authored_closeout_required_before_success");
      const events = await runtimeJobs.listEvents("docs-runtime-job");
      expect(events.map((event) => event.eventType)).toContain(
        "execution.workflow_degraded_closeout_rejected",
      );
    } finally {
      await db.close();
    }
  });

  it("can complete a generic workflow only when model-authored closeout is present", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await runtimeJobs.enqueueJob({
        jobId: "docs-model-closeout-runtime-job",
        jobType: "executor.workflow",
        queueName: "agent-team",
        payload: {
          workflowId: "workflow.docs_skills",
          objectiveSummary: "Update bounded docs/skills readback.",
        },
      });

      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "docs-worker",
        queueName: "agent-team",
        closeoutReporter: modelCloseoutReporterFixture(),
      }).runOnce();

      expect(run.completed).toBe(true);
      const artifacts = await runtimeJobs.listArtifacts("docs-model-closeout-runtime-job");
      const closeout = artifacts.find(
        (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
      );
      expect(closeout?.metadata).toMatchObject({
        humanReport: { source: "model" },
      });
    } finally {
      await db.close();
    }
  });
});
