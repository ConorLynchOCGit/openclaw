#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";
const controlPlaneSpecRef =
  "docs/projects/execution-platform/specs/control-plane-coding-team-recovery.md";
const workIntentSpecRef =
  "docs/projects/execution-platform/specs/work-intent-control-plane-contract.md";
const productSpecItemId = "openclaw-convergence.active-queue-34";

const governingSpecRefs = [sourceSpecRef, controlPlaneSpecRef, workIntentSpecRef];

const preProofItems = [
  {
    id: "openclaw-convergence.contract-spine-01-node-execution-contract",
    title: "Canonical NodeExecutionContract And Split-Child Inheritance",
    description:
      "Promote payload-backed NodeExecutionContract as the only executable semantics source, keep graph metadata manifest-only, and make split children inherit parent contract fields with narrow validated overrides.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#1-canonical-nodeexecutioncontract`,
    scope: [
      "node_execution_contract_schema",
      "payload_backed_contract_bodies",
      "manifest_only_graph_metadata",
      "contract_ref_graph_nodes",
      "split_child_contract_inheritance",
      "contract_override_packet",
      "domain_resource_packet_binding",
      "worker_dispatch_contract_guard",
    ],
    successGate:
      "Focused tests prove executable graph nodes require payload-backed contracts, graph metadata rejects contract bodies, and split children cannot drop execution intent, evidence mode, capability, validation, context, or evidence requirements.",
  },
  {
    id: "openclaw-convergence.contract-spine-02-resource-requirement-compiler",
    title: "ResourceRequirementPacket Compiler And Scout Execution Packet",
    description:
      "Add the required WorkIntent -> ResourceRequirementPacket -> ContextScoutExecutionPacket boundary so context scouts run from consumer-scoped requirements, bounded refs, and small context/repo tools.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#2-resource-requirements-compiler`,
    scope: [
      "resource_requirement_packet_schema",
      "workintent_resource_requirement_compile",
      "consumer_scoped_context_questions",
      "context_scout_execution_packet",
      "bounded_prompt_refs",
      "bounded_repo_refs",
      "context_acceptance_contract",
      "limitation_policy",
      "context_tool_path",
    ],
    successGate:
      "Focused tests prove context scout cannot run without ResourceRequirementPacket, scout payloads are consumer-scoped and bounded, and accepted context is mapped only to declared consumers.",
  },
  {
    id: "openclaw-convergence.contract-spine-03-demand-driven-context-tools",
    title: "Demand-Driven Context Tool Path And Synthesis Retirement Audit",
    description:
      "Enforce node/work-intent/file-packet scoped context by default, keep context synthesis explicit coordination only, and audit production/replay paths for hidden synthesis glue.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#3-demand-driven-context-not-blob-context`,
    scope: [
      "consumer_scoped_context",
      "progressive_context_tools",
      "no_global_blob_context_default",
      "no_default_context_synthesis",
      "workflow_defined_coordination_only",
      "accepted_with_limitations_consumer_waiver",
      "replay_topology_production_alignment",
    ],
    successGate:
      "Production and replay tests prove completed-packet paths produce WorkIntent/context requirements before scout and never inject context_synthesis unless explicit workflow/model coordination requires it.",
  },
  {
    id: "openclaw-convergence.contract-spine-04-frontier-root-cause-collapse",
    title: "Frontier Root-Cause Collapse",
    description:
      "Add stable no-progress signatures over stage, node kind, capability, execution intent, evidence mode, missing fields, reason codes, schema/policy paths, and contract version; halt repeated sibling blockers with one root-cause artifact.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#4-frontier-root-cause-collapse`,
    scope: [
      "no_progress_signature",
      "frontier_root_cause_artifact",
      "sibling_blocker_collapse",
      "materialization_spin_guard",
      "repair_boundary_recommendation",
      "root_cause_readback",
    ],
    successGate:
      "Focused and replay tests prove repeated materialization/context/contract blockers across sibling nodes collapse to one root-cause artifact without losing successful sibling evidence.",
  },
  {
    id: "openclaw-convergence.contract-spine-05-branch-scoped-frontier-state",
    title: "Branch-Scoped Frontier State And Readback",
    description:
      "Persist BranchScopedFrontierState for every frontier branch so success, blockers, consumers, repair nodes, diagnostic-only nodes, evidence refs, and next transitions are independent and owner-readable.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#5-branch-scoped-frontier-state`,
    scope: [
      "branch_scoped_frontier_state",
      "sibling_evidence_survival",
      "consumer_aware_repair_nodes",
      "diagnostic_only_repair_nodes",
      "dependent_consumer_readback",
      "branch_blocker_projection",
    ],
    successGate:
      "Work Queue/readback tests prove branch id, node id, blocker, dependent consumers, evidence refs, readiness ref, contract ref, and next legal transition are projected from canonical branch state.",
  },
  {
    id: "openclaw-convergence.contract-spine-06-scheduler-observability-envelope",
    title: "Scheduler Model-Call Observability Envelope",
    description:
      "Emit bounded scheduler model-call preflight, heartbeat, completion, rejection, and repair envelopes with useful live optics without hidden reasoning or raw provider bodies.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#6-scheduler-observability-envelope`,
    scope: [
      "scheduler_model_call_envelope",
      "preflight_event",
      "heartbeat_event",
      "completion_event",
      "rejection_event",
      "decision_slot_readback",
      "input_output_byte_counts",
      "graph_counts",
      "allowed_tool_family",
      "schema_policy_error_path",
    ],
    successGate:
      "Scheduler tests and readback proof show live model-call optics for long scheduler decisions, including model/provider/profile, decision slot, tool family, bytes, counts, heartbeat age, finish reason, and schema/policy rejection path.",
  },
  {
    id: "openclaw-convergence.contract-spine-07-validation-phase-semantics",
    title: "Validation Phase Semantics",
    description:
      "Separate pre-proof, pre-execution, post-edit, review, closeout, and diagnostic validation so validation evidence cannot be used outside its phase or fake implementation success.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#7-validation-phase-semantics`,
    scope: [
      "validation_phase_enum",
      "validation_phase_evidence_claims",
      "pre_proof_validation_non_closure",
      "post_action_validation_mapping",
      "review_validation_mapping",
      "closeout_validation_gate",
      "phase_incompatible_evidence_rejection",
    ],
    successGate:
      "Focused evidence/closeout tests prove pre-proof validation cannot close implementation commitments and post-edit validation must map to changed files, task ids, and commitment ids.",
  },
  {
    id: "openclaw-convergence.contract-spine-08-canonical-readback-gate",
    title: "Canonical Readback Gate From Readiness And Frontier State",
    description:
      "Make firstOpenGate and owner readback derive from NodeReadinessState, BranchScopedFrontierState, NodeExecutionContract, scheduler envelope, validation phase state, and root-cause artifacts rather than stale checkpoint labels.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#8-readback-gate-fix`,
    scope: [
      "canonical_first_open_gate",
      "readiness_frontier_gate_projection",
      "contract_ref_readback",
      "root_cause_readback",
      "materialization_blocker_readback",
      "schema_policy_path_readback",
      "next_transition_projection",
    ],
    successGate:
      "Readback tests prove materialization blockers surface as materialization gates with branch/node/contract/readiness/blocker details, never stale obligation_graph checkpoint labels.",
  },
  {
    id: "openclaw-convergence.contract-spine-09-model-policy-bindings",
    title: "Model Policy Contract Bindings",
    description:
      "Bind model policy to task class and contract boundary so high-reasoning lanes make global semantic architecture decisions while fast lanes perform bounded local context, normalization, validation classification, and patch authoring.",
    itemType: "platform_hardening",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#9-model-policy`,
    scope: [
      "model_task_class_bindings",
      "global_reasoning_policy",
      "local_context_policy",
      "schema_normalization_policy",
      "patch_author_policy",
      "provider_diagnostics",
      "proof_mode_rescue_visibility",
      "no_semantic_substring_classifiers",
    ],
    successGate:
      "Model-policy tests prove task classes select model/profile/output contract/timeout/retry behavior and no scheduler/context/router/worker path infers semantic intent from substrings or Product/Spec-specific prose.",
  },
  {
    id: "openclaw-convergence.contract-spine-10-replay-proof",
    title: "Contract-Spine Replay Proof From Completed Packets And Resource Boundary",
    description:
      "Run replay lane proofs from completed packets and resource materialization to prove WorkIntent/context requirements, demand-driven context, contract inheritance, root-cause collapse, branch readback, validation phases, and one worker boundary before the full proof.",
    itemType: "proof_gate",
    priorityClass: "P0",
    specSectionRef: `${sourceSpecRef}#10-boundary-replay-requirements`,
    scope: [
      "completed_packets_replay",
      "workintent_compile_replay",
      "resource_requirement_replay",
      "resource_materialization_replay",
      "split_child_contract_replay",
      "root_cause_collapse_replay",
      "branch_readback_replay",
      "worker_boundary_smoke",
      "proof_artifact_closeout",
    ],
    successGate:
      "Replay proof passes from completed packets and resource materialization without rerunning upstream phases, without default synthesis, and with either one bounded edit plus validation/evidence or a precise upstream blocker.",
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
    sha256: sha256(body),
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
    artifactKind: "execution_platform.contract_spine_work_item",
    sourceSpecRef,
    governingSpecRefs,
    specSectionRef: item.specSectionRef,
    beforeProductSpec: true,
    priorityClass: item.priorityClass,
    productSpecProofItemId: productSpecItemId,
    scope: item.scope,
    successGate: item.successGate,
    semanticJudgmentOwner:
      "model_authored_intent_capability_sufficiency_quality_and_evidence_judgment",
    runtimeAuthority:
      "schema_ids_refs_bounds_storage_authority_lifecycle_locks_tool_execution_validation_execution_readback",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "contract_spine_queue_insert_or_reprioritize",
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
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
              THEN execution_platform.work_items.queue_status
            ELSE 'active'
          END,
          queue_rank = CASE
            WHEN execution_platform.work_items.queue_status IN ('closed', 'archived', 'superseded')
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

  const managedIds = [...preProofItems.map((item) => item.id), productSpecItemId];
  const productRows = await sql.query(
    "SELECT queue_rank FROM execution_platform.work_items WHERE work_item_id = $1",
    [productSpecItemId],
  );
  const managedRankRows = await sql.query(
    `
      SELECT queue_rank
      FROM execution_platform.work_items
      WHERE work_item_id = ANY($1::text[])
        AND queue_status IN ('active','blocked','needs_review')
        AND queue_rank IS NOT NULL
    `,
    [managedIds],
  );
  const fallbackRows = await sql.query(
    "SELECT COALESCE(MIN(queue_rank), 1) AS rank FROM execution_platform.work_items WHERE queue_status IN ('active','blocked','needs_review')",
  );
  const managedRanks = managedRankRows.rows
    .map((row) => Number(row.queue_rank))
    .filter((rank) => Number.isFinite(rank));
  const productRank = Number(productRows.rows[0]?.queue_rank);
  const baseRank = Number.isFinite(productRank)
    ? productRank
    : managedRanks.length > 0
      ? Math.min(...managedRanks)
      : Number(fallbackRows.rows[0]?.rank ?? 1);

  for (const [index, item] of preProofItems.entries()) {
    await upsertWorkItem(sql, item, baseRank + index, now);
  }

  const newProductRank = baseRank + preProofItems.length;
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
        sourceSpecRef,
        governingSpecRefs,
        blockedByContractSpineWorkItemIds: preProofItems.map((item) => item.id),
        productSpecProofSequencing: "after_contract_spine_replay_proofs",
        beforeProductSpec: false,
        contractSpineRequired: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        hiddenReasoningStored: false,
        workQueueLifecycleMutated: true,
        lifecycleMutationKind: "product_spec_rank_after_contract_spine",
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
  const managedSet = new Set(managedIds);
  const remaining = activeRows.rows
    .map((row) => row.work_item_id)
    .filter((id) => !managedSet.has(id));
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
        metadata->>'sourceSpecRef' AS source_spec_ref
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 32
    `,
  );

  const artifactRef = writeArtifact("contract-spine-queue-update.json", {
    artifactKind: "contract_spine_queue_update",
    databaseName: runtime.resolution.databaseName,
    reusedModelMemoryDatabase: runtime.resolution.reusedModelMemoryDatabase,
    sourceSpecRef,
    governingSpecRefs,
    productSpecItemId,
    baseRank,
    productRank: newProductRank,
    preProofItemIds: preProofItems.map((item) => item.id),
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
    lifecycleMutationKind: "contract_spine_queue_reprioritize",
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
