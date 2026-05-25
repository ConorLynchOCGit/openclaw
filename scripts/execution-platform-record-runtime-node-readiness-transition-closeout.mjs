#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const completedItemId = "openclaw-convergence.runtime-node-readiness-transition-engine";
const nextItemId = "openclaw-convergence.active-queue-34";
const proofRef = ".artifacts/execution-platform/runtime-node-readiness-transition/proof.json";

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
        "Runtime Node Readiness Transition Engine implemented and wired into runAfterAdd, run_node, closeout-node, and parallel frontier execution. Accepted graph nodes now pass dependency/context/resource transition gates before worker invocation; missing context creates runtime-owned prerequisites; direct approve-and-run is retired from production flow.",
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
        "Promoted after Runtime Node Readiness Transition Engine focused proof passed.",
      dependsOnCompleted: [completedItemId],
      preProofReadinessRefs: [proofRef],
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
    LIMIT 10
  `,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      completedItemId,
      nextItemId,
      proofRef,
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
