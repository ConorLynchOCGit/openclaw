import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "./work-queue-repository.ts";

async function withWorkQueueRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
    sql: Awaited<ReturnType<typeof createExecutionPlatformPgMemTestDatabase>>["sql"];
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue, sql: database.sql });
  } finally {
    await database.close();
  }
}

async function createItemWithVersion(workQueue: WorkQueueRepository) {
  const item = await workQueue.createWorkItem({
    workItemId: "work-item-1",
    itemType: "build_plan",
    title: "Execution Platform read model",
    description: "Backend-only work truth",
  });
  const version = await workQueue.createWorkItemVersion({
    versionId: "version-1",
    workItemId: item.workItemId,
    title: "Plan v1",
    body: "Codex-ready manual prompt",
    artifactMetadata: { promptKind: "draft" },
  });
  return { item, version };
}

describe("work queue execution truth migration", () => {
  it("creates Work Queue truth tables", async () => {
    await withWorkQueueRepository(async ({ sql }) => {
      const tableNames = [
        "work_item_artifacts",
        "work_item_assignments",
        "work_item_dependencies",
        "work_item_events",
        "work_item_parent_workflow_links",
        "work_item_versions",
        "work_items",
        "work_runs",
        "work_steps",
      ];

      await Promise.all(
        tableNames.map((tableName) =>
          sql.query(`SELECT * FROM execution_platform.${tableName} LIMIT 0`),
        ),
      );

      expect(tableNames).toHaveLength(9);
    });
  });
});

describe("work queue execution truth repository", () => {
  it("creates and reads a work item", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "create-read-item",
        itemType: "skill_draft",
        title: "Skill review",
        metadata: { source: "test" },
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(truth).toMatchObject({
        item: {
          workItemId: "create-read-item",
          lifecycleState: "draft",
          title: "Skill review",
        },
        currentVersion: null,
      });
      expect(truth?.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ eventType: "work_item.created" })]),
      );
    });
  });

  it("creates a new version and marks it current", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "versioned-item",
        itemType: "build_plan",
        title: "Versioned item",
      });
      const first = await workQueue.createWorkItemVersion({
        versionId: "versioned-item-v1",
        workItemId: item.workItemId,
        body: "First",
      });
      const second = await workQueue.createWorkItemVersion({
        versionId: "versioned-item-v2",
        workItemId: item.workItemId,
        body: "Second",
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(first.versionNumber).toBe(1);
      expect(second.versionNumber).toBe(2);
      expect(truth?.currentVersion).toMatchObject({
        versionId: "versioned-item-v2",
        body: "Second",
      });
      expect(truth?.versions.map((version) => version.versionId)).toEqual([
        "versioned-item-v2",
        "versioned-item-v1",
      ]);
    });
  });

  it("finalizes an item as manual-ready without creating a fake run", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const { item, version } = await createItemWithVersion(workQueue);

      const finalized = await workQueue.finalizeWorkItemVersion({
        workItemId: item.workItemId,
        versionId: version.versionId,
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(finalized.lifecycleState).toBe("manual_ready");
      expect(truth?.currentVersion).toMatchObject({
        versionState: "finalized",
      });
      expect(truth?.runs).toEqual([]);
      expect(truth?.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "work_item.finalized_manual_ready",
            data: expect.objectContaining({ executionCreated: false }),
          }),
        ]),
      );
    });
  });

  it("attaches artifact reference metadata without storing artifact contents", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const { item, version } = await createItemWithVersion(workQueue);

      const artifact = await workQueue.attachArtifactReference({
        artifactId: "artifact-1",
        workItemId: item.workItemId,
        versionId: version.versionId,
        artifactType: "codex_prompt",
        storageKind: "uri",
        uri: "workspace://docs/prompts/item-1.md",
        contentType: "text/markdown",
        sizeBytes: 128,
        metadata: { promptState: "draft" },
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(artifact).toMatchObject({
        artifactType: "codex_prompt",
        uri: "workspace://docs/prompts/item-1.md",
        metadata: { promptState: "draft" },
      });
      expect(truth?.artifacts).toEqual([expect.objectContaining({ artifactId: "artifact-1" })]);
    });
  });

  it("records lifecycle events", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "event-item",
        itemType: "diagnostic",
        title: "Needs review",
      });

      await workQueue.recordLifecycleEvent({
        workItemId: item.workItemId,
        eventType: "work_item.review_requested",
        lifecycleState: "blocked",
        data: { reason: "missing artifact" },
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(truth?.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "work_item.review_requested",
            lifecycleState: "blocked",
          }),
        ]),
      );
    });
  });

  it("assigns work items, adds dependencies, and links parent workflows", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const first = await workQueue.createWorkItem({
        workItemId: "dependent-item",
        itemType: "build_plan",
        title: "Dependent item",
      });
      const second = await workQueue.createWorkItem({
        workItemId: "dependency-item",
        itemType: "build_plan",
        title: "Dependency item",
      });

      await workQueue.assignWorkItem({
        assignmentId: "assignment-1",
        workItemId: first.workItemId,
        assigneeType: "user",
        assigneeId: "conor",
        role: "reviewer",
      });
      await workQueue.addDependency({
        dependencyId: "dependency-1",
        workItemId: first.workItemId,
        dependsOnWorkItemId: second.workItemId,
      });
      await workQueue.linkParentWorkflow({
        linkId: "workflow-link-1",
        workItemId: first.workItemId,
        parentWorkflowId: "workflow-1",
        parentWorkflowKind: "future_workflow",
        metadata: { source: "test" },
      });

      const truth = await workQueue.readWorkItemTruth(first.workItemId);

      expect(truth).toMatchObject({
        assignments: [{ assignmentId: "assignment-1", assigneeId: "conor" }],
        dependencies: [{ dependencyId: "dependency-1", dependsOnWorkItemId: second.workItemId }],
        parentWorkflowLinks: [{ linkId: "workflow-link-1", parentWorkflowId: "workflow-1" }],
      });
    });
  });

  it("creates work runs linked to existing runtime jobs", async () => {
    await withWorkQueueRepository(async ({ runtimeJobs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "run-item",
        itemType: "build_plan",
        title: "Runtime linked",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "runtime-job-for-run",
        jobType: "test.runtime",
        payload: { ok: true },
      });

      const run = await workQueue.createWorkRun({
        runId: "run-1",
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(run).toMatchObject({
        runId: "run-1",
        runtimeJobId: runtimeJob.jobId,
        runtimeJob: { jobId: runtimeJob.jobId },
      });
      expect(truth?.item.lifecycleState).toBe("running");
      expect(truth?.runs).toEqual([
        expect.objectContaining({
          runId: "run-1",
          runtimeJobId: runtimeJob.jobId,
          runtimeJob: expect.objectContaining({ jobId: runtimeJob.jobId }),
        }),
      ]);
    });
  });

  it("creates and updates work steps with runtime job evidence", async () => {
    await withWorkQueueRepository(async ({ runtimeJobs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "step-item",
        itemType: "build_plan",
        title: "Step linked",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "runtime-job-for-step",
        jobType: "test.step",
      });
      await workQueue.createWorkRun({
        runId: "step-run",
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });

      const step = await workQueue.createWorkStep({
        stepId: "step-1",
        runId: "step-run",
        stepType: "runtime_job",
        stepName: "Run proof",
      });
      const updated = await workQueue.updateWorkStep({
        stepId: step.stepId,
        stepState: "succeeded",
        runtimeJobId: runtimeJob.jobId,
        result: { passed: true },
      });

      expect(updated).toMatchObject({
        stepId: "step-1",
        stepState: "succeeded",
        runtimeJobId: runtimeJob.jobId,
        result: { passed: true },
      });
    });
  });

  it("read model includes current version, events, assignments, dependencies, runs, steps, and artifacts", async () => {
    await withWorkQueueRepository(async ({ runtimeJobs, workQueue }) => {
      const { item, version } = await createItemWithVersion(workQueue);
      await workQueue.assignWorkItem({
        workItemId: item.workItemId,
        assigneeType: "user",
        assigneeId: "conor",
      });
      await workQueue.attachArtifactReference({
        workItemId: item.workItemId,
        versionId: version.versionId,
        artifactType: "plan",
        storageKind: "uri",
        uri: "workspace://plan.md",
      });
      const dependency = await workQueue.createWorkItem({
        workItemId: "read-model-dependency",
        itemType: "build_plan",
        title: "Dependency",
      });
      await workQueue.addDependency({
        workItemId: item.workItemId,
        dependsOnWorkItemId: dependency.workItemId,
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "read-model-runtime-job",
        jobType: "test.read_model",
      });
      await workQueue.createWorkRun({
        runId: "read-model-run",
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: runtimeJob.jobId,
        runState: "running",
      });
      await workQueue.createWorkStep({
        stepId: "read-model-step",
        runId: "read-model-run",
        stepType: "runtime_job",
        stepName: "Step",
      });

      const truth = await workQueue.readWorkItemTruth(item.workItemId);
      const queue = await workQueue.readWorkQueue();

      expect(truth).toMatchObject({
        currentVersion: { versionId: version.versionId },
        assignments: [expect.objectContaining({ assigneeId: "conor" })],
        dependencies: [expect.objectContaining({ dependsOnWorkItemId: dependency.workItemId })],
        runs: [expect.objectContaining({ runId: "read-model-run" })],
        steps: [expect.objectContaining({ stepId: "read-model-step" })],
        artifacts: [expect.objectContaining({ uri: "workspace://plan.md" })],
      });
      expect(truth?.events.length).toBeGreaterThan(0);
      expect(queue).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workItemId: item.workItemId,
            currentVersion: expect.objectContaining({ versionId: version.versionId }),
            assignmentCount: 1,
            dependencyCount: 1,
            runCount: 1,
            artifactCount: 1,
            runtimeJobIds: [runtimeJob.jobId],
          }),
        ]),
      );
    });
  });

  it("requires durable run or runtime job evidence for running and terminal item states", async () => {
    await withWorkQueueRepository(async ({ runtimeJobs, workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "evidence-item",
        itemType: "build_plan",
        title: "Evidence required",
      });

      await expect(
        workQueue.updateWorkItemLifecycleState({
          workItemId: item.workItemId,
          lifecycleState: "running",
        }),
      ).rejects.toThrow("requires durable run or runtime job evidence");

      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "evidence-runtime-job",
        jobType: "test.evidence",
      });

      await expect(
        workQueue.updateWorkItemLifecycleState({
          workItemId: item.workItemId,
          lifecycleState: "running",
          runtimeJobId: runtimeJob.jobId,
        }),
      ).resolves.toMatchObject({ lifecycleState: "running" });
    });
  });

  it("does not introduce fake execution controls or disabled future UI artifacts", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const { item, version } = await createItemWithVersion(workQueue);
      await workQueue.finalizeWorkItemVersion({
        workItemId: item.workItemId,
        versionId: version.versionId,
      });

      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(truth?.item.lifecycleState).toBe("manual_ready");
      expect(truth?.runs).toEqual([]);
      expect("executionControls" in truth!).toBe(false);
      expect("disabledFutureExecution" in truth!).toBe(false);
    });
  });
});
