import { describe, expect, it } from "vitest";
import { AgentTeamQueuedRunner } from "../codex-bridge/agent-team-queued-runner.ts";
import { WorkflowQueuedRunner } from "../codex-bridge/workflow-queued-runner.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { NativeExecutionRpcService } from "./native-execution-rpc.ts";

describe("native execution rpc", () => {
  it("submits natural language through intent router to runtime job and agent-team dispatch", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-exec",
        itemType: "execution_workflow",
        title: "Native execution workflow",
      });
      const rpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
      const submit = await rpc.submit({
        prompt: "Have the coding team add a small regression test and close it out.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workItemId: workItem.workItemId,
      });
      expect(submit.accepted).toBe(true);
      expect(submit.workflowId).toBe("agent_team.coding");
      expect(submit.jobType).toBe("executor.agent_team");
      expect(submit.runtimeJobId).toBeTruthy();
      expect(submit.rawPromptStored).toBe(false);

      const runner = new AgentTeamQueuedRunner({
        runtimeJobs,
        workerId: "agent-team-worker",
        queueName: "agent-team",
      });
      const run = await runner.runOnce();
      expect(run.completed).toBe(true);
      expect(run.teamRunId).toBeTruthy();

      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: workItem.workItemId,
      });
      expect(readModel.runtimeJobs[0]?.workflow.workflowId).toBe("agent_team.coding");
      expect(readModel.runtimeJobs[0]?.workflow.workQueueLifecycleMutationAllowed).toBe(false);
      expect(readModel.runtimeJobs[0]?.agentTeam.validationState).toBe("passed");
      const closeout = await rpc.readCloseout(submit.runtimeJobId ?? "");
      expect(JSON.stringify(closeout)).toContain("present");
    } finally {
      await db.close();
    }
  });

  it("rejects unsafe prompts without runtime lifecycle mutation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({ runtimeJobs });
      const submit = await rpc.submit({
        prompt: "Deploy this to production.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(submit.accepted).toBe(false);
      expect(submit.runtimeJobId).toBeNull();
      expect(submit.reasonCodes).toContain("production_deploy_locked");
      expect(submit.workQueueLifecycleMutated).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("submits web research through generic workflow dispatch and applies native controls", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const workItem = await workQueue.createWorkItem({
        workItemId: "work-item-native-research",
        itemType: "execution_workflow",
        title: "Native research workflow",
      });
      const rpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
      const submit = await rpc.submit({
        prompt: "Research current OpenAI structured output docs.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
        workItemId: workItem.workItemId,
      });
      expect(submit.accepted).toBe(true);
      expect(submit.workflowId).toBe("single_agent.web_research");
      expect(submit.runtimeJobId).toBeTruthy();
      if (!submit.runtimeJobId) {
        throw new Error("research runtime job id missing");
      }
      const control = await rpc.applyControl({
        actionKind: "retry",
        actionId: "native-research-retry",
        workItemId: workItem.workItemId,
        runtimeJobId: submit.runtimeJobId,
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(control.accepted).toBe(true);
      const runner = new WorkflowQueuedRunner({
        runtimeJobs,
        workerId: "generic-workflow-worker",
        queueName: "agent-team",
      });
      const run = await runner.runOnce();
      expect(run.completed).toBe(true);
      expect(run.workflowId).toBe("single_agent.web_research");
      const projection = await rpc.readWorkQueueProjection(workItem.workItemId);
      expect(JSON.stringify(projection)).toContain("single_agent.web_research");
    } finally {
      await db.close();
    }
  });
});
