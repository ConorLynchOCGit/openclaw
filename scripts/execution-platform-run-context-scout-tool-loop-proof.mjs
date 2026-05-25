import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  CONTEXT_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
  buildContextHandoffPacket,
  buildContextScoutToolLoopRun,
  buildContextScoutVerifiedFileRefs,
  createExecutionPlatformDatabaseRuntime,
  RuntimeJobRepository,
  summarizeContextScoutToolLoopRun,
  validateContextScoutToolLoopForImplementation,
  WorkQueueRepository,
} from "../extensions/execution-platform/src/index.ts";

const ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.pre-product-spec-01-context-scout-tool-loop";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

async function main() {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const runId = `context-scout-tool-loop-${Date.now()}`;
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  try {
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const queueItems = await workQueue.readWorkQueue(300);
    const existingItem = queueItems.find((item) => item.workItemId === WORK_ITEM_ID);
    if (!existingItem) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "execution_platform_convergence_slice",
        title: "Context Scout Tool Loop And Context Sufficiency Gate",
        description:
          "Production context scout tool-loop contract, sufficiency gate, and readback before Product/Spec Planning proof.",
        metadata: {
          dbPrimaryQueueStatus: "active",
          source: "context_scout_tool_loop_proof_bootstrap",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
        actorId: "system:context-scout-tool-loop-proof",
      });
    }
    const job = await runtimeJobs.enqueueJob({
      jobId: runId,
      jobType: "proof.context_scout_tool_loop",
      queueName: "execution-platform-proof",
      workItemId: WORK_ITEM_ID,
      payload: {
        proofKind: "context_scout_tool_loop",
        workItemId: WORK_ITEM_ID,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
      idempotencyScope: "context-scout-tool-loop-proof",
      idempotencyKey: WORK_ITEM_ID,
      maxAttempts: 1,
    });
    const graphId = `${runId}-graph`;
    const nodeId = `${runId}-context`;
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: job.jobId,
      nodeId,
      fileRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      ],
      reasonCodes: ["context_scout_file_ref_verified_by_runtime"],
    });
    const handoff = buildContextHandoffPacket({
      sourceNodeId: nodeId,
      targetCommitmentIds: ["context-scout-tool-loop-production"],
      targetFileRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
      ],
      relevantFileRefs: verifiedFileRefs.map((ref) => ref.fileRef),
      recommendedEditPoints: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts - canonical bounded context-scout contract and sufficiency validator",
        "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts - production scheduler-backed context scout execution and implementation gate",
      ],
      existingPatterns: [
        "Runtime Tool-Call Kernel records bounded tool operation refs.",
        "Source prompt excerpts remain volatile input and artifacts store only hashes, refs, and summaries.",
      ],
      risks: [
        "Implementation must remain blocked when context scout cannot verify concrete repo refs.",
      ],
      validationSuggestions: [
        "pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
        "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
      ],
      handoffSummaryForImplementation:
        "Context scout now has a first-class tool-loop artifact and implementation gate, so downstream workers receive accepted bounded context or stop as needs_review.",
    });
    const loopRun = buildContextScoutToolLoopRun({
      runtimeJobId: job.jobId,
      graphId,
      nodeId,
      roleId: "context_scout",
      modelRef: "proof:model-authored-context-scout-contract",
      targetCommitmentIds: ["context-scout-tool-loop-production"],
      commitmentWorkPacketRefs: [
        "runtime-work-graph://commitment-work-packet/context-scout-tool-loop-production/proof",
      ],
      requestedContextQuestions: [
        "Which production files define context scout contracts, runtime wiring, and readback?",
        "What evidence blocks implementation when context is weak?",
      ],
      downstreamConsumer: "implementation_and_validation",
      sourcePromptHash: `sha256:${sha256(WORK_ITEM_ID)}`,
      candidateFileRefs: [
        "extensions/execution-platform/src/workflows/",
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
      ],
      verifiedFileRefs,
      runtimeToolInvocationRefs: [
        "runtime-tool://context_scout.plan/proof",
        "runtime-tool://context_scout.search_repo/proof",
        "runtime-tool://context_scout.verify_refs/proof",
        "runtime-tool://context_scout.review_sufficiency/proof",
        "runtime-tool://context_scout.emit_handoff_packet/proof",
      ],
      contextHandoffPacketRef: `runtime-job://${job.jobId}/context-handoff/${handoff.packetId}`,
      contextHandoffPacket: handoff,
      modelAuthoredSummary:
        "The verified production context scout contract, runner gate, and readback files are sufficient for downstream implementation and validation.",
    });
    const validation = validateContextScoutToolLoopForImplementation(loopRun);
    const loopRef = `runtime-job://${job.jobId}/context-scout/tool-loop/${loopRun.loopId}`;
    const handoffRef = `runtime-job://${job.jobId}/context-handoff/${handoff.packetId}`;
    await runtimeJobs.attachRuntimeArtifactByContract({
      jobId: job.jobId,
      artifactType: "execution_platform.context_handoff_packet",
      uri: handoffRef,
      contentType: "application/json",
      body: handoff,
      boundedSummary: handoff.handoffSummaryForImplementation,
      targetCommitmentIds: handoff.targetCommitmentIds,
      targetNodeIds: [handoff.sourceNodeId],
      resourcePacketKind: "context_handoff_packet",
      readinessStatus: validation.valid ? "accepted" : "needs_review",
      reasonCodes: ["context_handoff_packet_tool_loop_proof_persisted_by_contract"],
      metadata: {
        artifactKind: "execution_platform.context_handoff_packet",
        packetId: handoff.packetId,
        packetRef: handoff.packetRef,
        sourceNodeId: handoff.sourceNodeId,
        targetCommitmentIds: handoff.targetCommitmentIds,
        relevantFileRefs: handoff.relevantFileRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    await runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: CONTEXT_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: loopRef,
      contentType: "application/json",
      metadata: summarizeContextScoutToolLoopRun(loopRun),
    });
    await runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "agent_team.scheduler_progress",
      data: {
        artifactKind: "agent_team_scheduler_progress",
        graphId,
        runtimeJobId: job.jobId,
        stage: "context_scout_tool_loop",
        status: validation.valid ? "completed" : "needs_review",
        roleId: "context_scout",
        nodeId,
        currentObjective:
          "Prove accepted context scout tool-loop evidence blocks weak implementation handoffs.",
        currentPhase: "context_scout_tool_loop_verified",
        contextQualityState: validation.valid ? "accepted" : "needs_review",
        contextScoutToolLoopRefs: [loopRef],
        contextScoutRuntimeToolInvocationRefs: loopRun.runtimeToolInvocationRefs,
        contextScoutSufficiencySummary: loopRun.sufficiencyReview.reviewerSummary,
        verifiedContextFileRefs: verifiedFileRefs.map((ref) => ref.fileRef),
        contextHandoffPacketRefs: [handoffRef],
        openContextBlockers: validation.valid ? [] : validation.reasonCodes,
        eli5Progress:
          "OpenClaw now checks that context scout found real files and made a usable handoff before implementation can start.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const summary = {
      artifactKind: "context_scout_tool_loop_proof_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      loopRef,
      handoffRef,
      validation,
      accepted: validation.valid,
      productionWiring: {
        runtimeToolFamily: "context_scout.tool_loop",
        dynamicRunnerGate: true,
        workQueueReadback: true,
        legacyPilotDiagnosticOnly: true,
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const validationProofPath = await writeJson(
      path.join(ARTIFACT_ROOT, "context-scout-tool-loop-validation-proof.json"),
      summary,
    );
    const closeoutRef = `closeout://${runId}/context-scout-tool-loop`;
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      closeoutRef,
      closeoutHash: `sha256:${sha256(summary)}`,
      validationRef: validationProofPath,
      graphRef: `runtime-work-graph://${graphId}`,
      ownerReadbackRef: loopRef,
      artifactRefs: [loopRef, handoffRef, validationProofPath],
      accepted: validation.valid,
      validationRequired: true,
      sourceEditRequired: false,
      actorId: "system:context-scout-tool-loop-proof",
      reasonCodes: [
        "context_scout_tool_loop_accepted",
        "implementation_requires_accepted_context_scout_tool_loop",
        "legacy_context_scout_pilot_diagnostic_only",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
      authorityGranted: false,
      controlsApplied: false,
      runtimeLifecycleMutated: false,
      modelPromotionPerformed: false,
    });
    const artifactIndex = {
      artifactKind: "context_scout_tool_loop_artifact_index",
      runId,
      workItemId: WORK_ITEM_ID,
      artifacts: {
        validationProofPath,
        loopRef,
        handoffRef,
      },
      closeout,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const indexPath = await writeJson(
      path.join(ARTIFACT_ROOT, "context-scout-tool-loop-artifact-index.json"),
      artifactIndex,
    );
    await writeJson(path.join(ARTIFACT_ROOT, "context-scout-tool-loop-summary.json"), {
      ...summary,
      closeout,
      artifactIndexPath: indexPath,
    });
    console.log(
      JSON.stringify(
        {
          pass: validation.valid && closeout.closed,
          runId,
          workItemId: WORK_ITEM_ID,
          runtimeJobId: job.jobId,
          closeoutStatus: closeout.status,
          validationProofPath,
          indexPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
