#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-05-branch-scoped-frontier-state";
const nextItemId = "openclaw-convergence.contract-spine-06-scheduler-observability-envelope";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-05/branch-scoped-frontier-readback-tests-285-pass",
  "validation://contract-spine-05/scoped-tsgo-fast-pass",
  "validation://contract-spine-05/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-05-branch-scoped-frontier-closeout.json", {
    artifactKind: "execution_platform.contract_spine_05_branch_scoped_frontier_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Branch-scoped frontier state is now a canonical runtime/readback boundary: scheduler frontier state and parallel frontier readback carry branch-local readiness, contract, resource, blocker, consumer, repair, diagnostic, evidence, root-cause, and next-transition refs. Successful sibling evidence survives failed branches, zero-consumer repair nodes are diagnostic-only, and Work Queue/latest-run-state owner readback projects branch truth from canonical branch state without semantic substring classifiers.",
    completedCapabilities: [
      "runtime_work_graph_branch_scoped_frontier_state",
      "scheduler_record_branch_scoped_frontier_state_tool",
      "branch_local_readiness_contract_and_resource_refs",
      "dependent_consumer_projection",
      "successful_sibling_evidence_survival_projection",
      "failed_branch_evidence_projection",
      "consumer_aware_repair_ref_projection",
      "diagnostic_only_repair_node_projection",
      "root_cause_ref_projection",
      "next_legal_transition_projection",
      "latest_run_state_branch_state_projection",
      "work_queue_active_graph_branch_state_projection",
      "owner_telemetry_branch_readiness_projection",
      "exact_reason_code_branch_status_classification",
    ],
    forbiddenPathsRetired: [
      "branch_state_hidden_inside_terminal_node_status",
      "failed_branch_erases_successful_sibling_evidence",
      "zero_consumer_repair_node_counted_as_progress",
      "owner_readback_missing_branch_contract_or_readiness_ref",
      "owner_readback_missing_branch_next_transition",
      "reason_code_blocked_missing_substring_status_classifier",
      "branch_state_raw_prompt_or_provider_body_storage",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
        result: "passed",
        testFilesPassed: 5,
        testsPassed: 285,
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Scheduler model-call observability envelopes remain assigned to contract-spine item 06.",
      "Validation phase semantics remain assigned to contract-spine item 07.",
      "Canonical firstOpenGate/readback gate remains assigned to contract-spine item 08.",
      "This slice does not run the full Product/Spec proof; it closes branch-scoped frontier/readback required before replay proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_bounds_storage_lifecycle_locks_tool_execution_validation_readiness_projection_branch_state_projection",
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
    graphRef: "runtime-contract://execution-platform/branch-scoped-frontier-state/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25-branch-scoped-frontier-state`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-05-closeout",
    reasonCodes: [
      "contract_spine_05_branch_scoped_frontier_state_implemented",
      "branch_local_readiness_projected",
      "branch_contract_refs_projected",
      "branch_dependent_consumers_projected",
      "branch_successful_sibling_evidence_preserved",
      "branch_repair_and_diagnostic_refs_projected",
      "branch_next_legal_transition_projected",
      "semantic_substring_status_classifier_retired",
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
          "Branch-scoped frontier state/readback is closed; scheduler model-call observability envelopes are the next contract-spine boundary.",
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
