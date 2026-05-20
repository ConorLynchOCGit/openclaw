import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";
import { registerCloseoutGenerateRuntimeTool } from "./closeout-generate-runtime-tool.ts";
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
      expect(run.status).toBe("canonical_engine_required");
      expect(run.failure?.message).toBe("generic_workflow_runner_retired");
      expect(run.genericProductionSuccessAllowed).toBe(false);
      expect(run.reasonCodes).toContain("generic_workflow_runner_retired");
      expect(run.reasonCodes).toContain("workflow_definition_production_enabled");
      expect(run.reasonCodes).toContain("product_spec_planning_requires_scheduler_backed_runner");
      expect(run.reasonCodes).toContain(
        "product_spec_planning_generic_runner_cannot_emit_contract_artifacts",
      );
      const artifacts = await runtimeJobs.listArtifacts("product-spec-runtime-job");
      expect(artifacts.map((artifact) => artifact.artifactType)).not.toContain(
        "agent_team.product_spec_planning_worker_contract",
      );
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.workflow_definition_resolution",
      );
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.generic_workflow_runner_retirement",
      );
      const events = await runtimeJobs.listEvents("product-spec-runtime-job");
      expect(events.map((event) => event.eventType)).toContain(
        "execution.generic_workflow_runner_retired",
      );
    } finally {
      await db.close();
    }
  });

  it("does not complete generic workflows because the canonical workflow engine owns workflow execution", async () => {
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
      expect(run.status).toBe("blocked_migration_required");
      expect(run.failure?.message).toBe("generic_workflow_runner_retired");
      const artifacts = await runtimeJobs.listArtifacts("docs-runtime-job");
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.workflow_definition_resolution",
      );
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.generic_workflow_runner_retirement",
      );
    } finally {
      await db.close();
    }
  });

  it("does not let model closeout reporter bypass the canonical workflow engine", async () => {
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

      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.failure?.message).toBe("generic_workflow_runner_retired");
      const artifacts = await runtimeJobs.listArtifacts("docs-model-closeout-runtime-job");
      expect(artifacts.map((artifact) => artifact.artifactType)).toContain(
        "execution.workflow_definition_resolution",
      );
      expect(artifacts.map((artifact) => artifact.artifactType)).not.toContain(
        "execution_platform.closeout_capsule",
      );
    } finally {
      await db.close();
    }
  });

  it("does not invoke closeout.generate from generic runner after workflow definition resolution blocks it", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const registry = new RuntimeToolRegistry();
      const traces = new RuntimeToolTraceRepository(db.sql);
      registerCloseoutGenerateRuntimeTool({
        registry,
        reporter: modelCloseoutReporterFixture(),
      });
      const runtimeToolKernel = new RuntimeToolKernel({ registry, traces });
      await runtimeJobs.enqueueJob({
        jobId: "docs-tool-closeout-runtime-job",
        jobType: "executor.workflow",
        queueName: "agent-team",
        payload: {
          workflowId: "workflow.docs_skills",
          objectiveSummary: "Update bounded docs/skills readback.",
        },
      });

      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        runtimeToolKernel,
        workerId: "docs-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.failure?.message).toBe("generic_workflow_runner_retired");
      const invocations = await traces.listInvocations({
        runtimeJobId: "docs-tool-closeout-runtime-job",
        toolId: "closeout.generate",
        limit: 10,
      });
      expect(invocations).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("does not complete production-ready coding through the generic workflow runner", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await runtimeJobs.enqueueJob({
        jobId: "coding-generic-runtime-job",
        jobType: "executor.workflow",
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Attempt to run coding through generic workflow dispatch.",
        },
      });

      const run = await new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "generic-coding-worker",
        queueName: "agent-team",
      }).runOnce();

      expect(run.completed).toBe(false);
      expect(run.failed).toBe(true);
      expect(run.status).toBe("canonical_engine_required");
      expect(run.reasonCodes).toContain("workflow_definition_production_enabled");
      expect(run.reasonCodes).toContain("workflow_plugin_registered");
      const artifacts = await runtimeJobs.listArtifacts("coding-generic-runtime-job");
      const retirement = artifacts.find(
        (artifact) => artifact.artifactType === "execution.generic_workflow_runner_retirement",
      );
      expect(retirement?.metadata).toMatchObject({
        genericProductionSuccessAllowed: false,
        canonicalWorkflowEngineRequired: true,
        workflowQueuedRunnerRole: "migration_shim_only",
      });
    } finally {
      await db.close();
    }
  });
});
