#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRefs = [
  "docs/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment.md",
  "docs/projects/execution-platform/product-spec-planning-production-workflow.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/index.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
];

const items = [
  {
    id: "openclaw-convergence.shared-domain-resource-lifecycle-contract-refactor",
    rank: 160,
    title: "Shared Domain Resource Lifecycle Contract Refactor",
    description:
      "Refactor generic lifecycle contracts from context/coding-shaped terminology to shared domain-resource/action terminology. ResourceObjectiveFocus, NodeResourceDemandSession, NodeResourceLedger, DomainResourceSelection, ProgressiveNodeExecutionPacket, and DomainActionGate become the canonical generic contracts; coding file/window/write terminology becomes a domain mapping, not the generic architecture.",
    itemType: "architecture_refactor",
    scope: [
      "shared_resource_lifecycle_contracts",
      "generic_gate_names_resource_action_based",
      "coding_terms_demoted_to_domain_mapping",
      "manifest_payload_overflow_guards",
      "no_runtime_semantic_relevance_selection",
    ],
    successGate:
      "Generic contracts and docs no longer treat resource_fulfillment, target_selection, write_gate, or worker_action_ready as universal concepts. Runtime still validates only structure, refs, authority, budgets, storage, and lifecycle.",
  },
  {
    id: "openclaw-convergence.product-spec-planning-domain-profile-respec",
    rank: 161,
    title: "Product/Spec Planning Domain Profile Re-Spec",
    description:
      "Rewrite Product/Spec Planning as a workflow domain profile over the shared resource lifecycle. Planning resources include source prompt sections, owner constraints, project facts, research briefs, planning capsules, action graph proposal inputs, compile-readiness inputs, human decisions, and closeout refs. Product/Spec remains proposal authority only and cannot execute child jobs without a later authority boundary.",
    itemType: "architecture_refactor",
    scope: [
      "product_spec_domain_resource_profile",
      "planning_artifact_action_gates",
      "proposal_only_authority_boundary",
      "executor_vs_target_subject_split",
      "planning_readback_gate_taxonomy",
    ],
    successGate:
      "Product/Spec Planning docs, workflow contract, capability profile expectations, and proof predicates describe planning-domain resources and action gates rather than coding write gates or global context supply.",
  },
  {
    id: "openclaw-convergence.domain-resource-small-verb-tool-surface",
    rank: 162,
    title: "Domain Resource Small-Verb Tool Surface",
    description:
      "Define and wire the shared resource lifecycle small-verb tool surface plus coding and Product/Spec Planning domain verbs. Workers and specialist subturns see only legal verbs from NodeLifecycleProjection, with planning verbs for intent records, research brief requests, planning capsule authoring/revision, human decisions, action graph proposals, compile readiness, evidence, and closeout.",
    itemType: "toolification",
    scope: [
      "resource_focus_tools",
      "resource_demand_tools",
      "resource_ledger_tools",
      "domain_resource_selection_tools",
      "domain_action_gate_tools",
      "planning_domain_small_verbs",
      "coding_domain_small_verbs",
      "tool_menu_from_projection_only",
    ],
    successGate:
      "No generic worker or scheduler prompt exposes broad graph mutation or coding-only edit tools outside the current lifecycle gate. Planning nodes receive planning-domain verbs, coding nodes receive coding-domain verbs, and shared resource verbs stay domain-neutral.",
  },
  {
    id: "openclaw-convergence.capability-manifest-domain-lifecycle-upgrade",
    rank: 163,
    title: "Capability Manifest Domain Lifecycle Upgrade",
    description:
      "Upgrade capability manifests so every capability declares domain resource kinds, resource selection contract, action gate type, worker action tools, validation modes, evidence modes, required packet kinds, and lifecycle transition profile. Runtime validates capability structure only and never infers semantic domain fit from substrings.",
    itemType: "platform_hardening",
    scope: [
      "domain_resource_kinds_required",
      "resource_selection_profile_required",
      "domain_action_gate_type_required",
      "worker_action_tool_profile_required",
      "validation_and_evidence_modes_required",
      "capability_manifest_no_semantic_substrings",
    ],
    successGate:
      "Coding and Product/Spec capabilities both bind to the shared lifecycle through manifests. Product/Spec planning capabilities cannot accidentally require file snapshots/write gates, and coding capabilities keep file-edit gates as a coding profile.",
  },
  {
    id: "openclaw-convergence.proof-framework-executor-subject-split",
    rank: 164,
    title: "Proof Framework Executor And Subject Split",
    description:
      "Split Product/Spec proof semantics into two production-faithful proof families: coding executor implementing Product/Spec as target subject, and Product/Spec Planning executor producing planning artifacts. Proof harnesses, readback, admission gates, and run-scoped manifests must reject stale resource_fulfillment, graph-level context_scout fanout, context_synthesis, and component-only proofs as positive evidence.",
    itemType: "proof_hardening",
    scope: [
      "coding_executor_target_subject_proof",
      "product_spec_planning_executor_proof",
      "run_scoped_manifest_truth",
      "stale_context_topology_negative_evidence",
      "proof_readback_from_node_lifecycle_projection",
    ],
    successGate:
      "The proof harness can tell whether Product/Spec is the target of a coding implementation proof or the executor workflow of a planning proof, and each path has distinct closure predicates.",
  },
  {
    id: "openclaw-convergence.product-spec-framework-coding-system-implementation-proof",
    rank: 165,
    title: "Product/Spec Framework Coding-System Implementation Proof",
    description:
      "Run a real Product/Spec framework implementation through the OpenClaw coding system, not direct Codex-only patching. The prompt must execute agent_team.coding with agent_team.product_spec_planning as target subject and implement a meaningful bounded framework slice using resource focus, node-local demand, resource ledger, domain resource selection, action gate, worker action, validation, evidence, review, and closeout.",
    itemType: "proof_hardening",
    scope: [
      "agent_team_coding_executor",
      "product_spec_planning_target_subject",
      "real_framework_source_change",
      "node_local_resource_demand",
      "domain_resource_selection",
      "worker_action_validation_evidence",
      "run_scoped_proof_manifest",
      "changed_file_and_validation_evidence",
    ],
    successGate:
      "The OpenClaw coding system implements at least one real Product/Spec planning framework contract/tool/readback/capability slice and emits changed-file evidence, validation evidence, commitment evidence claims, review, and closeout without broad context/scout/synthesis success paths.",
  },
  {
    id: "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate",
    rank: 166,
    title: "Source Inventory Domain Lifecycle Residue Gate",
    description:
      "Run the final source inventory and residue gate after the coding-system Product/Spec implementation proof. Delete, not disable, any old generic resource_fulfillment, context_scout fanout, context_synthesis, coding-shaped generic gate, fallback, compatibility flag, or stale proof predicate introduced or left behind by the alignment tranche.",
    itemType: "platform_hardening",
    scope: [
      "post_coding_proof_source_inventory",
      "retired_resource_fulfillment_positive_paths_deleted",
      "retired_context_scout_fanout_deleted",
      "retired_context_synthesis_deleted",
      "coding_terms_only_as_domain_mapping",
      "meaningful_loc_reduction_or_zero_residue_report",
    ],
    successGate:
      "Source inventory reports zero production survivors for retired generic context/coding-shaped paths, with any historical references explicitly allowlisted in docs only. No fallback flag can resurrect old proof or runtime behavior.",
  },
];

const finalProof = {
  id: "openclaw-convergence.active-queue-34",
  rank: 167,
  title: "Product/Spec Planning Workflow Plugin Production Proof",
};

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

function metadataFor(item) {
  return {
    artifactKind: "execution_platform.shared_domain_resource_lifecycle_queue_item",
    sourceSpecRefs,
    beforeProductSpecProof: true,
    priorityClass: "P0",
    tranche: "shared_domain_resource_lifecycle_alignment",
    scope: item.scope,
    successGate: item.successGate,
    productSpecProofPlacement:
      "coding_system_framework_implementation_after_items_160_164_before_source_inventory_and_final_full_proof",
    sharedLifecycleRequired: true,
    duplicatePlanningLifecycleAllowed: false,
    compatibilityFallbackAllowed: false,
    deterministicSemanticJudgmentAllowed: false,
    runtimeMayChooseSemanticResourceRelevance: false,
    runtimeAuthority:
      "schemas_refs_hashes_manifests_payload_storage_authority_budgets_lifecycle_locks_validation_execution_evidence_structure_and_readback_projection",
    semanticJudgmentOwner:
      "model_or_human_authored_decomposition_resource_focus_resource_selection_action_content_sufficiency_review_and_closeout",
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
    lifecycleMutationKind: "shared_domain_resource_lifecycle_insert_and_rerank",
  };
}

async function main() {
  loadDotenvFiles();
  const api = await executionPlatformRuntimeApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();
  const managedIds = items.map((item) => item.id);
  const allManagedIds = [...managedIds, finalProof.id];
  const artifactName = "shared-domain-resource-lifecycle-queue-update.json";

  try {
    await sql.query("BEGIN");

    const existing = await sql.query(
      `
        SELECT work_item_id, queue_rank, queue_status
        FROM execution_platform.work_items
        WHERE work_item_id = ANY($1::text[])
        FOR UPDATE
      `,
      [managedIds],
    );
    const alreadyAligned =
      existing.rows.length === items.length &&
      existing.rows.every((row) => {
        const expected = items.find((item) => item.id === row.work_item_id);
        return row.queue_status === "active" && Number(row.queue_rank) === expected?.rank;
      });

    if (!alreadyAligned) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = queue_rank + $1,
              updated_at = $2::timestamptz
          WHERE queue_status IN ('active','blocked','needs_review')
            AND queue_rank >= 160
            AND work_item_id <> ALL($3::text[])
        `,
        [items.length, now, allManagedIds],
      );
    }

    for (const item of items) {
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
          item.id,
          item.itemType,
          item.title,
          item.description,
          item.rank,
          JSON.stringify(metadataFor(item)),
          now,
        ],
      );
    }

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
        finalProof.rank,
        JSON.stringify({
          artifactKind: "execution_platform.product_spec_final_proof_rerank_metadata",
          sourceSpecRefs,
          requiredPredecessorItemIds: managedIds,
          productSpecProofSplit: true,
          finalProofRequiresPriorCodingSystemFrameworkImplementationProof: true,
          noResourceFulfillmentScoutSynthesisPositivePath: true,
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          hiddenReasoningStored: false,
          workQueueLifecycleMutated: true,
          lifecycleMutationKind: "shared_domain_resource_lifecycle_final_proof_rerank",
        }),
        now,
        finalProof.id,
      ],
    );

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

    await sql.query("COMMIT");

    const artifact = writeArtifact(artifactName, {
      artifactKind: "execution_platform.shared_domain_resource_lifecycle_queue_update",
      sourceSpecRefs,
      insertedItems: items.map((item) => ({
        id: item.id,
        rank: item.rank,
        title: item.title,
        successGate: item.successGate,
      })),
      finalProof,
      queueRows: rows.rows,
      productSpecFrameworkImplementationPlacement:
        "rank_165_after_framework_contracts_before_final_source_inventory_and_active_queue_34",
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
    });

    console.log(JSON.stringify({ artifact, queueRows: rows.rows }, null, 2));
  } catch (error) {
    await sql.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
