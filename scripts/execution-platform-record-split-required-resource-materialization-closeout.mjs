#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const completedItemId = "openclaw-convergence.split-required-resource-materialization-transition";
const nextItemId = "openclaw-convergence.active-queue-34";
const specRef =
  "docs/projects/execution-platform/specs/split-required-resource-materialization-transition.md";
const proofRef =
  ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json";
const replayResultRef = ".artifacts/execution-platform/product-spec-boundary-replay-result.json";
const unitTestRefs = [
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
  "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts",
  "extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts",
];

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
      completionArtifactRefs: [proofRef, replayResultRef, ...unitTestRefs],
      completionSummary:
        "Split-Required Resource Materialization Transition is implemented and the latest Product/Spec resource-boundary replay passed. Production scheduler hooks treat split_required/resource materialization as a graph transition, broad parent nodes no longer invoke workers directly, context-handoff artifacts can be reconstructed from payload-backed refs, concrete model-authored edit points narrow broad directory/repo seeds, and the failed Product/Spec graph replay materialized two ready NodeExecutionPacket refs without rerunning router, Mission Ledger, packet authoring, graph selection, or context scout.",
      proofStatus: "succeeded",
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
        "Promoted after the latest failed Product/Spec graph replay passed from before-resource-materialization and produced ready NodeExecutionPacket refs. Continue with the full Product/Spec proof from the top and track implementation, validation, evidence claims, readback, closeout, walltime, and token usage.",
      dependsOnCompleted: [completedItemId],
      requiredPreflightProofRefs: [proofRef, replayResultRef],
      remainingKnownBlockers: [],
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
      replayResultRef,
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
