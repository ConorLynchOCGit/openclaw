#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/readback-projection-replay-boundary-expansion",
);
const completedItemId = "openclaw-convergence.readback-projection-replay-boundary-expansion";
const nextItemId = "openclaw-convergence.active-queue-34";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "readback_projection_replay_boundary_expansion_closeout",
  schemaVersion: "execution-platform.readback-replay-boundary-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Readback Projection and Replay Boundary Expansion is live in the production runtime/readback path. Boundary replay uses explicit structural checkpoint dependencies rather than enum order; resource materialization records canonical before/after checkpoints; latest-run-state and Work Queue readback surface boundary replay state from compact manifests; and the Product/Spec replay harness records canonical boundary checkpoint artifacts for resource-materialization proof points.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md",
    "docs/projects/execution-platform/prompts/readback-projection-replay-boundary-expansion-codex.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms replay planning is runtime-owned and structural, resource-materialization checkpoints are produced in the production dynamic runner before worker invocation, Work Queue readback can recover boundary state from compact latest-run-state without boundary events, and replay harness checkpoints now use the canonical boundary replay service.",
    residualRisks: [
      "The next Product/Spec proof may still expose worker/context quality failures; those are outside this item and should be diagnosed at their failing boundary.",
      "Boundary replay coverage now includes resource materialization and worker invocation; future workflow plugins should register workflow-specific resource boundary proofs as they move to production.",
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
        ".artifacts/execution-platform/readback-projection-replay-boundary-expansion/closeout.json",
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
        "Readback/replay boundary expansion is complete; Product/Spec replay/full proof is the next pre-proof gate.",
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
        ".artifacts/execution-platform/readback-projection-replay-boundary-expansion/closeout.json",
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
