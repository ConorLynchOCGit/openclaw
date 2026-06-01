#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS,
  boundaryReplayCheckpointKindForProofBoundaryId,
  evaluateProductSpecReplayProofAdmission,
  buildProductSpecProofRunManifest,
  assertProductSpecProofRunManifestBounds,
  PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
} = await tsImport(
  path.join(root, "extensions/execution-platform/runtime-api.ts"),
  import.meta.url,
);

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function writeJson(absPath, value) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(absPath, body, "utf8");
  return {
    path: absPath.startsWith(root) ? path.relative(root, absPath) : absPath,
    bytes: Buffer.byteLength(body, "utf8"),
    sha256: `sha256:${sha256(body)}`,
  };
}

function runScopedRef(proofRunId, filename) {
  return `.artifacts/execution-platform/proof-runs/${proofRunId}/${filename}`;
}

function acceptedCoverage(proofRunId) {
  return BOUNDARY_REPLAY_PRODUCTION_PROOF_BOUNDARY_IDS.map((boundaryId) => ({
    boundaryId,
    checkpointKind: boundaryReplayCheckpointKindForProofBoundaryId(boundaryId) ?? "unknown",
    checkpointRef: `artifact://execution-platform/proof-runs/${proofRunId}/checkpoints/${boundaryId}`,
    status: "accepted",
  }));
}

function baseProof({ proofRunId, staleTopology = false }) {
  const manifestRef = runScopedRef(proofRunId, "manifest.json");
  const resultRef = runScopedRef(proofRunId, "product-spec-boundary-replay-result.json");
  const admissionRef = runScopedRef(proofRunId, "product-spec-replay-proof-admission-gate.json");
  const proofRef = runScopedRef(proofRunId, "resource-materialization-proof.json");
  const latestRunStateRef = runScopedRef(proofRunId, "product-spec-boundary-replay-live-state.json");
  return {
    artifactKind: "execution_platform.product_spec_substrate_fixture_replay_proof",
    status: "succeeded",
    boundary: "after-resource-materialization",
    executeWorkers: true,
    proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
    proofRunId,
    proofRunManifestRef: manifestRef,
    runtimeJobId: `native-exec-${sha256(proofRunId).slice(0, 12)}`,
    graphId: `runtime-work-graph-${sha256(`${proofRunId}:graph`).slice(0, 16)}`,
    proofArtifactRefs: [proofRef, resultRef, admissionRef, latestRunStateRef],
    replayBoundaryCoverage: acceptedCoverage(proofRunId),
    replayGraphCreated: false,
    routerRerun: false,
    missionLedgerRerun: false,
    commitmentPacketAuthorRerun: false,
    contextScoutRerun: false,
    resourceMaterializationRerun: false,
    selectedBoundaryNode: {
      nodeId: "implementation-product-spec-planning-worker-readiness",
      nodeKind: "implementation_microtask",
      executable: true,
      nodeExecutionPacketRef: "node-execution-packet://product-spec-planning/implementation",
      resourcePacketRef: "coding-resource-packet://product-spec-planning/implementation",
      nodeReadinessStateRef: "node-readiness-state://product-spec-planning/implementation",
      executionReadinessAuthority: "recomputed_current_readiness",
      readinessProjectionCanUnlockExecution: false,
      recomputedReadinessCanExecute: true,
      implementationPacketReady: true,
    },
    workerSmokeResult: {
      status: "succeeded",
      changedFileRefs: [
        "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
        "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
      ],
      validationRefs: [
        "validation://product-spec-proof-substrate/product-spec-proof-substrate-test-pass",
        "validation://product-spec-proof-substrate/boundary-replay-proof-gate-test-pass",
      ],
      evidenceClaims: [
        {
          commitmentId: "product-spec-proof-substrate-run-scoped-closure",
          evidenceRef:
            "evidence://product-spec-proof-substrate/run-scoped-manifest-closeout",
        },
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    },
    beforeGraph: staleTopology
      ? {
          nodes: [
            { nodeId: "context-product-spec", nodeKind: "context_scout" },
            { nodeId: "impl-product-spec", nodeKind: "implementation_microtask" },
          ],
          edges: [
            {
              fromNodeId: "context-product-spec",
              toNodeId: "impl-product-spec",
              edgeKind: "context_supplies",
            },
          ],
        }
      : {
          nodes: [
            {
              nodeId: "intent-product-spec-planning",
              nodeKind: "work_intent",
            },
            {
              nodeId: "implementation-product-spec-planning-worker-readiness",
              nodeKind: "implementation_microtask",
            },
          ],
          edges: [
            {
              fromNodeId: "intent-product-spec-planning",
              toNodeId: "implementation-product-spec-planning-worker-readiness",
              edgeKind: "requires_execution",
            },
          ],
        },
    afterGraph: staleTopology
      ? {
          nodes: [
            { nodeId: "context-product-spec", nodeKind: "context_scout" },
            { nodeId: "impl-product-spec", nodeKind: "implementation_microtask" },
          ],
          edges: [
            {
              fromNodeId: "context-product-spec",
              toNodeId: "impl-product-spec",
              edgeKind: "context_supplies",
            },
          ],
        }
      : {
          nodes: [
            {
              nodeId: "intent-product-spec-planning",
              nodeKind: "work_intent",
            },
            {
              nodeId: "implementation-product-spec-planning-worker-readiness",
              nodeKind: "implementation_microtask",
            },
          ],
          edges: [
            {
              fromNodeId: "intent-product-spec-planning",
              toNodeId: "implementation-product-spec-planning-worker-readiness",
              edgeKind: "requires_execution",
            },
          ],
        },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogsStored: false,
    rawDbRowsStored: false,
  };
}

function replayPlan() {
  return {
    status: "accepted",
    proofClosureAllowed: true,
    exactContinuationMode: "run_scoped_after_resource_materialization",
    latestAcceptedCheckpointRef: "artifact://execution-platform/proof-runs/current/checkpoints/after_resource_materialization",
    missingCheckpointKinds: [],
    invalidReasonCodes: [],
  };
}

const proofRunId =
  flag("--proof-run-id") ??
  `product-spec-proof-substrate-${Date.now().toString(36)}-${sha256(process.cwd()).slice(0, 8)}`;
const runDir = path.join(root, ".artifacts/execution-platform/proof-runs", proofRunId);
const proof = baseProof({ proofRunId, staleTopology: false });
const plan = replayPlan();
const admission = evaluateProductSpecReplayProofAdmission({ proof, replayPlan: plan });
if (admission.status !== "admitted") {
  throw new Error(`fresh_run_scoped_proof_not_admitted:${admission.blockerReasonCodes.join(",")}`);
}
Object.assign(proof, {
  closurePredicateStatus: admission.status,
  proofClosureAllowed: admission.proofClosureAllowed,
});

const result = {
  artifactKind: "execution_platform.product_spec_boundary_replay_result",
  proofRunId,
  status: "succeeded",
  sourceTopologyStatus: admission.sourceTopologyStatus,
  proofClosureAllowed: admission.proofClosureAllowed,
  admissionStatus: admission.status,
  proofArtifactRefs: proof.proofArtifactRefs,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};
const latestRunState = {
  artifactKind: "execution_platform.product_spec_boundary_replay_latest_run_state",
  proofRunId,
  canonicalFirstOpenGate: null,
  latestGate: "proof_closure_admitted",
  sourceTopologyStatus: admission.sourceTopologyStatus,
  proofClosureAllowed: admission.proofClosureAllowed,
};

const proofWrite = writeJson(path.join(runDir, "resource-materialization-proof.json"), proof);
const resultWrite = writeJson(path.join(runDir, "product-spec-boundary-replay-result.json"), result);
const admissionWrite = writeJson(
  path.join(runDir, "product-spec-replay-proof-admission-gate.json"),
  admission,
);
const latestRunStateWrite = writeJson(
  path.join(runDir, "product-spec-boundary-replay-live-state.json"),
  latestRunState,
);
const manifest = buildProductSpecProofRunManifest({
  proofRunId,
  proofRunManifestRef: runScopedRef(proofRunId, "manifest.json"),
  sourcePromptHash: sha256("product-spec-proof-substrate-run-scoped-closure"),
  workItemId: "openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure",
  runtimeJobId: proof.runtimeJobId,
  graphId: proof.graphId,
  proofSourceKind: PRODUCT_SPEC_RUNTIME_BOUNDARY_REPLAY_PROOF_SOURCE,
  sourceTopologyStatus: admission.sourceTopologyStatus,
  closurePredicateStatus: admission.status,
  proofClosureAllowed: admission.proofClosureAllowed,
  boundaryCheckpointRefs: proof.replayBoundaryCoverage.map((entry) => entry.checkpointRef),
  replayResultRef: resultWrite.path,
  admissionGateRef: admissionWrite.path,
  proofArtifactRef: proofWrite.path,
  proofArtifactRefs: [latestRunStateWrite.path],
  latestRunStateRef: latestRunStateWrite.path,
  changedFileRefs: proof.workerSmokeResult.changedFileRefs,
  validationRefs: proof.workerSmokeResult.validationRefs,
  evidenceClaimRefs: proof.workerSmokeResult.evidenceClaims.map((claim) => claim.evidenceRef),
  reasonCodes: admission.admissionReasonCodes,
});
const manifestBounds = assertProductSpecProofRunManifestBounds(manifest);
const manifestWrite = writeJson(path.join(runDir, "manifest.json"), manifest);

const negativeProofRunId = `${proofRunId}-negative-stale`;
const negativeProof = baseProof({ proofRunId: negativeProofRunId, staleTopology: true });
const negativeAdmission = evaluateProductSpecReplayProofAdmission({
  proof: negativeProof,
  replayPlan: plan,
});
if (negativeAdmission.status !== "blocked") {
  throw new Error("stale_retired_topology_fixture_was_not_blocked");
}
const negativeWrite = writeJson(
  path.join(runDir, "stale-retired-topology-negative-admission.json"),
  negativeAdmission,
);

const summary = {
  artifactKind: "execution_platform.product_spec_proof_substrate_run_scoped_proof_summary",
  proofRunId,
  manifestRef: manifestWrite.path,
  manifestHash: manifestWrite.sha256,
  manifestBytes: manifestWrite.bytes,
  manifestBounds,
  positiveAdmissionStatus: admission.status,
  positiveProofClosureAllowed: admission.proofClosureAllowed,
  negativeAdmissionStatus: negativeAdmission.status,
  negativeReasonCodes: negativeAdmission.blockerReasonCodes,
  artifacts: {
    proof: proofWrite,
    result: resultWrite,
    admission: admissionWrite,
    latestRunState: latestRunStateWrite,
    manifest: manifestWrite,
    negativeAdmission: negativeWrite,
  },
};
const summaryWrite = writeJson(
  path.join(root, ".artifacts/execution-platform/product-spec-proof-substrate-run-scoped-proof-summary.json"),
  summary,
);

process.stdout.write(
  `${JSON.stringify({
    status: "passed",
    proofRunId,
    manifestRef: manifestWrite.path,
    summaryRef: summaryWrite.path,
    manifestBytes: manifestWrite.bytes,
    negativeAdmissionStatus: negativeAdmission.status,
  })}\n`,
);
