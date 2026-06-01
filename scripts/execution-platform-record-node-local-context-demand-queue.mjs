#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");

const sourceSpecRef =
  "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md";
const blockerSpecRef =
  "docs/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan.md";

const commonSpecRefs = [
  sourceSpecRef,
  blockerSpecRef,
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
    id: "openclaw-convergence.node-local-node-resource-demand-session-core",
    rank: 140,
    title: "Node-Local Context Demand Session Core",
    description:
      "Add NodeResourceDemandSession as the canonical node-local context lifecycle. Worker/scheduler can open exact node resource demands; runtime validates refs, authority, budgets, and next transitions. No durable graph node fanout by default.",
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
      "No default durable context_scout graph node is created for readiness repair; every context request is consumer-bound, authority-checked, budgeted, and represented as a node-local demand session with exact next legal transitions.",
  },
  {
    id: "openclaw-convergence.node-resource-ledger",
    rank: 141,
    title: "Node Context Ledger",
    description:
      "Add append-only per-node NodeResourceLedger with compact manifests and artifact-backed bodies for findings, opened windows, patterns, risks, edit points, validation suggestions, limitations, and provider diagnostics.",
    scope: [
      "NodeResourceLedger",
      "NodeResourceLedgerEntry",
      "NodeResourceLedgerManifest",
      "ledger.file_window_opened",
      "ledger.relevant_file_reported",
      "ledger.existing_pattern_reported",
      "ledger.edit_point_recommended",
      "ledger.validation_recommended",
      "ledger.provider_diagnostic_recorded",
    ],
    successGate:
      "NodeExecutionPacket carries compact ledger manifests and payload refs, not giant context bodies; replay and readback can hydrate node context from artifact-backed entries.",
  },
  {
    id: "openclaw-convergence.progressive-node-execution-packet",
    rank: 142,
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
    id: "openclaw-convergence.context-scout-specialist-subturn",
    rank: 143,
    title: "Context Scout Specialist Subturn",
    description:
      "Convert scout execution from default graph node to optional consumer-bound specialist subturn. Simple node resource demands are fulfilled by repo/file/test/memory tools; scout runs only when the node needs deeper exploration.",
    scope: [
      "context_scout_specialist_subturn",
      "consumer_bound_scout_dispatch",
      "direct_node_resource_demand_fulfillment",
      "specialist_scout_handoff_to_NodeResourceDemandSession",
      "NodeResourceLedger_append_from_scout",
    ],
    successGate:
      "Context scout is no longer default graph glue; when used, it is a subturn bound to a specific NodeResourceDemandSession and returns ledger entries to that consumer node.",
  },
  {
    id: "openclaw-convergence.context-synthesis-production-retirement",
    rank: 144,
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
    id: "openclaw-convergence.blocker-closure-04-worker-readiness-edit-evidence",
    rank: 145,
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
    id: "openclaw-convergence.blocker-closure-05-readback-rootcause-provider-diagnostics",
    rank: 146,
    title: "Readback, Root-Cause Collapse, And Provider Diagnostics",
    description:
      "Project the node-local context lifecycle and provider diagnostics accurately: node resource demand gates, ledger readiness, target selection, write gate, worker edit readiness, post-edit validation, and evidence closure.",
    scope: [
      "resource_demand_open",
      "resource_demand_blocked",
      "resource_ledger_ready",
      "domain_resource_selection_blocked",
      "domain_action_gate_blocked",
      "worker_action_ready",
      "post_action_validation",
      "evidence_closure",
      "provider_diagnostics_response_shape",
      "frontier.root_cause_collapse",
    ],
    successGate:
      "firstOpenGate and latest-run-state project from canonical demand, ledger, readiness, write gate, validation, evidence, root-cause, and provider diagnostic state, not stale checkpoint labels.",
  },
  {
    id: "openclaw-convergence.legacy-proof-test-purge",
    rank: 147,
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
    id: "openclaw-convergence.legacy-runtime-code-evisceration",
    rank: 148,
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
    id: "openclaw-convergence.architecture-residue-source-inventory-gate",
    rank: 149,
    title: "Architecture Residue Source Inventory Gate",
    description:
      "Add a source inventory gate that fails on production imports/usages of retired concepts. Allowed references must be minimal, explicit, and ideally historical docs only.",
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
    id: "openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates",
    rank: 150,
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
  rank: 151,
  metadata: {
    productSpecProofSequencing:
      "after_node_local_node_resource_demand_legacy_evisceration_and_middle_lane_replay",
    blockedByNodeLocalNodeResourceDemandQueue: items.map((item) => item.id),
  },
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
    artifactKind: "execution_platform.node_local_node_resource_demand_queue_item",
    sourceSpecRef,
    governingSpecRefs: commonSpecRefs,
    beforeProductSpec: true,
    priorityClass: "P0",
    nodeLocalNodeResourceDemandTranche: true,
    scope: item.scope,
    successGate: item.successGate,
    cleanupStandard: item.cleanupStandard ?? [],
    semanticJudgmentOwner:
      "model_or_human_authored_context_relevance_scope_sufficiency_target_selection_edit_semantics_and_closeout_judgment",
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
    lifecycleMutationKind: "node_local_node_resource_demand_queue_insert_or_reprioritize",
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
          governingSpecRefs: commonSpecRefs,
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
          lifecycleMutationKind: "product_spec_rank_after_node_local_node_resource_demand_tranche",
        }),
        now,
        productSpecItem.id,
      ],
    );

    const result = await sql.query(
      `
        SELECT work_item_id, queue_rank, queue_status, lifecycle_state, title
        FROM execution_platform.work_items
        WHERE queue_status IN ('active', 'blocked', 'needs_review')
          AND queue_rank BETWEEN 140 AND 151
        ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      `,
    );
    await sql.query("COMMIT");

    const artifact = writeArtifact("node-local-node-resource-demand-queue-update.json", {
      artifactKind: "execution_platform.node_local_node_resource_demand_queue_update",
      sourceSpecRef,
      blockerSpecRef,
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

