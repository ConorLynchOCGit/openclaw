#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceProofRef =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";
const artifactDir = path.join(root, ".artifacts/execution-platform/owner-readback-telemetry-proof");
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

function assertFalseRawFlags(record, pathLabel) {
  for (const key of [
    "rawPromptStored",
    "rawResponseStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawDbRowsStored",
    "secretsStored",
  ]) {
    if (key in record) {
      assert.equal(record[key], false, `${pathLabel}.${key} must be false`);
    }
  }
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
  const sourceProof = JSON.parse(await readFile(path.join(root, sourceProofRef), "utf8"));
  assert.equal(sourceProof.status, "succeeded", "source worker-smoke proof must be accepted");
  assert.equal(
    sourceProof.boundary,
    "after-resource-materialization",
    "source proof must be the accepted after-resource-materialization boundary",
  );

  const selectedNode = sourceProof.selectedBoundaryNode;
  const inspection = sourceProof.materializationInspection?.inspections?.[0];
  const workerSmoke = sourceProof.workerSmokeResult;
  assert.ok(selectedNode?.nodeId, "source proof must include selected boundary node");
  assert.ok(inspection?.payloadRefs?.length > 0, "source proof must include payload refs");
  assert.ok(workerSmoke?.changedFileRefs?.length > 0, "source proof must include changed files");
  assert.ok(workerSmoke?.validationRefs?.length > 0, "source proof must include validation refs");

  return await withDatabase(async (sql) => {
    const runtimeJobs = new RuntimeJobRepository(sql, {
      now: () => new Date("2026-05-25T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(sql, runtimeJobs);
    const workItemId = "owner-readback-telemetry-proof-item";
    const runtimeJobId = sourceProof.runtimeJobId;
    const graphId = sourceProof.graphId;
    const job = await runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId,
      payload: {
        workflowId: "agent_team.coding",
        objectiveSummary:
          "Prove owner-facing readback and telemetry from accepted worker-smoke evidence.",
      },
    });
    await workQueue.createWorkItem({
      workItemId,
      itemType: "execution_workflow",
      title: "Owner readback and telemetry proof",
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

    const schedulerProgress = {
      artifactKind: "agent_team_scheduler_progress",
      graphId,
      runtimeJobId,
      stage: "worker_smoke",
      status: "completed",
      nodeId: selectedNode.nodeId,
      activeNodeKind: selectedNode.nodeKind,
      workIntentId: "work-intent:source-spec-intake",
      workIntentTitle: "Source spec intake implementation task",
      executionIntent: selectedNode.executionIntent,
      evidenceMode: selectedNode.evidenceMode,
      roleId: "implementation_engineer",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      currentObjective: "Apply the accepted Product/Spec source-spec intake implementation task.",
      currentPhase: "worker.evidence_claim_recorded",
      schedulerPhase: "worker_execution_completed",
      schedulerToolId: "worker.evidence.claim_from_validation",
      schedulerToolInvocationRefs: workerSmoke.outputArtifactRefs.filter((ref) =>
        ref.startsWith("runtime-tool://"),
      ),
      selectedCapabilityId: "implementation.kimi.scoped_patch",
      executorKey: "kind:implementation",
      workerRef: "worker://non-codex/kimi-patch",
      nodeExecutionPacketRef: selectedNode.nodeExecutionPacketRef,
      nodeExecutionPacketStatus: selectedNode.nodeReadinessStatus,
      resourcePacketKind: "coding_resource_packet",
      resourcePacketRef: selectedNode.resourcePacketRef,
      nodeReadinessStateRef: selectedNode.nodeReadinessStateRef,
      nodeReadinessPhase: inspection.nodeReadinessPhase,
      nodeReadinessStatus: selectedNode.nodeReadinessStatus,
      nodeReadinessNextAllowedTransitions: ["validate", "claim_evidence", "review_pending_diff"],
      nodeReadinessFreshnessStatus: "fresh",
      nodeReadinessSnapshotStatus: "ready",
      nodeReadinessContextStatus: "accepted_with_limitations",
      nodeReadinessValidationStatus: "passed",
      nodeReadinessAuthorityStatus: "allowed",
      nodeReadinessEvidenceStatus: "present",
      workerInternalInputPacketRefs: [selectedNode.nodeExecutionPacketRef],
      changedFileRefs: workerSmoke.changedFileRefs,
      validationRefs: workerSmoke.validationRefs,
      evidenceProducedRefs: workerSmoke.outputArtifactRefs.filter(
        (ref) => ref.startsWith("worker-evidence://") || ref.startsWith("validation://"),
      ),
      evidenceClaimRefs: workerSmoke.outputArtifactRefs.filter((ref) =>
        ref.startsWith("evidence-claim://"),
      ),
      inputHandoffRefs: [selectedNode.implementationContextPacketRef],
      contextRefs: [selectedNode.implementationContextPacketRef],
      payloadRefs: inspection.payloadRefs,
      editTransactionStatus: "review_pending",
      reviewState: "pending_codex_review_before_persistence",
      validationState: "passed",
      modelCallSpanId: `${runtimeJobId}:${graphId}:worker-smoke`,
      modelCallPhase: "implementation_patch",
      modelCallSpanElapsedMs: 12_000,
      modelCallSpanTimeoutMs: 240_000,
      modelProviderDiagnostics: {
        usage: null,
        modelRef: "moonshotai/kimi-k2.6",
        providerKind: "openrouter",
        providerPath: "openrouter",
        usageUnavailableReason: "source_proof_did_not_record_provider_usage",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      parallelFrontier: {
        currentSuperstep: 7,
        selectedNodeIds: [selectedNode.nodeId],
        runningNodeIds: [],
        completedNodeIds: [selectedNode.nodeId],
        blockedNodeIds: [],
        failedNodeIds: [],
        needsReviewNodeIds: [],
        waitingForHumanNodeIds: [],
        branchResults: [
          {
            superstepId: "frontier:7",
            branchId: `frontier:7:branch:1:${selectedNode.nodeId}`,
            nodeId: selectedNode.nodeId,
            nodeKind: selectedNode.nodeKind,
            capabilityId: "implementation.kimi.scoped_patch",
            executorKey: "kind:implementation",
            executionIntent: selectedNode.executionIntent,
            evidenceMode: selectedNode.evidenceMode,
            targetCommitmentIds: ["source-specs-read-first"],
            status: "completed",
            evidenceRefs: workerSmoke.outputArtifactRefs.slice(0, 10),
            readinessStateRef: selectedNode.nodeReadinessStateRef,
            reasonCodes: ["worker_smoke_completed_with_validation_and_evidence"],
          },
        ],
      },
      schedulerFrontierState: {
        graphId,
        currentSuperstep: 7,
        executableReadyNodeIds: [],
        selectedExecutableNodeIds: [selectedNode.nodeId],
        blockedFrontierNodeIds: [],
        aggregateBlockedNodeIds: [],
        dependencyBlockedNodeIds: [],
        contextBlockedNodeIds: [],
        resourceBlockedNodeIds: [],
        lockConflictNodeIds: [],
        providerBudgetBlockedNodeIds: [],
        readinessRefs: [selectedNode.nodeReadinessStateRef],
        resourceRefs: [selectedNode.nodeExecutionPacketRef, selectedNode.resourcePacketRef],
        contextRefs: [selectedNode.implementationContextPacketRef],
        openCommitmentIds: [],
        nextLegalTransition: "review_pending_diff",
        reasonCodes: ["scheduler_canonical_frontier_state_evaluated"],
      },
      reasonCodes: sourceProof.schedulerResult.reasonCodes.slice(0, 60),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };

    await runtimeJobs.recordEvent({
      jobId: runtimeJobId,
      eventType: "agent_team.scheduler_progress",
      data: schedulerProgress,
    });

    const latestRunState = buildLatestRunState({
      runtimeJobId,
      workItemId,
      processRunning: true,
      runtimeJob: { state: "running" },
      graphId,
      latestProgress: schedulerProgress,
      latestReasonCodes: schedulerProgress.reasonCodes,
      latestArtifactRefs: workerSmoke.outputArtifactRefs.slice(0, 40),
      phaseWallClock: [{ phase: "implementation_patch", wallMs: 12_000 }],
      modelUsageByModel: [
        {
          modelRef: "moonshotai/kimi-k2.6",
          usageKind: "unavailable",
          unavailableReason: "source_proof_did_not_record_provider_usage",
        },
      ],
      modelUsageByPhase: [
        {
          phase: "implementation_patch",
          modelRef: "moonshotai/kimi-k2.6",
          usageKind: "unavailable",
        },
      ],
      missingUsageEventCount: 1,
      usageUnavailableReasons: [
        {
          reason: "source_proof_did_not_record_provider_usage",
          count: 1,
        },
      ],
      recommendedOperatorAction:
        "Review the pending diff and validation-backed evidence before persistence.",
      generatedAt: "2026-05-25T00:00:01.000Z",
    });
    await runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "execution_platform.latest_run_state",
      storageKind: "metadata",
      uri: `runtime-job://${runtimeJobId}/latest-run-state/current`,
      contentType: "application/json",
      metadata: latestRunState,
    });
    for (const [index, payloadRef] of inspection.payloadRefs.entries()) {
      await runtimeJobs.attachArtifact({
        jobId: runtimeJobId,
        artifactType: "execution_platform.node_execution_payload_manifest",
        storageKind: "metadata",
        uri: `runtime-job://${runtimeJobId}/payload-manifest/${index}`,
        contentType: "application/json",
        metadata: {
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        },
      });
    }

    const model = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId,
      now: new Date("2026-05-25T00:00:02.000Z"),
    });
    const runtimeJob = model.runtimeJobs.at(0);
    const progress = runtimeJob?.ownerProgressReadback.activeGraphProgress;
    const telemetry = progress?.ownerTelemetry;

    assert.ok(runtimeJob, "execution read model must include runtime job");
    assert.ok(progress, "owner progress readback must include active graph progress");
    assert.equal(telemetry?.state, "present");
    assert.equal(telemetry.workIntent.executionIntent, "source_edit");
    assert.deepEqual(telemetry.workIntent.evidenceMode, selectedNode.evidenceMode);
    assert.equal(telemetry.capability.executorKey, "kind:implementation");
    assert.equal(telemetry.runtime.runtimeJobId, runtimeJobId);
    assert.equal(telemetry.runtime.graphId, graphId);
    assert.equal(telemetry.runtime.nodeId, selectedNode.nodeId);
    assert.equal(telemetry.runtime.nodeKind, selectedNode.nodeKind);
    assert.equal(telemetry.runtime.currentToolId, "worker.evidence.claim_from_validation");
    assert.equal(telemetry.readiness.ref, selectedNode.nodeReadinessStateRef);
    assert.equal(telemetry.readiness.status, selectedNode.nodeReadinessStatus);
    assert.ok(telemetry.refs.payloadRefs.length >= 5);
    assert.deepEqual(telemetry.refs.changedFileRefs, workerSmoke.changedFileRefs);
    assert.deepEqual(telemetry.refs.validationRefs, workerSmoke.validationRefs);
    assert.ok(telemetry.refs.evidenceClaimRefs.length > 0);
    assert.equal(telemetry.telemetry.measuredTokenUsageAvailable, false);
    assert.equal(telemetry.telemetry.estimatedTokenUsageAvailable, false);
    assert.ok(
      telemetry.telemetry.usageUnavailableReasons.includes(
        "source_proof_did_not_record_provider_usage",
      ),
    );
    assertFalseRawFlags(telemetry, "ownerTelemetry");
    assertFalseRawFlags(progress.latestRunState, "latestRunState");
    assertFalseRawFlags(progress.workerInternal, "workerInternal");

    return {
      artifactKind: "owner_readback_telemetry_proof",
      schemaVersion: "execution-platform.owner-readback-telemetry-proof.v1",
      generatedAt: new Date().toISOString(),
      status: "passed",
      sourceProofRef,
      runtimeJobId,
      graphId,
      boundary: sourceProof.boundary,
      selectedNodeId: selectedNode.nodeId,
      ownerTelemetry: telemetry,
      readbackState: runtimeJob.ownerProgressReadback.state,
      validationRefs: [
        "pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts",
        "node scripts/execution-platform-run-owner-readback-telemetry-proof.mjs",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    };
  });
}

const proof = await runProof();
await mkdir(artifactDir, { recursive: true });
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      proofPath: ".artifacts/execution-platform/owner-readback-telemetry-proof/proof.json",
      runtimeJobId: proof.runtimeJobId,
      graphId: proof.graphId,
      selectedNodeId: proof.selectedNodeId,
      status: proof.status,
    },
    null,
    2,
  ),
);
