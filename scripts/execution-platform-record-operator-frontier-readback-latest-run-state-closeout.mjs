#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/operator-frontier-readback-latest-run-state",
);
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.operator-frontier-readback-latest-run-state";
const nextItemId = "openclaw-convergence.product-spec-large-graph-storage-scheduler-lane";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "operator_frontier_readback_latest_run_state_closeout",
  schemaVersion: "execution-platform.operator-frontier-readback-latest-run-state-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Operator Frontier Readback And Latest Run State is implemented. Scheduler progress now writes a compact execution_platform.latest_run_state artifact on every progress boundary, latest-run-state includes active frontier/branch/no-progress/throttle summaries, and Work Queue readback projects and agreement-checks that compact state against scheduler frontier events.",
  codeRefs: [
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "scripts/execution-platform-run-operator-frontier-readback-latest-run-state-proof.mjs",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/DECISIONS.md",
  ],
  proofRefs: [
    ".artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/observability/latest-run-state.test.ts",
    "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "node scripts/execution-platform-run-operator-frontier-readback-latest-run-state-proof.mjs",
  ],
  nextGate:
    "Large Graph Storage And Scheduler Lane should run next before Product/Spec proof so graph payloads stay out of metadata.",
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
        ".artifacts/execution-platform/operator-frontier-readback-latest-run-state/closeout.json",
        ".artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json",
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
        "Operator latest-run-state/readback is lane-proven; large graph storage and scheduler payload lane is the next pre-proof blocker.",
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
        ".artifacts/execution-platform/operator-frontier-readback-latest-run-state/closeout.json",
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
