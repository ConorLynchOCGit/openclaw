#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure";
const nextItemId = "openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
  "extensions/execution-platform/src/workflows/product-spec-proof-substrate.test.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-run-product-spec-proof-substrate-run-scoped-proof.mjs",
  "scripts/execution-platform-record-product-spec-proof-substrate-scrub-closeout.mjs",
];

const validationRefs = [
  "validation://product-spec-proof-substrate/product-spec-proof-substrate-and-admission-focused-tests-pass",
  "validation://product-spec-proof-substrate/run-scoped-substrate-proof-positive-admitted",
  "validation://product-spec-proof-substrate/stale-retired-topology-negative-fixture-blocked",
  "validation://product-spec-proof-substrate/context-scout-specialist-real-model-proof-pass",
  "validation://product-spec-proof-substrate/tsgo-fast-pass",
  "validation://product-spec-proof-substrate/git-diff-check-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function flag(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1]?.trim() ?? fallback) : fallback;
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

function artifactRefToPath(ref, label) {
  if (typeof ref !== "string" || !ref.trim()) {
    throw new Error(`${label}_required`);
  }
  const trimmed = ref.trim();
  if (trimmed.startsWith(".artifacts/")) {
    return path.join(root, trimmed);
  }
  if (trimmed.startsWith("artifact://execution-platform/")) {
    return path.join(artifactDir, trimmed.slice("artifact://execution-platform/".length));
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  throw new Error(`${label}_must_be_artifact_ref:${trimmed}`);
}

function artifactHash(absPath) {
  return `sha256:${sha256(fs.readFileSync(absPath, "utf8"))}`;
}

function requireRunScopedRef(api, ref, proofRunId, label) {
  if (!api.isProductSpecProofRunArtifactRefForRun(ref, proofRunId)) {
    throw new Error(`${label}_must_be_run_scoped_to_manifest_proof_run`);
  }
}

async function main() {
  const manifestRef =
    flag("--proof-run-manifest") ?? process.env.OPENCLAW_PRODUCT_SPEC_PROOF_RUN_MANIFEST ?? null;
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const manifestPath = artifactRefToPath(manifestRef, "proof_run_manifest");
  const manifest = readJson(manifestPath);
  api.assertProductSpecProofRunManifestBounds(manifest);
  requireRunScopedRef(api, manifest.proofRunManifestRef, manifest.proofRunId, "manifest_ref");
  requireRunScopedRef(api, manifest.replayResultRef, manifest.proofRunId, "replay_result_ref");
  requireRunScopedRef(api, manifest.admissionGateRef, manifest.proofRunId, "admission_gate_ref");
  requireRunScopedRef(api, manifest.proofArtifactRef, manifest.proofRunId, "proof_artifact_ref");

  const cleanliness = api.evaluateProductSpecProofCleanliness({
    proofSourceKind: manifest.proofSourceKind,
    proofRunId: manifest.proofRunId,
    proofRunManifestRef: manifest.proofRunManifestRef,
    runtimeJobId: manifest.runtimeJobId,
    graphId: manifest.graphId,
    sourceTopologyStatus: manifest.sourceTopologyStatus,
    closurePredicateStatus: manifest.closurePredicateStatus,
    proofClosureAllowed: manifest.proofClosureAllowed,
    proofArtifactRefs: manifest.proofArtifactRefs,
  });
  if (cleanliness.status !== "passed") {
    throw new Error(`product_spec_proof_substrate_not_clean:${cleanliness.reasonCodes.join(",")}`);
  }
  if (
    manifest.proofSourceClassification !== "fresh_product_spec_runtime_boundary_replay" ||
    manifest.closurePredicateStatus !== "admitted" ||
    manifest.proofClosureAllowed !== true
  ) {
    throw new Error("product_spec_proof_manifest_not_fresh_closeout_evidence");
  }

  const proofPath = artifactRefToPath(manifest.proofArtifactRef, "proof_artifact");
  const admissionPath = artifactRefToPath(manifest.admissionGateRef, "admission_artifact");
  const replayResultPath = artifactRefToPath(manifest.replayResultRef, "replay_result_artifact");
  const proof = readJson(proofPath);
  const admission = readJson(admissionPath);
  const replayResult = readJson(replayResultPath);
  if (proof?.proofRunId !== manifest.proofRunId || admission?.proofRunId !== manifest.proofRunId) {
    throw new Error("proof_artifacts_do_not_match_manifest_proof_run_id");
  }
  if (admission?.status !== "admitted" || admission?.proofClosureAllowed !== true) {
    throw new Error("admission_artifact_not_closeable");
  }
  if (replayResult?.status !== "succeeded") {
    throw new Error("replay_result_not_succeeded");
  }

  const evidence = writeArtifact("product-spec-proof-substrate-scrub-closeout.json", {
    artifactKind: "execution_platform.product_spec_proof_substrate_scrub_closeout",
    workItemId,
    nextItemId,
    proofRunId: manifest.proofRunId,
    proofRunManifestRef: manifest.proofRunManifestRef,
    proofRunManifestPath: manifestRef,
    proofRunManifestHash: artifactHash(manifestPath),
    proofArtifactRef: manifest.proofArtifactRef,
    proofArtifactHash: artifactHash(proofPath),
    admissionGateRef: manifest.admissionGateRef,
    admissionGateHash: artifactHash(admissionPath),
    replayResultRef: manifest.replayResultRef,
    replayResultHash: artifactHash(replayResultPath),
    cleanliness,
    validationRefs,
    changedFileRefs,
    runScopedManifestRequired: true,
    sharedLatestArtifactClosureRejected: true,
    staleRetiredTopologyNegativeFixtureRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });

  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  try {
    await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: null,
      closeoutRef: evidence.ref,
      closeoutHash: evidence.sha256,
      validationRequired: true,
      validationRef: "validation://product-spec-proof-substrate/run-scoped-substrate-scrub-pass",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [evidence.ref, manifest.proofRunManifestRef, manifest.proofArtifactRef],
      graphRef: manifest.graphId ? `runtime-work-graph://${manifest.graphId}` : null,
      ownerReadbackRef:
        "owner-readback://product-spec-proof-substrate/run-scoped-manifest-cleanliness-closed",
      accepted: true,
      reasonCodes: [
        "run_scoped_product_spec_proof_manifest_required",
        "manifest_body_artifact_bounds_enforced",
        "stale_retired_topology_negative_fixture_blocked",
        "fresh_product_spec_runtime_boundary_replay_closeout_evidence_accepted",
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
  } finally {
    await runtime.pool.end();
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "closed",
      workItemId,
      nextItemId,
      closeoutRef: evidence.ref,
      manifestRef: manifest.proofRunManifestRef,
    })}\n`,
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      errorName: error?.name ?? "unknown_error",
      errorSummary: String(error?.message ?? error).slice(0, 1200),
    }),
  );
  process.exitCode = 1;
});
