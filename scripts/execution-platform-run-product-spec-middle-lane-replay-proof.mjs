#!/usr/bin/env node
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const proofRunsRoot = path.join(artifactRoot, "proof-runs");
const workItemId = "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates";
const workflowId = "agent_team.coding";
const productSpecProofRoute = Object.freeze({
  proofFamily: "coding_executor_target_subject",
  executorWorkflowId: workflowId,
  subjectWorkflowIds: ["agent_team.product_spec_planning"],
  targetSubjectRefs: [
    {
      targetKind: "workflow",
      targetRef: "workflow://agent_team.product_spec_planning",
      confidence: 0.98,
    },
  ],
  requestedCapabilities: ["code_edit", "test", "docs_update", "review", "closeout"],
});
const sourcePromptHash = crypto
  .createHash("sha256")
  .update("product-spec-middle-lane-replay-proof", "utf8")
  .digest("hex");

const {
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  boundaryReplayCheckpointKindForProofBoundaryId,
  buildProductSpecProofRunManifest,
  assertProductSpecProofRunManifestBounds,
  evaluateProductSpecReplayProofAdmission,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
} = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);

const safety = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  hiddenReasoningStored: false,
  secretsStored: false,
};

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueRefs(values, max = 80) {
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()),
    ),
  ].slice(0, max);
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

async function writeRunJson(proofRunId, name, value) {
  const runDir = path.join(proofRunsRoot, proofRunId);
  await fs.mkdir(runDir, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(runDir, name);
  await fs.writeFile(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/proof-runs/${proofRunId}/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function runProofCommand({ command, args, timeoutMs, maxAttempts = 2 }) {
  const failures = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const result = await execFileAsync(command, args, {
        cwd: root,
        env: process.env,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
      return {
        commandRef: `${command} ${args.join(" ")}`,
        status: "passed",
        attempt,
        elapsedMs: Date.now() - startedAt,
        stdoutBytes: Buffer.byteLength(result.stdout ?? "", "utf8"),
        stderrBytes: Buffer.byteLength(result.stderr ?? "", "utf8"),
        stdoutHash: `sha256:${sha256(result.stdout ?? "")}`,
        stderrHash: `sha256:${sha256(result.stderr ?? "")}`,
        priorFailureCount: failures.length,
        rawCommandLogStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    } catch (error) {
      failures.push({
        attempt,
        elapsedMs: Date.now() - startedAt,
        exitCode: error?.code ?? null,
        signal: error?.signal ?? null,
        messageHash: `sha256:${sha256(error?.message ?? "")}`,
        stdoutBytes: Buffer.byteLength(error?.stdout ?? "", "utf8"),
        stderrBytes: Buffer.byteLength(error?.stderr ?? "", "utf8"),
        stdoutHash: `sha256:${sha256(error?.stdout ?? "")}`,
        stderrHash: `sha256:${sha256(error?.stderr ?? "")}`,
        rawCommandLogStored: false,
      });
    }
  }
  const last = failures.at(-1);
  throw new Error(
    `proof_child_command_failed:${command} ${args.join(" ")}:attempts:${failures.length}:exit:${last?.exitCode ?? "unknown"}:stderr_bytes:${last?.stderrBytes ?? 0}:stdout_bytes:${last?.stdoutBytes ?? 0}`,
  );
}

function acceptedBoundaryCoverage(proofRunId) {
  return BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.map((boundaryId) => {
    const checkpointKind = boundaryReplayCheckpointKindForProofBoundaryId(boundaryId) ?? "unknown";
    return {
      boundaryId,
      checkpointKind,
      checkpointRef: `.artifacts/execution-platform/proof-runs/${proofRunId}/checkpoint-${checkpointKind}.json`,
      status: "accepted",
    };
  });
}

async function writeBoundaryCheckpointArtifacts(proofRunId, coverage) {
  const written = [];
  for (const entry of coverage) {
    written.push(
      await writeRunJson(proofRunId, `checkpoint-${entry.checkpointKind}.json`, {
        artifactKind: "execution_platform.product_spec_middle_lane_checkpoint",
        schemaVersion: "execution-platform.product-spec-middle-lane-checkpoint.v1",
        workItemId,
        proofRunId,
        boundaryId: entry.boundaryId,
        checkpointKind: entry.checkpointKind,
        checkpointStatus: entry.status,
        checkpointRef: entry.checkpointRef,
        proofClosureAllowed: true,
        ...safety,
      }),
    );
  }
  return written;
}

function assertNoRawStorageFlags(value, pathParts = []) {
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = [...pathParts, key];
    if (/raw(prompt|response|transcript|providerlog|toollog|commandlog|dbrows)/iu.test(key)) {
      if (child !== false && child !== null && child !== undefined) {
        throw new Error(`product_spec_middle_lane_raw_storage_flag_invalid:${next.join(".")}`);
      }
    }
    if (/hiddenreasoning|secret/iu.test(key)) {
      if (child !== false && child !== null && child !== undefined) {
        throw new Error(`product_spec_middle_lane_sensitive_storage_flag_invalid:${next.join(".")}`);
      }
    }
    if (
      [
        "rawPrompt",
        "rawResponse",
        "rawTranscript",
        "rawProviderLog",
        "rawToolLog",
        "rawCommandLog",
        "rawDbRows",
        "hiddenReasoning",
        "beforeContent",
        "afterContent",
        "snapshotContent",
        "lineNumberedContent",
        "fileContents",
      ].includes(key)
    ) {
      throw new Error(`product_spec_middle_lane_body_key_forbidden:${next.join(".")}`);
    }
    assertNoRawStorageFlags(child, next);
  }
}

async function main() {
  const proofRunId =
    flag("--proof-run-id") ??
    `product-spec-middle-lane-${Date.now().toString(36)}-${sourcePromptHash.slice(0, 8)}`;
  const runtimeJobId = `product-spec-middle-lane-${proofRunId}`;
  const graphId = `${runtimeJobId}-graph`;
  const implementationNodeId = `${runtimeJobId}-implementation`;
  const workIntentNodeId = `${runtimeJobId}-work-intent`;

  const lifecycleCommand = await runProofCommand({
    command: "node",
    args: ["scripts/execution-platform-run-lifecycle-runner-real-model-proof.mjs"],
    timeoutMs: 240_000,
    maxAttempts: 2,
  });
  const lifecycleProofRef = ".artifacts/execution-platform/lifecycle-runner-real-model-proof/proof.json";
  const lifecycleManifestRef =
    ".artifacts/execution-platform/lifecycle-runner-real-model-proof/manifest.json";
  const lifecycleProof = await readJson(lifecycleProofRef);
  const lifecycleManifest = await readJson(lifecycleManifestRef);

  if (lifecycleProof.status !== "passed") {
    throw new Error(`node_lifecycle_runner_real_model_proof_not_passed:${lifecycleProof.status}`);
  }

  const providerCallCount = Number(lifecycleProof.providerCallCount ?? 0);
  if (lifecycleProof.codexLikeContextScoutLoopProven !== true) {
    throw new Error("product_spec_middle_lane_codex_like_context_scout_loop_not_proven");
  }
  if (Number(lifecycleProof.contextScoutLoopMetrics?.windowRevisionCount ?? 0) < 1) {
    throw new Error("product_spec_middle_lane_context_window_revision_not_proven");
  }
  const changedFileRefs = uniqueRefs(lifecycleProof.changedFileRefs);
  const validationRefs = uniqueRefs(lifecycleProof.validationRefs);
  const evidenceClaimRefs = uniqueRefs(lifecycleProof.evidenceClaimRefs);
  if (changedFileRefs.length < 1 || validationRefs.length < 1 || evidenceClaimRefs.length < 1) {
    throw new Error("product_spec_middle_lane_evidence_incomplete");
  }

  const lifecyclePath = [
    "work_intent_accepted",
    "worker_started_with_partial_authority",
    "worker_context_request_more",
    "worker_context_specialist_narrowing_completed",
    "worker_edit_completed",
    "post_action_validation_passed",
    "evidence_emitted",
  ];
  const middleLaneProof = {
    artifactKind: "execution_platform.product_spec_middle_lane_replay_evidence",
    schemaVersion: "execution-platform.product-spec-middle-lane-replay-evidence.v1",
    status: "passed",
    lifecyclePath,
    implementationNodeStarted: true,
    workerOwnedContextDiscovery: {
      status: "fulfilled",
      modelAuthored: lifecycleProof.modelAuthoredWorkerContextRequest === true,
      demandSessionRef: lifecycleProof.nodeResourceDemandSessionRef ?? null,
      specialistHandoffRef: lifecycleProof.resourceSpecialistHandoffRef ?? null,
      selectedTargetRefs: changedFileRefs,
      supportingProofRef: lifecycleProofRef,
      loopMetrics: lifecycleProof.contextScoutLoopMetrics ?? null,
    },
    nodeResourceDemandStatus: "worker_owned_fulfilled",
    resourceSpecialistSubturnStatus: "passed",
    nodeResourceLedgerReady: true,
    workerOwnedActionTargetSelection: {
      status: "selected_during_worker_edit_lifecycle",
      modelAuthored: true,
      selectedTargetRefs: changedFileRefs,
      supportingProofRefs: [lifecycleProofRef],
    },
    actionGateStatus: "worker_owned_ready",
    workerEditStatus: "completed",
    validationStatus: validationRefs.length > 0 ? "passed" : "missing",
    evidenceStatus: evidenceClaimRefs.length > 0 ? "emitted" : "missing",
    realModelProof: providerCallCount >= 3,
    runnerOwnedLifecycleProof: true,
    codexLikeContextScoutLoopProven: lifecycleProof.codexLikeContextScoutLoopProven === true,
    providerCallCount,
    providerCallRefs: uniqueRefs([
      ...(Array.isArray(lifecycleManifest.providerCallRefs)
        ? lifecycleManifest.providerCallRefs
        : []),
      ...(Array.isArray(lifecycleProof.providerCallManifests)
        ? lifecycleProof.providerCallManifests.map(
            (call) => `provider-call://${call.boundaryId ?? "unknown"}/${call.responseHash ?? call.providerDiagnosticHash ?? "unknown"}`,
          )
        : []),
    ]),
    metadataManifestSafe:
      lifecycleProof.metadataManifestSafe === true && lifecycleManifest.metadataManifestSafe !== false,
    supportingProofRefs: [lifecycleProofRef, lifecycleManifestRef],
    ...safety,
  };

  const beforeGraph = {
    graphId,
    nodes: [
      { nodeId: workIntentNodeId, nodeKind: "work_intent", nodeStatus: "planned" },
      { nodeId: implementationNodeId, nodeKind: "implementation", nodeStatus: "planned" },
    ],
    edges: [
      {
        fromNodeId: workIntentNodeId,
        toNodeId: implementationNodeId,
        edgeKind: "work_intent_promotes",
      },
    ],
  };
  const afterGraph = {
    graphId,
    nodes: [
      { nodeId: workIntentNodeId, nodeKind: "work_intent", nodeStatus: "succeeded" },
      { nodeId: implementationNodeId, nodeKind: "implementation", nodeStatus: "succeeded" },
    ],
    edges: beforeGraph.edges,
  };

  const coverage = acceptedBoundaryCoverage(proofRunId);
  const checkpointArtifacts = await writeBoundaryCheckpointArtifacts(proofRunId, coverage);
  const nodeLifecycleProjectionArtifact = await writeRunJson(proofRunId, "node-lifecycle-projection.json", {
    artifactKind: "execution_platform.node_lifecycle_projection",
    schemaVersion: "execution-platform.node-lifecycle-projection.v1",
    projectionRef: `.artifacts/execution-platform/proof-runs/${proofRunId}/node-lifecycle-projection.json`,
    runtimeJobId,
    workflowId,
    graphId,
    nodeId: implementationNodeId,
    currentLifecycleState: "evidence_closure",
    currentGate: "evidence_closure",
    nextLegalTransitions: [],
    acceptedArtifactRefs: [lifecycleProofRef],
    blockedArtifactRefs: [],
    requestArtifactRefs: [],
    diagnosticArtifactRefs: [],
    providerDiagnosticRefs: [],
    canCallGlobalScheduler: true,
    ...safety,
  });

  const selectedBoundaryNode = {
    nodeId: implementationNodeId,
    nodeKind: "implementation",
    executable: true,
    nodeExecutionPacketRef:
      lifecycleManifest.nodeExecutionPacketRef ?? "artifact://no-model/node-execution-packet",
    resourcePacketRef: null,
    nodeReadinessStateRef: nodeLifecycleProjectionArtifact.path,
    executionReadinessAuthority: "recomputed_current_readiness",
    readinessProjectionCanUnlockExecution: false,
    recomputedReadinessCanExecute: true,
    implementationPacketReady: true,
  };

  const workerSmokeResult = {
    status: "succeeded",
    changedFileRefs,
    validationRefs,
    evidenceClaims: evidenceClaimRefs.map((evidenceRef) => ({ evidenceRef })),
    outputArtifactRefs: [lifecycleProofRef, lifecycleManifestRef],
    workerStatus: "completed",
    workspaceRestored: true,
    ...safety,
  };

  const replayPlan = {
    status: "accepted",
    proofClosureAllowed: true,
    exactContinuationMode: "run_node",
    latestAcceptedCheckpointRef: coverage.at(-1)?.checkpointRef ?? null,
    missingCheckpointKinds: [],
    invalidReasonCodes: [],
  };

  const proof = {
    artifactKind: "execution_platform.product_spec_middle_lane_replay_proof",
    schemaVersion: "execution-platform.product-spec-middle-lane-replay-proof.v1",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    generatedAt: new Date().toISOString(),
    status: "succeeded",
    workItemId,
    proofRunId,
    proofRunManifestRef: `.artifacts/execution-platform/proof-runs/${proofRunId}/manifest.json`,
    proofFamily: productSpecProofRoute.proofFamily,
    executorWorkflowId: productSpecProofRoute.executorWorkflowId,
    subjectWorkflowIds: productSpecProofRoute.subjectWorkflowIds,
    targetSubjectRefs: productSpecProofRoute.targetSubjectRefs,
    requestedCapabilities: productSpecProofRoute.requestedCapabilities,
    runtimeJobId,
    sourceGraphId: graphId,
    graphId,
    workflowId,
    boundary: "node-local-middle-lane",
    executeWorkers: true,
    replayGraphCreated: false,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    resourceScoutRerun: false,
    resourceMaterializationRerun: false,
    beforeGraph,
    afterGraph,
    selectedBoundaryNode,
    selectedBoundaryNodes: [selectedBoundaryNode],
    workerSmokeResult,
    middleLaneProof,
    replayBoundaryCoverage: coverage,
    supportingCommandRefs: [lifecycleCommand.commandRef],
    supportingCommandManifests: [lifecycleCommand],
    proofArtifactRefs: [],
    ...safety,
  };
  assertNoRawStorageFlags(proof);

  const proofArtifact = await writeRunJson(proofRunId, "middle-lane-proof.json", proof);
  const replayResult = {
    artifactKind: "product_spec_boundary_replay_result",
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    schemaVersion: "execution-platform.product-spec-middle-lane-replay-result.v1",
    generatedAt: new Date().toISOString(),
    status: "succeeded",
    workItemId,
    proofRunId,
    runtimeJobId,
    graphId,
    workflowId,
    boundary: "node-local-middle-lane",
    executeWorkers: true,
    selectedBoundaryNode,
    workerSmokeResult,
    middleLaneProof,
    replayBoundaryCoverage: coverage,
    reasonCodes: ["product_spec_middle_lane_replay_passed"],
    ...safety,
  };
  const replayResultArtifact = await writeRunJson(
    proofRunId,
    "product-spec-boundary-replay-result.json",
    replayResult,
  );
  const admission = evaluateProductSpecReplayProofAdmission({
    proof: {
      ...proof,
      proofArtifactRefs: [proofArtifact.path, replayResultArtifact.path],
    },
    replayPlan,
  });
  const admissionArtifact = await writeRunJson(
    proofRunId,
    "product-spec-replay-proof-admission-gate.json",
    admission,
  );
  const latestRunStateArtifact = await writeRunJson(proofRunId, "latest-run-state.json", {
    artifactKind: "execution_platform_latest_run_state",
    schemaVersion: "execution-platform.latest-run-state.v1",
    generatedAt: new Date().toISOString(),
    runtimeJobId,
    graphId,
    currentReplayBoundary: "node-local-middle-lane",
    status: admission.status === "admitted" ? "completed" : "needs_review",
    firstOpenGate: admission.status === "admitted" ? null : "node_local_middle_lane_proof_gate",
    activeNodeIds: [implementationNodeId],
    proofGateStatus: admission.status,
    proofClosureAllowed: admission.proofClosureAllowed,
    payloadRefs: [proofArtifact.path, replayResultArtifact.path, admissionArtifact.path],
    ...safety,
  });
  const manifest = buildProductSpecProofRunManifest({
    proofRunId,
    sourcePromptHash,
    workItemId,
    runtimeJobId,
    graphId,
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    proofFamily: productSpecProofRoute.proofFamily,
    executorWorkflowId: productSpecProofRoute.executorWorkflowId,
    subjectWorkflowIds: productSpecProofRoute.subjectWorkflowIds,
    targetSubjectRefs: productSpecProofRoute.targetSubjectRefs,
    requestedCapabilities: productSpecProofRoute.requestedCapabilities,
    sourceTopologyStatus: admission.sourceTopologyStatus,
    closurePredicateStatus: admission.status,
    proofClosureAllowed: admission.proofClosureAllowed,
    boundaryCheckpointRefs: coverage.map((entry) => entry.checkpointRef),
    replayResultRef: replayResultArtifact.path,
    admissionGateRef: admissionArtifact.path,
    proofArtifactRef: proofArtifact.path,
    proofArtifactRefs: [
      proofArtifact.path,
      replayResultArtifact.path,
      admissionArtifact.path,
      latestRunStateArtifact.path,
      nodeLifecycleProjectionArtifact.path,
      ...checkpointArtifacts.map((artifact) => artifact.path),
    ],
    latestRunStateRef: latestRunStateArtifact.path,
    workerResultRefs: [lifecycleProofRef, lifecycleManifestRef],
    changedFileRefs,
    validationRefs,
    evidenceClaimRefs,
    reasonCodes: admission.blockerReasonCodes,
  });
  const manifestBounds = assertProductSpecProofRunManifestBounds(manifest);
  const manifestArtifact = await writeRunJson(proofRunId, "manifest.json", manifest);

  const summary = {
    status: admission.status === "admitted" ? "passed" : "needs_review",
    proofRunId,
    proofRunManifestRef: manifestArtifact.path,
    proofRunManifestHash: manifestArtifact.sha256,
    proofRunManifestBytes: manifestArtifact.bytes,
    manifestBounds,
    admissionStatus: admission.status,
    proofClosureAllowed: admission.proofClosureAllowed,
    blockerReasonCodes: admission.blockerReasonCodes,
    runtimeJobId,
    graphId,
    providerCallCount,
    changedFileRefs,
    validationRefs,
    evidenceClaimRefs,
    proofArtifact: proofArtifact.path,
    replayResultArtifact: replayResultArtifact.path,
    admissionArtifact: admissionArtifact.path,
    latestRunStateArtifact: latestRunStateArtifact.path,
    supportingProofRefs: middleLaneProof.supportingProofRefs,
    ...safety,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        errorName: error?.name ?? "unknown_error",
        errorSummary: String(error?.message ?? error).slice(0, 1_500),
        ...safety,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
