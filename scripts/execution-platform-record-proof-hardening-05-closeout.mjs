#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-05-reviewable-patch-artifacts";
const nextItemId = "openclaw-convergence.proof-hardening-06-worker-smoke-matrix";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/action-review-artifacts.ts",
  "extensions/execution-platform/src/workflows/action-review-artifacts.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-worker-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/specs/index.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "scripts/execution-platform-record-proof-hardening-05-closeout.mjs",
];

const validationRefs = [
  "validation://proof-hardening-05/action-review-artifacts-tests-pass",
  "validation://proof-hardening-05/scheduler-runtime-tools-tests-pass",
  "validation://proof-hardening-05/runtime-artifact-contracts-tests-pass",
  "validation://proof-hardening-05/non-codex-worker-loop-tests-pass",
  "validation://proof-hardening-05/no-semantic-cheats-tests-pass",
  "validation://proof-hardening-05/readback-projections-tests-pass",
  "validation://proof-hardening-05/scoped-tsgo-fast-pass",
  "validation://proof-hardening-05/git-diff-check-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
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
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);

  const evidence = writeArtifact("proof-hardening-05-reviewable-patch-artifacts-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_05_reviewable_patch_artifacts_closeout",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    implementationSummary:
      "Reviewable actions are now represented by a generic ActionReviewArtifact and a coding WorkerEditReviewArtifact specialization. The non-Codex worker loop emits canonical worker edit review artifact refs after edit transactions, the dynamic graph runner persists payload-backed worker edit review artifacts by runtime artifact contract, scheduler/readback surfaces review artifact refs beside changed file refs, validation refs, evidence refs, and worker phase refs, and small-verb action review tools record creation, validation/evidence linking, rollback, hydration, worker edit review persistence, inspection, and review decisions. Runtime stores refs, hashes, bounded diff excerpts, rollback state, validation refs, evidence refs, authority refs, and payload counts; model or human review owns quality judgment.",
    completedCapabilities: [
      "generic_action_review_artifact_schema",
      "worker_edit_review_artifact_schema",
      "payload_required_action_review_artifact_contracts",
      "non_codex_worker_review_artifact_refs",
      "dynamic_runner_payload_backed_worker_edit_review_persistence",
      "scheduler_action_review_small_verbs",
      "worker_edit_review_small_verbs",
      "review_decision_small_verbs",
      "active_graph_progress_review_artifact_refs",
      "work_queue_kimi_projection_review_artifact_refs",
      "neutral_non_coding_action_review_fixture",
      "coding_worker_edit_review_fixture",
      "no_semantic_cheats_action_review_regression",
    ],
    forbiddenPathsRetired: [
      "worker_result_summary_as_only_review_surface",
      "graph_metadata_full_diff_body",
      "validation_metadata_as_only_review_surface",
      "rollback_edit_without_hydrateable_review_artifact",
      "review_artifact_product_spec_specific_shape",
      "runtime_judges_patch_quality",
      "worker_hand_formats_canonical_review_schema_without_runtime_contract",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/action-review-artifacts.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 2,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 12,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
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
          "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 18,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 4,
      },
      {
        command:
          "pnpm tsgo:fast -- action-review/scheduler/worker/readback touched files",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    knownResiduals: [
      "The next proof-hardening item must run a multi-child worker smoke matrix against current replay/production-equivalent boundaries so this review artifact spine is proven across different Product/Spec-derived implementation child shapes.",
      "Full Product/Spec proof remains intentionally blocked until the worker smoke matrix and adversarial proof-entry gates close.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "review_artifact_refs_hashes_bounded_diff_refs_validation_refs_evidence_refs_authority_refs_rollback_state_payload_counts_contract_storage",
    runtimeMustNotJudge: [
      "patch_quality",
      "edit_usefulness",
      "semantic_correctness",
      "context_sufficiency_quality",
      "model_rationale_persuasiveness",
      "product_spec_special_meaning",
      "qualitative_complexity",
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
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    graphRef: "runtime-contract://execution-platform/action-review-artifact-spine/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#5-reviewable-actionpatch-artifact-spine`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:proof-hardening-05-closeout",
    reasonCodes: [
      "proof_hardening_05_reviewable_patch_artifacts_implemented",
      "action_review_artifact_schema_added",
      "worker_edit_review_artifact_schema_added",
      "payload_required_review_artifact_contracts_added",
      "non_codex_worker_review_artifact_refs_added",
      "dynamic_runner_worker_edit_review_persistence_added",
      "scheduler_review_small_verbs_added",
      "readback_review_artifact_refs_added",
      "neutral_action_review_fixture_passed",
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
          "Reviewable action/patch artifacts are closed; multi-child worker smoke matrix is the next pre-proof gate.",
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
        evidence,
        nextActiveItems: rows.rows,
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
