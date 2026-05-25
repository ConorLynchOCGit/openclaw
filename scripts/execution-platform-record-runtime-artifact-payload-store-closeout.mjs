#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform/runtime-artifact-payload-store");
const closeoutPath = path.join(artifactDir, "closeout.json");
const completedItemId = "openclaw-convergence.runtime-artifact-payload-store-bounded-manifests";
const nextItemId = "openclaw-convergence.active-queue-34";
const now = new Date().toISOString();

const closeout = {
  artifactKind: "runtime_artifact_payload_store_closeout",
  generatedAt: now,
  completedItemId,
  nextItemId,
  implementationSummary:
    "Execution Platform large JSON runtime artifacts now persist through runtime_job_artifact_payloads and bounded runtime_job_artifacts manifests. Implementation/resource/task/node packets are payload-backed in the production dynamic graph runner and boundary replay helper, and Work Queue readback surfaces manifest summaries without hydrating large bodies.",
  codeRefs: [
    "extensions/execution-platform/migrations/0008_runtime_job_artifact_payloads.sql",
    "extensions/execution-platform/src/runtime-job-repository.ts",
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
  ],
  validationRefs: [
    "pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
    "pnpm tsgo:fast extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  ],
  remainingProofGate:
    "Replay the failed Product/Spec resource-storage boundary before the next full top-of-pipe Product/Spec proof.",
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
        ".artifacts/execution-platform/runtime-artifact-payload-store/closeout.json",
      ],
      completionSummary: closeout.implementationSummary,
      remainingProofGate: closeout.remainingProofGate,
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
        "Runtime artifact payload storage is implemented; run the resource-storage boundary replay before full Product/Spec proof.",
      dependsOnCompleted: [completedItemId],
      requiredReplayGate: "product_spec_resource_storage_boundary_replay",
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
      closeoutPath: ".artifacts/execution-platform/runtime-artifact-payload-store/closeout.json",
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
