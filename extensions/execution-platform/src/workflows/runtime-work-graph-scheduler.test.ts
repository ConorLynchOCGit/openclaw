import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import {
  applyMissionCommitmentEvaluation,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
} from "./mission-contract-ledger.ts";
import type { CommitmentWorkPacket } from "./mission-work-packets.ts";
import { validatePostSynthesisGraphDecision } from "./post-synthesis-graph-policy.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  runtimeNodeCapabilityManifestForModel,
} from "./runtime-node-capability-registry.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import {
  RuntimeWorkGraphScheduler,
  type RuntimeWorkGraphSchedulerDecisionInput,
  type RuntimeWorkGraphNodeExecutor,
} from "./runtime-work-graph-scheduler.ts";
import { registerSchedulerRuntimeTools } from "./scheduler-runtime-tools.ts";

function modelAuthoredNodeId(node: { nodeId: string; metadata?: unknown }): string {
  const metadata =
    node.metadata && typeof node.metadata === "object"
      ? (node.metadata as Record<string, unknown>)
      : {};
  return typeof metadata.modelAuthoredNodeId === "string"
    ? metadata.modelAuthoredNodeId
    : node.nodeId;
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

function commitmentPacket(input: {
  missionId?: string;
  commitmentId: string;
  title: string;
  repoArea: string;
}): CommitmentWorkPacket {
  const missionId = input.missionId ?? "complex-mission";
  return {
    packetKind: "commitment_work_packet",
    schemaVersion: "execution-platform.commitment-work-packet.v1",
    authoringSource: "model_authored",
    qualityStatus: "accepted",
    packetId: `${missionId}:${input.commitmentId}`,
    packetRef: `runtime-work-graph://commitment-work-packet/${missionId}/${input.commitmentId}`,
    missionId,
    commitmentId: input.commitmentId,
    commitmentText: input.title,
    commitmentMeaning: `${input.title} must be implemented with bounded runtime evidence.`,
    ownerIntentSummary: "Owner requested a complex implementation workflow.",
    whyItMatters: "This commitment is blocking for the owner request.",
    workerObjective: `Advance ${input.title}.`,
    contextScoutObjective: `Find repo context for ${input.title}.`,
    implementationObjective: `Implement ${input.title}.`,
    validationObjective: `Validate ${input.title}.`,
    reviewObjective: `Review ${input.title}.`,
    expectedEvidenceDescriptions: ["Bounded evidence refs."],
    expectedEvidenceKinds: ["artifact"],
    acceptanceCriteria: [`${input.title} has concrete evidence.`],
    remainingWork: [`Complete ${input.title}.`],
    relevantConstraints: ["Do not store raw transcripts."],
    explicitNonGoals: ["Do not deploy."],
    likelyRepoAreas: [input.repoArea],
    requiredContextQuestions: [`Which files implement ${input.title}?`],
    allowedContextRequestHints: [`Request bounded prompt excerpts for ${input.title} if needed.`],
    expectedContextScoutOutput: ["Verified file refs.", "Risks and edit points."],
    expectedImplementationOutput: ["Changed-file refs."],
    expectedValidationOutput: ["Validation refs."],
    expectedReviewReadbackOutput: ["Review/readback refs."],
    requiredEvidenceClaimDescriptions: ["Evidence claim tied to this commitment."],
    stopIfMissing: ["Stop if no target files can be verified."],
    packetQualityReviewRefs: ["runtime-work-graph://packet-review/accepted"],
    uncertaintiesAndRisks: ["Repo target may need confirmation."],
    downstreamConsumer: "context_synthesis",
    synthesisImplementationGroups: [],
    synthesisDependencies: [],
    synthesisRisks: [],
    synthesisValidationStrategy: [],
    synthesisEscalationTriggers: [],
    synthesisQualityReviewed: false,
    synthesisQualityGatePassed: false,
    synthesisHasNonRuntimeContextSource: false,
    requiredContextSnapshotRefs: [],
    providedContextSnapshotRefs: [],
    staleContextSnapshotRefs: [],
    missingContextSnapshotRefs: [],
    rejectedContextSnapshotRefs: [],
    contextFreshnessStatus: "fresh",
    contextRefreshAction: "none",
    contextFreshnessSummary: "No context snapshot contract is required for this test packet.",
    rawFileContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  };
}

async function addPostSynthesisPolicyProbe(graphs: RuntimeWorkGraphRepository): Promise<void> {
  await graphs.addNode({
    graphId: "scheduler-graph",
    nodeId: "post-synthesis-policy-probe",
    nodeKind: "compiler",
    assignedRole: "compiler",
    nodeStatus: "succeeded",
    inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
    outputArtifactRefs: ["artifact://readback/post-synthesis-policy-probe"],
    metadata: {
      commitmentIdsAdvanced: ["code-edit"],
      rawPromptStored: false,
      rawResponseStored: false,
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

  it("requires accepted model-authored commitment packets before complex production scheduling", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireModelAuthoredCommitmentWorkPacketsForComplexMission: true,
        orchestrator: {
          async decide() {
            throw new Error("orchestrator_should_not_be_called_without_packets");
          },
        },
        executors: {
          "role:test_engineer": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("approved_commitment_work_packets_required");
      expect(result.reasonCodes).toContain("commitment_work_packet_missing:code-edit");
      expect(result.executedNodeIds).toEqual([]);
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

  it("reuses already-created node ids when a later graph revision repeats them", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-context",
          decisionKind: "add_nodes",
          rationaleForDecision: "Create a context node before implementation.",
          newNodes: [
            {
              nodeId: "shared-context",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Context refs.",
              acceptanceCriteria: ["Records context refs."],
              downstreamConsumer: "implementation_engineer",
            },
          ],
          reasonCodes: ["context_needed"],
        },
        {
          decisionId: "run-context",
          decisionKind: "run_node",
          rationaleForDecision: "Run the context node.",
          runNodeId: "shared-context",
          reasonCodes: ["run_context"],
        },
        {
          decisionId: "extend-after-context",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Extend the graph after context while preserving the existing context node id.",
          newNodes: [
            {
              nodeId: "shared-context",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              modelOrWorkerRef: "deepseek/deepseek-v4-flash",
              expectedOutput: "Existing context refs.",
              acceptanceCriteria: ["Already recorded context refs."],
              downstreamConsumer: "implementation_engineer",
            },
            {
              nodeId: "implementation-after-context",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "kimi/k2",
              inputHandoffRefs: ["shared-context"],
              expectedOutput: "Implementation refs.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
            },
          ],
          reasonCodes: ["implementation_after_context"],
        },
        {
          decisionId: "run-implementation",
          decisionKind: "run_node",
          rationaleForDecision: "Run the implementation node.",
          runNodeId: "implementation-after-context",
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
          "role:context_scout": succeededExecutor("context"),
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("succeeded");
      expect(snapshot?.nodes.map((node) => node.nodeId)).toEqual(
        expect.arrayContaining(["shared-context", "implementation-after-context"]),
      );
      expect(snapshot?.nodes).toHaveLength(2);
      expect(snapshot?.nodes.find((node) => node.nodeId === "shared-context")?.nodeStatus).toBe(
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
            },
            {
              nodeId: "implementation-duplicate",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "kimi/k2",
              expectedOutput: "Implementation refs.",
              acceptanceCriteria: ["Records changed-file refs."],
              downstreamConsumer: "test_engineer",
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
      expect(toolIds).toContain("scheduler.commitment_work_packet_readiness");
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
      expect(toolIds).toContain("scheduler.approve_and_run_first_node");
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
                    rationaleForDecision: "Add the same staged context node in each replay.",
                    runAfterAdd: false,
                    metadata: {
                      stagedSchedulerProtocolCompiled: true,
                      parallelIndependentNodesJustification:
                        "This replay-id test persists a single context node only.",
                    },
                    newNodes: [
                      {
                        nodeId: "context_scout-wu-context-product-spec-planning-runtime-map",
                        nodeKind: "context_scout",
                        capabilityId: "context_scout",
                        executorKey: "kind:context_scout",
                        workerRef: "deepseek/deepseek-v4-pro",
                        requiredMetadataSchemaRef: "schema://runtime-node/context-scout",
                        assignedRole: "context_scout",
                        modelOrWorkerRef: "deepseek/deepseek-v4-pro",
                        expectedOutput: "Context handoff packet.",
                        acceptanceCriteria: ["Finds relevant repo context."],
                        downstreamConsumer: "scheduler",
                        commitmentIdsAdvanced: ["context"],
                        whyThisRoleIsNeededNow: "Context is required before implementation.",
                        exactObjective: "Map Product/Spec Planning runtime files.",
                        metadata: {
                          stagedSchedulerProtocolCompiled: true,
                          expectedEvidence: ["context_handoff"],
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
            "kind:context_scout": succeededExecutor("context"),
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
          modelAuthoredNodeId: "context_scout-wu-context-product-spec-planning-runtime-map",
          runtimeOwnedNodeId: true,
        }),
      );
      expect(second?.nodes[0]?.metadata).toEqual(
        expect.objectContaining({
          modelAuthoredNodeId: "context_scout-wu-context-product-spec-planning-runtime-map",
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
                  nodeId: "context-flat",
                  capabilityId: "context_scout",
                  commitmentIdsAdvanced: ["code-edit"],
                  whyThisRoleIsNeededNow: "Context is needed.",
                  exactObjective: "Find files.",
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
          "role:context_scout": succeededExecutor("context"),
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

      expect(result.status).toBe("needs_review");
      expect(rejectInvocation).toBeTruthy();
      expect(rejectInvocation?.metadata).toMatchObject({
        decisionId: "flat-decomposition-rejected",
        repairFieldHints: expect.arrayContaining([
          "newEdges[] or metadata.parallelIndependentNodesJustification",
        ]),
        repairDiagnostics: expect.objectContaining({
          missingFields: expect.arrayContaining([
            expect.objectContaining({
              path: "newEdges[] or metadata.parallelIndependentNodesJustification",
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

      expect(result.status).toBe("needs_review");
      expect(snapshot?.graph.graphStatus).toBe("needs_review");
      expect(snapshot?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toContain(
        "scheduler_terminal_needs_review",
      );
    });
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

  it("stores symbolic future edge endpoints as metadata instead of writing invalid DB foreign keys", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-symbolic-edge",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Create context and implementation nodes while pointing to a future validation milestone.",
          newNodes: [
            {
              nodeId: "context-1",
              nodeKind: "context_scout",
              assignedRole: "context_scout",
              expectedOutput: "Bounded context handoff.",
              acceptanceCriteria: ["Finds target refs."],
              downstreamConsumer: "implementation",
            },
            {
              nodeId: "implementation-1",
              nodeKind: "implementation",
              assignedRole: "implementation_engineer",
              expectedOutput: "Source edit evidence.",
              acceptanceCriteria: ["Produces changed file refs."],
              downstreamConsumer: "future-validation-review-closeout",
            },
          ],
          newEdges: [
            {
              fromNodeId: "context-1",
              toNodeId: "implementation-1",
              edgeKind: "handoff",
              reasonCodes: ["context_to_implementation"],
            },
            {
              fromNodeId: "implementation-1",
              toNodeId: "future-validation-review-closeout",
              edgeKind: "handoff",
              reasonCodes: ["future_validation_milestone"],
            },
          ],
          runAfterAdd: true,
          runNodeId: "context-1",
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
          "role:context_scout": succeededExecutor("context"),
          "kind:implementation": succeededExecutor("implementation"),
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
      expect(symbolicEdge?.toNodeId).toBeNull();
      expect(symbolicEdge?.metadata).toMatchObject({
        symbolicToNodeId: "future-validation-review-closeout",
        runtimeOwnedEdgeId: true,
      });
    });
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
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:test_authoring": succeededExecutor("test"),
          "kind:validation": succeededExecutor("validation"),
        },
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

  it("derives executable graph edges from staged work-unit contracts before node materialization", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireGenericStagedSchedulerProtocol: true,
        maxIterations: 1,
        orchestrator: {
          async decide() {
            return {
              decisionId: "staged-no-explicit-edges",
              decisionKind: "add_nodes",
              rationaleForDecision:
                "Use staged scheduler fields; runtime should compile structural handoffs.",
              stagedScheduler: {
                workBreakdownUnits: [
                  {
                    workUnitId: "context",
                    objective: "Find the target files.",
                    commitmentIds: ["code-edit"],
                    expectedOutcome: "Context handoff refs.",
                  },
                  {
                    workUnitId: "edit",
                    objective: "Make the scoped edit.",
                    commitmentIds: ["code-edit"],
                    expectedOutcome: "Changed-file refs.",
                  },
                  {
                    workUnitId: "validate",
                    objective: "Validate the scoped edit.",
                    commitmentIds: ["validation"],
                    expectedOutcome: "Validation refs.",
                  },
                ],
                capabilitySelectionsForWorkUnits: [
                  {
                    workUnitId: "context",
                    capabilityId: "context_scout",
                    utilityRationale: "Cheap context reduces uncertainty before editing.",
                    costRationale: "Context scout is cheaper than implementation.",
                    stopOrEscalationCondition: "Stop if target files cannot be found.",
                  },
                  {
                    workUnitId: "edit",
                    capabilityId: "implementation_microtask",
                    utilityRationale: "A scoped edit advances the implementation commitment.",
                    costRationale: "Kimi lane is cheapest sufficient for a scoped edit.",
                    stopOrEscalationCondition: "Escalate if the edit is too broad.",
                  },
                  {
                    workUnitId: "validate",
                    capabilityId: "validation_run",
                    utilityRationale: "Validation closes proof commitments.",
                    costRationale: "Script validation is cheaper than model review.",
                    stopOrEscalationCondition: "Return validation failures to orchestrator.",
                  },
                ],
                nodeContractDrafts: [
                  {
                    workUnitId: "context",
                    roleRationale: "Context is needed before editing.",
                    objective: "Find files and patterns.",
                    expectedOutput: "Context refs.",
                    successCriteria: ["Names relevant files."],
                    downstreamConsumer: "implementation_engineer",
                  },
                  {
                    workUnitId: "edit",
                    roleRationale: "Implementation advances source changes.",
                    objective: "Patch the scoped files.",
                    expectedOutput: "Changed-file refs.",
                    successCriteria: ["Produces a bounded patch."],
                    downstreamConsumer: "test_engineer",
                  },
                  {
                    workUnitId: "validate",
                    roleRationale: "Validation proves the edit.",
                    objective: "Run focused validation.",
                    expectedOutput: "Validation refs.",
                    successCriteria: ["Records command result refs."],
                    downstreamConsumer: "orchestrator",
                  },
                ],
              },
              reasonCodes: ["staged_no_explicit_edges"],
            };
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.reasonCodes).toContain("staged_scheduler_runtime_derived_edges_compiled");
      expect(snapshot?.nodes).toHaveLength(3);
      expect(snapshot?.edges.length).toBeGreaterThanOrEqual(2);
      const modelNodeIdByRuntimeId = new Map(
        (snapshot?.nodes ?? []).map((node) => [node.nodeId, modelAuthoredNodeId(node)]),
      );
      expect(
        snapshot?.edges.map(
          (edge) =>
            `${modelNodeIdByRuntimeId.get(edge.fromNodeId ?? "")}->${modelNodeIdByRuntimeId.get(
              edge.toNodeId ?? "",
            )}`,
        ),
      ).toEqual(
        expect.arrayContaining([
          "context_scout-context->implementation-edit",
          "implementation-edit->validation-validate",
        ]),
      );
    });
  });

  it("still derives role-order edges when staged graph also includes a parallelism note", async () => {
    await withSchedulerGraph(async (graphs) => {
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireGenericStagedSchedulerProtocol: true,
        maxIterations: 1,
        orchestrator: {
          async decide() {
            return {
              decisionId: "staged-parallel-note-with-role-order",
              decisionKind: "add_nodes",
              rationaleForDecision:
                "Use staged fields; runtime should not let a parallelism note suppress required handoff edges.",
              stagedScheduler: {
                workBreakdownUnits: [
                  {
                    workUnitId: "context",
                    objective: "Find the target files.",
                    commitmentIds: ["code-edit"],
                    expectedOutcome: "Context handoff refs.",
                  },
                  {
                    workUnitId: "edit",
                    objective: "Make the scoped edit.",
                    commitmentIds: ["code-edit"],
                    expectedOutcome: "Changed-file refs.",
                  },
                  {
                    workUnitId: "validate",
                    objective: "Validate the scoped edit.",
                    commitmentIds: ["validation"],
                    expectedOutcome: "Validation refs.",
                  },
                ],
                capabilitySelectionsForWorkUnits: [
                  {
                    workUnitId: "context",
                    capabilityId: "context_scout",
                    utilityRationale: "Cheap context reduces uncertainty before editing.",
                    costRationale: "Context scout is cheaper than implementation.",
                    stopOrEscalationCondition: "Stop if target files cannot be found.",
                  },
                  {
                    workUnitId: "edit",
                    capabilityId: "implementation_microtask",
                    utilityRationale: "A scoped edit advances the implementation commitment.",
                    costRationale: "Kimi lane is cheapest sufficient for a scoped edit.",
                    stopOrEscalationCondition: "Escalate if the edit is too broad.",
                  },
                  {
                    workUnitId: "validate",
                    capabilityId: "validation_run",
                    utilityRationale: "Validation closes proof commitments.",
                    costRationale: "Script validation is cheaper than model review.",
                    stopOrEscalationCondition: "Return validation failures to orchestrator.",
                  },
                ],
                nodeContractDrafts: [
                  {
                    workUnitId: "context",
                    roleRationale: "Context is needed before editing.",
                    objective: "Find files and patterns.",
                    expectedOutput: "Context refs.",
                    successCriteria: ["Names relevant files."],
                    downstreamConsumer: "implementation_engineer",
                  },
                  {
                    workUnitId: "edit",
                    roleRationale: "Implementation advances source changes.",
                    objective: "Patch the scoped files.",
                    expectedOutput: "Changed-file refs.",
                    successCriteria: ["Produces a bounded patch."],
                    downstreamConsumer: "test_engineer",
                  },
                  {
                    workUnitId: "validate",
                    roleRationale: "Validation proves the edit.",
                    objective: "Run focused validation.",
                    expectedOutput: "Validation refs.",
                    successCriteria: ["Records command result refs."],
                    downstreamConsumer: "orchestrator",
                  },
                ],
                edgeOrParallelismDraft: {
                  parallelIndependentNodesJustification:
                    "Some implementation units can run in parallel after context is available.",
                },
              },
              reasonCodes: ["staged_parallel_note"],
            };
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.reasonCodes).toContain("staged_scheduler_runtime_derived_edges_compiled");
      const modelNodeIdByRuntimeId = new Map(
        (snapshot?.nodes ?? []).map((node) => [node.nodeId, modelAuthoredNodeId(node)]),
      );
      expect(
        snapshot?.edges.map(
          (edge) =>
            `${modelNodeIdByRuntimeId.get(edge.fromNodeId ?? "")}->${modelNodeIdByRuntimeId.get(
              edge.toNodeId ?? "",
            )}`,
        ),
      ).toEqual(
        expect.arrayContaining([
          "context_scout-context->implementation-edit",
          "implementation-edit->validation-validate",
        ]),
      );
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
      expect(result.reasonCodes).toContain("node_kind_not_executable_and_capability_missing");
      expect(result.reasonCodes).toContain("decision_new_nodes_missing");
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
          "kind:implementation": succeededExecutor("implementation"),
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

  it("normalizes command-shaped evidence claims to produced validation artifact refs", async () => {
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
          decisionKind: "request_validation",
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
            },
          ],
          runAfterAdd: true,
          reasonCodes: ["validation_needed"],
        },
        {
          decisionId: "stop-after-claims",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after checking normalized claim evidence.",
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
                evidenceClaims: [
                  {
                    commitmentId: "validation",
                    evidenceRef:
                      "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
                    evidenceKind: "test_validation",
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

      expect(result.reasonCodes).toContain(
        "evidence_claim_ref_normalized_to_output_artifact:validation:test_validation",
      );
      expect(evidenceRefsSeen).toEqual(["runtime-job://job/codex-direct-main-repo/validation"]);
      expect(result.reasonCodes).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("evidence_claim_ref_missing:pnpm test:file"),
        ]),
      );
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

      expect(claimsSeen).toEqual([
        {
          evidenceKind: "artifact",
          rawProviderLogStored: false,
        },
      ]);
      expect(result.reasonCodes).not.toContain("evidence_claim_raw_storage_flag_invalid");
      expect(result.reasonCodes).not.toContain(
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
          decisionKind: "request_validation",
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
                evidenceClaims: [
                  {
                    commitmentId: "validation",
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

  it("defers complex mission closeout when role diversity is missing", async () => {
    await withSchedulerGraph(async (graphs) => {
      const decisions = [
        {
          decisionId: "add-context-and-implementation",
          decisionKind: "add_nodes",
          rationaleForDecision: "Decompose but run implementation first for this proof.",
          workBreakdownUnits: [
            {
              workUnitId: "context-planned",
              objective: "Identify target files.",
              commitmentIds: ["code-edit"],
              rationale: "Context will be useful if implementation needs it.",
              expectedOutcome: "Context refs.",
            },
            {
              workUnitId: "implementation-only",
              objective: "Make the code edit and report validation refs.",
              commitmentIds: ["code-edit", "validation"],
              rationale: "Implementation evidence is required.",
              expectedOutcome: "Source and validation refs.",
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "context-planned",
              selectedCapabilityId: "context_scout",
              consideredCapabilityIds: ["context_scout"],
              utilityRationale: "Context is cheap and supports implementation.",
              costRationale: "Context scout is cheaper than implementation.",
              whyThisIsNotDuplicateWork: "No context node has run.",
              stopOrEscalationCondition: "Continue if target refs are identified.",
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
              workUnitId: "context-planned",
              roleRationale: "Context will be useful if implementation needs it.",
              objective: "Identify target files.",
              expectedOutput: "Context refs.",
              successCriteria: ["Names target files."],
              downstreamConsumer: "implementation_engineer",
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
                fromNodeId: "context-planned",
                toNodeId: "implementation-only",
                edgeKind: "handoff",
                reasonCodes: ["context_to_implementation"],
              },
            ],
          },
          runAfterAdd: true,
          runNodeId: "implementation-implementation-only",
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

  it("accepts the failed Product/Spec mission shape only through staged scheduler compilation", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "native-exec-37203fa1beda4bad-replay",
        ownerObjectiveSummary:
          "Implement Product/Spec Planning as a production scheduler-backed workflow.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "workflow-registration",
              commitmentText: "Register the Product/Spec Planning workflow surface.",
              whyItMatters: "The workflow must be first-class.",
              expectedEvidenceDescription: "Workflow definition and plugin refs.",
              status: "pending",
              blocking: true,
            },
            {
              commitmentId: "planning-lifecycle",
              commitmentText: "Implement Planning Capsule lifecycle behavior.",
              whyItMatters: "The workflow must produce useful plans.",
              expectedEvidenceDescription: "Planning capsule refs.",
              status: "pending",
              blocking: true,
            },
            {
              commitmentId: "validation-readback",
              commitmentText: "Add validation and Work Queue readback.",
              whyItMatters: "Owner needs proof and visibility.",
              expectedEvidenceDescription: "Validation and readback refs.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const decisions = [
        {
          decisionId: "failed-ledger-staged-decomposition",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Replay the failed Product/Spec mission as staged work units before any implementation runs.",
          workBreakdownUnits: [
            {
              workUnitId: "context-map",
              title: "Context map",
              objective: "Map workflow registration and readback files.",
              commitmentIds: ["workflow-registration", "validation-readback"],
              rationale: "Implementation needs bounded target refs first.",
              expectedOutcome: "Context handoff refs.",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "scoped-workflow-edit",
              title: "Scoped workflow edit",
              objective: "Implement the smallest workflow registration/readback edit.",
              commitmentIds: ["workflow-registration", "planning-lifecycle"],
              rationale: "A scoped non-Codex edit should be tried before broad Codex.",
              expectedOutcome: "Changed file refs.",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "validation-plan",
              title: "Validation plan",
              objective: "Run focused validation for the workflow changes.",
              commitmentIds: ["validation-readback"],
              rationale: "Validation evidence is a blocking commitment.",
              expectedOutcome: "Validation refs.",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "context-map",
              selectedCapabilityId: "context_scout",
              consideredCapabilityIds: ["context_scout", "implementation_complex"],
              utilityRationale: "Cheap context reduces uncertainty before editing.",
              costRationale: "Context scout is cheaper than Codex.",
              whyThisIsNotDuplicateWork: "No context handoff exists yet.",
              stopOrEscalationCondition: "Return to orchestrator if target refs are unclear.",
            },
            {
              workUnitId: "scoped-workflow-edit",
              selectedCapabilityId: "implementation_microtask",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              utilityRationale:
                "Try the cheaper scoped implementation lane before broad Codex integration.",
              costRationale: "Kimi lane is cheaper and the work unit is bounded.",
              whyCheaperOptionsWereInsufficient: "",
              whyThisIsNotDuplicateWork: "No source edit evidence exists yet.",
              stopOrEscalationCondition:
                "Escalate to Codex complex only if validation or scope exceeds the microtask lane.",
            },
            {
              workUnitId: "validation-plan",
              selectedCapabilityId: "validation_run",
              consideredCapabilityIds: ["validation_run", "implementation_complex"],
              utilityRationale: "Validation runner produces direct proof refs.",
              costRationale: "Script validation is cheaper than a model implementation call.",
              whyThisIsNotDuplicateWork: "No validation evidence exists yet.",
              stopOrEscalationCondition: "Return failures to orchestrator for repair.",
            },
          ],
          nodeContractDrafts: [
            {
              workUnitId: "context-map",
              roleRationale: "The next workers need file refs and integration risks.",
              objective: "Inspect workflow registration, scheduler, and readback surfaces.",
              expectedOutput: "Bounded context handoff.",
              successCriteria: ["Names target files.", "Identifies executor/readback risks."],
              downstreamConsumer: "implementation_engineer",
            },
            {
              workUnitId: "scoped-workflow-edit",
              roleRationale: "A scoped implementation can advance registration safely.",
              objective: "Patch the minimal workflow registration/readback surface.",
              inputRefs: ["runtime-node://context-map"],
              expectedOutput: "Changed file refs.",
              successCriteria: ["Changes approved files.", "Emits evidence claims."],
              downstreamConsumer: "test_engineer",
            },
            {
              workUnitId: "validation-plan",
              roleRationale: "Validation evidence is required before closeout.",
              objective: "Run focused workflow tests.",
              inputRefs: ["runtime-node://scoped-workflow-edit"],
              expectedOutput: "Validation refs.",
              successCriteria: ["Records command ref.", "Maps failures to commitments."],
              downstreamConsumer: "reviewer",
            },
          ],
          edgeOrParallelismDraft: {
            edges: [
              { fromNodeId: "context-map", toNodeId: "scoped-workflow-edit", edgeKind: "handoff" },
              {
                fromNodeId: "scoped-workflow-edit",
                toNodeId: "validation-plan",
                edgeKind: "handoff",
              },
            ],
          },
          runAfterAdd: false,
          reasonCodes: ["failed_ledger_replay_staged"],
        },
        {
          decisionId: "lane-stop-before-implementation",
          decisionKind: "mark_needs_review",
          rationaleForDecision:
            "The lane proof intentionally stops after graph acceptance without running implementation.",
          reasonCodes: ["lane_stopped_before_implementation_by_design"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        requireCostAwareCapabilityPolicy: true,
        requireEvidenceClaimsForMissionLedger: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
        },
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.executedNodeIds).toEqual([]);
      expect(result.reasonCodes).toContain("staged_scheduler_graph_compiled");
      expect(snapshot?.nodes.map(modelAuthoredNodeId)).toEqual([
        "context_scout-context-map",
        "implementation-scoped-workflow-edit",
        "validation-validation-plan",
      ]);
      expect(snapshot?.edges).toHaveLength(2);
      expect(snapshot?.nodes.map((node) => node.nodeStatus)).toEqual([
        "planned",
        "planned",
        "planned",
      ]);
    });
  });

  it("accepts a progressive context-first staged graph before implementation is knowable", async () => {
    await withSchedulerGraph(async (graphs) => {
      const missionLedger = normalizeMissionContractLedger({
        missionId: "context-first-replay",
        ownerObjectiveSummary:
          "Implement a complex workflow upgrade that needs repo context before splitting edits.",
        value: {
          blockingCommitments: [
            {
              commitmentId: "workflow-context",
              commitmentText: "Find the workflow registration and readback surfaces.",
              whyItMatters: "Implementation cannot be scoped until target files are known.",
              expectedEvidenceDescription: "Context handoff refs.",
              status: "pending",
              blocking: true,
            },
            {
              commitmentId: "workflow-edit",
              commitmentText: "Implement source changes after context is available.",
              whyItMatters: "The owner asked for production code.",
              expectedEvidenceDescription: "Changed-file refs and validation refs.",
              status: "pending",
              blocking: true,
            },
          ],
        },
      });
      const decisions = [
        {
          decisionId: "context-first",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Start with context acquisition because implementation work units need verified target refs first.",
          stagedScheduler: {
            workBreakdownUnits: [
              {
                workUnitId: "target-context",
                title: "Target context",
                objective: "Identify repo files and handoff risks before implementation.",
                commitmentIds: ["workflow-context"],
                rationale: "Context must precede implementation split.",
                expectedOutcome: "Bounded context handoff.",
                targetRefs: ["extensions/execution-platform/src/workflows/"],
              },
            ],
            capabilitySelectionsForWorkUnits: [
              {
                workUnitId: "target-context",
                selectedCapabilityId: "context_scout",
                consideredCapabilityIds: ["context_scout"],
                utilityRationale: "Cheap context reduces uncertainty before source edits.",
                costRationale: "Context scout is cheaper than broad implementation.",
                whyThisIsNotDuplicateWork: "No context evidence exists yet.",
                stopOrEscalationCondition:
                  "Return to orchestrator if target refs are missing or ambiguous.",
              },
            ],
            nodeContractDrafts: [
              {
                workUnitId: "target-context",
                roleRationale: "Implementation workers need concrete target refs.",
                objective: "Map workflow integration and readback targets.",
                expectedOutput: "Context handoff packet with file refs.",
                successCriteria: ["Names target files.", "Identifies downstream edit risks."],
                downstreamConsumer: "orchestrator",
                targetRefs: ["extensions/execution-platform/src/workflows/"],
              },
            ],
          },
          runAfterAdd: true,
          reasonCodes: ["progressive_context_first"],
        },
        {
          decisionId: "stop-after-context",
          decisionKind: "mark_needs_review",
          rationaleForDecision:
            "Lane stops after proving context-first graph acceptance and execution.",
          reasonCodes: ["lane_stopped_after_context"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger,
        requireCostAwareCapabilityPolicy: true,
        requireEvidenceClaimsForMissionLedger: false,
        requireGenericStagedSchedulerProtocol: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "role:context_synthesis": succeededExecutor("context-synthesis"),
        },
        maxDecisionRepairAttempts: 0,
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      const modelNodeIdByRuntimeId = new Map(
        (snapshot?.nodes ?? []).map((node) => [node.nodeId, modelAuthoredNodeId(node)]),
      );
      expect(result.executedNodeIds.map((nodeId) => modelNodeIdByRuntimeId.get(nodeId))).toEqual([
        "context_scout-target-context",
        "context_synthesis_global_barrier",
      ]);
      expect(result.reasonCodes).toContain(
        "runtime_policy_context_synthesis_barrier_bypassed_orchestrator_decision",
      );
      expect(result.reasonCodes).toContain("staged_scheduler_graph_compiled");
      expect(result.reasonCodes).not.toContain(
        "complex_mission_first_decision_requires_multi_node_decomposition",
      );
      expect(result.reasonCodes).not.toContain(
        "generic_staged_scheduler_edges_or_parallel_justification_required",
      );
      expect(snapshot?.nodes.map(modelAuthoredNodeId)).toEqual([
        "context_scout-target-context",
        "context_synthesis_global_barrier",
      ]);
      expect(snapshot?.edges.map((edge) => edge.edgeKind)).toEqual(["context_supplies"]);
    });
  });

  it("creates a deterministic global synthesis barrier after accepted context before implementation", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      let orchestratorCalls = 0;
      const decisionInputs: RuntimeWorkGraphSchedulerDecisionInput[] = [];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide(input) {
            orchestratorCalls += 1;
            decisionInputs.push(input);
            return {
              decisionId: "stop-after-deterministic-context-synthesis",
              decisionKind: "mark_needs_review",
              rationaleForDecision:
                "Stop after proving the deterministic context synthesis barrier ran before orchestrator-controlled downstream work.",
              reasonCodes: ["deterministic_context_synthesis_barrier_proven"],
            };
          },
        },
        beforeNodeExecution: async ({ node }) =>
          node.nodeKind === "implementation"
            ? {
                status: "needs_review",
                selectedNodeId: node.nodeId,
                reasonCodes: [
                  "post_synthesis_compiler_test_stopped_before_implementation_execution",
                ],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }
            : null,
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
          "kind:reviewer": succeededExecutor("reviewer"),
          "kind:observability_readback": succeededExecutor("readback"),
          "kind:closeout": succeededExecutor("closeout"),
          "role:implementation_engineer": succeededExecutor("implementation"),
          "role:context_synthesis": {
            async execute(input) {
              return {
                status: "succeeded",
                outputArtifactRefs: [`artifact://context-synthesis/${input.node.nodeId}`],
                reasonCodes: ["context_synthesis_completed"],
                metadata: {
                  contextSynthesis: {
                    artifactKind: "context_synthesis",
                    synthesisRef: "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
                    implementationReadiness: "ready",
                    implementationGroups: [
                      {
                        groupId: "runtime-workflow",
                        objective:
                          "Implement runtime workflow registration and Work Queue readback.",
                        commitmentIds: ["code-edit", "validation"],
                        inputHandoffRefs: ["runtime-job://job/context/product-spec"],
                        recommendedCapabilityIds: ["implementation_microtask"],
                        targetRefs: ["extensions/execution-platform/src/workflows/"],
                        successCriteria: ["Registers workflow.", "Surfaces readback refs."],
                        workerFitRationale:
                          "This is a bounded implementation task over one runtime surface.",
                      },
                    ],
                    dependencyMap: [],
                    parallelismPlan: "Implementation can run after this global synthesis handoff.",
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  },
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                },
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

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "runtime_policy_context_synthesis_barrier_bypassed_orchestrator_decision",
      );
      expect(result.reasonCodes).toContain("runtime_policy_context_synthesis_barrier_created");
      expect(result.reasonCodes).toContain("runtime_compiled_post_synthesis_graph_created");
      expect(orchestratorCalls).toBeLessThanOrEqual(1);
      expect(result.executedNodeIds).toEqual(["g-af4585f691-context_synthesis_global_barrier"]);
      expect(new Set(snapshot?.nodes.map((node) => node.nodeKind))).toEqual(
        new Set([
          "context_scout",
          "context_synthesis",
          "implementation",
          "validation",
          "reviewer",
          "observability_readback",
          "closeout",
        ]),
      );
      expect(snapshot?.edges.map((edge) => edge.edgeKind)).toEqual(
        expect.arrayContaining(["context_supplies", "synthesis_groups", "validation_depends_on"]),
      );
    });
  });

  it("uses graph compile handoff instead of truncated owner synthesis summary", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      const groups = Array.from({ length: 9 }, (_, index) => ({
        groupId: `group-${index + 1}`,
        objective: `Implement Product/Spec planning slice ${index + 1}.`,
        commitmentIds: index % 2 === 0 ? ["code-edit"] : ["validation"],
        inputHandoffRefs: ["runtime-job://job/context/product-spec"],
        recommendedCapabilityIds: ["implementation_microtask"],
        targetRefs: [`extensions/execution-platform/src/workflows/product-spec-${index + 1}.ts`],
        successCriteria: [`Slice ${index + 1} emits bounded evidence.`],
        expectedOutput: `Changed refs for Product/Spec slice ${index + 1}.`,
        validationNeeds: [`Validate slice ${index + 1}.`],
        reviewNeeds: [`Review slice ${index + 1}.`],
        workerFitRationale: "Scoped implementation is cheaper than broad Codex integration.",
      }));
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxIterations: 3,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "stop-after-compile-handoff-test",
              decisionKind: "mark_needs_review",
              rationaleForDecision:
                "Stop after proving graph compile handoff produced all implementation nodes.",
              reasonCodes: ["compile_handoff_test_completed"],
            };
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
          "kind:reviewer": succeededExecutor("reviewer"),
          "kind:observability_readback": succeededExecutor("readback"),
          "kind:closeout": succeededExecutor("closeout"),
          "role:implementation_engineer": succeededExecutor("implementation"),
          "role:context_synthesis": {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: [
                  "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
                ],
                reasonCodes: ["context_synthesis_completed"],
                metadata: {
                  contextSynthesisGraphCompile: {
                    artifactKind: "context_synthesis_graph_compile_handoff",
                    synthesisRef: "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
                    implementationReadiness: "ready",
                    implementationGroupCount: 9,
                    implementationGroupsIncludedCount: 9,
                    compileHandoffComplete: true,
                    implementationGroups: groups,
                    dependencyMap: [],
                    parallelismPlan: "All nine groups are independent after synthesis.",
                    schedulerHandoff: {
                      readyForGraphCompile: true,
                      implementationGroupCount: 9,
                      dependencyCount: 0,
                      parallelGroupCount: 9,
                      blockerCount: 0,
                      validationLaneCount: 1,
                      reviewLaneCount: 1,
                      graphCompileInputSummary:
                        "Nine implementation groups are ready for graph compilation.",
                      workerFitSummary:
                        "Use scoped implementation workers for the implementation groups.",
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                    },
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  },
                  contextSynthesis: {
                    artifactKind: "context_synthesis",
                    synthesisRef: "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
                    implementationReadiness: "ready",
                    implementationGroupCount: 9,
                    implementationGroups: groups.slice(0, 2),
                    implementationGroupsTruncated: true,
                    dependencyMap: [],
                    schedulerHandoff: {
                      readyForGraphCompile: true,
                      implementationGroupCount: 9,
                      dependencyCount: 0,
                      parallelGroupCount: 9,
                      blockerCount: 0,
                      validationLaneCount: 1,
                      reviewLaneCount: 1,
                      graphCompileInputSummary:
                        "Owner-facing metadata is truncated and must not drive graph compile.",
                      workerFitSummary: "Summary only.",
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                    },
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  },
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                },
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
      const implementationNodes =
        snapshot?.nodes.filter((node) => node.nodeKind === "implementation") ?? [];

      expect(result.reasonCodes).toContain("runtime_compiled_post_synthesis_graph_created");
      expect(result.reasonCodes).toContain(
        "runtime_compiled_post_synthesis_implementation_group_count:9",
      );
      expect(implementationNodes).toHaveLength(9);
    });
  });

  it("fans out one dedicated context scout per accepted commitment packet before synthesis", async () => {
    await withSchedulerGraph(async (graphs) => {
      let orchestratorCalls = 0;
      const packets = [
        commitmentPacket({
          commitmentId: "code-edit",
          title: "Implement the requested code",
          repoArea: "extensions/execution-platform/src/workflows/",
        }),
        commitmentPacket({
          commitmentId: "validation",
          title: "Validate the requested code",
          repoArea: "extensions/execution-platform/src/workflows/",
        }),
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        commitmentWorkPackets: packets,
        requireModelAuthoredCommitmentWorkPacketsForComplexMission: true,
        requireEvidenceClaimsForMissionLedger: false,
        maxParallelNodeExecutions: 4,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            orchestratorCalls += 1;
            return {
              decisionId: "stop-after-packet-fanout-and-synthesis",
              decisionKind: "mark_needs_review",
              rationaleForDecision:
                "Stop after proving packet-level context fanout and synthesis ran before implementation.",
              reasonCodes: ["packet_context_fanout_synthesis_proven"],
            };
          },
        },
        executors: {
          "role:context_scout": succeededExecutor("context"),
          "role:context_synthesis": succeededExecutor("context-synthesis"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const contextScoutNodes =
        snapshot?.nodes.filter((node) => node.nodeKind === "context_scout") ?? [];
      const synthesisNode = snapshot?.nodes.find((node) => node.nodeKind === "context_synthesis");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("runtime_policy_packet_context_fanout_created");
      expect(result.reasonCodes).toContain(
        "runtime_policy_packet_context_fanout_bypassed_orchestrator_decision",
      );
      expect(result.reasonCodes).toContain("scheduler_parallel_frontier_executed");
      expect(result.reasonCodes).toContain("parallel_frontier_node_count:2");
      expect(result.reasonCodes).toContain("runtime_policy_context_synthesis_barrier_created");
      expect(orchestratorCalls).toBe(0);
      expect(result.reasonCodes).toContain(
        "runtime_compiled_post_synthesis_graph_requires_synthesis_artifact_summary",
      );
      expect(contextScoutNodes).toHaveLength(2);
      expect(contextScoutNodes.map((node) => node.nodeStatus).toSorted()).toEqual([
        "succeeded",
        "succeeded",
      ]);
      expect(
        contextScoutNodes.map((node) => ({
          commitmentIds: (node.metadata as Record<string, unknown>).commitmentIdsAdvanced,
          inputHandoffRefs: node.inputHandoffRefs,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            commitmentIds: ["code-edit"],
            inputHandoffRefs: [packets[0]!.packetRef],
          },
          {
            commitmentIds: ["validation"],
            inputHandoffRefs: [packets[1]!.packetRef],
          },
        ]),
      );
      expect(synthesisNode?.nodeStatus).toBe("succeeded");
      expect(
        snapshot?.edges.filter((edge) => edge.toNodeId === synthesisNode?.nodeId),
      ).toHaveLength(2);
    });
  });

  it("does not rerun context synthesis when a bounded synthesis artifact needs boundary repair", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-a",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/a"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context_synthesis_global_barrier",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "needs_review",
        outputArtifactRefs: [
          "runtime-work-graph://scheduler-graph/context-synthesis/partial-synthesis",
        ],
        metadata: {
          contextSynthesisRef:
            "runtime-work-graph://scheduler-graph/context-synthesis/partial-synthesis",
          contextSynthesisStatus: "needs_review",
          lastStatusReasonCodes: [
            "context_synthesis_validation_failed",
            "context_synthesis_group_expected_output_missing:synthesis-group-3",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      let synthesisExecutorCalls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: false,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "stop",
              decisionKind: "mark_needs_review",
              rationaleForDecision: "Stop.",
              reasonCodes: ["stop"],
            };
          },
        },
        executors: {
          "role:context_synthesis": {
            async execute() {
              synthesisExecutorCalls += 1;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://unexpected-context-synthesis-rerun"],
                reasonCodes: ["unexpected_context_synthesis_rerun"],
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

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("context_synthesis_artifact_repair_required_not_rerun");
      expect(synthesisExecutorCalls).toBe(0);
      expect(snapshot?.nodes.filter((node) => node.nodeKind === "context_synthesis")).toHaveLength(
        1,
      );
    });
  });

  it("reuses structurally identical scheduler edges across retries instead of duplicating dependencies", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-a",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["artifact://context/a"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "planned",
      });
      await graphs.addEdge({
        graphId: "scheduler-graph",
        edgeId: "existing-context-supplies-edge",
        fromNodeId: "context-a",
        toNodeId: "synthesis",
        edgeKind: "context_supplies",
        reasonCodes: ["existing_edge"],
      });
      let calls = 0;
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireEvidenceClaimsForMissionLedger: false,
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            calls += 1;
            if (calls === 1) {
              return {
                decisionId: "retry-same-edge",
                decisionKind: "add_nodes",
                rationaleForDecision:
                  "Retry persisted graph structure with the same dependency edge.",
                newNodes: [
                  {
                    nodeId: "context-a",
                    nodeKind: "context_scout",
                    assignedRole: "context_scout",
                    inputHandoffRefs: [],
                    expectedOutput: "Context already exists.",
                    acceptanceCriteria: ["Context exists."],
                    commitmentIdsAdvanced: ["code-edit"],
                  },
                  {
                    nodeId: "synthesis",
                    nodeKind: "context_synthesis",
                    assignedRole: "context_synthesis",
                    inputHandoffRefs: ["artifact://context/a"],
                    expectedOutput: "Synthesize context.",
                    acceptanceCriteria: ["Synthesis runs after context."],
                    commitmentIdsAdvanced: ["code-edit"],
                  },
                ],
                newEdges: [
                  {
                    edgeId: "retry-context-supplies-edge",
                    fromNodeId: "context-a",
                    toNodeId: "synthesis",
                    edgeKind: "context_supplies",
                    reasonCodes: ["retry_same_structural_edge"],
                  },
                ],
                runAfterAdd: false,
              };
            }
            return {
              decisionId: "stop",
              decisionKind: "mark_needs_review",
              rationaleForDecision: "Stop after edge idempotency proof.",
              reasonCodes: ["edge_idempotency_proven"],
            };
          },
        },
        executors: {},
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(snapshot?.edges.filter((edge) => edge.edgeKind === "context_supplies")).toHaveLength(
        1,
      );
    });
  });

  it("requires synthesized context handoff refs on downstream nodes after synthesis is accepted", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await addPostSynthesisPolicyProbe(graphs);
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "implementation-without-synthesis-input",
              decisionKind: "add_nodes",
              rationaleForDecision: "Implementation lacks a synthesized context input ref.",
              newNodes: [
                {
                  nodeId: "implementation-missing-handoff",
                  nodeKind: "implementation",
                  capabilityId: "implementation_microtask",
                  assignedRole: "implementation_engineer",
                  commitmentIdsAdvanced: ["code-edit"],
                  whyThisRoleIsNeededNow: "Implementation is now allowed only with handoffs.",
                  exactObjective: "Implement the code edit.",
                  evidenceExpectation: "Changed-file refs.",
                  expectedOutput: "Changed-file refs.",
                  acceptanceCriteria: ["Records source edits."],
                  downstreamConsumer: "validation",
                },
              ],
              reasonCodes: ["implementation_missing_synthesis_handoff"],
            };
          },
        },
        executors: {
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes.length).toBeGreaterThan(0);
    });
  });

  it("requires synthesized context handoff refs before running existing downstream nodes", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-existing",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "run-existing-without-handoff",
              decisionKind: "run_node",
              rationaleForDecision: "Try to run an implementation node with no synthesis input.",
              runNodeId: "implementation-existing",
              reasonCodes: ["run_existing_without_handoff"],
            };
          },
        },
        executors: {
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "context_synthesis_input_handoff_required:implementation-existing",
      );
    });
  });

  it("rejects post-synthesis graphs that let broad Codex implementation absorb every role", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await addPostSynthesisPolicyProbe(graphs);
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return {
              decisionId: "codex-monopoly-post-synthesis",
              decisionKind: "add_nodes",
              rationaleForDecision: "Use Codex for all post-synthesis work.",
              newNodes: [
                {
                  nodeId: "implementation-all",
                  nodeKind: "implementation",
                  capabilityId: "implementation_complex",
                  assignedRole: "implementation_engineer",
                  inputHandoffRefs: [
                    "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
                  ],
                  commitmentIdsAdvanced: ["code-edit", "validation"],
                  whyThisRoleIsNeededNow: "Codex can do everything.",
                  exactObjective: "Implement, validate, review, read back, and close out.",
                  evidenceExpectation: "All evidence.",
                  expectedOutput: "All evidence.",
                  acceptanceCriteria: ["Finish the mission."],
                  downstreamConsumer: "closeout",
                  metadata: {
                    capabilityId: "implementation_complex",
                    consideredCapabilityIds: ["implementation_complex"],
                    utilityRationale: "Strongest model.",
                    costRationale: "Premium model is safest.",
                    whyThisIsNotDuplicateWork: "No post-synthesis work has run.",
                    stopOrEscalationCondition: "Stop if Codex fails.",
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  },
                },
              ],
              newEdges: [],
              reasonCodes: ["codex_monopoly"],
              metadata: {
                parallelIndependentNodesJustification: "Single node has no peers.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            };
          },
        },
        executors: {
          "role:implementation_engineer": succeededExecutor("implementation"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain(
        "post_synthesis_graph_role_obligation_missing:validation",
      );
      expect(result.reasonCodes).toContain("post_synthesis_graph_role_obligation_missing:review");
      expect(result.reasonCodes).toContain(
        "post_synthesis_graph_role_obligation_missing:docs_or_readback",
      );
      expect(result.reasonCodes).toContain("post_synthesis_graph_role_obligation_missing:closeout");
      expect(result.reasonCodes).toContain(
        "post_synthesis_graph_no_cheaper_or_specialized_node_represented",
      );
      expect(result.executedNodeIds).toEqual([]);
    });
  });

  it("evaluates post-synthesis repair additions against the complete existing graph", () => {
    const validation = validatePostSynthesisGraphDecision({
      missionLedger: complexMissionLedger(),
      capabilityManifest: buildRuntimeNodeCapabilityManifest(),
      snapshotSummary: {
        workflowId: "agent_team.coding",
        graphStatus: "running",
        nodeSummaries: [
          {
            nodeId: "context-synthesis",
            nodeKind: "context_synthesis",
            assignedRole: "context_synthesis",
            nodeStatus: "succeeded",
            capabilityId: "context_synthesis",
            outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
          },
          {
            nodeId: "implementation-cheap",
            nodeKind: "implementation",
            assignedRole: "implementation_engineer",
            nodeStatus: "needs_review",
            capabilityId: "implementation_microtask",
            commitmentIdsAdvanced: ["code-edit"],
            outputArtifactRefs: ["runtime-job://job/worker/implementation-cheap"],
          },
          {
            nodeId: "validation-existing",
            nodeKind: "validation",
            assignedRole: "test_engineer",
            nodeStatus: "planned",
            capabilityId: "validation_run",
            commitmentIdsAdvanced: ["validation"],
            outputArtifactRefs: [],
          },
          {
            nodeId: "review-existing",
            nodeKind: "reviewer",
            assignedRole: "reviewer",
            nodeStatus: "planned",
            capabilityId: "reviewer",
            commitmentIdsAdvanced: ["code-edit", "validation"],
            outputArtifactRefs: [],
          },
          {
            nodeId: "readback-existing",
            nodeKind: "observability_readback",
            assignedRole: "observability",
            nodeStatus: "planned",
            capabilityId: "observability_readback",
            commitmentIdsAdvanced: ["code-edit", "validation"],
            outputArtifactRefs: [],
          },
          {
            nodeId: "closeout-existing",
            nodeKind: "closeout",
            assignedRole: "closeout",
            nodeStatus: "planned",
            capabilityId: "coding_closeout",
            commitmentIdsAdvanced: ["code-edit", "validation"],
            outputArtifactRefs: [],
          },
        ],
        edgeSummaries: [],
        edgeCount: 0,
        humanTaskCount: 0,
        latestCheckpointKinds: [],
      },
      decision: {
        decisionId: "repair-add-complex-node",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Escalate one failed scoped implementation node while preserving the existing validation, review, readback, and closeout graph.",
        newNodes: [
          {
            nodeId: "implementation-complex-repair",
            nodeKind: "implementation",
            capabilityId: "implementation_complex",
            assignedRole: "implementation_engineer",
            inputHandoffRefs: ["runtime-job://job/worker/implementation-cheap"],
            commitmentIdsAdvanced: ["code-edit"],
            whyThisRoleIsNeededNow:
              "The cheaper worker failed structural validation and rolled back.",
            exactObjective: "Repair the failed implementation evidence.",
            evidenceExpectation: "Changed-file and validation-ready evidence refs.",
            expectedOutput: "Changed-file refs and evidence claims.",
            acceptanceCriteria: ["The repair compiles and validation can run."],
            downstreamConsumer: "validation-existing",
            metadata: {
              capabilityId: "implementation_complex",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              whyCheaperOptionsWereInsufficient:
                "implementation_microtask already attempted the scoped edit and rolled back after validation failure.",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          },
        ],
        newEdges: [
          {
            edgeId: "complex-to-validation",
            fromNodeId: "implementation-complex-repair",
            toNodeId: "validation-existing",
            edgeKind: "handoff",
            reasonCodes: ["repair_handoff"],
            artifactRefs: [],
          },
        ],
        reasonCodes: ["repair_escalation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).not.toContain(
      "post_synthesis_graph_role_obligation_missing:validation",
    );
    expect(validation.reasonCodes).not.toContain(
      "post_synthesis_graph_role_obligation_missing:review",
    );
    expect(validation.reasonCodes).not.toContain(
      "post_synthesis_graph_role_obligation_missing:docs_or_readback",
    );
    expect(validation.reasonCodes).not.toContain(
      "post_synthesis_graph_role_obligation_missing:closeout",
    );
  });

  it("passes post-synthesis role obligations and field-specific readback repair diagnostics to the orchestrator", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await addPostSynthesisPolicyProbe(graphs);
      const seenInputs: RuntimeWorkGraphSchedulerDecisionInput[] = [];
      const decisions = [
        {
          decisionId: "missing-readback-post-synthesis",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Add implementation, validation, review, and closeout but accidentally omit the readback/docs role.",
          stagedScheduler: {
            workBreakdownUnits: [
              {
                workUnitId: "implementation",
                objective: "Apply the source edit.",
                commitmentIds: ["code-edit"],
                rationale: "Source changes are required.",
                expectedOutcome: "Changed-file refs.",
              },
              {
                workUnitId: "validation",
                objective: "Run focused validation.",
                commitmentIds: ["validation"],
                rationale: "Validation is required.",
                expectedOutcome: "Validation refs.",
              },
              {
                workUnitId: "review",
                objective: "Review evidence.",
                commitmentIds: ["code-edit", "validation"],
                rationale: "Review is required.",
                expectedOutcome: "Review refs.",
              },
              {
                workUnitId: "closeout",
                objective: "Generate closeout.",
                commitmentIds: ["code-edit", "validation"],
                rationale: "Closeout is required.",
                expectedOutcome: "Closeout refs.",
              },
            ],
            capabilitySelectionsForWorkUnits: [
              {
                workUnitId: "implementation",
                selectedCapabilityId: "implementation_microtask",
                consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
                utilityRationale: "Bounded source edit.",
                costRationale: "Cheaper than Codex for scoped edits.",
                whyThisIsNotDuplicateWork: "No implementation evidence exists.",
                stopOrEscalationCondition: "Escalate if file scope expands.",
              },
              {
                workUnitId: "validation",
                selectedCapabilityId: "validation_run",
                consideredCapabilityIds: ["validation_run"],
                utilityRationale: "Validation produces command refs.",
                costRationale: "Script runner is cheapest.",
                whyThisIsNotDuplicateWork: "No validation evidence exists.",
                stopOrEscalationCondition: "Return failures for repair.",
              },
              {
                workUnitId: "review",
                selectedCapabilityId: "reviewer",
                consideredCapabilityIds: ["reviewer"],
                utilityRationale: "Reviewer judges sufficiency.",
                costRationale: "Specialized review is cheaper than implementation.",
                whyThisIsNotDuplicateWork: "No review evidence exists.",
                stopOrEscalationCondition: "Return findings for repair.",
              },
              {
                workUnitId: "closeout",
                selectedCapabilityId: "coding_closeout",
                consideredCapabilityIds: ["coding_closeout"],
                utilityRationale: "Closeout synthesizes evidence.",
                costRationale: "Specialized closeout node.",
                whyThisIsNotDuplicateWork: "No closeout exists.",
                stopOrEscalationCondition: "Needs review if commitments remain open.",
              },
            ],
            nodeContractDrafts: [
              {
                workUnitId: "implementation",
                roleRationale: "Implementation applies the source edit.",
                objective: "Apply the source edit.",
                inputRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
                expectedOutput: "Changed-file refs.",
                successCriteria: ["Emits source evidence."],
                downstreamConsumer: "validation",
              },
              {
                workUnitId: "validation",
                roleRationale: "Validation must run separately.",
                objective: "Run validation.",
                inputRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
                expectedOutput: "Validation refs.",
                successCriteria: ["Records command refs."],
                downstreamConsumer: "review",
              },
              {
                workUnitId: "review",
                roleRationale: "Review validates evidence sufficiency.",
                objective: "Review evidence.",
                inputRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
                expectedOutput: "Review refs.",
                successCriteria: ["Maps findings to commitments."],
                downstreamConsumer: "closeout",
              },
              {
                workUnitId: "closeout",
                roleRationale: "Closeout must be model-authored.",
                objective: "Generate closeout.",
                inputRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
                expectedOutput: "Closeout refs.",
                successCriteria: ["Cites accepted evidence."],
                downstreamConsumer: "owner",
              },
            ],
            edgeOrParallelismDraft: {
              edges: [
                {
                  fromWorkUnitId: "implementation",
                  toWorkUnitId: "validation",
                  edgeKind: "handoff",
                },
                { fromWorkUnitId: "validation", toWorkUnitId: "review", edgeKind: "handoff" },
                { fromWorkUnitId: "review", toWorkUnitId: "closeout", edgeKind: "handoff" },
              ],
            },
          },
          reasonCodes: ["missing_readback_regression"],
        },
        {
          decisionId: "stop-after-readback-diagnostics",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after verifying field-specific repair diagnostics.",
          reasonCodes: ["readback_diagnostics_observed"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 1,
        orchestrator: {
          async decide(input) {
            seenInputs.push(input);
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
          "kind:reviewer": succeededExecutor("reviewer"),
          "kind:observability_readback": succeededExecutor("readback"),
          "kind:closeout": succeededExecutor("closeout"),
        },
      });

      const result = await scheduler.run("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(seenInputs[0]?.postSynthesisRoleObligationGuidance?.applies).toBe(true);
      expect(seenInputs[0]?.postSynthesisRoleObligationGuidance?.requiredRoleObligations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            obligation: "docs_or_readback",
            validCapabilityIds: expect.arrayContaining(["observability_readback"]),
          }),
          expect.objectContaining({
            obligation: "implementation",
            validCapabilityIds: expect.arrayContaining(["implementation_microtask"]),
            preferredCapabilityIds: expect.arrayContaining(["implementation_microtask"]),
          }),
          expect.objectContaining({
            obligation: "review",
            validCapabilityIds: expect.arrayContaining(["reviewer"]),
          }),
          expect.objectContaining({
            obligation: "closeout",
            validCapabilityIds: expect.arrayContaining(["coding_closeout"]),
          }),
        ]),
      );
      expect(seenInputs[1]?.repairDiagnostics?.rejectedReasonCodes).toContain(
        "post_synthesis_graph_role_obligation_missing:docs_or_readback",
      );
      expect(seenInputs[1]?.repairDiagnostics?.missingFields.map((field) => field.path)).toContain(
        "stagedScheduler.capabilitySelectionsForWorkUnits[] with selectedCapabilityId observability_readback",
      );
    });
  });

  it("accepts a role-specialized post-synthesis graph with justified Codex foundation work", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await addPostSynthesisPolicyProbe(graphs);
      const decisions = [
        {
          decisionId: "role-specialized-post-synthesis",
          decisionKind: "add_nodes",
          rationaleForDecision:
            "Split post-synthesis work into implementation, validation, review, readback, and closeout.",
          newNodes: [
            {
              nodeId: "implementation-foundation",
              nodeKind: "implementation",
              capabilityId: "implementation_complex",
              executorKey: "kind:implementation",
              workerRef: "worker.codex.parity-runtime-adapter",
              requiredMetadataSchemaRef:
                "schema://runtime-work-graph/node-metadata/implementation-complex.v2",
              assignedRole: "implementation_engineer",
              inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
              commitmentIdsAdvanced: ["code-edit"],
              whyThisRoleIsNeededNow: "Foundation runtime integration is broad.",
              exactObjective: "Apply the foundation runtime edit.",
              evidenceExpectation: "Changed-file refs.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["Produces source-change evidence."],
              downstreamConsumer: "validation-proof",
              metadata: {
                capabilityId: "implementation_complex",
                consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
                utilityRationale: "Foundation integration crosses runtime contracts.",
                costRationale: "Use premium Codex only for the broad foundation edit.",
                whyCheaperOptionsWereInsufficient:
                  "The foundation edit crosses scheduler contracts and graph execution, so bounded Kimi is reserved for narrower follow-up units.",
                whyThisIsNotDuplicateWork: "No implementation evidence exists yet.",
                stopOrEscalationCondition: "Return to orchestrator if edits cannot be bounded.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            },
            {
              nodeId: "validation-proof",
              nodeKind: "validation",
              capabilityId: "validation_run",
              executorKey: "kind:validation",
              workerRef: "script-middleware",
              requiredMetadataSchemaRef:
                "schema://runtime-work-graph/node-metadata/validation-run.v2",
              assignedRole: "test_engineer",
              inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
              commitmentIdsAdvanced: ["validation"],
              whyThisRoleIsNeededNow: "Validation must be separate evidence.",
              exactObjective: "Run focused validation.",
              evidenceExpectation: "Validation refs.",
              expectedOutput: "Validation refs.",
              acceptanceCriteria: ["Records validation command refs."],
              downstreamConsumer: "reviewer-proof",
            },
            {
              nodeId: "reviewer-proof",
              nodeKind: "reviewer",
              capabilityId: "reviewer",
              executorKey: "kind:reviewer",
              workerRef: "worker.reviewer.runtime",
              requiredMetadataSchemaRef: "schema://runtime-work-graph/node-metadata/reviewer.v2",
              assignedRole: "reviewer",
              inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
              commitmentIdsAdvanced: ["code-edit", "validation"],
              whyThisRoleIsNeededNow: "Review must judge evidence sufficiency.",
              exactObjective: "Review implementation and validation evidence.",
              evidenceExpectation: "Review refs.",
              expectedOutput: "Review refs.",
              acceptanceCriteria: ["Maps findings to commitments."],
              downstreamConsumer: "owner-readback",
            },
            {
              nodeId: "owner-readback",
              nodeKind: "observability_readback",
              capabilityId: "observability_readback",
              executorKey: "kind:observability_readback",
              workerRef: "worker.observability.runtime",
              requiredMetadataSchemaRef:
                "schema://runtime-work-graph/node-metadata/observability-readback.v2",
              assignedRole: "observability_scribe",
              inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
              commitmentIdsAdvanced: ["code-edit", "validation"],
              whyThisRoleIsNeededNow: "Owner needs readable graph and evidence readback.",
              exactObjective: "Prepare owner-facing Work Queue readback.",
              evidenceExpectation: "Readback refs.",
              expectedOutput: "Readback refs.",
              acceptanceCriteria: ["Shows nodes, files, validation, limitations."],
              downstreamConsumer: "final-closeout",
            },
            {
              nodeId: "final-closeout",
              nodeKind: "closeout",
              capabilityId: "coding_closeout",
              executorKey: "kind:closeout",
              workerRef: "worker.closeout.model-authored",
              requiredMetadataSchemaRef:
                "schema://runtime-work-graph/node-metadata/coding-closeout.v2",
              assignedRole: "closeout_synthesizer",
              inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
              commitmentIdsAdvanced: ["code-edit", "validation"],
              whyThisRoleIsNeededNow: "Closeout must be model-authored after evidence.",
              exactObjective: "Prepare final Closeout Capsule.",
              evidenceExpectation: "Closeout refs.",
              expectedOutput: "Closeout refs.",
              acceptanceCriteria: ["References accepted evidence."],
              downstreamConsumer: "owner",
            },
          ],
          newEdges: [
            {
              fromNodeId: "implementation-foundation",
              toNodeId: "validation-proof",
              edgeKind: "implementation_depends_on",
            },
            {
              fromNodeId: "validation-proof",
              toNodeId: "reviewer-proof",
              edgeKind: "validation_depends_on",
            },
            {
              fromNodeId: "reviewer-proof",
              toNodeId: "owner-readback",
              edgeKind: "review_depends_on",
            },
            {
              fromNodeId: "owner-readback",
              toNodeId: "final-closeout",
              edgeKind: "closeout_depends_on",
            },
          ],
          reasonCodes: ["role_specialized_graph"],
        },
        {
          decisionId: "stop-after-graph",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after graph acceptance for the lane test.",
          reasonCodes: ["lane_stop"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        maxDecisionRepairAttempts: 0,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "kind:implementation": succeededExecutor("implementation"),
          "kind:validation": succeededExecutor("validation"),
          "kind:reviewer": succeededExecutor("reviewer"),
          "kind:observability_readback": succeededExecutor("readback"),
          "kind:closeout": succeededExecutor("closeout"),
          "role:implementation_engineer": succeededExecutor("implementation"),
          "role:test_engineer": succeededExecutor("validation"),
          "role:reviewer": succeededExecutor("reviewer"),
          "role:observability_scribe": succeededExecutor("readback"),
          "role:closeout_synthesizer": succeededExecutor("closeout"),
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).not.toContain(
        "post_synthesis_graph_role_obligation_missing:validation",
      );
      expect(result.reasonCodes).not.toContain(
        "post_synthesis_graph_codex_monopoly_all_nodes_broad_implementation",
      );
      expect(new Set(snapshot?.nodes.map((node) => node.nodeKind))).toEqual(
        new Set([
          "context_scout",
          "context_synthesis",
          "compiler",
          "implementation",
          "validation",
          "reviewer",
          "observability_readback",
          "closeout",
        ]),
      );
    });
  });

  it("allows downstream execution when accepted synthesis handoff refs are wired", async () => {
    await withSchedulerGraph(async (graphs) => {
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
      });
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-with-synthesis",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        inputHandoffRefs: ["runtime-work-graph://scheduler-graph/context-synthesis/accepted"],
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const decisions = [
        {
          decisionId: "run-implementation-with-synthesis",
          decisionKind: "run_node",
          rationaleForDecision: "Implementation has accepted synthesis input refs.",
          runNodeId: "implementation-with-synthesis",
          reasonCodes: ["implementation_has_synthesis_handoff"],
        },
        {
          decisionId: "stop-after-implementation",
          decisionKind: "mark_needs_review",
          rationaleForDecision:
            "The lane intentionally stops after proving synthesized context handoff execution.",
          reasonCodes: ["context_synthesis_handoff_execution_lane_complete"],
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
      expect(result.executedNodeIds).toEqual(["implementation-with-synthesis"]);
      expect(result.reasonCodes).toContain("context_synthesis_handoff_execution_lane_complete");
    });
  });

  it("blocks worker execution before provider invocation when required context snapshots are missing", async () => {
    await withSchedulerGraph(async (graphs) => {
      let executorCalled = false;
      await graphs.addNode({
        graphId: "scheduler-graph",
        nodeId: "implementation-missing-context",
        nodeKind: "implementation",
        assignedRole: "implementation_engineer",
        nodeStatus: "planned",
        metadata: {
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["code-edit"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const progressPhases: string[] = [];
      const decisions = [
        {
          decisionId: "run-implementation-missing-context",
          decisionKind: "run_node",
          rationaleForDecision: "Try to run implementation without a fresh context snapshot.",
          runNodeId: "implementation-missing-context",
          reasonCodes: ["implementation_requested_without_context"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        missionLedger: complexMissionLedger(),
        requireFreshContextSnapshotsForWorkerExecution: true,
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:implementation_engineer": {
            async execute() {
              executorCalled = true;
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://implementation/should-not-run"],
                reasonCodes: ["should_not_run"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        onProgress: async (progress) => {
          if (progress.currentPhase) {
            progressPhases.push(progress.currentPhase);
          }
        },
      });

      const result = await scheduler.run("scheduler-graph");
      const snapshot = await graphs.readGraphSnapshot("scheduler-graph");
      const node = snapshot?.nodes.find(
        (candidate) => candidate.nodeId === "implementation-missing-context",
      );

      expect(result.status).toBe("needs_review");
      expect(result.executedNodeIds).toEqual([]);
      expect(executorCalled).toBe(false);
      expect(result.reasonCodes).toContain("scheduler_node_context_freshness_blocked");
      expect(progressPhases).toContain("context_freshness_blocked");
      expect(node?.nodeStatus).toBe("needs_review");
      expect(node?.metadata).toMatchObject({
        contextFreshnessStatus: "missing",
        contextRefreshAction: "block_implementation",
      });
    });
  });

  it("allows worker execution when required context snapshots are fresh", async () => {
    await withSchedulerGraph(async (graphs) => {
      const freshSnapshot = createContextSnapshotRef({
        sourceRef: "runtime-work-graph://scheduler-graph/context-synthesis/accepted",
        sourceKind: "context_synthesis",
        capturedAt: "2026-05-14T00:00:00.000Z",
        graphId: "scheduler-graph",
        nodeId: "synthesis-product-spec",
        commitmentIds: ["code-edit"],
        scopeSummary: "Accepted context synthesis snapshot for implementation.",
        reasonCodes: ["context_snapshot_context_synthesis"],
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
        requireFreshContextSnapshotsForWorkerExecution: true,
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
              metadata: {
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate if the scoped edit cannot produce a valid patch.",
                targetRefs: ["src/shared.ts"],
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
              commitmentIdsAdvanced: ["b"],
              targetRefs: ["src/shared.ts"],
              whyThisRoleIsNeededNow: "Second edit.",
              exactObjective: "Patch shared file B.",
              expectedOutput: "Changed-file refs.",
              acceptanceCriteria: ["B is patched."],
              downstreamConsumer: "closeout",
              metadata: {
                taskFamily: "small_source_edit",
                selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
                qualificationEvidenceRefs: ["model-profile://kimi/file-edit-worker-loop"],
                stopOrEscalationCondition:
                  "Escalate if the scoped edit cannot produce a valid patch.",
                targetRefs: ["src/shared.ts"],
                rawPromptStored: false,
                rawResponseStored: false,
              },
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

  it("records context synthesis review and gate as scheduler runtime tools", async () => {
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
        jobId: "context-synthesis-tool-job",
        jobType: "executor.agent_team",
        idempotencyScope: "context-synthesis-tool-test",
        idempotencyKey: "context-synthesis-tool-job",
      });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const registry = new RuntimeToolRegistry();
      registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
      const kernel = new RuntimeToolKernel({ registry, traces });
      await graphs.createGraph({
        graphId: "context-synthesis-tool-graph",
        rootRuntimeJobId: "context-synthesis-tool-job",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
        graphStatus: "running",
      });
      await graphs.addNode({
        graphId: "context-synthesis-tool-graph",
        nodeId: "context-product-spec",
        nodeKind: "context_scout",
        assignedRole: "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: ["runtime-job://job/context/product-spec"],
      });
      await graphs.addNode({
        graphId: "context-synthesis-tool-graph",
        nodeId: "synthesis-product-spec",
        nodeKind: "context_synthesis",
        assignedRole: "context_synthesis",
        nodeStatus: "planned",
      });
      const decisions = [
        {
          decisionId: "run-synthesis",
          decisionKind: "run_node",
          rationaleForDecision: "Run context synthesis before implementation.",
          runNodeId: "synthesis-product-spec",
          reasonCodes: ["run_context_synthesis"],
        },
        {
          decisionId: "stop",
          decisionKind: "mark_needs_review",
          rationaleForDecision: "Stop after proving context synthesis tool traces.",
          reasonCodes: ["context_synthesis_trace_lane_complete"],
        },
      ];
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        runtimeToolKernel: kernel,
        requireSchedulerToolKernel: true,
        missionLedger: complexMissionLedger(),
        orchestrator: {
          async decide() {
            return decisions.shift();
          },
        },
        executors: {
          "role:context_synthesis": succeededExecutor("context-synthesis"),
        },
      });

      const result = await scheduler.run("context-synthesis-tool-graph");
      const invocations = await traces.listInvocations({
        graphId: "context-synthesis-tool-graph",
        limit: 40,
      });

      expect(result.status).toBe("needs_review");
      expect(invocations.map((invocation) => invocation.toolId)).toEqual(
        expect.arrayContaining([
          "scheduler.context_synthesis.review",
          "scheduler.context_synthesis.accept",
        ]),
      );
    } finally {
      await database.close();
    }
  });
});
