#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/graphpatch-payload-progress-compaction",
);
const completedItemId = "openclaw-convergence.graphpatch-payload-progress-compaction";
const nextItemId = "openclaw-convergence.demand-driven-context-broker-lazy-readiness";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "graphpatch_payload_progress_compaction_closeout",
  schemaVersion: "execution-platform.graphpatch-payload-progress-compaction-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "GraphPatch payload storage and scheduler progress compaction are live in the production dynamic coding-team runner. Scheduler progress now writes a payload-backed execution_platform.runtime_graph_patch artifact first, stores graph patch refs/counts/hashes/samples in agent_team.scheduler_progress, projects graph patch state into latest-run-state and Work Queue readback, and preserves manifest-only runtime artifact contract enforcement.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/runtime-graph-patch.ts",
    "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md",
    "docs/projects/execution-platform/specs/runtime-work-graph.md",
    "docs/projects/execution-platform/specs/generic-orchestration-runtime.md",
    "docs/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/DECISIONS.md",
    "docs/projects/execution-platform/roadmap.md",
    "docs/projects/execution-platform/specs/index.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/runtime-graph-patch.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/runtime-graph-patch.ts extensions/execution-platform/src/workflows/runtime-graph-patch.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/work-queue/execution-read-model.ts",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms the production attachProgress path now writes graph-patch bodies through the runtime artifact contract payload path, progress/readback use compact manifests, body-bearing graph state is not embedded in scheduler_progress, and tests prove payload-backed graph patches are emitted by the dynamic runner.",
    residualRisks: [
      "This item does not yet implement demand-driven context brokerage, expansion admission, superstep branch execution, or replay boundary expansion; those are the next queued items.",
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
        ".artifacts/execution-platform/graphpatch-payload-progress-compaction/closeout.json",
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
        "GraphPatch payload/progress compaction is complete; demand-driven context broker and lazy readiness is the next pre-proof frontier item.",
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
        ".artifacts/execution-platform/graphpatch-payload-progress-compaction/closeout.json",
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
