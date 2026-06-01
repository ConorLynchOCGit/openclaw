#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.executable-spine-03-node-packet-hydration-gate";
const nextItemId = "openclaw-convergence.executable-spine-04-worker-one-edit-canary";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md#5-nodeexecutioncontract-and-nodeexecutionpacket-hydration";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
  "extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "scripts/execution-platform-record-executable-spine-03-closeout.mjs",
];

const validationRefs = [
  "validation://executable-spine-03/node-resource-materialization-scheduler-runtime-dynamic-runner-tests-59-pass",
  "validation://executable-spine-03/runtime-work-graph-scheduler-tests-99-pass",
  "validation://executable-spine-03/focused-suite-158-tests-pass",
  "validation://executable-spine-03/tsgo-fast-pass",
  "validation://executable-spine-03/git-diff-check-pass",
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

  const evidence = writeArtifact("executable-spine-03-node-packet-hydration-closeout.json", {
    artifactKind: "execution_platform.executable_spine_03_node_packet_hydration_closeout",
    workItemId,
    nextItemId,
    sourceSpecRef,
    implementationSummary:
      "Executable Spine 03 hardens NodeExecutionPacket hydration as a production dispatch gate. Runtime now supports coding, read-only, and neutral generic domain resource packets; validates matching contract/packet/resource bodies before worker invocation; records canonical node.execution_packet.validate_hydration and node.execution_packet.block_missing_resource tool invocations; blocks upstream with exact readiness state instead of surfacing missing resources as worker failure; and removes the stale readiness-blocker alias from the registered scheduler tool surface.",
    completedCapabilities: [
      "generic_domain_resource_packet_schema",
      "generic_domain_resource_packet_compiler",
      "generic_domain_hydration_readiness",
      "generic_domain_changed_file_evidence_rejection",
      "canonical_node_execution_packet_validate_hydration_tool",
      "canonical_node_execution_packet_block_missing_resource_tool",
      "production_dynamic_runner_worker_gate_tool_trace",
      "scheduler_resource_materialization_gate_canonical_blocker",
      "stale_record_readiness_blocker_alias_retired",
      "focused_scheduler_and_runner_regressions",
    ],
    forbiddenPathsRetired: [
      "worker_provider_call_without_hydrated_node_execution_packet",
      "worker_provider_call_without_matching_domain_resource_packet_body",
      "generic_domain_packet_claiming_changed_file_evidence",
      "stale_node_record_readiness_blocker_tool_alias",
      "missing_resource_surface_as_worker_failure",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
        result: "passed",
        testFilesPassed: 3,
        testsPassed: 59,
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
          "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts",
        result: "passed",
        testFilesPassed: 4,
        testsPassed: 158,
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
    residuals: [
      "This slice proves hydration and dispatch gating; the next slice must prove one real worker edit from a hydrated packet through the small-verb loop.",
      "Broader Product/Spec proof remains gated behind executable-spine-04, executable-spine-05, and executable-spine-06.",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schemas_refs_hashes_hydration_matching_authority_scope_validation_plan_evidence_mode_readiness_tool_invocation_trace_worker_dispatch_blocking",
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
    graphRef: "runtime-contract://execution-platform/node-execution-packet-hydration/v1",
    ownerReadbackRef: sourceSpecRef,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:executable-spine-03-closeout",
    reasonCodes: [
      "executable_spine_03_node_packet_hydration_gate_implemented",
      "generic_domain_resource_packet_supported",
      "worker_dispatch_requires_hydrated_matching_packets",
      "canonical_node_execution_packet_tools_registered",
      "production_dynamic_runner_hydration_tool_trace_added",
      "scheduler_resource_materialization_gate_canonical_blocker_added",
      "stale_readiness_blocker_alias_retired",
      "focused_validation_passed",
      "scheduler_validation_passed",
      "type_validation_passed",
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
          "NodeExecutionPacket hydration is closed; the next executable-spine item must prove one real small-verb worker edit from a hydrated packet.",
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
        nextActive: rows.rows[0] ?? null,
        nextActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
  await runtime.pool?.end?.();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
