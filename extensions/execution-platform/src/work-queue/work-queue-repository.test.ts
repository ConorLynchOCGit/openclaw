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

  it("creates DB-primary queue status columns", async () => {
    await withWorkQueueRepository(async ({ sql }) => {
      const result = await sql.query(`
        SELECT queue_status, queue_rank, closed_at, closed_by_closeout_ref
        FROM execution_platform.work_items
        LIMIT 0
      `);

      expect(result.rows).toEqual([]);
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
          queueStatus: "active",
          queueRank: 1,
          title: "Skill review",
        },
        currentVersion: null,
      });
      expect(truth?.events).toEqual(
        expect.arrayContaining([expect.objectContaining({ eventType: "work_item.created" })]),
      );
    });
  });

  it("closes a Work Queue item from accepted closeout evidence without source-code status edits", async () => {
    await withWorkQueueRepository(async ({ workQueue, runtimeJobs }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "db-primary-close-item",
        itemType: "execution_workflow",
        title: "DB primary close item",
      });
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "db-primary-close-runtime-job",
        jobType: "executor.agent_team",
        workItemId: item.workItemId,
        payload: { boundedSummary: "prove DB primary close transition" },
      });

      const before = await workQueue.projectCanonicalRuntimeQueue();
      const result = await workQueue.completeWorkQueueItemFromCloseout({
        workItemId: item.workItemId,
        runtimeJobId: runtimeJob.jobId,
        closeoutRef: "artifact://closeout/db-primary-close-item",
        closeoutHash: "sha256:db-primary-close",
        validationRef: "artifact://validation/db-primary-close-item",
        validationRequired: true,
        sourceEditRequired: false,
        artifactRefs: ["artifact://closeout/db-primary-close-item"],
        reasonCodes: ["test_accepted_closeout"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        authorityGranted: false,
        controlsApplied: false,
        runtimeLifecycleMutated: false,
        modelPromotionPerformed: false,
      });
      const after = await workQueue.projectCanonicalRuntimeQueue();
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(before.active.map((entry) => entry.workItemId)).toContain(item.workItemId);
      expect(result).toMatchObject({
        artifactKind: "work_queue_item_closeout_transition_result",
        workItemId: item.workItemId,
        status: "closed",
        closed: true,
        runtimeLifecycleMutated: false,
      });
      expect(truth?.item.queueStatus).toBe("closed");
      expect(truth?.item.closedByCloseoutRef).toBe("artifact://closeout/db-primary-close-item");
      expect(after.active.map((entry) => entry.workItemId)).not.toContain(item.workItemId);
      expect(after.closed.map((entry) => entry.workItemId)).toContain(item.workItemId);
      expect(after.lifecycleTruthSource).toBe("work_queue_repository");
      expect(after.sourceTrackerMode).toBe("db_primary_no_source_tracker");
    });
  });

  it("keeps closeout transition idempotent and blocks missing validation from closing", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "db-primary-needs-review-item",
        itemType: "execution_workflow",
        title: "DB primary needs review item",
      });

      const first = await workQueue.completeWorkQueueItemFromCloseout({
        workItemId: item.workItemId,
        closeoutRef: "artifact://closeout/db-primary-needs-review-item",
        validationRequired: true,
        reasonCodes: ["test_missing_validation"],
      });
      const second = await workQueue.completeWorkQueueItemFromCloseout({
        workItemId: item.workItemId,
        closeoutRef: "artifact://closeout/db-primary-needs-review-item",
        validationRequired: true,
        reasonCodes: ["test_missing_validation"],
      });
      const truth = await workQueue.readWorkItemTruth(item.workItemId);

      expect(first).toMatchObject({
        status: "needs_review",
        closed: false,
        reasonCodes: expect.arrayContaining(["required_validation_ref_missing"]),
      });
      expect(second.idempotent).toBe(true);
      expect(truth?.item.queueStatus).toBe("needs_review");
      expect(truth?.item.closedByCloseoutRef).toBeNull();
    });
  });

  it("lists active and closed queue items from DB status without source tracker state", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const active = await workQueue.createWorkItem({
        workItemId: "db-list-active",
        itemType: "execution_workflow",
        title: "Active runtime item",
      });
      const closed = await workQueue.createWorkItem({
        workItemId: "db-list-closed",
        itemType: "execution_workflow",
        title: "Closed runtime item",
      });
      await workQueue.completeWorkQueueItemFromCloseout({
        workItemId: closed.workItemId,
        closeoutRef: "artifact://closeout/db-list-closed",
        validationRef: "artifact://validation/db-list-closed",
        validationRequired: true,
        sourceEditRequired: false,
      });

      const activeList = await workQueue.listDbWorkQueue({ bucket: "active" });
      const closedList = await workQueue.listDbWorkQueue({ bucket: "closed" });

      expect(activeList.source).toBe("execution_platform_work_queue_db");
      expect(activeList.items.map((item) => item.workItemId)).toContain(active.workItemId);
      expect(activeList.items.map((item) => item.workItemId)).not.toContain(closed.workItemId);
      expect(closedList.items.map((item) => item.workItemId)).toContain(closed.workItemId);
      expect(closedList.items[0]).toMatchObject({
        queueStatus: "closed",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      });
    });
  });

  it("syncs runtime graph child nodes into DB Work Queue children and rolls parent status", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const parent = await workQueue.createWorkItem({
        workItemId: "graph-parent",
        itemType: "execution_workflow",
        title: "Graph parent",
      });

      const runningChild = await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "graph-1",
        nodeId: "node-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "active",
        evidenceRefs: ["runtime-work-graph://graph-1/node/node-1"],
      });
      let rollup = await workQueue.rollupParentWorkQueueStatus({
        parentWorkItemId: parent.workItemId,
      });

      expect(runningChild.created).toBe(true);
      expect(rollup.queueStatus).toBe("active");
      expect(rollup.requiredChildWorkItemIds).toContain(runningChild.childWorkItemId);

      const closedChild = await workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: parent.workItemId,
        graphId: "graph-1",
        nodeId: "node-1",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        evidenceRefs: ["artifact://validation/graph-1/node-1"],
      });
      rollup = await workQueue.rollupParentWorkQueueStatus({
        parentWorkItemId: parent.workItemId,
        finalCloseoutRef: "artifact://closeout/graph-parent",
      });
      const parentTruth = await workQueue.readWorkItemTruth(parent.workItemId);
      const childTruth = await workQueue.readWorkItemTruth(closedChild.childWorkItemId);

      expect(closedChild.idempotent).toBe(true);
      expect(childTruth?.item.queueStatus).toBe("closed");
      expect(parentTruth?.item.queueStatus).toBe("closed");
      expect(parentTruth?.parentWorkflowLinks).toEqual([]);
      expect(rollup).toMatchObject({
        queueStatus: "closed",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        runtimeLifecycleMutated: false,
      });
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

  it("reads bounded planning snapshots without loading full truth history", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "planning-snapshot-item",
        itemType: "openclaw_convergence_slice",
        title: "Planning snapshot",
        description: "Snapshot description",
        metadata: { artifactKind: "work_queue_convergence_slice_tracker_metadata" },
      });
      await workQueue.createWorkItemVersion({
        versionId: "planning-snapshot-version",
        workItemId: item.workItemId,
        title: "Planning snapshot version",
        body: "Bounded version body",
        artifactMetadata: { trackerVersion: "openclaw-platform-convergence.v4" },
      });
      await workQueue.createWorkItem({
        workItemId: "openclaw-convergence.slice-01",
        itemType: "openclaw_convergence_slice",
        title: "Dependency item",
      });
      await workQueue.addDependency({
        workItemId: item.workItemId,
        dependsOnWorkItemId: "openclaw-convergence.slice-01",
        dependencyType: "convergence_slice_prerequisite",
      });

      const snapshots = await workQueue.readWorkItemPlanningSnapshots([item.workItemId]);
      const snapshot = snapshots.get(item.workItemId);

      expect(snapshot).toMatchObject({
        title: "Planning snapshot",
        description: "Snapshot description",
        currentVersionTitle: "Planning snapshot version",
        currentVersionBody: "Bounded version body",
      });
      expect(snapshot?.dependencyKeys).toEqual([
        "planning-snapshot-item\u0000openclaw-convergence.slice-01\u0000convergence_slice_prerequisite",
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
  it("projects closeout follow-up child refs as runtime projection backlinks without lifecycle mutation", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const parent = await workQueue.createWorkItem({
        workItemId: "closeout-parent-item",
        itemType: "execution_workflow",
        title: "Closeout parent",
      });
      const child = await workQueue.createWorkItem({
        workItemId: "closeout-child-item",
        itemType: "execution_workflow",
        title: "Closeout child",
      });

      await workQueue.recordCloseoutProjectionReadback({
        workItemId: parent.workItemId,
        closeoutRef: "runtime-job://closeout-parent-job/closeout",
        followUpChildWorkItemIds: [child.workItemId],
        priorityNote: "Prioritize blocker cleanup before accepting net-new queued coding tasks.",
        lifecycleMutationAllowed: false,
      });

      const projection = await workQueue.projectCanonicalRuntimeQueue();
      const projectedParent = projection.active.find(
        (item) => item.workItemId === parent.workItemId,
      );
      const projectedChild = projection.active.find((item) => item.workItemId === child.workItemId);

      expect(projectedParent?.childWorkItemIds).toContain(child.workItemId);
      expect(projectedChild?.parentWorkItemIds).toContain(parent.workItemId);
      expect(projectedParent?.priorityNote).toBe(
        "Prioritize blocker cleanup before accepting net-new queued coding tasks.",
      );
      expect(projectedParent?.workQueueLifecycleMutationAllowed).toBe(false);
      expect(projection.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("rejects oversized closeout priority notes", async () => {
    await withWorkQueueRepository(async ({ workQueue }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "priority-note-limit-item",
        itemType: "execution_workflow",
        title: "Priority note limit",
      });

      await expect(
        workQueue.recordCloseoutProjectionReadback({
          workItemId: item.workItemId,
          closeoutRef: "runtime-job://priority-note-limit-job/closeout",
          priorityNote: "x".repeat(161),
          lifecycleMutationAllowed: false,
        }),
      ).rejects.toThrow("closeout_projection_priority_note_exceeds_limit_160");

      await expect(
        workQueue.recordCloseoutProjectionReadback({
          workItemId: item.workItemId,
          closeoutRef: "runtime-job://priority-note-limit-job/closeout",
          priorityNote: "x".repeat(160),
          lifecycleMutationAllowed: false,
        }),
      ).resolves.toBeTruthy();
    });
  });
});
