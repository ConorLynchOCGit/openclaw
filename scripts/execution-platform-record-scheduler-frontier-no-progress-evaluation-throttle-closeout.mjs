#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle",
);
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle";
const nextItemId = "openclaw-convergence.operator-frontier-readback-latest-run-state";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "scheduler_frontier_no_progress_evaluation_throttle_closeout",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Scheduler Frontier, No-Progress, And Evaluation Throttle is implemented. Production coding-team scheduler construction now prefers ready executable frontiers before orchestrator expansion, reused-only graph decisions produce no-progress signatures and halt on repetition, context-only Mission Ledger evaluation is throttled unless closure claims or explicit evaluation requests are present, and Work Queue active graph readback projects frontier/no-progress/throttle state.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "scripts/execution-platform-run-scheduler-frontier-no-progress-evaluation-throttle-proof.mjs",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/roadmap.md",
  ],
  proofRefs: [
    ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "node scripts/execution-platform-run-scheduler-frontier-no-progress-evaluation-throttle-proof.mjs",
  ],
  nextGate:
    "Operator Frontier Readback And Latest Run State should run next before Product/Spec proof.",
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
};

await mkdir(artifactDir, { recursive: true });
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
        ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/closeout.json",
        ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json",
      ],
      completionSummary: closeout.implementationSummary,
      validationRefs: closeout.validationRefs,
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
        "Scheduler frontier, no-progress, and Mission Ledger evaluation throttle are lane-proven; operator latest-run-state/readback is the next pre-proof blocker.",
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
        ".artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/closeout.json",
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
