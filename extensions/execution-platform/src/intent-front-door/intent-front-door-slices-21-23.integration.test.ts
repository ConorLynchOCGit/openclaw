import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { NativeExecutionRpcService } from "../intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  InMemoryRoutingTelemetryStore,
  type CanonicalRouterOutput,
  type StructuredModelIntentRouterProvider,
} from "./index.ts";

function fixedProvider(output: CanonicalRouterOutput): StructuredModelIntentRouterProvider {
  return {
    async route() {
      return {
        output,
        providerRef: "fixture://slices-21-23",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: ["fixture_structured_router"],
      };
    },
  };
}

describe("Intent Front Door Slices 21-23 integration", () => {
  it("native submit artifacts project route state into Work Queue and telemetry", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      const telemetry = new InMemoryRoutingTelemetryStore();
      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
        objectiveSummary: "Improve bounded Work Queue routing projection.",
        requestedActions: [
          createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
          createCanonicalRouterAction("test", "focused validation", 0.95),
          createCanonicalRouterAction("review", "review result", 0.95),
          createCanonicalRouterAction("closeout", "closeout", 0.95),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        routingTelemetryStore: telemetry,
        structuredRouterProvider: fixedProvider(output),
      });

      const submit = await rpc.submit({
        prompt: "Use the full team to improve Work Queue routing projection.",
        workItemId: "work-item-slices-21-23",
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "agent:main:main",
          sourceRoute: "ux",
        },
        sourceRoute: "ux",
      });

      expect(submit.accepted).toBe(true);
      const readModel = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: "work-item-slices-21-23",
      });
      const routing = readModel.runtimeJobs[0]?.workflow.routing;
      expect(routing?.state).toBe("accepted");
      expect(routing?.route).toBe("workflow_execution");
      expect(routing?.validatorOutcome).toBe("accepted");
      expect(readModel.runtimeJobs[0]?.workflow.lifecycleState).toBe("pending");
      expect(readModel.runtimeJobs[0]?.workflow.workQueueLifecycleMutationAllowed).toBe(false);
      expect(telemetry.list()[0]?.promptHash).toBeTruthy();
      expect(telemetry.list()[0]?.rawPromptStored).toBe(false);
      expect(JSON.stringify(readModel)).not.toContain("Use the full team");
    } finally {
      await db.close();
    }
  });

  it("clarification and blocked outcomes record telemetry without runtime jobs", async () => {
    for (const output of [
      createBaseCanonicalRouterOutput({
        route: "clarification_required",
        responseMode: "ask_clarification",
        confidence: 0.2,
        objectiveSummary: "Clarify target.",
        ambiguity: {
          ambiguous: true,
          missingInputs: ["target"],
          conflictingInstructions: [],
          clarificationQuestion: "Which target?",
        },
      }),
      createBaseCanonicalRouterOutput({
        route: "blocked",
        responseMode: "block",
        executeNow: false,
        confidence: 0.9,
        objectiveSummary: "Blocked request.",
        reasonCodes: ["blocked_by_policy"],
      }),
    ]) {
      const db = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(db.sql);
        const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
        const telemetry = new InMemoryRoutingTelemetryStore();
        const rpc = new NativeExecutionRpcService({
          runtimeJobs,
          routingTelemetryStore: telemetry,
          structuredRouterProvider: fixedProvider(output),
        });

        const submit = await rpc.submit({
          prompt: "Bounded prompt for routing telemetry.",
          auth: { actorId: "operator", authenticated: true, role: "operator" },
        });

        expect(submit.runtimeJobId).toBeNull();
        expect(await runtimeJobs.listRecentJobs()).toHaveLength(0);
        expect(telemetry.list()).toHaveLength(1);
        expect(telemetry.list()[0]?.rawPromptStored).toBe(false);
        expect(telemetry.list()[0]?.rawProviderLogStored).toBe(false);
      } finally {
        await db.close();
      }
    }
  });
});
