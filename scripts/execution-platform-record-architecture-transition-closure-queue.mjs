#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRef =
  "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md";

const governingSpecRefs = [
  sourceSpecRef,
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md",
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md",
  "docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md",
  "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
  "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
  "docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md",
];

const cleanupStandard = [
  "delete_obsolete_tests_and_proofs_do_not_skip",
  "delete_production_fallback_code_do_not_disable",
  "no_default_context_synthesis_executor_registration",
  "no_after_context_synthesis_replay_boundary",
  "no_graph_level_context_scout_fanout_as_default_readiness_repair",
  "no_compatibility_flags_resurrect_retired_path",
  "meaningful_net_loc_reduction_required",
  "source_inventory_report_for_every_surviving_legacy_term",
];

const items = [
  {
    id: "openclaw-convergence.architecture-transition-closure-gates",
    rank: 140,
    title: "Architecture Transition Closure Gates",
    description:
      "Add production topology, source inventory, and proof-harness gates that fail if default graph-level context scout fanout, resource_fulfillment proof gates, or context-synthesis readiness paths remain executable after accepted packets.",
    scope: [
      "production_topology_gate",
      "source_inventory_gate_initial",
      "proof_harness_legacy_gate_failure",
      "no_default_graph_context_scout_fanout",
      "no_legacy_resource_fulfillment_gate",
      "no_context_synthesis_readiness_compatibility",
    ],
    successGate:
      "After accepted packets, production graphs cannot contain default durable context_scout fanout and the proof harness cannot report resource_fulfillment from packet/context-node coverage.",
  },
  {
    id: "openclaw-convergence.resource-objective-focus-and-requirement-narrowing",
    rank: 141,
    title: "Context Objective Focus And Requirement Narrowing",
    description:
      "Add model-authored ResourceObjectiveFocus before context requirement assembly so the runtime asks for the next exact context need instead of compiling broad baskets of candidate refs, target refs, packet questions, prompt summaries, and repo summaries into every scout payload.",
    scope: [
      "ResourceObjectiveFocus",
      "resource.focus.request",
      "resource.focus.select_next_unknown",
      "resource.focus.select_candidate_refs",
      "resource.focus.accept",
      "requirement_compile_from_selected_legal_refs",
      "broad_context_payload_blocker",
    ],
    successGate:
      "ResourceRequirementPacket compile blocks if it tries to include broad candidate sets without an accepted focus/subset decision; runtime validates refs and budgets but the model authors semantic focus.",
  },
  {
    id: "openclaw-convergence.node-local-node-resource-demand-production-transition",
    rank: 142,
    title: "Node-Local Context Demand Session Core",
    description:
      "Replace default context scout graph prerequisite creation with NodeResourceDemandSession as the canonical node-local context lifecycle. Worker/scheduler can open exact node resource demands; runtime validates refs, authority, budgets, and next transitions.",
    scope: [
      "NodeResourceDemandSession",
      "NodeResourceDemandRequest",
      "NodeResourceDemandFulfillment",
      "resource.demand.open",
      "resource.demand.request_file_window",
      "resource.demand.request_symbol",
      "resource.demand.request_related_tests",
      "resource.demand.request_memory_pack",
      "resource.demand.close",
    ],
    successGate:
      "No production call path creates a default durable context_scout graph node for readiness repair; every context request is consumer-bound and represented as a node-local demand session.",
  },
  {
    id: "openclaw-convergence.scope-revision-production-transition",
    rank: 143,
    title: "Scope Revision Production Transition",
    description:
      "Make context_scope_revision a real production transition: request, model selects legal subset, runtime validates, revised demand packet compiles, execution resumes, ledger/readiness updates, or one precise root-cause blocker terminalizes.",
    scope: [
      "context.scope.request_revision",
      "context.scope.select_legal_subset",
      "context.scope.validate_selected_subset",
      "resource.demand.recompile_from_scope_revision",
      "scope_revision_root_cause_terminal",
    ],
    successGate:
      "A production run cannot stop at scheduler.request_context_scope_revision without executing the next model-authored subset lifecycle or terminalizing with a root-cause artifact.",
  },
  {
    id: "openclaw-convergence.node-resource-ledger-overflow-closure",
    rank: 144,
    title: "Node Context Ledger And Manifest Overflow Gate",
    description:
      "Add append-only per-node NodeResourceLedger with compact manifests, artifact-backed bodies, and proof-environment metadata/heap diagnostics so context volume cannot overflow graph metadata or latest-run-state.",
    scope: [
      "NodeResourceLedger",
      "NodeResourceLedgerEntry",
      "NodeResourceLedgerManifest",
      "ledger_payload_backed_bodies",
      "metadata_manifest_size_gate",
      "latest_run_state_compact_projection",
      "heap_usage_by_phase",
      "largest_metadata_object_report",
    ],
    successGate:
      "NodeExecutionPacket, graph metadata, Work Queue projection, and latest-run-state carry only compact ledger manifests and payload refs; full bodies are artifact-backed and largest metadata/heap diagnostics are recorded.",
  },
  {
    id: "openclaw-convergence.progressive-node-execution-packet-write-gate-closure",
    rank: 145,
    title: "Progressive NodeExecutionPacket",
    description:
      "Allow workers to start from a partial execution packet for read/context phases while write/edit tools remain gated on target selection, snapshots, authority, validation refs/defaults, and evidence expectations.",
    scope: [
      "partial_NodeExecutionPacket",
      "partial_context_allowed",
      "resource_demand_open",
      "resource_ledger_ready",
      "domain_resource_selection_required",
      "domain_action_gate_blocked",
      "worker_action_ready",
      "post_action_validation_required",
    ],
    successGate:
      "A worker can begin node-local node resource demand from a partial packet, but source-edit tools remain unavailable until the hydrated write gate proves target selection, snapshots, authority, validation, and evidence expectations.",
  },
  {
    id: "openclaw-convergence.context-scout-specialist-subturn-production-closure",
    rank: 147,
    title: "Context Scout Specialist Subturn",
    description:
      "Convert scout execution from default graph node to optional consumer-bound specialist subturn. Simple node resource demands are fulfilled by repo/file/test/memory tools; scout runs only when the node needs deeper exploration. Closure must include a non-trivial real-model canary proving model-authored discovery and target narrowing from a larger legal-ref universe without runtime-seeded target files.",
    scope: [
      "context_scout_specialist_subturn",
      "consumer_bound_scout_dispatch",
      "direct_node_resource_demand_fulfillment",
      "specialist_scout_handoff_to_NodeResourceDemandSession",
      "NodeResourceLedger_append_from_scout",
      "middle_lane_real_model_broad_legal_ref_universe",
      "model_authored_resource_objective_focus",
      "model_authored_node_resource_demand_from_focus",
      "model_authored_target_selection_from_ledger_evidence",
      "runtime_must_not_seed_known_target_files",
    ],
    successGate:
      "Context scout is no longer default graph glue; when used, it is a subturn bound to a specific NodeResourceDemandSession and returns ledger entries to that consumer node. A real-model middle-lane canary must prove broad legal refs -> model-authored focus -> node-local demand/scout -> ledger evidence -> model-authored target selection, with manifest-only metadata and no runtime-seeded target refs.",
  },
  {
    id: "openclaw-convergence.workintent-context-resolution-from-ledger",
    rank: 148,
    title: "WorkIntent Context Resolution From Demand Ledger",
    description:
      "Rewire WorkIntent context resolution to consume NodeResourceDemandSession, NodeResourceLedger, accepted focus decisions, target-selection state, and limitation/waiver refs before any legacy graph context_supplies observation.",
    scope: [
      "WorkIntentContextResolution",
      "NodeResourceDemandSession_refs",
      "NodeResourceLedger_manifest_refs",
      "accepted_focus_decision_refs",
      "limitation_waiver_refs",
      "legacy_context_supplies_demoted",
    ],
    successGate:
      "A WorkIntent can become resource_ledger_ready without any context scout graph node; graph context nodes cannot satisfy context unless explicitly workflow-defined and appended to the consumer ledger.",
  },
  {
    id: "openclaw-convergence.proof-harness-canonical-gate-rewrite",
    rank: 149,
    title: "Proof Harness Canonical Gate Rewrite",
    description:
      "Rewrite the checkpoint proof harness to project canonical node-local state instead of packet-level context coverage, graph-level context scout coverage, or context-synthesis readiness compatibility.",
    scope: [
      "resource_focus_required",
      "resource_demand_open",
      "context_scope_revision_required",
      "resource_ledger_ready",
      "domain_resource_selection_blocked",
      "domain_action_gate_blocked",
      "root_cause_terminal",
      "delete_resource_fulfillment_projection",
      "delete_context_synthesis_readiness_projection",
    ],
    successGate:
      "firstOpenGate comes from canonical node-local readiness/root-cause state and cannot report resource_fulfillment or context_synthesis readiness after packets.",
  },
  {
    id: "openclaw-convergence.readback-rootcause-provider-heap-closure",
    rank: 150,
    title: "Readback, Root-Cause Collapse, Provider Diagnostics, And Heap Optics",
    description:
      "Project the node-local context lifecycle accurately, collapse repeated no-progress signatures, persist bounded provider response shape, and record proof-environment heap/metadata diagnostics.",
    scope: [
      "resource_demand_open",
      "context_scope_revision_required",
      "resource_ledger_ready",
      "domain_resource_selection_blocked",
      "domain_action_gate_blocked",
      "worker_action_ready",
      "post_action_validation",
      "evidence_closure",
      "provider_diagnostics_response_shape",
      "frontier.root_cause_collapse",
      "heap_oom_diagnostics",
    ],
    successGate:
      "Readback projects exact node-local gates and repeated identical blockers terminalize once with root-cause evidence; provider and heap diagnostics are bounded and phase-attributed.",
  },
  {
    id: "openclaw-convergence.context-synthesis-runtime-deletion-closure",
    rank: 151,
    title: "Context Synthesis Production Retirement",
    description:
      "Hard-delete default context synthesis production/replay paths. No diagnostic-only compatibility lane and no env flag; future workflows need a new explicit coordination capability instead of context_synthesis glue.",
    scope: [
      "remove_context_synthesis_executor_registration",
      "remove_after_context_synthesis_replay_boundary",
      "delete_context_synthesis_proof_lanes",
      "remove_context_synthesis_readiness_success",
      "remove_resurrection_flags",
    ],
    successGate:
      "Production executor maps do not register context_synthesis, replay has no after-context-synthesis boundary, and no context synthesis artifact can unlock implementation or proof success.",
    cleanupStandard,
  },
  {
    id: "openclaw-convergence.legacy-proof-test-purge-closure",
    rank: 152,
    title: "Legacy Proof And Test Purge",
    description:
      "Delete or rewrite tests/proofs that encode old topology: context-synthesis proof lanes, after-context-synthesis replay, broad scout boundary replay, context-synthesis scheduler handoff tests, and stale graph-level scout fanout fixtures.",
    scope: [
      "delete_context_synthesis_proof_lanes",
      "delete_after_context_synthesis_replay_tests",
      "delete_broad_scout_boundary_replay_tests",
      "rewrite_context_synthesis_scheduler_handoff_tests",
      "rewrite_graph_level_scout_fanout_fixtures",
    ],
    successGate:
      "The test suite cannot pass by preserving compatibility fixtures for retired topology; obsolete tests are deleted or rewritten around node-local demand, not skipped.",
    cleanupStandard,
  },
  {
    id: "openclaw-convergence.legacy-runtime-code-evisceration-closure",
    rank: 153,
    title: "Legacy Runtime Code Evisceration",
    description:
      "Remove old runtime code entirely: context synthesis executor registration, artifact compiler if not explicitly reintroduced as a new workflow, post-synthesis policy, default scout prerequisite creation, after-context-synthesis replay, and resurrection flags.",
    scope: [
      "delete_context_synthesis_executor",
      "delete_context_synthesis_artifact_compiler_if_unowned",
      "delete_post_synthesis_graph_policy",
      "delete_default_context_scout_prerequisite_creation",
      "delete_after_context_synthesis_replay_boundary",
      "delete_retired_compatibility_flags",
    ],
    successGate:
      "Retired production paths are not importable and scheduler/runner/replay/proof surfaces show meaningful net LOC reduction.",
    cleanupStandard,
  },
  {
    id: "openclaw-convergence.architecture-residue-source-inventory-final-gate",
    rank: 154,
    title: "Architecture Residue Source Inventory Gate",
    description:
      "Add a final source inventory gate that fails on production imports/usages of retired concepts. Allowed references must be minimal, explicit, and ideally historical docs only.",
    scope: [
      "source_inventory_gate",
      "context_synthesis_survivor_report",
      "after_context_synthesis_survivor_report",
      "default_context_scout_fanout_survivor_report",
      "compatibility_flag_survivor_report",
      "net_loc_reduction_report",
    ],
    successGate:
      "The inventory report lists every surviving legacy term and why it is allowed; the gate fails if retired production paths become importable again.",
    cleanupStandard,
  },
  {
    id: "openclaw-convergence.worker-readiness-edit-evidence-node-local-closure",
    rank: 155,
    title: "Worker Readiness, Forced Edit, Validation, And Evidence",
    description:
      "Rescoped after node-local node resource demand: prove partial packet -> demand ledger -> target selection -> hydrated write gate -> forced patch author -> validation -> evidence.",
    scope: [
      "partial_packet_worker_start",
      "NodeResourceDemandSession_worker_context_request",
      "NodeResourceLedger_worker_handoff",
      "target_selection_before_write_gate",
      "worker.patch.force_author_from_plan",
      "worker.validation.run_structural_default",
      "worker.evidence.claim_from_validation",
    ],
    successGate:
      "The worker never receives ambiguous source-edit work; once an edit plan is accepted, the only legal progress path is forced patch author or precise upstream blocker, then validation and evidence.",
  },
  {
    id: "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
    rank: 156,
    title: "Product/Spec Middle-Lane Replay And Full Proof Gates",
    description:
      "Rescoped proof gate: prove a real implementation node starts, requests context locally, receives scoped file windows, selects targets, edits, validates, and emits evidence. No broad scout/synthesis path counts.",
    scope: [
      "middle_lane_node_local_context_model_test",
      "middle_lane_worker_node_resource_demand_smoke",
      "target_selection_after_ledger",
      "worker_edit_validation_evidence_smoke",
      "completed_packets_replay",
      "full_product_spec_planning_proof",
      "failure_catalogue_backlog_update",
    ],
    successGate:
      "The proof path reaches a real implementation edit through node-local node resource demand, validation, evidence, and readback, or stops with a precise architectural/toolification blocker that is not hidden behind generic needs_review.",
  },
];

const productSpecItem = {
  id: "openclaw-convergence.active-queue-34",
  rank: 157,
  metadata: {
    productSpecProofSequencing:
      "after_architecture_transition_closure_node_local_node_resource_demand_middle_lane_replay",
    blockedByArchitectureTransitionClosureQueue: items.map((item) => item.id),
  },
};

const displacedPostProofItems = [
  {
    id: "openclaw-convergence.post-proof-full-tool-facade-expansion",
    rank: 220,
    reason: "post_proof_full_tool_facade_runs_after_product_spec_proof",
  },
  {
    id: "openclaw-convergence.post-proof-04-cross-workflow-orchestration-proof-lanes",
    rank: 221,
    reason: "post_proof_cross_workflow_lanes_run_after_product_spec_proof",
  },
  {
    id: "openclaw-convergence.runtime-artifact-retention-pruning-policy",
    rank: 222,
    reason: "retention_pruning_runs_after_current_architecture_transition_proof",
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
    artifactKind: "execution_platform.architecture_transition_closure_queue_item",
    sourceSpecRef,
    governingSpecRefs,
    beforeProductSpec: true,
    priorityClass: "P0",
    architectureTransitionClosureTranche: true,
    scope: item.scope,
    successGate: item.successGate,
    cleanupStandard: item.cleanupStandard ?? [],
    semanticJudgmentOwner:
      "model_or_human_authored_context_focus_scope_sufficiency_target_selection_edit_semantics_and_closeout_judgment",
    runtimeAuthority:
      "ids_refs_hashes_payload_manifests_authority_budgets_lifecycle_locks_validation_execution_readback_projection_and_legacy_code_deletion",
    deterministicSemanticJudgmentAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: true,
    lifecycleMutationKind: "architecture_transition_closure_queue_insert_or_reprioritize",
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
          VALUES ($1, 'platform_hardening', $2, $3, 'draft', 'active', $4, $5::jsonb, $6::timestamptz, $6::timestamptz)
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

    await sql.query(
      `
        UPDATE execution_platform.work_items
        SET queue_rank = $1,
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = $3::timestamptz
        WHERE work_item_id = $4
      `,
      [
        productSpecItem.rank,
        JSON.stringify({
          ...productSpecItem.metadata,
          sourceSpecRef,
          governingSpecRefs,
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
          lifecycleMutationKind: "product_spec_rank_after_architecture_transition_closure_tranche",
        }),
        now,
        productSpecItem.id,
      ],
    );

    for (const displaced of displacedPostProofItems) {
      await sql.query(
        `
          UPDATE execution_platform.work_items
          SET queue_rank = $1,
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
              updated_at = $3::timestamptz
          WHERE work_item_id = $4
            AND queue_status IN ('active', 'blocked', 'needs_review')
        `,
        [
          displaced.rank,
          JSON.stringify({
            sourceSpecRef,
            governingSpecRefs,
            displacedByArchitectureTransitionClosure: true,
            displacementReason: displaced.reason,
            rawPromptStored: false,
            rawResponseStored: false,
            rawTranscriptStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
            hiddenReasoningStored: false,
            workQueueLifecycleMutated: true,
            lifecycleMutationKind: "post_proof_item_ranked_after_architecture_transition_closure",
          }),
          now,
          displaced.id,
        ],
      );
    }

    const result = await sql.query(
      `
        SELECT work_item_id, queue_rank, queue_status, lifecycle_state, title
        FROM execution_platform.work_items
        WHERE queue_status IN ('active', 'blocked', 'needs_review')
          AND queue_rank BETWEEN 140 AND 156
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    await sql.query("COMMIT");

    const artifact = writeArtifact("architecture-transition-closure-queue-update.json", {
      artifactKind: "execution_platform.architecture_transition_closure_queue_update",
      sourceSpecRef,
      governingSpecRefs,
      itemCount: items.length,
      productSpecItem,
      queueRows: result.rows,
      cleanupStandard,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
      workQueueLifecycleMutated: true,
    });
    console.log(JSON.stringify({ artifact, queueRows: result.rows }, null, 2));
  } catch (error) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await runtime.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
