#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.architecture-red-team-research-gate";
const nextExistingItemId = "openclaw-convergence.pre-product-spec-01-context-scout-tool-loop";

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
  const rankRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [nextExistingItemId],
  );
  const existingRows = await sql.query(
    "SELECT queue_rank, queue_status FROM execution_platform.work_items WHERE work_item_id = $1",
    [workItemId],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank),1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const nextRank = Number(rankRows.rows[0]?.queue_rank ?? fallbackRows.rows[0]?.rank ?? 1);
  const existingRank = Number(existingRows.rows[0]?.queue_rank ?? 0);
  const existingIsAlreadyPlaced =
    existingRows.rows[0]?.queue_status === "active" &&
    existingRank > 0 &&
    (!Number.isFinite(nextRank) || existingRank < nextRank);
  const targetRank = existingIsAlreadyPlaced ? existingRank : nextRank;

  if (!existingIsAlreadyPlaced) {
    await sql.query(
      "UPDATE execution_platform.work_items SET queue_rank = queue_rank + 1, updated_at = $1::timestamptz WHERE queue_status IN ('active','blocked','needs_review') AND queue_rank >= $2 AND work_item_id <> $3",
      [now, targetRank, workItemId],
    );
  }

  const metadata = {
    artifactKind: "execution_platform.architecture_red_team_gate_work_item",
    source: "architecture_red_team_and_research_gate_spec",
    recommendedBeforeProductSpec: true,
    priorityClass: "P0",
    gateLevels: ["level_0", "level_1", "level_2", "level_3"],
    nextExistingPreProofItemId: nextExistingItemId,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };

  await sql.query(
    "INSERT INTO execution_platform.work_items (work_item_id,item_type,title,description,queue_status,queue_rank,metadata,created_at,updated_at) VALUES ($1,'architecture_red_team_gate',$2,$3,'active',$4,$5::jsonb,$6::timestamptz,$6::timestamptz) ON CONFLICT (work_item_id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, queue_status=CASE WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded') THEN execution_platform.work_items.queue_status ELSE 'active' END, queue_rank=EXCLUDED.queue_rank, metadata=EXCLUDED.metadata, updated_at=EXCLUDED.updated_at",
    [
      workItemId,
      "Architecture Red-Team And Research Gate",
      "Implement the reusable architecture red-team and research gate as a first-class pre-proof workflow and Codex/OpenClaw operating discipline.",
      targetRank,
      JSON.stringify(metadata),
      now,
    ],
  );

  const rows = await sql.query(
    "SELECT work_item_id,title,queue_status,queue_rank FROM execution_platform.work_items WHERE work_item_id IN ($1,$2,'openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools','openclaw-convergence.pre-product-spec-03-mission-packet-graph-lane','openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity','openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke','openclaw-convergence.active-queue-34') ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC",
    [workItemId, nextExistingItemId],
  );

  const queueRef = writeArtifact("architecture-red-team-gate-work-queue-update-proof.json", {
    artifactKind: "architecture_red_team_gate_work_queue_update_proof",
    databaseName: runtime.resolution.databaseName,
    targetRank,
    idempotentPlacement: existingIsAlreadyPlaced,
    updatedItems: rows.rows,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const summaryRef = writeArtifact("architecture-red-team-gate-summary.json", {
    artifactKind: "architecture_red_team_gate_summary",
    status: "queued",
    nextRecommendedWorkItemId: workItemId,
    docsRefs: [
      "workspace:docs/projects/execution-platform/specs/architecture-red-team-and-research-gate.md",
      "repo:docs/projects/execution-platform/specs/architecture-red-team-and-research-gate.md",
    ],
    artifactRefs: [queueRef.ref],
    rawPromptStored: false,
    rawResponseStored: false,
  });

  console.log(JSON.stringify({ ok: true, queueRef, summaryRef, updatedItems: rows.rows }, null, 2));
  await runtime.close?.();
  process.exit(0);
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
