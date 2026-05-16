import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { DynamicTestRepairLoop } from "./dynamic-test-repair-loop.ts";

async function withLoop<T>(
  validationStatuses: Array<"passed" | "failed">,
  work: (input: {
    loop: DynamicTestRepairLoop;
    graphs: RuntimeWorkGraphRepository;
    implementationNodeId: string;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    await graphs.createGraph({
      graphId: "graph-test-loop",
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
    });
    const implementation = await graphs.addNode({
      graphId: "graph-test-loop",
      nodeId: "implementation-node",
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      nodeStatus: "succeeded",
    });
    let validationIndex = 0;
    const loop = new DynamicTestRepairLoop({
      graphs,
      maxRepairAttempts: 1,
      validationRunner: {
        async run(commandRef) {
          const status = validationStatuses[validationIndex++] ?? "passed";
          return {
            validationRef: `validation://${commandRef}/${status}`,
            status,
            summary: `${status} validation`,
          };
        },
      },
      testEngineer: {
        async diagnose() {
          return {
            modelRunRef: "test-engineer-run",
            responseHash: "test-engineer-hash",
            latencyMs: 15,
            recommendation: "repair",
            reasonCodes: ["repair_requested_by_test_engineer"],
            artifactRefs: ["artifact://test-review"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      repairWorker: {
        async repair() {
          return {
            status: "completed",
            changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
            artifactRefs: ["artifact://repair"],
            modelRunRef: "repair-run",
            responseHash: "repair-hash",
            latencyMs: 20,
            reasonCodes: ["repair_worker_completed"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    });
    return await work({ loop, graphs, implementationNodeId: implementation.nodeId });
  } finally {
    await database.close();
  }
}

describe("dynamic test/repair loop", () => {
  it("creates test_review and repair nodes on validation failure", async () => {
    await withLoop(["failed"], async ({ loop, graphs, implementationNodeId }) => {
      const result = await loop.run({
        graphId: "graph-test-loop",
        implementationNodeId,
        changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
        validationCommandRefs: ["pnpm test:file runtime-work-graph.test.ts"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-test-loop");

      expect(result.testReviewNodeIds).toHaveLength(1);
      expect(result.repairNodeIds).toHaveLength(1);
      expect(snapshot?.edges.map((edge) => edge.edgeKind).toSorted()).toEqual([
        "repair_requested",
        "validation_failed",
      ]);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("records repair budget exhaustion as needs_review", async () => {
    await withLoop(["failed", "failed"], async ({ loop, implementationNodeId }) => {
      const result = await loop.run({
        graphId: "graph-test-loop",
        implementationNodeId,
        changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
        validationCommandRefs: ["first", "second"],
      });

      expect(result.finalState).toBe("needs_review");
      expect(result.reasonCodes).toContain("repair_budget_exhausted");
    });
  });

  it("can ask the test engineer to review passing validation without creating a repair", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      await graphs.createGraph({
        graphId: "graph-pass-review",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const implementation = await graphs.addNode({
        graphId: "graph-pass-review",
        nodeId: "implementation-pass-review",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "succeeded",
      });
      const result = await new DynamicTestRepairLoop({
        graphs,
        reviewPassedValidations: true,
        testEngineer: {
          async diagnose(input) {
            expect(input.failedValidationRefs).toHaveLength(0);
            return {
              modelRunRef: "test-review-pass-run",
              responseHash: "test-review-pass-hash",
              latencyMs: 5,
              recommendation: "no_op_repair",
              reasonCodes: ["passed_validation_reviewed"],
              artifactRefs: ["artifact://passed-validation-review"],
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://passed",
              status: "passed",
              summary: "Focused validation passed.",
            };
          },
        },
      }).run({
        graphId: "graph-pass-review",
        implementationNodeId: implementation.nodeId,
        changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
        validationCommandRefs: ["pnpm test:file runtime-work-graph.test.ts"],
      });

      expect(result.finalState).toBe("passed");
      expect(result.testReviewNodeIds).toHaveLength(1);
      expect(result.repairNodeIds).toHaveLength(0);
      expect(result.repairAttemptCount).toBe(0);
      expect(result.reasonCodes).toContain("dynamic_validation_loop_completed");
    } finally {
      await database.close();
    }
  });

  it("treats passed-validation review timeout as a non-blocking readback warning", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      await graphs.createGraph({
        graphId: "graph-pass-review-timeout",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      const implementation = await graphs.addNode({
        graphId: "graph-pass-review-timeout",
        nodeId: "implementation-pass-review-timeout",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "succeeded",
      });
      const result = await new DynamicTestRepairLoop({
        graphs,
        reviewPassedValidations: true,
        testEngineerOperationTimeoutMs: 5,
        testEngineer: {
          async diagnose() {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              modelRunRef: "late-pass-review-run",
              responseHash: "late-pass-review-hash",
              latencyMs: 50,
              recommendation: "no_op_repair",
              reasonCodes: ["late_pass_review"],
              artifactRefs: ["artifact://late-pass-review"],
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        validationRunner: {
          async run() {
            return {
              validationRef: "validation://passed-timeout",
              status: "passed",
              summary: "Focused validation passed.",
            };
          },
        },
      }).run({
        graphId: "graph-pass-review-timeout",
        implementationNodeId: implementation.nodeId,
        changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
        validationCommandRefs: ["pnpm test:file runtime-work-graph.test.ts"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-pass-review-timeout");

      expect(result.finalState).toBe("passed");
      expect(result.reasonCodes).toContain("dynamic_validation_loop_completed");
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toContain(
        "test_engineer_passed_validation_review_unavailable",
      );
    } finally {
      await database.close();
    }
  });

  it("times out stalled test engineer diagnosis instead of hanging the graph", async () => {
    await withLoop(["failed"], async ({ graphs, implementationNodeId }) => {
      const loop = new DynamicTestRepairLoop({
        graphs,
        maxRepairAttempts: 1,
        operationTimeoutMs: 5,
        validationRunner: {
          async run(commandRef) {
            return {
              validationRef: `validation://${commandRef}/failed`,
              status: "failed",
              summary: "failed validation",
            };
          },
        },
        testEngineer: {
          async diagnose() {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              modelRunRef: "late-test-engineer-run",
              responseHash: "late-test-engineer-hash",
              latencyMs: 50,
              recommendation: "repair",
              reasonCodes: ["late_repair"],
              artifactRefs: ["artifact://late"],
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
      });

      const result = await loop.run({
        graphId: "graph-test-loop",
        implementationNodeId,
        changedFileRefs: ["extensions/execution-platform/src/workflows/runtime-work-graph.ts"],
        validationCommandRefs: ["first"],
      });
      const snapshot = await graphs.readGraphSnapshot("graph-test-loop");

      expect(result.finalState).toBe("needs_review");
      expect(result.reasonCodes).toContain("test_engineer_diagnosis_timeout");
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toContain(
        "test_engineer_diagnosis_started",
      );
      expect(result.rawLogsStored).toBe(false);
    });
  });
});
