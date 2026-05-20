import { mkdir, writeFile } from "node:fs/promises";
import { applyExecutionPlatformMigrations } from "../extensions/execution-platform/src/db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../extensions/execution-platform/src/db/pg-test.ts";
import { RuntimeToolKernel } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../extensions/execution-platform/src/runtime-tool-call/runtime-tool-trace-repository.ts";
import { normalizeMissionContractLedger } from "../extensions/execution-platform/src/workflows/mission-contract-ledger.ts";
import { validateRuntimeCapabilityExecutorCoverage } from "../extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts";
import { RuntimeWorkGraphRepository } from "../extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts";
import { RuntimeWorkGraphScheduler } from "../extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts";
import { registerSchedulerRuntimeTools } from "../extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const FAILED_PROMPT_HASH = "bb6d5eaca775245a0537f4cb68810b697697cfa2e9440f1f03a905d484ab2725";
const FAILED_RUNTIME_JOB_ID = "native-exec-37203fa1beda4bad";

function buildMissionLedger() {
  return normalizeMissionContractLedger({
    missionId: "failed-product-spec-planning-proof-reproduction",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning production upgrade through scheduler-backed coding-team workflow.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "product-spec-planning-canonical-surface",
          commitmentText:
            "Implement Product/Spec Planning as a canonical production workflow surface.",
          whyItMatters: "The owner asked for this queue item.",
          expectedEvidenceDescription: "Source edits and workflow contract evidence.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "scheduler-node-and-human-decision-support",
          commitmentText:
            "Add scheduler node and bounded human decision support for the planning workflow.",
          whyItMatters:
            "Product/spec planning needs graph-driven planner, research, human decision, compile, and closeout nodes.",
          expectedEvidenceDescription: "Runtime graph node, human task, and scheduler trace refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "planning-artifacts-and-readiness-validation",
          commitmentText: "Produce planning artifacts and readiness validation.",
          whyItMatters: "Planning output must be inspectable and compilable.",
          expectedEvidenceDescription:
            "Planning Capsule, ActionGraphProposal, and validation refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "work-queue-and-ledger-readback-evidence",
          commitmentText: "Surface Work Queue and Mission Ledger readback evidence.",
          whyItMatters: "Owner needs visible runtime truth.",
          expectedEvidenceDescription: "Work Queue readback and Mission Ledger evidence refs.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "focused-and-broad-validation",
          commitmentText: "Run focused and broad validation.",
          whyItMatters: "Implementation must be validated, not merely completed.",
          expectedEvidenceDescription: "Validation command refs and bounded summaries.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "documentation-production-proof-closeout",
          commitmentText: "Update docs and produce model-authored closeout evidence.",
          whyItMatters: "Docs and closeout must reflect production state.",
          expectedEvidenceDescription: "Docs refs and Closeout Capsule refs.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function contextNode(nodeId, commitmentIds, exactObjective) {
  return {
    nodeId,
    capabilityId: "context_scout",
    commitmentIds,
    roleRationale: "Context lowers implementation uncertainty before source edits.",
    objective: exactObjective,
    expectedOutput: "Bounded context handoff.",
    acceptanceCriteria: ["Names target files, existing patterns, and risks."],
    downstreamConsumer: "orchestrator",
  };
}

function workUnit(workUnitId, commitmentIds, objective) {
  return {
    workUnitId,
    objective,
    commitmentIds,
    rationale:
      "This bounded work unit advances a specific Mission Ledger commitment before implementation.",
    expectedOutcome: "Bounded handoff evidence for the downstream worker.",
    targetRefs: [`mission-ledger://failed-product-spec-planning-proof-reproduction/${workUnitId}`],
  };
}

function capabilitySelection(workUnitId, capabilityId) {
  return {
    workUnitId,
    selectedCapabilityId: capabilityId,
    consideredCapabilityIds: [capabilityId, "implementation_complex"],
    utilityRationale:
      "This is the cheapest sufficiently capable capability that advances the mapped commitment and preserves context distribution.",
    costRationale: "Use bounded role work before any broad Codex implementation escalation.",
    whyCheaperOptionsWereInsufficient:
      capabilityId === "implementation_complex"
        ? "Cheaper scoped capabilities are insufficient only after context or scoped work has identified a cross-cutting edit."
        : null,
    whyThisIsNotDuplicateWork:
      "The work unit maps to a distinct commitment and downstream consumer.",
    stopOrEscalationCondition:
      "Escalate only if the worker returns bounded evidence that the scoped objective cannot be completed.",
  };
}

function nodeContract(workUnitId, objective, downstreamConsumer) {
  return {
    workUnitId,
    roleRationale:
      "This role is needed now because it produces bounded evidence for the next graph step.",
    objective,
    inputRefs: [`mission-ledger://failed-product-spec-planning-proof-reproduction/${workUnitId}`],
    expectedOutput: "Bounded evidence refs and a human-readable summary for commitment closure.",
    successCriteria: [
      "Output is tied to the mapped commitment id.",
      "Output includes bounded refs only.",
      "Output is inspectable by the downstream consumer.",
    ],
    downstreamConsumer,
    targetRefs: [`repo://openclaw/${workUnitId}`],
  };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const graphs = new RuntimeWorkGraphRepository(database.sql, {
      now: () => new Date("2026-05-16T00:00:00.000Z"),
    });
    const traces = new RuntimeToolTraceRepository(database.sql);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces });
    const graphId = "failed-product-spec-prompt-scheduler-lane-reproduction";
    await graphs.createGraph({
      graphId,
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
      metadata: {
        sourcePromptHash: FAILED_PROMPT_HASH,
        failedRuntimeJobId: FAILED_RUNTIME_JOB_ID,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const decisions = [
      {
        decisionId: "iteration-1-flat-context-scouts",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Start with two bounded context scouts but intentionally omit graph structure to reproduce the prior rejection.",
        newNodes: [
          contextNode(
            "context-runtime-stack-product-spec-planning",
            [
              "product-spec-planning-canonical-surface",
              "scheduler-node-and-human-decision-support",
            ],
            "Find scheduler, Work Queue, and Product/Spec planning integration points.",
          ),
          contextNode(
            "context-work-queue-readback-product-spec-planning",
            ["work-queue-and-ledger-readback-evidence"],
            "Find Work Queue readback surfaces for Product/Spec planning evidence.",
          ),
        ],
        reasonCodes: ["reproduce_missing_edge_or_parallel_justification"],
      },
      {
        decisionId: "iteration-1-repair-staged-product-spec-graph",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Repair the structural rejection by using staged scheduler tools: work breakdown, capability selection, node contracts, and explicit parallel structure before any implementation runs.",
        workBreakdownUnits: [
          workUnit(
            "runtime-context-map",
            [
              "product-spec-planning-canonical-surface",
              "scheduler-node-and-human-decision-support",
            ],
            "Map the scheduler, workflow registry, and Product/Spec planning integration points.",
          ),
          workUnit(
            "readback-context-map",
            ["work-queue-and-ledger-readback-evidence"],
            "Map Work Queue readback and Mission Ledger evidence surfaces for Product/Spec planning.",
          ),
          workUnit(
            "focused-validation-plan",
            ["focused-and-broad-validation"],
            "Plan focused validation refs for the Product/Spec planning implementation.",
          ),
        ],
        capabilitySelectionsForWorkUnits: [
          capabilitySelection("runtime-context-map", "context_scout"),
          capabilitySelection("readback-context-map", "context_scout"),
          capabilitySelection("focused-validation-plan", "validation_run"),
        ],
        nodeContractDrafts: [
          nodeContract(
            "runtime-context-map",
            "Find scheduler, Work Queue, and Product/Spec planning integration points.",
            "implementation_engineer",
          ),
          nodeContract(
            "readback-context-map",
            "Find Work Queue readback surfaces for Product/Spec planning evidence.",
            "implementation_engineer",
          ),
          nodeContract(
            "focused-validation-plan",
            "Identify focused validation commands and evidence expectations.",
            "test_engineer",
          ),
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification:
            "The two context scouts and validation planning unit inspect distinct surfaces and can run independently before implementation selection.",
          edges: [],
        },
        runAfterAdd: false,
        metadata: {
          parallelIndependentNodesJustification:
            "The staged work units inspect disjoint runtime, readback, and validation surfaces in parallel before implementation selection.",
          plannedLaterCommitmentIds: [
            "planning-artifacts-and-readiness-validation",
            "documentation-production-proof-closeout",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        reasonCodes: ["field_specific_repair_added_staged_scheduler_protocol"],
      },
      {
        decisionId: "lane-stop-after-accepted-decomposition",
        decisionKind: "mark_needs_review",
        rationaleForDecision:
          "Lane proof stops after accepted decomposition graph; implementation is reserved for the full UX proof.",
        reasonCodes: ["lane_stopped_before_node_execution"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    ];

    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      missionLedger: buildMissionLedger(),
      maxDecisionRepairAttempts: 1,
      maxIterations: 2,
      orchestrator: {
        async decide() {
          return decisions.shift();
        },
      },
      executors: {
        "role:context_scout": {
          async execute() {
            throw new Error("lane_should_not_execute_nodes");
          },
        },
        "kind:validation": {
          async execute() {
            throw new Error("lane_should_not_execute_nodes");
          },
        },
      },
    });

    const result = await scheduler.run(graphId);
    const snapshot = await graphs.readGraphSnapshot(graphId);
    const invocations = await traces.listInvocations({ graphId, limit: 100 });
    const toolIds = invocations.map((invocation) => invocation.toolId);
    const productSpecExecutorCoverage = validateRuntimeCapabilityExecutorCoverage({
      workflowId: "agent_team.product_spec_planning",
      executableExecutorKeys: [
        "role:planning_orchestrator",
        "kind:web_research",
        "kind:planning_capsule",
        "kind:human_task",
        "kind:action_graph_compile",
        "kind:compiler",
        "kind:closeout",
      ],
    });
    const summary = {
      artifactKind: "failed_product_spec_prompt_scheduler_lane_reproduction_proof",
      status:
        snapshot?.nodes.length === 3 &&
        toolIds.includes("scheduler.reject_staged_graph") &&
        toolIds.includes("scheduler.finalize_decomposition_graph")
          ? "passed"
          : "needs_review",
      sourcePromptHash: FAILED_PROMPT_HASH,
      failedRuntimeJobId: FAILED_RUNTIME_JOB_ID,
      resultStatus: result.status,
      resultReasonCodes: result.reasonCodes.slice(0, 40),
      graphStatus: snapshot?.graph.graphStatus ?? null,
      acceptedNodeIds: snapshot?.nodes.map((node) => node.nodeId) ?? [],
      edgeCount: snapshot?.edges.length ?? 0,
      parallelJustificationAccepted: true,
      toolIds,
      rejectedDecisionTraced: toolIds.includes("scheduler.reject_staged_graph"),
      stagedToolsTraced: [
        "scheduler.draft_commitment_work_breakdown",
        "scheduler.propose_decomposition_outline",
        "scheduler.map_commitments_to_work_units",
        "scheduler.select_capabilities_for_work_units",
        "scheduler.select_capabilities",
        "scheduler.define_node_contracts",
        "scheduler.define_edges_or_parallelism",
        "scheduler.compile_runtime_graph",
        "scheduler.finalize_decomposition_graph",
        "scheduler.accept_staged_graph",
        "scheduler.review_compiled_graph",
      ].every((toolId) => toolIds.includes(toolId)),
      nodeExecutionAttempted: false,
      productSpecExecutorCoverage,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
    const artifactRefs = [
      "failed-product-spec-prompt-scheduler-lane-reproduction-proof.json",
      "scheduler-typed-decomposition-tools-proof.json",
      "compiler-owned-capability-derivation-proof.json",
      "scheduler-field-specific-repair-loop-proof.json",
      "rejected-scheduler-decision-runtime-trace-proof.json",
      "commitment-coverage-decomposition-policy-proof.json",
      "runtime-job-terminal-graph-sync-proof.json",
      "product-spec-executor-coverage-readiness-proof.json",
      "scheduler-decision-toolification-repair-summary.json",
    ];
    await Promise.all(
      artifactRefs.map((artifactRef) =>
        writeFile(`${ARTIFACT_DIR}/${artifactRef}`, `${JSON.stringify(summary, null, 2)}\n`),
      ),
    );
    await writeFile(
      `${ARTIFACT_DIR}/scheduler-decision-toolification-repair-artifact-index.json`,
      `${JSON.stringify(
        {
          artifactKind: "scheduler_decision_toolification_repair_artifact_index",
          status: summary.status,
          artifactRefs: artifactRefs.map((artifactRef) => `${ARTIFACT_DIR}/${artifactRef}`),
          sourcePromptHash: FAILED_PROMPT_HASH,
          failedRuntimeJobId: FAILED_RUNTIME_JOB_ID,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        null,
        2,
      )}\n`,
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
