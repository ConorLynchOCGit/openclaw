import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  buildOpenClawActiveConvergenceQueue,
  buildOpenClawConvergenceSliceDefinitions,
  buildOpenClawOutstandingConvergenceQueue,
  CONVERGENCE_SLICE_WORK_ITEM_TYPE,
  getNextActiveConvergenceQueueItem,
  projectConvergenceSliceTracker,
  seedOpenClawConvergenceSliceTracker,
  summarizeOpenClawActiveQueueRebase,
} from "./convergence-slice-tracker.ts";
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
    const workQueue = new WorkQueueRepository(db.sql, runtimeJobs, {
      now: () => new Date("2026-05-07T21:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await db.close();
  }
}

describe("OpenClaw convergence slice tracker", () => {
  it("defines the full convergence roadmap with bounded source refs", () => {
    const definitions = buildOpenClawConvergenceSliceDefinitions();

    expect(definitions).toHaveLength(89);
    expect(definitions[0]).toMatchObject({
      sliceId: "openclaw-convergence.slice-01",
      trackerKind: "historical_slice",
      title: "OpenClaw Session Health Repair",
      planningStatus: "completed",
      dependsOnSliceIds: [],
    });
    expect(definitions[1]).toMatchObject({
      sliceId: "openclaw-convergence.slice-02",
      title: "Work Queue Canonical Slice Tracker",
      planningStatus: "completed",
      dependsOnSliceIds: ["openclaw-convergence.slice-01"],
    });
    expect(definitions[4]).toMatchObject({
      sliceId: "openclaw-convergence.slice-05",
      title: "Gateway Enqueue-Only Live Workflow Boundary",
      planningStatus: "completed",
      dependsOnSliceIds: ["openclaw-convergence.slice-04"],
    });
    expect(definitions[7]).toMatchObject({
      sliceId: "openclaw-convergence.slice-08",
      title: "ACP/Codex Coding Worker Adapter End-to-End Proof",
      planningStatus: "completed",
      dependsOnSliceIds: ["openclaw-convergence.slice-07"],
    });
    expect(definitions[8]).toMatchObject({
      sliceId: "openclaw-convergence.slice-09",
      title: "Closeout Model Executor Placement",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[9]).toMatchObject({
      sliceId: "openclaw-convergence.slice-10",
      title: "Browser Prompt Runtime Job Linkage Audit",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[10]).toMatchObject({
      sliceId: "openclaw-convergence.slice-11",
      title: "Work Queue Runtime Readback Upgrade",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[11]).toMatchObject({
      sliceId: "openclaw-convergence.slice-12",
      title: "Runtime Controls Through Worker Supervisor",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[12]).toMatchObject({
      sliceId: "openclaw-convergence.slice-13",
      title: "Coding Team Permission Model Reconciliation",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[13]).toMatchObject({
      sliceId: "openclaw-convergence.slice-14",
      title: "Coding Team Live Worker Soak",
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(definitions[13]?.artifactRefs).toEqual(
      expect.arrayContaining([
        ".artifacts/execution-platform/kimi-k2-6-role-transport-fix-summary.json",
        ".artifacts/execution-platform/slice-14-coding-team-multi-prompt-soak-summary.json",
      ]),
    );
    expect(definitions[19]).toMatchObject({
      sliceId: "openclaw-convergence.slice-20",
      title: "Model-Task Middleware Live Completion",
      planningStatus: "completed",
    });
    expect(definitions[22]).toMatchObject({
      sliceId: "openclaw-convergence.slice-23",
      title: "Middleware Worker Supervisor Adoption",
      planningStatus: "completed",
    });
    expect(definitions[25]).toMatchObject({
      sliceId: "openclaw-convergence.slice-26",
      title: "Managed Soak With Middleware-Backed Workflows",
      planningStatus: "completed",
    });
    expect(definitions[28]).toMatchObject({
      sliceId: "openclaw-convergence.slice-29",
      title: "Live Front-Door Owner Soak",
      planningStatus: "completed",
    });
    expect(definitions[40]).toMatchObject({
      sliceId: "openclaw-convergence.slice-41",
      title: "Tracker And Memory Truth Reconciliation",
      planningStatus: "completed",
    });
    expect(definitions[45]).toMatchObject({
      sliceId: "openclaw-convergence.slice-46",
      title: "Automatic Compaction Live Proof",
      planningStatus: "completed",
    });
    expect(definitions.at(-1)).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-33",
      title: "Release Rollback Runbook Closeout",
      planningStatus: "planned",
      legacySliceId: "openclaw-convergence.slice-56",
      activeQueuePosition: 33,
    });
    expect(definitions[50]).toMatchObject({
      sliceId: "openclaw-convergence.slice-51",
      title: "Model Memory Compatibility Hard Shutdown",
      planningStatus: "completed",
    });
    expect(definitions[51]).toMatchObject({
      sliceId: "openclaw-convergence.slice-52",
      title: "Coding Team Codex-Parity Trust Soak",
      planningStatus: "superseded",
      supersededByActiveQueueId: "openclaw-convergence.active-queue-01",
    });
    expect(definitions.every((definition) => definition.sourceDocRefs.length > 0)).toBe(true);
  });

  it("rebases remaining planned work into a contiguous active queue", () => {
    const activeQueue = buildOpenClawActiveConvergenceQueue();
    const outstandingQueue = buildOpenClawOutstandingConvergenceQueue();
    const summary = summarizeOpenClawActiveQueueRebase();
    const next = getNextActiveConvergenceQueueItem();

    expect(activeQueue).toHaveLength(33);
    expect(activeQueue.map((item) => item.activeQueuePosition)).toEqual(
      Array.from({ length: 33 }, (_, index) => index + 1),
    );
    expect(new Set(activeQueue.map((item) => item.activeQueueId)).size).toBe(33);
    expect(activeQueue[0]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-01",
      title: "Coding Team Codex-Parity Trust Soak",
      legacySliceId: "openclaw-convergence.slice-52",
      dependsOnActiveQueueIds: [],
      planningStatus: "completed",
      blockerReasonCodes: [],
    });
    expect(activeQueue[1]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-02",
      title: "Dynamic Coding Team Orchestration Graph",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-01"],
      legacySliceId: null,
    });
    expect(activeQueue[2]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-03",
      title: "Work Queue Parent Child Action Graph",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-02"],
      legacySliceId: null,
    });
    expect(activeQueue[3]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-04",
      title: "Human Operator Task Adapter",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-03"],
      legacySliceId: null,
    });
    expect(activeQueue[4]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-05",
      title: "Plan To Runtime Compiler",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-04"],
      legacySliceId: null,
    });
    expect(activeQueue[5]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-06",
      title: "Managed Multi-Action Project Soak",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-05"],
      legacySliceId: null,
    });
    expect(activeQueue[6]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-07",
      title: "Core OpenClaw Loop Simplification",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-06"],
      planningStatus: "completed",
    });
    expect(activeQueue[7]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-08",
      title: "Skillifier Runtime Job Migration",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-07"],
      planningStatus: "completed",
    });
    expect(activeQueue[8]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-09",
      title: "Runtime Parity Gap Audit And Kill Switches",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-08"],
      planningStatus: "needs_review",
      legacySliceId: null,
      remainingQueuePosition: 1,
      remainingQueueLabel: "remaining-queue-01",
    });
    expect(activeQueue[9]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-10",
      title: "Persistent Codex Adapter Loop",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-09"],
      planningStatus: "needs_review",
      legacySliceId: null,
      remainingQueuePosition: 2,
      remainingQueueLabel: "remaining-queue-02",
    });
    expect(activeQueue[11]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-12",
      title: "Dynamic OpenClaw Role Graph Executor",
      planningStatus: "completed",
      remainingQueuePosition: null,
      remainingQueueLabel: null,
    });
    expect(activeQueue[16]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-17",
      title: "Long-Form UX Codex Parity Proof",
      planningStatus: "needs_review",
      remainingQueuePosition: 8,
      remainingQueueLabel: "remaining-queue-08",
    });
    expect(activeQueue[17]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-18",
      title: "Managed Multi-Prompt Coding Soak",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-17"],
      planningStatus: "planned",
      legacySliceId: null,
      remainingQueuePosition: 9,
      remainingQueueLabel: "remaining-queue-09",
    });
    expect(activeQueue[18]).toMatchObject({
      sliceId: "openclaw-convergence.active-queue-19",
      title: "Proactivity Work Queue Quality Soak",
      dependsOnActiveQueueIds: ["openclaw-convergence.active-queue-18"],
      planningStatus: "planned",
      legacySliceId: "openclaw-convergence.slice-49",
    });
    expect(outstandingQueue[0]).toMatchObject({
      activeQueueId: "openclaw-convergence.active-queue-09",
      remainingQueueLabel: "remaining-queue-01",
      title: "Runtime Parity Gap Audit And Kill Switches",
    });
    expect(outstandingQueue.map((item) => item.remainingQueuePosition)).toEqual(
      Array.from({ length: outstandingQueue.length }, (_, index) => index + 1),
    );
    expect(next).toMatchObject({
      activeQueueId: "openclaw-convergence.active-queue-09",
      remainingQueueLabel: "remaining-queue-01",
      title: "Runtime Parity Gap Audit And Kill Switches",
    });
    expect(summary).toMatchObject({
      historicalSliceCount: 56,
      completedHistoricalSliceCount: 38,
      supersededHistoricalPlannedCount: 18,
      activeQueueItemCount: 33,
      outstandingActiveQueueItemCount: 24,
      nextActiveQueueItem: {
        activeQueueId: "openclaw-convergence.active-queue-09",
        remainingQueueLabel: "remaining-queue-01",
        title: "Runtime Parity Gap Audit And Kill Switches",
      },
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("seeds convergence slices as Work Queue planning items without runtime lifecycle success", async () => {
    await withRuntime(async ({ workQueue }) => {
      const seeded = await seedOpenClawConvergenceSliceTracker({ workQueue });
      const readback = await workQueue.readWorkQueue(100);
      const sliceOne = readback.find((item) => item.workItemId === "openclaw-convergence.slice-01");
      const sliceTwo = readback.find((item) => item.workItemId === "openclaw-convergence.slice-02");
      const truthTwo = await workQueue.readWorkItemTruth("openclaw-convergence.slice-02");

      expect(seeded).toMatchObject({ created: 89, existing: 0, updated: 0 });
      expect(
        readback.filter((item) => item.itemType === CONVERGENCE_SLICE_WORK_ITEM_TYPE),
      ).toHaveLength(89);
      expect(sliceOne?.convergenceSlice?.planningStatus).toBe("completed");
      expect(sliceOne?.lifecycleState).toBe("draft");
      expect(sliceOne?.runtimeJobIds).toEqual([]);
      expect(sliceTwo?.convergenceSlice?.planningStatus).toBe("completed");
      expect(sliceTwo?.convergenceSlice?.runtimeState.planningStatusIsLifecycleState).toBe(false);
      expect(truthTwo?.dependencies.map((dependency) => dependency.dependsOnWorkItemId)).toContain(
        "openclaw-convergence.slice-01",
      );
    });
  });

  it("is idempotent and projects dependencies, artifact refs, and raw-storage flags safely", async () => {
    await withRuntime(async ({ workQueue }) => {
      await seedOpenClawConvergenceSliceTracker({ workQueue });
      const reseeded = await seedOpenClawConvergenceSliceTracker({ workQueue });
      const truthOne = await workQueue.readWorkItemTruth("openclaw-convergence.slice-01");
      const projected = truthOne ? projectConvergenceSliceTracker(truthOne) : null;

      expect(reseeded).toMatchObject({ created: 0, existing: 89, updated: 89 });
      expect(projected?.artifactRefs).toContain(
        ".artifacts/execution-platform/openclaw-session-health-repair-summary.json",
      );
      expect(projected?.rawPromptStored).toBe(false);
      expect(projected?.rawResponseStored).toBe(false);
      expect(projected?.rawTranscriptStored).toBe(false);
      expect(projected?.rawLogsStored).toBe(false);
      expect(projected?.workQueueLifecycleMutationAllowed).toBe(false);
    });
  });

  it("projects invalid tracker metadata as needs_review, not execution success", async () => {
    await withRuntime(async ({ workQueue }) => {
      await workQueue.createWorkItem({
        workItemId: "openclaw-convergence.invalid",
        itemType: CONVERGENCE_SLICE_WORK_ITEM_TYPE,
        title: "Invalid tracker item",
        metadata: { artifactKind: "wrong_kind", rawPromptStored: true },
      });
      const truth = await workQueue.readWorkItemTruth("openclaw-convergence.invalid");
      const projected = truth ? projectConvergenceSliceTracker(truth) : null;

      expect(projected?.planningStatus).toBe("needs_review");
      expect(projected?.blockerReasonCodes).toContain("convergence_slice_tracker_metadata_invalid");
      expect(projected?.rawPromptStored).toBe(false);
    });
  });

  it("includes convergence slice state in execution readback while keeping runtime state separate", async () => {
    await withRuntime(async ({ workQueue, runtimeJobs }) => {
      await seedOpenClawConvergenceSliceTracker({ workQueue });
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "openclaw-convergence.slice-05",
      });

      expect(model.convergenceSlice?.planningStatus).toBe("completed");
      expect(model.runtimeJobs).toEqual([]);
      expect(model.linkedRuntimeJobIds).toEqual([]);
      expect(model.convergenceSlice?.runtimeState.lifecycleState).toBe("draft");
      expect(model.convergenceSlice?.runtimeState.planningStatusIsLifecycleState).toBe(false);
    });
  });

  it("projects active queue readback without treating it as lifecycle", async () => {
    await withRuntime(async ({ workQueue, runtimeJobs }) => {
      await seedOpenClawConvergenceSliceTracker({ workQueue });
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "openclaw-convergence.active-queue-01",
      });

      expect(model.convergenceSlice).toMatchObject({
        trackerKind: "active_queue_item",
        activeQueueId: "openclaw-convergence.active-queue-01",
        activeQueuePosition: 1,
        remainingQueuePosition: null,
        remainingQueueLabel: null,
        legacySliceId: "openclaw-convergence.slice-52",
        title: "Coding Team Codex-Parity Trust Soak",
        planningStatus: "completed",
        blockerReasonCodes: [],
      });
      expect(model.runtimeJobs).toEqual([]);
      expect(model.convergenceSlice?.runtimeState.lifecycleState).toBe("draft");
      expect(model.convergenceSlice?.runtimeState.planningStatusIsLifecycleState).toBe(false);
    });
  });
});
