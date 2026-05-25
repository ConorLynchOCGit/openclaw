#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/progress-readback-runtime-event-modularization",
);
const completedItemId =
  "openclaw-convergence.pre-proof-02-progress-readback-runtime-event-modularization";
const nextItemId = "openclaw-convergence.toolification-13-compatibility-retirement-bypass-audit";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "progress_readback_runtime_event_modularization_closeout",
  schemaVersion: "execution-platform.progress-readback-runtime-event-modularization-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Progress, Readback, and Runtime Event Modularization is live in the production Work Queue readback path. execution-read-model now delegates active graph progress and artifact payload manifest readback to tested projection modules for active graph progress, boundary replay, worker-internal progress, model usage/walltime, runtime artifact manifests, and bounded projection utilities.",
  codeRefs: [
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    "extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts",
    "extensions/execution-platform/src/work-queue/projections/worker-internal-progress.ts",
    "extensions/execution-platform/src/work-queue/projections/model-usage-walltime.ts",
    "extensions/execution-platform/src/work-queue/projections/runtime-artifact-manifest.ts",
    "extensions/execution-platform/src/work-queue/projections/projection-utils.ts",
    "extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  ],
  docsRefs: [
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/specs/pre-product-spec-execution-platform-modularization.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts extensions/execution-platform/src/work-queue/projections/model-usage-walltime.ts extensions/execution-platform/src/work-queue/projections/worker-internal-progress.ts extensions/execution-platform/src/work-queue/projections/runtime-artifact-manifest.ts extensions/execution-platform/src/work-queue/projections/projection-utils.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms the Work Queue read model now delegates the former active-graph and payload-manifest monoliths to production projection modules. The tests prove module-level projection, read-model integration stability, latest-run-state agreement coverage, and body-shaped provider diagnostic scrubbing.",
    residualRisks: [
      "Additional subprojection extraction can continue opportunistically during compatibility retirement, but the owner-facing readback hot path no longer requires execution-read-model to own the full active graph projection body.",
      "The next queue item should audit compatibility/bypass surfaces; this pass intentionally preserved public readback shape instead of changing lifecycle semantics.",
    ],
  },
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
};

await mkdir(artifactDir, { recursive: true });
const closeoutPath = path.join(artifactDir, "closeout.json");
await writeFile(closeoutPath, `${JSON.stringify(closeout, null, 2)}\n`, "utf8");

const { createExecutionPlatformDatabaseRuntime } = await tsImport(
  path.join(root, "extensions/execution-platform/src/index.ts"),
  import.meta.url,
);

const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
const sql = runtime.sqlClient;

try {
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
        completionArtifactRefs: [
          ".artifacts/execution-platform/progress-readback-runtime-event-modularization/closeout.json",
        ],
        completionSummary: closeout.implementationSummary,
        validationRefs: closeout.validationRefs,
        deepCompletionReview: closeout.deepCompletionReview,
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
          "Progress/readback modularization is complete; compatibility retirement and middleware bypass audit is the next pre-proof guardrail.",
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
        closeoutPath:
          ".artifacts/execution-platform/progress-readback-runtime-event-modularization/closeout.json",
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
} finally {
  await Promise.race([runtime.close?.(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
}

process.exit(0);
