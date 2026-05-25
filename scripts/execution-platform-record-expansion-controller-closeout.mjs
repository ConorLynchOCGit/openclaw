#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/expansion-controller-dynamic-fanout-admission",
);
const completedItemId = "openclaw-convergence.expansion-controller-dynamic-fanout-admission";
const nextItemId = "openclaw-convergence.superstep-frontier-runtime-branch-results";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "expansion_controller_dynamic_fanout_admission_closeout",
  schemaVersion: "execution-platform.expansion-controller-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Expansion Controller and Dynamic Fanout Admission are live in the production scheduler path. Graph writes now pass through runtime-owned admission before persistence; admission can accept, page, defer behind ready frontier work, or reject budget breaches; prerequisite context/repair graph writes remain structurally admissible; and scheduler progress/latest-run-state/Work Queue readback surface compact admission state without graph bodies.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "extensions/execution-platform/src/workflows/index.ts",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md",
    "docs/projects/execution-platform/prompts/expansion-controller-dynamic-fanout-admission-codex.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/workflows/index.ts",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms admission is production-wired in RuntimeWorkGraphScheduler.applyDecision before graph persistence, is recorded as a scheduler runtime tool, avoids body-bearing progress metadata, preserves no-progress guard ownership for reused-only writes, and exempts structural prerequisite context/repair writes from ready-frontier deferral.",
    residualRisks: [
      "Accepted-paged admission persists the current page and records deferred ids/counts; durable deferred-body replay belongs to the replay/readback expansion item because scheduler graph state should not store full deferred node bodies in metadata.",
      "Parallel branch execution, sibling failure isolation, and branch result joins remain the next queued Superstep Frontier Runtime item.",
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
        ".artifacts/execution-platform/expansion-controller-dynamic-fanout-admission/closeout.json",
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
        "Expansion Controller and dynamic fanout admission are complete; Superstep Frontier Runtime and branch results is the next pre-proof frontier item.",
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
        ".artifacts/execution-platform/expansion-controller-dynamic-fanout-admission/closeout.json",
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
