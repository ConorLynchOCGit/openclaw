import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { NativeExecutionRpcService } from "../intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { resolveConversationRoutingContext } from "./conversation-state-resolver.ts";
import { resolveConversationalReference } from "./conversational-reference-resolution.ts";
import { listKnownProtocolSlashCommands, runProtocolPreGate } from "./protocol-pre-gate.ts";

describe("Intent Front Door slices 3-5 integration", () => {
  it("keeps slash commands protocol-only and free-form text on the later routing path", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
      });

      for (const command of listKnownProtocolSlashCommands()) {
        const name = command.names[0] ?? command.key;
        const preGate = runProtocolPreGate({
          text: `/${name}`,
          sourceRoute: "ux",
          auth: { authenticated: true, actorId: "operator" },
          requireAuthentication: true,
        });
        expect(preGate, command.key).toMatchObject({
          kind: "protocol_command",
          command: command.key,
        });
      }

      const unknown = runProtocolPreGate({
        text: "/not-a-command build this",
        sourceRoute: "ux",
        auth: { authenticated: true, actorId: "operator" },
        requireAuthentication: true,
      });
      expect(unknown).toMatchObject({
        kind: "protocol_command",
        command: "unknown",
      });

      const freeForm = runProtocolPreGate({
        text: "Build this",
        sourceRoute: "ux",
        auth: { authenticated: true, actorId: "operator" },
        requireAuthentication: true,
      });
      expect(freeForm).toMatchObject({
        kind: "continue_to_intent_routing",
      });

      const compact = await rpc.submit({
        prompt: "/compact",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      });
      expect(compact.accepted).toBe(false);
      expect(compact.reasonCodes).toContain("protocol_command_compact");
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("resolves conversational references from runtime truth without applying controls", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const job = await runtimeJobs.enqueueJob({
        jobId: "runtime-reference",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: { workflowId: "agent_team.coding" },
        workItemId: "work-reference",
      });
      await workQueue.createWorkItem({
        workItemId: "work-reference",
        itemType: "execution_workflow",
        title: "Reference work",
      });
      await workQueue.createWorkRun({
        workItemId: "work-reference",
        executorKind: "runtime_job",
        runtimeJobId: job.jobId,
        runState: "running",
      });
      const context = await resolveConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "ux",
        runtimeJobs,
        workQueue,
        selectedWorkItemId: "work-reference",
        activeRuntimeJobIds: [job.jobId],
      });

      expect(resolveConversationalReference({ text: "continue", context })).toMatchObject({
        outcome: "resolved",
        targetRef: "work-item://work-reference",
      });
      expect(resolveConversationalReference({ text: "cancel it", context })).toMatchObject({
        outcome: "resolved",
        reasonCodes: expect.arrayContaining(["target_resolution_only_validator_required"]),
      });
      expect(resolveConversationalReference({ text: "ship it", context })).toMatchObject({
        outcome: "resolved",
        reasonCodes: expect.arrayContaining(["target_resolution_only_validator_required"]),
      });
      expect(await runtimeJobs.listArtifacts(job.jobId)).toHaveLength(0);
    } finally {
      await db.close();
    }
  });

  it("asks clarification for ambiguous active-job shorthand", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await runtimeJobs.enqueueJob({
        jobId: "runtime-one",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
      });
      await runtimeJobs.enqueueJob({
        jobId: "runtime-two",
        jobType: "executor.agent_team",
        payload: { workflowId: "agent_team.coding" },
      });
      const context = await resolveConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "ux",
        runtimeJobs,
        activeRuntimeJobIds: ["runtime-one", "runtime-two"],
      });
      expect(resolveConversationalReference({ text: "continue", context })).toMatchObject({
        outcome: "ambiguous",
        clarificationQuestion: "Which active job should this refer to?",
      });
    } finally {
      await db.close();
    }
  });
});
