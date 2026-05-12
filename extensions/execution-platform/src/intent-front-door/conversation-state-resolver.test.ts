import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { resolveConversationRoutingContext } from "./conversation-state-resolver.ts";

describe("ConversationStateResolver", () => {
  it("builds context from selected Work Queue truth and runtime job refs without mutation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const job = await runtimeJobs.enqueueJob({
        jobId: "runtime-selected",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
        workItemId: "work-selected",
      });
      await workQueue.createWorkItem({
        workItemId: "work-selected",
        itemType: "execution_workflow",
        title: "Selected work item",
      });
      await workQueue.createWorkRun({
        workItemId: "work-selected",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
      });
      const before = await runtimeJobs.listRecentJobs();
      const context = await resolveConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "ux",
        runtimeJobs,
        workQueue,
        activeRuntimeJobIds: [job.jobId],
        selectedWorkItemId: "work-selected",
        pendingClarifications: [
          {
            clarificationId: "clarification-1",
            targetRef: "runtime-job://runtime-selected",
            questionSummary: "Clarify target",
            freshness: "fresh",
          },
        ],
        pendingApprovals: [
          {
            approvalId: "approval-1",
            authorityId: "deploy",
            targetRef: "runtime-job://runtime-selected",
            scopeSummary: "deploy",
            state: "pending",
            freshness: "fresh",
          },
        ],
        authoritySnapshots: [
          {
            snapshotId: "authority-snapshot-1",
            version: "authority-v1",
            authorityStateRefs: ["authority://deploy"],
          },
        ],
        workflowRegistryVersion: "registry-v1",
      });
      const after = await runtimeJobs.listRecentJobs();

      expect(context.activeRuntimeJobs[0]?.runtimeJobId).toBe("runtime-selected");
      expect(context.activeRuntimeJobs[0]?.workflowId).toBe("agent_team.coding");
      expect(context.selectedWorkQueueItem?.workItemId).toBe("work-selected");
      expect(context.selectedWorkQueueItem?.runtimeJobIds).toContain("runtime-selected");
      expect(context.pendingClarifications).toHaveLength(1);
      expect(context.pendingApprovals).toHaveLength(1);
      expect(context.authoritySnapshots[0]?.version).toBe("authority-v1");
      expect(context.workflowRegistryVersion).toBe("registry-v1");
      expect(after).toHaveLength(before.length);
      expect(context.rawPromptStored).toBe(false);
      expect(context.rawResponseStored).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("records unavailable or missing runtime truth with bounded reason codes", async () => {
    const context = await resolveConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "api",
      activeRuntimeJobIds: ["runtime-missing"],
      selectedWorkItemId: "work-missing",
      recentContextSummary: "bounded",
    });

    expect(context.activeRuntimeJobs).toHaveLength(0);
    expect(context.selectedWorkQueueItem).toBeNull();
    expect(context.reasonCodes).toEqual(
      expect.arrayContaining([
        "runtime_job_repository_unavailable",
        "work_queue_repository_unavailable",
      ]),
    );
  });

  it("can read recent active jobs when explicitly requested", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await runtimeJobs.enqueueJob({
        jobId: "runtime-active",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
      });
      const context = await resolveConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "api",
        runtimeJobs,
        includeRecentActiveJobs: true,
      });
      expect(context.activeRuntimeJobs.map((job) => job.runtimeJobId)).toContain("runtime-active");
    } finally {
      await db.close();
    }
  });
});
