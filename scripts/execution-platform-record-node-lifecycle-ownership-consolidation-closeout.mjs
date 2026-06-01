#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.node-lifecycle-transition-ownership-consolidation";
const nextItemId = "openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor";

const proofRunId = "item-160-middle-lane-real-model-final-clean";
const proofManifestPath = `.artifacts/execution-platform/proof-runs/${proofRunId}/manifest.json`;
const proofAdmissionPath =
  `.artifacts/execution-platform/proof-runs/${proofRunId}/product-spec-replay-proof-admission-gate.json`;
const proofReplayResultPath =
  `.artifacts/execution-platform/proof-runs/${proofRunId}/product-spec-boundary-replay-result.json`;
const runnerProofPath = ".artifacts/execution-platform/lifecycle-runner-real-model-proof/proof.json";
const runnerManifestPath =
  ".artifacts/execution-platform/lifecycle-runner-real-model-proof/manifest.json";
const inventoryManifestPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-final-gate/manifest.json";
const inventoryReportPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-final-gate/full-report.json";

const changedFileRefs = [
  "scripts/execution-platform-run-lifecycle-runner-real-model-proof.mjs",
  "scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs",
  "scripts/execution-platform-record-node-lifecycle-ownership-consolidation-closeout.mjs",
  "extensions/execution-platform/src/workflows/resource-selection.ts",
  "extensions/execution-platform/src/workflows/resource-selection.test.ts",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function artifactHash(relativePath) {
  return `sha256:${sha256(fs.readFileSync(path.join(root, relativePath), "utf8"))}`;
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  fs.writeFileSync(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

function assertNoRawStorage(value, label) {
  for (const flag of [
    "rawPromptStored",
    "rawResponseStored",
    "rawTranscriptStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawCommandLogStored",
    "rawDbRowsStored",
    "hiddenReasoningStored",
    "secretsStored",
  ]) {
    if (flag in value && value[flag] !== false) {
      throw new Error(`${label}_${flag}_not_false`);
    }
  }
}

async function main() {
  const proofManifest = readJson(proofManifestPath);
  const proofAdmission = readJson(proofAdmissionPath);
  const proofReplayResult = readJson(proofReplayResultPath);
  const runnerProof = readJson(runnerProofPath);
  const runnerManifest = readJson(runnerManifestPath);
  const inventoryManifest = readJson(inventoryManifestPath);
  const inventoryReport = readJson(inventoryReportPath);

  if (
    proofManifest.closurePredicateStatus !== "admitted" ||
    proofManifest.proofClosureAllowed !== true
  ) {
    throw new Error("node_lifecycle_middle_lane_manifest_not_passed");
  }
  if (proofReplayResult.status !== "succeeded" || proofReplayResult.middleLaneProof?.status !== "passed") {
    throw new Error("node_lifecycle_middle_lane_replay_result_not_passed");
  }
  if (proofAdmission.status !== "admitted" || proofAdmission.proofClosureAllowed !== true) {
    throw new Error("node_lifecycle_middle_lane_not_admitted_for_closure");
  }
  if ((proofReplayResult.middleLaneProof?.providerCallCount ?? 0) < 3) {
    throw new Error("node_lifecycle_middle_lane_provider_call_count_too_low");
  }
  if ((proofManifest.manifestJsonByteCount ?? 0) > 16 * 1024) {
    throw new Error("node_lifecycle_middle_lane_manifest_overflow");
  }
  if (proofAdmission.status !== "admitted" || proofAdmission.proofClosureAllowed !== true) {
    throw new Error("node_lifecycle_admission_artifact_not_admitted");
  }
  if (runnerProof.status !== "passed" || runnerProof.providerCallCount < 3) {
    throw new Error("node_lifecycle_runner_real_model_proof_not_passed");
  }
  if (runnerManifest.status !== "passed" || runnerManifest.providerCallCount < 3) {
    throw new Error("node_lifecycle_runner_manifest_not_passed");
  }
  if (inventoryManifest.status !== "passed" || inventoryReport.status !== "passed") {
    throw new Error("node_lifecycle_residue_inventory_not_passed");
  }
  if (inventoryReport.hardFailureCount !== 0 || inventoryReport.blockedSurvivorRefCount !== 0) {
    throw new Error("node_lifecycle_residue_inventory_has_blockers");
  }
  for (const [label, value] of Object.entries({
    proofManifest,
    proofAdmission,
    proofReplayResult,
    runnerProof,
    runnerManifest,
    inventoryManifest,
    inventoryReport,
  })) {
    assertNoRawStorage(value, label);
  }

  const closeout = writeArtifact("node-lifecycle-transition-ownership-consolidation-closeout.json", {
    artifactKind: "execution_platform.node_lifecycle_transition_ownership_consolidation_closeout",
    schemaVersion:
      "execution-platform.node-lifecycle-transition-ownership-consolidation-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Closed the node lifecycle transition ownership consolidation by replacing diagnostic lifecycle residue proof closure with a NodeLifecycleTransitionRunner-owned real-model middle-lane proof. Domain resource selection now accepts small-verb toolId/input or runtime-wrapped semantic bodies, while runtime wraps and validates the canonical resource.selection.propose contract.",
    completedCapabilities: [
      "runner_owned_real_model_middle_lane_proof",
      "model_task_client_router_provider_calls_for_lifecycle_proof",
      "bounded_manifest_backed_proof_run_artifacts",
      "domain_resource_selection_small_verb_runtime_wrapping",
      "resource_selection_parser_candidate_scan_without_semantic_judgment",
      "residue_inventory_gate_zero_blocked_survivors",
      "proof_admission_requires_real_model_provider_calls",
    ],
    validationCommands: [
      {
        command:
          "OPENCLAW_VITEST_INCLUDE_FILE=<json-array> node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts",
        scope:
          "boundary-replay-proof-gate, node-lifecycle-transition-runner, resource-objective-focus, resource-selection",
        result: "passed: 4 files, 40 tests",
      },
      { command: "node --check scripts/execution-platform-run-lifecycle-runner-real-model-proof.mjs", result: "passed" },
      { command: "node --check scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs", result: "passed" },
      { command: "pnpm tsgo:fast", result: "passed" },
      { command: "git diff --check -- changed lifecycle/proof files", result: "passed" },
      {
        command:
          "node scripts/execution-platform-run-architecture-residue-source-inventory-gate.mjs",
        result: "passed: hardFailureCount=0 blockedSurvivorRefCount=0",
      },
      {
        command:
          `node scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs --proof-run-id ${proofRunId}`,
        result: "passed: admissionStatus=admitted proofClosureAllowed=true providerCallCount=3",
      },
    ],
    proofEvidence: {
      proofRunId,
      proofManifestRef: `artifact://execution-platform/proof-runs/${proofRunId}/manifest.json`,
      proofManifestHash: artifactHash(proofManifestPath),
      proofAdmissionRef:
        `artifact://execution-platform/proof-runs/${proofRunId}/product-spec-replay-proof-admission-gate.json`,
      proofAdmissionHash: artifactHash(proofAdmissionPath),
      proofReplayResultRef:
        `artifact://execution-platform/proof-runs/${proofRunId}/product-spec-boundary-replay-result.json`,
      proofReplayResultHash: artifactHash(proofReplayResultPath),
      runnerProofRef: "artifact://execution-platform/lifecycle-runner-real-model-proof/proof.json",
      runnerProofHash: artifactHash(runnerProofPath),
      runnerManifestRef:
        "artifact://execution-platform/lifecycle-runner-real-model-proof/manifest.json",
      runnerManifestHash: artifactHash(runnerManifestPath),
      providerCallCount: proofReplayResult.middleLaneProof.providerCallCount,
      manifestBytes: proofManifest.manifestJsonByteCount,
      gatesVisited: runnerProof.gatesVisited,
      changedFileRefs: proofManifest.changedFileRefs,
      validationRefs: proofManifest.validationRefs,
      evidenceClaimRefs: proofManifest.evidenceClaimRefs,
    },
    residueInventory: {
      manifestRef:
        "artifact://execution-platform/architecture-residue-source-inventory-final-gate/manifest.json",
      manifestHash: artifactHash(inventoryManifestPath),
      reportRef:
        "artifact://execution-platform/architecture-residue-source-inventory-final-gate/full-report.json",
      reportHash: artifactHash(inventoryReportPath),
      hardFailureCount: inventoryReport.hardFailureCount,
      blockedSurvivorRefCount: inventoryReport.blockedSurvivorRefCount,
      survivorRefCount: inventoryReport.survivorRefCount,
      lineReduction: inventoryReport.lineReduction,
    },
    deepCompletionAnswers: {
      nodeLifecycleRunnerOwnsClosureProofTransitions: true,
      directNoModelLifecycleResidueWalkCanCloseItem: false,
      domainResourceSelectionRequiresFullModelConstructedEnvelope: false,
      runtimeWrapsAndValidatesDomainSelectionContract: true,
      proofAdmissionRequiresRealModelProviderCalls: true,
      metadataManifestOverflowObserved: false,
      residueInventoryHasBlockedSurvivors: false,
      deterministicSemanticJudgmentIntroduced: false,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
      "docs/projects/execution-platform/specs/node-lifecycle-transition-runner.md",
      "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    runtimeAuthority:
      "lifecycle_transition_execution_manifest_payload_bounds_contract_wrapping_validation_evidence_shape_readback_admission_and_db_closeout",
    semanticJudgmentOwner:
      "model_for_focus_narrowing_domain_resource_choice_and_action_semantics; human_or_model_for_closeout_sufficiency",
    deterministicSemanticJudgmentAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      closeoutRef: closeout.ref,
      closeoutHash: closeout.sha256,
      validationRef: "validation://node-lifecycle-transition-ownership-consolidation",
      graphRef: `runtime-work-graph://${proofManifest.graphId}`,
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        `artifact://execution-platform/proof-runs/${proofRunId}/manifest.json`,
        `artifact://execution-platform/proof-runs/${proofRunId}/product-spec-replay-proof-admission-gate.json`,
        `artifact://execution-platform/proof-runs/${proofRunId}/product-spec-boundary-replay-result.json`,
        "artifact://execution-platform/lifecycle-runner-real-model-proof/proof.json",
        "artifact://execution-platform/lifecycle-runner-real-model-proof/manifest.json",
        "artifact://execution-platform/architecture-residue-source-inventory-final-gate/manifest.json",
      ],
      accepted: true,
      actorId: "codex:node-lifecycle-transition-ownership-consolidation",
      reasonCodes: [
        "node_lifecycle_transition_ownership_consolidation_closed",
        "runner_owned_real_model_middle_lane_proof_passed",
        "proof_admission_requires_provider_calls",
        "domain_resource_selection_small_verb_runtime_wrapping_verified",
        "metadata_manifest_bounds_verified",
        "residue_inventory_gate_passed",
      ],
    });
    const active = await workQueue.listDbWorkQueue({ bucket: "active", limit: 5 });
    console.log(
      JSON.stringify(
        {
          status: "closed",
          workItemId,
          closeout,
          nextActiveItems: active.items.map((item) => ({
            workItemId: item.workItemId,
            rank: item.queueRank,
            title: item.title,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.close?.();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        errorName: error?.name ?? "unknown_error",
        errorSummary: String(error?.message ?? error).slice(0, 1_200),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
