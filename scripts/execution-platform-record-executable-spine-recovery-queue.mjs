#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRef =
  "docs/projects/execution-platform/specs/control-plane-executable-spine-recovery.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";
const schedulerGateSpecRef =
  "docs/projects/execution-platform/specs/scheduler-workintent-graph-demand-context-gate.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";
const maxToolificationSpecRef =
  "docs/projects/execution-platform/specs/maximum-toolification-architecture.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";

const governingSpecRefs = [
  sourceSpecRef,
  contractSpineSpecRef,
  schedulerGateSpecRef,
  workIntentSpecRef,
  maxToolificationSpecRef,
];

const runtimeMayOnlyValidate = [
  "schema_presence",
  "registered_enum_membership",
  "capability_manifest_conformance",
  "payload_ref_hash_epoch_match",
  "resource_requirement_consumer_edges",
  "provider_profile_bounds",
  "structural_reshard_unit_membership",
  "node_execution_packet_hydration",
  "authority_and_path_scope",
  "validation_phase_compatibility",
  "evidence_ref_linkage",
  "readback_projection_from_canonical_state",
];

const runtimeMustNotJudge = [
  "semantic_work_intent_quality",
  "capability_fit_quality",
  "context_sufficiency_quality",
  "target_file_relevance",
  "edit_design_quality",
  "commitment_closure_quality",
  "product_spec_specific_meaning",
  "model_rationale_persuasiveness",
];

const workItems = [
  {
    id: "openclaw-convergence.scheduler-workintent-graph-demand-context-gate",
    title: "Executable Spine 01: WorkIntent Acceptance And Capability Manifest Gate",
    description:
      "Broaden the scheduler demand-context gate into the first executable-spine recovery item: accept WorkIntentGraph before context/resource work, bind every intent to a registered capability manifest, reject orphan context scouts and invalid zero-edge graphs, and keep semantic intent model-authored.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#1-workintent-acceptance-and-capability-binding`,
    scope: [
      "workintent_graph_acceptance",
      "capability_manifest_binding",
      "multi_node_zero_edge_rejection",
      "orphan_context_scout_rejection",
      "non_runnable_workintent_lifecycle",
      "no_context_synthesis_default_glue",
      "model_authored_semantic_intent",
    ],
    successGate:
      "Completed-packets replay accepts a WorkIntentGraph only when every node declares semantic intent, capability, target commitments, evidence mode, resource class, and valid dependencies or independent-root rationale; context scouts cannot exist without consumers.",
  },
  {
    id: "openclaw-convergence.executable-spine-02-resource-requirement-reshard",
    title: "Executable Spine 02: ResourceRequirement Compiler And Structural Resharding",
    description:
      "Make context a consumer-bound resource by compiling ResourceRequirementPacket and ContextScoutExecutionPacket before scout execution, then execute exact-preflight structural resharding when payloads exceed provider profile bounds without semantic truncation.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#3-contextrequirementpacket-compiler`,
    scope: [
      "resource_requirement_packet_compiler",
      "context_scout_execution_packet_consumer_binding",
      "exact_provider_input_preflight",
      "structural_reshard_by_commitment_requirement_ref_question_and_window",
      "single_unit_over_profile_blocker",
      "shard_handoff_merge",
      "partial_context_resolution_lifecycle",
    ],
    successGate:
      "The latest over-budget context scout replay structurally shards by declared units and continues to context handoff, or blocks with a precise single-unit-over-profile blocker and next legal transition; no runtime semantic truncation or summarization is used.",
  },
  {
    id: "openclaw-convergence.executable-spine-03-node-packet-hydration-gate",
    title: "Executable Spine 03: NodeExecutionPacket Hydration And Resource Readiness Gate",
    description:
      "Require every executable node to hydrate a NodeExecutionContract, NodeExecutionPacket, and matching domain resource packet before worker dispatch; block missing target snapshots, context refs, validation refs, or evidence mode as upstream readiness failures.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#5-nodeexecutioncontract-and-nodeexecutionpacket-hydration`,
    scope: [
      "node_execution_contract_hydration",
      "node_execution_packet_hydration",
      "domain_resource_packet_binding",
      "coding_target_snapshots_and_windows",
      "validation_ref_or_structural_default",
      "evidence_mode_readiness",
      "worker_dispatch_guard",
    ],
    successGate:
      "No worker provider call can start without a hydrated NodeExecutionPacket and domain resource packet; replay proves missing resources block upstream with exact readiness fields rather than surfacing as worker failure.",
  },
  {
    id: "openclaw-convergence.executable-spine-04-worker-one-edit-canary",
    title: "Executable Spine 04: Worker Small-Verb One-Edit Canary",
    description:
      "Prove one Product/Spec-derived coding worker can execute from a hydrated packet through the small-verb loop, make a bounded source edit, run validation, emit runtime-compiled evidence, and produce a reviewable rollback/persistence artifact.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#6-worker-small-verb-loop`,
    scope: [
      "task_get_brief",
      "snapshot_window_read",
      "worker_edit_plan",
      "forced_patch_author_from_plan",
      "patch_apply_scope_validation",
      "structural_validation_default",
      "evidence_from_validation",
      "reviewable_patch_artifact",
    ],
    successGate:
      "At least one Product/Spec-derived source-edit node makes a real bounded edit through small verbs, runs validation, emits commitment-linked evidence, and records a reviewable artifact; a no-edit node must return a typed upstream blocker instead of pretending success.",
  },
  {
    id: "openclaw-convergence.executable-spine-05-readiness-readback-collapse",
    title: "Executable Spine 05: Branch Readiness, Root-Cause Collapse, And Owner Readback",
    description:
      "Unify branch-scoped readiness, repeated-blocker root-cause collapse, first-open-gate projection, scheduler model-call optics, and latest-run-state readback around canonical runtime state instead of stale checkpoint labels.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#7-branch-scoped-readiness-and-root-cause-collapse`,
    scope: [
      "branch_scoped_readiness_state",
      "sibling_evidence_survival",
      "structural_no_progress_signature",
      "root_cause_artifact",
      "canonical_first_open_gate",
      "scheduler_model_call_envelope_projection",
      "next_legal_transition_readback",
    ],
    successGate:
      "Replay/readback shows the live branch, node, contract, context requirement, blocker, schema/policy path, and next transition; repeated sibling context/materialization blockers collapse once without erasing successful sibling evidence.",
  },
  {
    id: "openclaw-convergence.executable-spine-06-replay-proof-gate",
    title: "Executable Spine 06: Replay Boundary Fidelity And Product/Spec Proof Gate",
    description:
      "Make replay production-faithful across completed-packets, WorkIntent, context requirement, context handoff, resource materialization, worker execution, and post-edit boundaries, then run the bounded replay sequence before the full Product/Spec proof.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#9-replay-strategy`,
    scope: [
      "after_obligation_graph_replay",
      "after_workintent_acceptance_replay",
      "before_resource_requirement_compile_replay",
      "after_resource_handoff_replay",
      "before_resource_materialization_replay",
      "before_worker_execution_replay",
      "after_worker_edit_before_persistence_replay",
      "full_product_spec_proof_admission_gate",
    ],
    successGate:
      "Replay proves the executable spine from completed packets through one worker boundary without default synthesis, stale child resurrection, or proof-only topology; only then may the top-to-bottom Product/Spec proof run.",
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
    artifactKind: "execution_platform.executable_spine_recovery_work_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: item.specSectionRef,
    beforeProductSpec: true,
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    scope: item.scope,
    successGate: item.successGate,
    semanticJudgmentOwner:
      "model_or_human_authored_work_intent_capability_fit_context_sufficiency_target_relevance_edit_quality_and_closeout_judgment",
    runtimeAuthority:
      "schema_ids_refs_hashes_epochs_payload_sharding_lifecycle_authority_validation_execution_readback",
    deterministicSemanticJudgmentAllowed: false,
    noSubstringSemanticClassifiers: true,
    noProductSpecRuntimeShortcut: true,
    smallVerbToolificationRequired: true,
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
    lifecycleMutationKind: "executable_spine_recovery_queue_insert_or_reprioritize",
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
    [
      item.id,
      item.itemType,
      item.title,
      item.description,
      rank,
      JSON.stringify(metadata),
      now,
    ],
  );
}

async function main() {
  const api = await executionPlatformApi();
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const sql = runtime.sqlClient;
  const now = new Date().toISOString();

  const currentFirst = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = $1
    `,
    [workItems[0].id],
  );
  const productRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = $1
    `,
    [productSpecItemId],
  );
  const fallbackRows = await sql.query(
    `
      SELECT COALESCE(MIN(queue_rank), 1) AS rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
    `,
  );

  const existingFirstRank = Number(currentFirst.rows[0]?.queue_rank);
  const productRank = Number(productRows.rows[0]?.queue_rank);
  const fallbackRank = Number(fallbackRows.rows[0]?.rank ?? 1);
  const baseRank = Number.isFinite(existingFirstRank)
    ? existingFirstRank
    : Number.isFinite(productRank)
      ? productRank
      : fallbackRank;

  for (const [index, item] of workItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, now);
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
      baseRank + workItems.length,
      JSON.stringify({
        blockedByExecutableSpineRecovery: workItems.map((item) => item.id),
        productSpecProofSequencing: "after_executable_spine_replay_proof_gate",
        sourceSpecRef,
        governingSpecRefs,
        beforeProductSpec: false,
        fullProofAdmissionGate: workItems.at(-1)?.id,
        successGate:
          "Full Product/Spec proof may rerun only after executable-spine replay proves WorkIntent acceptance, context requirement structural resharding, NodeExecutionPacket hydration, one worker small-verb edit or precise upstream blocker, canonical readiness/readback, and production-faithful replay.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_executable_spine_recovery",
      }),
      now,
      productSpecItemId,
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
  const managedIds = new Set([...workItems.map((item) => item.id), productSpecItemId]);
  const remainingIds = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedIds.has(id));
  const normalizedIds = [
    ...workItems.map((item) => item.id),
    productSpecItemId,
    ...remainingIds,
  ];

  for (const [index, id] of normalizedIds.entries()) {
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
        metadata->>'successGate' AS success_gate
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 24
    `,
  );

  const artifactRef = writeArtifact("executable-spine-recovery-queue-update.json", {
    artifactKind: "executable_spine_recovery_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    governingSpecRefs,
    productSpecItemId,
    baseRank,
    insertedOrUpdatedWorkItemIds: workItems.map((item) => item.id),
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
    lifecycleMutationKind: "executable_spine_recovery_queue_reprioritize",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseName: runtime.resolution.databaseName,
        artifactRef,
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
