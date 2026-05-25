#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const completedItemId = "openclaw-convergence.scheduler-readiness-state-unification";
const nextItemId = "openclaw-convergence.product-spec-replay-proof-resource-materialization";
const proofRef = ".artifacts/execution-platform/scheduler-readiness-state-unification/proof.json";

const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
const sql = runtime.sqlClient;
const now = new Date().toISOString();

await sql.query(
  `
    UPDATE execution_platform.work_items
    SET queue_status = 'closed',
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
        updated_at = $2::timestamptz
    WHERE work_item_id = $3
  `,
  [
    JSON.stringify({
      completedBy: "codex",
      completedAt: now,
      completionArtifactRefs: [proofRef],
      completionSummary:
        "Scheduler Readiness State Unification completed. NodeReadinessState is now the canonical readiness object for resource materialization, scheduler worker gates, repair transitions, progress events, and Work Queue readback.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    }),
    now,
    completedItemId,
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
      nextActiveReason:
        "Promoted after canonical scheduler readiness state landed; replay proof is now the next pre-Product/Spec gate.",
      dependsOnCompleted: [completedItemId],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
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
      topActiveItems: rows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    },
    null,
    2,
  ),
);

await runtime.close?.();
process.exit(0);
