#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/large-graph-storage-scheduler-lane",
);
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.product-spec-large-graph-storage-scheduler-lane";
const nextItemId = "openclaw-convergence.mission-ledger-stability-diagnostics";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "large_graph_storage_scheduler_lane_closeout",
  schemaVersion: "execution-platform.large-graph-storage-scheduler-lane-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Large Graph Storage And Scheduler Lane is implemented and lane-proven. Resource materialization results and node readiness states are contract-backed payload artifacts, live scheduler progress has manifest-only contract coverage, graph metadata accepts bounded context snapshot refs without becoming a payload store, upstream context snapshot node metadata is sampled with counts/truncation flags, and the synthetic 90-node/100-edge lane proof executed the ready implementation frontier branch while all large bodies stayed out of metadata.",
  codeRefs: [
    "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    "extensions/execution-platform/src/runtime-job-repository.test.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "scripts/execution-platform-run-large-graph-storage-scheduler-lane-proof.mjs",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/large-graph-storage-and-scheduler-lane.md",
    "docs/projects/execution-platform/specs/pre-product-spec-proof-stabilization-plan.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/specs/index.md",
  ],
  proofRefs: [".artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json"],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
    "node scripts/execution-platform-run-large-graph-storage-scheduler-lane-proof.mjs",
    "pnpm tsgo:fast extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  ],
  nextGate:
    "Mission Ledger Stability Diagnostics should run next to measure ledger/packet variance and provider no-content/rescue behavior before Product/Spec proof.",
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
        ".artifacts/execution-platform/large-graph-storage-scheduler-lane/closeout.json",
        ".artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json",
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
        "Large graph storage/scheduler lane is complete; Mission Ledger Stability Diagnostics is the next pre-proof diagnostic gate.",
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
        ".artifacts/execution-platform/large-graph-storage-scheduler-lane/closeout.json",
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
