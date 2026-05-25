#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  ".artifacts/execution-platform/runtime-artifact-contract-registry",
);
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.runtime-artifact-contract-registry-payload-boundary";
const nextItemId = "openclaw-convergence.scheduler-frontier-no-progress-evaluation-throttle";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "runtime_artifact_contract_registry_closeout",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Runtime Artifact Contract Registry And Payload Boundary is implemented. Registered packet, context, resource, worker, and generic runtime-result body artifacts now require payload-backed contract attachment, low-level direct metadata writes are rejected for registered body-bearing types, replay/readback hydrates through contract refs, and contract attachment emits bounded runtime events.",
  codeRefs: [
    "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    "extensions/execution-platform/src/runtime-job-repository.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
    "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.ts",
    "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    "scripts/execution-platform-run-context-scout-tool-loop-proof.mjs",
    "scripts/execution-platform-run-context-scout-model-comparison.mjs",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.test.ts extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.ts extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.test.ts extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs scripts/execution-platform-run-context-scout-tool-loop-proof.mjs scripts/execution-platform-run-context-scout-model-comparison.mjs extensions/execution-platform/src/index.ts",
  ],
  nextGate:
    "Scheduler Frontier, No-Progress, And Evaluation Throttle should run next before the Product/Spec proof.",
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
        ".artifacts/execution-platform/runtime-artifact-contract-registry/closeout.json",
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
        "Artifact body storage contracts are enforced; scheduler frontier/no-progress/evaluation throttling is the next pre-proof stabilization blocker.",
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
        ".artifacts/execution-platform/runtime-artifact-contract-registry/closeout.json",
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
