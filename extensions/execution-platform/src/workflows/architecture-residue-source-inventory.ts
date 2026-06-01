import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  "extensions/execution-platform/src/workflows/mission-work-packets.ts",
  "extensions/execution-platform/src/workflows/mission-work-packets.test.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-authoring-stage.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-authoring-stage.test.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-preauthor-tools.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-preauthor-tools.test.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-semantic-tools.ts",
  "extensions/execution-platform/src/workflows/commitment-packet-semantic-tools.test.ts",
  "extensions/execution-platform/src/workflows/pre-proof-mission-packet-graph-lane.ts",
  "extensions/execution-platform/src/workflows/pre-proof-mission-packet-graph-lane.test.ts",
  "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.ts",
  "extensions/execution-platform/src/codex-bridge/commitment-packet-review-boundary-replay.test.ts",
  "scripts/execution-platform-run-commitment-packet-real-model-lane.mjs",
  "scripts/execution-platform-run-pre-proof-mission-packet-graph-lane.mjs",
  "scripts/execution-platform-run-model-facing-staged-scheduler-proof.mjs",
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
    patterns: ["buildImplementationTaskPacket(", "compileNodeExecutionPacketForImplementationTask("],
    reasonCode: "product_spec_replay_must_not_construct_worker_packets_outside_node_runner",
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
    reasonCode: "product_spec_proof_closeout_must_read_run_scoped_manifest_not_shared_stale_artifacts",
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
    checkId: "scheduler_workintent_promotion_bypasses_lifecycle_runner",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: ["runtime_policy_work_intent_promotion_bypassed_orchestrator_decision"],
    reasonCode: "workintent_promotion_must_be_node_lifecycle_runner_owned",
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
    patterns: ['"block_implementation"', "implementation_context_packet_context_blocks_implementation"],
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
      "schedulerCompiledFromDecisionKind: \"escalate_worker\"",
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
    checkId: "workintent_promotion_marks_lifecycle_transition_prerequisite_critical",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "runtimeOwnedWorkIntentPromotion: true",
      "runtimeOwnedLifecycleTransition: true",
      'lifecycleTransitionOwner: "NodeLifecycleTransitionRunner"',
      "runtimePrerequisiteCritical: true",
    ],
    reasonCode: "workintent_promotion_must_be_runner_owned_and_non_deferrable",
  },
  {
    checkId: "scheduler_worker_start_delegates_to_runner_projection",
    file: "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    patterns: [
      "node_lifecycle_runner_authorized_worker_start",
      "this.nodeLifecycleTransitionRunner.project({",
      "buildNodeLifecycleProjectionManifest(projection)",
    ],
    reasonCode: "scheduler_worker_start_must_be_runner_projection_owned",
  },
];

const ALLOWED_SOURCE_SURVIVOR_FILES = new Map<string, { maxCount: number; reasonCode: string }>([
  [
    "extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts",
    {
      maxCount: 80,
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
      reasonCode: "exact_product_spec_checkpointed_negative_retired_path_projection_pending_term_rename",
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
    "scripts/execution-platform-run-large-graph-storage-scheduler-lane-proof.mjs",
    {
      maxCount: 4,
      reasonCode: "exact_large_graph_storage_legacy_ref_fixture_pending_rewrite",
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

function historicalScriptAllowance(
  file: string,
): { maxCount: number; reasonCode: string } | null {
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
  const missingDeletedTargets = DELETED_RUNTIME_TARGETS.filter((target) => !exists(repoRoot, target));
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
