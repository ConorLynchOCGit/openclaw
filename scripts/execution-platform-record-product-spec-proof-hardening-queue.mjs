#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";
const supersededReplayItemId = "openclaw-convergence.contract-spine-10-replay-proof";

const governingSpecRefs = [proofHardeningSpecRef, contractSpineSpecRef];

const runtimeMayOnlyValidate = [
  "payload_body_presence",
  "candidate_membership",
  "ref_hash_epoch_schema_version_match",
  "provider_model_task_class_compatibility",
  "input_budget_bounds",
  "required_consumer_edges",
  "capability_manifest_conformance",
  "validation_phase_compatibility",
  "authority_surface_retirement",
];

const runtimeMustNotJudge = [
  "semantic_file_relevance",
  "context_sufficiency_quality",
  "edit_quality",
  "product_spec_special_meaning",
  "qualitative_complexity",
  "model_rationale_persuasiveness",
];

const hardeningItems = [
  {
    id: "openclaw-convergence.proof-hardening-01-replay-production-fidelity-epochs",
    title: "Replay Production Fidelity And Boundary Epochs",
    description:
      "Make replay production-faithful or explicitly diagnostic-only, add boundary epochs, retire stale split children on rematerialization, and make terminal replay scripts exit cleanly.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#1-replay-production-fidelity-and-boundary-epochs`,
    scope: [
      "production_equivalent_replay_paths",
      "diagnostic_only_replay_labeling",
      "boundary_epoch_contract",
      "stale_child_retirement",
      "split_child_supersession",
      "terminal_script_lifecycle",
      "replay_readback_epoch_projection",
    ],
    successGate:
      "Replay from completed packets/resource materialization follows production topology, never injects default synthesis, retires stale children, exits without live Node handles after terminal JSON, and passes authority-surface retirement plus generic replay-sentinel fixtures.",
  },
  {
    id: "openclaw-convergence.proof-hardening-02-target-selection-router-budget",
    title: "Resource/Target Selection Model-Task Router And Payload Budget",
    description:
      "Make resource selection a first-class model-task boundary, with coding target selection as one specialization, coherent provider routing, canonical telemetry, candidate-handle payload budgeting, field-specific repair, and runtime validation against candidates, authority, capability, WorkIntent, and commitments.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#2-resourcetarget-selection-model-task-router-and-payload-budget`,
    scope: [
      "model_task_client_router",
      "resource_selection_packet_boundary",
      "target_selection_packet_specialization",
      "qwen_openrouter_provider_route",
      "codex_provider_route_without_telemetry_contradiction",
      "resource_selection_payload_budget",
      "candidate_handle_manifest",
      "field_specific_resource_selection_repair",
      "authority_scope_validation",
      "neutral_resource_selection_fixture",
    ],
    successGate:
      "Resource/target selection either runs through the intended provider path with non-contradictory telemetry and bounded input, or blocks before provider invocation with exact provider/payload reason codes; runtime validates membership/authority/capability/schema only and never scores resource usefulness.",
  },
  {
    id: "openclaw-convergence.proof-hardening-03-context-repair-requirements",
    title: "Context Repair Requirement Compiler",
    description:
      "Compile every context repair node from a consumer-aware ResourceRequirementPacket and context broker request, wire consumer edges, and keep diagnostic-only context nodes from unlocking implementation.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#3-context-repair-requirement-compiler`,
    scope: [
      "context_repair_requirement_packet",
      "context_broker_request_for_repair",
      "consumer_aware_context_edges",
      "diagnostic_only_context_nodes",
      "context_repair_runtime_compiler",
      "context_scout_execution_block_without_requirement",
    ],
    successGate:
      "The known failed context repair node compiles and executes only with a ResourceRequirementPacket and declared consumer; zero-edge production context repair is rejected; graph/scheduler repair cannot bypass ResourceRequirementPacket authority.",
  },
  {
    id: "openclaw-convergence.proof-hardening-04-readiness-child-upsert",
    title: "Readiness Recompute, Stale-Child Upsert, And Frontier Eligibility",
    description:
      "Make recomputed readiness authoritative, mark persisted readiness stale on hash/epoch mismatch, and add split-child upsert/supersede semantics so stale children cannot appear executable.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#4-readiness-recompute-stale-child-upsert-and-frontier-eligibility`,
    scope: [
      "readiness_recompute_authority",
      "persisted_readiness_stale_fields",
      "contract_hash_readiness_match",
      "resource_hash_readiness_match",
      "boundary_epoch_frontier_eligibility",
      "split_child_upsert",
      "split_child_supersede",
    ],
    successGate:
      "Focused and replay tests prove persisted ready cannot overrule recomputed blocked/limited state and rematerialization cannot leave duplicate active stale children; readiness recomputation remains ref/hash/epoch/lifecycle based only.",
  },
  {
    id: "openclaw-convergence.proof-hardening-05-reviewable-patch-artifacts",
    title: "Reviewable Action/Patch Artifact Spine",
    description:
      "Persist hydrateable generic ActionReviewArtifact records plus the coding WorkerEditReviewArtifact specialization for applied, rolled-back, rejected, failed, and validation-failed actions so proof can review the actual bounded action/diff after rollback.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#5-reviewable-actionpatch-artifact-spine`,
    scope: [
      "action_review_artifact",
      "worker_edit_review_artifact",
      "bounded_diff_payload_ref",
      "rollback_review_artifact",
      "diff_hash_readback",
      "validation_ref_linking",
      "evidence_claim_linking",
      "work_queue_patch_review_projection",
      "neutral_action_review_fixture",
    ],
    successGate:
      "A rollback-mode worker smoke persists a stable review artifact that can be hydrated by ref and reviewed without relying on workspace residue or embedded graph metadata; a neutral ActionReviewArtifact fixture proves the spine is not coding-only.",
  },
  {
    id: "openclaw-convergence.proof-hardening-06-worker-smoke-matrix",
    title: "Multi-Child Worker Smoke Matrix",
    description:
      "Run contract-hydrated worker smokes over at least three Product/Spec-derived child classes: model-task/runtime, workflow/plugin, and Work Queue/readback/proof-review.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#6-multi-child-worker-smoke-matrix`,
    scope: [
      "worker_smoke_model_task_runtime_child",
      "worker_smoke_workflow_plugin_child",
      "worker_smoke_readback_review_child",
      "worker_smoke_valid_no_edit_blocker_child",
      "forced_patch_author_boundary",
      "structural_validation_default",
      "evidence_from_validation",
      "rollback_review_artifact",
      "typed_failure_classification",
      "neutral_worker_executor_fixture",
    ],
    successGate:
      "At least three different materialized child nodes either produce scoped edits with validation/evidence/review artifacts or return precise upstream blockers with typed failure classes; at least one valid no-edit blocker path and one neutral executor/domain-resource fixture must pass.",
  },
  {
    id: "openclaw-convergence.proof-hardening-07-adversarial-entry-suite",
    title: "Adversarial Proof Entry Suite",
    description:
      "Run the negative proof-entry suite for stale children, missing contract bodies, context repair without requirements, target-selection over budget, limitation waivers, rollback review, sibling failure isolation, and provider-route mismatch.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${proofHardeningSpecRef}#7-adversarial-proof-entry-suite`,
    scope: [
      "stale_child_replay_negative_test",
      "missing_contract_body_negative_test",
      "context_repair_without_requirement_negative_test",
      "target_selection_over_budget_negative_test",
      "accepted_with_limitations_without_waiver_negative_test",
      "worker_edit_rollback_review_negative_test",
      "sibling_branch_failure_isolation_negative_test",
      "provider_routing_contradiction_negative_test",
      "semantic_lexical_trap_negative_test",
      "non_coding_domain_fixture_negative_test",
      "capability_manifest_default_trap_negative_test",
    ],
    successGate:
      "The substrate fails safely on all known dangerous cases before the top-to-bottom Product/Spec proof is allowed to start, including lexical traps that must not affect runtime behavior unless typed contracts/manifests change.",
  },
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

async function executionPlatformApi() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
}

async function upsertWorkItem(sql, item, rank, now) {
  const metadata = {
    artifactKind: "execution_platform.product_spec_proof_hardening_work_item",
    sourceSpecRef: proofHardeningSpecRef,
    governingSpecRefs,
    specSectionRef: item.specSectionRef,
    beforeProductSpec: true,
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    supersedesBroadReplayItemId: supersededReplayItemId,
    scope: item.scope,
    successGate: item.successGate,
    semanticJudgmentOwner:
      "model_authored_target_selection_context_sufficiency_patch_quality_and_review_judgment",
    runtimeAuthority:
      "schema_ids_refs_bounds_provider_routing_payload_budget_lifecycle_epochs_readiness_validation_execution_readback",
    authoritySurfaceRetirementGate: "required",
    generalitySentinel: "required",
    capabilityManifestConformance: "required_for_executable_nodes",
    deterministicSemanticJudgmentAllowed: false,
    noComplexityBudgetSemanticScoring: true,
    runtimeMayOnlyValidate,
    runtimeMustNotJudge,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "product_spec_proof_hardening_queue_insert_or_reprioritize",
  };

  await sql.query(
    `
      INSERT INTO execution_platform.work_items (
        work_item_id,
        item_type,
        title,
        description,
        queue_status,
        queue_rank,
        metadata,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6::jsonb, $7::timestamptz, $7::timestamptz)
      ON CONFLICT (work_item_id) DO UPDATE
      SET item_type = EXCLUDED.item_type,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          queue_status = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          queue_rank = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived')
              THEN execution_platform.work_items.queue_rank
            ELSE EXCLUDED.queue_rank
          END,
          metadata = COALESCE(execution_platform.work_items.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = EXCLUDED.updated_at
    `,
    [item.id, item.itemType, item.title, item.description, rank, JSON.stringify(metadata), now],
  );
}

async function main() {
  const api = await executionPlatformApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const rankRows = await sql.query(
    `
      SELECT work_item_id, queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
    `,
    [[supersededReplayItemId, productSpecItemId]],
  );
  const rankById = new Map(
    rankRows.rows.map((row) => [row.work_item_id, Number(row.queue_rank)]),
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const replayRank = rankById.get(supersededReplayItemId);
  const productRank = rankById.get(productSpecItemId);
  const baseRank = Number.isFinite(replayRank)
    ? replayRank
    : Number.isFinite(productRank)
      ? productRank
      : Number(fallbackRows.rows[0]?.rank ?? 1);

  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_status = CASE
            WHEN queue_status IN ('closed', 'archived') THEN queue_status
            ELSE 'superseded'
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = $2::timestamptz
      WHERE work_item_id = $3
    `,
    [
      JSON.stringify({
        sourceSpecRef: proofHardeningSpecRef,
        governingSpecRefs,
        supersededByWorkItemIds: hardeningItems.map((item) => item.id),
        retainedAs: "decomposed_proof_hardening_parent",
        supersessionReason:
          "First contract-hydrated worker smoke proved worker viability but exposed multiple proof-entry/control-plane gates too broad for one replay-proof item.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "broad_replay_item_superseded_by_granular_tranche",
      }),
      now,
      supersededReplayItemId,
    ],
  );

  for (const [index, item] of hardeningItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, now);
  }

  const newProductRank = baseRank + hardeningItems.length;
  await sql.query(
    `
      UPDATE execution_platform.work_items
      SET queue_rank = CASE
            WHEN queue_status IN ('active','blocked','needs_review') THEN $1
            ELSE queue_rank
          END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
          updated_at = $3::timestamptz
      WHERE work_item_id = $4
    `,
    [
      newProductRank,
      JSON.stringify({
        sourceSpecRef: proofHardeningSpecRef,
        governingSpecRefs,
        blockedByProofHardeningWorkItemIds: hardeningItems.map((item) => item.id),
        productSpecProofSequencing: "after_proof_hardening_worker_boundary_suite",
        contractSpineRequired: true,
        beforeProductSpec: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_proof_hardening",
      }),
      now,
      productSpecItemId,
    ],
  );

  const managedIds = [...hardeningItems.map((item) => item.id), productSpecItemId];
  const activeRows = await sql.query(
    `
      SELECT work_item_id
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
    `,
  );
  const managedSet = new Set(managedIds);
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSet.has(id) && id !== supersededReplayItemId);
  const normalized = [...managedIds, ...remaining];

  for (const [index, id] of normalized.entries()) {
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

  const topRows = await sql.query(
    `
      SELECT
        work_item_id,
        title,
        queue_status,
        queue_rank,
        metadata->>'priorityClass' AS priority_class,
        metadata->>'beforeProductSpec' AS before_product_spec,
        metadata->>'sourceSpecRef' AS source_spec_ref,
        metadata->>'retainedAs' AS retained_as
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 40
    `,
  );

  const supersededRows = await sql.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank, metadata->>'retainedAs' AS retained_as
      FROM execution_platform.work_items
      WHERE work_item_id = $1
    `,
    [supersededReplayItemId],
  );

  const artifactRef = writeArtifact("product-spec-proof-hardening-queue-update.json", {
    artifactKind: "product_spec_proof_hardening_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    proofHardeningSpecRef,
    contractSpineSpecRef,
    governingSpecRefs,
    productSpecItemId,
    supersededReplayItemId,
    baseRank,
    productRank: newProductRank,
    proofHardeningItemIds: hardeningItems.map((item) => item.id),
    topActiveItems: topRows.rows,
    supersededItem: supersededRows.rows[0] ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "product_spec_proof_hardening_queue_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseName: runtime.resolution.databaseName,
        artifactRef,
        supersededItem: supersededRows.rows[0] ?? null,
        topActiveItems: topRows.rows,
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
