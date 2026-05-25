#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const completedItemId =
  "openclaw-convergence.control-plane-03-context-synthesis-retirement-replay-alignment";
const nextItemId = "openclaw-convergence.control-plane-04-node-scoped-context-readiness";
const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    result: "passed",
    testFilesPassed: 3,
    testsPassed: 107,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/boundary-replay-checkpoints.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts",
    result: "passed",
    testFilesPassed: 2,
    testsPassed: 46,
  },
  {
    command:
      "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/codex-bridge/product-spec-boundary-replay-topology.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs",
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

  const artifactRef = writeArtifact("context-synthesis-retirement-closeout.json", {
    artifactKind: "execution_platform.context_synthesis_retirement_closeout",
    completedItemId,
    nextItemId,
    sourceSpecRef,
    workIntentSpecRef,
    implementedSurfaces: [
      "production_scheduler_post_synthesis_workintent_only_compile",
      "context_synthesis_direct_executable_compile_retired",
      "field_specific_post_synthesis_workintent_diagnostics",
      "boundary_replay_after_graph_selection_node_scoped_context_required",
      "after_context_synthesis_diagnostic_only",
      "dynamic_runner_context_synthesis_coordination_only_prompt",
      "focused_no_semantic_cheats_regression",
    ],
    forbiddenPathsRetired: [
      "context_synthesis_group_to_implementation_node",
      "accepted_context_synthesis_as_after_graph_selection_readiness",
      "runtime_semantic_inference_from_synthesis_group_prose",
      "post_synthesis_executable_graph_runtime_compile",
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
    completedItemId,
    {
      ...commonMetadata,
      lifecycleMutationKind: "context_synthesis_retirement_closeout",
      completionSummary:
        "Default context_synthesis glue is retired from the coding-team production and replay success paths. Accepted synthesis can only produce coordination evidence or explicit non-runnable WorkIntent nodes with model-authored execution intent and capability selection; after-graph-selection replay now requires node-scoped context.",
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
          "Context-synthesis default glue is retired; next pre-proof blocker is node-scoped context broker and canonical readiness enforcement.",
        dependsOnCompleted: [completedItemId],
        preProofReadinessRefs: [artifactRef.path],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawDbRowsStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "node_scoped_context_readiness_next_active_marker",
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
        completedItemId,
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
