#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const completedItemId =
  "openclaw-convergence.control-plane-05-resource-materialization-worker-gate";
const nextItemId = "openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";
const readinessSpecRef =
  "docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md";
const executionIntentSpecRef =
  "docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md";

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 16,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 93,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    result: "passed",
    testFilesPassed: 3,
    testsPassed: 182,
  },
  {
    command:
      "node scripts/execution-platform-run-scheduler-frontier-no-progress-evaluation-throttle-proof.mjs",
    result: "passed",
  },
  {
    command:
      "pnpm tsgo:fast extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts scripts/execution-platform-run-scheduler-frontier-no-progress-evaluation-throttle-proof.mjs",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
  },
];

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
  };
}

async function executionPlatformRuntime() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function closeItem(sql, itemId, metadata, now) {
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'closed',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz,
          closed_at = COALESCE(closed_at, $2::timestamptz)
      WHERE work_item_id = $3
    `,
    [JSON.stringify(metadata), now, itemId],
  );
}

async function main() {
  const api = await executionPlatformRuntime();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({
    applyMigrations: false,
  });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const artifactRef = writeArtifact("resource-materialization-worker-gate-closeout.json", {
    artifactKind: "execution_platform.resource_materialization_worker_gate_closeout",
    completedItemId,
    nextItemId,
    sourceSpecRef,
    governingSpecRefs: [sourceSpecRef, workIntentSpecRef, readinessSpecRef, executionIntentSpecRef],
    implementedSurfaces: [
      "read_only_resource_packet_contract",
      "coding_resource_packet_source_edit_gate",
      "hydrated_domain_resource_packet_worker_gate",
      "file_edit_node_execution_packet_required_not_bypassable",
      "intent_evidence_resource_kind_conflict_block",
      "source_edit_snapshot_or_new_file_intent_required",
      "source_edit_validation_ref_or_discovery_required",
      "read_only_changed_file_evidence_conflict_block",
      "node_packet_owner_readback_execution_intent_evidence_mode",
    ],
    forbiddenPathsRetired: [
      "implementation_node_metadata_false_bypasses_node_execution_packet",
      "manifest_only_resource_ref_reaches_worker_invocation",
      "source_grounding_read_only_work_counts_as_changed_file_implementation",
      "resource_packet_kind_mismatch_reaches_provider_call",
      "context_freshness_implies_source_edit_snapshots",
    ],
    validationCommands,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_bounds_storage_lifecycle_tool_execution_policy_readiness_transitions_worker_gate",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  });

  const commonMetadata = {
    completedBy: "codex",
    completedAt: now,
    sourceSpecRef,
    governingSpecRefs: [sourceSpecRef, workIntentSpecRef, readinessSpecRef, executionIntentSpecRef],
    completionArtifactRefs: [artifactRef.path],
    validationCommands,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
  };

  await closeItem(
    sql,
    completedItemId,
    {
      ...commonMetadata,
      lifecycleMutationKind: "resource_materialization_worker_gate_closeout",
      nextActiveReason:
        "Resource materialization worker gate is closed; next pre-proof blocker is one Product/Spec-derived worker small-verb edit smoke.",
      completionSummary:
        "Resource materialization worker gate implemented. Source-edit worker dispatch now requires a hydrated NodeExecutionPacket plus matching coding resource packet with snapshots/new-file intent and validation readiness. Read-only/source-grounding work has a first-class read-only resource packet and cannot be treated as changed-file implementation evidence.",
    },
    now,
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived', 'superseded') THEN queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        nextActiveReason:
          "Resource materialization worker gate is closed; next pre-proof blocker is one Product/Spec-derived worker small-verb edit smoke.",
        dependsOnCompleted: [completedItemId],
        preProofReadinessRefs: [artifactRef.path],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "worker_small_verb_edit_smoke_next_active_marker",
      }),
      now,
      nextItemId,
    ],
  );

  const rows = await sql.query(
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
        ok: true,
        completedItemId,
        nextItemId,
        artifactRef,
        topActiveItems: rows.rows,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      },
      null,
      2,
    ),
  );

  await runtime.close?.();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
