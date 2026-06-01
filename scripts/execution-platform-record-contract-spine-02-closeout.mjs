#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-02-resource-requirement-compiler";
const nextItemId = "openclaw-convergence.contract-spine-03-demand-driven-context-tools";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/resource-requirement-packet.ts",
  "extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts",
  "extensions/execution-platform/src/workflows/context-scout-execution-packet.ts",
  "extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "extensions/execution-platform/src/observability/latest-run-state.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
  "docs/projects/execution-platform/index.md",
  "docs/projects/execution-platform/specs/index.md",
];

const validationRefs = [
  "validation://contract-spine-02/resource-requirement-scout-tool-metadata-tests-35-pass",
  "validation://contract-spine-02/runtime-work-graph-scheduler-tests-94-pass",
  "validation://contract-spine-02/scoped-tsgo-fast-pass",
  "validation://contract-spine-02/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-02-resource-requirement-closeout.json", {
    artifactKind: "execution_platform.contract_spine_02_resource_requirement_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "ResourceRequirementPacket is now the payload-backed contract between WorkIntent/context broker requests and ContextScoutExecutionPacket. Production scout paths persist requirement artifacts, invoke context.get_requirement, block scout execution without ready requirements, reject mixed consumer/capability/purpose bundles, project requirement state into readback, and enforce manifest-only graph metadata.",
    completedCapabilities: [
      "resource_requirement_packet_schema",
      "resource_requirement_packet_manifest",
      "resource_requirement_packet_runtime_artifact_contract",
      "context_scout_execution_packet_requirement_gate",
      "context_get_requirement_runtime_tool",
      "dynamic_runner_resource_requirement_artifact",
      "standalone_context_scout_requirement_artifact",
      "scheduler_resource_fulfillment_workintent_metadata",
      "scheduler_context_repair_requirement_metadata",
      "graph_metadata_resource_requirement_body_rejection",
      "work_queue_resource_requirement_readback",
      "latest_run_state_resource_requirement_readback",
    ],
    forbiddenPathsRetired: [
      "context_scout_runs_without_resource_requirement_packet",
      "context_scout_merges_mixed_consumers",
      "context_scout_merges_mixed_capabilities",
      "context_scout_merges_mixed_context_purposes",
      "graph_metadata_embeds_resource_requirement_packet_body",
      "context_repair_inherits_context_by_ref_substring_classifier",
      "owner_readback_hides_requirement_missing_behind_generic_context_state",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
        testFilesPassed: 5,
        testsPassed: 35,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 94,
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/resource-requirement-packet.ts extensions/execution-platform/src/workflows/resource-requirement-packet.test.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.ts extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/observability/latest-run-state.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "Demand-driven context topology, synthesis-retirement replay alignment, and progressive context tool ergonomics remain assigned to contract-spine item 03.",
      "This slice proves the requirement boundary and readback; it does not run the full Product/Spec proof.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_ids_refs_hashes_bounds_storage_lifecycle_locks_tool_execution_validation_readiness_projection_resource_requirement_artifacts",
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
    graphRef: "runtime-contract://execution-platform/resource-requirement-packet/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25-1`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-02-closeout",
    reasonCodes: [
      "contract_spine_02_resource_requirement_compiler_implemented",
      "resource_requirement_packet_payload_backed",
      "context_scout_execution_packet_requires_ready_requirement",
      "context_get_requirement_runtime_tool_registered",
      "graph_metadata_manifest_only_resource_requirement_enforced",
      "work_queue_resource_requirement_readback_projected",
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
          "ResourceRequirementPacket compiler is closed; demand-driven context tools and synthesis-retirement replay alignment are the next contract-spine boundary.",
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
