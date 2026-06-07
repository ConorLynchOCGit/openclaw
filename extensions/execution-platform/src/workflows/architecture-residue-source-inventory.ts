import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_VERSION =
  "execution-platform.architecture-residue-source-inventory.v1" as const;

export const ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_ARTIFACT_TYPE =
  "execution_platform.architecture_residue_source_inventory" as const;

export const ARCHITECTURE_RESIDUE_MODEL_AUDIT_ARTIFACT_TYPE =
  "execution_platform.architecture_residue_model_audit" as const;

export const ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID =
  "openclaw-convergence.source-inventory-domain-lifecycle-residue-gate" as const;

export const ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_ARTIFACT_NAMESPACE =
  "source-inventory-domain-lifecycle-residue-gate" as const;

export type ArchitectureResidueInventoryStatus = "passed" | "failed";

export type ArchitectureResidueHardFailure = {
  checkId: string;
  file: string;
  pattern: string;
  reasonCode: string;
};

export type ArchitectureResidueSurvivorRef = {
  file: string;
  term: string;
  count: number;
  disposition:
    | "allowed_historical_doc"
    | "allowed_exact_source_guard"
    | "allowed_exact_negative_test"
    | "allowed_exact_historical_script"
    | "blocked_unallowlisted_source";
  reasonCode: string;
  maxAllowedCount: number | null;
};

export type ArchitectureResidueLineReduction = {
  added: number;
  deleted: number;
  netReduction: number;
  numstat: Array<{ file: string; added: number; deleted: number }>;
};

export type ArchitectureResidueSourceInventoryReport = {
  artifactKind: typeof ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_ARTIFACT_TYPE;
  schemaVersion: typeof ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_VERSION;
  workItemId: typeof ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID;
  status: ArchitectureResidueInventoryStatus;
  hardFailureCount: number;
  hardFailures: ArchitectureResidueHardFailure[];
  survivorTermCounts: Record<string, number>;
  survivorRefCount: number;
  survivorRefs: ArchitectureResidueSurvivorRef[];
  blockedSurvivorRefCount: number;
  blockedSurvivorRefs: ArchitectureResidueSurvivorRef[];
  deletedRuntimeTargetCount: number;
  missingDeletedTargets: string[];
  stillPresentDeletedTargets: string[];
  scanRoots: string[];
  lineReduction: ArchitectureResidueLineReduction;
  manifest: ArchitectureResidueSourceInventoryManifest;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  generatedAt: string;
};

export type ArchitectureResidueSourceInventoryManifest = {
  artifactKind: "execution_platform.architecture_residue_source_inventory_manifest";
  schemaVersion: `${typeof ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_VERSION}.manifest`;
  workItemId: typeof ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID;
  status: ArchitectureResidueInventoryStatus;
  reportHash: `sha256:${string}`;
  reportBytes: number;
  hardFailureCount: number;
  blockedSurvivorRefCount: number;
  survivorRefCount: number;
  topSurvivorFiles: Array<{ file: string; count: number }>;
  lineReduction: Omit<ArchitectureResidueLineReduction, "numstat">;
  fullReportRef: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ArchitectureResidueInventoryOptions = {
  repoRoot: string;
  fullReportRef?: string | null;
};

const SCAN_ROOTS = [
  "extensions/execution-platform/src",
  "scripts",
  "docs/projects/execution-platform",
] as const;

const DELETED_RUNTIME_TARGETS = [
  "extensions/execution-platform/src/workflows/context-synthesis.ts",
  "extensions/execution-platform/src/workflows/post-synthesis-graph-policy.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.ts",
  "scripts/execution-platform-run-context-scout-boundary-replay.mjs",
  "scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs",
  "scripts/execution-platform-run-parallel-context-scout-boundary-replay.mjs",
  "scripts/execution-platform-record-context-synthesis-production-retirement-closeout.mjs",
  "scripts/execution-platform-record-context-synthesis-retirement-closeout.mjs",
  "scripts/execution-platform-record-context-synthesis-scheduler-handoff-closeout.mjs",
  "scripts/execution-platform-record-post-synthesis-parallel-supersteps-closeout.mjs",
  "scripts/execution-platform-run-legacy-runtime-code-evisceration-inventory.mjs",
  "scripts/execution-platform-run-legacy-proof-test-purge-inventory.mjs",
  "scripts/execution-platform-run-context-synthesis-runtime-deletion-closure-proof.mjs",
  "scripts/execution-platform-record-legacy-runtime-code-evisceration-closeout.mjs",
  "scripts/execution-platform-record-legacy-proof-test-purge-closeout.mjs",
  "scripts/execution-platform-record-fallback-compat-retirement-closeout.mjs",
  "scripts/execution-platform-record-context-synthesis-runtime-deletion-closure-closeout.mjs",
  "scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs",
  "scripts/execution-platform-record-non-codex-compound-tools-closeout.mjs",
  "scripts/execution-platform-run-context-objective-focus-real-model-proof.mjs",
  "scripts/execution-platform-run-context-scope-revision-real-model-proof.mjs",
  "scripts/execution-platform-run-node-context-ledger-overflow-real-model-proof.mjs",
  "scripts/execution-platform-run-node-local-context-demand-real-model-proof.mjs",
  "scripts/execution-platform-run-progressive-node-execution-packet-real-model-proof.mjs",
  "scripts/execution-platform-run-target-selection-real-model-proof.mjs",
  "scripts/execution-platform-run-worker-readiness-edit-evidence-real-model-proof.mjs",
  "scripts/execution-platform-run-context-scout-specialist-subturn-real-model-proof.mjs",
  "scripts/execution-platform-record-canonical-lifecycle-worker-surface-excision-closeout.mjs",
  "scripts/execution-platform-run-blocker-closure-05-readback-rootcause-provider-diagnostics-proof.mjs",
  "scripts/execution-platform-record-lifecycle-residue-inventory-no-model-walk-closeout.mjs",
  "scripts/execution-platform-run-workintent-context-resolution-from-ledger-real-model-proof.mjs",
  "extensions/execution-platform/src/workflows/commitment-packet-authoring-stage.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-authoring-stage.test.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-preauthor-tools.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-preauthor-tools.test.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-semantic-tools.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-semantic-tools.test.ts",
  "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.test.ts",
  "scripts/execution-platform-run-commitment-packet-real-model-lane.mjs",
  "scripts/execution-platform-run-model-facing-staged-scheduler-proof.mjs",
  "extensions/execution-platform/src/workflows/obligation-graph.ts",
  "extensions/execution-platform/src/workflows/obligation-graph.test.ts",
  "scripts/execution-platform-record-intake-stage-runner-queue.mjs",
  "scripts/execution-platform-record-executable-spine-05-closeout.mjs",
  "scripts/execution-platform-record-contract-spine-queue.mjs",
  "scripts/execution-platform-record-executable-spine-recovery-queue.mjs",
  "scripts/execution-platform-record-contract-spine-08-closeout.mjs",
  "scripts/execution-platform-run-structured-tool-schema-adapter-proof.mjs",
  "extensions/execution-platform/src/workflows/work-intent.ts",
  "extensions/execution-platform/src/workflows/work-intent.test.ts",
  "scripts/execution-platform-record-scheduler-workintent-demand-context-gate-closeout.mjs",
  "scripts/execution-platform-record-workintent-contract-compiler-closeout.mjs",
  "scripts/execution-platform-record-model-contract-compiler-consolidation-closeout.mjs",
  "scripts/execution-platform-run-product-spec-planning-direct-after-staged-scheduler.mjs",
  "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts",
  "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.test.ts",
  "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/codex-parity-implementation-bridge.test.ts",
  "extensions/execution-platform/src/codex-bridge/coding-team-implementation-bridge.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.test.ts",
  "extensions/execution-platform/src/codex-bridge/file-edit-worker-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts",
  "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts",
  "extensions/execution-platform/src/codex-bridge/non-codex-worker-contracts.ts",
  "extensions/execution-platform/src/codex-bridge/worker-controller-author-applicator.ts",
  "extensions/execution-platform/src/codex-bridge/worker-controller-author-applicator.test.ts",
  "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.ts",
  "extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.test.ts",
  "scripts/execution-platform-record-worker-controller-author-applicator-closeout.mjs",
  "scripts/execution-platform-run-codex-parity-worker-loop-live-proof.mjs",
  "scripts/execution-platform-run-proof-hardening-06-worker-smoke-matrix.mjs",
  "scripts/execution-platform-run-proof-hardening-07-adversarial-entry-suite.mjs",
  "extensions/execution-platform/src/workflows/worker-start-contract.ts",
  "extensions/execution-platform/src/workflows/worker-start-contract.test.ts",
  "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
  "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
  "extensions/execution-platform/src/workflows/worker-context-native-tools.ts",
] as const;

const LINE_REDUCTION_TARGETS = [
  ...DELETED_RUNTIME_TARGETS,
  "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
] as const;

const RETIRED_TERMS = [
  "context_synthesis",
  "contextSynthesis",
  "context-synthesis",
  "after-context-synthesis",
  "after_context_synthesis",
  "parallel-context-scout-boundary-replay",
  "context-scout-boundary-replay",
  "postSynthesis",
  "post-synthesis",
  "legacy_resource_fulfillment",
  "contextSupply",
  "context-supply",
  "contextHandoff",
  "context-handoff",
  "contextFocus",
  "context-objective-focus",
  "contextDemand",
  "context-demand-session",
  "context_ledger",
  "contextLedger",
  "requiredContextKinds",
  "requiresContext",
  "WorkflowContextNeed",
  "contextNeeds",
  "repoContextAccess",
  "externalContextAccess",
  "handoffPacketRequired",
  "contextDistributionValueRequired",
  "default_resource_scout_fanout",
  "resource_broker.dispatch_resource_scout",
  "runtime_policy_node_scoped_resource_fulfillment_created",
  "CommitmentWorkPacket",
  "commitmentWorkPackets",
  "requireModelAuthoredCommitmentWorkPacketsForComplexMission",
  "ObligationGraph",
  "obligationGraph",
  "obligation_graph",
  "obligation-graph",
  "obligation_inventory",
  "obligation_discovery_brief_tool",
  "obligation_inventory_tool",
  "mission.obligation_graph",
  "obligation.semantic_content",
  "obligation.targeted_normalization",
  "obligation_semantic_content",
  "obligation_targeted_normalization",
  "mission_ledger.production_single_pass",
  "mission_ledger_compile",
  "scheduler.mission_ledger_readiness",
  "requireMissionLedgerForExecutionWorkflow",
  "missionLedgerMode",
  "DiscoveryBriefSet",
  "SchedulerIntakePacket",
  "execution_platform.discovery_brief_set",
  "execution_platform.scheduler_intake_packet",
  "schedulerIntakePacketRef",
  "createGatewayNodeAgentSessionRunner",
  "createGatewayProviderToolTurnClient",
] as const;

const MANIFEST_METADATA_MAX_BYTES = 16 * 1024;

const MANIFEST_BODY_FIELD_KEYS = new Set([
  "blockedSurvivorRefs",
  "fullReport",
  "hardFailures",
  "numstat",
  "rawCommandLog",
  "rawCommandLogs",
  "rawDbRows",
  "rawProviderLog",
  "rawProviderLogs",
  "rawPrompt",
  "rawResponse",
  "rawToolLog",
  "rawToolLogs",
  "rawTranscript",
  "report",
  "secret",
  "secrets",
  "survivorRefs",
]);

const HARD_FAILURE_CHECKS: Array<{
  checkId: string;
  file: string;
  patterns: string[];
  reasonCode: string;
}> = [
  {
    checkId: "workflow_barrel_exports_context_synthesis",
    file: "extensions/execution-platform/src/workflows/index.ts",
    patterns: ["./context-synthesis.ts", "./post-synthesis-graph-policy.ts"],
    reasonCode: "retired_context_synthesis_barrel_export_blocked",
  },
  {
    checkId: "codex_bridge_barrel_exports_context_replay",
    file: "extensions/execution-platform/src/codex-bridge/index.ts",
    patterns: ["./context-scout-boundary-replay.ts", "./parallel-context-scout-boundary-replay.ts"],
    reasonCode: "retired_boundary_replay_barrel_export_blocked",
  },
  {
    checkId: "boundary_replay_registry_exposes_after_context_synthesis",
    file: "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
    patterns: [
      '"after-context-synthesis"',
      '"after_context_synthesis"',
      "--allow-legacy-context-synthesis-boundary",
      "OPENCLAW_ALLOW_LEGACY_CONTEXT_SYNTHESIS_REPLAY",
    ],
    reasonCode: "after_context_synthesis_boundary_resurrection_blocked",
  },
  {
    checkId: "dynamic_runner_registers_context_synthesis_executor",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      "contextSynthesisExecutor",
      'from "../workflows/context-synthesis.ts"',
      "CONTEXT_SYNTHESIS_ARTIFACT_TYPE",
      "context_synthesis_core_model_call",
      "context_synthesis_group_expansion_model_call",
    ],
    reasonCode: "context_synthesis_executor_registration_blocked",
  },
  {
    checkId: "product_spec_replay_runs_context_synthesis",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "createContextSynthesisReplayExecutor",
      "buildContextSynthesisInputManifest",
      "context_synthesis_model_call_started",
      "CONTEXT_SYNTHESIS_ARTIFACT_TYPE",
    ],
    reasonCode: "product_spec_replay_context_synthesis_execution_blocked",
  },
  {
    checkId: "product_spec_replay_constructs_worker_packets_outside_runner",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "buildImplementationTaskPacket(",
      "compileNodeExecutionPacketForImplementationTask(",
      "buildNodeLifecycleWorkerStartArtifactsFromGraphNode",
    ],
    reasonCode: "product_spec_replay_must_not_construct_worker_packets_outside_node_runner",
  },
  {
    checkId: "node_lifecycle_runner_no_bespoke_worker_packet_or_microphase_surface",
    file: "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.ts",
    patterns: [
      "./worker-execution-packets.ts",
      "NodeLifecycleWorkerSession",
      "NodeLifecycleWorkerTurnPlan",
      "projectNodeLifecycleWorker",
      "node_lifecycle_worker_turn_plan",
      "worker.context.search",
      "worker.edit.plan",
      "worker.patch.author_edit",
      "buildNodeLifecycleWorkerStartArtifactsFromGraphNode",
    ],
    reasonCode:
      "node_lifecycle_runner_must_prepare_native_agent_sessions_not_worker_packet_or_microphase_surfaces",
  },
  {
    checkId: "node_lifecycle_descriptors_no_worker_tool_transitions",
    file: "extensions/execution-platform/src/workflows/node-lifecycle-transition-descriptors.ts",
    patterns: [
      "worker.context.",
      "worker.edit.",
      "worker.patch.",
      "worker.validation.",
      "worker.evidence.",
      "worker.escalation.",
      "worker_loop",
    ],
    reasonCode:
      "node_lifecycle_descriptors_must_expose_native_agent_session_transitions_not_worker_tool_menus",
  },
  {
    checkId: "product_spec_replay_exposes_retired_resource_materialization_boundaries",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      '"before_resource_materialization"',
      '"after_resource_materialization"',
      "after_resource_materialization_worker_smoke_completed",
      "resource_fulfillment_handoff_artifact_missing",
    ],
    reasonCode: "product_spec_replay_retired_resource_materialization_boundary_blocked",
  },
  {
    checkId: "worker_loop_exposes_retired_context_tool_dialect",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: [
      "worker.context.request_more",
      "worker.context.propose_searches",
      "worker.context.propose_discovery_strategy",
      "worker.context.inspect_scope_manifest",
      "worker.context.open_ref",
      "worker.context.open_around_match",
      "worker.context.open_window",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_adjacent",
      "worker.context.report_pattern",
      "worker.context.report_risk",
      "worker.context.report_edit_point",
      "worker.context.provide_bounded_snapshot",
      "worker.context.deny_request",
      "WorkerDiscoveryBrief",
      "lexicalAnchorRefs",
      "discoveryBrief",
    ],
    reasonCode: "worker_loop_must_use_runner_owned_native_minimal_context_tools",
  },
  {
    checkId: "worker_contract_exports_retired_context_tool_dialect",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-worker-contracts.ts",
    patterns: [
      "worker.context.request_more",
      "worker.context.propose_searches",
      "worker.context.propose_discovery_strategy",
      "worker.context.inspect_scope_manifest",
      "worker.context.open_ref",
      "worker.context.open_around_match",
      "worker.context.open_window",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_adjacent",
      "worker.context.report_pattern",
      "worker.context.report_risk",
      "worker.context.report_edit_point",
      "worker.context.provide_bounded_snapshot",
      "worker.context.deny_request",
    ],
    reasonCode: "worker_contract_must_not_register_retired_context_tool_ids",
  },
  {
    checkId: "worker_execution_packet_exports_retired_start_payload",
    file: "extensions/execution-platform/src/workflows/worker-execution-packets.ts",
    patterns: [
      "WorkerDiscoveryBrief",
      "WorkerDiscoveryBriefSchema",
      "lexicalAnchorRefs",
      "discoveryBrief",
    ],
    reasonCode: "worker_start_contract_must_not_require_separate_discovery_seed_payload",
  },
  {
    checkId: "product_spec_replay_passes_retired_worker_start_payload",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: ["lexicalAnchorRefs", "discoveryBrief"],
    reasonCode: "product_spec_replay_must_not_pass_retired_worker_start_payload",
  },
  {
    checkId: "codex_parity_worker_proof_exposes_retired_context_tool_dialect",
    file: "scripts/execution-platform-run-codex-parity-worker-loop-live-proof.mjs",
    patterns: [
      "worker.context.request_more",
      "worker.context.propose_searches",
      "worker.context.propose_discovery_strategy",
      "worker.context.inspect_scope_manifest",
      "worker.context.open_ref",
      "worker.context.open_around_match",
      "worker.context.open_window",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_adjacent",
      "worker.context.report_pattern",
      "worker.context.report_risk",
      "worker.context.report_edit_point",
      "worker.context.provide_bounded_snapshot",
      "worker.context.deny_request",
    ],
    reasonCode: "codex_parity_worker_proof_must_use_canonical_native_context_tools",
  },
  {
    checkId: "dynamic_runner_does_not_attach_pre_worker_materialization_artifacts",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      "ImplementationContextPacketSchema",
      "ImplementationContextCompileResult",
      "attachImplementationContextPayloadArtifacts",
      "implementation_context_packet",
      "implementation_resource_materialization_result",
      "implementation_context_materialization",
      "materializeSplitRequiredImplementationTaskNodes",
      "sourceImplementationContextPacketRef",
    ],
    reasonCode: "dynamic_runner_must_start_worker_owned_context_without_pre_worker_materialization",
  },
  {
    checkId: "boundary_replay_registry_exposes_retired_resource_materialization",
    file: "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
    patterns: [
      '"before_resource_materialization"',
      '"after_resource_materialization"',
      '"before-resource-materialization"',
      '"after-resource-materialization"',
    ],
    reasonCode: "boundary_replay_registry_retired_resource_materialization_boundary_blocked",
  },
  {
    checkId: "worker_loop_reintroduces_local_lifecycle_overrides",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: ["activeLifecycleAllows", "lifecycleRequiredToolIds"],
    reasonCode: "worker_loop_must_not_override_node_runner_legal_transitions",
  },
  {
    checkId: "worker_loop_repair_text_exposes_patch_author_before_plan",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: [
      "The next patch-lane turn must call worker.edit.plan, worker.edit.apply_patch",
      "The next turn must call worker.edit.plan, worker.edit.apply_patch",
      "The next turn must call worker.edit.apply_patch with a precise",
    ],
    reasonCode: "worker_prompt_must_not_expose_patch_author_before_runner_plan_gate",
  },
  {
    checkId: "middle_lane_proof_uses_deleted_prompt_only_lifecycle_scripts",
    file: "scripts/execution-platform-run-product-spec-middle-lane-replay-proof.mjs",
    patterns: [
      "execution-platform-run-context-scout-specialist-subturn-real-model-proof.mjs",
      "execution-platform-run-worker-readiness-edit-evidence-real-model-proof.mjs",
      "execution-platform-run-target-selection-real-model-proof.mjs",
    ],
    reasonCode: "middle_lane_proof_must_use_runner_owned_lifecycle_path",
  },
  {
    checkId: "scheduler_retired_node_scoped_resource_fulfillment_helper",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "nodeScopedResourceFulfillmentRequired(",
      "deterministicNodeScopedResourceFulfillmentDecision",
      "resource_broker.dispatch_resource_scout",
      "runtime_policy_node_scoped_resource_fulfillment_created",
    ],
    reasonCode: "retired_scheduler_graph_context_fanout_helper_blocked",
  },
  {
    checkId: "scheduler_imports_post_synthesis_policy",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["./post-synthesis-graph-policy.ts", "validatePostSynthesisGraphDecision("],
    reasonCode: "post_synthesis_policy_import_blocked",
  },
  {
    checkId: "legacy_context_synthesis_compatibility_flags",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "OPENCLAW_ALLOW_LEGACY_CONTEXT_SYNTHESIS_REPLAY",
      "--allow-legacy-context-synthesis-boundary",
    ],
    reasonCode: "legacy_context_synthesis_compatibility_flag_blocked",
  },
  {
    checkId: "product_spec_closeout_reads_shared_mutable_replay_outputs",
    file: "scripts/execution-platform-record-executable-spine-06-closeout.mjs",
    patterns: [
      ".artifacts/execution-platform/product-spec-boundary-replay-result.json",
      ".artifacts/execution-platform/product-spec-replay-proof-admission-gate.json",
      ".artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json",
      "product-spec-replay-mpl69vto",
      "team-run-native-exec-12fa6ecec70ecb9a-checkpoint-replay-mpl69vtn-runtime-work-graph",
    ],
    reasonCode:
      "product_spec_proof_closeout_must_read_run_scoped_manifest_not_shared_stale_artifacts",
  },
  {
    checkId: "worker_loop_exposes_no_packet_diagnostic_tool_surface",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: [
      "DIAGNOSTIC_MODEL_FACING_TOOL_IDS",
      "worker_lifecycle_tool_surface_diagnostic_non_production_input_without_node_packet",
    ],
    reasonCode: "no_packet_broad_worker_tool_surface_blocked",
  },
  {
    checkId: "scheduler_workintent_promotion_bypass_path_deleted",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["runtime_policy_work_intent_promotion_bypassed_orchestrator_decision"],
    reasonCode: "workintent_promotion_bypass_path_must_be_deleted",
  },
  {
    checkId: "scheduler_executable_readiness_owner_deleted",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "function evaluateRuntimeNodeTransitionReadiness",
      "evaluateRuntimeNodeTransitionReadiness(",
      "private async blockNodeForTransitionPrecondition",
      "blockNodeForTransitionPrecondition(",
      "requireFreshContextSnapshotsForWorkerExecution",
      "nodeRequiresFreshContextSnapshot",
      "nodeUsesWorkerOwnedContextDiscovery",
      "validateNodeContextSnapshots",
      "scheduler_node_context_freshness",
      "context_freshness_blocked",
    ],
    reasonCode: "scheduler_must_not_own_executable_node_lifecycle_readiness",
  },
  {
    checkId: "workflow_plugins_do_not_toggle_lifecycle_ownership",
    file: "extensions/execution-platform/src/workflows/workflow-plugin.ts",
    patterns: ["requireFreshContextSnapshotsForWorkerExecution"],
    reasonCode: "workflow_plugins_must_not_expose_lifecycle_owner_toggle_options",
  },
  {
    checkId: "coding_plugin_does_not_toggle_pre_worker_context_gate",
    file: "extensions/execution-platform/src/workflows/agent-team-coding-plugin.ts",
    patterns: ["requireFreshContextSnapshotsForWorkerExecution"],
    reasonCode: "coding_plugin_must_not_toggle_pre_worker_context_gate",
  },
  {
    checkId: "implementation_context_does_not_block_worker_start",
    file: "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts",
    patterns: [
      '"block_implementation"',
      "implementation_context_packet_context_blocks_implementation",
    ],
    reasonCode: "implementation_context_must_request_worker_context_not_block_worker_start",
  },
  {
    checkId: "production_imports_no_retired_commitment_packet_contract",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "CommitmentWorkPacket",
      "commitmentWorkPackets",
      "requireModelAuthoredCommitmentWorkPacketsForComplexMission",
      "./mission-work-packets.ts",
    ],
    reasonCode: "retired_commitment_work_packet_scheduler_dependency_blocked",
  },
  {
    checkId: "dynamic_runner_no_retired_commitment_packet_contract",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      "CommitmentWorkPacket",
      "commitmentWorkPackets",
      "requireModelAuthoredCommitmentWorkPacketsForComplexMission",
      "../workflows/mission-work-packets.ts",
    ],
    reasonCode: "retired_commitment_work_packet_dynamic_runner_dependency_blocked",
  },
  {
    checkId: "product_spec_replay_no_retired_commitment_packet_contract",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "CommitmentWorkPacket",
      "commitmentWorkPackets",
      "requireModelAuthoredCommitmentWorkPacketsForComplexMission",
      "mission-work-packets.ts",
    ],
    reasonCode: "retired_commitment_work_packet_replay_dependency_blocked",
  },
  {
    checkId: "node_resource_materialization_not_worker_start_owner",
    file: "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
    patterns: [
      '"block_implementation"',
      "contextRefreshBlocksImplementation",
      "node_readiness_implementation_context_blocks_implementation",
    ],
    reasonCode: "node_resource_materialization_must_not_own_worker_start_context_blockers",
  },
  {
    checkId: "scheduler_pre_worker_resource_focus_helpers_deleted",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "requestResourceObjectiveFocusForPrecondition",
      "applyResourceObjectiveFocusSelectorForPrecondition",
      "openNodeLocalNodeResourceDemandForPrecondition",
      "fulfillNodeLocalNodeResourceDemandForPrecondition",
      "resource.focus.request_for_work_intent",
      "resource.focus.selector_missing",
      "resource_objective_focus_required",
      "node_resource_demand_required",
      "node_local_node_resource_demand_required_before_execution",
      "node_local_node_resource_demand_required_before_materialization",
    ],
    reasonCode: "scheduler_pre_worker_resource_focus_and_demand_owner_blocked",
  },
  {
    checkId: "canonical_readback_reason_code_lifecycle_inference_deleted",
    file: "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
    patterns: [
      "NODE_RESOURCE_DEMAND_REASON_CODES",
      "CONTEXT_FOCUS_REQUIRED_REASON_CODES",
      "CONTEXT_FOCUS_BLOCKED_REASON_CODES",
      "exactHas(reasonCodes",
      "node_local_node_resource_demand_required_before_execution",
      "node_resource_demand_required",
      "accepted_resource_objective_focus_required",
    ],
    reasonCode: "canonical_readback_must_not_infer_lifecycle_from_reason_code_bags",
  },
  {
    checkId: "checkpoint_proof_legacy_resource_gate_map_deleted",
    file: "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
    patterns: [
      '"resource_focus_required"',
      '"resource_demand_open_pending"',
      '"resource_demand_open"',
      '"resource_demand_blocked"',
      "nodeReadinessNextAllowedTransitions",
    ],
    reasonCode: "checkpoint_proof_must_project_runner_lifecycle_not_legacy_resource_gates",
  },
  {
    checkId: "checkpoint_proof_source_prompt_context_index_gate_deleted",
    file: "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
    patterns: [
      "execution_platform.source_prompt_context_index",
      "source_prompt_context_unresolved",
      'gateId: "source_prompt_context"',
    ],
    reasonCode: "checkpoint_proof_must_use_source_prompt_artifact_and_mission_ledger_grounding",
  },
  {
    checkId: "boundary_replay_source_prompt_context_index_gate_deleted",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "execution_platform.source_prompt_context_index",
      "source_prompt_context_unresolved",
      'gateId: "source_prompt_context"',
    ],
    reasonCode: "boundary_replay_must_use_source_prompt_artifact_and_mission_ledger_grounding",
  },
  {
    checkId: "runtime_artifact_contract_source_prompt_context_index_deleted",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: [
      "execution_platform.source_prompt_context_index",
      "SourcePromptContextIndex",
      "sourcePromptContextIndexBody",
    ],
    reasonCode:
      "runtime_artifact_contracts_must_not_register_source_prompt_context_index_as_production_body_artifact",
  },
  {
    checkId: "intake_runner_source_prompt_context_index_owner_deleted",
    file: "extensions/execution-platform/src/workflows/intake-stage-runner.ts",
    patterns: [
      "SourcePromptContextIndex",
      "sourcePromptContextIndex",
      "sourcePromptContextIndexRef",
      "execution_platform.source_prompt_context_index",
    ],
    reasonCode:
      "intake_runner_must_not_use_deterministic_source_prompt_section_index_as_semantic_grounding",
  },
  {
    checkId: "obligation_graph_inline_discovery_brief_deleted",
    file: "extensions/execution-platform/src/workflows/obligation-graph.ts",
    patterns: [
      "ObligationDiscoveryBrief",
      "OBLIGATION_DISCOVERY_TOOL_IDS",
      "obligation.discovery.",
      "discoveryBrief:",
    ],
    reasonCode: "obligation_graph_must_not_own_discovery_brief_or_discovery_tool_dialect",
  },
  {
    checkId: "workflow_barrel_exports_obligation_graph",
    file: "extensions/execution-platform/src/workflows/index.ts",
    patterns: ["./obligation-graph.ts"],
    reasonCode: "retired_obligation_graph_barrel_export_blocked",
  },
  {
    checkId: "runtime_artifact_contract_registers_obligation_graph",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: ["execution_platform.obligation_graph", "ObligationGraph", "obligationGraph"],
    reasonCode: "retired_obligation_graph_artifact_contract_blocked",
  },
  {
    checkId: "runtime_artifact_contract_registers_retired_intake_products",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: [
      "DiscoveryBriefSet",
      "SchedulerIntakePacket",
      "execution_platform.discovery_brief_set",
      "execution_platform.scheduler_intake_packet",
      "discoveryBriefSet",
      "schedulerIntakePacket",
    ],
    reasonCode: "runtime_artifact_contract_must_not_register_retired_intake_products",
  },
  {
    checkId: "runtime_scheduler_accepts_scheduler_intake_packet_ref",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["schedulerIntakePacketRef"],
    reasonCode: "runtime_scheduler_must_not_accept_retired_scheduler_intake_packet",
  },
  {
    checkId: "model_task_registers_obligation_graph_tools",
    file: "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
    patterns: [
      "obligation_inventory_tool",
      "obligation_discovery_brief_tool",
      "mission.obligation_graph",
    ],
    reasonCode: "retired_obligation_graph_model_task_boundary_blocked",
  },
  {
    checkId: "model_task_registers_retired_intake_authoring_boundaries",
    file: "extensions/execution-platform/src/model-tasks/model-task-classification.ts",
    patterns: [
      "obligation.semantic_content",
      "obligation.targeted_normalization",
      "obligation_semantic_content",
      "obligation_targeted_normalization",
      "mission_ledger.production_single_pass",
      "mission_ledger_compile",
      "mission_ledger.compile",
    ],
    reasonCode: "retired_intake_authoring_model_task_boundary_blocked",
  },
  {
    checkId: "scheduler_runtime_tools_no_mission_ledger_readiness",
    file: "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    patterns: ["scheduler.mission_ledger_readiness"],
    reasonCode: "scheduler_mission_ledger_prework_readiness_tool_blocked",
  },
  {
    checkId: "scheduler_no_mission_ledger_prework_gate",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "evaluateMissionLedgerBeforeWork",
      "scheduler.mission_ledger_readiness",
      "mission_contract_ledger_required_for_execution_workflow",
      "scheduler_child_work_blocked_until_mission_ledger_valid",
      "missionLedgerSummary: input.missionLedger\n        ? summarizeMissionContractLedger(input.missionLedger)\n        : null,\n      requirementMap",
    ],
    reasonCode: "scheduler_must_not_gate_prework_on_mission_ledger",
  },
  {
    checkId: "scheduler_stage_runner_no_mission_ledger_inputs",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: ["missionLedger", "missionLedgerSummary", "MissionContractLedger", "mission_ledger"],
    reasonCode: "scheduler_stage_runner_must_not_consume_mission_ledger_before_scheduling",
  },
  {
    checkId: "intake_runner_no_mission_ledger_authoring_or_persistence",
    file: "extensions/execution-platform/src/workflows/intake-stage-runner.ts",
    patterns: ["missionLedger", "missionLedgerSummary", "MissionContractLedger", "mission_ledger"],
    reasonCode: "intake_runner_must_not_author_or_persist_mission_ledger_before_scheduling",
  },
  {
    checkId: "intake_requirement_map_uses_shared_model_tool_turn_transport",
    file: "extensions/execution-platform/src/workflows/intake-stage-runner.ts",
    patterns: [
      "missionModelClient!.runTools",
      "missionModelClient.runTools(",
      "missionModelClient?.runTools",
      ".callTools(",
      ".executeTools(",
      ".runJson(",
    ],
    reasonCode: "intake_requirement_map_phases_must_use_shared_runner_owned_tool_turn_transport",
  },
  {
    checkId: "intent_front_door_router_no_direct_provider_tool_transport",
    file: "extensions/execution-platform/src/intent-front-door/live-structured-router-provider.ts",
    patterns: [
      '"/chat/completions"',
      "extractOpenRouterNativeRouterToolCalls",
      "response.json().catch",
    ],
    reasonCode:
      "intent_front_door_router_must_use_shared_provider_tool_transport_not_direct_provider_fetch",
  },
  {
    checkId: "model_tool_turn_transport_uses_canonical_provider_tool_turn",
    file: "extensions/execution-platform/src/workflows/model-tool-turn-transport.ts",
    patterns: ["modelClient.runTools", "input.modelClient.runTools", ".executeTools("],
    reasonCode:
      "model_tool_turn_transport_must_delegate_to_canonical_provider_tool_turn_not_legacy_transport_names",
  },
  {
    checkId: "non_codex_worker_no_model_facing_record_basis_tool",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: ["worker.context.record_basis"],
    reasonCode:
      "worker_context_basis_must_be_metadata_on_native_search_open_refine_accept_not_model_facing_tool",
  },
  {
    checkId: "non_codex_worker_no_json_shaped_tool_selection_transport",
    file: "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    patterns: [
      "parseModelToolCalls",
      "JSON5",
      "MODEL_FACING_WORKER_TOOL_ALIASES",
      "normalizeModelFacingWorkerToolCall",
      "Return exactly one JSON object with a toolCalls",
      "modelClient.nextTurn(",
    ],
    reasonCode:
      "worker_model_choices_must_use_provider_native_tools_through_runner_owned_transport",
  },
  {
    checkId: "scheduler_stage_runner_uses_shared_model_tool_turn_transport",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [".runTools(", ".runJson(", ".callTools(", ".executeTools("],
    reasonCode: "scheduler_stage_runner_must_use_shared_runner_owned_tool_turn_transport",
  },
  {
    checkId: "boundary_replay_no_direct_scheduler_provider_tool_transport",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "const toolBatch = await modelClient.runTools",
      "modelClient.runTools(",
      "schedulerCanonicalToolIdFromProviderName",
      "boundary_replay_scheduler_native_batch_tool_client_missing",
    ],
    reasonCode: "boundary_replay_scheduler_tools_must_delegate_to_scheduler_stage_runner_transport",
  },
  {
    checkId: "boundary_replay_no_retired_worker_resource_handoff_boundary",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "execution_platform.resource_scout_tool_loop",
      "execution_platform.resource_handoff_packet",
      "after-resource-handoff",
      "resourceFulfillmentSummary",
      "accepted_node_scoped_context_required_before_after_graph_selection_replay",
    ],
    reasonCode:
      "boundary_replay_must_not_reintroduce_pre_worker_resource_handoff_or_context_readiness",
  },
  {
    checkId: "embedded_runner_preserves_skills_when_tools_are_restricted",
    file: "src/agents/pi-embedded-runner/run/attempt.ts",
    patterns: ["strip skills catalog", "effectiveSkillsPrompt = params.toolsAllow"],
    reasonCode: "embedded_runner_must_not_hide_agent_skills_when_tools_allow_restricts_the_menu",
  },
  {
    checkId: "scheduler_stage_runner_no_provider_specific_tool_transport_downgrade",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      'providerPath === "openrouter"',
      'providerPath !== "openrouter"',
      "batch_transport_should_not_be_called_for_codex_provider",
    ],
    reasonCode:
      "scheduler_stage_runner_must_not_downgrade_codex_or_other_providers_to_single_tool_dialects",
  },
  {
    checkId: "scheduler_graph_patch_compiler_no_runtime_identity",
    file: "extensions/execution-platform/src/workflows/scheduler-graph-patch.ts",
    patterns: [
      "runtimeNodeId",
      "runtimeNodeIdBySeedId",
      "tailRuntimeNodeId",
      "node-${safeId(workUnitId",
      "node-mission-",
    ],
    reasonCode:
      "scheduler_graph_patch_compiler_must_emit_semantic_seed_ids_runtime_persistence_owns_node_ids",
  },
  {
    checkId: "requirement_map_no_pre_scheduler_dependency_intent_schema",
    file: "extensions/execution-platform/src/workflows/requirement-map.ts",
    patterns: ["dependencyIntent", "requirement.add_dependency_intent"],
    reasonCode: "requirement_map_must_not_author_dependency_intent_before_scheduler_ordering",
  },
  {
    checkId: "runtime_artifact_contracts_no_retired_resource_handoff_payload",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: [
      "execution_platform.resource_handoff_packet",
      "ResourceHandoffPacketSchema",
      "runtime-artifact.resource-handoff-packet.v1",
    ],
    reasonCode:
      "runtime_artifact_contracts_must_not_preserve_retired_worker_start_resource_handoff_packet",
  },
  {
    checkId: "scheduler_runtime_tools_no_retired_worker_context_tool_ids",
    file: "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    patterns: [
      "worker.context.search",
      "worker.context.open",
      "worker.context.refine_window",
      "worker.context.block",
    ],
    reasonCode:
      "scheduler_runtime_tools_must_not_expose_retired_ep_worker_context_tools_after_native_agent_sessions",
  },
  {
    checkId: "workflow_barrel_no_retired_worker_start_or_context_loop_exports",
    file: "extensions/execution-platform/src/workflows/index.ts",
    patterns: ["./worker-start-contract.ts", "./context-scout-tool-loop.ts"],
    reasonCode: "workflow_barrel_must_not_export_retired_worker_start_contract_or_ep_context_loop",
  },
  {
    checkId: "canonical_readback_no_retired_worker_context_reason_interpretation",
    file: "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
    patterns: [
      "worker_context_tool_parse_failure",
      "worker_context_search_not_executed",
      "non_codex_worker_context_search_not_executed",
      "worker_context_window_acceptance_missing",
    ],
    reasonCode: "canonical_readback_must_not_interpret_retired_ep_worker_context_reason_codes",
  },
  {
    checkId: "repair_classification_no_retired_worker_context_reason_interpretation",
    file: "extensions/execution-platform/src/workflows/repair-classification.ts",
    patterns: [
      "worker_context_tool_parse_failure",
      "worker_context_search_not_executed",
      "worker_context_window_acceptance_missing",
      "worker_context_required",
    ],
    reasonCode:
      "repair_classification_must_not_route_retired_worker_context_reasons_after_native_agent_sessions",
  },
  {
    checkId: "intake_runner_no_pre_scheduler_dependency_intent_prompting",
    file: "extensions/execution-platform/src/workflows/intake-stage-runner.ts",
    patterns: ["dependencyIntent", "requirement.add_dependency_intent"],
    reasonCode:
      "intake_runner_must_not_prompt_or_persist_dependency_intent_before_scheduler_ordering",
  },
  {
    checkId: "scheduler_requirement_inventory_no_runnable_flag_or_dependency_intent",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: ["schedulerRunnable", "dependencyIntentRefs", "rawStorageFlags"],
    reasonCode:
      "scheduler_requirement_inventory_must_derive_visibility_and_ordering_from_runner_owned_state",
  },
  {
    checkId: "dynamic_coding_team_model_client_no_run_tools_wrapper",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-coding-team-orchestrator.ts",
    patterns: ["runTools"],
    reasonCode: "dynamic_coding_team_model_client_must_expose_only_execute_provider_tool_turn",
  },
  {
    checkId: "dynamic_agent_team_runner_no_run_tools_wrapper",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: ["runTools("],
    reasonCode: "dynamic_agent_team_graph_runner_must_not_keep_run_tools_compatibility_wrapper",
  },
  {
    checkId: "dynamic_agent_team_runner_no_legacy_worker_execution_packets_or_loop",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      "buildImplementationTaskPacket",
      "buildWorkerStartContract",
      "ImplementationTaskPacket",
      "WorkerStartContract",
      "workerExecutionPackets",
      "execution_platform.worker_start_contract",
      "worker_start_contract",
      "new NonCodexToolUsingWorkerLoop",
      "new ModelAgnosticFileEditWorkerAdapter",
      "worker.context",
      "worker.edit",
      "worker.patch",
      "worker.validation",
      "worker.evidence",
      "non_codex_worker_loop",
    ],
    reasonCode:
      "dynamic_agent_team_graph_runner_must_not_preserve_legacy_worker_execution_after_native_node_sessions",
  },
  {
    checkId: "dynamic_runner_scheduler_bridge_uses_scheduler_stage_transport",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      "const toolResult = await modelClient.runTool",
      "const toolBatch = await modelClient.runTools",
      "modelClient.executeProviderToolTurn(",
      "scheduler_native_batch_tool_client_missing",
    ],
    reasonCode:
      "dynamic_runner_must_delegate_model_tool_turns_to_shared_transport_or_scheduler_stage_runner",
  },
  {
    checkId: "boundary_replay_domain_resource_selection_uses_shared_model_tool_turn_transport",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "nativeToolClient.executeProviderToolTurn(",
      "modelClient.executeProviderToolTurn(",
      "boundary_replay_domain_resource_selection_native_tool_client_missing",
      "domain_resource_selection_selector_native_tool_client_missing",
    ],
    reasonCode:
      "boundary_replay_domain_resource_selection_must_use_shared_model_tool_turn_transport",
  },
  {
    checkId: "workflow_plugins_no_mission_ledger_required_toggle",
    file: "extensions/execution-platform/src/workflows/workflow-plugin.ts",
    patterns: ["requireMissionLedgerForExecutionWorkflow"],
    reasonCode: "workflow_plugin_mission_ledger_required_toggle_blocked",
  },
  {
    checkId: "dynamic_runner_no_retired_mission_ledger_authoring_mode",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: ["missionLedgerMode", "mission_ledger.production_single_pass"],
    reasonCode: "dynamic_runner_retired_mission_ledger_authoring_mode_blocked",
  },
  {
    checkId: "scheduler_stage_accepts_obligation_graph",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: ["ObligationGraph", "obligationGraph", "obligation_graph"],
    reasonCode: "scheduler_stage_must_not_accept_retired_obligation_graph",
  },
  {
    checkId: "runtime_scheduler_accepts_obligation_graph_option",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["ObligationGraph", "obligationGraph", "obligation_graph"],
    reasonCode: "runtime_scheduler_must_not_accept_retired_obligation_graph_option",
  },
  {
    checkId: "scheduler_stage_obligation_inline_discovery_fallback_deleted",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: ["input.obligation.discoveryBrief", "obligation.discoveryBrief"],
    reasonCode: "scheduler_stage_must_consume_discovery_brief_set_not_obligation_inline_discovery",
  },
  {
    checkId: "readback_maps_retired_resource_materialization_boundaries",
    file: "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
    patterns: ["before_resource_materialization:", "after_resource_materialization:"],
    reasonCode: "canonical_readback_must_not_project_retired_resource_materialization_boundaries",
  },
  {
    checkId: "repair_classifier_semantic_regex_deleted",
    file: "extensions/execution-platform/src/workflows/repair-classification.ts",
    patterns: [
      "/validation|test/iu",
      "/validation.*unrecoverable/iu",
      "/capability|qualification|high_capability|escalation_required/iu",
      "/evidence[_-]claim|evidence_mapping|commitment.*evidence/iu",
      "/closeout|finalization/iu",
    ],
    reasonCode: "repair_classifier_must_not_use_reason_code_bag_semantic_regex",
  },
  {
    checkId: "scheduler_escalate_worker_compiler_deleted",
    file: "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    patterns: [
      "compileEscalationIntent(",
      "runtime_compiled_escalate_worker_intent",
      "escalate_worker_intent_compiled",
      'schedulerCompiledFromDecisionKind: "escalate_worker"',
    ],
    reasonCode: "worker_escalation_must_be_runner_owned_not_scheduler_compiled",
  },
  {
    checkId: "superstep_reason_code_validation_escalation_deleted",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-superstep.ts",
    patterns: [
      "HIGH_CAPABILITY_ESCALATION_REASON_CODES",
      "VALIDATION_REPAIR_REASON_CODES",
      "hasExact(input.reasonCodes, HIGH_CAPABILITY_ESCALATION_REASON_CODES)",
      "hasExact(input.reasonCodes, VALIDATION_REPAIR_REASON_CODES)",
    ],
    reasonCode: "superstep_must_not_infer_validation_or_escalation_from_reason_code_bags",
  },
  {
    checkId: "scheduler_stage_inline_phase_owner_deleted",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "function evaluateSchedulerStage(",
      "function applySchedulerStagedDraftPatch(",
      "function schedulerStageProjectionForModel(",
      "function schedulerDraftStateForModel(",
      "function schedulerStageMaxToolCalls(",
      "function schedulerStageProgressSignature(",
      "function schedulerToolCallTelemetry(",
      "let cumulativeSchedulerDraft =",
      "const schedulerStageNoProgressCounts = new Map",
    ],
    reasonCode: "scheduler_stage_phase_ownership_must_live_in_scheduler_stage_runner",
  },
  {
    checkId: "scheduler_stage_runner_no_legacy_decision_compiler_inputs",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      "compileDecision(input",
      "attachRuntimeDerivedEvidenceToDecision(",
      "validateDecision(decision",
      "buildRepairRequestForRejection(input",
      "buildRejectionEnvelope(input",
      "repairFieldHintsForReasonCodes(reasonCodes",
    ],
    reasonCode:
      "scheduler_stage_runner_must_compile_scheduler_graph_patch_not_orchestrator_decision",
  },
  {
    checkId: "scheduler_stage_runner_no_retired_submit_or_json_scheduler_dialect",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      "scheduler.submit_",
      "schedulerToolCalls",
      "stagedScheduler",
      "applySchedulerStagedDraftPatch",
      "schedulerDraftStateToCompilerInput",
      "work_unit_coverage_submit_required",
      "capability_selection_submit_required",
      "node_contracts_submit_required",
      "dependency_ordering_submit_required",
      "staged_graph_submit_required",
      "patch_validation_phase_dependency",
      "patch_validation_phase_dependencies",
      "patch_review_phase_dependencies",
      "patch_closeout_phase_dependencies",
      "SchedulerStaged",
      "SCHEDULER_STAGED",
    ],
    reasonCode: "scheduler_stage_runner_retired_submit_json_dialect_blocked",
  },
  {
    checkId: "scheduler_stage_tests_no_retired_submit_or_json_scheduler_dialect",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.test.ts",
    patterns: [
      "scheduler.submit_",
      "schedulerToolCalls",
      "stagedScheduler",
      "applySchedulerStagedDraftPatch",
      "schedulerDraftStateToCompilerInput",
      "work_unit_coverage_submit_required",
      "dependency_ordering_submit_required",
      "staged_graph_submit_required",
      "patch_validation_phase_dependency",
      "SchedulerStaged",
      "SCHEDULER_STAGED",
    ],
    reasonCode: "scheduler_stage_tests_must_not_preserve_retired_scheduler_dialect",
  },
  {
    checkId: "scheduler_stage_runner_no_mutable_aggregate_tail_draft",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      "hydrateSchedulerAggregateTailWorkUnits",
      "SCHEDULER_AGGREGATE_TAIL_REQUIREMENT_KINDS",
      "SCHEDULER_AGGREGATE_TAIL_WORK_UNIT_BY_KIND",
      "scheduler_aggregate_tail_work_unit_runtime_hydrated",
      "runtimeHydratedAggregateTailWorkUnit",
    ],
    reasonCode: "scheduler_stage_runner_must_not_hydrate_mission_tail_work_units",
  },
  {
    checkId: "runtime_scheduler_no_private_validation_tail_admission_owner",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "function validateSchedulerValidationNodePhaseOrdering",
      "scheduler_validation_node_phase_ordering_rejected",
      "validation_node_phase_missing:",
      "validation_node_missing_post_work_dependency:",
    ],
    reasonCode: "runtime_scheduler_must_use_shared_scheduler_graph_admission",
  },
  {
    checkId: "runtime_scheduler_fresh_stage_no_legacy_decision_compiler_wiring",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "compileDecision: (compilerInput)",
      "validateDecision: (decision)",
      "attachRuntimeDerivedEvidenceToDecision: (decision)",
      "buildRejectionEnvelope: (envelopeInput)",
      "buildRepairRequestForRejection: (repairInput)",
    ],
    reasonCode:
      "runtime_scheduler_must_not_wire_fresh_scheduler_stage_to_orchestrator_decision_compiler",
  },
  {
    checkId: "runtime_scheduler_no_retired_workintent_scheduler_graph_path",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "scheduler.work_intent",
      "compile_work_intents",
      "accept_work_intent_graph",
      "reject_work_intent_graph",
      "promote_work_intent_to_executable",
      "compileWorkIntent(",
      "runtimeScopedStagedDecisionNodeIds",
      "complex_mission_requires_staged_scheduler_protocol",
      "schedulerToolCalls",
      "stagedScheduler",
      "stagedSchedulerProtocol",
      "scheduler.compile_staged_runtime_graph",
      "scheduler.create_graph_node",
      "scheduler.create_graph_edge",
      "scheduler.accept_staged_graph",
    ],
    reasonCode: "runtime_scheduler_retired_workintent_staged_graph_path_blocked",
  },
  {
    checkId: "scheduler_runtime_tools_no_retired_workintent_or_staged_graph_tools",
    file: "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
    patterns: [
      "scheduler.work_intent",
      "scheduler.compile_work_intents",
      "scheduler.accept_work_intent_graph",
      "scheduler.reject_work_intent_graph",
      "scheduler.promote_work_intent_to_executable",
      "scheduler.compile_staged_runtime_graph",
      "scheduler.compile_runtime_graph",
      "scheduler.finalize_decomposition_graph",
      "scheduler.create_graph_node",
      "scheduler.create_graph_edge",
      "scheduler.review_compiled_graph",
      "scheduler.accept_staged_graph",
    ],
    reasonCode: "scheduler_runtime_tools_retired_workintent_staged_graph_tools_blocked",
  },
  {
    checkId: "orchestrator_decision_no_retired_staged_scheduler_parser",
    file: "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    patterns: [
      "stagedScheduler",
      "stagedSchedulerProtocol",
      "StagedWorkBreakdownUnit",
      "runtimeDerivedStagedEdges",
      "staged_scheduler",
      "schedulerToolCalls",
    ],
    reasonCode: "orchestrator_decision_retired_staged_scheduler_parser_blocked",
  },
  {
    checkId: "scheduler_stage_runner_no_retired_workintent_trace_codes",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      "work_intent_compiled",
      "work_intent_capability_validated",
      "staged_work_intent:",
      "staged_scheduler",
    ],
    reasonCode: "scheduler_stage_runner_retired_workintent_trace_codes_blocked",
  },
  {
    checkId: "runtime_scheduler_no_legacy_worker_invoke_execution_fallback",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "worker.invoke",
      "runtimeToolNodeToolId",
      "worker_result",
      "worker_runtime_tool_call_started",
      "worker_runtime_tool_call_completed",
      "worker_runtime_tool_timeout",
      "node_executor_missing",
      "node_lifecycle_runner_blocked_worker_start_missing_executor",
    ],
    reasonCode:
      "runtime_scheduler_must_execute_nodes_only_through_runner_prepared_openclaw_agent_sessions",
  },
  {
    checkId: "runtime_capability_manifest_no_deleted_model_agnostic_worker_adapters",
    file: "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
    patterns: [
      "model_agnostic_file_edit_worker",
      "model_agnostic_tool_worker_loop",
      "non_codex_tool_using_worker_loop",
      "non_codex_test_writer",
      "non_codex_docs_editor",
      "non_codex_validation_failure_explainer",
    ],
    reasonCode:
      "runtime_capability_manifest_must_not_advertise_deleted_model_agnostic_worker_adapters",
  },
  {
    checkId: "node_agent_session_no_tool_allow_override",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "toolsAllow:",
      "toolsAllow: [",
      "toolsAllow: input",
      "toolsAllow: input.agentParams",
    ],
    reasonCode:
      "node_agent_session_must_not_use_tools_allow_because_it_strips_openclaw_skills_and_native_tools",
  },
  {
    checkId: "node_agent_session_no_direct_model_or_tool_transport",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      ".runJson(",
      ".runTools(",
      ".callTools(",
      ".executeProviderToolTurn(",
      "parseModelToolCalls",
      "Return exactly one JSON object",
    ],
    reasonCode:
      "node_agent_session_must_delegate_to_openclaw_agent_runtime_not_parallel_json_or_tool_transport",
  },
  {
    checkId: "gateway_node_agent_session_no_tool_allow_override",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: ["toolsAllow:"],
    reasonCode:
      "gateway_native_node_execution_must_use_openclaw_agent_config_and_extra_tools_not_tools_allow",
  },
  {
    checkId: "node_agent_session_no_snapshot_repo_authority_overlay",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "nodeAuthorityOverlay:",
      "nodeAuthorityOverlayFromSnapshot",
      "readablePathRefs:",
      "writablePathRefs:",
    ],
    reasonCode:
      "native_node_agent_session_must_not_treat_snapshot_refs_as_repo_discovery_authority",
  },
  {
    checkId: "node_agent_session_no_initial_task_brief_contract",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "initialTaskBrief",
      "buildNodeAgentInitialTaskBrief",
      "buildNodeAgentPromptSourceMaterial",
      "NodeAgentPromptSourceMaterial",
      "NodeAgentAuthoredTaskPrompt",
      "authorNodeAgentTaskPrompt",
      "compactNodeTaskBriefText",
    ],
    reasonCode:
      "native_node_agent_session_must_use_model_authored_worker_prompt_not_task_brief_contract",
  },
  {
    checkId: "gateway_native_node_execution_no_initial_task_brief_contract",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "initialTaskBrief",
      "buildNodeAgentInitialTaskBrief",
      "buildNodeAgentPromptSourceMaterial",
      "NodeAgentPromptSourceMaterial",
      "NodeAgentAuthoredTaskPrompt",
      "authorNodeAgentTaskPrompt",
    ],
    reasonCode: "gateway_native_node_execution_must_start_from_node_lifecycle_worker_prompt",
  },
  {
    checkId: "workflow_barrel_no_workintent_compiler_export",
    file: "extensions/execution-platform/src/workflows/index.ts",
    patterns: ["./work-intent.ts"],
    reasonCode: "workflow_barrel_retired_workintent_compiler_export_blocked",
  },
];

const REQUIRED_SOURCE_PATTERNS: Array<{
  checkId: string;
  file: string;
  patterns: string[];
  reasonCode: string;
}> = [
  {
    checkId: "expansion_admission_honors_runner_owned_lifecycle_transitions",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-expansion-controller.ts",
    patterns: [
      "metadata.runtimeOwnedLifecycleTransition === true",
      'metadata.lifecycleTransitionOwner === "NodeLifecycleTransitionRunner"',
    ],
    reasonCode: "expansion_admission_must_not_defer_runner_owned_lifecycle_transitions",
  },
  {
    checkId: "scheduler_graph_amendment_request_wired_to_stage_runner",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "buildSchedulerGraphAmendmentRequestForSnapshot({",
      "schedulerGraphPatchMode",
      "graphAmendmentRequest,",
      "scheduler_graph_amendment_request_built_from_existing_graph",
    ],
    reasonCode:
      "runtime_scheduler_must_pass_typed_graph_amendment_requests_to_scheduler_stage_runner",
  },
  {
    checkId: "scheduler_node_agent_session_start_delegates_to_runner_projection",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "node_lifecycle_runner_authorized_node_agent_session_start",
      "this.nodeLifecycleTransitionRunner.project({",
      "buildNodeLifecycleProjectionManifest(projection)",
    ],
    reasonCode: "scheduler_node_agent_session_start_must_be_runner_projection_owned",
  },
  {
    checkId: "scheduler_stage_runner_is_required_owner",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["new SchedulerStageRunner().run({"],
    reasonCode: "runtime_work_graph_scheduler_must_delegate_scheduler_stage_to_runner",
  },
  {
    checkId: "scheduler_stage_runner_owns_model_reasoning_policy",
    file: "extensions/execution-platform/src/workflows/scheduler-stage-runner.ts",
    patterns: [
      "resolveSchedulerStageModelPolicy(",
      'phase === "capability_selection_required"',
      'reasoningEffort: "none"',
      'reasoningEffort: "high"',
      'requiredTransport: "native_multi_tool_turn"',
      'parallelismPolicy: "single_turn_multi_tool"',
      '`scheduler_stage_reasoning_effort:${modelPolicy.reasoningEffort ?? "unset"}`',
    ],
    reasonCode:
      "scheduler_stage_runner_must_own_phase_model_transport_parallelism_and_reasoning_policy",
  },
  {
    checkId: "intent_front_door_router_uses_shared_provider_tool_transport",
    file: "extensions/execution-platform/src/intent-front-door/live-structured-router-provider.ts",
    patterns: [
      "createOpenRouterFetchProviderToolTurnTransport({",
      "executeProviderToolTurn({",
      "providerMessages: messages as unknown as JsonValue[]",
      '"router_provider_tool_transport_used"',
    ],
    reasonCode:
      "intent_front_door_router_must_call_shared_provider_tool_transport_under_router_stage_runner_ownership",
  },
  {
    checkId: "codex_app_server_tool_turns_document_dynamic_tool_reality",
    file: "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    patterns: [
      '"codex_app_server_dynamic_tool_events"',
      '"json_object_adapter_payload"',
      "this.executor.executeTools(request)",
      "dynamicToolEventsCaptured: true",
    ],
    reasonCode:
      "codex_app_server_tool_turns_must_be_labeled_as_dynamic_tool_events_not_json_scheduler_transport",
  },
  {
    checkId: "codex_app_server_executor_registers_dynamic_tools",
    file: "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts",
    patterns: [
      "dynamicTools: buildCodexDynamicTools(request)",
      'rpcRequest.method !== "item/tool/call"',
      "readDynamicToolCallParams(rpcRequest.params)",
      "capturedToolCalls.push({",
    ],
    reasonCode: "codex_app_server_executor_must_use_app_server_dynamic_tool_events_for_tool_turns",
  },
  {
    checkId: "node_lifecycle_runner_prepares_native_node_execution_snapshot",
    file: "extensions/execution-platform/src/workflows/node-lifecycle-transition-runner.ts",
    patterns: [
      "prepareAgentSessionStart(",
      "resolveNodeAgentProfile",
      "node_lifecycle_runner_blocked_openclaw_agent_session_start",
      "recordNodeExecutionSnapshot",
      "buildNodeExecutionSnapshotFromGraphNode({",
    ],
    reasonCode: "node_lifecycle_runner_must_compile_and_persist_native_node_execution_snapshot",
  },
  {
    checkId: "scheduler_passes_node_agent_profile_resolver_to_lifecycle_runner",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "resolveNodeAgentProfile?: NodeLifecycleTransitionRunnerOptions",
      "resolveNodeAgentProfile: this.options.resolveNodeAgentProfile",
    ],
    reasonCode: "scheduler_must_let_node_lifecycle_runner_own_openclaw_agent_profile_resolution",
  },
  {
    checkId: "scheduler_invokes_runner_prepared_native_node_agent_session",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["prepareAgentSessionStart({", "nodeAgentSessionRunner", "node.agent_session.invoke"],
    reasonCode:
      "runtime_scheduler_must_delegate_worker_node_execution_to_runner_prepared_openclaw_agent_session",
  },
  {
    checkId: "gateway_wires_openclaw_node_session_executor",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "createOpenClawNodeSessionExecutor",
      "createOpenRouterProviderTextTurnClient({",
      "authorNodeExecutionPrompt({",
      "runNodeAgentSession({",
      "createExecutionPlatformResourceReadTool({",
      "nodeAgentSessionRunner: createOpenClawNodeSessionExecutor({",
      "promptTextModelClient",
    ],
    reasonCode:
      "gateway_must_wire_native_node_execution_through_shared_openclaw_executor_and_canonical_transport",
  },
  {
    checkId: "product_spec_boundary_replay_uses_shared_node_executor_and_worker_preflight",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "createGatewayRoleModelClient",
      "createOpenRouterProviderTextTurnClient({",
      "createOpenClawNodeSessionExecutor({",
      "workerExecutionPreflight",
      "promptTextModelClientPresent",
      "node_worker_prompt_transport_missing",
      "if (executeWorkers && !workerExecutionPreflight.promptTextModelClientPresent)",
    ],
    reasonCode:
      "boundary_replay_must_use_shared_openclaw_node_executor_and_preflight_worker_transport_before_scheduling",
  },
  {
    checkId: "gateway_node_start_adapter_requires_native_plan_and_subagent_tools",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "prepareOpenClawNodeStart(",
      '"update_plan"',
      '"sessions_spawn"',
      '"sessions_yield"',
      '"subagents"',
      '"agents_list"',
      '"list"',
      '"glob"',
      '"grep"',
      "resolveEffectiveToolPolicyAccess({",
      "localPolicyExplicit",
      "effectiveProfileSource",
    ],
    reasonCode: "gateway_node_start_adapter_must_require_native_plan_and_subagent_tools",
  },
  {
    checkId: "node_agent_session_authors_worker_prompt_with_text_model_turn",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "authorNodeExecutionPrompt(",
      "executeModelTurn({",
      'phaseId: "node_worker_prompt_authoring"',
      'resultMode: "text"',
      'modelTaskCallSite: "node_lifecycle.node_worker_prompt_authoring"',
      "NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE",
      '"node_agent_worker_prompt_is_direct_native_session_input"',
    ],
    reasonCode: "node_lifecycle_runner_must_author_worker_prompt_through_native_text_model_turn",
  },
  {
    checkId: "node_agent_session_treats_sessions_yield_as_nonterminal_wait",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      'status: "waiting_on_subagent"',
      '"node_execution_waiting_on_subagent"',
      '"sessions_yield_nonterminal_wait_state"',
      "yieldDetected",
      'runResult.meta.stopReason === "end_turn"',
    ],
    reasonCode:
      "node_agent_session_must_not_terminalize_native_subagent_wait_as_missing_node_finish",
  },
  {
    checkId: "node_agent_session_builds_bounded_runtime_trace",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "buildNodeAgentSessionTrace(",
      "NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE",
      "node_agent_session_trace_built_from_native_openclaw_session_metadata",
      "missingOptics",
      "storagePolicy: NODE_EXECUTION_STORAGE_POLICY",
    ],
    reasonCode:
      "native_node_agent_session_must_emit_bounded_trace_refs_for_plan_subagent_edit_validation_finish_optics",
  },
  {
    checkId: "gateway_attaches_node_agent_start_receipt_artifact",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "attachNodeAgentStartReceiptArtifact(",
      "NODE_AGENT_START_RECEIPT_ARTIFACT_TYPE",
      "node_agent_start_receipt_artifact_attached",
      "nodeAgentStartReceiptRef",
      "nodeAgentStartLockAcquisitionOutcome",
    ],
    reasonCode: "gateway_must_attach_node_agent_start_receipts_for_native_start_readback",
  },
  {
    checkId: "runtime_artifact_contracts_require_node_agent_start_receipt_payload",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: [
      'artifactType: "execution_platform.node_agent_start_receipt"',
      'bodySchemaRef: "NodeAgentStartReceipt"',
      "runtime-artifact.node-agent-start-receipt.v1",
    ],
    reasonCode:
      "node_agent_start_receipt_artifact_must_be_manifest_backed_and_rehydratable_by_contract",
  },
  {
    checkId: "active_graph_readback_projects_node_agent_start_receipt",
    file: "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    patterns: [
      '"execution_platform.node_agent_start_receipt"',
      "nodeAgentStartReceiptRefs",
      "startLockAcquisitionOutcome",
      "startBlockedTools",
    ],
    reasonCode: "work_queue_readback_must_project_bounded_native_node_start_receipts",
  },
  {
    checkId: "canonical_readback_projects_node_agent_start_receipt",
    file: "extensions/execution-platform/src/observability/canonical-readback-gate.ts",
    patterns: [
      "nodeAgentStartReceiptRefs",
      "node_agent_session_lock_owner_live",
      "node_agent_tool_policy_insufficient",
    ],
    reasonCode:
      "canonical_readback_must_project_typed_node_start_receipts_without_generic_collapse",
  },
  {
    checkId: "boundary_replay_uses_runner_owned_fresh_attempt_reset",
    file: "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    patterns: [
      "resetNodeForFreshAttempt({",
      "nodeFreshAttemptResetReceipt",
      "boundary_replay_reset",
    ],
    reasonCode:
      "boundary_replay_must_use_runner_owned_fresh_attempt_reset_not_hand_patch_node_session_fields",
  },
  {
    checkId: "native_session_write_lock_returns_typed_acquisition_trace",
    file: "src/agents/session-write-lock.ts",
    patterns: [
      "SessionLockAcquisitionTrace",
      "SessionWriteLockAcquisitionError",
      "stale_lock_reclaimed_acquired",
      "active_lock_owner_live",
      "acquisition_timeout",
    ],
    reasonCode:
      "openclaw_session_lock_acquisition_must_emit_typed_trace_for_node_lifecycle_projection",
  },
  {
    checkId: "gateway_attaches_bounded_node_agent_session_trace_artifact",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "buildNodeAgentSessionTrace({",
      "NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE",
      "node_agent_session_trace_artifact_attached",
      "nodeAgentSessionTraceRef",
      "nodeAgentTraceEventRefs",
    ],
    reasonCode:
      "gateway_must_attach_node_agent_session_trace_artifacts_for_runtime_readback_without_raw_transcripts",
  },
  {
    checkId: "runtime_artifact_contracts_require_node_agent_session_trace_payload",
    file: "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    patterns: [
      'artifactType: "execution_platform.node_agent_session_trace"',
      'bodySchemaRef: "NodeAgentSessionTrace"',
      "runtime-artifact.node-agent-session-trace.v1",
    ],
    reasonCode:
      "node_agent_session_trace_artifact_must_be_manifest_backed_and_rehydratable_by_contract",
  },
  {
    checkId: "active_graph_readback_projects_node_agent_session_trace",
    file: "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    patterns: [
      '"execution_platform.node_agent_session_trace"',
      "traceEventRefs",
      "traceObservations",
      "nativeCompactionCount",
      "nodeAgentSessionTraceRefs",
    ],
    reasonCode: "work_queue_readback_must_project_bounded_native_node_agent_session_optics",
  },
  {
    checkId: "gateway_delegates_profile_resolution_to_node_start_adapter",
    file: "src/gateway/execution-platform-agent-team-runner.ts",
    patterns: [
      "createGatewayNodeAgentProfileResolver",
      "resolveGatewayNodeAgentProfile",
      "node_agent_profile_resolution_delegated_to_node_start_adapter",
      "prepareOpenClawNodeStart({",
      "resolveNodeAgentProfile: createGatewayNodeAgentProfileResolver()",
    ],
    reasonCode:
      "gateway_profile_resolution_must_delegate_native_config_facts_to_node_start_adapter",
  },
  {
    checkId: "node_agent_session_uses_openclaw_extra_tools_pipeline",
    file: "extensions/execution-platform/src/workflows/node-agent-session.ts",
    patterns: [
      "createNodeFinishTool({",
      "name: NODE_FINISH_TOOL_NAME",
      "name: OPENCLAW_RESOURCE_READ_TOOL_NAME",
      "extraTools: [finishTool, ...(inputExtraTools ?? [])]",
      "runEmbeddedAgent({",
    ],
    reasonCode:
      "node_agent_session_must_inject_only_lifecycle_resource_tools_through_openclaw_extra_tools",
  },
  {
    checkId: "openclaw_agent_tools_accept_extra_tools",
    file: "src/agents/pi-tools.ts",
    patterns: ["extraTools?: AnyAgentTool[]", "...(options?.extraTools ?? [])"],
    reasonCode: "openclaw_tool_factory_must_accept_execution_platform_extra_tools",
  },
  {
    checkId: "embedded_agent_params_forward_extra_tools",
    file: "src/agents/pi-embedded-runner/run/params.ts",
    patterns: ["extraTools?: AnyAgentTool[]"],
    reasonCode: "embedded_agent_runner_params_must_expose_extra_tools",
  },
  {
    checkId: "embedded_attempt_installs_extra_tools",
    file: "src/agents/pi-embedded-runner/run/attempt.ts",
    patterns: ["extraTools: params.extraTools"],
    reasonCode: "embedded_agent_attempt_must_install_extra_tools_through_openclaw_tool_factory",
  },
];

const ALLOWED_SOURCE_SURVIVOR_FILES = new Map<string, { maxCount: number; reasonCode: string }>([
  [
    "extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts",
    {
      maxCount: 140,
      reasonCode: "exact_source_inventory_gate_term_catalog_and_forbidden_pattern_definitions",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/architecture-transition-topology-gate.ts",
    {
      maxCount: 24,
      reasonCode: "exact_architecture_transition_topology_negative_gate_term_detection",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    {
      maxCount: 320,
      reasonCode:
        "exact_scheduler_negative_guards_and_retired_path_rejections_pending_final_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
    {
      maxCount: 60,
      reasonCode: "exact_runner_manifest_readback_legacy_field_projection_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/work-queue/projections/active-graph-progress.ts",
    {
      maxCount: 40,
      reasonCode: "exact_owner_readback_legacy_field_projection_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    {
      maxCount: 8,
      reasonCode: "exact_read_model_legacy_field_type_projection_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/work-queue/projections/worker-internal-progress.ts",
    {
      maxCount: 4,
      reasonCode: "exact_worker_internal_legacy_context_ref_projection_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts",
    {
      maxCount: 4,
      reasonCode: "exact_worker_packet_legacy_context_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
    {
      maxCount: 12,
      reasonCode: "exact_worker_event_legacy_context_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts",
    {
      maxCount: 6,
      reasonCode: "exact_worker_loop_legacy_context_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
    {
      maxCount: 10,
      reasonCode: "exact_scheduler_contract_legacy_projection_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts",
    {
      maxCount: 10,
      reasonCode: "exact_resource_compiler_legacy_input_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/node-resource-materialization.ts",
    {
      maxCount: 8,
      reasonCode: "exact_materialization_legacy_context_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/post-resource-implementation-task-compiler.ts",
    {
      maxCount: 4,
      reasonCode: "exact_post_resource_legacy_context_ref_field_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
    {
      maxCount: 4,
      reasonCode: "exact_graph_decision_retired_node_kind_guard_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/runtime-graph-patch.ts",
    {
      maxCount: 4,
      reasonCode: "exact_graph_patch_retired_node_kind_guard_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/runtime-work-graph.ts",
    {
      maxCount: 4,
      reasonCode: "exact_runtime_graph_retired_node_kind_guard_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/context-snapshot.ts",
    {
      maxCount: 6,
      reasonCode: "exact_context_snapshot_legacy_migration_normalizer_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/context-broker.ts",
    {
      maxCount: 2,
      reasonCode: "exact_resource_broker_legacy_reason_code_projection_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/work-intent-context-resolution.ts",
    {
      maxCount: 12,
      reasonCode:
        "exact_work_intent_resolution_retired_context_observation_counter_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/repair-classification.ts",
    {
      maxCount: 4,
      reasonCode: "exact_repair_classifier_retired_node_kind_diagnostic_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/boundary-replay-registry.ts",
    {
      maxCount: 2,
      reasonCode: "exact_boundary_registry_retirement_guard_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts",
    {
      maxCount: 4,
      reasonCode: "exact_replay_gate_negative_retired_path_guard_pending_term_rename",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts",
    {
      maxCount: 12,
      reasonCode: "exact_product_spec_proof_substrate_stale_fixture_and_retired_topology_guard",
    },
  ],
  [
    "extensions/execution-platform/src/observability/proof-harness-canonical-gate.ts",
    {
      maxCount: 8,
      reasonCode: "exact_proof_harness_stale_checkpoint_negative_gate_term_detection",
    },
  ],
  [
    "extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.ts",
    {
      maxCount: 4,
      reasonCode: "exact_boundary_guardrail_retired_replay_surface_detection",
    },
  ],
  [
    "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts",
    {
      maxCount: 4,
      reasonCode: "exact_adversarial_negative_fixture_guard_pending_term_rename",
    },
  ],
]);

const ALLOWED_HISTORICAL_SCRIPT_PREFIXES = [
  "scripts/execution-platform-record-",
  "scripts/execution-platform-run-legacy-",
] as const;

const ALLOWED_NON_LEGACY_PROOF_SCRIPTS = new Map<string, { maxCount: number; reasonCode: string }>([
  [
    "scripts/execution-platform-run-product-spec-boundary-replay.mjs",
    {
      maxCount: 12,
      reasonCode: "exact_product_spec_replay_negative_retired_path_projection_pending_term_rename",
    },
  ],
  [
    "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
    {
      maxCount: 24,
      reasonCode:
        "exact_product_spec_checkpointed_negative_retired_path_projection_pending_term_rename",
    },
  ],
  [
    "scripts/execution-platform-run-implementation-context-snapshot-compiler-proof.mjs",
    {
      maxCount: 4,
      reasonCode: "exact_implementation_context_legacy_ref_fixture_pending_rewrite",
    },
  ],
  [
    "scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs",
    {
      maxCount: 4,
      reasonCode: "exact_worker_streaming_readback_legacy_ref_fixture_pending_rewrite",
    },
  ],
]);

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".turbo", ".git"]);
const SCANNED_EXTENSION = /\.(ts|tsx|js|mjs|md|json)$/u;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readText(repoRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(repoRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function walk(repoRoot: string, relativePath: string, out: string[] = []): string[] {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    return out;
  }
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    if (IGNORED_DIRS.has(path.basename(relativePath))) {
      return out;
    }
    for (const entry of fs.readdirSync(absolute)) {
      walk(repoRoot, path.join(relativePath, entry), out);
    }
    return out;
  }
  if (stat.isFile() && SCANNED_EXTENSION.test(relativePath)) {
    out.push(relativePath);
  }
  return out;
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(term, index)) !== -1) {
    count += 1;
    index += term.length;
  }
  return count;
}

function bounded(value: string, max = 320): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, max);
}

function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx|js|mjs)$/u.test(file);
}

function historicalScriptAllowance(file: string): { maxCount: number; reasonCode: string } | null {
  const proofScript = ALLOWED_NON_LEGACY_PROOF_SCRIPTS.get(file);
  if (proofScript) {
    return proofScript;
  }
  if (ALLOWED_HISTORICAL_SCRIPT_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    return {
      maxCount: 64,
      reasonCode: "exact_historical_closeout_or_queue_script_not_imported_by_runtime",
    };
  }
  return null;
}

function survivorDisposition(input: {
  file: string;
  count: number;
}): Pick<ArchitectureResidueSurvivorRef, "disposition" | "reasonCode" | "maxAllowedCount"> {
  if (input.file.startsWith("docs/")) {
    return {
      disposition: "allowed_historical_doc",
      reasonCode: "historical_or_governing_doc_reference",
      maxAllowedCount: null,
    };
  }
  if (isTestFile(input.file)) {
    return {
      disposition: "allowed_exact_negative_test",
      reasonCode: "exact_negative_or_regression_test_reference",
      maxAllowedCount: null,
    };
  }
  const sourceAllowance = ALLOWED_SOURCE_SURVIVOR_FILES.get(input.file);
  if (sourceAllowance && input.count <= sourceAllowance.maxCount) {
    return {
      disposition: "allowed_exact_source_guard",
      reasonCode: sourceAllowance.reasonCode,
      maxAllowedCount: sourceAllowance.maxCount,
    };
  }
  const scriptAllowance = historicalScriptAllowance(input.file);
  if (scriptAllowance && input.count <= scriptAllowance.maxCount) {
    return {
      disposition: "allowed_exact_historical_script",
      reasonCode: scriptAllowance.reasonCode,
      maxAllowedCount: scriptAllowance.maxCount,
    };
  }
  return {
    disposition: "blocked_unallowlisted_source",
    reasonCode: "unallowlisted_retired_architecture_term_in_source",
    maxAllowedCount: sourceAllowance?.maxCount ?? scriptAllowance?.maxCount ?? null,
  };
}

function gitNumstat(repoRoot: string): ArchitectureResidueLineReduction {
  if (!fs.existsSync(path.join(repoRoot, ".git"))) {
    return { added: 0, deleted: 0, netReduction: 0, numstat: [] };
  }
  try {
    const output = execFileSync("git", ["diff", "--numstat", "--", ...LINE_REDUCTION_TARGETS], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const numstat = output
      .trim()
      .split(/\n/u)
      .filter(Boolean)
      .map((line) => {
        const [added, deleted, file] = line.split(/\t/u);
        return {
          file: bounded(file ?? ""),
          added: Number(added) || 0,
          deleted: Number(deleted) || 0,
        };
      });
    const totals = numstat.reduce(
      (acc, item) => {
        acc.added += item.added;
        acc.deleted += item.deleted;
        return acc;
      },
      { added: 0, deleted: 0 },
    );
    return {
      added: totals.added,
      deleted: totals.deleted,
      netReduction: totals.deleted - totals.added,
      numstat,
    };
  } catch {
    return { added: 0, deleted: 0, netReduction: 0, numstat: [] };
  }
}

function assertNoManifestBodyFields(value: unknown, pathPrefix = "manifest"): void {
  if (!value || typeof value !== "object") {
    return;
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries) {
    const lowered = key.toLowerCase();
    if (MANIFEST_BODY_FIELD_KEYS.has(key) || MANIFEST_BODY_FIELD_KEYS.has(lowered)) {
      throw new Error(`architecture_residue_manifest_body_field:${pathPrefix}.${key}`);
    }
    if (/raw.*(prompt|response|transcript|provider|tool|command|db|secret)/iu.test(key)) {
      if (child !== false && child !== null && child !== undefined) {
        throw new Error(`architecture_residue_manifest_raw_field_not_false:${pathPrefix}.${key}`);
      }
    }
    if (child && typeof child === "object") {
      assertNoManifestBodyFields(child, `${pathPrefix}.${key}`);
    }
  }
}

export function assertArchitectureResidueSourceInventoryManifestMetadata(
  manifest: ArchitectureResidueSourceInventoryManifest,
  maxBytes = MANIFEST_METADATA_MAX_BYTES,
): void {
  const bytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`architecture_residue_manifest_metadata_overflow:${bytes}:${maxBytes}`);
  }
  assertNoManifestBodyFields(manifest);
}

export function buildArchitectureResidueSourceInventoryManifest(input: {
  report: Omit<ArchitectureResidueSourceInventoryReport, "manifest">;
  reportJson: string;
  fullReportRef?: string | null;
}): ArchitectureResidueSourceInventoryManifest {
  const byFile = new Map<string, number>();
  for (const ref of input.report.survivorRefs) {
    byFile.set(ref.file, (byFile.get(ref.file) ?? 0) + ref.count);
  }
  const manifest: ArchitectureResidueSourceInventoryManifest = {
    artifactKind: "execution_platform.architecture_residue_source_inventory_manifest",
    schemaVersion: `${ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_VERSION}.manifest`,
    workItemId: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID,
    status: input.report.status,
    reportHash: `sha256:${sha256(input.reportJson)}`,
    reportBytes: Buffer.byteLength(input.reportJson, "utf8"),
    hardFailureCount: input.report.hardFailureCount,
    blockedSurvivorRefCount: input.report.blockedSurvivorRefCount,
    survivorRefCount: input.report.survivorRefCount,
    topSurvivorFiles: [...byFile.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([file, count]) => ({ file, count })),
    lineReduction: {
      added: input.report.lineReduction.added,
      deleted: input.report.lineReduction.deleted,
      netReduction: input.report.lineReduction.netReduction,
    },
    fullReportRef: input.fullReportRef ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
  assertArchitectureResidueSourceInventoryManifestMetadata(manifest);
  return manifest;
}

export function runArchitectureResidueSourceInventory(
  options: ArchitectureResidueInventoryOptions,
): ArchitectureResidueSourceInventoryReport {
  const repoRoot = path.resolve(options.repoRoot);
  const missingDeletedTargets = DELETED_RUNTIME_TARGETS.filter(
    (target) => !exists(repoRoot, target),
  );
  const stillPresentDeletedTargets = DELETED_RUNTIME_TARGETS.filter((target) =>
    exists(repoRoot, target),
  );

  const hardFailures: ArchitectureResidueHardFailure[] = [];
  for (const target of stillPresentDeletedTargets) {
    hardFailures.push({
      checkId: "deleted_runtime_target_still_present",
      file: target,
      pattern: "file_exists",
      reasonCode: "deleted_runtime_target_still_present",
    });
  }
  for (const check of HARD_FAILURE_CHECKS) {
    const source = exists(repoRoot, check.file) ? readText(repoRoot, check.file) : "";
    for (const pattern of check.patterns) {
      if (source.includes(pattern)) {
        hardFailures.push({
          checkId: check.checkId,
          file: check.file,
          pattern,
          reasonCode: check.reasonCode,
        });
      }
    }
  }
  for (const check of REQUIRED_SOURCE_PATTERNS) {
    const source = exists(repoRoot, check.file) ? readText(repoRoot, check.file) : "";
    for (const pattern of check.patterns) {
      if (!source.includes(pattern)) {
        hardFailures.push({
          checkId: check.checkId,
          file: check.file,
          pattern,
          reasonCode: check.reasonCode,
        });
      }
    }
  }

  const survivorTermCounts = Object.fromEntries(RETIRED_TERMS.map((term) => [term, 0]));
  const survivorRefs: ArchitectureResidueSurvivorRef[] = [];
  for (const file of SCAN_ROOTS.flatMap((root) => walk(repoRoot, root))) {
    const source = readText(repoRoot, file);
    for (const term of RETIRED_TERMS) {
      const count = countOccurrences(source, term);
      if (count === 0) {
        continue;
      }
      survivorTermCounts[term] += count;
      survivorRefs.push({
        file,
        term,
        count,
        ...survivorDisposition({ file, count }),
      });
    }
  }
  const blockedSurvivorRefs = survivorRefs.filter(
    (ref) => ref.disposition === "blocked_unallowlisted_source",
  );
  const lineReduction = gitNumstat(repoRoot);
  const status: ArchitectureResidueInventoryStatus =
    hardFailures.length === 0 && blockedSurvivorRefs.length === 0 ? "passed" : "failed";

  const reportBase = {
    artifactKind: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_ARTIFACT_TYPE,
    schemaVersion: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_VERSION,
    workItemId: ARCHITECTURE_RESIDUE_SOURCE_INVENTORY_FINAL_WORK_ITEM_ID,
    status,
    hardFailureCount: hardFailures.length,
    hardFailures,
    survivorTermCounts,
    survivorRefCount: survivorRefs.length,
    survivorRefs,
    blockedSurvivorRefCount: blockedSurvivorRefs.length,
    blockedSurvivorRefs,
    deletedRuntimeTargetCount: DELETED_RUNTIME_TARGETS.length,
    missingDeletedTargets,
    stillPresentDeletedTargets,
    scanRoots: [...SCAN_ROOTS],
    lineReduction,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    generatedAt: new Date().toISOString(),
  } satisfies Omit<ArchitectureResidueSourceInventoryReport, "manifest">;
  const reportJson = `${JSON.stringify(reportBase, null, 2)}\n`;
  const manifest = buildArchitectureResidueSourceInventoryManifest({
    report: reportBase,
    reportJson,
    fullReportRef: options.fullReportRef ?? null,
  });
  return {
    ...reportBase,
    manifest,
  };
}
