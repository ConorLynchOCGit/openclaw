#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-08-canonical-readback-gate";
const nextItemId = "openclaw-convergence.contract-spine-09-model-policy-bindings";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/observability/latest-run-state.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
  "docs/projects/execution-platform/specs/work-queue-runtime-projection-truth.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/index.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-08/readback-projections-tests-4-pass",
  "validation://contract-spine-08/latest-run-state-tests-1-pass",
  "validation://contract-spine-08/no-semantic-cheats-tests-14-pass",
  "validation://contract-spine-08/execution-read-model-tests-pass",
  "validation://contract-spine-08/runtime-work-graph-scheduler-tests-pass",
  "validation://contract-spine-08/scoped-tsgo-fast-pass",
  "validation://contract-spine-08/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-08-canonical-readback-gate-closeout.json", {
    artifactKind: "execution_platform.contract_spine_08_canonical_readback_gate_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "CanonicalReadbackGate is now the bounded runtime readback gate shared by latest-run-state and Work Queue active graph progress. firstOpenGate is populated from readiness/frontier/root-cause/contract/validation/terminal truth rather than stale checkpoint labels. Materialization blockers surface as resource_materialization with branch, node, contract, readiness, schema/policy path, reason code, consumer, sibling evidence, and next-transition details.",
    completedCapabilities: [
      "canonical_readback_gate_projection",
      "first_open_gate_alias_from_canonical_gate",
      "latest_run_state_canonical_gate",
      "work_queue_active_graph_canonical_gate",
      "materialization_blocker_gate_precedence",
      "stale_checkpoint_low_confidence_fallback",
      "branch_scoped_gate_consumer_and_sibling_evidence_readback",
      "scheduler_latest_run_gate_agreement_check",
      "readback_substring_phase_classifier_retirement",
    ],
    forbiddenPathsRetired: [
      "stale_obligation_graph_first_open_gate",
      "checkpoint_label_overrides_materialization_blocker",
      "readback_lifecycle_substring_classifier",
      "product_spec_specific_readback_gate_logic",
      "raw_prompt_or_provider_body_in_owner_gate",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/observability/latest-run-state.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
      },
      {
        command: "pnpm tsgo:fast",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Model policy bindings remain assigned to contract-spine item 09.",
      "Contract-spine replay proof remains assigned to item 10 before full Product/Spec proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_bounds_lifecycle_readiness_frontier_root_cause_contract_validation_readback_projection",
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
    graphRef: "runtime-contract://execution-platform/canonical-readback-gate/v1",
    ownerReadbackRef: `${sourceSpecRef}#8-readback-gate-fix`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-08-closeout",
    reasonCodes: [
      "contract_spine_08_canonical_readback_gate_implemented",
      "first_open_gate_from_canonical_readiness_frontier_state",
      "materialization_blocker_beats_stale_checkpoint_label",
      "latest_run_state_work_queue_gate_agreement_added",
      "readback_substring_phase_classifier_removed",
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
          "Canonical readback gate is closed; model policy bindings are the next contract-spine boundary.",
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
  console.error(error);
  process.exit(1);
}
