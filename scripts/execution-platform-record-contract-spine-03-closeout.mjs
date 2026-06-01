#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-03-demand-driven-context-tools";
const nextItemId = "openclaw-convergence.contract-spine-04-frontier-root-cause-collapse";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-03/adjacent-context-boundary-tests-36-pass",
  "validation://contract-spine-03/scheduler-no-semantic-cheats-tests-108-pass",
  "validation://contract-spine-03/scoped-tsgo-fast-pass",
  "validation://contract-spine-03/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-03-demand-driven-context-closeout.json", {
    artifactKind: "execution_platform.contract_spine_03_demand_driven_context_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Demand-driven context is now enforced as a scheduler/replay policy boundary: node-local node resource demand and repair preserve consumer-node scope, default context synthesis is rejected before graph persistence unless explicit workflow/model coordination is declared, context input detection no longer uses substring classifiers, and Product/Spec boundary replay no longer injects synthetic context-synthesis refs into implementation task packets.",
    completedCapabilities: [
      "context_synthesis_explicit_coordination_manifest",
      "context_synthesis_apply_time_rejection_without_manifest",
      "context_synthesis_join_edges_explicit_coordination_only",
      "node_local_node_resource_demand_policy_metadata",
      "context_repair_demand_driven_policy_metadata",
      "context_input_detection_without_ref_substring_classifier",
      "product_spec_boundary_replay_no_synthetic_context_synthesis_refs",
      "no_semantic_cheats_synthesis_retirement_regressions",
    ],
    forbiddenPathsRetired: [
      "implicit_context_synthesis_graph_persistence",
      "context_synthesis_default_glue_between_packets_and_implementation",
      "resource_handoff_ref_substring_classifier",
      "context_synthesis_ref_substring_classifier",
      "product_spec_replay_synthetic_context_synthesis_refs",
      "context_repair_reason_code_regex_semantic_classifier",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 5,
        testsPassed: 36,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 2,
        testsPassed: 108,
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Frontier root-cause/no-progress collapse remains assigned to contract-spine item 04.",
      "Branch-scoped frontier/readback projection remains assigned to contract-spine item 05.",
      "This slice does not run the full Product/Spec proof; it closes the demand-driven context/synthesis-retirement boundary required before replay proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_bounds_storage_lifecycle_locks_tool_execution_validation_readiness_projection_context_policy_enforcement",
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
    graphRef: "runtime-contract://execution-platform/demand-driven-context-policy/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-03-closeout",
    reasonCodes: [
      "contract_spine_03_demand_driven_context_tools_implemented",
      "context_synthesis_explicit_coordination_manifest_required",
      "implicit_context_synthesis_rejected_before_persistence",
      "node_local_node_resource_demand_policy_recorded",
      "context_repair_demand_driven_policy_recorded",
      "context_ref_substring_classifiers_removed",
      "product_spec_replay_synthetic_synthesis_refs_removed",
      "focused_validation_passed",
      "scheduler_validation_passed",
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
          "Demand-driven context and explicit-only synthesis enforcement are closed; frontier root-cause/no-progress collapse is the next contract-spine boundary.",
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
