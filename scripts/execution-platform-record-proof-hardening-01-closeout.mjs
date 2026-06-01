#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-01-replay-production-fidelity-epochs";
const nextItemId = "openclaw-convergence.proof-hardening-02-target-selection-router-budget";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "src/gateway/execution-platform-http.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "scripts/execution-platform-record-proof-hardening-01-closeout.mjs",
];

const validationRefs = [
  "validation://proof-hardening-01/scoped-tsgo-fast-pass",
  "validation://proof-hardening-01/boundary-replay-checkpoints-tests-pass",
  "validation://proof-hardening-01/product-spec-boundary-replay-topology-tests-pass",
  "validation://proof-hardening-01/no-semantic-cheats-tests-pass",
  "validation://proof-hardening-01/replay-script-node-check-pass",
  "validation://proof-hardening-01/git-diff-check-pass",
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

  const evidence = writeArtifact("proof-hardening-01-replay-production-fidelity-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_01_replay_production_fidelity_closeout",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    implementationSummary:
      "Boundary replay now carries production-equivalence metadata, source checkpoint version, synthetic-artifact allow/deny manifests, terminal lifecycle policy, and stable boundary epochs. Production-equivalent replay boundaries forbid proof-only synthetic topology; diagnostic-only boundaries cannot close production proof gates. Boundary checkpoints and replay plans expose replayBoundaryId, source graph/job ids, proofClosureAllowed, boundaryEpoch, and superseded child refs. Rematerialized replay boundaries can structurally retire stale children by epoch, scheduler frontier selection filters superseded/diagnostic/epoch-mismatched replay children before worker execution, Work Queue readback/latest-run-state project replay epoch/proof-closure fields, and the product/spec replay script closes the Execution Platform runtime after terminal JSON.",
    completedCapabilities: [
      "production_path_equivalence_manifest",
      "diagnostic_only_replay_boundaries",
      "boundary_epoch_contract",
      "stale_replay_child_supersession",
      "missing_epoch_replay_child_supersession",
      "frontier_epoch_eligibility_filter",
      "proof_closure_allowed_projection",
      "replay_readback_epoch_projection",
      "latest_run_state_replay_epoch_projection",
      "terminal_replay_runtime_shutdown_hook",
      "structural_no_semantic_cheat_regression",
    ],
    forbiddenPathsRetired: [
      "production_replay_closes_from_diagnostic_boundary",
      "default_synthetic_context_synthesis_in_production_equivalent_replay",
      "stale_replay_child_selected_after_parent_rematerialization",
      "pre_epoch_replay_child_selected_without_boundary_epoch",
      "diagnostic_replay_child_selected_for_production_worker_execution",
      "replay_boundary_epoch_mismatch_reaches_worker",
      "terminal_replay_script_leaves_gateway_db_pool_open",
      "lexical_product_spec_or_context_synthesis_replay_classifier",
    ],
    validationCommands: [
      {
        command:
          "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts extensions/execution-platform/src/workflows/boundary-replay-registry.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts extensions/execution-platform/src/observability/latest-run-state.ts src/gateway/execution-platform-http.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 3,
        testsPassed: 35,
      },
      {
        command: "node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "replay_boundary_equivalence_checkpoint_schema_epochs_ref_hashes_lifecycle_state_frontier_eligibility_terminal_process_shutdown_readback_projection",
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
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    graphRef: "runtime-contract://execution-platform/boundary-replay-production-fidelity/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#1-replay-production-fidelity-and-boundary-epochs`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:proof-hardening-01-closeout",
    reasonCodes: [
      "proof_hardening_01_replay_production_fidelity_implemented",
      "production_equivalent_replay_manifest_added",
      "diagnostic_only_replay_proof_closure_blocked",
      "boundary_epoch_contract_added",
      "stale_child_supersession_added",
      "missing_epoch_replay_child_supersession_added",
      "frontier_epoch_eligibility_filter_added",
      "terminal_replay_runtime_shutdown_added",
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
          "Replay production fidelity and boundary epochs are closed; resource/target selection model-task routing and payload budgeting is the next pre-proof gate.",
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

  await runtime.pool.end();
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
