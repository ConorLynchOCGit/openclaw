#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const specItemId = "openclaw-convergence.control-plane-01-spec-reconciliation";
const completedItemId = "openclaw-convergence.control-plane-02-workintent-contract-compiler";
const nextItemId =
  "openclaw-convergence.control-plane-03-context-synthesis-retirement-replay-alignment";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/work-intent.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    result: "passed",
    testFilesPassed: 4,
    testsPassed: 140,
  },
  {
    command:
      "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/work-intent.ts extensions/execution-platform/src/workflows/work-intent.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/post-synthesis-graph-policy.ts extensions/execution-platform/src/workflows/cost-aware-capability-policy.ts extensions/execution-platform/src/workflows/index.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
  },
];

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
  };
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function closeItem(sql, itemId, metadata, now) {
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = 'closed',
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [JSON.stringify(metadata), now, itemId],
  );
}

async function main() {
  const api = await ep();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const artifactRef = writeArtifact("workintent-contract-compiler-closeout.json", {
    artifactKind: "execution_platform.workintent_contract_compiler_closeout",
    completedItemId,
    specItemId,
    nextItemId,
    sourceSpecRef,
    workIntentSpecRef,
    implementedSurfaces: [
      "work_intent_contract_schema",
      "runtime_work_intent_compiler",
      "staged_scheduler_work_unit_to_work_intent_compile",
      "non_runnable_work_intent_readiness",
      "scheduler_work_intent_tools",
      "capability_policy_work_intent_manifest_support",
      "post_synthesis_policy_work_intent_manifest_support",
      "focused_no_semantic_cheats_regression",
    ],
    validationCommands,
    semanticJudgmentOwner: "model",
    runtimeAuthority: "schema_refs_bounds_storage_lifecycle_tool_execution_policy_validation",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
  });

  const commonMetadata = {
    completedBy: "codex",
    completedAt: now,
    sourceSpecRef,
    governingSpecRefs: [sourceSpecRef, workIntentSpecRef],
    completionArtifactRefs: [artifactRef.path],
    validationCommands,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: true,
  };

  await closeItem(
    sql,
    specItemId,
    {
      ...commonMetadata,
      lifecycleMutationKind: "control_plane_spec_reconciliation_closeout",
      completionSummary:
        "Control-plane recovery specs, indexes, roadmap, current slice, decisions, and DB queue ranks were reconciled around the WorkIntent-first Product/Spec recovery path.",
    },
    now,
  );

  await closeItem(
    sql,
    completedItemId,
    {
      ...commonMetadata,
      lifecycleMutationKind: "workintent_contract_compiler_closeout",
      completionSummary:
        "WorkIntent contract compiler implemented. Staged scheduler work units now compile into explicit non-runnable WorkIntent control-plane nodes; runtime validates capability compatibility and metadata shape without deterministic semantic guessing; focused scheduler/no-semantic-cheats tests and scoped type validation pass.",
    },
    now,
  );

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived', 'superseded') THEN queue_status
            ELSE 'active'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        nextActiveReason:
          "Spec reconciliation and WorkIntent contract compiler closeouts passed; next pre-proof blocker is retiring default context_synthesis glue and aligning replay with production scheduler-first topology.",
        dependsOnCompleted: [specItemId, completedItemId],
        preProofReadinessRefs: [artifactRef.path],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "context_synthesis_retirement_next_active_marker",
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
        databaseName: runtime.resolution.databaseName,
        completedItemIds: [specItemId, completedItemId],
        nextItemId,
        artifactRef,
        topActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );

  await runtime.pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
