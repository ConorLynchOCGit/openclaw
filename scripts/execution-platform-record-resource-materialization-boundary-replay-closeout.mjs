#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const completedItemId =
  "openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness";
const nextItemId = "openclaw-convergence.active-queue-34";
const proofRef =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";
const latestStateRef =
  ".artifacts/execution-platform/latest-run-state-native-exec-78e1b33861780884.json";
const specRef =
  "docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md";

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
      sourceSpecRef: specRef,
      completionArtifactRefs: [proofRef, latestStateRef],
      completionSummary:
        "Resource Materialization Boundary Replay And Canonical Node Readiness is implemented and lane-proven. before-resource-materialization replay preserves precise non-worker context blockers without rerunning upstream phases; after-resource-materialization replay hydrated four payload-backed implementation nodes as executable with zero blockers.",
      nextProofItemId: nextItemId,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
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
        "Promoted after the resource materialization replay boundary passed against the failed Product/Spec graph. Resume from the nearest executable frontier first, then rerun from the top after implementation progress is validated.",
      dependsOnCompleted: [completedItemId],
      requiredPreflightProofRefs: [proofRef, latestStateRef],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
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
      proofRef,
      latestStateRef,
      topActiveItems: rows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    },
    null,
    2,
  ),
);

await runtime.close?.();
process.exit(0);
