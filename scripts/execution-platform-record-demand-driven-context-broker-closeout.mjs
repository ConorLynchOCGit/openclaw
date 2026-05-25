#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/demand-driven-context-broker-lazy-readiness",
);
const completedItemId = "openclaw-convergence.demand-driven-context-broker-lazy-readiness";
const nextItemId = "openclaw-convergence.expansion-controller-dynamic-fanout-admission";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "demand_driven_context_broker_lazy_readiness_closeout",
  schemaVersion: "execution-platform.demand-driven-context-broker-closeout.v1",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Demand-driven context broker and lazy readiness are live in the production dynamic coding-team runner. Blocked NodeReadinessState values now compile to payload-backed execution_platform.context_broker.request artifacts, context broker runtime tools are registered, scheduler progress/latest-run-state/Work Queue readback surface broker refs/status/dedupe/consumer/transition state, and implementation remains blocked until canonical readiness is executable.",
  codeRefs: [
    "extensions/execution-platform/src/workflows/context-broker.ts",
    "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/observability/latest-run-state.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
  ],
  docsRefs: [
    "docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md",
    "docs/projects/execution-platform/prompts/demand-driven-context-broker-lazy-readiness-codex.md",
    "docs/projects/execution-platform/CURRENT_SLICE.md",
    "docs/projects/execution-platform/STATUS.md",
    "docs/projects/execution-platform/roadmap.md",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/context-broker.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/workflows/index.ts",
  ],
  deepCompletionReview: {
    status: "accepted",
    summary:
      "Code review confirms the context broker is generic, payload-backed, contract-registered, emitted by production implementation readiness, recorded as a runtime tool operation when the kernel is present, and visible in owner-facing readback without embedding broker bodies in scheduler progress metadata.",
    residualRisks: [
      "The broker does not yet enforce global expansion budgets or branch-superstep execution. Those are the next queued items.",
      "Context-scout dispatch remains branch-local request evidence at this layer; actual fanout/admission policy belongs to Expansion Controller and Superstep Frontier Runtime.",
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
        ".artifacts/execution-platform/demand-driven-context-broker-lazy-readiness/closeout.json",
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
        "Demand-driven context broker and lazy readiness are complete; expansion controller and dynamic fanout admission is the next pre-proof frontier item.",
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
        ".artifacts/execution-platform/demand-driven-context-broker-lazy-readiness/closeout.json",
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
