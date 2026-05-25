#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle",
);
const proofPath = path.join(artifactDir, "proof.json");
const now = new Date().toISOString();

const [dbApi, migrationApi, graphApi, schedulerApi, missionApi, jobApi, workQueueApi, readbackApi] =
  await Promise.all([
    tsImport(path.join(root, "extensions/execution-platform/src/db/pg-test.ts"), import.meta.url),
    tsImport(
      path.join(root, "extensions/execution-platform/src/db/migrations.ts"),
      import.meta.url,
    ),
    tsImport(
      path.join(
        root,
        "extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts",
      ),
      import.meta.url,
    ),
    tsImport(
      path.join(
        root,
        "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      ),
      import.meta.url,
    ),
    tsImport(
      path.join(root, "extensions/execution-platform/src/workflows/mission-contract-ledger.ts"),
      import.meta.url,
    ),
    tsImport(
      path.join(root, "extensions/execution-platform/src/runtime-job-repository.ts"),
      import.meta.url,
    ),
    tsImport(
      path.join(root, "extensions/execution-platform/src/work-queue/work-queue-repository.ts"),
      import.meta.url,
    ),
    tsImport(
      path.join(root, "extensions/execution-platform/src/work-queue/execution-read-model.ts"),
      import.meta.url,
    ),
  ]);

const { createExecutionPlatformPgMemTestDatabase } = dbApi;
const { applyExecutionPlatformMigrations } = migrationApi;
const { RuntimeWorkGraphRepository } = graphApi;
const { RuntimeWorkGraphScheduler } = schedulerApi;
const { normalizeMissionContractLedger } = missionApi;
const { RuntimeJobRepository } = jobApi;
const { WorkQueueRepository } = workQueueApi;
const { buildWorkQueueExecutionReadModel } = readbackApi;

async function withDatabase(work) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(database.sql);
  } finally {
    await database.close();
  }
}

async function createGraph(sql, graphId) {
  const graphs = new RuntimeWorkGraphRepository(sql, {
    now: () => new Date("2026-05-22T00:00:00.000Z"),
  });
  await graphs.createGraph({
    graphId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });
  return graphs;
}

function missionLedger() {
  return normalizeMissionContractLedger({
    missionId: "scheduler-frontier-proof-mission",
    ownerObjectiveSummary: "Prove scheduler frontier execution and throttling.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "implementation",
          commitmentText: "Run executable implementation frontier work.",
          whyItMatters: "Ready executable graph work must not starve behind expansion.",
          expectedEvidenceDescription: "Frontier executor evidence ref.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

function succeededExecutor(prefix) {
  return {
    async execute(input) {
      return {
        status: "succeeded",
        outputArtifactRefs: [`artifact://${prefix}/${input.node.nodeId}`],
        reasonCodes: [`${prefix}_completed`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

async function proveFrontierRunsBeforeExpansion() {
  return withDatabase(async (sql) => {
    const graphId = "scheduler-frontier-proof-graph";
    const graphs = await createGraph(sql, graphId);
    const calls = [];
    const progress = [];
    await graphs.addNode({
      graphId,
      nodeId: "ready-context-scout",
      nodeKind: "context_scout",
      assignedRole: "context_scout",
      nodeStatus: "planned",
      metadata: {
        capabilityId: "context_scout",
        executorKey: "kind:context_scout",
        targetRefs: ["src/ready.ts"],
        commitmentIdsAdvanced: ["context-evidence"],
        noContextNeededRationale: "Provider-free lane proof node.",
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
            decisionId: "frontier-proof-stop",
            decisionKind: "mark_needs_review",
            rationaleForDecision: "Stop after the ready frontier proves execution order.",
            reasonCodes: ["frontier_proof_stop_after_execution"],
          };
        },
      },
      executors: {
        "kind:context_scout": {
          async execute(input) {
            calls.push("executor");
            return succeededExecutor("frontier").execute(input);
          },
        },
      },
      onProgress: async (event) => {
        progress.push(event);
      },
    });
    const result = await scheduler.run(graphId);
    assert.equal(result.status, "needs_review");
    assert.equal(calls[0], "executor");
    assert.equal(calls[1], "orchestrator");
    assert.ok(result.executedNodeIds.includes("ready-context-scout"));
    assert.ok(progress.some((event) => event.schedulerFrontierState));
    return {
      passed: true,
      resultStatus: result.status,
      executedNodeIds: result.executedNodeIds,
      callOrder: calls,
      frontierEventCount: progress.filter((event) => event.schedulerFrontierState).length,
    };
  });
}

async function proveRepeatedNoProgressHalts() {
  return withDatabase(async (sql) => {
    const graphId = "scheduler-no-progress-proof-graph";
    const graphs = await createGraph(sql, graphId);
    await graphs.addNode({
      graphId,
      nodeId: "reused-context-helper",
      nodeKind: "context_scout",
      assignedRole: "context_scout",
      nodeStatus: "planned",
      metadata: {
        capabilityId: "context_scout",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    const decisions = [1, 2, 3].map((index) => ({
      decisionId: `reuse-context-helper-${index}`,
      decisionKind: "add_nodes",
      rationaleForDecision: "Attempt to add the same helper node again.",
      reasonCodes: ["proof_reused_only_graph_decision"],
      newNodes: [
        {
          nodeId: "reused-context-helper",
          nodeKind: "context_scout",
          capabilityId: "context_scout",
          executorKey: "kind:context_scout",
          assignedRole: "context_scout",
          expectedOutput: "Context handoff.",
          acceptanceCriteria: ["Context is bounded."],
          downstreamConsumer: "implementation",
          whyThisRoleIsNeededNow: "Context is needed.",
          exactObjective: "Find bounded context.",
          targetRefs: ["src/reused.ts"],
          metadata: {
            expectedEvidence: ["context_handoff"],
            expectedEvidenceSource: "runtime_derived_from_capability_manifest",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        },
      ],
    }));
    const progress = [];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      orchestrator: {
        async decide() {
          return decisions.shift();
        },
      },
      executors: {
        "kind:context_scout": succeededExecutor("context"),
      },
      onProgress: async (event) => {
        progress.push(event);
      },
    });
    const result = await scheduler.run(graphId);
    const noProgressEvents = progress.filter((event) => event.noProgressSignature);
    assert.equal(result.status, "needs_review");
    assert.ok(result.reasonCodes.includes("scheduler_repeated_no_progress_signature_halted"));
    assert.ok(noProgressEvents.some((event) => event.noProgressRepeatCount === 2));
    return {
      passed: true,
      resultStatus: result.status,
      reasonCodes: result.reasonCodes,
      noProgressHashes: [
        ...new Set(noProgressEvents.map((event) => event.noProgressSignature.signatureHash)),
      ],
      maxRepeatCount: Math.max(
        ...noProgressEvents.map((event) => event.noProgressRepeatCount ?? 0),
      ),
    };
  });
}

async function proveMissionLedgerContextThrottle() {
  return withDatabase(async (sql) => {
    const graphId = "scheduler-throttle-proof-graph";
    const graphs = await createGraph(sql, graphId);
    await graphs.addNode({
      graphId,
      nodeId: "context-only",
      nodeKind: "context_scout",
      assignedRole: "context_scout",
      nodeStatus: "planned",
      metadata: {
        capabilityId: "context_scout",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    let evaluationCount = 0;
    const throttleEvents = [];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      missionLedger: missionLedger(),
      preferExecutableFrontierBeforeOrchestrator: true,
      requireEvidenceClaimsForMissionLedger: true,
      evaluateMissionLedger: async ({ ledger }) => {
        evaluationCount += 1;
        return ledger;
      },
      orchestrator: {
        async decide() {
          return {
            decisionId: "throttle-proof-stop",
            decisionKind: "mark_needs_review",
            rationaleForDecision: "Stop after context-only throttle evidence.",
            reasonCodes: ["throttle_proof_stop_after_context"],
          };
        },
      },
      executors: {
        "kind:context_scout": succeededExecutor("context"),
      },
      onProgress: async (event) => {
        if (event.missionLedgerEvaluationThrottle) {
          throttleEvents.push(event.missionLedgerEvaluationThrottle);
        }
      },
    });
    const result = await scheduler.run(graphId);
    assert.equal(result.status, "needs_review");
    assert.equal(evaluationCount, 0);
    assert.equal(throttleEvents.length, 1);
    assert.equal(throttleEvents[0].shouldEvaluate, false);
    assert.ok(
      throttleEvents[0].reasonCodes.includes(
        "mission_contract_evaluation_throttled_no_closure_claims",
      ),
    );
    return {
      passed: true,
      resultStatus: result.status,
      evaluationCount,
      throttle: throttleEvents[0],
    };
  });
}

async function proveWorkQueueReadbackProjection() {
  return withDatabase(async (sql) => {
    const runtimeJobs = new RuntimeJobRepository(sql, {
      now: () => new Date("2026-05-22T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(sql, runtimeJobs);
    const workItemId = "scheduler-frontier-readback-proof-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "scheduler-frontier-readback-proof-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: { workflowId: "agent_team.coding" },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Scheduler frontier readback proof",
      metadata: {
        runtimeJobIds: [job.jobId],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        graphId: "scheduler-frontier-readback-proof-graph",
        currentPhase: "parallel_frontier_evaluated",
        schedulerFrontierState: {
          artifactKind: "runtime_work_graph_scheduler_frontier_state",
          schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
          graphId: "scheduler-frontier-readback-proof-graph",
          currentSuperstep: 3,
          nodeCount: 4,
          edgeCount: 3,
          executableReadyNodeIds: ["implementation-a"],
          selectedExecutableNodeIds: ["implementation-a"],
          blockedFrontierNodeIds: ["implementation-b"],
          aggregateBlockedNodeIds: [],
          dependencyBlockedNodeIds: [],
          contextBlockedNodeIds: [],
          resourceBlockedNodeIds: ["implementation-b"],
          validationBlockedNodeIds: [],
          reviewBlockedNodeIds: [],
          closeoutBlockedNodeIds: [],
          branchIds: ["frontier:3:branch:1:implementation-a"],
          readinessRefs: ["node-readiness://implementation-a"],
          resourceRefs: ["runtime-work-graph://resource/implementation-a"],
          contextRefs: ["runtime-work-graph://context/implementation-a"],
          openCommitmentIds: ["implementation"],
          lockConflictNodeIds: [],
          providerBudgetBlockedNodeIds: [],
          nextLegalTransition: "execute_frontier",
          reasonCodes: ["scheduler_canonical_frontier_state_evaluated"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        noProgressSignature: {
          artifactKind: "runtime_work_graph_no_progress_signature",
          schemaVersion: "execution-platform.runtime-work-graph.no-progress-signature.v1",
          graphId: "scheduler-frontier-readback-proof-graph",
          iteration: 2,
          superstep: 3,
          nodeCount: 4,
          edgeCount: 3,
          executableFrontierNodeIds: ["implementation-a"],
          blockedFrontierNodeIds: ["implementation-b"],
          blockerReasonCodes: ["node_resources_required_before_worker_execution"],
          openCommitmentIds: ["implementation"],
          newEvidenceRefs: [],
          newReadinessRefs: [],
          newWorkQueueRefs: [],
          createdNodeIds: [],
          reusedNodeIds: ["implementation-b"],
          createdEdgeIds: [],
          reusedEdgeIds: [],
          selectedDecisionId: "reuse-implementation-b",
          selectedDecisionKind: "add_nodes",
          terminalBlockerCode: "graph_persistence_reused_only",
          signatureHash: "scheduler-frontier-proof-no-progress",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        noProgressRepeatCount: 2,
        missionLedgerEvaluationThrottle: {
          artifactKind: "runtime_work_graph_mission_ledger_evaluation_throttle",
          schemaVersion:
            "execution-platform.runtime-work-graph.mission-ledger-evaluation-throttle.v1",
          nodeId: "context-only",
          nodeKind: "context_scout",
          eventClass: "context",
          shouldEvaluate: false,
          evidenceClaimCount: 0,
          reasonCodes: ["mission_contract_evaluation_throttled_no_closure_claims"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
      now: new Date("2026-05-22T00:00:00.000Z"),
    });
    const readback = model.runtimeJobs[0].ownerProgressReadback.activeGraphProgress;
    assert.equal(readback.schedulerFrontier.state, "present");
    assert.deepEqual(readback.schedulerFrontier.executableReadyNodeIds, ["implementation-a"]);
    assert.equal(readback.schedulerFrontier.nextLegalTransition, "execute_frontier");
    assert.equal(readback.noProgress.state, "present");
    assert.equal(readback.noProgress.repeatCount, 2);
    assert.equal(readback.missionLedgerEvaluationThrottle.state, "present");
    assert.equal(readback.missionLedgerEvaluationThrottle.shouldEvaluate, false);
    return {
      passed: true,
      linkedRuntimeJobIds: model.linkedRuntimeJobIds,
      activeGraphProgress: {
        schedulerFrontier: readback.schedulerFrontier,
        noProgress: readback.noProgress,
        missionLedgerEvaluationThrottle: readback.missionLedgerEvaluationThrottle,
      },
    };
  });
}

const proof = {
  artifactKind: "scheduler_frontier_no_progress_evaluation_throttle_proof",
  generatedAt: now,
  queueItemId: "openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle",
  proofMode: "provider_free_runtime_repository_lane",
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawDbRowsStored: false,
  results: {
    frontierRunsBeforeExpansion: await proveFrontierRunsBeforeExpansion(),
    repeatedNoProgressHalts: await proveRepeatedNoProgressHalts(),
    missionLedgerContextThrottle: await proveMissionLedgerContextThrottle(),
    workQueueReadbackProjection: await proveWorkQueueReadbackProjection(),
  },
};

await mkdir(artifactDir, { recursive: true });
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      ok: true,
      proofPath:
        ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json",
      resultKeys: Object.keys(proof.results),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
    },
    null,
    2,
  ),
);
