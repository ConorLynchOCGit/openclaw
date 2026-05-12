import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { NativeExecutionRpcService } from "../intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { runClarificationGate } from "./clarification-gate.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  type CanonicalRouterOutput,
} from "./router-schema.ts";
import type { StructuredModelIntentRouterProvider } from "./structured-model-intent-router.ts";

function fixedProvider(output: CanonicalRouterOutput): StructuredModelIntentRouterProvider {
  return {
    async route() {
      return {
        output,
        providerRef: "fixture://slices-18-20",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: ["fixture_structured_router"],
      };
    },
  };
}

describe("Intent Front Door Slices 18-20 integration", () => {
  it("gateway-shaped normal execution prompt enters native submit and enqueues only after validation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Run bounded coding workflow.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
          createCanonicalRouterAction("test", "focused validation", 0.95),
          createCanonicalRouterAction("review", "bounded review", 0.95),
          createCanonicalRouterAction("closeout", "closeout", 0.95),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        structuredRouterProvider: fixedProvider(output),
      });
      const submit = await rpc.submit({
        prompt: "Use the full team to improve Work Queue readback.",
        auth: {
          actorId: "operator:main",
          authenticated: true,
          role: "operator",
          sessionId: "agent:main:main",
          sourceRoute: "ux",
        },
        sourceRoute: "ux",
      });

      expect(submit.accepted).toBe(true);
      expect(submit.frontDoorValidation?.accepted).toBe(true);
      expect(submit.frontDoorClarification?.outcome).toBe("pass_through");
      expect(submit.reasonCodes).toContain("native_submit_front_door_job_enqueued");
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  it("chat and clarification routes do not create runtime jobs", async () => {
    for (const output of [
      createBaseCanonicalRouterOutput({
        route: "chat_response",
        responseMode: "answer_in_chat",
        confidence: 0.99,
        objectiveSummary: "Answer directly in chat.",
      }),
      createBaseCanonicalRouterOutput({
        route: "clarification_required",
        responseMode: "ask_clarification",
        confidence: 0.2,
        objectiveSummary: "Clarify which job.",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["target"],
          conflictingInstructions: [],
          clarificationQuestion: "Which job should this apply to?",
        },
      }),
    ]) {
      const db = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(db.sql);
        const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
        const rpc = new NativeExecutionRpcService({
          runtimeJobs,
          structuredRouterProvider: fixedProvider(output),
        });
        const submit = await rpc.submit({
          prompt: "bounded prompt",
          auth: {
            actorId: "operator",
            authenticated: true,
            role: "operator",
            sessionId: "session-1",
          },
        });

        expect(submit.accepted).toBe(false);
        expect(submit.runtimeJobId).toBeNull();
        expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
      } finally {
        await db.close();
      }
    }
  });

  it("negated send and conditional deploy remain safe through native submit", async () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.95,
      objectiveSummary: "Edit without sending and deploy only if policy permits.",
      mentionedActions: [createCanonicalRouterAction("outbound_send", "outbound exists", 0.9)],
      requestedActions: [createCanonicalRouterAction("code_edit", "bounded edit", 0.95)],
      conditionalActions: [createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9)],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 1)],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
    });
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        structuredRouterProvider: fixedProvider(output),
      });
      const submit = await rpc.submit({
        prompt: "Do not send anything; deploy if policy permits after the edit.",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session-1",
        },
      });

      expect(submit.accepted).toBe(true);
      const compiledActions = submit.frontDoorCompiledRequest?.compiledActions ?? [];
      expect(compiledActions.map((action) => action.action)).toEqual(["code_edit"]);
      expect(submit.reasonCodes).toEqual(
        expect.arrayContaining([
          "negated_action_not_compilable:outbound_send",
          "conditional_action_policy_unmet:deploy",
        ]),
      );
    } finally {
      await db.close();
    }
  });

  it("stale targets ask clarification without Work Queue lifecycle mutation", () => {
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session-1",
      sourceRoute: "ux",
      selectedWorkQueueItem: {
        workItemId: "work-stale",
        itemType: "execution_workflow",
        titleSummary: "Stale work item",
        lifecycleState: "running",
        runtimeJobIds: ["job-stale"],
        updatedAt: "2026-05-05T00:00:00.000Z",
        freshness: "stale",
      },
    });
    const gate = runClarificationGate({
      routerOutput: createBaseCanonicalRouterOutput({
        route: "work_queue_control",
        responseMode: "apply_control",
        confidence: 0.9,
        objectiveSummary: "Cancel selected job.",
        requestedActions: [createCanonicalRouterAction("work_queue_control", "cancel", 0.9)],
      }),
      conversationContext: context,
      requestId: "stale-target",
      promptHash: "prompt-hash",
      promptSummary: "bounded",
      now: new Date("2026-05-06T00:00:00.000Z"),
    });

    expect(gate.outcome).toBe("clarification_required");
    expect(gate.reasonCodes).toContain("selected_work_queue_item_stale");
    expect(gate.workQueueLifecycleMutationAllowed).toBe(false);
  });
});
