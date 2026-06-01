#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.contract-spine-01-node-execution-contract";
const nextItemId = "openclaw-convergence.contract-spine-02-resource-requirement-compiler";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  "extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
  "extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts",
  "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.test.ts",
  "extensions/execution-platform/src/codex-bridge/coding-team-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/context-broker.test.ts",
  "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
  "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
];

const validationRefs = [
  "validation://contract-spine-01/focused-contract-readiness-worker-readback-tests-86-pass",
  "validation://contract-spine-01/scoped-tsgo-fast-pass",
  "validation://contract-spine-01/git-diff-check-pass",
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

  const evidence = writeArtifact("contract-spine-01-node-execution-contract-closeout.json", {
    artifactKind: "execution_platform.contract_spine_01_node_execution_contract_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Canonical NodeExecutionContract is implemented as the payload-backed source of executable semantics. NodeExecutionPacket stores contract ref/version/hash; worker invocation requires hydrated contract, node packet, and domain resource bodies; graph metadata is manifest-only for contracts; split-child inheritance preserves parent executable semantics through ContractOverridePacket; scheduler progress, bridge handoffs, readiness, and Work Queue readback preserve contract refs without storing raw contract bodies in graph metadata.",
    completedCapabilities: [
      "node_execution_contract_schema",
      "node_execution_contract_manifest",
      "node_execution_packet_contract_refs",
      "worker_invocation_hydrated_contract_gate",
      "resource_materialization_contract_artifact",
      "split_child_contract_inheritance",
      "contract_override_packet",
      "graph_metadata_contract_body_rejection",
      "contract_ref_readback_projection",
      "bridge_contract_handoff",
    ],
    forbiddenPathsRetired: [
      "graph_metadata_carries_executable_contract_body",
      "worker_dispatch_without_hydrated_contract",
      "node_packet_contract_ref_mismatch_reaches_provider",
      "split_child_drops_parent_execution_intent",
      "split_child_changes_capability_by_runtime_guess",
      "split_child_drops_validation_or_evidence_requirements",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts",
        result: "passed",
        testFilesPassed: 8,
        testsPassed: 86,
      },
      {
        command:
          "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.ts extensions/execution-platform/src/codex-bridge/coding-team-implementation-bridge.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/execution-read-model.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    residuals: [
      "The dynamic agent-team graph production fixture still stops after staged graph acceptance with open mission commitments. That residual is upstream of contract materialization and remains assigned to later scheduler/context/replay proof work.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_ids_refs_hashes_bounds_storage_lifecycle_locks_tool_execution_validation_readiness_projection_worker_dispatch",
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
    graphRef: "runtime-contract://execution-platform/node-execution-contract/v1",
    ownerReadbackRef: `${sourceSpecRef}#implementation-evidence-2026-05-25`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:contract-spine-01-closeout",
    reasonCodes: [
      "contract_spine_01_node_execution_contract_implemented",
      "node_execution_contract_payload_backed",
      "worker_gate_requires_hydrated_contract_packet_resource",
      "graph_metadata_manifest_only_contract_enforced",
      "split_child_contract_inheritance_tested",
      "contract_ref_readback_projected",
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
          "NodeExecutionContract spine is closed; ResourceRequirementPacket compiler is the next contract-spine boundary.",
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
