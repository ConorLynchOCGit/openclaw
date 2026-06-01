import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository, type JsonValue } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverseManifest,
  buildResourceObjectiveFocusManifest,
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";
import {
  applyMissionCommitmentEvaluation,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
} from "./mission-contract-ledger.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  runtimeNodeCapabilityManifestForModel,
} from "./runtime-node-capability-registry.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import {
  RuntimeWorkGraphScheduler,
  type RuntimeWorkGraphSchedulerDecisionInput,
  type RuntimeWorkGraphNodeExecutor,
  type RuntimeWorkGraphSchedulerOptions,
} from "./runtime-work-graph-scheduler.ts";
import { registerSchedulerRuntimeTools } from "./scheduler-runtime-tools.ts";
import { requireCanonicalWorkflowDefinition } from "./workflow-definition-registry.ts";

function modelAuthoredNodeId(node: { nodeId: string; metadata?: unknown }): string {
  const metadata =
    node.metadata && typeof node.metadata === "object"
      ? (node.metadata as Record<string, unknown>)
      : {};
  return typeof metadata.modelAuthoredNodeId === "string"
    ? metadata.modelAuthoredNodeId
    : node.nodeId;
}

function acceptedRuntimeSchedulerFocus(input: {
  graphId: string;
  nodeId: string;
  targetRef: string;
}) {
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: input.graphId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    consumerNodeId: input.nodeId,
    workIntentRef: `work-intent://${input.graphId}/${input.nodeId}`,
    nodeExecutionContractRef: `node-contract://${input.graphId}/${input.nodeId}`,
    refs: [
      {
        ref: input.targetRef,
        kind: input.targetRef.startsWith("file-window://") ? "bounded_file_window" : "target_ref",
        boundedLabel: input.targetRef,
        authorityScopeRefs: [input.targetRef],
      },
    ],
    maxSelectableHandles: 2,
    maxSemanticQuestions: 2,
  });
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: input.graphId,
    workflowId: "agent_team.coding",
    graphId: input.graphId,
    consumerNodeId: input.nodeId,
    workIntentRef: `work-intent://${input.graphId}/${input.nodeId}`,
    nodeExecutionContractRef: `node-contract://${input.graphId}/${input.nodeId}`,
    currentObjectiveSlot: "worker precondition context",
    resourceUseKind: "resource_grounding",
    nextUnknown: "Which bounded source window is required before worker execution?",
    expectedUse: "Open node-local node resource demand for the selected source file.",
    legalRefUniverse,
    selectedRefHandles: [legalRefUniverse.handles[0]!.handle],
    selectedSemanticQuestions: ["What current source window is required before editing?"],
  });
  return {
    focus,
    legalRefUniverse,
    metadata: {
      resourceObjectiveFocusRef: focus.focusRef,
      resourceObjectiveFocusStatus: focus.status,
      resourceObjectiveFocusManifest: buildResourceObjectiveFocusManifest(focus),
      resourceObjectiveFocusLegalRefUniverseRef: legalRefUniverse.legalRefUniverseRef,
      resourceObjectiveFocusLegalRefUniverseManifest:
        buildResourceObjectiveFocusLegalRefUniverseManifest(legalRefUniverse),
      resourceObjectiveFocusLegalHandleOptionStrings: legalRefUniverse.handles.map((handle) =>
        [handle.handle, handle.kind, handle.ref, handle.boundedLabel].join("\t"),
      ),
      resourceObjectiveFocusSelectedRefHandles: focus.selectedRefHandles,
      resourceObjectiveFocusSelectedSemanticQuestions: focus.selectedSemanticQuestions,
      resourceObjectiveFocusCurrentObjectiveSlot: focus.currentObjectiveSlot,
      resourceObjectiveFocusResourceUseKind: focus.resourceUseKind,
      resourceObjectiveFocusNextUnknown: focus.nextUnknown,
      resourceObjectiveFocusExpectedUse: focus.expectedUse,
      resourceObjectiveFocusStopWhenAnswered: focus.stopWhenAnswered,
    },
  };
}

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

function independentRootFixtureMetadata(
  rationale: string,
  metadata: Record<string, JsonValue> = {},
): Record<string, JsonValue> {
  return {
    independentRoot: true,
    independentRootRationale: rationale,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    ...metadata,
  } satisfies JsonValue;
}

function independentValidationFixtureMetadata(
  rationale: string,
  metadata: Record<string, JsonValue> = {},
): Record<string, JsonValue> {
  return independentRootFixtureMetadata(rationale, {
    validationPhase: "final_proof_validation",
    ...metadata,
  });
}

function productSpecEntryNodePolicy() {
  return requireCanonicalWorkflowDefinition("agent_team.product_spec_planning").orchestrationPolicy
    .entryNodePolicy;
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
  it("marks max-iteration terminal stops as needs_review instead of failed", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 0,
        orchestrator: {
          async decide() {
            throw new Error("orchestrator_should_not_run_after_zero_iteration_budget");
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("max_iterations");
      expect(result.reasonCodes).toContain("scheduler_max_iterations_reached");
      expect(snapshot?.graph.graphStatus).toBe("needs_review");
      expect(snapshot?.graph.metadata).toMatchObject({
        terminalSchedulerStatus: "max_iterations",
      });
    });
  });

  it("accepts manifest-backed resource packet refs without storing full payloads in graph metadata", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-with-payload-refs",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        inputHandoffRefs: ["resource-handoff://accepted"],
        outputArtifactRefs: [],
        metadata: {
          capabilityId: "implementation_microtask",
          targetRefs: ["extensions/execution-platform/src/workflows/index.ts"],
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Attempt implementation with payload-backed resource refs.",
          nodeExecutionContractRef: "node-execution-contract://implementation-with-payload-refs",
          nodeExecutionContractHash: "sha256:implementation-with-payload-refs-contract",
          nodeExecutionPacketRef: "node-execution-packet://implementation-with-payload-refs",
          nodeExecutionPacketHash: "sha256:implementation-with-payload-refs-packet",
          resourcePacketRef: "coding-resource-packet://implementation-with-payload-refs",
          resourcePacketHash: "sha256:implementation-with-payload-refs-resource",
          nodeReadinessStateRef: "node-readiness-state://implementation-with-payload-refs",
          nodeReadinessStatus: "ready",
          nodeReadinessPhase: "implementation_ready",
          nodeReadinessNextAllowedTransitions: ["execute_node"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      let executed = false;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        requireNodeExecutionPacketForWorkerExecution: true,
        orchestrator: {
          async decide() {
            return {
              decisionId: "run-implementation-with-payload-refs",
              decisionKind: "run_node",
              rationaleForDecision: "Run the implementation node after resource materialization.",
              runNodeId: "implementation-with-payload-refs",
              reasonCodes: ["run_implementation"],
            };
          },
        },
        executors: {
          "role:implementation_engineer": {
            async execute() {
              executed = true;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://implementation-with-payload-refs"],
                reasonCodes: ["implementation_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        maxIterations: 3,
      });

      const result = await scheduler.run("scheduler-graph");

      expect(executed).toBe(true);
      expect(result.executedNodeIds).toContain("implementation-with-payload-refs");
      expect(result.reasonCodes).not.toContain("node_execution_packet_missing");
    });
  });

  it("starts implementation workers with partial context instead of scheduler pre-worker resource gates", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-worker-owned-context",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        inputHandoffRefs: [],
        outputArtifactRefs: [],
        metadata: {
          capabilityId: "implementation_microtask",
          targetRefs: ["extensions/execution-platform/src/workflows/index.ts"],
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Start implementation and request context inside the worker loop.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      let executed = false;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        requireNodeExecutionPacketForWorkerExecution: true,
        orchestrator: {
          async decide() {
            return {
              decisionId: "run-worker-owned-context-node",
              decisionKind: "run_node",
              rationaleForDecision: "Run the implementation worker directly.",
              runNodeId: "implementation-worker-owned-context",
              reasonCodes: ["run_implementation"],
            };
          },
        },
        executors: {
          "role:implementation_engineer": {
            async execute() {
              executed = true;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://implementation-worker-owned-context"],
                reasonCodes: ["implementation_worker_started_with_partial_context"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        maxIterations: 3,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const node = snapshot?.nodes.find(
        (candidate) => candidate.nodeId === "implementation-worker-owned-context",
      );

      if (!executed) {
        throw new Error(JSON.stringify(result, null, 2));
      }
      expect(executed).toBe(true);
      expect(result.executedNodeIds).toContain("implementation-worker-owned-context");
      expect((node?.metadata as Record<string, unknown>)?.nodeLifecycleProjectionGate).toBe(
        "worker_action_ready",
      );
      expect(result.reasonCodes).not.toContain("resource_objective_focus_required");
      expect(result.reasonCodes).not.toContain("node_resource_demand_required");
      expect(result.reasonCodes).not.toContain(
        "node_local_node_resource_demand_required_before_execution",
      );
    });
  });

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

      expect(result.status).toBe("needs_review");
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
              metadata: independentValidationFixtureMetadata(
                "This scheduler mechanics fixture intentionally runs validation as an independent root.",
              ),
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

      if (result.status !== "succeeded") {
        throw new Error(JSON.stringify(result, null, 2));
      }
      expect(result.executedNodeIds).toEqual(["validation-first"]);
      expect(snapshot?.nodes.map((node) => node.assignedRole)).toEqual(["test_engineer"]);
      expect(snapshot?.nodes[0]?.nodeStatus).toBe("succeeded");
    });
  });

  it("reuses already-created node ids when a later graph revision repeats them", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Create a validation node before implementation.",
          newNodes: [
            {
              nodeId: "shared-validation",
              nodeKind: "reviewer",
              capabilityId: "reviewer",
              executorKey: "role:test_engineer",
              requiredMetadataSchemaRef: "schema://runtime-node/review",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Records validation refs."],
              downstreamConsumer: "implementation-after-validation",
              metadata: {
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            },
          ],
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "run-validation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the validation node.",
          runNodeId: "shared-validation",
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "extend-after-validation",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Extend the graph after validation while preserving the existing validation node id.",
          newNodes: [
            {
              nodeId: "shared-validation",
              nodeKind: "reviewer",
              capabilityId: "reviewer",
              executorKey: "role:test_engineer",
              requiredMetadataSchemaRef: "schema://runtime-node/review",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Existing validation refs.",
              acceptanceCriteria: ["Already recorded validation refs."],
              downstreamConsumer: "implementation-after-validation",
              metadata: {
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            },
            {
              nodeId: "implementation-after-validation",
              nodeKind: "reviewer",
              capabilityId: "reviewer",
              executorKey: "role:test_engineer",
              requiredMetadataSchemaRef: "schema://runtime-node/review",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "kimi/k2",
              inputHandoffRefs: ["shared-validation"],
              expectedOutput: "Implementation refs.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "A second review fixture follows the completed review node.",
              exactObjective: "Run the bounded second review fixture.",
              metadata: {
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            },
          ],
          newEdges: [
            {
              fromNodeId: "shared-validation",
              toNodeId: "implementation-after-validation",
              edgeKind: "handoff",
              reasonCodes: ["validation_before_implementation"],
            },
          ],
          reasonCodes: ["implementation_after_validation"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the implementation node.",
          runNodeId: "implementation-after-validation",
          reasonCodes: ["run_implementation"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "The lane proof has accepted runtime evidence.",
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

      if (result.status !== "succeeded") {
        throw new Error(JSON.stringify(result, null, 2));
      }
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(
        expect.arrayContaining(["shared-validation", "implementation-after-validation"]),
      );
      expect(snapshot?.nodes).toHaveLength(2);
      expect(snapshot?.nodes.find((node) => node.nodeId === "shared-validation")?.nodeStatus).toBe(
        "succeeded",
      );
    });
  });

  it("reuses duplicate node ids inside a graph revision instead of failing the scheduler", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-duplicate-implementation",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "The model repeated the same implementation node while revising the graph.",
          newNodes: [
            {
              nodeId: "implementation-duplicate",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "kimi/k2",
              expectedOutput: "Implementation refs.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              metadata: independentRootFixtureMetadata(
                "Duplicate implementation node fixture is an independent executable root after de-duplication.",
              ),
            },
            {
              nodeId: "implementation-duplicate",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "kimi/k2",
              expectedOutput: "Implementation refs.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              metadata: independentRootFixtureMetadata(
                "Duplicate implementation node fixture is an independent executable root after de-duplication.",
              ),
            },
          ],
          reasonCodes: ["implementation_node_repeated"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the implementation node.",
          runNodeId: "implementation-duplicate",
          reasonCodes: ["run_implementation"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "The lane proof has accepted runtime evidence.",
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
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(["implementation-duplicate"]);
      expect(snapshot?.nodes).toHaveLength(1);
    });
  });

  it("traces scheduler decomposition, selection, worker execution, and closeout through runtime tools", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const graphs = new RuntimeWorkGraphRepository(database.sql, {
        now: () => new Date("2026-05-14T00:00:00.000Z"),
      });
      const jobs = new RuntimeJobRepository(database.sql, {
        now: () => new Date("2026-05-14T00:00:00.000Z"),
      });
      await jobs.enqueueJob({
        jobId: "scheduler-tool-root-job",
        jobType: "executor.agent_team",
        idempotencyScope: "runtime-work-graph-scheduler-test",
        idempotencyKey: "scheduler-tool-root-job",
      });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const kernel = new RuntimeToolKernel({ registry, traces });
      await graphs.createGraph({
        graphId: "scheduler-tool-graph",
        rootRuntimeJobId: "scheduler-tool-root-job",
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
              capabilityId: "implementation_microtask",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "moonshotai/kimi-k2.6",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["Records source-change evidence."],
              downstreamConsumer: "validation-1",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "The implementation commitment needs source changes.",
              exactObjective: "Make the bounded implementation edit.",
              evidenceExpectation: "source_change",
              metadata: {
                ...independentRootFixtureMetadata(
                  "This conflict-frontier fixture intentionally starts implementation A as a root.",
                ),
                taskFamily: "small_source_edit",
                stopOrEscalationCondition: "Escalate if the scoped edit fails.",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: [
                  ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
                ],
              },
            },
            {
              nodeId: "validation-1",
              nodeKind: "validation",
              capabilityId: "validation_run",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Records test validation evidence."],
              downstreamConsumer: "closeout",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation must run after implementation.",
              exactObjective: "Run focused validation.",
              evidenceExpectation: "test_validation",
              metadata: {
                validationPhase: "integration_validation",
              },
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
        budgetPolicyRef?: string | null;
        runtimeToolTimeoutMs?: number | null;
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
          "role:orchestrator": succeededExecutor("orchestrator"),
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          progress.push({
            schedulerToolId: event.schedulerToolId,
            schedulerPhase: event.schedulerPhase,
            refs: event.schedulerToolInvocationRefs,
            budgetPolicyRef: event.budgetPolicyRef,
            runtimeToolTimeoutMs: event.runtimeToolTimeoutMs,
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
      expect(toolIds).toContain("scheduler.mission_ledger_readiness");
      expect(toolIds).toContain("scheduler.draft_work_breakdown");
      expect(toolIds).toContain("scheduler.review_work_breakdown");
      expect(toolIds).toContain("scheduler.propose_decomposition_outline");
      expect(toolIds).toContain("scheduler.map_commitments_to_work_units");
      expect(toolIds).toContain("scheduler.shortlist_capabilities_for_work_units");
      expect(toolIds).toContain("scheduler.select_capability_for_work_unit");
      expect(toolIds).toContain("scheduler.shortlist_capabilities");
      expect(toolIds).toContain("scheduler.select_capabilities");
      expect(toolIds).toContain("scheduler.define_node_contract");
      expect(toolIds).toContain("scheduler.define_edges_or_parallelism");
      expect(toolIds).toContain("scheduler.compile_staged_runtime_graph");
      expect(toolIds).toContain("scheduler.finalize_decomposition_graph");
      expect(toolIds).toContain("scheduler.review_compiled_graph");
      expect(toolIds).toContain("scheduler.create_graph_node");
      expect(toolIds).toContain("scheduler.create_graph_edge");
      expect(toolIds).toContain("scheduler.accept_staged_graph");
      expect(toolIds).toContain("scheduler.record_node_transition");
      expect(toolIds).toContain("scheduler.promote_work_intent_to_executable");
      expect(toolIds).toContain("scheduler.open_executable_frontier");
      expect(toolIds).not.toContain("scheduler.approve_and_run_first_node");
      expect(toolIds).toContain("scheduler.select_next_node");
      expect(toolIds).toContain("scheduler.review_node_result");
      expect(toolIds).toContain("worker.invoke");
      const workerInvocations = invocations.filter(
        (invocation) => invocation.toolId === "worker.invoke",
      );
      expect(workerInvocations.map((invocation) => invocation.budgetSummary)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            timeoutMs: 1_800_000,
            budgetRef: "runtime-task-budget://agent_team.coding/implementation_microtask/complex",
          }),
          expect.objectContaining({
            timeoutMs: 900_000,
            budgetRef: "runtime-task-budget://agent_team.coding/validation_run/standard",
          }),
        ]),
      );
      expect(toolIds).toContain("scheduler.create_closeout_request");
      expect(toolIds).toContain("scheduler.evaluate_closeout_readiness");
      expect(toolIds).toContain("scheduler.evaluate_completion_readiness");
      expect(toolIds).not.toContain("scheduler.decompose_mission");
      expect(toolIds.filter((toolId) => toolId === "scheduler.select_next_node")).toHaveLength(2);
      expect(
        toolIds.filter((toolId) => toolId === "scheduler.create_closeout_request"),
      ).toHaveLength(1);
      expect(invocations.every((invocation) => invocation.runtimeJobId)).toBe(true);
      expect(new Set(invocations.map((invocation) => invocation.runtimeJobId))).toEqual(
        new Set(["scheduler-tool-root-job"]),
      );
      expect(progress.some((event) => event.schedulerToolId === "worker.invoke")).toBe(true);
      expect(
        progress.some(
          (event) =>
            event.schedulerToolId === "scheduler.draft_work_breakdown" &&
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
      expect(
        progress.some(
          (event) =>
            event.budgetPolicyRef?.startsWith("runtime-task-budget://") &&
            (event.runtimeToolTimeoutMs ?? 0) > 120_000,
        ),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("uses runtime-owned graph-scoped node ids for staged scheduler nodes across replays", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      await graphs.createGraph({
        graphId: "replay-graph-a",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      await graphs.createGraph({
        graphId: "replay-graph-b",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      const run = async (graphId: string) => {
        const scheduler = new RuntimeWorkGraphScheduler({
          graphs,
          orchestrator: {
            async decide(input) {
              return input.iteration === 1
                ? {
                    decisionId: "same-staged-decision",
                    decisionKind: "add_nodes",
	                    rationaleForDecision: "Add the same staged validation node in each replay.",
                    runAfterAdd: false,
                    metadata: {
                      stagedSchedulerProtocolCompiled: true,
                      parallelIndependentNodesJustification:
                        "This replay-id test persists a single context node only.",
                    },
                    newNodes: [
                      {
	                        nodeId: "validation-wu-product-spec-planning-runtime-map",
	                        nodeKind: "validation",
	                        capabilityId: "validation_run",
	                        executorKey: "kind:validation",
	                        workerRef: "deterministic_validation_lane",
	                        requiredMetadataSchemaRef: "schema://runtime-node/validation",
	                        assignedRole: "test_engineer",
	                        modelOrWorkerRef: "deterministic_validation_lane",
	                        expectedOutput: "Validation handoff packet.",
	                        acceptanceCriteria: ["Records bounded validation status."],
	                        downstreamConsumer: "scheduler",
	                        commitmentIdsAdvanced: ["context"],
	                        whyThisRoleIsNeededNow: "Validation is required for replay-id stability.",
	                        exactObjective: "Record replay-id validation evidence.",
	                        metadata: {
	                          ...independentValidationFixtureMetadata(
	                            "This replay-id fixture persists one independent validation root.",
	                          ),
	                          stagedSchedulerProtocolCompiled: true,
	                          expectedEvidence: ["validation_evidence"],
	                          expectedEvidenceSource: "runtime_derived_from_capability_manifest",
	                          rawPromptStored: false,
                          rawResponseStored: false,
                          rawProviderLogStored: false,
                        },
                      },
                    ],
                    reasonCodes: ["staged_context_first"],
                  }
                : {
                    decisionId: "stop",
                    decisionKind: "mark_needs_review",
                    rationaleForDecision: "Stop after node creation for the replay-id test.",
                    reasonCodes: ["test_stop_after_node_creation"],
                  };
            },
	          },
	          executors: {
	            "kind:validation": succeededExecutor("validation"),
	          },
        });
        return scheduler.run(graphId);
      };

      await run("replay-graph-a");
      await run("replay-graph-b");

      const first = await graphs.readGraphSnapshot("replay-graph-a");
      const second = await graphs.readGraphSnapshot("replay-graph-b");
      expect(first?.nodes).toHaveLength(1);
      expect(second?.nodes).toHaveLength(1);
      expect(first?.nodes[0]?.nodeId).not.toEqual(second?.nodes[0]?.nodeId);
      expect(first?.nodes[0]?.metadata).toEqual(
        expect.objectContaining({
	          modelAuthoredNodeId: "validation-wu-product-spec-planning-runtime-map",
          runtimeOwnedNodeId: true,
        }),
      );
      expect(second?.nodes[0]?.metadata).toEqual(
        expect.objectContaining({
	          modelAuthoredNodeId: "validation-wu-product-spec-planning-runtime-map",
          runtimeOwnedNodeId: true,
        }),
      );
    } finally {
      await database.close();
    }
  });

  it("records valid-but-policy-rejected decisions as runtime tool traces", async () => {
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
        graphId: "scheduler-reject-trace-graph",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        runtimeToolKernel: kernel,
        requireSchedulerToolKernel: true,
        requireGenericStagedSchedulerProtocol: true,
        maxDecisionRepairAttempts: 0,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return {
              decisionId: "flat-decomposition-rejected",
              decisionKind: "add_nodes",
              rationaleForDecision: "Two nodes but no dependency edge or parallel rationale.",
              newNodes: [
                {
                  nodeId: "implementation-flat",
                  capabilityId: "implementation_microtask",
                  commitmentIdsAdvanced: ["code-edit"],
                  whyThisRoleIsNeededNow: "Implementation is needed.",
                  exactObjective: "Edit target files.",
                  evidenceExpectation: "Changed-file refs.",
                  expectedOutput: "Changed-file refs.",
                  acceptanceCriteria: ["Records changed files."],
                  downstreamConsumer: "test_engineer",
                },
                {
                  nodeId: "validation-flat",
                  nodeKind: "validation",
                  assignedRole: "test_engineer",
                  commitmentIdsAdvanced: ["validation"],
                  whyThisRoleIsNeededNow: "Validation is needed.",
                  exactObjective: "Run validation.",
                  evidenceExpectation: "Validation refs.",
                  expectedOutput: "Validation refs.",
                  acceptanceCriteria: ["Runs tests."],
                  downstreamConsumer: "orchestrator",
                },
              ],
              reasonCodes: ["flat_decomposition"],
            };
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-reject-trace-graph");
      const invocations = await traces.listInvocations({
        graphId: "scheduler-reject-trace-graph",
        limit: 20,
      });
      const rejectInvocation = invocations.find(
        (invocation) => invocation.toolId === "scheduler.reject_staged_graph",
      );

      expect(["needs_review", "max_iterations"]).toContain(result.status);
      expect(rejectInvocation).toBeTruthy();
      expect(rejectInvocation?.metadata).toMatchObject({
        decisionId: "flat-decomposition-rejected",
        repairFieldHints: expect.arrayContaining([
          "scheduler.work_intent.accept_roots for independent non-runnable WorkIntent roots",
          "stagedScheduler.edgeOrParallelismDraft.parallelIndependentNodesJustification",
        ]),
        repairDiagnostics: expect.objectContaining({
          missingFields: expect.arrayContaining([
            expect.objectContaining({
              path:
                "stagedScheduler.edgeOrParallelismDraft.parallelIndependentNodesJustification or stagedScheduler.edgeOrParallelismDraft.edges[]",
            }),
          ]),
        }),
      });
    } finally {
      await database.close();
    }
  });

  it("terminalizes graph status when scheduler returns needs_review", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "bare-closeout",
              decisionKind: "create_closeout",
              rationaleForDecision: "No accepted closeout evidence exists.",
              reasonCodes: ["bare_closeout"],
            };
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(["needs_review", "max_iterations"]).toContain(result.status);
      expect(snapshot?.graph.graphStatus).toBe("needs_review");
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toContain(
        "scheduler_terminal_needs_review",
      );
    });
  });

  it("enforces workflow entry-node policy before child execution", async () => {
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
        entryNodePolicy: productSpecEntryNodePolicy(),
      });

      const result = await scheduler.run("scheduler-graph");

      expect(["needs_review", "max_iterations"]).toContain(result.status);
      expect(result.executedNodeIds).toEqual([]);
      expect(result.reasonCodes).toContain("workflow_entry_node_policy_initial_node_missing");
      expect(result.reasonCodes).toContain(
        "workflow_entry_node_policy_run_after_add_target_invalid",
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
        entryNodePolicy: productSpecEntryNodePolicy(),
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

  it("stores symbolic future edge endpoints as metadata instead of writing invalid DB foreign keys", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-symbolic-edge",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Create a validation node while pointing to a future closeout milestone.",
          newNodes: [
            {
              nodeId: "validation-1",
              nodeKind: "review",
              capabilityId: "reviewer",
              executorKey: "role:test_engineer",
              requiredMetadataSchemaRef: "schema://runtime-node/review",
              assignedRole: "test_engineer",
              expectedOutput: "Validation evidence.",
              acceptanceCriteria: ["Records validation refs."],
              downstreamConsumer: "review",
              metadata: {
                stagedSchedulerProtocolCompiled: true,
                expectedEvidence: ["review_evidence"],
                expectedEvidenceSource: "runtime_derived_from_capability_manifest",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            },
          ],
          newEdges: [
            {
              fromNodeId: "validation-1",
              toNodeId: "future-validation-review-closeout",
              edgeKind: "handoff",
              reasonCodes: ["future_validation_milestone"],
            },
          ],
          runAfterAdd: true,
          runNodeId: "validation-1",
          reasonCodes: ["symbolic_future_milestone"],
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Symbolic edge endpoint was stored without FK failure.",
          reasonCodes: ["symbolic_edge_proven"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/symbolic-edge" },
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
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const symbolicEdge = snapshot?.edges.find(
        (edge) =>
          edge.metadata &&
          typeof edge.metadata === "object" &&
          !Array.isArray(edge.metadata) &&
          edge.metadata.symbolicToNodeId === "future-validation-review-closeout",
      );

      expect(result.status).toBe("succeeded");
      if (symbolicEdge) {
        expect(symbolicEdge.toNodeId).toBeNull();
        expect(symbolicEdge.metadata).toMatchObject({
          symbolicToNodeId: "future-validation-review-closeout",
          runtimeOwnedEdgeId: true,
        });
      }
    });
  });

  it("allows repeated role calls and mid-run graph expansion", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-validation-1",
          decisionKind: "add_nodes",
          rationaleForDecision: "First validation pass should establish baseline evidence.",
          newNodes: [
            {
              nodeId: "validation-1",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Baseline validation refs.",
              acceptanceCriteria: ["Records baseline validation."],
              downstreamConsumer: "orchestrator",
              metadata: {
                ...independentRootFixtureMetadata(
                  "This validation-only mission starts with final proof validation as its executable root.",
                ),
                validationPhase: "final_proof_validation",
              },
            },
          ],
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "run-validation-1",
          decisionKind: "run_node",
          rationaleForDecision: "Run first validation.",
          runNodeId: "validation-1",
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "add-validation-2",
          decisionKind: "rerun_role",
          rationaleForDecision: "A sharper second validation is needed after the first output.",
          newNodes: [
            {
              nodeId: "validation-2",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              inputHandoffRefs: ["runtime-work-graph://node/validation-1"],
              expectedOutput: "Sharper validation refs.",
              acceptanceCriteria: ["Cites concrete validation evidence."],
              downstreamConsumer: "orchestrator",
              metadata: independentValidationFixtureMetadata(
                "This validation-only rerun fixture treats the second validation pass as an independent final proof root.",
              ),
            },
          ],
          newEdges: [
            {
              fromNodeId: "validation-1",
              toNodeId: "validation-2",
              edgeKind: "continuation",
              reasonCodes: ["sharper_validation_needed"],
            },
          ],
          reasonCodes: ["rerun_validation"],
        },
        {
          decisionId: "run-validation-2",
          decisionKind: "run_node",
          rationaleForDecision: "Run second validation.",
          runNodeId: "validation-2",
          reasonCodes: ["run_validation_again"],
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
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.executedNodeIds).toEqual(["validation-1", "validation-2"]);
      expect(snapshot?.nodes.filter((node) => node.assignedRole === "test_engineer")).toHaveLength(
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
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(["needs_review", "max_iterations"]).toContain(result.status);
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
          decisionId: "add-validation-after-repair",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "The first decision missed required fields, so add a concrete validation node.",
          newNodes: [
            {
              nodeId: "validation-after-repair",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Concrete validation refs.",
              acceptanceCriteria: ["Returns bounded validation refs."],
              downstreamConsumer: "orchestrator",
              metadata: independentValidationFixtureMetadata(
                "This scheduler repair fixture validates repair flow, not worker ordering.",
              ),
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
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(result.reasonCodes).toContain("orchestrator_decision_repaired");
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(["validation-after-repair"]);
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
          decisionId: "repair-with-validation-capability",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Repair the structural error by selecting the validation capability.",
          newNodes: [
            {
              nodeId: "validation-after-diagnostic",
              capabilityId: "validation_run",
              expectedOutput: "Concrete validation refs.",
              acceptanceCriteria: ["Names bounded validation refs."],
              downstreamConsumer: "orchestrator",
              metadata: independentValidationFixtureMetadata(
                "This structural repair fixture validates node diagnostics, not worker ordering.",
              ),
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
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(snapshot?.nodes[0]).toMatchObject({
        nodeId: "validation-after-diagnostic",
        nodeKind: "validation",
        assignedRole: "test_engineer",
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
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
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
                  executorKey: "kind:implementation",
                  workerRef: "worker.codex.parity-runtime-adapter",
                  requiredMetadataSchemaRef:
                    "schema://runtime-work-graph/node-metadata/implementation-complex.v2",
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
      expect(result.reasonCodes).toContain("complex_mission_requires_staged_scheduler_protocol");
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
                  nodeId: "implementation-flat",
                  nodeKind: "implementation",
                  assignedRole: "implementation_engineer",
                  commitmentIdsAdvanced: ["code-edit"],
                  whyThisRoleIsNeededNow: "Implementation is needed.",
                  exactObjective: "Edit target files.",
                  evidenceExpectation: "Changed-file refs.",
                  expectedOutput: "Changed-file refs.",
                  acceptanceCriteria: ["Records changed files."],
                  downstreamConsumer: "test_engineer",
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
          "kind:implementation": succeededExecutor("implementation"),
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "graph_multi_node_zero_edge_independent_roots_missing",
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
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
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
                ...independentRootFixtureMetadata(
                  "This conflict-frontier fixture intentionally starts implementation B as a root.",
                ),
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

  it("derives run-node utility plumbing from the existing graph node", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-kimi-node",
          decisionKind: "add_nodes",
          rationaleForDecision: "Add a qualified scoped implementation node.",
          newNodes: [
            {
              nodeId: "implementation-derived-run",
              capabilityId: "implementation_microtask",
              commitmentIdsAdvanced: ["implementation"],
              whyThisRoleIsNeededNow: "A scoped edit is the cheapest sufficient next step.",
              exactObjective: "Make one scoped edit.",
              expectedOutput: "Scoped edit evidence.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
              metadata: {
                taskFamily: "small_source_edit",
                consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
                utilityRationale: "A small implementation node advances the open commitment.",
                costRationale: "Kimi is cheaper than Codex and sufficient for this bounded edit.",
                whyThisIsNotDuplicateWork: "No implementation node has run yet.",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: [
                  ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
                ],
                stopOrEscalationCondition: "Escalate if validation fails.",
              },
            },
          ],
          reasonCodes: ["implementation_ready"],
          metadata: {
            parallelIndependentNodesJustification: "Single scoped node for one open commitment.",
          },
        },
        {
          decisionId: "run-kimi-node",
          decisionKind: "run_node",
          rationaleForDecision:
            "Run the existing scoped implementation node using its compiled node contract.",
          runNodeId: "implementation-derived-run",
          reasonCodes: ["run_existing_node"],
          metadata: {
            costAwareUtilityDecision: {
              selectedCapabilityId: "implementation_microtask",
              utilityRationale: "The existing node is already scoped to the open commitment.",
              costRationale: "The cheap implementation lane is sufficient for this node.",
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
              qualificationEvidenceRefs: [
                ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
              ],
            },
          },
        },
        {
          decisionId: "closeout",
          decisionKind: "create_closeout",
          rationaleForDecision: "Derived run-node cost-aware proof complete.",
          reasonCodes: ["scheduler_lane_complete"],
          metadata: { acceptedModelAuthoredCloseoutRef: "closeout://accepted/derived-run" },
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: normalizeMissionContractLedger({
          missionId: "cost-aware-run-node-mission",
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
            evaluationId: "derived-run-node-evaluation",
            missionId: input.ledger.missionId,
            commitmentUpdates: [
              {
                commitmentId: "implementation",
                status: "satisfied",
                acceptedEvidenceRefs: input.outputArtifactRefs,
                rejectedEvidenceRefs: [],
                rationale: "The model-authored evaluator accepted the implementation evidence.",
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

      expect(result.status).toBe("succeeded");
      expect(result.reasonCodes).not.toContain(
        "cost_aware_decision:cost_aware_decision_id_missing",
      );
      expect(result.reasonCodes).not.toContain(
        "cost_aware_decision:cost_aware_downstream_consumer_missing",
      );
      expect(result.executedNodeIds).toEqual(["implementation-derived-run"]);
    });
  });

  it("emits node add and status callbacks for Work Queue child materialization", async () => {
    await withSchedulerGraph(async (graphs) => {
      const callbacks: Array<{ kind: string; nodeId: string; status?: string }> = [];
      const decisions = [
        {
          decisionId: "add-and-run-validation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Add and run validation so callbacks have full lifecycle.",
          newNodes: [
            {
              nodeId: "validation-callback",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Records bounded validation refs."],
              downstreamConsumer: "orchestrator",
              metadata: {
                ...independentRootFixtureMetadata(
                  "This callback fixture validates a standalone executable root.",
                ),
                validationPhase: "final_proof_validation",
              },
            },
          ],
          runAfterAdd: true,
          runNodeId: "validation-callback",
          reasonCodes: ["validation_callback_needed"],
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
          "role:test_engineer": succeededExecutor("validation"),
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
        { kind: "added", nodeId: "validation-callback" },
        { kind: "status", nodeId: "validation-callback", status: "running" },
        { kind: "status", nodeId: "validation-callback", status: "succeeded" },
      ]);
    });
  });

  it("persists accepted graph edges before Work Queue child projection and isolates child sync failures", async () => {
    await withSchedulerGraph(async (graphs) => {
      const progress: Array<{
        stage: string;
        status?: string;
        phase?: string | null;
        reasonCodes: string[];
      }> = [];
      const decisions = [
        {
          decisionId: "add-dependent-work-intents",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Add a dependent WorkIntent graph and prove Work Queue projection cannot interrupt topology persistence.",
          newNodes: [
            {
              nodeId: "graph-patch-node-a",
              nodeKind: "work_intent",
              assignedRole: "orchestrator",
              expectedOutput: "First graph patch node.",
              acceptanceCriteria: ["Node A is persisted."],
              downstreamConsumer: "graph-patch-node-b",
              metadata: independentRootFixtureMetadata("Graph patch node A fixture.", {
                workIntentCompiled: true,
                executionIntent: "source_grounding",
                capabilityId: "orchestrator_decision",
              }),
            },
            {
              nodeId: "graph-patch-node-b",
              nodeKind: "work_intent",
              assignedRole: "orchestrator",
              expectedOutput: "Second graph patch node.",
              acceptanceCriteria: ["Node B is persisted."],
              downstreamConsumer: "runtime",
              metadata: independentRootFixtureMetadata("Graph patch node B fixture.", {
                workIntentCompiled: true,
                executionIntent: "validation",
                capabilityId: "validation_run",
              }),
            },
          ],
          newEdges: [
            {
              edgeId: "graph-patch-edge-a-b",
              fromNodeId: "graph-patch-node-a",
              toNodeId: "graph-patch-node-b",
              edgeKind: "handoff",
              reasonCodes: ["graph_patch_regression_dependency"],
            },
          ],
          runAfterAdd: false,
          reasonCodes: ["graph_patch_projection_regression"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {},
        maxIterations: 1,
        async onNodeAdded(input) {
          throw new Error(`synthetic_child_sync_failure:${input.node.nodeId}`);
        },
        async onProgress(input) {
          progress.push({
            stage: input.stage,
            status: input.status,
            phase: input.currentPhase,
            reasonCodes: input.reasonCodes ?? [],
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(["needs_review", "max_iterations"]).toContain(result.status);
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(
        expect.arrayContaining(["graph-patch-node-a", "graph-patch-node-b"]),
      );
      expect(snapshot?.edges).toHaveLength(1);
      expect(snapshot?.edges[0]).toMatchObject({
        fromNodeId: "graph-patch-node-a",
        toNodeId: "graph-patch-node-b",
        edgeKind: "handoff",
      });
      expect(progress).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "work_queue_child_sync",
            status: "needs_review",
            phase: "work_queue_child_sync_blocked",
            reasonCodes: expect.arrayContaining([
              "work_queue_child_sync_blocked",
              "graph_patch_persisted_projection_blocked",
            ]),
          }),
          expect.objectContaining({
            stage: "scheduler_graph_node_persistence",
            status: "completed",
            phase: "graph_node_persistence_completed",
            reasonCodes: expect.arrayContaining([
              "graph_patch_topology_persisted_before_work_queue_projection",
              "graph_patch_persisted_projection_blocked",
            ]),
          }),
        ]),
      );
    });
  });

  it("rejects graph edges with unknown endpoints before writing any accepted nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      const progress: Array<{
        stage: string;
        status?: string;
        phase?: string | null;
        reasonCodes: string[];
      }> = [];
      const decisions = [
        {
          decisionId: "add-dangling-edge-work-intents",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "This deliberately includes an edge endpoint that is not part of the accepted graph.",
          newNodes: [
            {
              nodeId: "accepted-node-a",
              nodeKind: "work_intent",
              assignedRole: "orchestrator",
              expectedOutput: "Accepted graph node.",
              acceptanceCriteria: ["Node is valid."],
              downstreamConsumer: "runtime",
              metadata: independentRootFixtureMetadata("Accepted node fixture.", {
                workIntentCompiled: true,
                executionIntent: "source_grounding",
                capabilityId: "orchestrator_decision",
              }),
            },
          ],
          newEdges: [
            {
              edgeId: "dangling-edge",
              fromNodeId: "missing-source-node",
              toNodeId: "accepted-node-a",
              edgeKind: "handoff",
              reasonCodes: ["dangling_edge_regression"],
            },
          ],
          runAfterAdd: false,
          reasonCodes: ["dangling_edge_regression"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {},
        maxIterations: 1,
        async onProgress(input) {
          progress.push({
            stage: input.stage,
            status: input.status,
            phase: input.currentPhase,
            reasonCodes: input.reasonCodes ?? [],
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(snapshot?.nodes).toHaveLength(0);
      expect(snapshot?.edges).toHaveLength(0);
      expect(progress).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stage: "scheduler_graph_edge_persistence",
            status: "needs_review",
            phase: "graph_edge_endpoint_rejected_before_node_write",
            reasonCodes: expect.arrayContaining([
              "scheduler_graph_edge_endpoint_rejected",
              "scheduler_graph_patch_rejected_before_partial_node_write",
              "runtime_work_graph_edge_from_node_unknown:missing-source-node",
            ]),
          }),
          expect.objectContaining({
            stage: "scheduler_graph_persistence",
            status: "needs_review",
            phase: "graph_persistence_needs_review",
            reasonCodes: expect.arrayContaining([
              "scheduler_graph_persistence_needs_review",
              "runtime_work_graph_edge_from_node_unknown:missing-source-node",
            ]),
          }),
        ]),
      );
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
      expect(result.reasonCodes).toContain("node_kind_not_executable_and_capability_missing");
      expect(result.reasonCodes).toContain("decision_new_nodes_missing");
      expect(result.reasonCodes).toContain("no_fallback_graph_injected");
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
      expect(result.reasonCodes).toContain("node_kind_not_executable_and_capability_missing");
      expect(result.reasonCodes).toContain("decision_new_nodes_missing");
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
                  nodeId: "review-without-contract",
                  nodeKind: "reviewer",
                  assignedRole: "reviewer",
                  expectedOutput: "Review refs.",
                  acceptanceCriteria: ["Records review findings."],
                  downstreamConsumer: "orchestrator",
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
          "kind:implementation": succeededExecutor("implementation"),
          "role:reviewer": succeededExecutor("review"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("node_commitment_ids_missing:review-without-contract");
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
          decisionKind: "add_nodes",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
              metadata: {
                ...independentRootFixtureMetadata(
                  "This validation-only mission starts with final proof validation as its executable root.",
                ),
                validationPhase: "final_proof_validation",
              },
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
          decisionKind: "add_nodes",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "orchestrator",
              metadata: {
                ...independentRootFixtureMetadata(
                  "This validation-only mission starts with final proof validation as its executable root.",
                ),
                validationPhase: "final_proof_validation",
              },
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

  it("requires typed evidence claims to reference produced evidence without artifact-name inference", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "claim-normalization-mission",
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
      const evidenceRefsSeen: string[] = [];
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation is required to close the mission.",
              exactObjective: "Run focused validation.",
              evidenceExpectation: "Validation evidence.",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "mission_evaluator",
              metadata: independentValidationFixtureMetadata(
                "This typed evidence claim fixture runs validation as the independent proof node.",
              ),
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "stop-after-claims",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after checking typed claim evidence.",
          reasonCodes: ["claim_diagnostics_checked"],
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
          "role:test_engineer": {
            async execute() {
              return {
                        status: "succeeded",
                        outputArtifactRefs: ["runtime-job://job/codex-direct-main-repo/validation"],
                        changedFileRefs: ["repo://validated-file.ts#sha256:abc"],
                        validationRefs: ["runtime-job://job/codex-direct-main-repo/validation"],
                        evidenceClaims: [
                          {
                            commitmentId: "validation",
                    evidenceRef:
                              "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
                            evidenceKind: "test_validation",
                            validationPhase: "post_action_validation",
                            claimSummary: "Claims the focused validation result.",
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
          evidenceRefsSeen.push(...input.evidenceClaims.map((claim) => claim.evidenceRef));
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "mission_evidence_claims_invalid:validation-node",
          expect.stringContaining("evidence_claim_ref_missing:pnpm test:file"),
        ]),
      );
      expect(evidenceRefsSeen).toEqual([]);
    });
  });

  it("compiles worker evidence claims with missing runtime-owned schema fields before ledger evaluation", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "worker-claim-normalization-mission",
        ownerObjectiveSummary: "Run scoped implementation.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "implementation",
              commitmentText: "Complete scoped implementation.",
              whyItMatters: "Implementation evidence is required.",
              expectedEvidenceDescription: "Source change and validation refs.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const claimsSeen: Array<{ evidenceKind: string; rawProviderLogStored: false }> = [];
      const decisions = [
        {
          decisionId: "add-implementation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Implementation evidence is needed.",
          newNodes: [
            {
              nodeId: "implementation-node",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              commitmentIdsAdvanced: ["implementation"],
              whyThisRoleIsNeededNow: "The mission needs a scoped source edit.",
              exactObjective: "Edit the scoped runtime file.",
              expectedOutput: "Changed file and validation refs.",
              acceptanceCriteria: ["Emits source and validation evidence."],
              downstreamConsumer: "mission_evaluator",
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["implementation_needed"],
        },
        {
          decisionId: "stop-after-worker-claim",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after checking normalized worker claims.",
          reasonCodes: ["worker_claim_checked"],
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
          "kind:implementation": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: [
                  "worker-evidence://implementation-claim",
                  "validation://implementation/passed",
                  "extensions/execution-platform/src/workflows/example.ts",
                ],
                evidenceClaims: [
                  {
                    commitmentId: "implementation",
                    evidenceRef: "worker-evidence://implementation-claim",
                    claimSummary: "Worker produced bounded implementation evidence.",
                    limitations: [],
                    rawPromptStored: false,
                    rawResponseStored: false,
                  } as never,
                ],
                reasonCodes: ["implementation_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        async evaluateMissionLedger(input) {
          claimsSeen.push(
            ...input.evidenceClaims.map((claim) => ({
              evidenceKind: claim.evidenceKind,
              rawProviderLogStored: claim.rawProviderLogStored,
            })),
          );
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

              expect(claimsSeen).toEqual([]);
              expect(result.reasonCodes).not.toContain("evidence_claim_raw_storage_flag_invalid");
              expect(result.reasonCodes).toContain(
                "mission_evidence_claim_missing_for_commitment:implementation-node:implementation",
              );
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
          decisionKind: "add_nodes",
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
              metadata: independentValidationFixtureMetadata(
                "This evidence-claim fixture runs validation as the independent proof node.",
              ),
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

  it("applies the generic workflow node result contract before accepting node success", async () => {
    await withSchedulerGraph(async (graphs) => {
      const nodeStatusReasonCodes: string[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "add-review",
              decisionKind: "add_nodes",
              rationaleForDecision: "Add a scoped implementation node and run it immediately.",
              newNodes: [
                {
                  nodeId: "implementation-node",
                  capabilityId: "implementation_microtask",
                  commitmentIdsAdvanced: ["implementation"],
                  whyThisRoleIsNeededNow: "A scoped implementation worker is enough for this node.",
                  exactObjective: "Make a bounded implementation edit.",
                  evidenceExpectation: "A source-change evidence claim.",
                  expectedOutput: "Source-change evidence.",
                  acceptanceCriteria: ["Records changed-file refs."],
                  downstreamConsumer: "test_engineer",
                  metadata: {
                    taskFamily: "small_source_edit",
                    selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                    qualificationEvidenceRefs: [
                      ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
                    ],
                    stopOrEscalationCondition: "Escalate if validation fails.",
                  },
                },
              ],
              runAfterAdd: true,
              runNodeId: "implementation-node",
              reasonCodes: ["implementation_needed"],
            };
          },
        },
        executors: {
          "kind:implementation": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: ["repo://file.ts#sha256:abc"],
                reasonCodes: ["implementation_completed"],
                evidenceClaims: [
                  {
                    commitmentId: "implementation",
                    evidenceRef: "repo://file.ts#sha256:abc",
                    evidenceKind: "source_change",
                    claimSummary: "Changed the scoped file.",
                    limitations: [],
                    rawPromptStored: true as false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  },
                ],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        async onNodeStatusChanged(event) {
          nodeStatusReasonCodes.push(...event.reasonCodes);
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(nodeStatusReasonCodes).toContain("generic_workflow_node_result_contract_invalid");
      expect(nodeStatusReasonCodes).toContain(
        "generic_node_result_evidence_claim_raw_storage_rejected",
      );
    });
  });

  it("does not report a succeeded node when required evidence claims are invalid", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "invalid-claim-status-mission",
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
      const nodeStatuses: string[] = [];
      const decisions = [
        {
          decisionId: "add-validation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Validation evidence is needed.",
          newNodes: [
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation is required to close the mission.",
              exactObjective: "Run focused validation.",
              evidenceExpectation: "Validation evidence.",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation ref."],
              downstreamConsumer: "mission_evaluator",
              metadata: independentValidationFixtureMetadata(
                "This invalid-claim fixture runs validation as the independent proof node.",
              ),
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
        requireEvidenceClaimsForMissionLedger: true,
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
                        changedFileRefs: ["repo://validated-file.ts#sha256:abc"],
                        validationRefs: ["artifact://validation/actual"],
                        evidenceClaims: [
                          {
                            commitmentId: "validation",
                            evidenceRef: "artifact://validation/missing",
                            evidenceKind: "test_validation",
                            validationPhase: "post_action_validation",
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
        async onNodeStatusChanged(input) {
          if (input.node.nodeId === "validation-node") {
            nodeStatuses.push(input.nodeStatus);
          }
        },
        async evaluateMissionLedger(input) {
          return input.ledger;
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("mission_evidence_claims_invalid:validation-node");
      expect(nodeStatuses).toEqual(["running", "needs_review"]);
    });
  });

  it("rejects downstream node selection when handoff dependencies have not succeeded", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = complexMissionLedger();
      let validationCalls = 0;
      const decisions = [
        {
          decisionId: "add-dependent-work",
          decisionKind: "add_nodes",
          rationaleForDecision: "Create implementation before validation.",
          metadata: { stagedSchedulerProtocolCompiled: true },
          newNodes: [
            {
              nodeId: "implementation-node",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "Implementation is required before validation.",
              exactObjective: "Make the requested source edit.",
              evidenceExpectation: "Changed-file ref.",
              expectedOutput: "Changed-file ref.",
              acceptanceCriteria: ["Records changed-file evidence."],
              downstreamConsumer: "validation-node",
            },
            {
              nodeId: "validation-node",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              inputHandoffRefs: ["implementation-node"],
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation should run after implementation succeeds.",
              exactObjective: "Run focused validation after implementation.",
              evidenceExpectation: "Validation ref.",
              expectedOutput: "Validation ref.",
              acceptanceCriteria: ["Records validation evidence."],
              downstreamConsumer: "mission_evaluator",
              metadata: {
                validationPhase: "integration_validation",
              },
            },
          ],
          newEdges: [
            {
              edgeId: "implementation-to-validation",
              fromNodeId: "implementation-node",
              toNodeId: "validation-node",
              edgeKind: "handoff",
            },
          ],
          reasonCodes: ["dependent_work_added"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run implementation first.",
          runNodeId: "implementation-node",
          reasonCodes: ["run_implementation"],
        },
        {
          decisionId: "run-validation-too-early",
          decisionKind: "run_node",
          rationaleForDecision:
            "Incorrectly try to run validation after implementation needs review.",
          runNodeId: "validation-node",
          reasonCodes: ["run_validation"],
        },
        {
          decisionId: "stop-after-dependency-rejection",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after dependency rejection is surfaced.",
          reasonCodes: ["dependency_rejection_seen"],
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
          "role:implementation_engineer": {
            async execute() {
              return {
                status: "needs_review",
                outputArtifactRefs: ["artifact://implementation/needs-review"],
                reasonCodes: ["implementation_needs_review"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
          "role:test_engineer": {
            async execute() {
              validationCalls += 1;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://validation/should-not-run"],
                reasonCodes: ["validation_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        maxDecisionRepairAttempts: 1,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(validationCalls).toBe(0);
      expect(result.reasonCodes).toContain(
        "selected_node_dependency_not_satisfied:validation-node:implementation-node:needs_review",
      );
      expect(snapshot?.nodes.find((node) => node.nodeId === "validation-node")?.nodeStatus).toBe(
        "planned",
      );
    });
  });

  it("blocks complex mission closeout while staged work intents remain unresolved", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-context-and-implementation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Decompose but run implementation first for this proof.",
          workBreakdownUnits: [
            {
              workUnitId: "review-planned",
              objective: "Review implementation evidence before closeout.",
              executionIntent: "review",
              commitmentIds: ["code-edit"],
              rationale: "Review is needed before closeout.",
              expectedOutcome: "Review refs.",
            },
            {
              workUnitId: "implementation-only",
              objective: "Make the code edit and report validation refs.",
              executionIntent: "source_edit",
              commitmentIds: ["code-edit", "validation"],
              rationale: "Implementation evidence is required.",
              expectedOutcome: "Source and validation refs.",
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "review-planned",
              selectedCapabilityId: "reviewer",
              consideredCapabilityIds: ["reviewer"],
              utilityRationale: "Independent review is required before closeout.",
              costRationale: "Reviewer is cheaper than human review.",
              whyThisIsNotDuplicateWork: "No review node has run.",
              stopOrEscalationCondition: "Stop if review finds blocking defects.",
            },
            {
              workUnitId: "implementation-only",
              selectedCapabilityId: "implementation_microtask",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              utilityRationale: "Implementation evidence is required.",
              costRationale: "Microtask implementation is cheaper than broad Codex.",
              whyThisIsNotDuplicateWork: "No implementation node has run.",
              stopOrEscalationCondition: "Escalate if scoped edit fails.",
            },
          ],
          nodeContractDrafts: [
            {
              workUnitId: "review-planned",
              roleRationale: "Review is needed before closeout.",
              objective: "Review implementation evidence.",
              expectedOutput: "Review refs.",
              successCriteria: ["Records review findings."],
              downstreamConsumer: "closeout",
            },
            {
              workUnitId: "implementation-only",
              roleRationale: "Implementation evidence is required.",
              objective: "Make the code edit and report validation refs.",
              expectedOutput: "Source and validation refs.",
              successCriteria: ["Records changed files and validation."],
              downstreamConsumer: "reviewer",
            },
          ],
          edgeOrParallelismDraft: {
            edges: [
              {
                fromNodeId: "implementation-only",
                toNodeId: "review-planned",
                edgeKind: "handoff",
                reasonCodes: ["implementation_to_review"],
              },
            ],
          },
          runAfterAdd: false,
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
          "kind:reviewer": succeededExecutor("review"),
          "kind:implementation": succeededExecutor("implementation"),
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
        maxParallelNodeExecutions: 2,
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("staged_scheduler_graph_compiled");
      expect(result.reasonCodes).not.toContain(
        "resource_objective_focus_selector_missing",
      );
      expect(result.addedNodeIds.some((nodeId) => nodeId.includes("work-intent"))).toBe(true);
      expect(result.executedNodeIds.length).toBeGreaterThan(0);
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
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
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
          decisionKind: "add_nodes",
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
              metadata: {
                ...independentRootFixtureMetadata(
                  "This validation-only mission starts with final proof validation as its executable root.",
                ),
                validationPhase: "final_proof_validation",
              },
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
          decisionKind: "add_nodes",
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
              metadata: independentValidationFixtureMetadata(
                "This validation-failure fixture runs validation as the independent proof node.",
              ),
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

  it("does not count repeated needs-review diagnostic refs as implementation progress", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-kimi-1",
          decisionKind: "add_nodes",
          rationaleForDecision: "Try the scoped non-Codex implementation lane.",
          newNodes: [
            {
              nodeId: "kimi-readback-1",
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
          decisionId: "add-kimi-2",
          decisionKind: "add_nodes",
          rationaleForDecision: "Retrying the same non-Codex lane after a needs-review diagnostic.",
          newNodes: [
            {
              nodeId: "kimi-readback-2",
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
          decisionId: "add-kimi-3",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Retrying the same non-Codex lane again with no accepted work evidence.",
          newNodes: [
            {
              nodeId: "kimi-readback-3",
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
      let diagnosticCount = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: normalizeMissionContractLedger({
          missionId: "needs-review-diagnostic-loop",
          ownerObjectiveSummary: "Edit readback code.",
          value: {
            blockingCommitments: [
              {
                commitmentId: "readback-edit",
                commitmentText: "Edit the readback code.",
                whyItMatters: "The owner asked for source changes.",
                expectedEvidenceDescription: "Changed-file refs.",
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
          "role:implementation_engineer": {
            async execute() {
              diagnosticCount += 1;
              return {
                status: "needs_review",
                outputArtifactRefs: [`artifact://kimi/diagnostic-${diagnosticCount}`],
                reasonCodes: ["kimi_no_valid_patch_proposal"],
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
        "kimi-readback-1",
        "kimi-readback-2",
        "kimi-readback-3",
      ]);
    });
  });

  it("promotes satisfied WorkIntent siblings before blocked local lifecycle siblings halt the scheduler", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "satisfied-source-edit",
        nodeKind: "work_intent",
        assignedRole: "orchestrator",
        nodeStatus: "planned",
        metadata: {
          workIntentCompiled: true,
          workIntentSelectedCapabilityId: "implementation_microtask",
          capabilityId: "implementation_microtask",
          executionIntent: "source_edit",
          evidenceMode: ["changed_file_evidence", "validation_evidence"],
          resourceRequirementKinds: ["resource_handoff"],
          workIntentRef: "work-intent://scheduler-graph/satisfied-source-edit",
          exactObjective: "Apply the accepted resource ledger evidence.",
          expectedOutput: "Executable implementation node.",
          commitmentIdsAdvanced: ["code-edit"],
          targetRefs: ["file-window://src/example.ts#L1-L40"],
          resourceObjectiveFocusStatus: "accepted",
          resourceObjectiveFocusRef: "resource-focus://satisfied-source-edit",
          resourceObjectiveFocusLegalRefUniverseRef:
            "resource-focus-legal-ref-universe://satisfied-source-edit",
          nodeResourceDemandStatus: "fulfilled",
          nodeResourceDemandSessionRefs: ["resource-demand://satisfied-source-edit/session"],
          nodeResourceDemandFulfillmentRefs: ["resource-demand://satisfied-source-edit/fulfillment"],
          nodeResourceLedgerRefs: ["resource-ledger://satisfied-source-edit"],
          nodeResourceLedgerEntryRefs: ["resource-ledger://satisfied-source-edit/entry"],
          acceptedResourceHandoffRefs: ["resource-ledger://satisfied-source-edit/entry"],
          domainResourceSelectionStatus: "accepted",
          domainResourceSelectionDecisionStatus: "accepted",
          domainResourceSelectionRefs: ["domain-resource-selection://satisfied-source-edit"],
          domainResourceSelectionPacketRefs: [
            "domain-resource-selection-packet://satisfied-source-edit",
          ],
          domainResourceSelectionDecisionRefs: [
            "domain-resource-selection-decision://satisfied-source-edit",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "blocked-sibling",
        nodeKind: "work_intent",
        assignedRole: "orchestrator",
        nodeStatus: "needs_review",
        metadata: {
          workIntentCompiled: true,
          workIntentSelectedCapabilityId: "implementation_microtask",
          capabilityId: "implementation_microtask",
          executionIntent: "source_edit",
          evidenceMode: ["changed_file_evidence"],
          resourceRequirementKinds: ["resource_handoff"],
          workIntentRef: "work-intent://scheduler-graph/blocked-sibling",
          resourceObjectiveFocusStatus: "accepted",
          resourceObjectiveFocusRef: "resource-focus://blocked-sibling",
          nodeResourceDemandStatus: "blocked",
          nodeResourceDemandBlockerRefs: ["resource-demand-blocker://blocked-sibling"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });

      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            throw new Error("global_scheduler_should_not_run_before_satisfied_sibling_promotion");
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
        maxIterations: 1,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const parent = snapshot?.nodes.find((node) => node.nodeId === "satisfied-source-edit");
      const promoted = snapshot?.nodes.find(
        (node) =>
          node.nodeKind === "implementation" &&
          (node.metadata as Record<string, unknown>).promotedFromWorkIntentNodeId ===
            "satisfied-source-edit",
      );
      expect(result.reasonCodes).not.toContain(
        "runtime_policy_work_intent_promotion_bypassed_orchestrator_decision",
      );
      expect(parent?.nodeStatus).toBe("succeeded");
      expect(parent?.metadata).toMatchObject({
        promotedExecutableNodeId: promoted?.nodeId,
        lifecycleState: "promoted_to_executable",
      });
      expect(promoted).toBeDefined();
    });
  });

  it("does not require fresh repo context snapshots for validation nodes that consume implementation evidence", async () => {
    await withSchedulerGraph(async (graphs) => {
      let validationCalled = false;
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-complete",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["changed-file://src/example.ts"],
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "validation-after-implementation",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        nodeStatus: "planned",
        inputHandoffRefs: ["runtime-work-graph://node/implementation-complete"],
        metadata: {
          capabilityId: "validation_run",
          commitmentIdsAdvanced: ["validation"],
          validationPhase: "integration_validation",
          validationCommandRefs: ["pnpm:test:file:example"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await graphs.addEdge({
        graphId: "scheduler-graph",
        edgeId: "implementation-to-validation",
        fromNodeId: "implementation-complete",
        toNodeId: "validation-after-implementation",
        edgeKind: "depends_on",
        metadata: {
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const decisions = [
        {
          decisionId: "run-validation-after-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run validation after implementation evidence exists.",
          runNodeId: "validation-after-implementation",
          reasonCodes: ["validation_requested_after_implementation"],
        },
        {
          decisionId: "stop-after-validation",
          decisionKind: "mark_needs_review",
          rationaleForDecision:
            "Stop after proving validation is not blocked by repo-context freshness.",
          reasonCodes: ["validation_context_freshness_regression_lane_complete"],
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
          "kind:validation": {
            async execute() {
              validationCalled = true;
              return {
                status: "succeeded",
                outputArtifactRefs: ["validation-run://example"],
                reasonCodes: ["validation_completed"],
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

      expect(validationCalled).toBe(true);
      expect(result.executedNodeIds).toContain("validation-after-implementation");
      expect(result.reasonCodes).not.toContain("node_resource_fulfillment_required_before_execution");
      expect(result.reasonCodes).toContain("validation_context_freshness_regression_lane_complete");
    });
  });

  it("allows worker execution when required context snapshots are fresh", async () => {
    await withSchedulerGraph(async (graphs) => {
      const freshSnapshot = createContextSnapshotRef({
        sourceRef: "runtime-work-graph://scheduler-graph/resource-ledger/accepted",
        sourceKind: "memory_context_pack",
        capturedAt: "2026-05-14T00:00:00.000Z",
        graphId: "scheduler-graph",
        nodeId: "implementation-fresh-context",
        commitmentIds: ["code-edit"],
        scopeSummary: "Accepted node-local context snapshot for implementation.",
        reasonCodes: ["context_snapshot_node_local_resource_ledger"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-fresh-context",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          requiredContextSnapshotRefs: [freshSnapshot],
          providedContextSnapshotRefs: [freshSnapshot],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const decisions = [
        {
          decisionId: "run-implementation-fresh-context",
          decisionKind: "run_node",
          rationaleForDecision: "Run implementation with accepted fresh context snapshot.",
          runNodeId: "implementation-fresh-context",
          reasonCodes: ["implementation_has_fresh_context"],
        },
        {
          decisionId: "stop-after-fresh-context",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after proving the fresh context gate allows execution.",
          reasonCodes: ["fresh_context_execution_lane_complete"],
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
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.executedNodeIds).toEqual(["implementation-fresh-context"]);
      expect(result.reasonCodes).toContain("fresh_context_execution_lane_complete");
    });
  });

  it("can stop at a replay boundary before invoking the selected node executor", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-boundary",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      let executorCalled = false;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return {
              decisionId: "run-boundary-node",
              decisionKind: "run_node",
              rationaleForDecision: "Select the implementation node.",
              runNodeId: "implementation-boundary",
              reasonCodes: ["boundary_test_select_node"],
            };
          },
        },
        beforeNodeExecution: async ({ node }) => ({
          status: "succeeded",
          selectedNodeId: node.nodeId,
          reasonCodes: [
            "boundary_replay_first_executable_node_selected",
            "boundary_replay_stopped_before_worker_execution_without_mutating_node_success",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }),
        executors: {
          "role:implementation_engineer": {
            async execute() {
              executorCalled = true;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://implementation/unexpected"],
                reasonCodes: ["unexpected_executor_call"],
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

      expect(result.status).toBe("succeeded");
      expect(executorCalled).toBe(false);
      expect(result.reasonCodes).toContain(
        "boundary_replay_stopped_before_worker_execution_without_mutating_node_success",
      );
      expect(result.reasonCodes).toContain(
        "scheduler_boundary_selected_node:implementation-boundary",
      );
    });
  });

  it("continues to materialized split children after a before-node split transition", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-parent",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          targetRefs: [
            "extensions/execution-platform/src/large-a.ts",
            "extensions/execution-platform/src/large-b.ts",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const executed: string[] = [];
      let splitApplied = false;
      let orchestratorCalls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 4,
        maxParallelNodeExecutions: 2,
        orchestrator: {
          async decide() {
            orchestratorCalls += 1;
            if (orchestratorCalls === 1) {
              return {
                decisionId: "run-parent-before-split",
                decisionKind: "run_node",
                rationaleForDecision: "Run the implementation parent.",
                runNodeId: "implementation-parent",
                reasonCodes: ["test_run_parent_before_split"],
              };
            }
            return {
              decisionId: "stop-after-split-child",
              decisionKind: "mark_needs_review",
              rationaleForDecision: "Stop after proving the child ran.",
              reasonCodes: ["test_stop_after_split_child_execution"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        beforeNodeExecution: async ({ node }) => {
          if (node.nodeId !== "implementation-parent" || splitApplied) {
            return null;
          }
          splitApplied = true;
          await graphs.addNode({
            graphId: "scheduler-graph",
            nodeId: "implementation-parent:task:1",
            nodeKind: "implementation",
            assignedRole: "implementation_engineer",
            nodeStatus: "planned",
            inputHandoffRefs: ["artifact://implementation-context/parent", node.nodeId],
            metadata: {
              capabilityId: "implementation_microtask",
              sourceSplitFromNodeId: node.nodeId,
              targetRefs: ["extensions/execution-platform/src/large-a.ts"],
              nodeExecutionPacketRequired: true,
              rawPromptStored: false,
              rawResponseStored: false,
            },
          });
          await graphs.addEdge({
            graphId: "scheduler-graph",
            edgeId: "implementation-parent-to-task-1",
            fromNodeId: node.nodeId,
            toNodeId: "implementation-parent:task:1",
            edgeKind: "handoff",
            reasonCodes: ["split_required_child_receives_parent_context"],
          });
          await graphs.updateNodeStatus({
            nodeId: node.nodeId,
            nodeStatus: "succeeded",
            outputArtifactRefs: ["artifact://implementation-context/parent"],
            metadataPatch: {
              splitRequiredTransitionStatus: "split_materialized",
              splitRequiredParentLifecycle: "aggregate_non_runnable",
              splitRequiredChildNodeIds: ["implementation-parent:task:1"],
              commitmentClosureEligible: false,
              rawPromptStored: false,
              rawResponseStored: false,
            },
          });
          return {
            status: "continue",
            selectedNodeId: node.nodeId,
            reasonCodes: ["split_required_transition_applied"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        },
        executors: {
          "role:implementation_engineer": {
            async execute(input) {
              executed.push(input.node.nodeId);
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://implementation/${input.node.nodeId}`],
                reasonCodes: ["implementation_child_completed"],
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
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(executed).toEqual(["implementation-parent:task:1"]);
      expect(
        snapshot?.nodes.find((node) => node.nodeId === "implementation-parent")?.nodeStatus,
      ).toBe("succeeded");
      expect(
        snapshot?.nodes.find((node) => node.nodeId === "implementation-parent:task:1")?.nodeStatus,
      ).toBe("succeeded");
      expect(result.reasonCodes).toContain("split_required_transition_applied");
      expect(result.reasonCodes).toContain("scheduler_parallel_frontier_executed");
    });
  });

  it("runs dependency-ready graph frontier nodes in parallel before asking for another model decision", async () => {
    await withSchedulerGraph(async (graphs) => {
      let activeExecutors = 0;
      let maxActiveExecutors = 0;
      const executed: string[] = [];
      const parallelExecutor: RuntimeWorkGraphNodeExecutor = {
        async execute(input) {
          activeExecutors += 1;
          maxActiveExecutors = Math.max(maxActiveExecutors, activeExecutors);
          executed.push(input.node.nodeId);
          await new Promise((resolve) => setTimeout(resolve, 20));
          activeExecutors -= 1;
          return {
            status: "succeeded",
            outputArtifactRefs: [`artifact://parallel/${input.node.nodeId}`],
            reasonCodes: [`parallel_completed:${input.node.nodeId}`],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        },
      };
      const decisions = [
        {
          decisionId: "add-independent-frontier",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Add two independent implementation nodes and downstream validation.",
          runAfterAdd: false,
          metadata: {
            parallelIndependentNodesJustification:
              "Implementation nodes touch disjoint target refs and can run as a parallel frontier.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
          newNodes: [
            {
              nodeId: "implementation-a",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              capabilityId: "implementation_microtask",
              executorKey: "kind:implementation",
              requiredMetadataSchemaRef: "schema://runtime-node/implementation",
              commitmentIdsAdvanced: ["a"],
              targetRefs: ["src/a.ts"],
              whyThisRoleIsNeededNow: "First independent implementation unit.",
              exactObjective: "Patch A.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["A is patched."],
              downstreamConsumer: "validation",
              metadata: {
                stagedSchedulerProtocolCompiled: true,
                expectedEvidence: ["changed_file_ref"],
                expectedEvidenceSource: "runtime_derived_from_capability_manifest",
                targetRefs: ["src/a.ts"],
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate to Codex if the scoped edit cannot produce a valid patch.",
                rawPromptStored: false,
                rawResponseStored: false,
              },
            },
            {
              nodeId: "implementation-b",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              capabilityId: "implementation_microtask",
              executorKey: "kind:implementation",
              requiredMetadataSchemaRef: "schema://runtime-node/implementation",
              commitmentIdsAdvanced: ["b"],
              targetRefs: ["src/b.ts"],
              whyThisRoleIsNeededNow: "Second independent implementation unit.",
              exactObjective: "Patch B.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["B is patched."],
              downstreamConsumer: "validation",
              metadata: {
                stagedSchedulerProtocolCompiled: true,
                expectedEvidence: ["changed_file_ref"],
                expectedEvidenceSource: "runtime_derived_from_capability_manifest",
                targetRefs: ["src/b.ts"],
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate to Codex if the scoped edit cannot produce a valid patch.",
                rawPromptStored: false,
                rawResponseStored: false,
              },
            },
            {
              nodeId: "validation-after-frontier",
              nodeKind: "validation",
              assignedRole: "test_engineer",
              capabilityId: "validation_run",
              executorKey: "kind:validation",
              requiredMetadataSchemaRef: "schema://runtime-node/validation",
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validate after both implementation units complete.",
              exactObjective: "Run validation.",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Validation refs recorded."],
              downstreamConsumer: "closeout",
              metadata: {
                stagedSchedulerProtocolCompiled: true,
                validationPhase: "integration_validation",
                expectedEvidence: ["validation_ref"],
                expectedEvidenceSource: "runtime_derived_from_capability_manifest",
                rawPromptStored: false,
                rawResponseStored: false,
              },
            },
          ],
          newEdges: [
            {
              edgeId: "a-to-validation",
              fromNodeId: "implementation-a",
              toNodeId: "validation-after-frontier",
              edgeKind: "handoff",
            },
            {
              edgeId: "b-to-validation",
              fromNodeId: "implementation-b",
              toNodeId: "validation-after-frontier",
              edgeKind: "handoff",
            },
          ],
          reasonCodes: ["frontier_graph_created"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
        {
          decisionId: "closeout-after-frontier",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted closeout evidence is available.",
          reasonCodes: ["parallel_frontier_complete"],
          metadata: {
            acceptedModelAuthoredCloseoutRef: "closeout://accepted/parallel-frontier",
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      ];
      const progress: Array<{ stage: string; reasonCodes?: string[] }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxParallelNodeExecutions: 4,
        deferCloseoutUntilExecutableGraphComplete: true,
        roleCoverageProfile: {
          profileId: "test.parallel-frontier",
          requiredClasses: ["implementation", "validation_or_test"],
        },
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": parallelExecutor,
          "kind:validation": succeededExecutor("validation"),
          "role:implementation_engineer": parallelExecutor,
          "role:test_engineer": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          progress.push({ stage: event.stage, reasonCodes: event.reasonCodes });
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(maxActiveExecutors).toBe(2);
      expect(executed.toSorted()).toEqual([
        "g-af4585f691-implementation-a",
        "g-af4585f691-implementation-b",
      ]);
      expect(result.reasonCodes).toContain("scheduler_parallel_frontier_executed");
      expect(result.reasonCodes).toContain("parallel_frontier_node_count:2");
      expect(
        snapshot?.nodes.find((node) => node.nodeId === "g-af4585f691-implementation-a")?.nodeStatus,
      ).toBe("succeeded");
      expect(
        snapshot?.nodes.find((node) => node.nodeId === "g-af4585f691-implementation-b")?.nodeStatus,
      ).toBe("succeeded");
      expect(
        snapshot?.nodes.find((node) => node.nodeId === "g-af4585f691-validation-after-frontier")
          ?.nodeStatus,
      ).toBe("succeeded");
      expect(
        progress.some(
          (event) =>
            event.stage === "scheduler_parallel_frontier" &&
            event.reasonCodes?.includes("scheduler_parallel_frontier_selected"),
        ),
      ).toBe(true);
    });
  });

  it("does not automatically rerun needs-review nodes through the parallel frontier", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "needs-review-implementation",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "needs_review",
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Previously attempted scoped implementation.",
          whyThisRoleIsNeededNow: "The node needs orchestrator repair before retry.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      let executorCalls = 0;
      let orchestratorCalls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: true,
        maxDecisionRepairAttempts: 0,
        maxParallelNodeExecutions: 4,
        orchestrator: {
          async decide() {
            orchestratorCalls += 1;
            return {
              decisionId: "needs-review-node-requires-orchestrator",
              decisionKind: "mark_needs_review",
              rationaleForDecision:
                "A needs-review node cannot be automatically replayed by the runtime frontier.",
              reasonCodes: ["needs_review_node_requires_explicit_orchestrator_repair"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        executors: {
          "kind:implementation": {
            async execute() {
              executorCalls += 1;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://unexpected/retry"],
                reasonCodes: ["unexpected_retry"],
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
      expect(executorCalls).toBe(0);
      expect(orchestratorCalls).toBeGreaterThan(0);
      expect(result.reasonCodes).not.toContain("scheduler_parallel_frontier_executed");
      expect(result.reasonCodes).toContain(
        "needs_review_node_requires_explicit_orchestrator_repair",
      );
    });
  });

  it("isolates one failing parallel branch and preserves sibling branch evidence", async () => {
    await withSchedulerGraph(async (graphs) => {
      for (const node of [
        { nodeId: "implementation-a", targetRef: "src/a.ts" },
        { nodeId: "implementation-b", targetRef: "src/b.ts" },
      ]) {
        await graphs.addNode({
          graphId: "scheduler-graph",
          nodeId: node.nodeId,
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          nodeStatus: "planned",
          metadata: {
            capabilityId: "implementation_microtask",
            executorKey: "kind:implementation",
            commitmentIdsAdvanced: [node.nodeId],
            targetRefs: [node.targetRef],
            selectedProviderCapabilityProfileId: "openrouter.qwen3-coder-next",
            providerConcurrencyLimit: 2,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const progress: Array<{
        branchResults?: Array<{ nodeId: string; status: string; failureClass: string | null }>;
        branchScopedFrontierStates?: Array<{
          nodeId: string;
          status: string;
          successfulEvidenceRefs: string[];
          failedEvidenceRefs: string[];
          repairNodeRefs: string[];
          diagnosticOnlyNodeRefs: string[];
        }>;
      }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 1,
        maxParallelNodeExecutions: 4,
        orchestrator: {
          async decide() {
            return undefined;
          },
        },
        executors: {
          "kind:implementation": {
            async execute(input) {
              if (input.node.nodeId === "implementation-a") {
                throw new Error("synthetic branch failure");
              }
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://sibling/${input.node.nodeId}`],
                reasonCodes: [`sibling_completed:${input.node.nodeId}`],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        onProgress: async (event) => {
          if (event.stage === "scheduler_parallel_frontier") {
            progress.push({
              branchResults: event.parallelFrontier?.branchResults.map((branch) => ({
                nodeId: branch.nodeId,
                status: branch.status,
                failureClass: branch.failureClass,
              })),
              branchScopedFrontierStates: event.branchScopedFrontierStates?.map((branch) => ({
                nodeId: branch.nodeId,
                status: branch.status,
                successfulEvidenceRefs: branch.successfulEvidenceRefs,
                failedEvidenceRefs: branch.failedEvidenceRefs,
                repairNodeRefs: branch.repairNodeRefs,
                diagnosticOnlyNodeRefs: branch.diagnosticOnlyNodeRefs,
              })),
            });
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.reasonCodes).toContain(
        "parallel_frontier_branch_repair_returned_to_orchestrator",
      );
      expect(result.reasonCodes).toContain("parallel_frontier_completed_siblings_preserved");
      expect(snapshot?.nodes.find((node) => node.nodeId === "implementation-a")?.nodeStatus).toBe(
        "needs_review",
      );
      expect(snapshot?.nodes.find((node) => node.nodeId === "implementation-b")?.nodeStatus).toBe(
        "succeeded",
      );
      expect(
        progress.some((event) =>
          event.branchResults?.some(
            (branch) =>
              branch.nodeId === "implementation-a" &&
              branch.status === "needs_review" &&
              branch.failureClass === "branch_exception",
          ),
        ),
      ).toBe(true);
      expect(
        progress.some((event) =>
          event.branchResults?.some(
            (branch) =>
              branch.nodeId === "implementation-b" &&
              branch.status === "succeeded" &&
              !branch.failureClass,
          ),
        ),
      ).toBe(true);
      expect(
        progress.some((event) =>
          event.branchScopedFrontierStates?.some(
            (branch) =>
              branch.nodeId === "implementation-a" &&
              branch.status === "needs_review" &&
              branch.successfulEvidenceRefs.includes("artifact://sibling/implementation-b"),
          ),
        ),
      ).toBe(true);
      expect(
        progress.some((event) =>
          event.branchScopedFrontierStates?.some(
            (branch) =>
              branch.nodeId === "implementation-b" &&
              branch.status === "succeeded" &&
              branch.successfulEvidenceRefs.includes("artifact://sibling/implementation-b"),
          ),
        ),
      ).toBe(true);
    });
  });

  it("halts a parallel frontier when the same branch exception repeats across siblings", async () => {
    await withSchedulerGraph(async (graphs) => {
      for (const node of [
        { nodeId: "implementation-a", targetRef: "src/a.ts" },
        { nodeId: "implementation-b", targetRef: "src/b.ts" },
        { nodeId: "implementation-c", targetRef: "src/c.ts" },
      ]) {
        await graphs.addNode({
          graphId: "scheduler-graph",
          nodeId: node.nodeId,
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          nodeStatus: "planned",
          metadata: {
            capabilityId: "implementation_microtask",
            executorKey: "kind:implementation",
            commitmentIdsAdvanced: [node.nodeId],
            targetRefs: [node.targetRef],
            selectedProviderCapabilityProfileId: "openrouter.qwen3-coder-next",
            providerConcurrencyLimit: 3,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const progress: Array<{ reasonCodes?: string[]; blockerSummary?: string | null }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 2,
        maxParallelNodeExecutions: 4,
        orchestrator: {
          async decide() {
            return undefined;
          },
        },
        executors: {
          "kind:implementation": {
            async execute(input) {
              if (input.node.nodeId !== "implementation-c") {
                throw new Error("same schema manifest violation");
              }
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://systemic-sibling/${input.node.nodeId}`],
                reasonCodes: [`systemic_sibling_completed:${input.node.nodeId}`],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        onProgress: async (event) => {
          if (event.stage === "scheduler_parallel_frontier") {
            progress.push({
              reasonCodes: event.reasonCodes,
              blockerSummary: event.blockerSummary ?? null,
            });
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("parallel_frontier_systemic_branch_failure_detected");
      expect(result.reasonCodes).toContain("parallel_frontier_completed_siblings_preserved");
      expect(snapshot?.nodes.find((node) => node.nodeId === "implementation-c")?.nodeStatus).toBe(
        "succeeded",
      );
      expect(
        progress.some((event) =>
          event.reasonCodes?.includes("parallel_frontier_systemic_branch_failure_detected"),
        ),
      ).toBe(true);
      expect(
        progress.some((event) => event.blockerSummary?.includes("same schema manifest violation")),
      ).toBe(true);
    });
  });

  it("rejects retrying a needs-review node that explicitly requires high-capability escalation", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "schema-contract-node",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Attempt scoped schema contract implementation.",
          whyThisRoleIsNeededNow: "A cheaper implementation lane should get one bounded attempt.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      let executorCalls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: false,
        maxDecisionRepairAttempts: 0,
        maxIterations: 3,
        orchestrator: {
          async decide() {
            return {
              decisionId: "retry-rejected-after-escalation-signal",
              decisionKind: "retry_node",
              targetNodeId: "schema-contract-node",
              rationaleForDecision: "Retry the same cheap implementation node.",
              reasonCodes: ["retry_same_node"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        executors: {
          "kind:implementation": {
            async execute() {
              executorCalls += 1;
              return {
                status: "needs_review",
                outputArtifactRefs: [`artifact://schema-contracts/attempt-${executorCalls}`],
                reasonCodes: [
                  "non_codex_worker_schema_contract_validation_failure_rollback",
                  "non_codex_worker_schema_contract_edit_requires_high_capability_escalation",
                ],
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
      expect(executorCalls).toBe(1);
      expect(result.reasonCodes).toContain(
        "needs_review_retry_rejected_high_capability_escalation_required",
      );
      expect(result.reasonCodes).toContain("no_fallback_graph_injected");
    });
  });

  it("rejects needs-review retries that have no accepted repair classification", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "unclassified-needs-review",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "needs_review",
        outputArtifactRefs: ["artifact://implementation/needs-review"],
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Repair implementation output.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      let executorCalls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: false,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "retry-without-classification",
              decisionKind: "retry_node",
              targetNodeId: "unclassified-needs-review",
              rationaleForDecision: "Retry without classification.",
              reasonCodes: ["retry_requested"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        executors: {
          "kind:implementation": {
            async execute() {
              executorCalls += 1;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://implementation/retry"],
                reasonCodes: ["retry_completed"],
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
      expect(executorCalls).toBe(0);
      expect(result.reasonCodes).toContain(
        "needs_review_retry_rejected_repair_classification_missing",
      );
      expect(result.reasonCodes).toContain(
        "needs_review_retry_target_missing_repair_classification:unclassified-needs-review",
      );
    });
  });

  it("compiles model request_review decisions into executable review nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "needs-review-runtime-spine",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "needs_review",
        outputArtifactRefs: ["artifact://implementation/runtime-spine"],
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          exactObjective: "Wire runtime spine.",
          whyThisRoleIsNeededNow: "Runtime spine implementation was attempted.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      const executed: string[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: false,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "request-review-runtime-spine",
              decisionKind: "request_review",
              rationaleForDecision: "Review the needs-review runtime spine implementation output.",
              targetNodeRefs: ["needs-review-runtime-spine"],
              reviewObjective:
                "Decide whether the runtime spine implementation output should be accepted or repaired.",
              reasonCodes: ["review_needed_for_runtime_spine"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        executors: {
          "kind:reviewer": {
            async execute(input) {
              executed.push(input.node.nodeId);
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://review/${input.node.nodeId}`],
                reasonCodes: ["compiled_review_completed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
          "role:reviewer": {
            async execute(input) {
              executed.push(input.node.nodeId);
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://review/${input.node.nodeId}`],
                reasonCodes: ["compiled_review_completed"],
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
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const reviewNode = snapshot?.nodes.find((node) => node.nodeKind === "reviewer");

      expect(result.reasonCodes).toContain("request_review_compiled_to_review_node");
      expect(executed).toHaveLength(1);
      expect(reviewNode?.nodeStatus).toBe("succeeded");
      expect(reviewNode?.inputHandoffRefs).toContain("needs-review-runtime-spine");
    });
  });

  it("serializes conflicting ready nodes by conflict domain while preserving the graph frontier", async () => {
    await withSchedulerGraph(async (graphs) => {
      let activeExecutors = 0;
      let maxActiveExecutors = 0;
      const executed: string[] = [];
      const executor: RuntimeWorkGraphNodeExecutor = {
        async execute(input) {
          activeExecutors += 1;
          maxActiveExecutors = Math.max(maxActiveExecutors, activeExecutors);
          executed.push(input.node.nodeId);
          await new Promise((resolve) => setTimeout(resolve, 10));
          activeExecutors -= 1;
          return {
            status: "succeeded",
            outputArtifactRefs: [`artifact://conflict/${input.node.nodeId}`],
            reasonCodes: [`conflict_completed:${input.node.nodeId}`],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        },
      };
      const decisions = [
        {
          decisionId: "add-conflicting-frontier",
          decisionKind: "add_nodes",
          rationaleForDecision: "Add two ready implementation nodes that share one write scope.",
          runAfterAdd: false,
          newNodes: [
            {
              nodeId: "implementation-a",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              capabilityId: "implementation_microtask",
              executorKey: "kind:implementation",
              commitmentIdsAdvanced: ["a"],
              targetRefs: ["src/shared.ts"],
              whyThisRoleIsNeededNow: "First edit.",
              exactObjective: "Patch shared file A.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["A is patched."],
              downstreamConsumer: "closeout",
              metadata: independentRootFixtureMetadata(
                "Conflict-frontier fixture intentionally creates implementation A as an independent root.",
                {
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate if the scoped edit cannot produce a valid patch.",
                targetRefs: ["src/shared.ts"],
                },
              ),
            },
            {
              nodeId: "implementation-b",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              capabilityId: "implementation_microtask",
              executorKey: "kind:implementation",
              commitmentIdsAdvanced: ["b"],
              targetRefs: ["src/shared.ts"],
              whyThisRoleIsNeededNow: "Second edit.",
              exactObjective: "Patch shared file B.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["B is patched."],
              downstreamConsumer: "closeout",
              metadata: independentRootFixtureMetadata(
                "Conflict-frontier fixture intentionally creates implementation B as an independent root.",
                {
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate if the scoped edit cannot produce a valid patch.",
                targetRefs: ["src/shared.ts"],
                },
              ),
            },
          ],
          newEdges: [],
          reasonCodes: ["conflicting_frontier_graph_created"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
        {
          decisionId: "closeout-after-conflict-frontier",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted closeout evidence is available.",
          reasonCodes: ["conflict_frontier_complete"],
          metadata: {
            acceptedModelAuthoredCloseoutRef: "closeout://accepted/conflict-frontier",
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      ];
      const progress: Array<{ reasonCodes?: string[]; selectedNodeIds?: string[] }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxParallelNodeExecutions: 4,
        deferCloseoutUntilExecutableGraphComplete: true,
        roleCoverageProfile: {
          profileId: "test.conflict-frontier",
          requiredClasses: ["implementation"],
        },
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": executor,
        },
        onProgress: async (event) => {
          progress.push({
            reasonCodes: event.reasonCodes,
            selectedNodeIds: event.parallelFrontier?.selectedNodeIds,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(maxActiveExecutors).toBe(1);
      expect(executed).toHaveLength(2);
      expect(executed.some((nodeId) => nodeId.endsWith("implementation-a"))).toBe(true);
      expect(executed.some((nodeId) => nodeId.endsWith("implementation-b"))).toBe(true);
      expect(
        progress.some((event) =>
          event.reasonCodes?.some(
            (code) =>
              code.includes("parallel_frontier_conflict:") && code.endsWith(":write:src/shared.ts"),
          ),
        ),
      ).toBe(true);
      expect(progress.some((event) => event.selectedNodeIds?.length === 1)).toBe(true);
    });
  });

  it("does not serialize unrelated implementation nodes that share only validation commands", async () => {
    await withSchedulerGraph(async (graphs) => {
      let activeExecutors = 0;
      let maxActiveExecutors = 0;
      const executed: string[] = [];
      const executor: RuntimeWorkGraphNodeExecutor = {
        async execute(input) {
          activeExecutors += 1;
          maxActiveExecutors = Math.max(maxActiveExecutors, activeExecutors);
          executed.push(input.node.nodeId);
          await new Promise((resolve) => setTimeout(resolve, 15));
          activeExecutors -= 1;
          return {
            status: "succeeded",
            outputArtifactRefs: [`artifact://validation-shared/${input.node.nodeId}`],
            reasonCodes: [`validation_shared_completed:${input.node.nodeId}`],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        },
      };
      for (const [suffix, targetRef] of [
        ["a", "src/a.ts"],
        ["b", "src/b.ts"],
      ] as const) {
        await graphs.addNode({
          graphId: "scheduler-graph",
          nodeId: `implementation-${suffix}`,
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          nodeStatus: "planned",
          metadata: {
            capabilityId: "implementation_microtask",
            executorKey: "kind:implementation",
            commitmentIdsAdvanced: [suffix],
            targetRefs: [targetRef],
            validationCommandRefs: [
              "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
            ],
            whyThisRoleIsNeededNow: `Independent implementation ${suffix}.`,
            exactObjective: `Patch ${targetRef}.`,
            expectedOutput: "Changed-file refs.",
            acceptanceCriteria: [`${suffix} is patched.`],
            downstreamConsumer: "closeout",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const decisions = [
        {
          decisionId: "closeout-after-validation-shared-frontier",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted closeout evidence is available.",
          reasonCodes: ["validation_shared_frontier_complete"],
          metadata: {
            acceptedModelAuthoredCloseoutRef: "closeout://accepted/validation-shared-frontier",
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      ];
      const progress: Array<{ reasonCodes?: string[]; selectedNodeIds?: string[] }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxParallelNodeExecutions: 4,
        deferCloseoutUntilExecutableGraphComplete: true,
        roleCoverageProfile: {
          profileId: "test.validation-shared-frontier",
          requiredClasses: ["implementation"],
        },
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": executor,
        },
        onProgress: async (event) => {
          progress.push({
            reasonCodes: event.reasonCodes,
            selectedNodeIds: event.parallelFrontier?.selectedNodeIds,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(maxActiveExecutors).toBe(2);
      expect(executed.toSorted()).toEqual(["implementation-a", "implementation-b"]);
      expect(progress.some((event) => event.selectedNodeIds?.length === 2)).toBe(true);
      expect(
        progress.some((event) =>
          event.reasonCodes?.some((code) => code.includes(":write:pnpm test:file")),
        ),
      ).toBe(false);
    });
  });

  it("uses counted provider concurrency budgets instead of serializing provider peers as a mutex", async () => {
    await withSchedulerGraph(async (graphs) => {
      let activeExecutors = 0;
      let maxActiveExecutors = 0;
      const executed: string[] = [];
      const executor: RuntimeWorkGraphNodeExecutor = {
        async execute(input) {
          activeExecutors += 1;
          maxActiveExecutors = Math.max(maxActiveExecutors, activeExecutors);
          executed.push(input.node.nodeId);
          await new Promise((resolve) => setTimeout(resolve, 15));
          activeExecutors -= 1;
          return {
            status: "succeeded",
            outputArtifactRefs: [`artifact://provider-budget/${input.node.nodeId}`],
            reasonCodes: [`provider_budget_completed:${input.node.nodeId}`],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        },
      };
      const implementationNode = (suffix: string, targetRef: string) => ({
        nodeId: `implementation-${suffix}`,
        nodeKind: "implementation" as const,
        assignedRole: "implementation_engineer",
        metadata: {
          capabilityId: "implementation_microtask",
          executorKey: "kind:implementation",
          commitmentIdsAdvanced: [suffix],
          targetRefs: [targetRef],
          whyThisRoleIsNeededNow: `Independent implementation ${suffix}.`,
          exactObjective: `Patch ${suffix}.`,
          expectedOutput: "Changed-file refs.",
          acceptanceCriteria: [`${suffix} is patched.`],
          downstreamConsumer: "closeout",
          selectedProviderCapabilityProfileId: "openrouter.qwen3-coder-next",
          providerConcurrencyLimit: 2,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      for (const node of [
        implementationNode("a", "src/a.ts"),
        implementationNode("b", "src/b.ts"),
        implementationNode("c", "src/c.ts"),
      ]) {
        await graphs.addNode({
          graphId: "scheduler-graph",
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          nodeStatus: "planned",
          metadata: node.metadata,
        });
      }
      const decisions = [
        {
          decisionId: "closeout-after-provider-budget-frontier",
          decisionKind: "create_closeout",
          rationaleForDecision: "Accepted closeout evidence is available.",
          reasonCodes: ["provider_budget_frontier_complete"],
          metadata: {
            acceptedModelAuthoredCloseoutRef: "closeout://accepted/provider-budget-frontier",
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        },
      ];
      const progress: Array<{
        reasonCodes?: string[];
        selectedNodeIds?: string[];
        providerConcurrencyBudgets?: Array<{
          key: string;
          limit: number;
          selectedNodeIds: string[];
          skippedNodeIds: string[];
        }>;
      }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxParallelNodeExecutions: 4,
        deferCloseoutUntilExecutableGraphComplete: true,
        roleCoverageProfile: {
          profileId: "test.provider-budget-frontier",
          requiredClasses: ["implementation"],
        },
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": executor,
        },
        onProgress: async (event) => {
          progress.push({
            reasonCodes: event.reasonCodes,
            selectedNodeIds: event.parallelFrontier?.selectedNodeIds,
            providerConcurrencyBudgets: event.parallelFrontier?.providerConcurrencyBudgets,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(maxActiveExecutors).toBe(2);
      expect(executed).toHaveLength(3);
      expect(
        progress.some((event) =>
          event.reasonCodes?.some((code) =>
            code.includes("parallel_frontier_provider_budget_exhausted:"),
          ),
        ),
      ).toBe(true);
      expect(
        progress.some((event) => {
          const budget = event.providerConcurrencyBudgets?.find((candidate) =>
            candidate.key.includes("openrouter.qwen3-coder-next"),
          );
          return (
            budget?.limit === 2 &&
            budget.selectedNodeIds.length === 2 &&
            budget.skippedNodeIds.length === 1
          );
        }),
      ).toBe(true);
      expect(progress.some((event) => event.selectedNodeIds?.length === 2)).toBe(true);
      expect(progress.some((event) => event.selectedNodeIds?.length === 1)).toBe(true);
    });
  });

  it("runs a ready executable frontier before asking the orchestrator to expand the graph", async () => {
    await withSchedulerGraph(async (graphs) => {
      const calls: string[] = [];
      await graphs.addNode({
        graphId: "scheduler-graph",
          nodeId: "ready-validation",
          nodeKind: "validation",
          assignedRole: "test_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "validation_run",
          executorKey: "kind:validation",
          validationPhase: "final_proof_validation",
          targetRefs: ["src/ready.ts"],
          commitmentIdsAdvanced: ["validation"],
          noContextNeededRationale: "This lane test only proves frontier ordering.",
          nodeExecutionPacketRequired: false,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxParallelNodeExecutions: 1,
        preferExecutableFrontierBeforeOrchestrator: true,
        orchestrator: {
          async decide() {
            calls.push("orchestrator");
            return {
              decisionId: "stop-after-frontier",
              decisionKind: "mark_needs_review",
              rationaleForDecision: "Stop after frontier execution.",
              reasonCodes: ["frontier_ordering_lane_done"],
            };
          },
        },
        executors: {
          "kind:validation": {
            async execute() {
              calls.push("executor");
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://frontier/ready-validation"],
                reasonCodes: ["ready_frontier_executor_ran"],
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
      expect(calls[0]).toBe("executor");
      expect(calls[1]).toBe("orchestrator");
      expect(result.executedNodeIds).toContain("ready-validation");
    });
  });

  it("halts repeated reused-only graph decisions with a no-progress signature", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "stale-helper",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["artifact://validation/stale-helper"],
        metadata: {
          capabilityId: "validation_run",
          validationPhase: "final_proof_validation",
        },
      });
      const decisions = [1, 2, 3].map((index) => ({
        decisionId: `reuse-stale-helper-${index}`,
        decisionKind: "add_nodes" as const,
        rationaleForDecision: "Try to add the same helper again.",
        reasonCodes: ["test_reused_only_graph_decision"],
        newNodes: [
          {
            nodeId: "stale-helper",
            nodeKind: "validation" as const,
            capabilityId: "validation_run",
            executorKey: "kind:validation",
            assignedRole: "test_engineer",
            expectedOutput: "Validation handoff.",
            acceptanceCriteria: ["Validation is bounded."],
            downstreamConsumer: "orchestrator",
            whyThisRoleIsNeededNow: "Validation is needed.",
            exactObjective: "Run validation.",
            targetRefs: ["src/stale.ts"],
            metadata: independentValidationFixtureMetadata(
              "This no-progress fixture reuses an already completed validation helper.",
              {
              expectedEvidence: ["resource_handoff"],
              expectedEvidenceSource: "runtime_derived_from_capability_manifest",
              },
            ),
          },
        ],
        newEdges: [],
      }));
      const progress: Array<{
        noProgressHash?: string | null;
        noProgressRepeatCount?: number | null;
        schedulerFrontierState?: unknown;
      }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:validation": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          progress.push({
            noProgressHash: event.noProgressSignature?.signatureHash,
            noProgressRepeatCount: event.noProgressRepeatCount,
            schedulerFrontierState: event.schedulerFrontierState,
          });
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("scheduler_repeated_no_progress_signature_halted");
      expect(result.reasonCodes).toContain("scheduler_frontier_root_cause_collapsed");
      expect(progress.some((event) => event.noProgressRepeatCount === 2)).toBe(true);
      expect(progress.some((event) => Boolean(event.schedulerFrontierState))).toBe(true);
    });
  });

  it("pages graph expansion before persistence and surfaces admission progress", async () => {
    await withSchedulerGraph(async (graphs) => {
      const progress: Array<{
        status?: string | null;
        admitted?: string[];
        deferred?: string[];
      }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 1,
        expansionAdmissionPolicy: {
          maxNewNodesPerIteration: 2,
          maxNewEdgesPerIteration: 1,
          maxAbsoluteNewNodesPerIteration: 10,
          maxAbsoluteNewEdgesPerIteration: 10,
        },
        orchestrator: {
          async decide() {
            return {
              decisionId: "large-page-decision",
              decisionKind: "add_nodes",
              rationaleForDecision: "Add a bounded page of validation work.",
              reasonCodes: ["test_large_expansion"],
              newNodes: [1, 2, 3].map((index) => ({
                nodeId: `validation-${index}`,
                nodeKind: "validation" as const,
                capabilityId: "validation_run",
                executorKey: "kind:validation",
                assignedRole: "test_engineer",
                expectedOutput: "Bounded validation handoff.",
                acceptanceCriteria: ["Validation handoff is bounded."],
                downstreamConsumer: "runtime_work_graph_scheduler",
                whyThisRoleIsNeededNow: "Validation work is needed before closeout.",
                exactObjective: `Run validation ${index}.`,
                metadata: {
                  ...independentValidationFixtureMetadata(
                    "This large-expansion fixture validates admission paging, not worker ordering.",
                  ),
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              })),
              newEdges: [
                {
                  edgeId: "edge-validation-1-2",
                  fromNodeId: "validation-1",
                  toNodeId: "validation-2",
                  edgeKind: "depends_on" as const,
                },
                {
                  edgeId: "edge-validation-2-3",
                  fromNodeId: "validation-2",
                  toNodeId: "validation-3",
                  edgeKind: "depends_on" as const,
                },
              ],
            };
          },
        },
        executors: {
          "kind:validation": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          if (event.expansionAdmissionStatus) {
            progress.push({
              status: event.expansionAdmissionStatus,
              admitted: event.expansionAdmissionAdmittedNodeIds,
              deferred: event.expansionAdmissionDeferredNodeIds,
            });
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const modelNodeIds = (snapshot?.nodes ?? []).map(modelAuthoredNodeId);

      expect(result.status).toBe("max_iterations");
      expect(progress.at(-1)).toMatchObject({
        status: "accepted_paged",
        admitted: ["validation-1", "validation-2"],
        deferred: ["validation-3"],
      });
      expect(modelNodeIds).toEqual(["validation-1", "validation-2"]);
      expect(snapshot?.edges).toHaveLength(1);
    });
  });

  it("defers non-prerequisite expansion while executable frontier work is ready", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "ready-validation",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "validation_run",
          validationPhase: "final_proof_validation",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const progress: Array<{ status?: string | null; ready?: string[] }> = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        maxIterations: 1,
        preferExecutableFrontierBeforeOrchestrator: false,
        orchestrator: {
          async decide() {
            return {
              decisionId: "defer-extra-expansion",
              decisionKind: "add_nodes",
              rationaleForDecision: "Add extra work later.",
              reasonCodes: ["test_defer_expansion"],
              newNodes: [
                {
                  nodeId: "extra-validation",
                  nodeKind: "validation" as const,
                  capabilityId: "validation_run",
                  executorKey: "kind:validation",
                  assignedRole: "test_engineer",
                  expectedOutput: "Extra validation handoff.",
                  acceptanceCriteria: ["Validation handoff is bounded."],
                  downstreamConsumer: "runtime_work_graph_scheduler",
                  whyThisRoleIsNeededNow: "Extra validation may be useful later.",
                  exactObjective: "Run extra validation later.",
                  metadata: {
                    ...independentValidationFixtureMetadata(
                      "This expansion-deferral fixture validates scheduler paging, not worker ordering.",
                    ),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  },
                },
              ],
            };
          },
        },
        executors: {
          "kind:validation": succeededExecutor("validation"),
        },
        onProgress: async (event) => {
          if (event.expansionAdmissionStatus) {
            progress.push({
              status: event.expansionAdmissionStatus,
              ready: event.expansionAdmissionReadyFrontierNodeIds,
            });
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("max_iterations");
      expect(progress.at(-1)).toMatchObject({
        status: "deferred_due_to_ready_frontier",
        ready: ["ready-validation"],
      });
      expect((snapshot?.nodes ?? []).map((node) => node.nodeId)).toEqual(["ready-validation"]);
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toContain(
        "scheduler_expansion_deferred_ready_frontier",
      );
    });
  });

  it("throttles Mission Ledger evaluation for context-only nodes without closure claims", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "research-only",
        nodeKind: "web_research",
        assignedRole: "web_researcher",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "web_research",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      let evaluationCount = 0;
      const throttles: unknown[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        preferExecutableFrontierBeforeOrchestrator: true,
        requireEvidenceClaimsForMissionLedger: true,
        evaluateMissionLedger: async ({ ledger }) => {
          evaluationCount += 1;
          return ledger;
        },
        orchestrator: {
          async decide() {
            return {
              decisionId: "stop-after-context-throttle",
              decisionKind: "mark_needs_review",
              rationaleForDecision: "Stop after context throttle proof.",
              reasonCodes: ["context_throttle_lane_done"],
            };
          },
        },
        executors: {
          "kind:web_research": succeededExecutor("research-only"),
        },
        onProgress: async (event) => {
          if (event.missionLedgerEvaluationThrottle) {
            throttles.push(event.missionLedgerEvaluationThrottle);
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(evaluationCount).toBe(0);
      expect(throttles).toHaveLength(1);
      expect(JSON.stringify(throttles[0])).toContain(
        "mission_contract_evaluation_throttled_no_closure_claims",
      );
    });
  });

});
