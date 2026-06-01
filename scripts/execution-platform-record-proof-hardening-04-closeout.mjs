#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-04-readiness-child-upsert";
const nextItemId = "openclaw-convergence.proof-hardening-05-reviewable-patch-artifacts";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/readiness-recompute-authority.ts",
  "extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts",
  "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  "extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts",
  "extensions/execution-platform/src/workflows/context-broker.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "scripts/execution-platform-record-proof-hardening-04-closeout.mjs",
];

const validationRefs = [
  "validation://proof-hardening-04/readiness-recompute-authority-tests-pass",
  "validation://proof-hardening-04/node-resource-materialization-tests-pass",
  "validation://proof-hardening-04/scheduler-runtime-tools-tests-pass",
  "validation://proof-hardening-04/runtime-work-graph-scheduler-tests-pass",
  "validation://proof-hardening-04/runtime-work-graph-tests-pass",
  "validation://proof-hardening-04/no-semantic-cheats-tests-pass",
  "validation://proof-hardening-04/latest-run-state-tests-pass",
  "validation://proof-hardening-04/readback-projections-tests-pass",
  "validation://proof-hardening-04/boundary-replay-checkpoints-tests-pass",
  "validation://proof-hardening-04/context-broker-tests-pass",
  "validation://proof-hardening-04/scoped-tsgo-fast-pass",
  "validation://proof-hardening-04/git-diff-check-pass",
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

  const evidence = writeArtifact("proof-hardening-04-readiness-child-upsert-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_04_readiness_child_upsert_closeout",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    implementationSummary:
      "Readiness is now recomputed from current payload refs, hashes, boundary epoch, lifecycle state, validation phase, transitions, and limitation waiver refs before frontier execution. Persisted readiness is treated as a projection cache with explicit staleness fields and cannot unlock execution when the current NodeExecutionContract, NodeExecutionPacket, or domain resource packet disagrees. Split-child frontier eligibility now checks child epoch and parent contract/packet/resource hashes structurally before worker invocation, and stale children are blocked through small-verb runtime tools instead of being interpreted by worker models. Readback projects readiness drift, missing fields, stale status, and next legal transition from canonical readiness/frontier state.",
    completedCapabilities: [
      "readiness_recompute_authority_module",
      "node_readiness_structural_fingerprint",
      "persisted_readiness_projection_staleness",
      "contract_packet_resource_hash_readiness_matching",
      "boundary_epoch_child_frontier_eligibility",
      "stale_child_frontier_blocking",
      "node_recompute_readiness_tool",
      "node_compare_readiness_projection_tool",
      "node_mark_readiness_stale_tool",
      "node_upsert_child_for_epoch_tool",
      "node_supersede_child_epoch_tool",
      "frontier_evaluate_epoch_eligibility_tool",
      "frontier_block_stale_child_tool",
      "readback_project_readiness_drift_tool",
      "owner_readback_readiness_drift_projection",
      "latest_run_state_readiness_drift_projection",
      "neutral_domain_readiness_fixture",
    ],
    forbiddenPathsRetired: [
      "persisted_ready_projection_unlocks_worker_dispatch",
      "manifest_readiness_without_contract_packet_resource_hashes",
      "stale_child_epoch_selected_by_frontier",
      "child_parent_hash_mismatch_executes_worker",
      "duplicate_active_stale_children_after_rematerialization",
      "readback_hides_readiness_projection_drift",
      "semantic_readiness_relevance_scoring_in_runtime",
      "product_spec_specific_readiness_gate",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 3,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 18,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 11,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 98,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts",
        result: "passed",
        testFilesPassed: 6,
        testsPassed: 47,
      },
      {
        command:
          "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/readiness-recompute-authority.ts extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/observability/canonical-readback-gate.ts extensions/execution-platform/src/workflows/context-broker.test.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    knownResiduals: [
      "The next proof-hardening item must persist hydrateable review artifacts for action and patch attempts so successful worker edits can be reviewed and accepted or rejected without depending on terminal summaries.",
      "Full Product/Spec proof remains intentionally blocked until reviewable patch artifacts, worker smoke matrix, and adversarial proof-entry gates close.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "readiness_refs_hashes_epochs_schema_versions_lifecycle_validation_phase_limitation_waiver_refs_frontier_eligibility_projection_staleness",
    runtimeMustNotJudge: [
      "semantic_file_relevance",
      "context_sufficiency_quality",
      "edit_quality",
      "product_spec_special_meaning",
      "qualitative_complexity",
      "model_rationale_persuasiveness",
      "resource_usefulness",
      "implementation_strategy_quality",
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
    graphRef: "runtime-contract://execution-platform/readiness-recompute-child-upsert/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#4-readiness-recompute-stale-child-upsert-and-frontier-eligibility`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:proof-hardening-04-closeout",
    reasonCodes: [
      "proof_hardening_04_readiness_child_upsert_implemented",
      "readiness_recompute_authority_added",
      "persisted_readiness_projection_staleness_added",
      "contract_packet_resource_hash_matching_added",
      "boundary_epoch_frontier_eligibility_added",
      "stale_child_frontier_block_added",
      "readiness_small_verbs_added",
      "owner_readback_readiness_drift_added",
      "neutral_readiness_fixture_passed",
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
          "Readiness recompute and stale-child frontier blocking are closed; reviewable action/patch artifacts are the next pre-proof gate.",
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
