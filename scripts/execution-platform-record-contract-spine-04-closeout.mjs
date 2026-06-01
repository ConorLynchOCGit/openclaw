#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-04-frontier-root-cause-collapse";
const nextItemId = "openclaw-convergence.contract-spine-05-branch-scoped-frontier-state";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-04/scheduler-readback-no-cheats-tests-282-pass",
  "validation://contract-spine-04/scoped-tsgo-fast-pass",
  "validation://contract-spine-04/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-04-frontier-root-cause-closeout.json", {
    artifactKind: "execution_platform.contract_spine_04_frontier_root_cause_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Frontier no-progress collapse is now a canonical scheduler/runtime boundary: blocked frontier nodes produce structured diagnostics, repeated structural signatures collapse into one runtime_work_graph_frontier_root_cause artifact, successful sibling evidence is preserved, owner readback exposes the repair boundary and affected branches, and root-cause construction no longer relies on semantic reason-code substring classifiers.",
    completedCapabilities: [
      "frontier_blocked_node_diagnostic",
      "stable_structural_no_progress_signature",
      "frontier_root_cause_artifact",
      "scheduler_record_frontier_root_cause_tool",
      "successful_sibling_evidence_survival",
      "root_cause_next_legal_transition_projection",
      "latest_run_state_root_cause_readback",
      "work_queue_active_graph_root_cause_projection",
      "no_semantic_reason_code_regex_classifier_regression",
    ],
    forbiddenPathsRetired: [
      "no_progress_reason_code_semantic_regex_filter",
      "duplicate_reused_only_graph_churn_without_root_cause",
      "frontier_root_cause_hides_successful_sibling_evidence",
      "root_cause_readback_missing_repair_boundary",
      "root_cause_artifact_raw_storage",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        result: "passed",
        testFilesPassed: 4,
        testsPassed: 282,
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Branch-scoped frontier state and branch-local repair/readback remain assigned to contract-spine item 05.",
      "Scheduler model-call observability remains assigned to contract-spine item 06.",
      "This slice does not run the full Product/Spec proof; it closes the repeated-root-cause collapse boundary required before replay proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_bounds_storage_lifecycle_locks_tool_execution_validation_readiness_projection_frontier_root_cause_collapse",
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
    graphRef: "runtime-contract://execution-platform/frontier-root-cause-collapse/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25-1`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-04-closeout",
    reasonCodes: [
      "contract_spine_04_frontier_root_cause_collapse_implemented",
      "frontier_blocked_node_diagnostics_recorded",
      "stable_structural_no_progress_signature_implemented",
      "frontier_root_cause_artifact_recorded",
      "successful_sibling_evidence_preserved",
      "root_cause_readback_projected",
      "semantic_reason_code_regex_classifier_retired",
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
          "Frontier root-cause/no-progress collapse is closed; branch-scoped frontier state and readback are the next contract-spine boundary.",
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
      LIMIT 20
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
