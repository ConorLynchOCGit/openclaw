import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { PlanToRuntimeCompiler } from "./plan-to-runtime-compiler.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

async function withCompiler<T>(work: (compiler: PlanToRuntimeCompiler) => Promise<T>): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const now = () => new Date("2026-05-10T00:00:00.000Z");
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic", now });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, { now });
    const graphs = new RuntimeWorkGraphRepository(database.sql, { now });
    return await work(new PlanToRuntimeCompiler({ runtimeJobs, workQueue, graphs }));
  } finally {
    await database.close();
  }
}

const basePolicy = {
  allowedWorkflowIds: ["agent_team.coding", "agent_team.qa_test", "human/operator"],
  allowedRepoScopeRefs: ["repo://extensions/execution-platform/src/workflows"],
  authoritySnapshotRef: "authority://owner-runtime-work-graph",
  authorityAllowsRuntimeCreation: true,
  modelPolicyRef: "policy://runtime-work-graph/models",
  maxRuntimeJobs: 4,
  rawPromptStored: false as const,
  rawResponseStored: false as const,
};

describe("plan to runtime compiler", () => {
  it("compiles valid action graph into runtime jobs and human tasks", async () => {
    await withCompiler(async (compiler) => {
      const result = await compiler.compile({
        parent: {
          parentWorkItemId: "compiler-parent",
          title: "Compile runtime work graph",
          ownerObjective: "Compile a multi-action graph.",
          approvedPlanRefs: ["artifact://approved-plan"],
          graphId: "compiled-graph",
        },
        childActions: [
          {
            actionId: "code",
            actionKind: "coding",
            title: "Code",
            assignedRole: "implementation_engineer",
            assignedWorkflow: "agent_team.coding",
            metadata: { repoScopeRef: "repo://extensions/execution-platform/src/workflows" },
          },
          {
            actionId: "human",
            actionKind: "human_operator",
            title: "Owner decision",
            assignedRole: "owner",
            assignedWorkflow: "human/operator",
            dependencyActionIds: ["code"],
          },
        ],
        workflowPolicy: basePolicy,
        ownerConstraints: {
          operatorId: "owner",
          budgetRef: "budget://runtime-work-graph",
          contextPackRefs: ["context-pack://runtime-work-graph"],
        },
      });

      expect(result.blocked).toBe(false);
      if (!result.blocked) {
        expect(result.runtimeJobIds).toHaveLength(1);
        expect(result.humanTaskIds).toHaveLength(1);
        expect(result.workQueueChildItemIds).toEqual(["code", "human"]);
      }
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("blocks invalid authority and dependency graph without runtime jobs", async () => {
    await withCompiler(async (compiler) => {
      const result = await compiler.compile({
        parent: {
          parentWorkItemId: "blocked-parent",
          title: "Blocked compile",
          ownerObjective: "Blocked compile",
          approvedPlanRefs: [],
          graphId: "blocked-graph",
        },
        childActions: [
          {
            actionId: "code",
            actionKind: "coding",
            title: "Code",
            assignedRole: "implementation_engineer",
            assignedWorkflow: "agent_team.coding",
            dependencyActionIds: ["missing"],
          },
        ],
        workflowPolicy: { ...basePolicy, authorityAllowsRuntimeCreation: false },
        ownerConstraints: {
          operatorId: "owner",
          budgetRef: "budget://runtime-work-graph",
          contextPackRefs: [],
        },
      });

      expect(result.blocked).toBe(true);
      expect(result.runtimeJobIds).toEqual([]);
      expect(result.reasonCodes.join(" ")).toMatch(/authority|missing_dependency/u);
    });
  });
});
