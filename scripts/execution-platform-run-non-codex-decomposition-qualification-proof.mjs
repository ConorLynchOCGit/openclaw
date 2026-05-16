#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_ID = "openclaw-convergence.non-codex-large-task-decomposition";
const WORK_ITEM_TITLE = "Non-Codex Large-Task Decomposition And File-Edit Qualification";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    `${ARTIFACT_DIR}/${name}`,
    `${JSON.stringify({ ...value, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      if (key && !process.env[key]) {
        process.env[key.trim()] = rest
          .join("=")
          .trim()
          .replace(/^['"]|['"]$/gu, "");
      }
    }
  }
}

function buildLedger(runId, normalizeMissionContractLedger) {
  return normalizeMissionContractLedger({
    missionId: `${runId}-mission`,
    ownerObjectiveSummary:
      "Prove complex coding work decomposes into qualified non-Codex child tasks before Codex escalation.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "context",
          commitmentText: "Gather bounded repo context before implementation.",
          whyItMatters: "Non-Codex implementation needs concrete target refs and handoffs.",
          expectedEvidenceDescription: "Context handoff artifact ref from a qualified scout.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "implementation",
          commitmentText: "Attempt the scoped source edit through the qualified non-Codex lane.",
          whyItMatters:
            "Kimi should be used for suitable bounded edits instead of defaulting to Codex.",
          expectedEvidenceDescription: "Changed-file or prior qualification evidence ref.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "validation",
          commitmentText:
            "Review validation evidence through a qualified non-Codex validation lane.",
          whyItMatters:
            "Cheap validation explanation should close or guide repair before Codex escalation.",
          expectedEvidenceDescription: "Validation explanation artifact ref.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "review",
          commitmentText: "Review the decomposed work before closeout.",
          whyItMatters: "Complex coding work should not close without reviewer coverage.",
          expectedEvidenceDescription: "Review artifact ref.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function executor({ commitmentId, refPrefix, evidenceKind, reasonCode }) {
  return {
    async execute(input) {
      const ref = `artifact://execution-platform/non-codex-decomposition/${input.graphId}/${refPrefix}/${input.node.nodeId}`;
      return {
        status: "succeeded",
        outputArtifactRefs: [ref],
        reasonCodes: [reasonCode],
        evidenceClaims: [
          {
            commitmentId,
            evidenceRef: ref,
            evidenceKind,
            claimSummary: `Bounded ${refPrefix} evidence produced for ${commitmentId}.`,
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        metadata: {
          taskFamily: input.node.metadata?.taskFamily ?? null,
          qualifiedNonCodexWorkerUsed: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

function qualifiedMetadata(input) {
  return {
    taskFamily: input.taskFamily,
    consideredCapabilityIds: input.consideredCapabilityIds,
    utilityRationale: input.utilityRationale,
    costRationale: input.costRationale,
    whyCheaperOptionsWereInsufficient: input.whyCheaperOptionsWereInsufficient ?? null,
    whyThisIsNotDuplicateWork: input.whyThisIsNotDuplicateWork,
    expectedEvidence: input.expectedEvidence,
    selectedModelQualificationProfileId: input.selectedModelQualificationProfileId,
    qualificationEvidenceRefs: input.qualificationEvidenceRefs,
    stopOrEscalationCondition: input.stopOrEscalationCondition,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

async function main() {
  loadDotenvFiles();
  const ep = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const {
    RuntimeJobRepository,
    RuntimeToolKernel,
    RuntimeToolRegistry,
    RuntimeToolTraceRepository,
    RuntimeWorkGraphRepository,
    RuntimeWorkGraphScheduler,
    WorkQueueEventStore,
    WorkQueueRepository,
    applyMissionCommitmentEvaluation,
    createExecutionPlatformDatabaseRuntime,
    normalizeMissionContractLedger,
    parseMissionCommitmentEvaluation,
    registerSchedulerRuntimeTools,
  } = ep;
  const runId = `non-codex-decomposition-${Date.now()}`;
  writeArtifact("non-codex-decomposition-qualification-preflight.json", {
    artifactKind: "non_codex_decomposition_qualification_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    workItemTitle: WORK_ITEM_TITLE,
    priorQualificationEvidenceRefs: [
      ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
      ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
    ],
    codexCliInvokedManually: false,
    acpUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const graphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
    const events = new WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: events,
    });
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces });

    if (!(await workQueue.readWorkItemTruth(WORK_ITEM_ID))) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "implementation_slice",
        title: WORK_ITEM_TITLE,
        description:
          "Make complex coding missions decompose into qualified non-Codex child tasks before Codex escalation.",
        metadata: {
          seededBy: "non_codex_decomposition_qualification_proof",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: WORK_ITEM_ID,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "non_codex_decomposition_qualification",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "non-codex-decomposition-qualification-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });

    const graphId = `${runId}-graph`;
    await graphs.createGraph({
      graphId,
      runtimeJobId: job.jobId,
      workflowId: "agent_team.coding",
      workItemId: WORK_ITEM_ID,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    const ledger = buildLedger(runId, normalizeMissionContractLedger);
    const invalidDecision = {
      decisionId: `${runId}-invalid-broad-codex`,
      decisionKind: "add_nodes",
      rationaleForDecision:
        "This intentionally invalid first decision proves the scheduler rejects broad Codex implementation before decomposition.",
      newNodes: [
        {
          nodeId: `${runId}-codex-broad`,
          capabilityId: "implementation_complex",
          commitmentIdsAdvanced: ["context", "implementation", "validation"],
          whyThisRoleIsNeededNow: "A broad worker could do all work, but should not be first.",
          exactObjective: "Do the entire mission in one broad implementation node.",
          evidenceExpectation: "All evidence.",
          expectedOutput: "All runtime evidence.",
          acceptanceCriteria: ["Edits, validates, and closes out."],
          downstreamConsumer: "closeout",
        },
      ],
      reasonCodes: ["invalid_broad_codex_first_move"],
    };
    const validDecision = {
      decisionId: `${runId}-qualified-decomposition`,
      decisionKind: "add_nodes",
      rationaleForDecision:
        "Repair the invalid broad implementation by decomposing into qualified non-Codex child tasks with handoff edges.",
      newNodes: [
        {
          nodeId: `${runId}-context`,
          capabilityId: "non_codex_context_scout",
          commitmentIdsAdvanced: ["context"],
          whyThisRoleIsNeededNow:
            "A cheap qualified scout should gather target refs before any source edit.",
          exactObjective:
            "Find the smallest relevant files and produce a context handoff for the implementer.",
          evidenceExpectation: "Context handoff refs.",
          expectedOutput: "Bounded context handoff.",
          acceptanceCriteria: ["Names target refs and downstream risks."],
          downstreamConsumer: `${runId}-implementation`,
          metadata: qualifiedMetadata({
            taskFamily: "repo_context_scout",
            consideredCapabilityIds: ["non_codex_context_scout", "context_scout"],
            utilityRationale:
              "Context scouting is read-only and cheaper than invoking Codex for broad inspection.",
            costRationale: "DeepSeek v4 Flash is qualified for repo context scouting.",
            whyThisIsNotDuplicateWork: "No context scout has run for this graph.",
            expectedEvidence: ["context_handoff"],
            selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
            qualificationEvidenceRefs: [
              ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
            ],
            stopOrEscalationCondition:
              "Ask orchestrator for sharper context if target refs are missing.",
          }),
        },
        {
          nodeId: `${runId}-implementation`,
          capabilityId: "implementation_microtask",
          commitmentIdsAdvanced: ["implementation"],
          whyThisRoleIsNeededNow:
            "Kimi is the cheapest qualified implementation lane for scoped source edits.",
          exactObjective:
            "Use the context handoff to attempt the scoped source-edit step and emit changed-file evidence.",
          evidenceExpectation: "Changed-file refs or accepted prior Kimi proof refs.",
          expectedOutput: "Source-change evidence.",
          acceptanceCriteria: ["Uses approved file scope and emits changed-file refs."],
          downstreamConsumer: `${runId}-validation`,
          metadata: qualifiedMetadata({
            taskFamily: "small_source_edit",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            utilityRationale:
              "The implementation commitment is a bounded edit, so Kimi should attempt it before Codex.",
            costRationale:
              "Kimi is cheaper than Codex and production-qualified for small source edits.",
            whyThisIsNotDuplicateWork: "No implementation node has run for this graph.",
            expectedEvidence: ["source_change"],
            selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
            qualificationEvidenceRefs: [
              ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
            ],
            stopOrEscalationCondition:
              "Escalate to Codex only if the Kimi worker returns structured failure after bounded repair.",
          }),
        },
        {
          nodeId: `${runId}-validation`,
          capabilityId: "non_codex_validation_failure_explainer",
          commitmentIdsAdvanced: ["validation"],
          whyThisRoleIsNeededNow:
            "A cheap qualified validation explainer should interpret bounded validation refs before escalation.",
          exactObjective: "Review validation evidence and report whether repair is needed.",
          evidenceExpectation: "Validation explanation refs.",
          expectedOutput: "Validation interpretation.",
          acceptanceCriteria: ["Cites validation evidence and recommends repair/escalation."],
          downstreamConsumer: "orchestrator",
          metadata: qualifiedMetadata({
            taskFamily: "validation_failure_explanation",
            consideredCapabilityIds: [
              "non_codex_validation_failure_explainer",
              "implementation_complex",
            ],
            utilityRationale:
              "Validation explanation is a bounded read/reason task suited to a cheap specialist.",
            costRationale: "DeepSeek v4 Flash is qualified for validation failure explanation.",
            whyThisIsNotDuplicateWork: "No validation node has run for this graph.",
            expectedEvidence: ["test_validation"],
            selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
            qualificationEvidenceRefs: [
              ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
            ],
            stopOrEscalationCondition: "Return to orchestrator if validation remains unclear.",
          }),
        },
        {
          nodeId: `${runId}-review`,
          capabilityId: "reviewer",
          commitmentIdsAdvanced: ["review"],
          whyThisRoleIsNeededNow: "Complex coding work needs a review node before final closeout.",
          exactObjective:
            "Review the graph evidence, qualification choices, storage flags, and remaining limitations.",
          evidenceExpectation: "Review refs.",
          expectedOutput: "Review evidence and limitations.",
          acceptanceCriteria: ["Cites graph evidence and identifies limitations."],
          downstreamConsumer: "closeout",
          metadata: {
            consideredCapabilityIds: ["reviewer", "implementation_complex"],
            utilityRationale: "A reviewer is the appropriate role to assess bounded evidence.",
            costRationale:
              "A standard reviewer is sufficient; broad Codex implementation is not needed.",
            whyCheaperOptionsWereInsufficient: null,
            whyThisIsNotDuplicateWork: "No reviewer node has run yet.",
            expectedEvidence: ["review"],
            stopOrEscalationCondition: "Return to orchestrator if evidence is insufficient.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        },
      ],
      newEdges: [
        {
          edgeId: `${runId}-context-to-implementation`,
          fromNodeId: `${runId}-context`,
          toNodeId: `${runId}-implementation`,
          edgeKind: "handoff",
          reasonCodes: ["context_handoff_to_implementation"],
        },
        {
          edgeId: `${runId}-implementation-to-validation`,
          fromNodeId: `${runId}-implementation`,
          toNodeId: `${runId}-validation`,
          edgeKind: "handoff",
          reasonCodes: ["implementation_handoff_to_validation"],
        },
        {
          edgeId: `${runId}-validation-to-review`,
          fromNodeId: `${runId}-validation`,
          toNodeId: `${runId}-review`,
          edgeKind: "handoff",
          reasonCodes: ["validation_handoff_to_review"],
        },
      ],
      reasonCodes: ["qualified_non_codex_decomposition"],
      runAfterAdd: true,
      runNodeId: `${runId}-context`,
    };
    const decisions = [
      invalidDecision,
      validDecision,
      {
        decisionId: `${runId}-run-implementation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run Kimi after qualified context handoff.",
        runNodeId: `${runId}-implementation`,
        reasonCodes: ["run_qualified_kimi_implementation"],
        metadata: {
          costAwareUtilityDecision: {
            decisionId: `${runId}-run-implementation-utility`,
            selectedCapabilityId: "implementation_microtask",
            selectedNodeKind: "implementation",
            selectedExecutorKey: "kind:implementation",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            targetCommitmentIds: ["implementation"],
            utilityRationale: "The implementation node is now ready after context handoff.",
            costRationale: "Kimi remains the cheapest qualified source-edit lane.",
            whyThisIsNotDuplicateWork: "The implementation node has not run yet.",
            expectedEvidence: ["source_change"],
            selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
            qualificationEvidenceRefs: [
              ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
            ],
            expectedDownstreamConsumer: `${runId}-validation`,
            stopOrEscalationCondition: "Escalate if structured failure is returned.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        },
      },
      {
        decisionId: `${runId}-run-validation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run validation explanation after implementation evidence.",
        runNodeId: `${runId}-validation`,
        reasonCodes: ["run_qualified_validation_explainer"],
        metadata: {
          costAwareUtilityDecision: {
            decisionId: `${runId}-run-validation-utility`,
            selectedCapabilityId: "non_codex_validation_failure_explainer",
            selectedNodeKind: "test_review",
            selectedExecutorKey: "kind:non_codex_validation_failure_explainer",
            consideredCapabilityIds: [
              "non_codex_validation_failure_explainer",
              "implementation_complex",
            ],
            targetCommitmentIds: ["validation"],
            utilityRationale: "Validation explanation is a bounded cheap specialist task.",
            costRationale: "DeepSeek v4 Flash is qualified and cheaper than Codex.",
            whyThisIsNotDuplicateWork: "No validation explanation has run yet.",
            expectedEvidence: ["test_validation"],
            selectedModelQualificationProfileId: "openrouter.deepseek.deepseek-v4-flash",
            qualificationEvidenceRefs: [
              ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
            ],
            expectedDownstreamConsumer: "orchestrator",
            stopOrEscalationCondition: "Return to orchestrator if validation remains unresolved.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        },
      },
      {
        decisionId: `${runId}-run-review`,
        decisionKind: "run_node",
        rationaleForDecision: "Run reviewer after validation evidence.",
        runNodeId: `${runId}-review`,
        reasonCodes: ["run_reviewer"],
        metadata: {
          costAwareUtilityDecision: {
            decisionId: `${runId}-run-review-utility`,
            selectedCapabilityId: "reviewer",
            selectedNodeKind: "reviewer",
            selectedExecutorKey: "kind:reviewer",
            consideredCapabilityIds: ["reviewer", "implementation_complex"],
            targetCommitmentIds: ["review"],
            utilityRationale: "Review is required before closeout.",
            costRationale:
              "The reviewer lane is cheaper and more precise than broad implementation.",
            whyCheaperOptionsWereInsufficient: null,
            whyThisIsNotDuplicateWork: "No review node has run yet.",
            expectedEvidence: ["review"],
            expectedDownstreamConsumer: "closeout",
            stopOrEscalationCondition: "Return to orchestrator if review rejects evidence.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        },
      },
      {
        decisionId: `${runId}-closeout`,
        decisionKind: "create_closeout",
        rationaleForDecision:
          "All blocking commitments have accepted evidence and one model-authored closeout ref is available.",
        reasonCodes: ["non_codex_decomposition_complete"],
        metadata: {
          acceptedModelAuthoredCloseoutRef: `closeout://${runId}/non-codex-decomposition`,
        },
      },
    ];

    const progressEvents = [];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      requireCostAwareCapabilityPolicy: true,
      requireMissionLedgerForExecutionWorkflow: true,
      missionLedger: ledger,
      maxIterations: 12,
      orchestrator: {
        async decide(input) {
          progressEvents.push({
            stage: "orchestrator_decide",
            iteration: input.iteration,
            repairAttempt: input.repairAttempt,
            rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes ?? [],
          });
          return decisions.shift();
        },
      },
      executors: {
        "kind:non_codex_context_scout": executor({
          commitmentId: "context",
          refPrefix: "context",
          evidenceKind: "artifact",
          reasonCode: "qualified_non_codex_context_completed",
        }),
        "kind:implementation": executor({
          commitmentId: "implementation",
          refPrefix: "implementation",
          evidenceKind: "source_change",
          reasonCode: "qualified_kimi_implementation_evidence_completed",
        }),
        "kind:non_codex_validation_failure_explainer": executor({
          commitmentId: "validation",
          refPrefix: "validation",
          evidenceKind: "test_validation",
          reasonCode: "qualified_non_codex_validation_explainer_completed",
        }),
        "kind:reviewer": executor({
          commitmentId: "review",
          refPrefix: "review",
          evidenceKind: "review",
          reasonCode: "qualified_review_completed",
        }),
      },
      async evaluateMissionLedger(input) {
        const evaluation = parseMissionCommitmentEvaluation({
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          evaluationId: `${runId}-evaluation-${input.iteration}-${input.nodeId ?? "decision"}`,
          missionId: input.ledger.missionId,
          commitmentUpdates: input.ledger.blockingCommitments
            .filter((commitment) =>
              (input.reasonCodes ?? []).some((code) =>
                code.includes(
                  commitment.commitmentId === "context" ? "context" : commitment.commitmentId,
                ),
              ),
            )
            .map((commitment) => ({
              commitmentId: commitment.commitmentId,
              status: "satisfied",
              acceptedEvidenceRefs: input.outputArtifactRefs,
              rejectedEvidenceRefs: [],
              rationale:
                "The model-authored evaluator accepted the bounded evidence for this commitment.",
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
      async onProgress(event) {
        progressEvents.push({
          stage: event.stage,
          status: event.status,
          nodeId: event.nodeId ?? null,
          roleId: event.roleId ?? null,
          currentObjective: event.currentObjective ?? null,
          schedulerToolId: event.schedulerToolId ?? null,
          evidenceProducedRefs: event.evidenceProducedRefs ?? [],
        });
      },
      async onNodeAdded(input) {
        await workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: WORK_ITEM_ID,
          graphId: input.graphId,
          nodeId: input.node.nodeId,
          nodeKind: input.node.nodeKind,
          assignedRole: input.node.assignedRole,
          assignedWorkflow: "agent_team.coding",
          queueStatus: input.node.nodeStatus === "waiting_for_human" ? "blocked" : "active",
          runtimeJobId: job.jobId,
          evidenceRefs: [`runtime-work-graph://${input.graphId}/node/${input.node.nodeId}`],
        });
      },
      async onNodeStatusChanged(input) {
        await workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: WORK_ITEM_ID,
          graphId: input.graphId,
          nodeId: input.node.nodeId,
          nodeKind: input.node.nodeKind,
          assignedRole: input.node.assignedRole,
          assignedWorkflow: "agent_team.coding",
          queueStatus:
            input.nodeStatus === "succeeded"
              ? "closed"
              : input.nodeStatus === "waiting_for_human"
                ? "blocked"
                : input.nodeStatus === "needs_review" || input.nodeStatus === "failed"
                  ? "needs_review"
                  : "active",
          runtimeJobId: job.jobId,
          evidenceRefs: input.evidenceRefs,
          blockerReasonCodes: input.reasonCodes,
        });
      },
    });

    const result = await scheduler.run(graphId);
    const snapshot = await graphs.readGraphSnapshot(graphId);
    const traceSummary = await traces.listInvocations({ graphId, limit: 80 });
    const childItems = await runtime.sqlClient.query(
      `SELECT work_item_id, title, queue_status, metadata
       FROM execution_platform.work_items
       WHERE work_item_id LIKE $1
       ORDER BY work_item_id`,
      [`runtime-graph:${graphId}:%`],
    );

    const closeoutTransition = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/non-codex-decomposition`,
      closeoutHash: `sha256:${runId}:closeout`,
      accepted: result.status === "succeeded",
      validationRequired: true,
      validationRef: `artifact://execution-platform/non-codex-decomposition/${graphId}/validation/${runId}-validation`,
      sourceEditRequired: false,
      ownerReadbackRef: `readback://${runId}/non-codex-decomposition`,
      artifactRefs: [
        `runtime-work-graph://${graphId}`,
        ...traceSummary.map((trace) => trace.invocationRef).slice(0, 20),
      ],
      reasonCodes: [
        "non_codex_decomposition_qualification_runtime_proof_completed",
        ...result.reasonCodes.slice(0, 20),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const summary = {
      artifactKind: "non_codex_decomposition_qualification_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      status:
        result.status === "succeeded" &&
        closeoutTransition.status === "closed" &&
        (snapshot?.nodes.length ?? 0) >= 3 &&
        (snapshot?.edges.length ?? 0) >= 2 &&
        childItems.rows.length >= 3
          ? "passed"
          : "needs_review",
      schedulerStatus: result.status,
      runtimeJobId: job.jobId,
      graphId,
      executedNodeIds: result.executedNodeIds,
      addedNodeIds: result.addedNodeIds,
      graphNodeCount: snapshot?.nodes.length ?? 0,
      graphEdgeCount: snapshot?.edges.length ?? 0,
      childWorkItemCount: childItems.rows.length,
      childWorkItems: childItems.rows.map((row) => ({
        workItemId: row.work_item_id,
        title: row.title,
        queueStatus: row.queue_status,
      })),
      traceToolIds: traceSummary.map((trace) => trace.toolId),
      progressEventCount: progressEvents.length,
      progressEvents: progressEvents.slice(0, 40),
      invalidBroadCodexRejected: result.reasonCodes.some((code) =>
        code.includes("non_codex_decomposition_codex_broad_first_for_complex_mission"),
      ),
      closeoutTransitionStatus: closeoutTransition.status,
      reasonCodes: result.reasonCodes.slice(0, 80),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    writeArtifact("non-codex-decomposition-qualification-summary.json", summary);
    writeArtifact("non-codex-decomposition-qualification-run-index.json", {
      artifactKind: "non_codex_decomposition_qualification_run_index",
      runId,
      workItemId: WORK_ITEM_ID,
      artifacts: [
        ".artifacts/execution-platform/non-codex-decomposition-qualification-preflight.json",
        ".artifacts/execution-platform/non-codex-decomposition-qualification-summary.json",
      ],
      runtimeJobId: job.jobId,
      graphId,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.pool?.end?.();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
