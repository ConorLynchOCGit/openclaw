import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  applyMissionCommitmentEvaluation,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
} from "./mission-contract-ledger.ts";
import { runtimeNodeCapabilityManifestForModel } from "./runtime-node-capability-registry.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import {
  RuntimeWorkGraphScheduler,
  type RuntimeWorkGraphNodeExecutor,
} from "./runtime-work-graph-scheduler.ts";
import { registerSchedulerRuntimeTools } from "./scheduler-runtime-tools.ts";

async function withSchedulerGraph<T>(
  work: (graphs: RuntimeWorkGraphRepository) => Promise<T>,
  workflowId = "agent_team.coding",
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-14T00:00:00.000Z"),
    });
    await graphs.createGraph({
      graphId: "scheduler-graph",
      workflowId,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    return await work(graphs);
  } finally {
    await database.close();
  }
}

function succeededExecutor(refPrefix: string): RuntimeWorkGraphNodeExecutor {
  return {
    async execute(input) {
      return {
        status: "succeeded",
        outputArtifactRefs: [`artifact://${refPrefix}/${input.node.nodeId}`],
        reasonCodes: [`${refPrefix}_completed`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

function complexMissionLedger() {
  return normalizeMissionContractLedger({
    missionId: "complex-mission",
    ownerObjectiveSummary: "Edit code, validate it, review it, and document the result.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "code-edit",
          commitmentText: "Edit the requested code.",
          whyItMatters: "The owner asked for implementation.",
          expectedEvidenceDescription: "Changed-file refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "validation",
          commitmentText: "Run validation.",
          whyItMatters: "The owner asked for proof.",
          expectedEvidenceDescription: "Validation refs.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

describe("runtime work graph scheduler", () => {
  it("stops before child execution when Mission Contract gate blocks primary prohibited work", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "blocked-mission",
        ownerObjectiveSummary: "Deploy production without approval.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "unsafe-primary",
              commitmentText: "Deploy production without approval.",
              whyItMatters: "This is the primary mission.",
              expectedEvidenceDescription: "No child work should execute.",
              status: "needs_review",
              blocking: true,
            },
          ],
          prohibitedDirectiveCandidates: [
            {
              directiveId: "deploy-primary",
              directiveText: "Deploy production without approval.",
              classification: "primary_prohibited",
              rationale: "The prohibited deploy is the primary outcome.",
              actionCategory: "deploy",
              evidenceRefs: [],
            },
          ],
          missionGate: "blocked_primary_prohibited",
          missionGateRationale: "Primary prohibited side effect.",
        },
      });
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide() {
            throw new Error("orchestrator_should_not_be_called");
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("failed");
      expect(result.executedNodeIds).toEqual([]);
      expect(result.reasonCodes).toContain("mission_contract_primary_prohibited");
    });
  });

  it("executes arbitrary orchestrator-selected nodes without a hardcoded role sequence", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-validation-first",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Validation is the first useful child because existing files need inspection.",
          newNodes: [
            {
              nodeId: "validation-first",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation baseline result.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
            },
          ],
          reasonCodes: ["validation_baseline_needed"],
        },
        {
          decisionId: "run-validation-first",
          decisionKind: "run_node",
          rationaleForDecision: "Run the validation node selected by the orchestrator.",
          runNodeId: "validation-first",
          reasonCodes: ["run_validation_first"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "The lane proof has enough scheduler evidence.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["validation-first"]);
      expect(snapshot?.nodes.map((node) => node.assignedRole)).toEqual(["test_engineer"]);
      expect(snapshot?.nodes[0]?.nodeStatus).toBe("succeeded");
    });
  });

  it("traces scheduler decomposition, selection, worker execution, and closeout through runtime tools", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const graphs = new RuntimeWorkGraphRepository(database.sql, {
        now: () => new Date("2026-05-14T00:00:00.000Z"),
      });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const kernel = new RuntimeToolKernel({ registry, traces });
      await graphs.createGraph({
        graphId: "scheduler-tool-graph",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      const decisions = [
        {
          decisionId: "decompose",
          decisionKind: "add_nodes",
          rationaleForDecision: "Decompose the mission into implementation and validation work.",
          newNodes: [
            {
              nodeId: "impl-1",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "moonshotai/kimi-k2.6",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["Records source-change evidence."],
              downstreamConsumer: "validation-1",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "The implementation commitment needs source changes.",
              exactObjective: "Make the bounded implementation edit.",
              evidenceExpectation: "source_change",
            },
            {
              nodeId: "validation-1",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Records test validation evidence."],
              downstreamConsumer: "closeout",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation must run after implementation.",
              exactObjective: "Run focused validation.",
              evidenceExpectation: "test_validation",
            },
          ],
          newEdges: [
            {
              edgeId: "impl-to-validation",
              fromNodeId: "impl-1",
              toNodeId: "validation-1",
              edgeKind: "handoff",
            },
          ],
          reasonCodes: ["mission_decomposed"],
        },
        {
          decisionId: "run-impl",
          decisionKind: "run_node",
          rationaleForDecision: "Run the implementation node first.",
          runNodeId: "impl-1",
          reasonCodes: ["implementation_selected"],
        },
        {
          decisionId: "run-validation",
          decisionKind: "run_node",
          rationaleForDecision: "Run validation after implementation.",
          runNodeId: "validation-1",
          reasonCodes: ["validation_selected"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted evidence is present.",
          reasonCodes: ["scheduler_toolification_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/scheduler-tool" },
        },
      ];
      const progress: Array<{
        schedulerToolId?: string | null;
        schedulerPhase?: string | null;
        refs?: string[];
      }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        runtimeToolKernel: kernel,
        requireSchedulerToolKernel: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          progress.push({
            schedulerToolId: event.schedulerToolId,
            schedulerPhase: event.schedulerPhase,
            refs: event.schedulerToolInvocationRefs,
          });
        },
      });

      const result = await scheduler.run("scheduler-tool-graph");
      const invocations = await traces.listInvocations({
        graphId: "scheduler-tool-graph",
        limit: 50,
      });
      const toolIds = invocations.map((invocation) => invocation.toolId);

      expect(result.status).toBe("succeeded");
      expect(toolIds).toContain("scheduler.decompose_mission");
      expect(toolIds).toContain("scheduler.create_graph_node");
      expect(toolIds).toContain("scheduler.create_graph_edge");
      expect(toolIds).toContain("scheduler.accept_decomposition_graph");
      expect(toolIds).toContain("scheduler.select_next_node");
      expect(toolIds).toContain("worker.invoke");
      expect(toolIds).toContain("scheduler.create_closeout_request");
      expect(toolIds.filter((toolId) => toolId === "scheduler.decompose_mission")).toHaveLength(1);
      expect(toolIds.filter((toolId) => toolId === "scheduler.select_next_node")).toHaveLength(2);
      expect(
        toolIds.filter((toolId) => toolId === "scheduler.create_closeout_request"),
      ).toHaveLength(1);
      expect(progress.some((event) => event.schedulerToolId === "worker.invoke")).toBe(true);
      expect(
        progress.some(
          (event) =>
            event.schedulerToolId === "scheduler.decompose_mission" &&
            event.schedulerPhase === "planning_in_progress",
        ),
      ).toBe(true);
      expect(
        progress.some(
          (event) =>
            event.schedulerToolId === "scheduler.select_next_node" &&
            event.schedulerPhase === "execution_in_progress",
        ),
      ).toBe(true);
      expect(
        progress.some(
          (event) =>
            event.schedulerToolId === "scheduler.create_closeout_request" &&
            event.schedulerPhase === "finalization_pending",
        ),
      ).toBe(true);
      expect(
        progress.some((event) =>
          (event.refs ?? []).some((ref) => ref.startsWith("runtime-tool://")),
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("requires Product/Spec Planning to start executable work with the planning orchestrator", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "skip-planning-orchestrator",
              decisionKind: "add_nodes",
              rationaleForDecision: "Try research before the planning orchestrator.",
              newNodes: [
                {
                  nodeId: "research-first",
                  nodeKind: "web_research",
                  assignedRole: "web_researcher",
                  expectedOutput: "Research brief.",
                  acceptanceCriteria: ["Returns bounded source refs."],
                  downstreamConsumer: "planning_capsule_draft",
                },
              ],
              runAfterAdd: true,
              runNodeId: "research-first",
              reasonCodes: ["research_needed"],
            };
          },
        },
        executors: {
          "kind:web_research": succeededExecutor("research"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.executedNodeIds).toEqual([]);
      expect(result.reasonCodes).toContain(
        "product_spec_planning_first_node_must_be_planning_orchestrator",
      );
      expect(result.reasonCodes).toContain(
        "product_spec_planning_run_after_add_must_start_planning_orchestrator",
      );
    }, "agent_team.product_spec_planning");
  });

  it("lets Product/Spec Planning decompose the graph while running planning orchestrator first", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-planning-decomposition",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "The planning orchestrator should review the planned research handoff first.",
          newNodes: [
            {
              nodeId: "planning-orchestrator-1",
              nodeKind: "orchestrator_plan",
              capabilityId: "planning_orchestrator",
              assignedRole: "planning_orchestrator",
              expectedOutput: "Planning graph decision.",
              acceptanceCriteria: ["Records planning node evidence."],
              downstreamConsumer: "web_researcher",
            },
            {
              nodeId: "research-after-planning",
              nodeKind: "web_research",
              assignedRole: "web_researcher",
              expectedOutput: "Research brief.",
              acceptanceCriteria: ["Returns bounded source refs."],
              downstreamConsumer: "planning_capsule_draft",
            },
          ],
          newEdges: [
            {
              fromNodeId: "planning-orchestrator-1",
              toNodeId: "research-after-planning",
              edgeKind: "handoff",
              reasonCodes: ["planning_to_research"],
            },
          ],
          runAfterAdd: true,
          runNodeId: "planning-orchestrator-1",
          reasonCodes: ["planning_first"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "The first-call planner guardrail was proven.",
          reasonCodes: ["planning_first_guardrail_proven"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/planning-first" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:orchestrator": succeededExecutor("planning"),
          "role:planning_orchestrator": succeededExecutor("planning"),
          "kind:web_research": succeededExecutor("research"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["planning-orchestrator-1"]);
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual([
        "planning-orchestrator-1",
        "research-after-planning",
      ]);
      expect(snapshot?.edges).toHaveLength(1);
    }, "agent_team.product_spec_planning");
  });

  it("allows repeated role calls and mid-run graph expansion", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-scout-1",
          decisionKind: "request_context",
          rationaleForDecision: "First scout pass should identify broad files.",
          newNodes: [
            {
              nodeId: "context-1",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Broad context refs.",
              acceptanceCriteria: ["Names files."],
              downstreamConsumer: "orchestrator",
            },
          ],
          reasonCodes: ["context_needed"],
        },
        {
          decisionId: "run-scout-1",
          decisionKind: "run_node",
          rationaleForDecision: "Run first scout.",
          runNodeId: "context-1",
          reasonCodes: ["run_context"],
        },
        {
          decisionId: "add-scout-2",
          decisionKind: "rerun_role",
          rationaleForDecision: "A sharper second scout is needed after the first output.",
          newNodes: [
            {
              nodeId: "context-2",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              inputHandoffRefs: ["runtime-work-graph://node/context-1"],
              expectedOutput: "Sharper edit-point refs.",
              acceptanceCriteria: ["Cites concrete target refs."],
              downstreamConsumer: "implementation_engineer",
            },
          ],
          newEdges: [
            {
              fromNodeId: "context-1",
              toNodeId: "context-2",
              edgeKind: "continuation",
              reasonCodes: ["sharper_context_needed"],
            },
          ],
          reasonCodes: ["rerun_context_scout"],
        },
        {
          decisionId: "run-scout-2",
          decisionKind: "run_node",
          rationaleForDecision: "Run second scout.",
          runNodeId: "context-2",
          reasonCodes: ["run_context_again"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Repeated-role proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["context-1", "context-2"]);
      expect(snapshot?.nodes.filter((node) => node.assignedRole === "context_scout")).toHaveLength(
        2,
      );
      expect(snapshot?.edges.map((edge) => edge.edgeKind)).toContain("continuation");
    });
  });

  it("fails to needs_review instead of injecting fallback nodes when orchestration is invalid", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "bad",
              decisionKind: "add_nodes",
              rationaleForDecision: "",
              newNodes: [],
              reasonCodes: [],
            };
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("no_fallback_graph_injected");
      expect(snapshot?.nodes).toHaveLength(0);
    });
  });

  it("repairs malformed scheduler decisions before failing to needs_review", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionKind: "add_nodes",
          newNodes: [],
          reasonCodes: [],
        },
        {
          decisionId: "add-context-after-repair",
          decisionKind: "request_context",
          rationaleForDecision:
            "The first decision missed required fields, so add a concrete context node.",
          newNodes: [
            {
              nodeId: "context-after-repair",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Concrete context refs.",
              acceptanceCriteria: ["Returns bounded context refs."],
              downstreamConsumer: "implementation_engineer",
            },
          ],
          reasonCodes: ["scheduler_decision_repaired"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Repair proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      ];
      const repairInputs: unknown[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide(input) {
            repairInputs.push(input);
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.reasonCodes).toContain("orchestrator_decision_repaired");
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(["context-after-repair"]);
      expect(repairInputs).toEqual([
        expect.objectContaining({ repairAttempt: 0 }),
        expect.objectContaining({
          repairAttempt: 1,
          rejectedDecisionReasonCodes: expect.arrayContaining([
            "decision_id_missing",
            "decision_rationale_missing",
            "decision_new_nodes_missing",
          ]),
        }),
        expect.objectContaining({ repairAttempt: 0 }),
      ]);
    });
  });

  it("feeds structural node diagnostics back into orchestrator repair", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "bad-node-kind",
          decisionKind: "add_nodes",
          rationaleForDecision: "This node kind is not executable.",
          newNodes: [
            {
              nodeId: "bad-1",
              nodeKind: "not_a_real_node",
              expectedOutput: "Rejected shape.",
              acceptanceCriteria: ["Should be repaired."],
              downstreamConsumer: "orchestrator",
            },
          ],
          reasonCodes: ["bad_node_shape"],
        },
        {
          decisionId: "repair-with-capability",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Repair the structural error by selecting the context scout capability.",
          newNodes: [
            {
              nodeId: "context-after-diagnostic",
              capabilityId: "context_scout",
              expectedOutput: "Concrete context refs.",
              acceptanceCriteria: ["Names bounded file refs."],
              downstreamConsumer: "implementation_engineer",
            },
          ],
          reasonCodes: ["cited_failed_decision:bad-node-kind"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Repair diagnostics proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const repairInputs: unknown[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide(input) {
            repairInputs.push(input);
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(snapshot?.nodes[0]).toMatchObject({
        nodeId: "context-after-diagnostic",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
      });
      expect(repairInputs[1]).toEqual(
        expect.objectContaining({
          repairAttempt: 1,
          rejectedDecisionDiagnostics: expect.arrayContaining([
            expect.objectContaining({
              errorCode: "node_kind_not_executable_and_capability_missing",
              providedNodeKind: "not_a_real_node",
            }),
          ]),
        }),
      );
    });
  });

  it("requires a Mission Contract Ledger for execution workflows when configured", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        requireMissionLedgerForExecutionWorkflow: true,
        orchestrator: {
          async decide() {
            throw new Error("orchestrator_should_not_run_without_ledger");
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "mission_contract_ledger_required_for_execution_workflow",
      );
      expect(result.reasonCodes).toContain(
        "scheduler_child_work_blocked_until_mission_ledger_valid",
      );
    });
  });

  it("rejects broad implementation as the first move for complex missions", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return {
              decisionId: "broad-first",
              decisionKind: "add_nodes",
              rationaleForDecision: "Try to do the whole complex job in one implementation node.",
              newNodes: [
                {
                  nodeId: "implementation-complex-first",
                  nodeKind: "implementation",
                  capabilityId: "implementation_complex",
                  assignedRole: "implementation_engineer",
                  commitmentIdsAdvanced: ["code-edit", "validation"],
                  whyThisRoleIsNeededNow: "Implementation is eventually required.",
                  exactObjective: "Implement everything.",
                  evidenceExpectation: "Changed-file and validation refs.",
                  expectedOutput: "Completed implementation.",
                  acceptanceCriteria: ["Edits files and validates."],
                  downstreamConsumer: "reviewer",
                },
              ],
              metadata: {
                allowDirectImplementationForComplex: true,
                directImplementationJustification: "This old escape hatch must not pass.",
              },
              reasonCodes: ["broad_first"],
            };
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "complex_mission_requires_decomposition_before_broad_implementation",
      );
      expect(result.reasonCodes).toContain(
        "complex_mission_first_decision_requires_multi_node_decomposition",
      );
      expect(result.executedNodeIds).toEqual([]);
    });
  });

  it("requires graph structure or explicit parallel justification for complex decomposition", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return {
              decisionId: "flat-decomposition",
              decisionKind: "add_nodes",
              rationaleForDecision:
                "Two nodes are listed but no handoff or parallel rationale exists.",
              newNodes: [
                {
                  nodeId: "context-flat",
                  nodeKind: "context_scout",
                  assignedRole: "context_scout",
                  commitmentIdsAdvanced: ["code-edit"],
                  whyThisRoleIsNeededNow: "Context is needed.",
                  exactObjective: "Find target files.",
                  evidenceExpectation: "Context refs.",
                  expectedOutput: "Context refs.",
                  acceptanceCriteria: ["Names files."],
                  downstreamConsumer: "implementation_engineer",
                },
                {
                  nodeId: "validation-flat",
                  nodeKind: "validation",
                  assignedRole: "test_engineer",
                  commitmentIdsAdvanced: ["validation"],
                  whyThisRoleIsNeededNow: "Validation is needed.",
                  exactObjective: "Validate changes.",
                  evidenceExpectation: "Validation refs.",
                  expectedOutput: "Validation refs.",
                  acceptanceCriteria: ["Records validation."],
                  downstreamConsumer: "orchestrator",
                },
              ],
              reasonCodes: ["flat_decomposition"],
            };
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "complex_mission_decomposition_edges_or_parallel_justification_missing",
      );
      expect(result.executedNodeIds).toEqual([]);
    });
  });

  it("does not treat a bare create_closeout decision as success", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "bare-closeout",
              decisionKind: "create_closeout",
              rationaleForDecision: "This has no closeout node or accepted capsule ref.",
              reasonCodes: ["bare_closeout"],
            };
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("bare_create_closeout_cannot_succeed");
      expect(result.reasonCodes).toContain("closeout_node_or_accepted_model_closeout_ref_required");
    });
  });

  it("can run an added capability-compiled node immediately when orchestrator requests it", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-and-run-kimi",
          decisionKind: "add_nodes",
          rationaleForDecision: "Add the scoped implementation microtask and run it immediately.",
          newNodes: [
            {
              nodeId: "implementation-1",
              capabilityId: "implementation_microtask",
              commitmentIdsAdvanced: ["implementation"],
              whyThisRoleIsNeededNow:
                "A qualified non-Codex worker is enough for this scoped edit.",
              exactObjective: "Make the scoped implementation edit.",
              evidenceExpectation: "Changed-file refs.",
              expectedOutput: "Scoped edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              metadata: {
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: [
                  ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
                ],
                stopOrEscalationCondition: "Escalate if the scoped edit fails validation.",
              },
            },
          ],
          runAfterAdd: true,
          runNodeId: "implementation-1",
          reasonCodes: ["implementation_ready"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Immediate execution proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["implementation-1"]);
      expect(snapshot?.nodes[0]).toMatchObject({
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "succeeded",
      });
    });
  });

  it("requires cost-aware utility evidence when enabled for production scheduling", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-kimi-without-utility",
          decisionKind: "add_nodes",
          rationaleForDecision: "Try to add a capability without utility evidence.",
          newNodes: [
            {
              nodeId: "implementation-no-utility",
              capabilityId: "implementation_microtask",
              expectedOutput: "Scoped edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
            },
          ],
          reasonCodes: ["implementation_ready"],
        },
        {
          decisionId: "add-kimi-with-utility",
          decisionKind: "add_nodes",
          rationaleForDecision: "Repair with cost-aware utility evidence.",
          newNodes: [
            {
              nodeId: "implementation-with-utility",
              capabilityId: "implementation_microtask",
              commitmentIdsAdvanced: ["implementation"],
              whyThisRoleIsNeededNow: "A scoped edit is the cheapest sufficient next step.",
              exactObjective: "Make one scoped edit.",
              evidenceExpectation: "Changed-file refs.",
              expectedOutput: "Scoped edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              metadata: {
                taskFamily: "small_source_edit",
                consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
                utilityRationale: "The standard implementation commitment is small and scoped.",
                costRationale: "Kimi is cheaper than Codex and sufficient for this bounded edit.",
                whyThisIsNotDuplicateWork: "No implementation node has run yet.",
                expectedEvidence: ["source_change"],
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: [
                  ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
                ],
                stopOrEscalationCondition: "Escalate to Codex if validation fails.",
              },
            },
          ],
          runAfterAdd: true,
          runNodeId: "implementation-with-utility",
          reasonCodes: ["implementation_ready"],
          metadata: {
            parallelIndependentNodesJustification: "Single scoped node for one open commitment.",
          },
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Cost-aware scheduler proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/cost-aware" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: normalizeMissionContractLedger({
          missionId: "cost-aware-mission",
          ownerObjectiveSummary: "Make one scoped edit.",
          value: {
            blockingCommitments: [
              {
                commitmentId: "implementation",
                commitmentText: "Make one scoped edit.",
                whyItMatters: "The owner needs source changes.",
                expectedEvidenceDescription: "Changed-file refs.",
                status: "pending",
                blocking: true,
              },
            ],
          },
        }),
        requireCostAwareCapabilityPolicy: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        async evaluateMissionLedger(input) {
          const evaluation = parseMissionCommitmentEvaluation({
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            evaluationId: "cost-aware-implementation-evaluation",
            missionId: input.ledger.missionId,
            commitmentUpdates: [
              {
                commitmentId: "implementation",
                status: "satisfied",
                acceptedEvidenceRefs: input.outputArtifactRefs,
                rejectedEvidenceRefs: [],
                rationale:
                  "The model-authored evaluator accepted the scoped implementation evidence.",
                remainingWork: [],
              },
            ],
            revisionProposals: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          return applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: input.outputArtifactRefs,
          });
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.reasonCodes).toContain("orchestrator_decision_repaired");
      const costAwareReasonCodes = result.reasonCodes.filter((code) =>
        code.startsWith("cost_aware_node:"),
      );
      expect(costAwareReasonCodes.length).toBeGreaterThan(0);
      expect(new Set(costAwareReasonCodes).size).toBe(costAwareReasonCodes.length);
      expect(result.executedNodeIds).toEqual(["implementation-with-utility"]);
      expect(snapshot?.nodes[0]?.metadata).toMatchObject({
        costAwareReadback: expect.objectContaining({
          selectedCapabilityId: "implementation_microtask",
          costClass: "cheap",
        }),
      });
    });
  });

  it("emits node add and status callbacks for Work Queue child materialization", async () => {
    await withSchedulerGraph(async (graphs) => {
      const callbacks: Array<{ kind: string; nodeId: string; status?: string }> = [];
      const decisions = [
        {
          decisionId: "add-and-run-context",
          decisionKind: "request_context",
          rationaleForDecision: "Add and run context scout so callbacks have full lifecycle.",
          newNodes: [
            {
              nodeId: "context-callback",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Context refs.",
              acceptanceCriteria: ["Records bounded refs."],
              downstreamConsumer: "orchestrator",
            },
          ],
          runAfterAdd: true,
          runNodeId: "context-callback",
          reasonCodes: ["context_callback_needed"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Callback proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
        },
        async onNodeAdded(input) {
          callbacks.push({ kind: "added", nodeId: input.node.nodeId });
        },
        async onNodeStatusChanged(input) {
          callbacks.push({
            kind: "status",
            nodeId: input.node.nodeId,
            status: input.nodeStatus,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(callbacks).toEqual([
        { kind: "added", nodeId: "context-callback" },
        { kind: "status", nodeId: "context-callback", status: "running" },
        { kind: "status", nodeId: "context-callback", status: "succeeded" },
      ]);
    });
  });

  it("rejects capability nodes whose executor is not registered for this scheduler", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "add-web-research-without-executor",
              decisionKind: "add_nodes",
              rationaleForDecision: "This capability is known but not executable here.",
              newNodes: [
                {
                  nodeId: "research-1",
                  capabilityId: "web_research",
                  expectedOutput: "Research brief.",
                  acceptanceCriteria: ["Includes bounded citations."],
                  downstreamConsumer: "planning_capsule_draft",
                },
              ],
              reasonCodes: ["research_needed"],
            };
          },
        },
        executors: {},
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("node_executor_key_not_registered:kind:web_research");
      expect(result.reasonCodes).toContain("no_fallback_graph_injected");
    });
  });

  it("uses capability executor keys for specialized non-Codex nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-specialized-context-scout",
          decisionKind: "request_context",
          rationaleForDecision:
            "Use the non-Codex context scout executor instead of a generic role fallback.",
          newNodes: [
            {
              nodeId: "non-codex-context",
              capabilityId: "non_codex_context_scout",
              commitmentIdsAdvanced: ["context"],
              whyThisRoleIsNeededNow: "A cheap qualified scout should gather context first.",
              exactObjective: "Find bounded target refs.",
              evidenceExpectation: "Context handoff refs.",
              expectedOutput: "Context handoff.",
              acceptanceCriteria: ["Records context refs."],
              downstreamConsumer: "implementation_engineer",
              metadata: {
                taskFamily: "repo_context_scout",
                selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
                qualificationEvidenceRefs: [
                  ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
                ],
                stopOrEscalationCondition: "Escalate if context is insufficient.",
              },
            },
          ],
          runAfterAdd: true,
          runNodeId: "non-codex-context",
          reasonCodes: ["context_needed"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Specialized executor proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: {
            acceptedModelAuthoredCloseoutRef: "closeout://accepted/specialized-executor",
          },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: normalizeMissionContractLedger({
          missionId: "specialized-executor-mission",
          ownerObjectiveSummary: "Find context.",
          value: {
            blockingCommitments: [
              {
                commitmentId: "context",
                commitmentText: "Find context.",
                whyItMatters: "The implementation needs target refs.",
                expectedEvidenceDescription: "Context refs.",
                status: "pending",
                blocking: true,
              },
            ],
          },
        }),
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:non_codex_context_scout": succeededExecutor("non-codex-context"),
        },
        async evaluateMissionLedger(input) {
          const evaluation = parseMissionCommitmentEvaluation({
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            evaluationId: "context-evaluation",
            missionId: input.ledger.missionId,
            commitmentUpdates: [
              {
                commitmentId: "context",
                status: "satisfied",
                acceptedEvidenceRefs: input.outputArtifactRefs,
                rejectedEvidenceRefs: [],
                rationale: "The model-authored evaluator accepted the context handoff.",
                remainingWork: [],
              },
            ],
            revisionProposals: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          return applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: input.outputArtifactRefs,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["non-codex-context"]);
    });
  });

  it("rejects a first broad implementation node for complex missions", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return {
              decisionId: "do-everything-in-one-node",
              decisionKind: "add_nodes",
              rationaleForDecision: "Try one broad implementation node for the whole mission.",
              newNodes: [
                {
                  nodeId: "implementation-all",
                  capabilityId: "implementation_complex",
                  commitmentIdsAdvanced: ["code-edit", "validation"],
                  whyThisRoleIsNeededNow: "A worker is needed to edit and validate.",
                  exactObjective: "Implement the whole mission in one broad node.",
                  evidenceExpectation: "Changed-file and validation refs.",
                  expectedOutput: "All implementation evidence.",
                  acceptanceCriteria: ["Records code and validation evidence."],
                  downstreamConsumer: "reviewer",
                },
              ],
              reasonCodes: ["broad_first_try"],
            };
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
        },
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "complex_mission_requires_decomposition_before_broad_implementation",
      );
      expect(result.reasonCodes).toContain(
        "complex_mission_first_decision_requires_multi_node_decomposition",
      );
      expect(snapshot?.nodes).toHaveLength(0);
    });
  });

  it("requires commitment-to-node contracts for complex mission child nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return {
              decisionId: "missing-node-contracts",
              decisionKind: "add_nodes",
              rationaleForDecision: "Add multiple nodes but omit commitment contracts.",
              newNodes: [
                {
                  nodeId: "context-without-contract",
                  nodeKind: "context_scout",
                  assignedRole: "context_scout",
                  expectedOutput: "Context refs.",
                  acceptanceCriteria: ["Names files."],
                  downstreamConsumer: "implementation_engineer",
                },
                {
                  nodeId: "implementation-without-contract",
                  nodeKind: "implementation",
                  assignedRole: "implementation_engineer",
                  expectedOutput: "Changed-file refs.",
                  acceptanceCriteria: ["Records changed files."],
                  downstreamConsumer: "test_engineer",
                },
              ],
              reasonCodes: ["decompose_without_contracts"],
            };
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("node_commitment_ids_missing:context-without-contract");
      expect(result.reasonCodes).toContain(
        "node_role_rationale_missing:implementation-without-contract",
      );
      expect(result.reasonCodes).toContain("no_fallback_graph_injected");
    });
  });

  it("surfaces invalid evidence claims to the model-authored mission evaluator", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "claim-mission",
        ownerObjectiveSummary: "Run validation.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "validation",
              commitmentText: "Run validation.",
              whyItMatters: "Proof is required.",
              expectedEvidenceDescription: "Validation ref.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const reasonInputs: string[][] = [];
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "stop-after-claims",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after checking claim diagnostics.",
          reasonCodes: ["claim_diagnostics_checked"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://validation/actual"],
                evidenceClaims: [
                  {
                    commitmentId: "unknown-commitment",
                    evidenceRef: "artifact://validation/missing",
                    evidenceKind: "test_validation",
                    claimSummary: "Claims a validation result.",
                    limitations: [],
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  },
                ],
                reasonCodes: ["validation_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        async evaluateMissionLedger(input) {
          reasonInputs.push(input.reasonCodes);
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(reasonInputs[0]).toEqual(
        expect.arrayContaining([
          "evidence_claim_unknown_commitment:unknown-commitment",
          "evidence_claim_ref_missing:artifact://validation/missing",
        ]),
      );
      expect(reasonInputs[0]).not.toContain("evidence_claim_raw_storage_flag_invalid");
    });
  });

  it("reports evidence-claim raw-storage flag violations", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "claim-storage-mission",
        ownerObjectiveSummary: "Run validation.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "validation",
              commitmentText: "Run validation.",
              whyItMatters: "Proof is required.",
              expectedEvidenceDescription: "Validation ref.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const reasonInputs: string[][] = [];
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "stop-after-claims",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after checking claim diagnostics.",
          reasonCodes: ["claim_diagnostics_checked"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://validation/actual"],
                evidenceClaims: [
                  {
                    commitmentId: "validation",
                    evidenceRef: "artifact://validation/actual",
                    evidenceKind: "test_validation",
                    claimSummary: "Claims a validation result.",
                    limitations: [],
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: true as false,
                  },
                ],
                reasonCodes: ["validation_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        async evaluateMissionLedger(input) {
          reasonInputs.push(input.reasonCodes);
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(reasonInputs[0]).toContain("evidence_claim_raw_storage_flag_invalid");
    });
  });

  it("requires explicit evidence claims before Mission Ledger evaluation can close work", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "claim-required-mission",
        ownerObjectiveSummary: "Run validation.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "validation",
              commitmentText: "Run validation.",
              whyItMatters: "The owner asked for proof.",
              expectedEvidenceDescription: "Validation evidence claim.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      let evaluationCalls = 0;
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation is required to close the mission.",
              exactObjective: "Run the focused validation.",
              evidenceExpectation: "A validation evidence claim.",
              expectedOutput: "Validation evidence.",
              acceptanceCriteria: ["Records a validation ref."],
              downstreamConsumer: "mission_evaluator",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "stop-after-missing-claim",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "The node produced evidence without claims.",
          reasonCodes: ["missing_claim_checked"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        requireEvidenceClaimsForMissionLedger: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
        async evaluateMissionLedger(input) {
          evaluationCalls += 1;
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(evaluationCalls).toBe(0);
      expect(result.reasonCodes).toContain("mission_evidence_claims_required:validation-node");
      expect(result.reasonCodes).toContain(
        "mission_evidence_claim_missing_for_commitment:validation-node:validation",
      );
      expect(result.missionLedger?.openBlockingCommitmentCount).toBe(1);
    });
  });

  it("defers complex mission closeout when role diversity is missing", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-context-and-implementation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Decompose but run implementation first for this proof.",
          newNodes: [
            {
              nodeId: "context-planned",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "Context will be useful if implementation needs it.",
              exactObjective: "Identify target files.",
              evidenceExpectation: "Context refs.",
              expectedOutput: "Context refs.",
              acceptanceCriteria: ["Names target files."],
              downstreamConsumer: "implementation_engineer",
            },
            {
              nodeId: "implementation-only",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              commitmentIdsAdvanced: ["code-edit", "validation"],
              whyThisRoleIsNeededNow: "Implementation evidence is required.",
              exactObjective: "Make the code edit and report validation refs.",
              evidenceExpectation: "Source and validation refs.",
              expectedOutput: "Source and validation refs.",
              acceptanceCriteria: ["Records changed files and validation."],
              downstreamConsumer: "reviewer",
            },
          ],
          newEdges: [
            {
              fromNodeId: "context-planned",
              toNodeId: "implementation-only",
              edgeKind: "handoff",
              reasonCodes: ["context_to_implementation"],
            },
          ],
          runAfterAdd: true,
          runNodeId: "implementation-only",
          reasonCodes: ["decomposed_but_role_diversity_incomplete"],
        },
        {
          decisionId: "premature-closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Try to close after model accepts commitments.",
          reasonCodes: ["closeout_ready"],
        },
        {
          decisionId: "mark-review",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Role diversity still needs repair.",
          reasonCodes: ["role_diversity_needs_repair"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
        async evaluateMissionLedger(input) {
          const evaluation = parseMissionCommitmentEvaluation({
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            evaluationId: "implementation-evaluation",
            missionId: input.ledger.missionId,
            commitmentUpdates: input.ledger.blockingCommitments.map((commitment) => ({
              commitmentId: commitment.commitmentId,
              status: "satisfied",
              acceptedEvidenceRefs: input.outputArtifactRefs,
              rejectedEvidenceRefs: [],
              rationale: "The model-authored evaluator accepted the implementation evidence.",
              remainingWork: [],
            })),
            revisionProposals: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          return applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: input.outputArtifactRefs,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("complex_mission_role_diversity_insufficient");
      expect(result.reasonCodes).toContain(
        "role_coverage_missing:agent_team.coding.role_coverage.v1:context",
      );
      expect(result.reasonCodes).toContain(
        "role_coverage_missing:agent_team.coding.role_coverage.v1:validation_or_test",
      );
      expect(result.reasonCodes).toContain(
        "role_coverage_missing:agent_team.coding.role_coverage.v1:review",
      );
      expect(result.reasonCodes).toContain(
        "complex_mission_returned_to_orchestrator_for_role_coverage",
      );
    });
  });

  it("emits owner-readable progress for active graph nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      const progressEvents: unknown[] = [];
      const decisions = [
        {
          decisionId: "add-context-readable",
          decisionKind: "request_context",
          rationaleForDecision: "Context scout should produce visible progress.",
          newNodes: [
            {
              nodeId: "context-readable",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "The implementer needs target refs.",
              exactObjective: "Find the smallest relevant files for the implementation.",
              evidenceExpectation: "Context artifact with file refs.",
              expectedOutput: "Context refs.",
              acceptanceCriteria: ["Names target files."],
              downstreamConsumer: "implementation_engineer",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["context_needed"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Readable progress proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
        },
        async onProgress(input) {
          progressEvents.push(input);
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(progressEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "started",
            currentObjective: "Find the smallest relevant files for the implementation.",
            whyThisNodeWasChosen: "The implementer needs target refs.",
            activeNodeKind: "context_scout",
            modelRef: "deepseek/deepseek-v4-flash",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
            nextDecisionNeeded: "node_result",
          }),
          expect.objectContaining({
            status: "completed",
            evidenceProducedRefs: ["artifact://context/context-readable"],
            eli5Progress: "context_scout finished context_scout with 1 evidence ref(s).",
          }),
        ]),
      );
    });
  });

  it("passes the capability registry summary into orchestrator decisions", async () => {
    await withSchedulerGraph(async (graphs) => {
      const seenCapabilities: unknown[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        capabilityRegistrySummary: runtimeNodeCapabilityManifestForModel(),
        orchestrator: {
          async decide(input) {
            seenCapabilities.push(input.capabilityRegistrySummary);
            return {
              decisionId: "closeout-with-capabilities",
              decisionKind: "create_closeout",
              rationaleForDecision: "Capability manifest reached the orchestrator.",
              reasonCodes: ["capability_manifest_seen"],
              metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
            };
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(JSON.stringify(seenCapabilities[0])).toContain("implementation_microtask");
      expect(JSON.stringify(seenCapabilities[0])).toContain("test_authoring");
    });
  });

  it("pauses on human decision nodes selected by the orchestrator", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "ask-human",
              decisionKind: "request_human_decision",
              rationaleForDecision: "Owner scope decision is required before implementation.",
              newNodes: [
                {
                  nodeId: "human-1",
                  nodeKind: "human_task",
                  assignedRole: "human_operator",
                  modelOrWorkerRef: "human/operator",
                  expectedOutput: "Bounded owner decision.",
                  acceptanceCriteria: ["Decision ref is captured."],
                  downstreamConsumer: "orchestrator",
                },
              ],
              reasonCodes: ["human_scope_decision_required"],
            };
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("waiting_for_human");
      expect(snapshot?.nodes[0]).toMatchObject({
        nodeKind: "human_task",
        assignedRole: "human_operator",
        nodeStatus: "waiting_for_human",
      });
    });
  });

  it("returns premature closeout to the orchestrator while mission commitments remain open", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "mission-scheduler-open",
        ownerObjectiveSummary: "Edit code, validate it, and document the result.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "code-edit",
              commitmentText: "Edit the requested code.",
              whyItMatters: "Owner asked for implementation.",
              expectedEvidenceDescription: "Changed-file refs.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const decisions = [
        {
          decisionId: "premature-closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Closeout was requested too early.",
          reasonCodes: ["premature_closeout"],
        },
        {
          decisionId: "mark-review-after-open-commitment",
          decisionKind: "mark_needs_review",
          rationaleForDecision:
            "The orchestrator cannot satisfy the open commitment in this lane proof.",
          reasonCodes: ["mission_contract_open_after_closeout_deferral"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide(input) {
            expect(input.missionLedgerSummary?.openBlockingCommitmentCount).toBe(1);
            return decisions.shift();
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("mission_contract_blocking_commitments_open");
      expect(result.reasonCodes).toContain(
        "mission_contract_returned_to_orchestrator_for_more_work",
      );
      expect(result.missionLedger?.openBlockingCommitmentCount).toBe(1);
    });
  });

  it("allows closeout after model evaluation satisfies blocking commitments", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "mission-scheduler-closed",
        ownerObjectiveSummary: "Run validation and close out.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "validation",
              commitmentText: "Run validation.",
              whyItMatters: "Owner asked for proof.",
              expectedEvidenceDescription: "Validation artifact ref.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
            },
          ],
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "run-validation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the validation node.",
          runNodeId: "validation-node",
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Blocking commitment is satisfied.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/test" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
        async evaluateMissionLedger(input) {
          const evaluation = parseMissionCommitmentEvaluation({
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            evaluationId: "validation-evaluation",
            missionId: input.ledger.missionId,
            commitmentUpdates: [
              {
                commitmentId: "validation",
                status: "satisfied",
                acceptedEvidenceRefs: input.outputArtifactRefs,
                rejectedEvidenceRefs: [],
                rationale: "The model-authored evaluator accepted the validation ref.",
                remainingWork: [],
              },
            ],
            revisionProposals: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          return applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: input.outputArtifactRefs,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.missionLedger?.openBlockingCommitmentCount).toBe(0);
    });
  });

  it("returns recoverable node failures to orchestrator repair while commitments remain open", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "recoverable-failure-mission",
        ownerObjectiveSummary: "Run validation, repair failures, and close out.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "validation",
              commitmentText: "Run validation.",
              whyItMatters: "Owner asked for proof.",
              expectedEvidenceDescription: "Validation artifact ref.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "request_validation",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
            },
          ],
          runAfterAdd: true,
          runNodeId: "validation-node",
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "mark-review-after-validation-failure",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "The validation failure was returned for repair planning.",
          reasonCodes: ["validation_failure_reviewed"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:test_engineer": {
            async execute() {
              return {
                status: "failed",
                outputArtifactRefs: ["artifact://validation/failing-test"],
                reasonCodes: ["validation_failed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("node_failure_returned_to_orchestrator_for_repair");
      expect(result.reasonCodes).toContain("validation_failure_reviewed");
    });
  });

  it("halts repeated same-kind nodes when evidence and mission progress do not advance", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-implementation-1",
          decisionKind: "add_nodes",
          rationaleForDecision: "Try the first implementation node.",
          newNodes: [
            {
              nodeId: "implementation-1",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "worker://kimi",
              targetRefs: ["src/readback.ts"],
              expectedOutput: "Source edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["implementation_needed"],
        },
        {
          decisionId: "add-implementation-2",
          decisionKind: "add_nodes",
          rationaleForDecision: "Retry the same implementation shape without new evidence.",
          newNodes: [
            {
              nodeId: "implementation-2",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "worker://kimi",
              targetRefs: ["src/readback.ts"],
              expectedOutput: "Source edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["implementation_retry"],
        },
        {
          decisionId: "add-implementation-3",
          decisionKind: "add_nodes",
          rationaleForDecision: "Retry the same implementation shape again.",
          newNodes: [
            {
              nodeId: "implementation-3",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "worker://kimi",
              targetRefs: ["src/readback.ts"],
              expectedOutput: "Source edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["implementation_retry_again"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:implementation_engineer": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://same-implementation-ref"],
                reasonCodes: ["same_evidence_ref"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("scheduler_same_kind_loop_guard_triggered");
      expect(result.executedNodeIds).toEqual([
        "implementation-1",
        "implementation-2",
        "implementation-3",
      ]);
    });
  });
});
