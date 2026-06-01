#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-06-worker-smoke-matrix";
const nextItemId = "openclaw-convergence.proof-hardening-07-adversarial-entry-suite";
const proofArtifactPath =
  ".artifacts/execution-platform/proof-hardening-06-worker-smoke-matrix-proof.json";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.ts",
  "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "scripts/execution-platform-run-proof-hardening-06-worker-smoke-matrix.mjs",
  "scripts/execution-platform-record-proof-hardening-06-closeout.mjs",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/specs/index.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
];

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 2,
  },
  {
    command:
      "node scripts/execution-platform-run-proof-hardening-06-worker-smoke-matrix.mjs",
    result: "passed",
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    result: "passed",
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    result: "passed",
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/action-review-artifacts.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 5,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts -- -t \"routes patch-lane context tool requests|derives focused validation commands|edits, validates, and claims evidence\"",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 3,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 37,
  },
  {
    command:
      "pnpm tsgo:fast -- proof-hardening-06 touched TypeScript files",
    result: "passed",
  },
  {
    command:
      "node --check scripts/execution-platform-run-proof-hardening-06-worker-smoke-matrix.mjs && node --check scripts/execution-platform-record-proof-hardening-06-closeout.mjs",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
  },
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
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

async function main() {
  const proof = readJson(proofArtifactPath);
  if (proof.pass !== true) {
    throw new Error("proof_hardening_06_matrix_proof_not_passing");
  }
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const proofHash = `sha256:${sha256(fs.readFileSync(path.join(root, proofArtifactPath), "utf8"))}`;

  const closeout = writeArtifact("proof-hardening-06-worker-smoke-matrix-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_06_worker_smoke_matrix_closeout",
    schemaVersion: "execution-platform.proof-hardening-06-closeout.v1",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    proofArtifactRef: `artifact://execution-platform/${path.basename(proofArtifactPath)}`,
    proofArtifactHash: proofHash,
    implementationSummary:
      "The multi-child worker smoke matrix is now a first-class bounded proof surface. It prepares, hydrates, runs, records, reviews, and blocks lanes through small runtime verbs; exercises three Product/Spec-derived child classes, one precise no-edit upstream blocker, and one neutral non-coding action-review fixture; and proves hydrated NodeExecutionContract, NodeExecutionPacket, domain resource packet, validation, evidence, review artifact, and rollback/readback evidence without making graph metadata carry executable semantics.",
    completedCapabilities: [
      "worker_smoke_prepare_matrix_tool",
      "worker_smoke_hydrate_lane_tool",
      "worker_smoke_run_lane_tool",
      "worker_smoke_record_result_tool",
      "worker_smoke_assert_review_artifact_tool",
      "worker_smoke_record_blocker_tool",
      "multi_child_worker_smoke_matrix_runner",
      "model_task_runtime_contract_child_smoke",
      "workflow_plugin_definition_child_smoke",
      "work_queue_readback_proof_review_child_smoke",
      "valid_no_edit_upstream_blocker_child_smoke",
      "neutral_non_coding_domain_resource_fixture",
      "rollback_restoration_evidence",
      "review_artifact_hydration_evidence",
    ],
    proofSummary: {
      laneCount: proof.laneResults.length,
      scopedEditPassCount: proof.scopedEditPassCount,
      preciseBlockerPassCount: proof.preciseBlockerPassCount,
      neutralFixturePassCount: proof.neutralFixturePassCount,
      childClassesExercised: proof.childClassesExercised,
      reviewArtifactRefs: proof.reviewArtifactRefs,
      validationRefs: proof.validationRefs,
      evidenceRefs: proof.evidenceRefs,
      matrixToolInvocationRefs: proof.matrixToolInvocationRefs,
      reasonCodes: proof.reasonCodes,
    },
    validationCommands,
    changedFileRefs,
    validationRefs: [
      "validation://proof-hardening-06/worker-smoke-matrix-tests-pass",
      "validation://proof-hardening-06/worker-smoke-matrix-proof-script-pass",
      "validation://proof-hardening-06/scheduler-runtime-tools-tests-pass",
      "validation://proof-hardening-06/no-semantic-cheats-tests-pass",
      "validation://proof-hardening-06/scoped-tsgo-fast-pass",
      "validation://proof-hardening-06/node-check-scripts-pass",
      "validation://proof-hardening-06/git-diff-check-pass",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_payload_presence_authority_lifecycle_validation_evidence_review_artifact_hydration_rollback_state_tool_invocation_traces",
    runtimeMustNotJudge: [
      "semantic_file_relevance",
      "context_sufficiency_quality",
      "edit_quality",
      "product_spec_special_meaning",
      "qualitative_complexity",
      "model_rationale_persuasiveness",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: closeout.ref,
    closeoutHash: closeout.sha256,
    validationRef: "validation://proof-hardening-06/worker-smoke-matrix-pass",
    graphRef: "runtime-contract://execution-platform/worker-smoke-matrix/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#6-multi-child-worker-smoke-matrix`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [closeout.ref, `artifact://execution-platform/${path.basename(proofArtifactPath)}`],
    accepted: true,
    actorId: "codex:proof-hardening-06-closeout",
    reasonCodes: [
      "proof_hardening_06_worker_smoke_matrix_implemented",
      "multi_child_worker_smoke_matrix_passed",
      "three_product_spec_child_classes_exercised",
      "precise_upstream_blocker_lane_passed",
      "neutral_domain_resource_fixture_passed",
      "review_artifacts_hydrateable",
      "rollback_restoration_proven",
      "focused_validation_passed",
      "scoped_type_validation_passed",
      "git_diff_check_passed",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    runtimeLifecycleMutated: false,
  });

  await runtime.sqlClient.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = now()
      WHERE work_item_id = $2
    `,
    [
      JSON.stringify({
        previousPreProofItemClosed: workItemId,
        nextActiveReason:
          "Multi-child worker smoke matrix is closed; adversarial proof-entry suite is the next pre-proof gate.",
        preProofReadinessRefs: [proofArtifactPath, closeout.path],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      }),
      nextItemId,
    ],
  );

  const rows = await runtime.sqlClient.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 10
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: transition.closed,
        transition,
        closeout,
        nextActiveItems: rows.rows,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
