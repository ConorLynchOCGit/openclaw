#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const completedItemId = "openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke";
const nextItemId = "openclaw-convergence.control-plane-07-readback-telemetry-proof";

const proofArtifactPath =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";

const validationCommands = [
  {
    command:
      'pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts -- -t "refreshes truncated prior snapshots|hydrates multiple distant target windows"',
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 2,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 37,
  },
  {
    command:
      "pnpm tsgo:fast -- extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-contracts.ts",
    result: "passed",
  },
  {
    command:
      "node scripts/execution-platform-run-product-spec-boundary-replay.mjs --runtime-job-id native-exec-272cf2d51fcba75b --graph-id product-spec-replay-f69b40c5defa3687 --boundary after-resource-materialization --execute-workers --target-node-id g-bdd8590b57-g-bdd8590b-implementation-g0-source-spec-intake-10d0edafe5:task:1 --max-iterations 1",
    result: "passed",
  },
  {
    command:
      "git diff --check -- extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/file-edit-worker-contracts.ts",
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

  const closeout = writeArtifact("worker-small-verb-edit-smoke-closeout.json", {
    artifactKind: "execution_platform.worker_small_verb_edit_smoke_closeout",
    schemaVersion: "execution-platform.worker-small-verb-edit-smoke-closeout.v1",
    completedItemId,
    nextItemId,
    runtimeJobId: "native-exec-272cf2d51fcba75b",
    graphId: "product-spec-replay-f69b40c5defa3687",
    boundary: "after-resource-materialization",
    selectedNodeId:
      "g-bdd8590b57-g-bdd8590b-implementation-g0-source-spec-intake-10d0edafe5:task:1",
    proofArtifactPath,
    implementedSurfaces: [
      "explicit_file_ref_normalization_for_worker_plans",
      "single_target_structural_default_for_targetless_plan",
      "forced_patch_author_after_accepted_edit_plan",
      "large_file_multi_window_snapshot_materialization",
      "runtime_structural_validation_default_after_patch",
      "runtime_compiled_evidence_claim_from_validation",
      "rollback_after_review_artifact_worker_persistence",
    ],
    proofSummary:
      "Product/Spec-derived source-edit node executed through the small-verb worker loop, received hydrated NodeExecutionPacket/resource/context/task packet refs, applied one scoped edit through forced patch authoring, ran structural validation, recorded commitment evidence, and rolled back the changed file for review.",
    validationCommands,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_bounds_storage_lifecycle_tool_execution_readiness_validation_evidence_and_rollback",
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
    completionArtifactRefs: [closeout.path, proofArtifactPath],
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
      lifecycleMutationKind: "worker_small_verb_edit_smoke_closeout",
      completionSummary:
        "Worker small-verb edit smoke passed. One Product/Spec-derived source-edit node ran through context/tool selection, edit planning, forced patch authoring, runtime patch application, structural validation, evidence claim recording, and rollback-after-review.",
      nextActiveReason:
        "Worker small-verb edit smoke is closed; next pre-proof blocker is owner-facing readback and telemetry proof.",
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
          "Worker small-verb edit smoke is closed; next pre-proof blocker is owner-facing readback and telemetry proof.",
        dependsOnCompleted: [completedItemId],
        preProofReadinessRefs: [closeout.path, proofArtifactPath],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "owner_readback_telemetry_proof_next_active_marker",
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
        closeout,
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
