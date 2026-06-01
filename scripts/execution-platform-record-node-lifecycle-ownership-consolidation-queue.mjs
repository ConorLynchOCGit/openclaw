#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md",
  "docs/projects/execution-platform/specs/node-lifecycle-transition-runner.md",
  "docs/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision.md",
  "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/DECISIONS.md",
];

const ownershipItem = {
  id: "openclaw-convergence.node-lifecycle-transition-ownership-consolidation",
  rank: 160,
  title: "Node Lifecycle Transition Ownership Consolidation",
  description:
    "Make NodeLifecycleTransitionRunner the only production owner of node-local lifecycle transitions. Pull resource focus, resource demand open, specialist narrowing, resource ledger readiness, domain resource selection, domain action gate, worker action, post-action validation, evidence closure, root-cause collapse, and readback gate projection under runner-owned handlers. Delete or rewrite direct prompt-only proof paths, duplicate tool dialects, worker-local lifecycle menus, readback inference, replay inference, and helper-module lifecycle ownership instead of adding compatibility layers.",
  itemType: "platform_hardening",
  scope: [
    "resource_focus_runner_handler",
    "resource_demand_open_runner_handler",
    "specialist_narrowing_runner_handler",
    "resource_ledger_ready_runner_handler",
    "domain_resource_selection_runner_handler",
    "domain_action_gate_runner_handler",
    "worker_action_runner_handler",
    "post_action_validation_runner_handler",
    "evidence_closure_runner_handler",
    "node_lifecycle_root_cause_runner_handler",
    "readback_from_node_lifecycle_projection",
    "direct_lifecycle_provider_path_deletion",
    "duplicate_tool_dialect_deletion",
    "helper_modules_contract_compiler_only",
    "worker_tool_menu_from_projection_only",
    "manifest_metadata_payload_backed",
  ],
  successGate:
    "No production or closure proof path can advance lifecycle model turns outside NodeLifecycleTransitionRunner. Helper modules are contract/compiler/parser/validator libraries only. Worker prompts expose only NodeLifecycleProjection.nextLegalTransitions. Readback firstOpenGate comes from runner projection or root-cause artifact. Duplicate resource-selection dialects and direct prompt-only lifecycle proofs are deleted or diagnostic-only. A real middle-lane proof reaches evidence or a precise runner root cause without global scheduler repair, broad graph-level context scout fanout, context synthesis, broad worker tools, or metadata overflow.",
};

const preProofOrder = [
  ownershipItem.id,
  "openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor",
  "openclaw-convergence.product-spec-planning-domain-profile-respec",
  "openclaw-convergence.domain-resource-small-verb-tool-surface",
  "openclaw-convergence.capability-manifest-domain-lifecycle-upgrade",
  "openclaw-convergence.proof-framework-executor-subject-split",
  "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
  "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate",
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
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    if (!fs.existsSync(resolvedPath)) {
      continue;
    }
    for (const line of fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/u)) {
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
    path: path.relative(root, absolutePath),
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

function ownershipMetadata() {
  return {
    artifactKind: "execution_platform.node_lifecycle_transition_ownership_queue_item",
    sourceSpecRefs,
    beforeProductSpecProof: true,
    priorityClass: "P0",
    tranche: "node_lifecycle_transition_ownership_consolidation",
    scope: ownershipItem.scope,
    successGate: ownershipItem.successGate,
    explicitDecisions: {
      standaloneLifecycleProofScripts: "bias_delete_or_rewrite_runner_driven",
      legacyResourceSelectionAliases: "delete_from_production_and_closure_proofs",
      directProviderCallsUnderScripts: "fail_for_lifecycle_proof_replay_closeout_paths",
      helperModules: "contract_compiler_parser_validator_only",
      queueShape: "single_p0_consolidation_before_remaining_pre_proof_items",
    },
    requiredRegressionTests: [
      "direct_lifecycle_provider_calls_blocked_outside_model_router_adapters",
      "descriptor_tool_registry_conformance",
      "resource_focus_transition_runner_owned",
      "resource_demand_open_transition_runner_owned",
      "specialist_narrowing_transition_runner_owned",
      "domain_resource_selection_transition_runner_owned",
      "domain_action_gate_transition_runner_owned",
      "worker_prompt_forbidden_tools_absent_by_projection_gate",
      "post_action_validation_transition_runner_owned",
      "evidence_closure_transition_runner_owned",
      "readback_first_open_gate_from_node_lifecycle_projection",
      "stale_replay_topology_negative_evidence_only",
      "manifest_payload_overflow_guard",
      "real_middle_lane_runner_driven_model_proof",
    ],
    semanticJudgmentOwner:
      "model_or_human_authored_focus_relevance_resource_selection_action_plan_patch_semantics_sufficiency_review_and_closeout_judgment",
    runtimeAuthority:
      "schemas_refs_hashes_manifests_payload_storage_authority_budgets_lifecycle_transitions_validation_execution_evidence_structure_readback_projection_and_no_progress_collapse",
    deterministicSemanticJudgmentAllowed: false,
    runtimeMayChooseSemanticResourceRelevance: false,
    compatibilityFallbackAllowed: false,
    duplicateLifecycleAuthorityAllowed: false,
    domainResourceSelectionRunnerAllowed: false,
    directLifecycleProviderProofPathCanCloseWorkItem: false,
    metadataManifestPayloadBacked: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "node_lifecycle_transition_ownership_insert_and_rerank",
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
        VALUES ($1, $2, $3, $4, 'draft', 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
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
        ownershipItem.id,
        ownershipItem.itemType,
        ownershipItem.title,
        ownershipItem.description,
        ownershipItem.rank,
        JSON.stringify(ownershipMetadata()),
        now,
      ],
    );

    for (const [index, id] of preProofOrder.entries()) {
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
          ownershipItem.rank + index,
          JSON.stringify({
            preProductSpecProofOrder: index + 1,
            orderedByNodeLifecycleOwnershipConsolidation: true,
            requiredPredecessorItemIds: index === 0 ? [] : preProofOrder.slice(0, index),
            sourceSpecRefs,
            workQueueLifecycleMutated: true,
            lifecycleMutationKind: "node_lifecycle_transition_ownership_preproof_rerank",
          }),
          now,
          id,
        ],
      );
    }

    const activeRows = await sql.query(
      `
        SELECT work_item_id
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    const managedIds = new Set(preProofOrder);
    const remaining = activeRows.rows
      .map((row) => row.work_item_id)
      .filter((id) => !managedIds.has(id));
    for (const [index, id] of [...preProofOrder, ...remaining].entries()) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              updated_at = $2::timestamptz
          WHERE work_item_id = $3
            AND queue_status IN ('active','blocked','needs_review')
        `,
        [ownershipItem.rank + index, now, id],
      );
    }

    const topRows = await sql.query(
      `
        SELECT work_item_id, title, queue_status, lifecycle_state, queue_rank
        FROM execution_platform.work_items
        WHERE queue_status IN ('active','blocked','needs_review')
          AND work_item_id LIKE 'openclaw-convergence.%'
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
        LIMIT 24
      `,
    );

    const artifact = writeArtifact("node-lifecycle-transition-ownership-queue-update.json", {
      artifactKind: "execution_platform.node_lifecycle_transition_ownership_queue_update",
      databaseName: runtime.resolution.databaseName,
      sourceSpecRefs,
      insertedItemId: ownershipItem.id,
      preProofOrder,
      topActiveItems: topRows.rows,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: true,
      lifecycleMutationKind: "node_lifecycle_transition_ownership_insert_and_rerank",
    });

    await sql.query("COMMIT");
    console.log(JSON.stringify({ ok: true, artifact, topActiveItems: topRows.rows }, null, 2));
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
