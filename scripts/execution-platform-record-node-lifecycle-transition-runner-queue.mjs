#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const lifecycleRunnerItem = {
  id: "openclaw-convergence.node-lifecycle-transition-runner-spine",
  title: "Node Lifecycle Transition Runner Spine",
  description:
    "Add the authoritative NodeLifecycleTransitionRunner and NodeLifecycleProjection spine so local node lifecycle transitions drain before the global scheduler/orchestrator can repair graph shape. Replace scheduler-local post-resource helper logic, stop planned-only eligibility, extend capability transition profiles, and make readback consume runner projections.",
  scope: [
    "NodeLifecycleTransitionRunner",
    "NodeLifecycleProjection",
    "capability_lifecycle_transition_profile",
    "requestValidDecision_pending_lifecycle_assertion",
    "replace_tryAdvancePostResourceWorkIntentLifecycle",
    "non_terminal_needs_review_lifecycle_eligibility",
    "readback_from_node_lifecycle_projection",
    "no_progress_after_transition_evaluation",
    "context_focus_to_demand_runner_handler",
    "node_resource_demand_to_specialist_narrowing_runner_handler",
    "target_selection_runner_handler",
    "write_gate_validation_evidence_runner_handlers",
  ],
  successGate:
    "Scheduler cannot call the global orchestrator while any NodeLifecycleProjection has canCallGlobalScheduler=false or pending local transitions; needs_review nodes with resource_demand_open still advance; accepted focus opens demand; broad focus invokes specialist narrowing; stale blockers cannot override newer accepted artifacts; readback reports the runner gate exactly.",
  modelTest:
    "Replay a Product/Spec-class middle-lane boundary where WorkIntent advances through focus, node-local demand, specialist narrowing if needed, ledger, target selection, write gate, validation/evidence or precise lifecycle blocker before global graph repair is legal.",
};

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/node-lifecycle-transition-runner.md",
  "docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md",
  "docs/projects/execution-platform/specs/generic-orchestration-runtime.md",
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md",
  "docs/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary.md",
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
];

const orderedAfterLifecycle = [
  "openclaw-convergence.product-spec-proof-substrate-scrub-run-scoped-closure",
  "openclaw-convergence.gateway-submit-oom-diagnostics-memory-guard",
  "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
  "openclaw-convergence.active-queue-34",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function parseDotenvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }
  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return key ? [key, value] : null;
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const parsed = parseDotenvLine(line);
      if (parsed && !process.env[parsed[0]]) {
        process.env[parsed[0]] = parsed[1];
      }
    }
  }
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const absolutePath = path.join(artifactDir, name);
  fs.writeFileSync(absolutePath, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

async function executionPlatformRuntimeApi() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

function lifecycleRunnerMetadata() {
  return {
    artifactKind: "execution_platform.node_lifecycle_transition_runner_queue_item",
    sourceSpecRefs,
    beforeProductSpec: true,
    priorityClass: "P0",
    architectureTransitionClosureTranche: true,
    scope: lifecycleRunnerItem.scope,
    modelTest: lifecycleRunnerItem.modelTest,
    successGate: lifecycleRunnerItem.successGate,
    requiredSpecUpdates: [
      "node-lifecycle-transition-runner.md",
      "runtime-node-readiness-transition-engine.md",
      "generic-orchestration-runtime.md",
      "operator-frontier-readback-and-latest-run-state.md",
      "runtime-node-capability-registry transition profile fields",
    ],
    requiredRegressionTests: [
      "needs_review_plus_node_resource_demand_open_advances_lifecycle",
      "accepted_focus_automatically_opens_demand",
      "broad_focus_invokes_specialist_narrowing",
      "pending_lifecycle_prevents_global_scheduler_call",
      "stale_blockers_do_not_override_new_accepted_artifacts",
      "readback_reports_node_lifecycle_projection_gate_exactly",
      "capability_transition_profile_rejects_unregistered_lifecycle_tool",
      "non_coding_domain_resource_kind_fixture_uses_same_runner",
    ],
    semanticJudgmentOwner:
      "model_or_human_authored_intent_focus_resource_relevance_target_selection_sufficiency_patch_semantics_and_closeout_judgment",
    runtimeAuthority:
      "lifecycle_projection_refs_hashes_manifests_payload_storage_authority_budgets_transition_legality_no_progress_collapse_validation_and_readback_projection",
    deterministicSemanticJudgmentAllowed: false,
    runtimeMayChooseRelevantRefs: false,
    globalSchedulerMayRunWithPendingLocalLifecycleTransition: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "node_lifecycle_transition_runner_insert_and_rerank",
  };
}

async function main() {
  loadDotenvFiles();
  const api = await executionPlatformRuntimeApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  try {
    await sql.query("BEGIN");
    const rankRows = await sql.query(
      `
        SELECT COALESCE(MIN(queue_rank), 1) AS rank
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
           OR work_item_id = ANY($1::text[])
      `,
      [[lifecycleRunnerItem.id, ...orderedAfterLifecycle]],
    );
    const baseRank = Number(rankRows.rows[0]?.rank ?? 1);

    await sql.query(
      `
        INSERT INTO execution_platform.work_items (
          work_item_id,
          item_type,
          title,
          description,
          lifecycle_state,
          queue_status,
          queue_rank,
          metadata,
          created_at,
          updated_at
        )
        VALUES ($1, 'platform_hardening', $2, $3, 'draft', 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
        ON CONFLICT (work_item_id) DO UPDATE
        SET item_type = EXCLUDED.item_type,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            queue_status = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded')
                THEN execution_platform.work_items.queue_status
              ELSE 'active'
            END,
            queue_rank = CASE
              WHEN execution_platform.work_items.queue_status IN ('closed','archived','superseded')
                THEN execution_platform.work_items.queue_rank
              ELSE EXCLUDED.queue_rank
            END,
            metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
      `,
      [
        lifecycleRunnerItem.id,
        lifecycleRunnerItem.title,
        lifecycleRunnerItem.description,
        baseRank,
        JSON.stringify(lifecycleRunnerMetadata()),
        now,
      ],
    );

    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
            updated_at = $2::timestamptz
        WHERE work_item_id = ANY($3::text[])
      `,
      [
        JSON.stringify({
          blockedByNodeLifecycleTransitionRunnerSpine: true,
          nodeLifecycleTransitionRunnerItemId: lifecycleRunnerItem.id,
          sourceSpecRefs,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "downstream_items_blocked_by_node_lifecycle_runner",
        }),
        now,
        orderedAfterLifecycle,
      ],
    );

    const activeRows = await sql.query(
      `
        SELECT work_item_id
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    const managedIds = new Set([lifecycleRunnerItem.id, ...orderedAfterLifecycle]);
    const desiredHead = [lifecycleRunnerItem.id, ...orderedAfterLifecycle];
    const remaining = activeRows.rows
      .map((row) => row.work_item_id)
      .filter((id) => !managedIds.has(id));
    for (const [index, id] of [...desiredHead, ...remaining].entries()) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              updated_at = $2::timestamptz
          WHERE work_item_id = $3
            AND queue_status IN ('active','blocked','needs_review')
        `,
        [baseRank + index, now, id],
      );
    }

    const rows = await sql.query(
      `
        SELECT work_item_id, title, queue_status, queue_rank, lifecycle_state
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
        LIMIT 16
      `,
    );

    const artifact = writeArtifact("node-lifecycle-transition-runner-queue-update.json", {
      artifactKind: "execution_platform.node_lifecycle_transition_runner_queue_update",
      databaseName: runtime.resolution.databaseName,
      sourceSpecRefs,
      itemId: lifecycleRunnerItem.id,
      downstreamItemIds: orderedAfterLifecycle,
      topActiveItems: rows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: true,
      lifecycleMutationKind: "node_lifecycle_transition_runner_insert_and_rerank",
    });

    await sql.query("COMMIT");
    console.log(JSON.stringify({ ok: true, artifact, topActiveItems: rows.rows }, null, 2));
  } catch (error) {
    await sql.query("ROLLBACK");
    throw error;
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
