#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.semantic-microtask-refinement-worker-packet-quality";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality.md";
const promptRef =
  "docs/projects/execution-platform/prompts/semantic-microtask-refinement-worker-packet-quality-codex.md";

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

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const metadata = {
    artifactKind: "execution_platform.semantic_microtask_worker_packet_quality_work_item",
    sourceSpecRef,
    promptRef,
    beforeProductSpec: true,
    priorityClass: "P0",
    productSpecProofItemId: productSpecItemId,
    blockedProductSpecProofReason:
      "After-resource worker smoke proved worker invocation can hydrate packets, but broad work-intent nodes and repo-scope refs can still become poor non-Codex worker tasks. Product/Spec proof should not continue until executable worker packets require semantic file-change intent or precise context repair.",
    successGate:
      "Boundary replay from the latest failed Product/Spec resource point either compiles Grade A worker-ready packets with file-change intent, target snapshots, validation refs, context refs, and commitment mapping, or blocks before worker invocation with exact missing microtask/context fields. Replay worker edits rollback by default until reviewed.",
    scope: [
      "repo_scope_not_executable_targets",
      "implementation_task_file_change_intents",
      "context_scout_recommended_edit_points_to_worker_intent",
      "post_context_semantic_microtask_refinement_gate",
      "new_file_intent_parent_snapshot_support",
      "accepted_with_limitations_consumer_waiver_gate",
      "boundary_replay_worker_smoke_rollback_default",
      "work_queue_owner_readback_packet_quality_blocker",
    ],
    dependsOn: [
      "openclaw-convergence.demand-driven-context-broker-lazy-readiness",
      "openclaw-convergence.readback-projection-replay-boundary-expansion",
      "openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_insert_and_reprioritize",
  };

  await sql.query(
    `
      INSERT INTO execution_platform.work_items (
        work_item_id,
        item_type,
        title,
        description,
        queue_status,
        queue_rank,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'platform_hardening',
        $2,
        $3,
        'active',
        0,
        $4::jsonb,
        $5::timestamptz,
        $5::timestamptz
      )
      ON CONFLICT (work_item_id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [
      workItemId,
      "Semantic Microtask Refinement And Worker Packet Quality",
      "Require model-authored semantic file-change intent and precise context/resource readiness before non-Codex implementation workers can edit from Product/Spec-class graphs.",
      JSON.stringify(metadata),
      now,
    ],
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        blockedByWorkItemIds: [workItemId],
        productSpecProofSequencing: "after_semantic_microtask_worker_packet_quality_replay",
        sourceSpecRef,
        promptRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
      }),
      now,
      productSpecItemId,
    ],
  );

  const rows = await sql.query(
    `
      SELECT work_item_id, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const ids = rows.rows.map((row) => row.work_item_id);
  const remaining = ids.filter((id) => id !== workItemId && id !== productSpecItemId);
  const reordered = ids.includes(productSpecItemId)
    ? [workItemId, productSpecItemId, ...remaining]
    : [workItemId, ...remaining];

  const baseRank =
    rows.rows.reduce((lowest, row) => {
      const rank = Number(row.queue_rank);
      return Number.isFinite(rank) && rank > 0 ? Math.min(lowest, rank) : lowest;
    }, Number.POSITIVE_INFINITY) || 1;

  for (const [index, id] of reordered.entries()) {
    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            updated_at = $2::timestamptz
        WHERE work_item_id = $3
          AND queue_status IN ('active','blocked','needs_review')
      `,
      [baseRank + index, now, id],
    );
  }

  const topRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank,
             metadata->>'priorityClass' AS priority_class,
             metadata->>'beforeProductSpec' AS before_product_spec
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );

  const artifactRef = writeArtifact("semantic-microtask-worker-packet-quality-queue.json", {
    artifactKind: "semantic_microtask_worker_packet_quality_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    promptRef,
    workItemId,
    productSpecItemId,
    topActiveItems: topRows.rows,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "queue_item_insert_and_reprioritize",
  });

  console.log(JSON.stringify({ ok: true, artifactRef, topActiveItems: topRows.rows }, null, 2));

  if (typeof runtime.close === "function") {
    await Promise.race([runtime.close(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
}
