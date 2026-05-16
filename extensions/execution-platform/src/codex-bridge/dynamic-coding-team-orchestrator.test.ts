import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  DynamicCodingTeamOrchestrator,
  type DynamicCodingTeamModelClient,
} from "./dynamic-coding-team-orchestrator.ts";

async function withOrchestrator<T>(
  responseText: string,
  work: (input: {
    orchestrator: DynamicCodingTeamOrchestrator;
    calls: string[];
    graphs: RuntimeWorkGraphRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-10T00:00:00.000Z"),
    });
    await graphs.createGraph({
      graphId: "graph-orchestrator",
      workflowId: "agent_team.coding",
      orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
    });
    const calls: string[] = [];
    const modelClient: DynamicCodingTeamModelClient = {
      async runJson(input) {
        calls.push(input.modelRef);
        return {
          modelRunRef: "orchestrator-run-1",
          responseText,
          responseHash: "orchestrator-hash",
          latencyMs: 42,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    };
    return await work({
      orchestrator: new DynamicCodingTeamOrchestrator({ graphs, modelClient }),
      calls,
      graphs,
    });
  } finally {
    await database.close();
  }
}

describe("dynamic coding-team orchestrator", () => {
  it("calls GPT 5.5 policy first and records bounded plan evidence", async () => {
    await withOrchestrator(
      JSON.stringify({
        childTasks: [
          {
            actionId: "code",
            actionKind: "coding",
            title: "Implement",
            assignedRole: "implementation_engineer",
            assignedWorkflow: "agent_team.coding",
            metadata: {
              objective:
                "Edit the runtime graph readback implementation for the scoped owner objective.",
              rationaleForCallingThisRole:
                "The implementation engineer is required because this child task must change source files.",
              expectedOutput: "Changed file refs, patch evidence, and validation refs.",
              acceptanceCriteria: ["Source edit remains inside approved scope."],
              downstreamConsumer: "test_engineer",
              targetRefs: ["repo://extensions/execution-platform/src/workflows"],
            },
          },
          {
            actionId: "test",
            actionKind: "qa_test",
            title: "Test",
            assignedRole: "test_engineer",
            assignedWorkflow: "agent_team.qa_test",
            dependencyActionIds: ["code"],
            metadata: {
              objective: "Validate the runtime graph readback implementation with focused tests.",
              rationaleForCallingThisRole:
                "The test engineer is required because validation evidence must be reviewed before closeout.",
              expectedOutput: "Validation refs and failure classification if any.",
              acceptanceCriteria: ["Required validation command refs are reviewed."],
              downstreamConsumer: "reviewer",
              targetRefs: ["repo://extensions/execution-platform/src/workflows"],
            },
          },
        ],
        rolePairings: [
          {
            roleId: "implementation_engineer",
            modelOrWorkerRef: "worker.codex.parity-runtime-adapter",
            reasonCodes: ["implementation_requires_source_edit"],
          },
          {
            roleId: "test_engineer",
            modelOrWorkerRef: "policy://runtime-work-graph/test-engineer",
            reasonCodes: ["validation_required"],
          },
        ],
        validationPlan: ["pnpm test:file runtime-work-graph.test.ts"],
        budgetPlan: { maxModelCalls: 8, maxRepairAttempts: 2, continuationAllowed: true },
      }),
      async ({ orchestrator, calls, graphs }) => {
        const result = await orchestrator.plan({
          graphId: "graph-orchestrator",
          ownerObjectiveSummary: "Make runtime graph readback better.",
          repoScopeRefs: ["repo://extensions/execution-platform/src/workflows"],
          contextPackRefs: ["context-pack://runtime-work-graph"],
          validationCommandRefs: ["pnpm test:file runtime-work-graph.test.ts"],
          allowedWorkflowIds: ["agent_team.coding", "agent_team.qa_test"],
          allowHumanTasks: true,
        });
        const snapshot = await graphs.readGraphSnapshot("graph-orchestrator");

        expect(calls).toEqual([DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF]);
        expect(result.deterministicValidation.semanticQualityJudgedByDeterministicCode).toBe(false);
        expect(result.deterministicValidation.reasonCodes).toEqual([]);
        expect(snapshot?.nodes[0]).toMatchObject({ nodeKind: "orchestrator_plan" });
        expect(snapshot?.roleInvocations[0]).toMatchObject({ roleId: "orchestrator" });
      },
    );
  });

  it("deterministically rejects invalid workflow refs without judging plan quality", async () => {
    await withOrchestrator(
      JSON.stringify({
        childTasks: [
          {
            actionId: "code",
            actionKind: "coding",
            title: "Implement",
            assignedRole: "implementation_engineer",
            assignedWorkflow: "unapproved.workflow",
            metadata: {
              objective:
                "Edit the runtime graph readback implementation for the scoped owner objective.",
              rationaleForCallingThisRole:
                "The implementation engineer is required because this child task must change source files.",
              expectedOutput: "Changed file refs, patch evidence, and validation refs.",
              acceptanceCriteria: ["Source edit remains inside approved scope."],
              downstreamConsumer: "test_engineer",
              targetRefs: ["repo://extensions/execution-platform/src/workflows"],
            },
          },
        ],
        rolePairings: [
          {
            roleId: "implementation_engineer",
            modelOrWorkerRef: "worker.codex.parity-runtime-adapter",
          },
        ],
      }),
      async ({ orchestrator }) => {
        const result = await orchestrator.plan({
          graphId: "graph-orchestrator",
          ownerObjectiveSummary: "Make runtime graph readback better.",
          repoScopeRefs: [],
          contextPackRefs: [],
          validationCommandRefs: [],
          allowedWorkflowIds: ["agent_team.coding"],
          allowHumanTasks: false,
        });

        expect(result.deterministicValidation.scopeValid).toBe(false);
        expect(result.deterministicValidation.reasonCodes).toContain(
          "workflow_not_allowed:unapproved.workflow",
        );
      },
    );
  });

  it("does not silently inject fallback child tasks when orchestration is empty", async () => {
    await withOrchestrator(
      JSON.stringify({
        childTasks: [],
        rolePairings: [],
        reasonCodes: ["model_could_not_decompose"],
      }),
      async ({ orchestrator, calls }) => {
        const result = await orchestrator.plan({
          graphId: "graph-orchestrator",
          ownerObjectiveSummary: "Make runtime graph readback better.",
          repoScopeRefs: ["repo://extensions/execution-platform/src/workflows"],
          contextPackRefs: [],
          validationCommandRefs: [],
          allowedWorkflowIds: ["agent_team.coding"],
          allowHumanTasks: false,
        });

        expect(calls).toHaveLength(2);
        expect(result.plan.childTasks).toEqual([]);
        expect(result.deterministicValidation.graphShapeValid).toBe(false);
        expect(result.deterministicValidation.reasonCodes).toEqual(
          expect.arrayContaining([
            "orchestrator_child_tasks_missing",
            "orchestrator_role_pairings_missing",
          ]),
        );
      },
    );
  });
});
