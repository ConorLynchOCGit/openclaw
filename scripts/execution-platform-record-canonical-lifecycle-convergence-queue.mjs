#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision.md",
  "docs/projects/execution-platform/specs/node-lifecycle-transition-runner.md",
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
];

const correctiveItems = [
  {
    id: "openclaw-convergence.lifecycle-authority-collapse-and-runner-wiring",
    rank: 156,
    title: "Lifecycle Authority Collapse And Runner Wiring",
    description:
      "Collapse all node-local lifecycle gate and transition authority into NodeLifecycleTransitionRunner. Delete or demote duplicate transition inference in scheduler readiness, WorkIntent context resolution, capability transition profiles, resource materialization, and scheduler tool registration so the runner is the only owner of next legal local transitions and global-scheduler permission.",
    scope: [
      "node_lifecycle_descriptor_registry",
      "runtime_work_graph_scheduler_readiness_demoted",
      "work_intent_context_resolution_facts_only",
      "capability_profile_descriptor_validation",
      "scheduler_runtime_tool_descriptor_conformance",
      "global_scheduler_blocked_while_local_lifecycle_pending",
    ],
    successGate:
      "No production component outside NodeLifecycleTransitionRunner authors current lifecycle gate, next legal local transition, or canCallGlobalScheduler. Every lifecycle descriptor has a handler, registered runtime tool, capability profile mapping, readback mapping, and regression test.",
  },
  {
    id: "openclaw-convergence.worker-readback-replay-surface-excision",
    rank: 157,
    title: "Worker, Readback, And Replay Surface Excision",
    description:
      "Make worker model-facing tool menus, owner readback, Work Queue active graph progress, and Product/Spec replay consume canonical lifecycle projection and NodeExecutionPacket legal tools only. Delete legacy no-packet worker diagnostic surfaces and retired positive replay paths such as context handoff/scout/synthesis gates.",
    scope: [
      "worker_tool_surface_from_runner_gate",
      "forbidden_tools_absent_from_prompt",
      "readback_from_node_lifecycle_projection",
      "missing_projection_is_missing_runtime_state",
      "stale_replay_topology_negative_evidence",
      "after_resource_handoff_positive_path_deleted",
    ],
    successGate:
      "Worker prompts expose only canonical legal tools for the current gate; readback does not infer from stale nodeReadinessPhase/checkpoint labels; replay cannot count context handoff/scout/synthesis topology as positive closure evidence.",
  },
  {
    id: "openclaw-convergence.lifecycle-residue-inventory-and-no-model-walk",
    rank: 158,
    title: "Lifecycle Residue Inventory And No-Model Walk",
    description:
      "Add a production-zero source inventory gate and a no-model lifecycle walk that proves the canonical path from WorkIntent through evidence or exact root-cause without invoking global graph repair. The pass must produce meaningful cleanup, deleted stale tests, and zero production survivors for retired topology and duplicate lifecycle authority.",
    scope: [
      "production_zero_lifecycle_residue_inventory",
      "deleted_or_rewritten_stale_tests",
      "no_model_workintent_to_evidence_lifecycle_walk",
      "runner_transition_state_hash_progress_gate",
      "manifest_artifact_overflow_guard",
      "measurable_loc_reduction_report",
    ],
    successGate:
      "Source inventory reports zero production survivors for retired lifecycle/context paths; no-model walk reaches evidence or typed root-cause; every transition changes canonical state or terminalizes; metadata remains manifest-only with artifact-backed bodies.",
  },
];

const downstreamRanks = [
  {
    id: "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
    rank: 159,
  },
  {
    id: "openclaw-convergence.active-queue-34",
    rank: 160,
  },
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

function metadataFor(item) {
  return {
    artifactKind: "execution_platform.canonical_lifecycle_convergence_queue_item",
    sourceSpecRefs,
    beforeProductSpec: true,
    priorityClass: "P0",
    correctionTranche: "canonical_lifecycle_convergence",
    closedHistoricalItemsNotReopened: true,
    scope: item.scope,
    successGate: item.successGate,
    requiredRegressionTests: [
      "runner_descriptor_tool_registry_conformance",
      "pending_runner_projection_blocks_global_scheduler",
      "workintent_context_resolution_does_not_author_transitions",
      "capability_profile_rejects_unknown_runner_transition",
      "worker_prompt_omits_forbidden_tools_by_gate",
      "readback_reports_node_lifecycle_projection_gate_exactly",
      "stale_replay_resource_handoff_is_negative_evidence",
      "no_model_lifecycle_walk_reaches_evidence_or_root_cause",
    ],
    semanticJudgmentOwner:
      "model_or_human_authored_focus_target_selection_sufficiency_edit_semantics_and_closeout_judgment",
    runtimeAuthority:
      "schemas_refs_hashes_manifests_payload_storage_authority_budgets_lifecycle_transitions_validation_execution_evidence_structure_and_readback_projection",
    deterministicSemanticJudgmentAllowed: false,
    compatibilityFallbackAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "canonical_lifecycle_convergence_insert_and_rerank",
  };
}

async function main() {
  loadDotenvFiles();
  const api = await executionPlatformRuntimeApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();
  const allManaged = [...correctiveItems, ...downstreamRanks];

  try {
    await sql.query("BEGIN");

    for (const item of correctiveItems) {
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
          item.id,
          item.title,
          item.description,
          item.rank,
          JSON.stringify(metadataFor(item)),
          now,
        ],
      );
    }

    for (const item of downstreamRanks) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = $3::timestamptz
          WHERE work_item_id = $4
            AND queue_status IN ('active','blocked','needs_review')
        `,
        [
          item.rank,
          JSON.stringify({
            blockedByCanonicalLifecycleConvergence: true,
            sourceSpecRefs,
            requiredPredecessorItemIds: correctiveItems.map((entry) => entry.id),
            workQueueLifecycleMutated: true,
            lifecycleMutationKind: "canonical_lifecycle_convergence_downstream_rerank",
          }),
          now,
          item.id,
        ],
      );
    }

    const rows = await sql.query(
      `
        SELECT work_item_id, title, queue_status, lifecycle_state, queue_rank
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
          AND work_item_id LIKE 'openclaw-convergence.%'
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
        LIMIT 20
      `,
    );

    const artifact = writeArtifact("canonical-lifecycle-convergence-queue-update.json", {
      artifactKind: "execution_platform.canonical_lifecycle_convergence_queue_update",
      databaseName: runtime.resolution.databaseName,
      sourceSpecRefs,
      correctiveItemIds: correctiveItems.map((item) => item.id),
      downstreamItemIds: downstreamRanks.map((item) => item.id),
      rankedItemIds: allManaged.map((item) => item.id),
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
      lifecycleMutationKind: "canonical_lifecycle_convergence_insert_and_rerank",
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
