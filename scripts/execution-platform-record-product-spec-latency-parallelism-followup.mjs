#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.product-spec-proof-latency-parallelism";
const productSpecItemId = "openclaw-convergence.active-queue-34";

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
  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const existingRows = await sql.query(
    "SELECT queue_rank, queue_status FROM execution_platform.work_items WHERE work_item_id = $1",
    [workItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank),1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const productRank = Number(productRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);
  const targetRank = productRank + 1;
  const existingRank = Number(existingRows.rows[0]?.queue_rank ?? 0);
  const existingPlaced =
    existingRows.rows[0]?.queue_status === "active" && existingRank === targetRank;

  if (!existingPlaced) {
    await sql.query(
      "UPDATE execution_platform.work_items SET queue_rank = queue_rank + 1, updated_at = $1::timestamptz WHERE queue_status IN ('active','blocked','needs_review') AND queue_rank >= $2 AND work_item_id <> $3",
      [now, targetRank, workItemId],
    );
  }

  const metadata = {
    artifactKind: "execution_platform.product_spec_latency_parallelism_work_item",
    source: "product_spec_proof_latency_and_parallelism_spec",
    recommendedBeforeProductSpec: false,
    recommendedImmediatelyAfterProductSpec: true,
    priorityClass: "P1",
    productSpecProofItemId: productSpecItemId,
    scope: [
      "packet_author_review_parallelism",
      "context_scout_parallel_fanout",
      "single_context_synthesis_join",
      "scheduler_runnable_set_supersteps",
      "file_validation_provider_locks",
      "non_codex_scoped_worker_parallelism",
      "retry_only_failed_branch",
      "work_queue_parallel_group_readback",
      "boundary_replay_checkpoints",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };

  await sql.query(
    "INSERT INTO execution_platform.work_items (work_item_id,item_type,title,description,queue_status,queue_rank,metadata,created_at,updated_at) VALUES ($1,'platform_hardening',$2,$3,'active',$4,$5::jsonb,$6::timestamptz,$6::timestamptz) ON CONFLICT (work_item_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, queue_status=CASE WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded') THEN execution_platform.work_items.queue_status ELSE 'active' END, queue_rank=EXCLUDED.queue_rank, metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at",
    [
      workItemId,
      "Product/Spec Proof Latency Reduction And Parallel Runtime Follow-Up",
      "Reduce Product/Spec proof wall-clock latency through packet/context/worker parallelism, scheduler supersteps, branch retry, and Work Queue parallel readback without weakening evidence gates.",
      targetRank,
      JSON.stringify(metadata),
      now,
    ],
  );

  const rows = await sql.query(
    "SELECT work_item_id,title,queue_status,queue_rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review') ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC LIMIT 12",
  );
  const queueRef = writeArtifact("product-spec-latency-parallelism-work-queue-update.json", {
    artifactKind: "product_spec_latency_parallelism_work_queue_update",
    databaseName: runtime.resolution.databaseName,
    productSpecItemId,
    workItemId,
    targetRank,
    topActiveItems: rows.rows,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  });

  console.log(JSON.stringify({ ok: true, queueRef, topActiveItems: rows.rows }, null, 2));
  await runtime.close?.();
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
