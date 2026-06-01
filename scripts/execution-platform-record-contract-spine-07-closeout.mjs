#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-07-validation-phase-semantics";
const nextItemId = "openclaw-convergence.contract-spine-08-canonical-readback-gate";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/validation-phase.ts",
  "extensions/execution-platform/src/workflows/workflow-node-execution-contracts.ts",
  "extensions/execution-platform/src/workflows/workflow-node-execution.ts",
  "extensions/execution-platform/src/workflows/workflow-node-execution.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
  "docs/projects/execution-platform/index.md",
];

const validationRefs = [
  "validation://contract-spine-07/workflow-node-execution-tests-6-pass",
  "validation://contract-spine-07/runtime-work-graph-scheduler-tests-97-pass",
  "validation://contract-spine-07/node-resource-materialization-tests-18-pass",
  "validation://contract-spine-07/readback-projections-tests-3-pass",
  "validation://contract-spine-07/latest-run-state-tests-1-pass",
  "validation://contract-spine-07/non-codex-worker-loop-tests-37-pass",
  "validation://contract-spine-07/no-semantic-cheats-tests-13-pass",
  "validation://contract-spine-07/scoped-tsgo-fast-pass",
  "validation://contract-spine-07/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-07-validation-phase-closeout.json", {
    artifactKind: "execution_platform.contract_spine_07_validation_phase_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Validation phase semantics are now a canonical runtime contract. Evidence claims carry validationPhase, validation refs, changed-file refs, compatibility status, and phase reason codes. Generic node execution computes compatibility before deriving evidence classes. Mission Ledger evaluation receives only phase-compatible closure-capable evidence. Worker validation, implementation, closeout, resource materialization, Work Queue readback, and latest-run-state now project the same lifecycle truth.",
    completedCapabilities: [
      "runtime_validation_phase_contract",
      "phase_aware_commitment_evidence_claims",
      "generic_node_result_phase_compatibility",
      "mission_ledger_phase_compatible_claim_filter",
      "closeout_and_implementation_lifecycle_phase_assignment",
      "worker_validation_phase_metadata",
      "resource_materialization_validation_phase_requirements",
      "work_queue_validation_phase_readback_projection",
      "latest_run_state_validation_phase_projection",
    ],
    forbiddenPathsRetired: [
      "pre_proof_validation_closing_implementation_commitments",
      "diagnostic_validation_closing_production_success",
      "validation_command_refs_used_as_phase_requirements",
      "artifact_only_claims_sent_to_mission_ledger_as_closure",
      "phase_incompatible_source_or_test_claims_deriving_evidence_classes",
    ],
    validationCommands: [
      {
        command: "pnpm test:file extensions/execution-platform/src/workflows/workflow-node-execution.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 6,
      },
      {
        command: "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 97,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts",
        result: "passed",
        testFilesPassed: 3,
        testsPassed: 22,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 2,
        testsPassed: 50,
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
      "Canonical firstOpenGate/readback gate remains assigned to contract-spine item 08.",
      "Model policy bindings remain assigned to contract-spine item 09.",
      "Contract-spine replay proof remains assigned to item 10 before full Product/Spec proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_bounds_lifecycle_validation_phase_compatibility_mission_ledger_filtering_readback_projection",
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
    graphRef: "runtime-contract://execution-platform/validation-phase-semantics/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-07-closeout",
    reasonCodes: [
      "contract_spine_07_validation_phase_semantics_implemented",
      "validation_phase_contract_added",
      "evidence_claim_phase_compatibility_added",
      "mission_ledger_phase_filter_added",
      "worker_validation_phase_metadata_added",
      "readback_validation_phase_projection_added",
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
          "Validation phase semantics are closed; canonical readback gate is the next contract-spine boundary.",
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
