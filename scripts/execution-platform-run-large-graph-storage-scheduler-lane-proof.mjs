#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/large-graph-storage-scheduler-lane",
);
const proofPath = path.join(artifactDir, "proof.json");

const [
  dbApi,
  migrationApi,
  jobApi,
  workQueueApi,
  graphApi,
  schedulerApi,
  readbackApi,
  latestStateApi,
  genericRuntimeApi,
] = await Promise.all([
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
    path.join(root, "extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts"),
    import.meta.url,
  ),
  tsImport(
    path.join(root, "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts"),
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
  tsImport(
    path.join(root, "extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts"),
    import.meta.url,
  ),
]);

const { createExecutionPlatformPgMemTestDatabase } = dbApi;
const { applyExecutionPlatformMigrations } = migrationApi;
const {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  RuntimeJobRepository,
  isRuntimeJobArtifactPayloadManifest,
} = jobApi;
const { WorkQueueRepository } = workQueueApi;
const { RuntimeWorkGraphRepository } = graphApi;
const { RuntimeWorkGraphScheduler } = schedulerApi;
const { buildWorkQueueExecutionReadModel } = readbackApi;
const { buildLatestRunState } = latestStateApi;
const {
  GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
  GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
  genericOrchestrationRuntimeResultArtifactMetadata,
} = genericRuntimeApi;

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function largeSnapshot(index) {
  return {
    snapshotRef: `repo-snapshot://product-spec/${index}`,
    fileRef: `extensions/execution-platform/src/product-spec/fixture-${index}.ts`,
    contentHash: `sha256:${String(index).padStart(4, "0")}`,
    byteCount: 1800 + index,
    contentPreview: `bounded snapshot ${index} `.repeat(45),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function implementationContextPacket(jobId, nodeId) {
  const snapshots = Array.from({ length: 100 }, (_, index) => largeSnapshot(index));
  return {
    artifactKind: "implementation_context_packet",
    schemaVersion: "execution-platform.implementation-context-packet.large-graph-proof.v1",
    packetRef: `runtime-job://${jobId}/implementation-context/${nodeId}`,
    nodeId,
    readinessStatus: "ready",
    targetCommitmentIds: ["product-spec-storage"],
    resolvedTargetFileRefs: snapshots.map((snapshot) => snapshot.fileRef),
    readableTargetFileRefs: snapshots.map((snapshot) => snapshot.fileRef),
    missingTargetRefs: [],
    unreadableTargetRefs: [],
    directoryOnlyTargetRefs: [],
    candidateConcreteFileRefs: snapshots.map((snapshot) => snapshot.fileRef).slice(0, 40),
    targetFileSnapshotRefs: snapshots.map((snapshot) => snapshot.snapshotRef),
    targetFileSnapshotHashes: snapshots.map((snapshot) => snapshot.contentHash),
    targetFileSnapshots: snapshots,
    validationCommandRefs: ["validation://product-spec/focused"],
    handoffSummaryForImplementation:
      "Large Product/Spec proof context is represented by payload refs and bounded manifests.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function resourceMaterializationResult(contextPacket) {
  return {
    artifactKind: "implementation_resource_materialization_result",
    schemaVersion:
      "execution-platform.implementation-resource-materialization-result.large-graph-proof.v1",
    status: "ready",
    implementationContextPacketRef: contextPacket.packetRef,
    resolvedTargetFileRefs: contextPacket.resolvedTargetFileRefs,
    readableTargetFileRefs: contextPacket.readableTargetFileRefs,
    targetFileSnapshotRefs: contextPacket.targetFileSnapshotRefs,
    targetFileSnapshotHashes: contextPacket.targetFileSnapshotHashes,
    targetFileSnapshots: contextPacket.targetFileSnapshots,
    blockingReasonCodes: [],
    nonblockingReasonCodes: ["large_graph_resource_materialization_payload_backed"],
    inputCounts: {
      resolvedTargetFileRefs: contextPacket.resolvedTargetFileRefs.length,
      targetFileSnapshots: contextPacket.targetFileSnapshots.length,
    },
    outputCounts: {
      targetFileSnapshots: contextPacket.targetFileSnapshots.length,
      implementationTaskPackets: 1,
    },
    maxBounds: {
      targetFileSnapshots: 120,
      implementationTaskPackets: 40,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function implementationTaskPacket(jobId, nodeId, contextPacket) {
  return {
    artifactKind: "implementation_task_packet",
    schemaVersion: "execution-platform.implementation-task-packet.large-graph-proof.v1",
    packetRef: `runtime-job://${jobId}/implementation-task/${nodeId}/task-1`,
    nodeId,
    targetCommitmentIds: ["product-spec-storage"],
    targetFileRefs: contextPacket.readableTargetFileRefs.slice(0, 24),
    sourceCommitmentPacketRefs: ["commitment-work-packet://product-spec-storage"],
    contextPacketRefs: [contextPacket.packetRef],
    sourceContextHandoffRefs: ["context-handoff://product-spec-storage"],
    contextSynthesisRefs: ["context-synthesis://product-spec-storage"],
    targetFileSnapshots: contextPacket.targetFileSnapshots.slice(0, 24),
    allowedEditScope: {
      allowedFileRefs: contextPacket.readableTargetFileRefs.slice(0, 24),
      deniedFileRefs: [],
    },
    acceptanceCriteria: [
      "Large graph packets are stored through runtime artifact payload manifests.",
      "Graph node metadata contains refs and bounded summaries only.",
    ],
    validationCommandRefs: ["validation://product-spec/focused"],
    evidenceClaimExpectations: [
      {
        commitmentId: "product-spec-storage",
        evidenceKind: "source_change",
        expectedArtifactRefs: ["artifact://implementation/large-graph-storage"],
      },
    ],
    budgetPolicyRefs: ["budget://proof/large-graph"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function nodeReadinessState(jobId, nodeId, nodeExecutionPacketRef, resourcePacketRef) {
  return {
    artifactKind: "node_readiness_state",
    schemaVersion: "execution-platform.node-readiness-state.large-graph-proof.v1",
    stateRef: `runtime-job://${jobId}/node-readiness/${nodeId}`,
    nodeId,
    phase: "implementation_ready",
    readinessStatus: "ready",
    freshnessStatus: "fresh",
    snapshotStatus: "ready",
    contextStatus: "accepted",
    validationStatus: "ready",
    authorityStatus: "ready",
    evidenceStatus: "ready",
    repairAction: null,
    nextAllowedTransitions: ["execute_node"],
    nodeExecutionPacketRef,
    resourcePacketRef,
    blockingLimitations: [],
    nonblockingLimitations: [],
    reasonCodes: ["large_graph_node_readiness_payload_backed"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

async function withDatabase(work) {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    return await work(database.sql);
  } finally {
    await database.close();
  }
}

async function runProof() {
  return withDatabase(async (sql) => {
    const now = () => new Date("2026-05-22T00:00:00.000Z");
    const runtimeJobs = new RuntimeJobRepository(sql, { now });
    const workQueue = new WorkQueueRepository(sql, runtimeJobs, { now });
    const graphs = new RuntimeWorkGraphRepository(sql, { now });
    const jobId = "large-graph-storage-scheduler-lane-proof-job";
    const workItemId = "openclaw-convergence.product-spec-large-graph-storage-scheduler-lane";
    const graphId = "large-graph-storage-scheduler-lane-proof-graph";
    const readyNodeId = "implementation-ready-large-graph";
    const closeoutNodeId = "closeout-large-graph-proof";

    const job = await runtimeJobs.enqueueJob({
      jobId,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      parentWorkflowId: "agent_team.coding",
      payload: {
        workflowId: "agent_team.coding",
        objectiveSummary:
          "Prove large graph scheduler/storage lane before Product/Spec Planning proof.",
      },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Large Graph Storage And Scheduler Lane",
      queueStatus: "active",
      metadata: {
        runtimeJobIds: [job.jobId],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      },
    });
    await workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: { workQueueLifecycleMutated: false },
    });

    await graphs.createGraph({
      graphId,
      parentWorkItemId: workItemId,
      rootRuntimeJobId: job.jobId,
      workflowId: "agent_team.coding",
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
      metadata: {
        proofLane: "large_graph_storage_scheduler_lane",
        intendedNodeCount: 90,
        intendedEdgeCount: 100,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    for (let index = 0; index < 88; index += 1) {
      const nodeId = `context-proof-${String(index).padStart(2, "0")}`;
      await graphs.addNode({
        graphId,
        nodeId,
        nodeKind: index % 5 === 0 ? "validation" : "context_scout",
        assignedRole: index % 5 === 0 ? "test_engineer" : "context_scout",
        nodeStatus: "succeeded",
        outputArtifactRefs: [`context-handoff://large-graph/${index}`],
        metadata: {
          capabilityId: index % 5 === 0 ? "validation.focused" : "context.scout",
          boundedSummary: `Terminal prerequisite node ${index}; payload bodies live outside graph metadata.`,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }

    const contextPacket = implementationContextPacket(jobId, readyNodeId);
    const materialization = resourceMaterializationResult(contextPacket);
    const taskPacket = implementationTaskPacket(jobId, readyNodeId, contextPacket);
    const nodeExecutionPacketRef = `runtime-job://${jobId}/node-execution/${readyNodeId}`;
    const codingResourcePacketRef = `runtime-job://${jobId}/coding-resource/${readyNodeId}`;
    const readiness = nodeReadinessState(
      jobId,
      readyNodeId,
      nodeExecutionPacketRef,
      codingResourcePacketRef,
    );

    const attachedContext = await runtimeJobs.attachRuntimeArtifactByContract({
      jobId,
      artifactType: "execution_platform.implementation_context_packet",
      uri: contextPacket.packetRef,
      body: contextPacket,
      boundedSummary: "Large implementation context packet stored by payload manifest.",
      targetCommitmentIds: contextPacket.targetCommitmentIds,
      targetNodeIds: [readyNodeId],
      resourcePacketKind: "implementation_context_packet",
      readinessStatus: "ready",
      inputCounts: materialization.inputCounts,
      outputCounts: materialization.outputCounts,
      maxBounds: materialization.maxBounds,
      reasonCodes: ["large_graph_context_packet_payload_required"],
    });
    const attachedMaterialization = await runtimeJobs.attachRuntimeArtifactByContract({
      jobId,
      artifactType: "execution_platform.implementation_resource_materialization_result",
      uri: `runtime-job://${jobId}/implementation-resource-materialization/${readyNodeId}`,
      body: materialization,
      boundedSummary:
        "Large implementation resource materialization result stored by payload manifest.",
      targetCommitmentIds: contextPacket.targetCommitmentIds,
      targetNodeIds: [readyNodeId],
      resourcePacketKind: "implementation_resource_materialization_result",
      readinessStatus: "ready",
      inputCounts: materialization.inputCounts,
      outputCounts: materialization.outputCounts,
      maxBounds: materialization.maxBounds,
      reasonCodes: ["large_graph_resource_materialization_payload_required"],
    });
    const attachedTask = await runtimeJobs.attachRuntimeArtifactByContract({
      jobId,
      artifactType: "execution_platform.implementation_task_packet",
      uri: taskPacket.packetRef,
      body: taskPacket,
      boundedSummary: "Large implementation task packet stored by payload manifest.",
      targetCommitmentIds: taskPacket.targetCommitmentIds,
      targetNodeIds: [readyNodeId],
      resourcePacketKind: "implementation_task_packet",
      readinessStatus: "ready",
      reasonCodes: ["large_graph_task_packet_payload_required"],
    });
    const attachedReadiness = await runtimeJobs.attachRuntimeArtifactByContract({
      jobId,
      artifactType: "execution_platform.node_readiness_state",
      uri: readiness.stateRef,
      body: readiness,
      boundedSummary: "Node readiness state stored by payload manifest.",
      targetCommitmentIds: contextPacket.targetCommitmentIds,
      targetNodeIds: [readyNodeId],
      resourcePacketKind: "node_readiness_state",
      readinessStatus: "ready",
      reasonCodes: ["large_graph_node_readiness_payload_required"],
    });

    await graphs.addNode({
      graphId,
      nodeId: readyNodeId,
      nodeKind: "implementation",
      assignedRole: "implementation_engineer",
      modelOrWorkerRef: "qwen/qwen3-coder-next",
      nodeStatus: "planned",
      inputHandoffRefs: ["context-handoff://large-graph/accepted"],
      metadata: {
        capabilityId: "implementation.qwen.scoped_patch",
        commitmentIdsAdvanced: ["product-spec-storage"],
        exactObjective: "Execute the one ready large-graph implementation branch.",
        targetRefs: taskPacket.targetFileRefs.slice(0, 12),
        implementationContextPacketRef: contextPacket.packetRef,
        implementationTaskPacketRef: taskPacket.packetRef,
        nodeExecutionPacketRef,
        resourcePacketRef: codingResourcePacketRef,
        nodeReadinessStateRef: readiness.stateRef,
        nodeReadinessStatus: "ready",
        nodeReadinessPhase: "implementation_ready",
        nodeReadinessNextAllowedTransitions: ["execute_node"],
        resourceReadinessReasonCodes: ["large_graph_resource_ready"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    await graphs.addNode({
      graphId,
      nodeId: closeoutNodeId,
      nodeKind: "closeout",
      assignedRole: "observability_scribe",
      nodeStatus: "succeeded",
      outputArtifactRefs: ["closeout://large-graph-storage-scheduler-lane/proof"],
      metadata: {
        capabilityId: "closeout.model_authored",
        boundedSummary: "Synthetic closeout evidence exists so completion can be evaluated.",
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    for (let index = 0; index < 100; index += 1) {
      await graphs.addEdge({
        graphId,
        edgeId: `edge-${String(index).padStart(3, "0")}`,
        fromNodeId: `context-proof-${String(index % 88).padStart(2, "0")}`,
        toNodeId: index < 80 ? readyNodeId : closeoutNodeId,
        edgeKind: index < 80 ? "context_supplies" : "closeout_depends_on",
        reasonCodes: ["large_graph_dependency_manifest_only"],
        artifactRefs: [`context-handoff://large-graph/${index % 88}`],
        metadata: {
          boundedSummary: `Manifest edge ${index} carries refs only.`,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }

    const progressEvents = [];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      preferExecutableFrontierBeforeOrchestrator: true,
      maxParallelNodeExecutions: 3,
      maxIterations: 1,
      requireNodeExecutionPacketForWorkerExecution: true,
      orchestrator: {
        async decide() {
          throw new Error("orchestrator_should_not_expand_large_graph_before_ready_frontier");
        },
      },
      executors: {
        "role:implementation_engineer": {
          async execute(input) {
            return {
              status: "succeeded",
              outputArtifactRefs: [
                `artifact://large-graph-storage-scheduler-lane/${input.node.nodeId}/source-change`,
              ],
              evidenceClaims: [
                {
                  commitmentId: "product-spec-storage",
                  evidenceRef: `artifact://large-graph-storage-scheduler-lane/${input.node.nodeId}/source-change`,
                  claimSummary:
                    "Ready implementation branch executed from payload-backed graph state.",
                  limitations: [],
                },
              ],
              reasonCodes: ["large_graph_ready_frontier_executed"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        "role:observability_scribe": {
          async execute() {
            throw new Error("closeout_should_already_be_terminal");
          },
        },
      },
      onProgress: async (progress) => {
        progressEvents.push(progress);
      },
    });

    const schedulerResult = await scheduler.run(graphId);
    assert.ok(
      schedulerResult.executedNodeIds.includes(readyNodeId),
      `ready implementation frontier branch must execute before graph expansion: ${JSON.stringify(
        schedulerResult,
      )}`,
    );

    const refreshedSnapshot = await graphs.readGraphSnapshot(graphId);
    assert.equal(refreshedSnapshot?.nodes.length, 90);
    assert.equal(refreshedSnapshot?.edges.length, 100);

    const genericRuntimeResult = {
      artifactKind: "generic_orchestration_runtime_result",
      engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
      workflowId: "agent_team.coding",
      runtimeJobId: jobId,
      status: schedulerResult.status === "succeeded" ? "succeeded" : "needs_review",
      schedulerStatus: schedulerResult.status,
      graphId,
      executedNodeIds: schedulerResult.executedNodeIds,
      addedNodeIds: schedulerResult.addedNodeIds,
      decisionRefs: schedulerResult.decisionRefs,
      reasonCodes: ["large_graph_storage_scheduler_lane_proof", ...schedulerResult.reasonCodes],
      readiness: {
        artifactKind: "generic_orchestration_runtime_readiness",
        engineId: GENERIC_ORCHESTRATION_RUNTIME_ENGINE_ID,
        workflowId: "agent_team.coding",
        ready: true,
        workflowEngineReadiness: {
          artifactKind: "runtime_workflow_graph_engine_readiness",
          engineId: "runtime-workflow-graph-engine.v1",
          workflowId: "agent_team.coding",
          definitionId: "agent_team.coding",
          pluginId: "agent_team.coding",
          pluginReady: true,
          ready: true,
          reasonCodes: ["large_graph_storage_scheduler_lane_readiness_fixture"],
          missingExecutorKeys: [],
          missingPluginExecutorKeys: [],
          missingRuntimeToolFamilies: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
        reasonCodes: ["large_graph_storage_scheduler_lane_readiness_fixture"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
      schedulerResult: {
        ...schedulerResult,
        syntheticLargeGraphState: {
          nodeIds: refreshedSnapshot.nodes.map((node) => node.nodeId),
          edgeIds: refreshedSnapshot.edges.map((edge) => edge.edgeId),
          repeatedContextHandoffRefs: Array.from(
            { length: 140 },
            (_, index) => `context-handoff://large-graph/${index}`,
          ),
          note: "This intentionally large body must live in payload storage, not metadata.",
        },
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
    const genericRuntimeArtifact = await runtimeJobs.attachRuntimeArtifactByContract({
      jobId,
      artifactType: GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
      uri: `runtime-job://${jobId}/execution/generic-orchestration-runtime/result/agent_team.coding`,
      body: genericRuntimeResult,
      boundedSummary:
        "Large generic orchestration runtime result stored as payload with bounded manifest.",
      targetNodeIds: schedulerResult.executedNodeIds,
      resourcePacketKind: "generic_orchestration_runtime_result",
      readinessStatus: schedulerResult.status,
      reasonCodes: ["large_graph_generic_runtime_result_payload_required"],
      metadata: genericOrchestrationRuntimeResultArtifactMetadata(genericRuntimeResult),
    });

    const latestProgress = {
      artifactKind: "agent_team_scheduler_progress",
      graphId,
      runtimeJobId: jobId,
      stage: "scheduler_parallel_frontier",
      status: "needs_review",
      roleId: "implementation_engineer",
      nodeId: readyNodeId,
      activeNodeKind: "implementation",
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "proof",
      currentObjective: "Large graph ready frontier executed from payload-backed artifacts.",
      currentPhase: "parallel_frontier_completed",
      schedulerPhase: "execution_in_progress",
      schedulerToolId: "scheduler.select_next_node",
      reasonCodes: ["large_graph_storage_scheduler_lane_progress"],
      parallelFrontier:
        progressEvents.find((event) => event.parallelFrontier)?.parallelFrontier ?? null,
      schedulerFrontierState:
        progressEvents.find((event) => event.schedulerFrontierState)?.schedulerFrontierState ??
        null,
      noProgressSignature: {
        artifactKind: "runtime_work_graph_no_progress_signature",
        schemaVersion: "execution-platform.runtime-work-graph.no-progress-signature.v1",
        graphId,
        iteration: 2,
        superstep: 1,
        executableFrontierNodeIds: [readyNodeId],
        blockedFrontierNodeIds: [],
        blockerReasonCodes: [],
        openCommitmentIds: [],
        reusedNodeIds: [],
        reusedEdgeIds: [],
        selectedDecisionId: "large-graph-proof",
        selectedDecisionKind: "run_node",
        terminalBlockerCode: null,
        signatureHash: "sha256:large-graph-proof-no-progress-fixture",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      noProgressRepeatCount: 0,
      missionLedgerEvaluationThrottle: {
        artifactKind: "runtime_work_graph_mission_ledger_evaluation_throttle",
        schemaVersion:
          "execution-platform.runtime-work-graph.mission-ledger-evaluation-throttle.v1",
        nodeId: readyNodeId,
        nodeKind: "implementation",
        eventClass: "large_graph_storage_lane",
        shouldEvaluate: false,
        evidenceClaimCount: 0,
        reasonCodes: ["mission_contract_evaluation_throttled_no_closure_claims"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
      blockerSummary: null,
      nextDecisionNeeded: "inspect_large_graph_lane_proof",
      eli5Progress:
        "Large graph storage stayed payload-backed and the scheduler ran the ready frontier branch before asking for more graph work.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const progressRef = `runtime-job://${jobId}/runtime-work-graph/scheduler-progress/large-graph-proof`;
    const progressArtifact = await runtimeJobs.attachArtifact({
      jobId,
      artifactType: "agent_team.scheduler_progress",
      storageKind: "metadata",
      uri: progressRef,
      contentType: "application/json",
      metadata: latestProgress,
    });
    await runtimeJobs.recordEvent({
      jobId,
      eventType: "agent_team.scheduler_progress",
      data: latestProgress,
    });
    const latestRunState = buildLatestRunState({
      runtimeJobId: jobId,
      workItemId,
      promptHash: "sha256:large-graph-storage-scheduler-lane-proof",
      promptRef: `source-prompt://${jobId}/proof`,
      promptLength: 20_000,
      processRunning: false,
      terminalStatus: schedulerResult.status,
      runtimeJob: { ...job, state: "running" },
      graphId,
      latestProgress,
      latestReasonCodes: latestProgress.reasonCodes,
      latestArtifactRefs: [
        progressRef,
        attachedContext.uri,
        attachedMaterialization.uri,
        attachedTask.uri,
        attachedReadiness.uri,
      ],
      recommendedOperatorAction: "proceed_to_mission_ledger_stability_diagnostics",
      generatedAt: "2026-05-22T00:00:00.000Z",
    });
    const latestRunArtifact = await runtimeJobs.attachArtifact({
      jobId,
      artifactType: "execution_platform.latest_run_state",
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/latest-run-state/current`,
      contentType: "application/json",
      metadata: latestRunState,
    });
    await runtimeJobs.recordEvent({
      jobId,
      eventType: "execution.latest_run_state_updated",
      data: {
        latestRunStateRef: latestRunArtifact.uri,
        sourceProgressRef: progressRef,
        activeFrontier: latestRunState.activeFrontier,
        current: latestRunState.current,
        process: latestRunState.process,
        runtimeJobId: jobId,
        graphId,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });

    const artifacts = await runtimeJobs.listArtifacts(jobId);
    for (const artifact of artifacts) {
      assert.ok(
        jsonBytes(artifact.metadata) <= 64 * 1024,
        `${artifact.artifactType} metadata exceeds runtime limit`,
      );
      if (
        [
          "execution_platform.implementation_context_packet",
          "execution_platform.implementation_resource_materialization_result",
          "execution_platform.implementation_task_packet",
          "execution_platform.node_readiness_state",
          GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
        ].includes(artifact.artifactType)
      ) {
        assert.equal(artifact.storageKind, RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND);
        assert.equal(isRuntimeJobArtifactPayloadManifest(artifact.metadata), true);
      }
    }
    assert.ok(
      jsonBytes(genericRuntimeArtifact.metadata) < 20 * 1024,
      "generic runtime result manifest should be compact",
    );
    assert.equal(
      JSON.stringify(genericRuntimeArtifact.metadata).includes("syntheticLargeGraphState"),
      false,
      "generic runtime result body must not be stored inline in metadata",
    );
    assert.ok(
      jsonBytes(progressArtifact.metadata) < 64 * 1024,
      "agent_team.scheduler_progress must remain bounded",
    );
    assert.ok(
      jsonBytes(latestRunArtifact.metadata) < 32 * 1024,
      "latest-run-state must remain compact enough for Work Queue readback",
    );

    const readback = await buildWorkQueueExecutionReadModel({
      runtimeJobs,
      workQueue,
      workItemId,
    });
    const activeGraphProgress = readback.runtimeJobs[0]?.ownerProgressReadback?.activeGraphProgress;
    assert.ok(activeGraphProgress, "Work Queue readback must expose active graph progress");
    assert.equal(activeGraphProgress?.latestRunState?.state, "present");
    assert.equal(activeGraphProgress?.latestRunState?.graphId, graphId);
    assert.equal(activeGraphProgress?.latestRunState?.terminalStatus, schedulerResult.status);

    return {
      ok: true,
      jobId,
      workItemId,
      graphId,
      nodeCount: refreshedSnapshot.nodes.length,
      edgeCount: refreshedSnapshot.edges.length,
      schedulerStatus: schedulerResult.status,
      executedNodeIds: schedulerResult.executedNodeIds,
      artifactMetadataBytes: Object.fromEntries(
        artifacts.map((artifact) => [artifact.artifactType, jsonBytes(artifact.metadata)]),
      ),
      payloadArtifactTypes: artifacts
        .filter((artifact) => artifact.storageKind === RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND)
        .map((artifact) => artifact.artifactType),
      progressEventCount: progressEvents.length,
      latestRunStateStatus: activeGraphProgress?.latestRunState?.activeFrontierStatus,
      latestRunStateNextTransition: activeGraphProgress?.latestRunState?.nextTransition,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    };
  });
}

await mkdir(artifactDir, { recursive: true });
const proof = await runProof();
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...proof, proofPath }, null, 2));
