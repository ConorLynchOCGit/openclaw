#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/operator-frontier-readback-latest-run-state",
);
const proofPath = path.join(artifactDir, "proof.json");

const [dbApi, migrationApi, jobApi, workQueueApi, readbackApi, latestStateApi] = await Promise.all([
  tsImport(path.join(root, "extensions/execution-platform/src/db/pg-test.ts"), import.meta.url),
  tsImport(path.join(root, "extensions/execution-platform/src/db/migrations.ts"), import.meta.url),
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
  tsImport(
    path.join(root, "extensions/execution-platform/src/observability/latest-run-state.ts"),
    import.meta.url,
  ),
]);

const { createExecutionPlatformPgMemTestDatabase } = dbApi;
const { applyExecutionPlatformMigrations } = migrationApi;
const { RuntimeJobRepository } = jobApi;
const { WorkQueueRepository } = workQueueApi;
const { buildWorkQueueExecutionReadModel } = readbackApi;
const { buildLatestRunState } = latestStateApi;

async function withDatabase(work) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(database.sql);
  } finally {
    await database.close();
  }
}

function schedulerProgress() {
  return {
    artifactKind: "agent_team_scheduler_progress",
    graphId: "operator-frontier-readback-proof-graph",
    runtimeJobId: "operator-frontier-readback-proof-job",
    stage: "scheduler_parallel_frontier",
    status: "needs_review",
    roleId: "implementation_engineer",
    nodeId: "implementation-a",
    activeNodeKind: "implementation",
    modelRef: "qwen/qwen3-coder-next",
    providerPath: "openrouter",
    currentObjective:
      "Apply bounded implementation changes for packet-backed Product/Spec workflow wiring.",
    currentPhase: "parallel_frontier_evaluated",
    schedulerPhase: "frontier_selection",
    schedulerToolId: "scheduler.select_next_node",
    schedulerToolInvocationRefs: ["runtime-tool://scheduler/select-next-node/proof"],
    sourcePromptHash: "sha256:operator-frontier-proof-prompt",
    sourcePromptLength: 22_000,
    reasonCodes: ["scheduler_canonical_frontier_state_evaluated"],
    parallelFrontier: {
      artifactKind: "runtime_work_graph_parallel_frontier_readback",
      schemaVersion: "execution-platform.runtime-work-graph.parallel-frontier.v1",
      currentSuperstep: 4,
      maxParallelNodeExecutions: 3,
      dependencyLayerCount: 5,
      readyNodeIds: ["implementation-a", "implementation-b"],
      selectedNodeIds: ["implementation-a", "implementation-b"],
      runningNodeIds: ["implementation-a"],
      completedNodeIds: ["context-a", "resource-a"],
      blockedNodeIds: ["implementation-c"],
      failedNodeIds: [],
      needsReviewNodeIds: ["implementation-c"],
      waitingForHumanNodeIds: [],
      skippedReasonCodes: ["provider_budget_kept_implementation-c_waiting"],
      branchResults: [
        {
          branchId: "frontier:4:branch:1:implementation-a",
          nodeId: "implementation-a",
          nodeKind: "implementation",
          capabilityId: "implementation.qwen.scoped_patch",
          targetCommitmentIds: ["C1"],
          status: "running",
          evidenceRefs: ["node-execution-packet://implementation-a"],
          readinessStateRef: "node-readiness://implementation-a",
          reasonCodes: ["frontier_node_running"],
        },
        {
          branchId: "frontier:4:branch:2:implementation-c",
          nodeId: "implementation-c",
          nodeKind: "implementation",
          capabilityId: "implementation.kimi.scoped_patch",
          targetCommitmentIds: ["C3"],
          status: "needs_review",
          blockerSummary: "Resource materialization is missing readable target snapshots.",
          failureClass: "resource_materialization",
          errorPath: "nodeReadinessState.snapshotStatus",
          repairAction: "materialize_target_snapshots",
          evidenceRefs: ["node-readiness://implementation-c"],
          readinessStateRef: "node-readiness://implementation-c",
          reasonCodes: ["target_snapshot_missing"],
        },
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    schedulerFrontierState: {
      artifactKind: "runtime_work_graph_scheduler_frontier_state",
      schemaVersion: "execution-platform.runtime-work-graph.scheduler-frontier.v1",
      graphId: "operator-frontier-readback-proof-graph",
      currentSuperstep: 4,
      executableReadyNodeIds: ["implementation-a", "implementation-b"],
      selectedExecutableNodeIds: ["implementation-a", "implementation-b"],
      blockedFrontierNodeIds: ["implementation-c"],
      aggregateBlockedNodeIds: ["implementation-c"],
      dependencyBlockedNodeIds: [],
      contextBlockedNodeIds: [],
      resourceBlockedNodeIds: ["implementation-c"],
      lockConflictNodeIds: [],
      providerBudgetBlockedNodeIds: [],
      readinessRefs: ["node-readiness://implementation-a", "node-readiness://implementation-c"],
      resourceRefs: ["node-execution-packet://implementation-a"],
      contextRefs: ["context-handoff://implementation-a"],
      openCommitmentIds: ["C1", "C2", "C3"],
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
      graphId: "operator-frontier-readback-proof-graph",
      iteration: 7,
      superstep: 4,
      executableFrontierNodeIds: ["implementation-a", "implementation-b"],
      blockedFrontierNodeIds: ["implementation-c"],
      blockerReasonCodes: ["target_snapshot_missing"],
      openCommitmentIds: ["C1", "C2", "C3"],
      reusedNodeIds: ["implementation-c"],
      reusedEdgeIds: [],
      selectedDecisionId: "repair-implementation-c",
      selectedDecisionKind: "add_nodes",
      terminalBlockerCode: "frontier_repeated_resource_blocker",
      signatureHash: "sha256:no-progress-proof",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    noProgressRepeatCount: 2,
    missionLedgerEvaluationThrottle: {
      artifactKind: "runtime_work_graph_mission_ledger_evaluation_throttle",
      schemaVersion: "execution-platform.runtime-work-graph.mission-ledger-evaluation-throttle.v1",
      nodeId: "implementation-c",
      nodeKind: "implementation",
      eventClass: "resource_materialization",
      shouldEvaluate: false,
      evidenceClaimCount: 0,
      reasonCodes: ["mission_contract_evaluation_throttled_no_closure_claims"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    blockerSummary: "implementation-c is blocked on missing target snapshots.",
    nextDecisionNeeded: "materialize_target_snapshots",
    eli5Progress:
      "Two implementation branches are ready/running, while one branch is blocked on missing file snapshots.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

async function runProof() {
  return withDatabase(async (sql) => {
    const runtimeJobs = new RuntimeJobRepository(sql, {
      now: () => new Date("2026-05-22T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(sql, runtimeJobs);
    const workItemId = "operator-frontier-readback-proof-item";
    const job = await runtimeJobs.enqueueJob({
      jobId: "operator-frontier-readback-proof-job",
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: {
        workflowId: "agent_team.coding",
        objectiveSummary: "Prove latest-run-state and Work Queue frontier readback agreement.",
      },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Operator frontier readback proof",
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

    const progress = schedulerProgress();
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "agent_team.scheduler_progress",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/runtime-work-graph/scheduler-progress/001-proof`,
      contentType: "application/json",
      metadata: progress,
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: progress,
    });

    const latestRunState = buildLatestRunState({
      runtimeJobId: job.jobId,
      workItemId,
      promptHash: progress.sourcePromptHash,
      promptRef: `source-prompt://${job.jobId}/proof`,
      promptLength: progress.sourcePromptLength,
      processRunning: true,
      runtimeJob: { ...job, state: "running" },
      graphId: progress.graphId,
      latestProgress: progress,
      latestReasonCodes: progress.reasonCodes,
      latestArtifactRefs: progress.artifactRefs ?? [],
      totalWallMs: 42_000,
      phaseWallClock: [
        { phase: "frontier_selection", wallMs: 5000 },
        { phase: "resource_materialization", wallMs: 37_000 },
      ],
      modelUsageByModel: [
        {
          modelRef: "qwen/qwen3-coder-next",
          usageKind: "provider_reported",
          inputTokens: 1200,
          outputTokens: 350,
        },
      ],
      missingUsageEventCount: 0,
      usageUnavailableReasons: [],
      recommendedOperatorAction: "Materialize missing target snapshots for implementation-c.",
      generatedAt: "2026-05-22T00:00:00.000Z",
    });
    const latestRunStateRef = `runtime-job://${job.jobId}/latest-run-state/current`;
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.latest_run_state",
      storageKind: "metadata",
      uri: latestRunStateRef,
      contentType: "application/json",
      metadata: latestRunState,
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.latest_run_state_updated",
      data: {
        latestRunStateRef,
        activeFrontier: latestRunState.activeFrontier,
        current: latestRunState.current,
        process: latestRunState.process,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
      },
    });

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
    });
    const active =
      model.runtimeJobs[0]?.ownerProgressReadback.activeGraphProgress ??
      assert.fail("missing active graph progress readback");
    assert.equal(active.latestRunState.state, "present");
    assert.equal(active.latestRunState.artifactRef, latestRunStateRef);
    assert.equal(active.latestRunState.activeFrontierStatus, "needs_review");
    assert.deepEqual(active.latestRunState.selectedNodeIds, [
      "implementation-a",
      "implementation-b",
    ]);
    assert.deepEqual(active.latestRunState.blockedNodeIds, ["implementation-c"]);
    assert.equal(
      active.latestRunState.branchStates[1]?.errorPath,
      "nodeReadinessState.snapshotStatus",
    );
    assert.equal(active.latestRunState.noProgressRepeatCount, 2);
    assert.equal(active.latestRunState.terminalBlockerCode, "frontier_repeated_resource_blocker");
    assert.equal(active.latestRunState.missionLedgerThrottleShouldEvaluate, false);
    assert.equal(active.latestRunState.agreement.graphIdMatches, true);
    assert.equal(active.latestRunState.agreement.selectedNodeIdsMatch, true);
    assert.equal(active.latestRunState.agreement.blockedNodeIdsMatch, true);
    assert.equal(active.latestRunState.agreement.nextTransitionMatches, true);
    assert.deepEqual(active.latestRunState.agreement.reasonCodes, []);
    assert.equal(latestRunState.rawPromptStored, false);
    assert.equal(latestRunState.activeFrontier.rawDbRowsStored, false);
    assert.ok(JSON.stringify(latestRunState).length < 32_000);

    return {
      passed: true,
      latestRunStateRef,
      latestRunStateBytes: Buffer.byteLength(JSON.stringify(latestRunState), "utf8"),
      readback: {
        state: active.latestRunState.state,
        activeFrontierStatus: active.latestRunState.activeFrontierStatus,
        selectedNodeIds: active.latestRunState.selectedNodeIds,
        blockedNodeIds: active.latestRunState.blockedNodeIds,
        branchStates: active.latestRunState.branchStates,
        noProgressRepeatCount: active.latestRunState.noProgressRepeatCount,
        terminalBlockerCode: active.latestRunState.terminalBlockerCode,
        agreement: active.latestRunState.agreement,
      },
    };
  });
}

await mkdir(artifactDir, { recursive: true });
const proof = {
  artifactKind: "execution_platform_operator_frontier_readback_latest_run_state_proof",
  schemaVersion: "execution-platform.operator-frontier-readback-latest-run-state-proof.v1",
  generatedAt: new Date().toISOString(),
  proof: await runProof(),
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    { passed: true, proofPath, latestRunStateRef: proof.proof.latestRunStateRef },
    null,
    2,
  ),
);
