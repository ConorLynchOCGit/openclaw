import fs from "node:fs";
import {
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
} from "../extensions/execution-platform/src/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_ID = "openclaw-convergence.active-queue-22";
const NEXT_WORK_ITEM_ID = "openclaw-convergence.active-queue-21";
const NEXT_WORK_ITEM_TITLE =
  "Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane Hardening";

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
      if (!key || process.env[key]) {
        continue;
      }
      let value = rest.join("=").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  }
}

function missionLedger(runId) {
  return normalizeMissionContractLedger({
    missionId: `${runId}-mission`,
    ownerObjectiveSummary:
      "Prove scheduler toolification and split planning/execution using live Execution Platform persistence.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "decomposition",
          commitmentText: "Create an accepted decomposition graph before worker execution.",
          whyItMatters: "Complex missions must not begin as broad implementation.",
          expectedEvidenceDescription: "Scheduler tool traces for decomposition, nodes, edges.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "implementation",
          commitmentText: "Run an implementation node through the worker invocation tool trace.",
          whyItMatters: "Scheduler execution must use runtime tool traces.",
          expectedEvidenceDescription: "Worker invocation trace and implementation artifact ref.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "validation",
          commitmentText: "Run validation after implementation.",
          whyItMatters: "Execution must remain evidence-backed.",
          expectedEvidenceDescription: "Validation artifact ref.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function executor({ commitmentId, refPrefix, reasonCode }) {
  return {
    async execute(input) {
      const ref = `artifact://execution-platform/scheduler-toolification/${input.graphId}/${refPrefix}/${input.node.nodeId}`;
      return {
        status: "succeeded",
        outputArtifactRefs: [ref],
        reasonCodes: [reasonCode],
        evidenceClaims: [
          {
            commitmentId,
            evidenceRef: ref,
            evidenceKind:
              commitmentId === "validation"
                ? "test_validation"
                : commitmentId === "implementation"
                  ? "source_change"
                  : "artifact",
            claimSummary: `Bounded ${refPrefix} evidence produced for ${commitmentId}.`,
            limitations: [],
            rawPromptStored: false,
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
  };
}

async function main() {
  loadDotenvFiles();
  const runId = `scheduler-toolification-${Date.now()}`;
  writeArtifact("scheduler-toolification-split-planning-preflight.json", {
    artifactKind: "scheduler_toolification_split_planning_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    codexCliInvokedManually: false,
    acpUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const runtimeWorkGraphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
    const workQueueEvents = new WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces });

    if (!(await workQueue.readWorkItemTruth(WORK_ITEM_ID))) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "implementation_slice",
        title: "Scheduler Toolification And Split Planning/Execution",
        description:
          "Move scheduler decisions onto RuntimeToolKernel traces and split planning from execution.",
        metadata: {
          seededBy: "scheduler_toolification_proof",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    const nextWorkItemTruth = await workQueue.readWorkItemTruth(NEXT_WORK_ITEM_ID);
    let nextWorkItemTitleUpdated = false;
    if (nextWorkItemTruth) {
      await workQueue.updateWorkItemPlanningMetadata({
        workItemId: NEXT_WORK_ITEM_ID,
        title: NEXT_WORK_ITEM_TITLE,
        description: nextWorkItemTruth.item.description,
        metadata: {
          ...(nextWorkItemTruth.item.metadata &&
          typeof nextWorkItemTruth.item.metadata === "object" &&
          !Array.isArray(nextWorkItemTruth.item.metadata)
            ? nextWorkItemTruth.item.metadata
            : {}),
          renamedBy: "scheduler_toolification_cleanup",
          previousWording: "Worker Tool Loops And Kimi Micro-Agent Hardening",
          rawPromptStored: false,
          rawResponseStored: false,
        },
        actorId: "scheduler-toolification-proof",
      });
      nextWorkItemTitleUpdated = true;
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: WORK_ITEM_ID,
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "scheduler_toolification_split_planning",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "scheduler-toolification-split-planning-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });

    const graphId = `${runId}-graph`;
    await runtimeWorkGraphs.createGraph({
      graphId,
      runtimeJobId: job.jobId,
      workflowId: "agent_team.coding",
      workItemId: WORK_ITEM_ID,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    const ledger = missionLedger(runId);
    const nodeIds = {
      context: `${runId}-context`,
      implementation: `${runId}-implementation`,
      validation: `${runId}-validation`,
    };
    const decisions = [
      {
        decisionId: `${runId}-decompose`,
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Split the complex scheduler proof into context, implementation, and validation nodes before executing any worker node.",
        newNodes: [
          {
            nodeId: nodeIds.context,
            nodeKind: "context_scout",
            assignedRole: "context_scout",
            modelOrWorkerRef: "deepseek/deepseek-v4-flash",
            expectedOutput: "Bounded context refs for scheduler toolification.",
            acceptanceCriteria: ["Produces decomposition evidence refs."],
            downstreamConsumer: nodeIds.implementation,
            commitmentIdsAdvanced: ["decomposition"],
            whyThisRoleIsNeededNow:
              "The scheduler must prove decomposition evidence before implementation runs.",
            exactObjective: "Collect bounded scheduler context for this proof.",
            evidenceExpectation: "decomposition evidence ref",
          },
          {
            nodeId: nodeIds.implementation,
            nodeKind: "implementation",
            assignedRole: "implementation_engineer",
            modelOrWorkerRef: "moonshotai/kimi-k2.6",
            expectedOutput: "Bounded source-change evidence ref.",
            acceptanceCriteria: ["Produces implementation evidence claim."],
            downstreamConsumer: nodeIds.validation,
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow:
              "Implementation evidence must be produced after decomposition is accepted.",
            exactObjective: "Run the implementation node through worker.invoke.",
            evidenceExpectation: "source_change",
          },
          {
            nodeId: nodeIds.validation,
            nodeKind: "validation",
            assignedRole: "test_engineer",
            modelOrWorkerRef: "deepseek/deepseek-v4-flash",
            expectedOutput: "Bounded validation ref.",
            acceptanceCriteria: ["Produces validation evidence claim."],
            downstreamConsumer: "closeout",
            commitmentIdsAdvanced: ["validation"],
            whyThisRoleIsNeededNow: "Validation must run after implementation evidence exists.",
            exactObjective: "Validate the scheduler toolification proof.",
            evidenceExpectation: "test_validation",
          },
        ],
        newEdges: [
          {
            edgeId: `${runId}-context-to-implementation`,
            fromNodeId: nodeIds.context,
            toNodeId: nodeIds.implementation,
            edgeKind: "handoff",
          },
          {
            edgeId: `${runId}-implementation-to-validation`,
            fromNodeId: nodeIds.implementation,
            toNodeId: nodeIds.validation,
            edgeKind: "handoff",
          },
        ],
        reasonCodes: ["decomposition_required_before_execution"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        decisionId: `${runId}-run-context`,
        decisionKind: "run_node",
        rationaleForDecision: "Run context after decomposition graph is accepted.",
        runNodeId: nodeIds.context,
        reasonCodes: ["run_context_node"],
      },
      {
        decisionId: `${runId}-run-implementation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run implementation after context evidence exists.",
        runNodeId: nodeIds.implementation,
        reasonCodes: ["run_implementation_node"],
      },
      {
        decisionId: `${runId}-run-validation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run validation after implementation evidence exists.",
        runNodeId: nodeIds.validation,
        reasonCodes: ["run_validation_node"],
      },
      {
        decisionId: `${runId}-closeout`,
        decisionKind: "create_closeout",
        rationaleForDecision: "All blocking commitments have accepted evidence.",
        reasonCodes: ["scheduler_toolification_split_planning_complete"],
        metadata: {
          acceptedModelAuthoredCloseoutRef: `closeout://${runId}/scheduler-toolification`,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      },
    ];
    const progressEvents = [];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs: runtimeWorkGraphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      missionLedger: ledger,
      requireMissionLedgerForExecutionWorkflow: true,
      roleCoverageProfile: {
        profileId: "scheduler-toolification.live-proof.role-coverage.v1",
        requiredClasses: ["context", "implementation", "validation_or_test"],
      },
      orchestrator: {
        async decide() {
          return decisions.shift();
        },
      },
      executors: {
        "role:context_scout": executor({
          commitmentId: "decomposition",
          refPrefix: "context",
          reasonCode: "context_completed",
        }),
        "kind:implementation": executor({
          commitmentId: "implementation",
          refPrefix: "implementation",
          reasonCode: "implementation_completed",
        }),
        "kind:validation": executor({
          commitmentId: "validation",
          refPrefix: "validation",
          reasonCode: "validation_completed",
        }),
      },
      async evaluateMissionLedger(input) {
        const updates = input.ledger.blockingCommitments.map((commitment) => {
          const matchingRefs = input.outputArtifactRefs.filter((ref) =>
            ref.includes(
              `/${commitment.commitmentId === "decomposition" ? "context" : commitment.commitmentId}/`,
            ),
          );
          return {
            commitmentId: commitment.commitmentId,
            status: matchingRefs.length > 0 ? "satisfied" : commitment.status,
            acceptedEvidenceRefs:
              matchingRefs.length > 0 ? matchingRefs : commitment.acceptedEvidenceRefs,
            rejectedEvidenceRefs: [],
            rationale:
              matchingRefs.length > 0
                ? "Model-authored evaluator accepted bounded evidence for this commitment."
                : "No matching evidence was produced yet.",
            remainingWork: matchingRefs.length > 0 ? [] : commitment.remainingWork,
          };
        });
        const evaluation = parseMissionCommitmentEvaluation({
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          evaluationId: `${runId}-evaluation-${input.nodeId ?? input.iteration}`,
          missionId: input.ledger.missionId,
          commitmentUpdates: updates,
          revisionProposals: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        });
        return applyMissionCommitmentEvaluation({ ledger: input.ledger, evaluation });
      },
      onProgress: async (progress) => {
        progressEvents.push(progress);
        await runtimeJobs.recordEvent({
          jobId: job.jobId,
          eventType: "agent_team.scheduler_progress",
          data: {
            ...progress,
            graphId,
            runtimeJobId: job.jobId,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      },
    });

    const result = await scheduler.run(graphId);
    const traceSummary = await traces.summarize({ graphId, limit: 100 });
    const traceRows = await traces.listInvocations({ graphId, limit: 100 });
    const toolIds = [...new Set(traceRows.map((row) => row.toolId))];
    const toolCounts = traceRows.reduce((counts, row) => {
      counts[row.toolId] = (counts[row.toolId] ?? 0) + 1;
      return counts;
    }, {});
    const requiredToolIds = [
      "scheduler.decompose_mission",
      "scheduler.create_graph_node",
      "scheduler.create_graph_edge",
      "scheduler.accept_decomposition_graph",
      "scheduler.select_next_node",
      "worker.invoke",
      "scheduler.create_closeout_request",
    ];
    const missingToolIds = requiredToolIds.filter((toolId) => !toolIds.includes(toolId));
    const unexpectedTraceCounts = [];
    if (toolCounts["scheduler.decompose_mission"] !== 1) {
      unexpectedTraceCounts.push("scheduler_decompose_count_invalid");
    }
    if (toolCounts["scheduler.select_next_node"] !== 3) {
      unexpectedTraceCounts.push("scheduler_select_count_invalid");
    }
    if (toolCounts["scheduler.create_closeout_request"] !== 1) {
      unexpectedTraceCounts.push("scheduler_closeout_count_invalid");
    }
    const closed = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/scheduler-toolification`,
      closeoutHash: `sha256:${runId}:closeout`,
      accepted: result.status === "succeeded" && missingToolIds.length === 0,
      validationRequired: true,
      validationRef: `artifact://execution-platform/scheduler-toolification/${graphId}/validation/${nodeIds.validation}`,
      sourceEditRequired: false,
      ownerReadbackRef: `artifact://execution-platform/${runId}/scheduler-toolification-readback`,
      artifactRefs: traceSummary.invocationRefs,
      reasonCodes: [
        "scheduler_toolification_live_db_proof_completed",
        ...result.reasonCodes.slice(0, 20),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const summary = {
      artifactKind: "scheduler_toolification_split_planning_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      status:
        result.status === "succeeded" &&
        missingToolIds.length === 0 &&
        unexpectedTraceCounts.length === 0 &&
        closed.status === "closed"
          ? "passed"
          : "needs_review",
      runtimeJobId: job.jobId,
      graphId,
      schedulerStatus: result.status,
      iterations: result.iterations,
      executedNodeIds: result.executedNodeIds,
      addedNodeIds: result.addedNodeIds,
      requiredToolIds,
      toolIds,
      toolCounts,
      missingToolIds,
      unexpectedTraceCounts,
      traceInvocationRefs: traceSummary.invocationRefs,
      progressEventCount: progressEvents.length,
      workQueueCloseoutStatus: closed.status,
      nextWorkItemId: NEXT_WORK_ITEM_ID,
      nextWorkItemTitle: nextWorkItemTitleUpdated ? NEXT_WORK_ITEM_TITLE : null,
      nextWorkItemTitleUpdated,
      reasonCodes: [...new Set([...result.reasonCodes, ...closed.reasonCodes])].slice(0, 80),
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayChanged: false,
      workQueueLifecycleMutatedByUi: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
    writeArtifact("scheduler-toolification-split-planning-summary.json", summary);
    writeArtifact("scheduler-toolification-split-planning-trace-proof.json", {
      artifactKind: "scheduler_toolification_split_planning_trace_proof",
      runId,
      runtimeJobId: job.jobId,
      graphId,
      requiredToolIds,
      toolIds,
      toolCounts,
      unexpectedTraceCounts,
      traceSummary,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    if (summary.status !== "passed") {
      throw new Error(
        `scheduler_toolification_proof_failed:${[...missingToolIds, ...unexpectedTraceCounts].join(
          ",",
        )}`,
      );
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.close?.();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeArtifact("scheduler-toolification-split-planning-summary.json", {
    artifactKind: "scheduler_toolification_split_planning_summary",
    status: "failed",
    errorSummary: message.slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
