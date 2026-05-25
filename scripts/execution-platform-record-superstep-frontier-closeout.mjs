#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/superstep-frontier-runtime-branch-results",
);
const completedItemId = "openclaw-convergence.superstep-frontier-runtime-branch-results";
const nextItemId = "openclaw-convergence.readback-projection-replay-boundary-expansion";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "superstep_frontier_runtime_branch_results_closeout",
  schemaVersion: "execution-platform.superstep-frontier-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Superstep Frontier Runtime and Branch Results are live in the production scheduler. Parallel frontier execution now produces canonical branch results, records open/branch-result/join scheduler tool traces, isolates branch failures while preserving sibling evidence, halts systemic sibling failures with a root cause, and surfaces branch blocker/next-transition/readiness/evidence state in latest-run-state and Work Queue readback.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/workflows/index.ts",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md",
    "docs/projects/execution-platform/prompts/superstep-frontier-runtime-branch-results-codex.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/index.ts",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms canonical branch results are produced inside the production parallel frontier runner, tool traces cover open/result/join, branch status classification uses structured runtime signals rather than prompt text, and owner readback exposes branch blocker and next-transition fields.",
    residualRisks: [
      "Hot-path readback still scans runtime events/artifacts more than the final target; that is the next queued Readback Projection And Replay Boundary Expansion item.",
      "Replay from arbitrary superstep/resource boundaries is not complete in this item; it remains queued next.",
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
        ".artifacts/execution-platform/superstep-frontier-runtime-branch-results/closeout.json",
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
        "Superstep Frontier Runtime and branch results are complete; readback projection and replay boundary expansion is the next pre-proof item.",
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
        ".artifacts/execution-platform/superstep-frontier-runtime-branch-results/closeout.json",
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

await Promise.race([runtime.close?.(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
process.exit(0);
