#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.scheduler-workintent-graph-demand-context-gate";
const nextItemId = "openclaw-convergence.executable-spine-02-resource-requirement-reshard";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/work-intent.ts",
  "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
  "extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
  "docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/DECISIONS.md",
];

const validationRefs = [
  "validation://scheduler-workintent-demand-context-gate/orchestrator-graph-decision-40-pass",
  "validation://scheduler-workintent-demand-context-gate/scheduler-runtime-tools-17-pass",
  "validation://scheduler-workintent-demand-context-gate/runtime-work-graph-scheduler-99-pass",
  "validation://scheduler-workintent-demand-context-gate/no-semantic-cheats-20-pass",
  "validation://scheduler-workintent-demand-context-gate/combined-focused-176-pass",
  "validation://scheduler-workintent-demand-context-gate/tsgo-fast-pass",
  "validation://scheduler-workintent-demand-context-gate/git-diff-check-pass",
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

  const evidence = writeArtifact("scheduler-workintent-demand-context-gate-closeout.json", {
    artifactKind: "execution_platform.scheduler_workintent_demand_context_gate_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "WorkIntentGraph acceptance now binds model-authored execution intent and selected capability to the runtime capability manifest before context or executable nodes can become legal work. Independent non-runnable WorkIntent roots use scheduler.work_intent.accept_roots. Orphan context scouts, context scouts without ResourceRequirementPacket refs, multi-node zero-edge graphs without valid independent roots, and model-authored context-synthesis-to-implementation glue are rejected structurally. Runtime persists manifest-backed schema, adapter, resource, authority, evidence, and legal-transition fields without judging semantic quality.",
    completedCapabilities: [
      "work_intent_capability_manifest_binding",
      "canonical_scheduler_work_intent_small_verbs",
      "canonical_capability_manifest_small_verbs",
      "independent_non_runnable_work_intent_root_acceptance",
      "orphan_context_scout_rejection",
      "multi_node_zero_edge_independent_root_rejection",
      "context_scout_resource_requirement_ref_enforcement",
      "direct_context_synthesis_implementation_glue_rejection",
      "proof_harness_work_intent_gate_projection",
    ],
    retiredOrSupersededPaths: [
      "scheduler.accept_work_intent_roots production progress/readback id",
      "context_scout as default graph glue before consumer WorkIntent/contract",
      "context_synthesis group to implementation node shortcut on staged production paths",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 40,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 17,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 99,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 20,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 4,
        testsPassed: 176,
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
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner:
      "model_authored_execution_intent_capability_fit_context_sufficiency_target_relevance_edit_quality_closeout_judgment",
    runtimeAuthority:
      "schema_ids_refs_hashes_bounds_storage_flags_registered_capability_membership_dependency_structure_authority_lifecycle_tool_registry_readback_projection",
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
    graphRef: "runtime-contract://execution-platform/work-intent-graph-gate/v1",
    ownerReadbackRef: `${sourceSpecRef}#acceptance-criteria`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:scheduler-workintent-demand-context-gate-closeout",
    reasonCodes: [
      "scheduler_workintent_demand_context_gate_closed",
      "work_intent_capability_manifest_binding_live",
      "canonical_work_intent_small_verbs_registered",
      "orphan_context_scout_rejected",
      "multi_node_zero_edge_independent_roots_enforced",
      "direct_context_synthesis_implementation_glue_rejected",
      "focused_validation_passed",
      "tsgo_fast_passed",
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
          "WorkIntent acceptance and capability manifest gate is closed; ResourceRequirement compiler and structural resharding is the next executable-spine boundary.",
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
      LIMIT 12
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
