#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_IDS = [
  "openclaw-convergence.toolification-05-mission-ledger-evidence-finalization",
  "openclaw-convergence.toolification-06-work-queue-tool-event-readback",
];
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

function ledgerFor(runId, normalizeMissionContractLedger) {
  return normalizeMissionContractLedger({
    missionId: `${runId}-mission`,
    ownerObjectiveSummary:
      "Prove Mission Ledger commitments close only from explicit evidence claims and Work Queue readback surfaces scheduler/worker tool events.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "implementation",
          commitmentText: "Record source-change evidence through a scheduler node.",
          whyItMatters: "Mission closure must not infer from generic artifacts.",
          expectedEvidenceDescription: "A source-change evidence claim.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "validation",
          commitmentText: "Record validation evidence through a scheduler node.",
          whyItMatters: "Finalization must be gated on validation claims.",
          expectedEvidenceDescription: "A test-validation evidence claim.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "readback",
          commitmentText: "Expose tool/event progress in Work Queue owner readback.",
          whyItMatters: "The owner needs visibility into active graph work.",
          expectedEvidenceDescription: "A readback evidence claim.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function nodeExecutor({ commitmentId, evidenceKind, refPrefix, summary }) {
  return {
    async execute(input) {
      const ref = `artifact://execution-platform/mission-ledger-tool-readback/${input.graphId}/${refPrefix}/${input.node.nodeId}`;
      return {
        status: "succeeded",
        outputArtifactRefs: [ref],
        evidenceClaims: [
          {
            commitmentId,
            evidenceRef: ref,
            evidenceKind,
            claimSummary: summary,
            limitations: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
        reasonCodes: [`${refPrefix}_evidence_claim_recorded`],
        metadata: {
          proofNodeKind: input.node.nodeKind,
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
    buildWorkQueueExecutionReadModel,
    createExecutionPlatformDatabaseRuntime,
    normalizeMissionContractLedger,
    parseMissionCommitmentEvaluation,
    registerSchedulerRuntimeTools,
  } = ep;
  const runId = `mission-ledger-tool-readback-${Date.now()}`;
  writeArtifact("mission-ledger-tool-event-readback-preflight.json", {
    artifactKind: "mission_ledger_tool_event_readback_preflight",
    runId,
    workItemIds: WORK_ITEM_IDS,
    runtimeDbBoundaryExpected: "execution_platform_runtime",
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

    for (const workItemId of WORK_ITEM_IDS) {
      if (!(await workQueue.readWorkItemTruth(workItemId))) {
        await workQueue.createWorkItem({
          workItemId,
          itemType: "implementation_slice",
          title: workItemId.endsWith("work-queue-tool-event-readback")
            ? "Work Queue Tool/Event Readback"
            : "Mission Ledger Evidence Claims And Finalization Handoff",
          description:
            "Runtime proof item for Mission Ledger evidence claims and Work Queue tool/event readback.",
          metadata: {
            seededBy: "mission_ledger_tool_event_readback_proof",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: WORK_ITEM_IDS[0],
      payload: {
        workflowId: "agent_team.coding",
        proofKind: "mission_ledger_tool_event_readback",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "mission-ledger-tool-event-readback-proof",
      idempotencyKey: runId,
      maxAttempts: 1,
    });
    const claimed = await runtimeJobs.claimNextJob({
      queueName: "agent-team",
      runtimeJobId: job.jobId,
      workerId: "worker.mission-ledger-tool-event-readback-proof",
    });

    const graphId = `${runId}-graph`;
    await graphs.createGraph({
      graphId,
      runtimeJobId: job.jobId,
      workflowId: "agent_team.coding",
      workItemId: WORK_ITEM_IDS[0],
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    const ledger = ledgerFor(runId, normalizeMissionContractLedger);
    const decisions = [
      {
        decisionId: `${runId}-decomposition`,
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Create the full mission evidence graph before any commitment can close.",
        newNodes: [
          {
            nodeId: `${runId}-context-node`,
            nodeKind: "context_scout",
            assignedRole: "context_scout",
            modelOrWorkerRef: "openrouter.deepseek.deepseek-v4-flash",
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow:
              "Context coverage is required before implementation evidence is trusted.",
            exactObjective: "Record bounded context handoff evidence for the implementation.",
            evidenceExpectation: "context artifact evidence claim.",
            expectedOutput: "Context evidence claim.",
            acceptanceCriteria: ["Evidence claim references a context artifact."],
            downstreamConsumer: "implementation",
            metadata: { capabilityId: "context_scout" },
          },
          {
            nodeId: `${runId}-implementation-node`,
            nodeKind: "implementation",
            assignedRole: "implementation_engineer",
            modelOrWorkerRef: "worker.non-codex-file-edit",
            commitmentIdsAdvanced: ["implementation"],
            whyThisRoleIsNeededNow: "A source-change claim is required before finalization.",
            exactObjective: "Record bounded source-change evidence for the mission.",
            evidenceExpectation: "source_change evidence claim.",
            expectedOutput: "Source-change evidence claim.",
            acceptanceCriteria: ["Evidence claim references an output artifact."],
            downstreamConsumer: "validation",
            metadata: {
              capabilityId: "implementation_microtask",
              taskFamily: "small_source_edit",
              selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
              qualificationEvidenceRefs: [
                ".artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json",
              ],
              stopOrEscalationCondition:
                "Escalate to Codex only if the scoped edit cannot produce source and validation evidence.",
              rawPromptStored: false,
              rawResponseStored: false,
            },
          },
          {
            nodeId: `${runId}-validation-node`,
            nodeKind: "validation",
            assignedRole: "test_engineer",
            modelOrWorkerRef: "worker.validation",
            commitmentIdsAdvanced: ["validation"],
            whyThisRoleIsNeededNow: "A validation claim is required before finalization.",
            exactObjective: "Record bounded validation evidence for the mission.",
            evidenceExpectation: "test_validation evidence claim.",
            expectedOutput: "Validation evidence claim.",
            acceptanceCriteria: ["Evidence claim references a validation artifact."],
            downstreamConsumer: "readback",
            metadata: { capabilityId: "validation_executor" },
          },
          {
            nodeId: `${runId}-readback-node`,
            nodeKind: "observability_readback",
            assignedRole: "observability_scribe",
            modelOrWorkerRef: "worker.work_queue_readback",
            commitmentIdsAdvanced: ["readback"],
            whyThisRoleIsNeededNow: "The owner needs tool/event progress in Work Queue.",
            exactObjective: "Record bounded Work Queue readback evidence.",
            evidenceExpectation: "readback evidence claim.",
            expectedOutput: "Owner readback evidence claim.",
            acceptanceCriteria: ["Readback contains active graph progress and tool events."],
            downstreamConsumer: "closeout",
            metadata: { capabilityId: "work_queue_readback" },
          },
          {
            nodeId: `${runId}-review-node`,
            nodeKind: "reviewer",
            assignedRole: "reviewer",
            modelOrWorkerRef: "openrouter.deepseek.deepseek-v4-pro",
            commitmentIdsAdvanced: ["readback"],
            whyThisRoleIsNeededNow:
              "Review coverage is required before final closeout can be accepted.",
            exactObjective: "Review the bounded evidence claims and readback surface.",
            evidenceExpectation: "review evidence claim.",
            expectedOutput: "Review evidence claim.",
            acceptanceCriteria: ["Evidence claim references a review artifact."],
            downstreamConsumer: "closeout",
            metadata: { capabilityId: "reviewer" },
          },
        ],
        newEdges: [
          {
            fromNodeId: `${runId}-context-node`,
            toNodeId: `${runId}-implementation-node`,
            edgeKind: "handoff",
            reasonCodes: ["context_before_implementation"],
          },
          {
            fromNodeId: `${runId}-implementation-node`,
            toNodeId: `${runId}-validation-node`,
            edgeKind: "depends_on",
            reasonCodes: ["implementation_before_validation"],
          },
          {
            fromNodeId: `${runId}-validation-node`,
            toNodeId: `${runId}-readback-node`,
            edgeKind: "depends_on",
            reasonCodes: ["validation_before_readback"],
          },
          {
            fromNodeId: `${runId}-readback-node`,
            toNodeId: `${runId}-review-node`,
            edgeKind: "depends_on",
            reasonCodes: ["readback_before_review"],
          },
        ],
        runNodeId: `${runId}-context-node`,
        runAfterAdd: true,
        reasonCodes: ["mission_evidence_graph_decomposed"],
      },
      {
        decisionId: `${runId}-implementation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run implementation after context evidence exists.",
        runNodeId: `${runId}-implementation-node`,
        reasonCodes: ["implementation_claim_needed"],
      },
      {
        decisionId: `${runId}-validation`,
        decisionKind: "run_node",
        rationaleForDecision: "Run validation after source-change evidence exists.",
        runNodeId: `${runId}-validation-node`,
        reasonCodes: ["validation_claim_needed"],
      },
      {
        decisionId: `${runId}-readback`,
        decisionKind: "run_node",
        rationaleForDecision: "Record owner readback evidence after validation.",
        runNodeId: `${runId}-readback-node`,
        reasonCodes: ["readback_claim_needed"],
      },
      {
        decisionId: `${runId}-review`,
        decisionKind: "run_node",
        rationaleForDecision: "Run review before final closeout.",
        runNodeId: `${runId}-review-node`,
        reasonCodes: ["review_claim_needed"],
      },
      {
        decisionId: `${runId}-closeout`,
        decisionKind: "create_closeout",
        rationaleForDecision: "All blocking commitments have accepted evidence claims.",
        metadata: {
          acceptedModelAuthoredCloseoutRef: `closeout://mission-ledger-tool-readback/${runId}`,
        },
        reasonCodes: ["accepted_closeout_ref_present"],
      },
    ];
    const progressEventRefs = [];
    const childWorkItemIds = [];
    let latestLedger = ledger;
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      requireMissionLedgerForExecutionWorkflow: true,
      requireEvidenceClaimsForMissionLedger: true,
      missionLedger: ledger,
      orchestrator: {
        async decide() {
          return (
            decisions.shift() ?? {
              decisionId: `${runId}-fallback-needs-review`,
              decisionKind: "mark_needs_review",
              rationaleForDecision: "No more proof decisions are available.",
              reasonCodes: ["proof_decisions_exhausted"],
            }
          );
        },
      },
      executors: {
        "role:context_scout": nodeExecutor({
          commitmentId: "implementation",
          evidenceKind: "artifact",
          refPrefix: "context",
          summary: "Context scout produced bounded handoff evidence.",
        }),
        "role:implementation_engineer": nodeExecutor({
          commitmentId: "implementation",
          evidenceKind: "source_change",
          refPrefix: "implementation",
          summary: "Implementation node produced bounded source-change evidence.",
        }),
        "kind:implementation": nodeExecutor({
          commitmentId: "implementation",
          evidenceKind: "source_change",
          refPrefix: "implementation",
          summary: "Implementation node produced bounded source-change evidence.",
        }),
        "role:test_engineer": nodeExecutor({
          commitmentId: "validation",
          evidenceKind: "test_validation",
          refPrefix: "validation",
          summary: "Validation node produced bounded validation evidence.",
        }),
        "kind:validation": nodeExecutor({
          commitmentId: "validation",
          evidenceKind: "test_validation",
          refPrefix: "validation",
          summary: "Validation node produced bounded validation evidence.",
        }),
        "role:observability_scribe": nodeExecutor({
          commitmentId: "readback",
          evidenceKind: "readback",
          refPrefix: "readback",
          summary: "Readback node produced bounded Work Queue tool/event evidence.",
        }),
        "kind:observability_readback": nodeExecutor({
          commitmentId: "readback",
          evidenceKind: "readback",
          refPrefix: "readback",
          summary: "Readback node produced bounded Work Queue tool/event evidence.",
        }),
        "role:reviewer": nodeExecutor({
          commitmentId: "readback",
          evidenceKind: "review",
          refPrefix: "review",
          summary: "Reviewer produced bounded review evidence for readback/finalization.",
        }),
        "kind:reviewer": nodeExecutor({
          commitmentId: "readback",
          evidenceKind: "review",
          refPrefix: "review",
          summary: "Reviewer produced bounded review evidence for readback/finalization.",
        }),
      },
      async evaluateMissionLedger(input) {
        const evaluation = parseMissionCommitmentEvaluation({
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          evaluationId: `${runId}-eval-${input.iteration}`,
          missionId: input.ledger.missionId,
          commitmentUpdates: input.evidenceClaims.map((claim) => ({
            commitmentId: claim.commitmentId,
            status: "satisfied",
            acceptedEvidenceRefs: [claim.evidenceRef],
            rejectedEvidenceRefs: [],
            rationale: `Bounded proof evaluator accepted explicit ${claim.evidenceKind} claim.`,
            remainingWork: [],
          })),
          revisionProposals: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        });
        latestLedger = applyMissionCommitmentEvaluation({
          ledger: input.ledger,
          evaluation,
          availableEvidenceRefs: input.evidenceClaims.map((claim) => claim.evidenceRef),
        });
        const ref = `runtime-job://${job.jobId}/mission-contract-evaluation/${evaluation.evaluationId}`;
        await runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.mission_contract_evaluation",
          storageKind: "metadata",
          uri: ref,
          contentType: "application/json",
          metadata: evaluation,
        });
        await runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.mission_contract_ledger",
          storageKind: "metadata",
          uri: `runtime-job://${job.jobId}/mission-contract-ledger/${latestLedger.missionId}-${input.iteration}`,
          contentType: "application/json",
          metadata: latestLedger,
        });
        return latestLedger;
      },
      async onProgress(progress) {
        const ref = `runtime-job://${job.jobId}/runtime-work-graph/progress/${String(
          progressEventRefs.length + 1,
        ).padStart(3, "0")}-${progress.stage}`;
        progressEventRefs.push(ref);
        await runtimeJobs.recordEvent({
          jobId: job.jobId,
          eventType: "agent_team.scheduler_progress",
          data: {
            ...progress,
            graphId,
            runtimeJobId: job.jobId,
            latestToolEventKind: progress.schedulerToolId ?? null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        });
        await runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.scheduler_progress",
          storageKind: "metadata",
          uri: ref,
          contentType: "application/json",
          metadata: {
            ...progress,
            graphId,
            runtimeJobId: job.jobId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
      },
      async onNodeAdded({ node, reasonCodes }) {
        const sync = await workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: WORK_ITEM_IDS[0],
          graphId,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          assignedWorkflow: "agent_team.coding",
          queueStatus: "active",
          title: `${node.nodeKind} - ${node.assignedRole}`,
          runtimeJobId: job.jobId,
          graphNodeRef: `runtime-work-graph://${graphId}/node/${node.nodeId}`,
          evidenceRefs: [],
          blockerReasonCodes: reasonCodes,
          actorId: "system:mission-ledger-tool-event-readback-proof",
        });
        childWorkItemIds.push(sync.childWorkItemId);
      },
      async onNodeStatusChanged({ node, nodeStatus, evidenceRefs, reasonCodes }) {
        await workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: WORK_ITEM_IDS[0],
          graphId,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          assignedWorkflow: "agent_team.coding",
          queueStatus: nodeStatus === "succeeded" ? "closed" : "needs_review",
          title: `${node.nodeKind} - ${node.assignedRole}`,
          runtimeJobId: job.jobId,
          graphNodeRef: `runtime-work-graph://${graphId}/node/${node.nodeId}`,
          evidenceRefs,
          blockerReasonCodes: reasonCodes,
          actorId: "system:mission-ledger-tool-event-readback-proof",
        });
      },
      async onMissionLedgerUpdated(ledger) {
        latestLedger = ledger;
      },
      maxIterations: 12,
    });

    const result = await scheduler.run(graphId);
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.closeout_capsule",
      storageKind: "metadata",
      uri: `closeout://mission-ledger-tool-readback/${runId}`,
      contentType: "application/json",
      metadata: {
        capsuleId: `${runId}-capsule`,
        humanReport: {
          source: "model",
          reportMarkdown:
            "Mission Ledger commitments were closed from explicit evidence claims, and Work Queue readback surfaced scheduler/tool progress.",
        },
        structuredSummary: {
          result: "passed",
          eli5Progress:
            "OpenClaw proved each checklist item with a named evidence claim instead of guessing from random artifacts.",
        },
        missionContractLedger: latestLedger,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    const validationRef = `validation://${runId}/mission-ledger-tool-event-readback`;
    for (const workItemId of WORK_ITEM_IDS) {
      await workQueue.completeWorkQueueItemFromCloseout({
        workItemId,
        runtimeJobId: job.jobId,
        closeoutRef: `closeout://mission-ledger-tool-readback/${runId}`,
        accepted: result.status === "succeeded",
        validationRequired: true,
        validationRef,
        sourceEditRequired: false,
        changedFileRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "validation.completed",
      data: {
        validationRef,
        status: result.status === "succeeded" ? "passed" : "failed",
        rawCommandLogsStored: false,
      },
    });
    if (result.status === "succeeded") {
      if (claimed) {
        await runtimeJobs.completeJob({
          leaseToken: claimed.leaseToken,
          result: {
            artifactKind: "mission_ledger_tool_event_readback_runtime_result",
            resultSummary:
              "Mission Ledger evidence claims and Work Queue tool/event readback passed.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
    } else {
      if (claimed) {
        await runtimeJobs.failJob({
          leaseToken: claimed.leaseToken,
          error: {
            artifactKind: "mission_ledger_tool_event_readback_runtime_error",
            reasonCodes: result.reasonCodes,
            resultSummary: "Mission Ledger/tool readback proof did not reach clean success.",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
    }

    const readModel = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId: WORK_ITEM_IDS[0],
    });
    const activeGraphProgress = readModel.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress;
    const summary = {
      artifactKind: "mission_ledger_tool_event_readback_summary",
      runId,
      jobId: job.jobId,
      graphId,
      workItemIds: WORK_ITEM_IDS,
      childWorkItemIds: [...new Set(childWorkItemIds)],
      schedulerStatus: result.status,
      reasonCodes: result.reasonCodes,
      missionLedger: result.missionLedger,
      activeGraphProgress,
      progressEventRefs,
      passed:
        result.status === "succeeded" &&
        result.missionLedger?.openBlockingCommitmentCount === 0 &&
        activeGraphProgress?.state === "present" &&
        (activeGraphProgress?.workerToolTrace.invocationRefs.length ?? 0) > 0 &&
        (activeGraphProgress?.evidenceClaimRefs.length ?? 0) > 0,
      codexCliInvokedManually: false,
      acpUsed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutatedByUi: false,
    };
    writeArtifact("mission-ledger-tool-event-readback-summary.json", summary);
    writeArtifact("mission-ledger-tool-event-readback-work-queue-readback.json", {
      artifactKind: "mission_ledger_tool_event_readback_work_queue_readback",
      runId,
      workItemId: WORK_ITEM_IDS[0],
      linkedRuntimeJobIds: readModel.linkedRuntimeJobIds,
      ownerProgressReadback: readModel.runtimeJobs[0]?.ownerProgressReadback,
      missionContract: readModel.runtimeJobs[0]?.ownerReadback.missionContract,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    if (!summary.passed) {
      process.exitCode = 1;
    }
  } finally {
    await runtime?.pool?.end?.();
  }
}

main().catch((error) => {
  writeArtifact("mission-ledger-tool-event-readback-failure.json", {
    artifactKind: "mission_ledger_tool_event_readback_failure",
    errorName: error instanceof Error ? error.name : "unknown_error",
    errorMessage: error instanceof Error ? error.message : String(error),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });
  console.error(error);
  process.exit(1);
});
