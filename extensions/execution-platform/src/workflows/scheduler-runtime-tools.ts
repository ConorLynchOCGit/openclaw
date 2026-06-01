import {
  buildCodeIntelligenceRuntimeToolDefinition,
  CODE_INTELLIGENCE_RUNTIME_TOOL_IDS,
  createCodeIntelligenceRuntimeToolExecutor,
  isCodeIntelligenceRuntimeToolId,
  type CodeIntelligenceService,
  type CodeIntelligenceRuntimeToolId,
} from "../code-intelligence/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  RuntimeToolKernel,
  RuntimeToolKernelInvokeResult,
} from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  buildRuntimeToolDefinition,
  type RuntimeToolRegistry,
} from "../runtime-tool-call/runtime-tool-registry.ts";
import type {
  RuntimeToolBudget,
  RuntimeToolAuthorityClass,
  RuntimeToolExecutor,
  RuntimeToolExecutorResult,
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";
import { actionReviewToolMetadata } from "./action-review-artifacts.ts";
import {
  CONTEXT_SCOUT_SPECIALIST_TOOL_IDS,
  compileContextScoutSpecialistToolOutput,
} from "./context-scout-specialist-subturn.ts";
import { CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS } from "./context-scout-tool-loop.ts";
import { compileNodeResourceDemandToolOutput } from "./node-resource-demand-session.ts";
import { compileNodeResourceLedgerToolOutput } from "./node-resource-ledger.ts";
import {
  compileDomainActionGateToolOutput,
  compilePlanningDomainSmallVerbToolOutput,
} from "./domain-resource-small-verb-tool-surface.ts";
import { compileImplementationContextToolOutput } from "./implementation-context-snapshot-compiler.ts";
import { compileNodeResourceMaterializationToolOutput } from "./node-resource-materialization.ts";
import {
  compileCapabilityManifestRuntimeToolOutput,
  isCapabilityManifestRuntimeToolId,
} from "./capability-manifest-domain-lifecycle.ts";

export const SCHEDULER_RUNTIME_TOOL_IDS = [
  "scheduler.mission_ledger_readiness",
  "scheduler.accept_obligation_graph",
  "scheduler.observe_scheduler_intake",
  "scheduler.evaluate_canonical_frontier",
  "scheduler.record_model_call_envelope",
  "scheduler.record_no_progress_signature",
  "scheduler.record_frontier_root_cause",
  "scheduler.record_branch_scoped_frontier_state",
  "scheduler.mission_ledger_evaluation_throttle",
  "scheduler.evaluate_expansion_admission",
  "scheduler.open_superstep_frontier",
  "scheduler.record_superstep_branch_result",
  "scheduler.join_superstep_frontier",
  "scheduler.draft_work_breakdown",
  "scheduler.review_work_breakdown",
  "scheduler.draft_obligation_work_breakdown",
  "scheduler.draft_commitment_work_breakdown",
  "scheduler.shortlist_capabilities_for_work_units",
  "scheduler.select_capability_for_work_unit",
  "scheduler.shortlist_capabilities",
  "scheduler.propose_decomposition_outline",
  "scheduler.map_commitments_to_work_units",
  "scheduler.select_capabilities_for_work_units",
  "scheduler.select_capabilities",
  "scheduler.work_intent.propose",
  "scheduler.work_intent.accept_roots",
  "scheduler.work_intent.link_dependencies",
  "scheduler.work_intent.set_capability",
  "scheduler.work_intent.set_evidence_mode",
  "scheduler.work_intent.mark_non_runnable",
  "scheduler.work_intent.request_revision",
  "capability.lookup",
  "capability.validate_intent",
  "capability.require_resources",
  "capability.require_validation",
  "capability.require_evidence",
  "capability.list_legal_transitions",
  "scheduler.compile_work_intents",
  "scheduler.validate_work_intent_capability",
  "scheduler.compile_resource_requirements_for_work_intents",
  "resource.requirement.block_broad_payload",
  "scheduler.resource.requirement.create",
  "scheduler.resource.requirement.attach_consumer",
  "scheduler.resource.requirement.select_candidate_refs",
  "scheduler.resource.requirement.compile_scout_packet",
  "scheduler.resource.requirement.reject_orphan_scout",
  "scheduler.resource.requirement.request_revision",
  "scheduler.resource.reshard_requirement",
  "resource.requirement.create_frontier_request",
  "resource.requirement.split_for_profile",
  "resource.frontier.persist_shard_manifest",
  "resource.frontier.execute_shard_packet",
  "resource.frontier.record_shard_result",
  "resource.frontier.record_single_unit_blocker",
  "scheduler.request_resource_scope_revision",
  "resource.scope.select_legal_subset",
  "resource.scope.explain_unshardable_unit",
  "resource.frontier.accept_scope_revision",
  "resource.scout.request_field_repair",
  "resource.frontier.mark_shards_ready",
  "resource.review_shard_handoffs",
  "resource.requirement.merge_handoffs",
  "scheduler.resource.retry_failed_shard",
  "scheduler.resource.merge_shard_handoffs",
  "scheduler.resource.accept_partial_handoff",
  "scheduler.resource.block_single_unit_over_profile",
  "scheduler.resolve_work_intent_resource_requirements",
  "scheduler.accept_resources_for_consumer",
  "scheduler.accept_resource_limitation_waiver",
  "scheduler.accept_resources_for_work_intent",
  "scheduler.mark_read_only_work_intent_satisfied_from_resources",
  "scheduler.promote_resource_satisfied_work_intent_to_executable",
  "scheduler.promote_resource_satisfied_intent",
  "scheduler.request_resource_requirement_for_work_intent",
  "scheduler.retry_failed_resource_shard",
  "scheduler.reshard_resource_requirement",
  "scheduler.record_resource_handoff_for_consumer",
  "scheduler.accept_partial_resources_for_work_intent",
  "scheduler.collapse_repeated_resource_blocker",
  "resource.demand.open",
  "resource.demand.fulfill_exact_handles",
  "resource.demand.request_file_window",
  "resource.demand.request_symbol",
  "resource.demand.request_related_tests",
  "resource.demand.request_memory_pack",
  "resource.demand.fulfillment_required",
  "resource.demand.recompile_from_scope_revision",
  "resource.demand.execute_recompiled_packet",
  "resource.demand.mark_blocked",
  "resource.demand.close",
  "resource.scout.narrow_scope",
  "resource.scout.narrowing_selector_missing",
  "resource.scout.narrowing_selector_failed",
  "resource.scout.narrowing_selector_rejected",
  "resource.scout.dispatch_specialist_subturn",
  "resource.scout.choose_file_from_listing",
  "resource.scout.choose_search_query",
  "resource.scout.choose_window_from_matches",
  "resource.scout.expand_window",
  "resource.scout.contract_window",
  "resource.scout.submit_exact_handles",
  "resource.scout.submit_specialist_handoff",
  "resource.scout.mark_narrowing_blocked",
  "resource.scout.mark_specialist_blocked",
  "resource.scout.append_handoff_to_ledger",
  "resource.scout.project_specialist_result",
  "resource.ledger.open",
  "resource.ledger.append_file_window",
  "resource.ledger.append_symbol",
  "resource.ledger.append_related_test",
  "resource.ledger.append_memory_pack",
  "resource.ledger.append_resource_ref",
  "resource.ledger.report_relevant_file",
  "resource.ledger.report_relevant_resource",
  "resource.ledger.append_source_prompt_section",
  "resource.ledger.report_owner_constraint",
  "resource.ledger.report_project_fact",
  "resource.ledger.report_research_brief",
  "resource.ledger.report_planning_capsule",
  "resource.ledger.report_planning_action_point",
  "resource.ledger.report_action_graph_candidate",
  "resource.ledger.recommend_compile_readiness",
  "resource.ledger.report_human_decision",
  "resource.ledger.report_closeout_ref",
  "resource.ledger.report_existing_pattern",
  "resource.ledger.report_risk",
  "resource.ledger.recommend_edit_point",
  "resource.ledger.recommend_validation",
  "resource.ledger.recommend_domain_validation",
  "resource.ledger.report_limitation",
  "resource.ledger.record_provider_diagnostic",
  "resource.ledger.project_manifest",
  "resource.ledger.hydrate_entry",
  "resource.ledger.close",
  "scheduler.define_node_contract",
  "scheduler.define_node_contracts",
  "scheduler.define_edges_or_parallelism",
  "scheduler.compile_staged_runtime_graph",
  "scheduler.compile_runtime_graph",
  "scheduler.finalize_decomposition_graph",
  "scheduler.accept_work_intent_graph",
  "scheduler.reject_work_intent_graph",
  "scheduler.create_graph_node",
  "scheduler.create_graph_edge",
  "scheduler.review_compiled_graph",
  "scheduler.accept_staged_graph",
  "scheduler.reject_staged_graph",
  "scheduler.evaluate_frontier_readiness",
  "scheduler.open_executable_frontier",
  "scheduler.record_node_transition",
  "scheduler.create_prerequisite_node",
  "scheduler.link_prerequisite_to_target",
  "scheduler.block_node_for_precondition",
  "scheduler.promote_work_intent_to_executable",
  "scheduler.request_transition_repair_intent",
  "scheduler.accept_transition_repair",
  "scheduler.reject_transition_repair",
  "scheduler.approve_and_run_first_node",
  "scheduler.select_next_node",
  "scheduler.request_human_decision",
  "scheduler.review_node_result",
  "scheduler.classify_repair_or_escalation",
  "scheduler.evaluate_closeout_readiness",
  "scheduler.evaluate_completion_readiness",
  "scheduler.mark_needs_review",
  "scheduler.create_closeout_request",
  "resource.requirement.compile",
  "resource.materialize_node_packet",
  "resource.materialize_domain_packet",
  "node.execution_packet.validate_hydration",
  "node.execution_packet.project_readiness",
  "node.execution_packet.create_partial",
  "node.execution_packet.attach_resource_demand",
  "node.execution_packet.attach_resource_ledger_manifest",
  "node.execution_packet.mark_resource_ledger_ready",
  "node.execution_packet.require_domain_resource_selection",
  "resource.selection.propose",
  "resource.selection.mark_blocked",
  "resource.selection.accept",
  "resource.selection.request_revision",
  "domain.action_gate.evaluate",
  "domain.action_gate.block",
  "domain.action_gate.promote_worker_action_ready",
  "node.execution_packet.evaluate_action_gate",
  "node.execution_packet.block_action_gate",
  "node.execution_packet.promote_worker_action_ready",
  "node.execution_packet.project_progressive_readiness",
  "node.compile_execution_packet",
  "node.evaluate_readiness",
  "node.recompute_readiness",
  "node.compare_readiness_projection",
  "node.mark_readiness_stale",
  "node.upsert_child_for_epoch",
  "node.supersede_child_epoch",
  "node.promote_ready_packet",
  "node.plan_resource_repair",
  "frontier.evaluate_epoch_eligibility",
  "frontier.block_stale_child",
  "readback.project_canonical_gate",
  "readback.project_readiness_drift",
  "readback.record_projection_drift",
  "provider.diagnostics.capture_response_shape",
  "provider.diagnostics.record_preflight_block",
  "provider.diagnostics.record_timeout_or_empty",
  "heap.record_phase_snapshot",
  "artifact.manifest.assert_bounds",
  "replay.boundary.load_checkpoint",
  "replay.boundary.validate_fidelity",
  "replay.boundary.normalize_checkpoint",
  "replay.boundary.reject_diagnostic_only",
  "replay.boundary.resume_production_path",
  "replay.boundary.record_latest_state",
  "replay.boundary.record_blocker",
  "replay.boundary.record_success",
  "replay.proof.run_boundary_sequence",
  "replay.proof.block_full_product_spec",
  "replay.proof.admit_full_product_spec",
  "resource_broker.submit_request",
  "resource_broker.resolve_inherited_resource",
  "resource_broker.dispatch_resource_specialist_subturn",
  "resource_broker.mark_consumer_ready",
  "resource_repair.compile_requirement",
  "resource_repair.link_consumer",
  "resource_repair.mark_diagnostic_only",
  "resource_repair.block_without_requirement",
  "resource.requirement.get",
  "context.resolve_target_refs",
  "context.resolve_directory_seed",
  "repo.snapshot_target_files",
  "context.compile_implementation_context_packet",
  "implementation.compile_task_packet",
  "implementation.select_target_files",
  "implementation.declare_new_file_intent",
  "implementation.evaluate_readiness",
  "artifact.payload.put_json",
  "artifact.payload.put_json_parts",
  "artifact.payload.attach_manifest",
  "artifact.payload.get_json",
  "artifact.payload.hydrate_manifest",
  "worker_smoke.prepare_matrix",
  "worker_smoke.hydrate_lane",
  "worker_smoke.run_lane",
  "worker_smoke.record_result",
  "worker_smoke.assert_review_artifact",
  "worker_smoke.record_blocker",
  "proof_entry.prepare_suite",
  "proof_entry.prepare_case",
  "proof_entry.inject_structural_fault",
  "proof_entry.run_preflight",
  "proof_entry.assert_safe_block",
  "proof_entry.assert_no_provider_invocation",
  "proof_entry.assert_no_executable_frontier",
  "proof_entry.assert_no_authority_widening",
  "proof_entry.assert_sibling_evidence_survived",
  "proof_entry.assert_review_artifact_hydrates",
  "proof_entry.record_case_result",
  "proof_entry.record_suite_closeout",
  "action_review.create",
  "action_review.link_validation",
  "action_review.link_evidence",
  "action_review.record_rollback",
  "action_review.hydrate",
  "worker.edit.persist_review_artifact",
  "worker.edit.hydrate_review_artifact",
  "review.inspect_action_artifact",
  "review.record_decision",
  "source_prompt.index",
  "source_prompt.request_excerpt",
  "source_prompt.provide_excerpt",
  "source_prompt.deny_excerpt",
  ...CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS,
  ...CODE_INTELLIGENCE_RUNTIME_TOOL_IDS,
  "worker.invoke",
  "coding.inspect_edit_validate",
  "coding.add_test_and_validate",
  "coding.update_docs_and_cross_refs",
  "coding.refactor_symbol_with_lsp",
  "coding.fix_type_errors",
  "coding.apply_small_patch_with_evidence",
  "worker.context.request_more",
  "worker.context.propose_searches",
  "worker.context.search",
  "worker.context.open_ref",
  "worker.context.open_around_match",
  "worker.context.open_window",
  "worker.context.expand_window",
  "worker.context.contract_window",
  "worker.context.accept_window",
  "worker.context.search_symbols",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.context.open_adjacent",
  "worker.context.report_pattern",
  "worker.context.report_risk",
  "worker.context.report_edit_point",
  "worker.context.finish_context_turn",
  "worker.context.mark_unanswerable",
  "worker.context.provide_bounded_snapshot",
  "worker.context.deny_request",
  "worker.repo.search",
  "worker.repo.read_files",
  "worker.repo.inspect_tests",
  "worker.edit.plan",
  "worker.edit.apply_patch",
  "worker.edit.apply_from_plan",
  "worker.edit.draft_from_snapshot",
  "worker.patch.force_author_from_plan",
  "worker.patch.author_edit",
  "edit_transaction.start",
  "edit_transaction.read_file",
  "edit_transaction.plan",
  "edit_transaction.apply_patch",
  "edit_transaction.validate",
  "edit_transaction.repair",
  "edit_transaction.emit_evidence",
  "edit_transaction.rollback",
  "edit_transaction.close",
  "worker.validation.explain_failure",
  "worker.validation.get_failure_context",
  "worker.validation.run_structural_default",
  "worker.validation.record_result",
  "worker.validation.request_repair",
  "worker.validation.record_blocker",
  "worker.repair.author_edit",
  "worker.repair.mark_upstream_blocker",
  "worker.repair.request_high_capability_escalation",
  "worker.escalation.request_high_capability",
  "worker.escalation.execute_high_capability",
  "worker.escalation.mark_unavailable",
  "worker.progress.mark_no_edit_blocker",
  "worker.evidence.claim",
  "worker.evidence.claim_commitment_progress",
  "worker.evidence.claim_from_validation",
  "worker.evidence.link_validation",
  "mission.ledger.apply_evidence_claims",
  "planning.intent.record",
  "planning.research.request_brief",
  "planning.capsule.draft",
  "planning.capsule.revise",
  "planning.human_decision.request",
  "planning.action_graph.propose",
  "planning.compile_readiness.evaluate",
  "planning.closeout.summarize",
  "worker.review.add_issue",
  "worker.review.approve_or_request_changes",
  "worker.escalate",
  "worker.file_context.inspect",
  "worker.file_edit.plan",
  "worker.file_edit.propose_patch",
  "worker.file_edit.apply_patch",
  "worker.validation.run",
  "worker.validation.classify_failure",
  "worker.file_edit.repair",
  "worker.file_edit.escalate",
  "worker.evidence.handoff",
] as const;

export type SchedulerRuntimeToolId = (typeof SCHEDULER_RUNTIME_TOOL_IDS)[number];

export type SchedulerRuntimeToolInvocationSummary = {
  toolId: SchedulerRuntimeToolId;
  invocationRef: string;
  status: RuntimeToolStatus;
  outputRef: string | null;
  outputHash: string | null;
  outputSummary: string | null;
  outputMetadata: JsonValue | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const SCHEDULER_TOOL_FAMILIES: Record<
  Exclude<SchedulerRuntimeToolId, CodeIntelligenceRuntimeToolId>,
  { family: RuntimeToolFamily; authorityClass: RuntimeToolAuthorityClass; schemaRef: string }
> = {
  "scheduler.mission_ledger_readiness": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/mission-ledger-readiness/v1",
  },
  "scheduler.accept_obligation_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-obligation-graph/v1",
  },
  "scheduler.observe_scheduler_intake": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/observe-scheduler-intake/v1",
  },
  "scheduler.evaluate_canonical_frontier": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-canonical-frontier/v1",
  },
  "scheduler.record_model_call_envelope": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-model-call-envelope/v1",
  },
  "scheduler.record_no_progress_signature": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-no-progress-signature/v1",
  },
  "scheduler.record_frontier_root_cause": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-frontier-root-cause/v1",
  },
  "scheduler.record_branch_scoped_frontier_state": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-branch-scoped-frontier-state/v1",
  },
  "scheduler.mission_ledger_evaluation_throttle": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/mission-ledger-evaluation-throttle/v1",
  },
  "scheduler.evaluate_expansion_admission": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-expansion-admission/v1",
  },
  "scheduler.open_superstep_frontier": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/open-superstep-frontier/v1",
  },
  "scheduler.record_superstep_branch_result": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-superstep-branch-result/v1",
  },
  "scheduler.join_superstep_frontier": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/join-superstep-frontier/v1",
  },
  "scheduler.draft_work_breakdown": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/draft-work-breakdown/v1",
  },
  "scheduler.review_work_breakdown": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/review-work-breakdown/v1",
  },
  "scheduler.draft_obligation_work_breakdown": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/draft-obligation-work-breakdown/v1",
  },
  "scheduler.draft_commitment_work_breakdown": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/draft-commitment-work-breakdown/v1",
  },
  "scheduler.shortlist_capabilities_for_work_units": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/shortlist-capabilities-for-work-units/v1",
  },
  "scheduler.select_capability_for_work_unit": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/select-capability-for-work-unit/v1",
  },
  "scheduler.propose_decomposition_outline": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/propose-decomposition-outline/v1",
  },
  "scheduler.shortlist_capabilities": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/shortlist-capabilities/v1",
  },
  "scheduler.map_commitments_to_work_units": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/map-commitments-to-work-units/v1",
  },
  "scheduler.select_capabilities": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/select-capabilities/v1",
  },
  "scheduler.select_capabilities_for_work_units": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/select-capabilities-for-work-units/v1",
  },
  "scheduler.work_intent.propose": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/propose/v1",
  },
  "scheduler.work_intent.accept_roots": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/accept-roots/v1",
  },
  "scheduler.work_intent.link_dependencies": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/link-dependencies/v1",
  },
  "scheduler.work_intent.set_capability": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/set-capability/v1",
  },
  "scheduler.work_intent.set_evidence_mode": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/set-evidence-mode/v1",
  },
  "scheduler.work_intent.mark_non_runnable": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/mark-non-runnable/v1",
  },
  "scheduler.work_intent.request_revision": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/work-intent/request-revision/v1",
  },
  "capability.lookup": {
    family: "scheduler.select_next_node",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://capability/lookup/v1",
  },
  "capability.validate_intent": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://capability/validate-intent/v1",
  },
  "capability.require_resources": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://capability/require-resources/v1",
  },
  "capability.require_validation": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://capability/require-validation/v1",
  },
  "capability.require_evidence": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://capability/require-evidence/v1",
  },
  "capability.list_legal_transitions": {
    family: "scheduler.select_next_node",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://capability/list-legal-transitions/v1",
  },
  "scheduler.compile_work_intents": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/compile-work-intents/v1",
  },
  "scheduler.validate_work_intent_capability": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/validate-work-intent-capability/v1",
  },
  "scheduler.compile_resource_requirements_for_work_intents": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/compile-resource-requirements-for-work-intents/v1",
  },
  "resource.requirement.block_broad_payload": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/requirement/block-broad-payload/v1",
  },
  "scheduler.resource.requirement.create": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/create/v1",
  },
  "scheduler.resource.requirement.attach_consumer": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/attach-consumer/v1",
  },
  "scheduler.resource.requirement.select_candidate_refs": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/select-candidate-refs/v1",
  },
  "scheduler.resource.requirement.compile_scout_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/compile-scout-packet/v1",
  },
  "scheduler.resource.requirement.reject_orphan_scout": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/reject-orphan-scout/v1",
  },
  "scheduler.resource.requirement.request_revision": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/requirement/request-revision/v1",
  },
  "scheduler.resource.reshard_requirement": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/reshard-requirement/v1",
  },
  "resource.requirement.create_frontier_request": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/requirement/create-frontier-request/v1",
  },
  "resource.requirement.split_for_profile": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/requirement/split-for-profile/v1",
  },
  "resource.frontier.persist_shard_manifest": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/persist-shard-manifest/v1",
  },
  "resource.frontier.execute_shard_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/execute-shard-packet/v1",
  },
  "resource.frontier.record_shard_result": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/record-shard-result/v1",
  },
  "resource.frontier.record_single_unit_blocker": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/record-single-unit-blocker/v1",
  },
  "scheduler.request_resource_scope_revision": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/request-context-scope-revision/v1",
  },
  "resource.scope.select_legal_subset": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/scope/select-legal-subset/v1",
  },
  "resource.scope.explain_unshardable_unit": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/scope/explain-unshardable-unit/v1",
  },
  "resource.frontier.accept_scope_revision": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/accept-scope-revision/v1",
  },
  "resource.scout.request_field_repair": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/scout/request-field-repair/v1",
  },
  "resource.frontier.mark_shards_ready": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/frontier/mark-shards-ready/v1",
  },
  "resource.review_shard_handoffs": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/review-shard-handoffs/v1",
  },
  "resource.requirement.merge_handoffs": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context/requirement/merge-handoffs/v1",
  },
  "scheduler.resource.retry_failed_shard": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/retry-failed-shard/v1",
  },
  "scheduler.resource.merge_shard_handoffs": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/merge-shard-handoffs/v1",
  },
  "scheduler.resource.accept_partial_handoff": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/accept-partial-handoff/v1",
  },
  "scheduler.resource.block_single_unit_over_profile": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/block-single-unit-over-profile/v1",
  },
  "scheduler.resolve_work_intent_resource_requirements": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/resolve-work-intent-resource-requirements/v1",
  },
  "scheduler.accept_resources_for_consumer": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-context-for-consumer/v1",
  },
  "scheduler.accept_resource_limitation_waiver": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context/accept-limitation-waiver/v1",
  },
  "scheduler.accept_resources_for_work_intent": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-context-for-work-intent/v1",
  },
  "scheduler.mark_read_only_work_intent_satisfied_from_resources": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/mark-read-only-work-intent-satisfied-from-context/v1",
  },
  "scheduler.promote_resource_satisfied_work_intent_to_executable": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/promote-context-satisfied-work-intent-to-executable/v1",
  },
  "scheduler.promote_resource_satisfied_intent": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/promote-context-satisfied-intent/v1",
  },
  "scheduler.request_resource_requirement_for_work_intent": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/request-resource-requirement-for-work-intent/v1",
  },
  "scheduler.retry_failed_resource_shard": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/retry-failed-context-shard/v1",
  },
  "scheduler.reshard_resource_requirement": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/reshard-resource-requirement/v1",
  },
  "scheduler.record_resource_handoff_for_consumer": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-resource-handoff-for-consumer/v1",
  },
  "scheduler.accept_partial_resources_for_work_intent": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-partial-context-for-work-intent/v1",
  },
  "scheduler.collapse_repeated_resource_blocker": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/collapse-repeated-context-blocker/v1",
  },
  "scheduler.define_node_contracts": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/define-node-contracts/v1",
  },
  "scheduler.define_node_contract": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/define-node-contract/v1",
  },
  "scheduler.define_edges_or_parallelism": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/define-edges-or-parallelism/v1",
  },
  "scheduler.compile_staged_runtime_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/compile-staged-runtime-graph/v1",
  },
  "scheduler.compile_runtime_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/compile-runtime-graph/v1",
  },
  "scheduler.finalize_decomposition_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/finalize-decomposition-graph/v1",
  },
  "scheduler.accept_work_intent_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-work-intent-graph/v1",
  },
  "scheduler.reject_work_intent_graph": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/reject-work-intent-graph/v1",
  },
  "scheduler.create_graph_node": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-graph-node/v1",
  },
  "scheduler.create_graph_edge": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-graph-edge/v1",
  },
  "scheduler.review_compiled_graph": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/review-compiled-graph/v1",
  },
  "scheduler.accept_staged_graph": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-staged-graph/v1",
  },
  "scheduler.reject_staged_graph": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/reject-staged-graph/v1",
  },
  "scheduler.evaluate_frontier_readiness": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-frontier-readiness/v1",
  },
  "scheduler.open_executable_frontier": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/open-executable-frontier/v1",
  },
  "scheduler.record_node_transition": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-node-transition/v1",
  },
  "scheduler.create_prerequisite_node": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-prerequisite-node/v1",
  },
  "scheduler.link_prerequisite_to_target": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/link-prerequisite-to-target/v1",
  },
  "scheduler.block_node_for_precondition": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/block-node-for-precondition/v1",
  },
  "scheduler.promote_work_intent_to_executable": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/promote-work-intent-to-executable/v1",
  },
  "scheduler.request_transition_repair_intent": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/request-transition-repair-intent/v1",
  },
  "scheduler.accept_transition_repair": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-transition-repair/v1",
  },
  "scheduler.reject_transition_repair": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/reject-transition-repair/v1",
  },
  "scheduler.approve_and_run_first_node": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/approve-and-run-first-node/v1",
  },
  "scheduler.select_next_node": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/select-next-node/v1",
  },
  "scheduler.request_human_decision": {
    family: "human_task.request",
    authorityClass: "human_operator",
    schemaRef: "runtime-tool://scheduler/request-human-decision/v1",
  },
  "scheduler.review_node_result": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/review-node-result/v1",
  },
  "scheduler.classify_repair_or_escalation": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/classify-repair-or-escalation/v1",
  },
  "scheduler.evaluate_closeout_readiness": {
    family: "closeout.generate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-closeout-readiness/v1",
  },
  "scheduler.evaluate_completion_readiness": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-completion-readiness/v1",
  },
  "scheduler.mark_needs_review": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/mark-needs-review/v1",
  },
  "scheduler.create_closeout_request": {
    family: "closeout.generate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/create-closeout-request/v1",
  },
  "resource.requirement.compile": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/requirement/compile/v1",
  },
  "resource.materialize_node_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/materialize-node-packet/v1",
  },
  "resource.materialize_domain_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/materialize-domain-packet/v1",
  },
  "node.execution_packet.validate_hydration": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/validate-hydration/v1",
  },
  "node.execution_packet.project_readiness": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/project-readiness/v1",
  },
  "node.execution_packet.create_partial": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/create-partial/v1",
  },
  "node.execution_packet.attach_resource_demand": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/attach-resource-demand/v1",
  },
  "node.execution_packet.attach_resource_ledger_manifest": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/attach-resource-ledger-manifest/v1",
  },
  "node.execution_packet.mark_resource_ledger_ready": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/mark-resource-ledger-ready/v1",
  },
  "node.execution_packet.require_domain_resource_selection": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/require-domain-resource-selection/v1",
  },
  "resource.selection.propose": {
    family: "resource.selection",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/selection/propose/v1",
  },
  "resource.selection.mark_blocked": {
    family: "resource.selection",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/selection/mark-blocked/v1",
  },
  "resource.selection.accept": {
    family: "resource.selection",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/selection/accept/v1",
  },
  "resource.selection.request_revision": {
    family: "resource.selection",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource/selection/request-revision/v1",
  },
  "domain.action_gate.evaluate": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://domain/action-gate/evaluate/v1",
  },
  "domain.action_gate.block": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://domain/action-gate/block/v1",
  },
  "domain.action_gate.promote_worker_action_ready": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://domain/action-gate/promote-worker-action-ready/v1",
  },
  "node.execution_packet.evaluate_action_gate": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/evaluate-action-gate/v1",
  },
  "node.execution_packet.block_action_gate": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/block-action-gate/v1",
  },
  "node.execution_packet.promote_worker_action_ready": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/promote-worker-edit-ready/v1",
  },
  "node.execution_packet.project_progressive_readiness": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/execution-packet/project-progressive-readiness/v1",
  },
  "node.compile_execution_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/compile-execution-packet/v1",
  },
  "node.evaluate_readiness": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/evaluate-readiness/v1",
  },
  "node.recompute_readiness": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/recompute-readiness/v1",
  },
  "node.compare_readiness_projection": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/compare-readiness-projection/v1",
  },
  "node.mark_readiness_stale": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/mark-readiness-stale/v1",
  },
  "node.upsert_child_for_epoch": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/upsert-child-for-epoch/v1",
  },
  "node.supersede_child_epoch": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/supersede-child-epoch/v1",
  },
  "node.promote_ready_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/promote-ready-packet/v1",
  },
  "node.plan_resource_repair": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/plan-resource-repair/v1",
  },
  "frontier.evaluate_epoch_eligibility": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://frontier/evaluate-epoch-eligibility/v1",
  },
  "frontier.block_stale_child": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://frontier/block-stale-child/v1",
  },
  "readback.project_canonical_gate": {
    family: "work_queue.project_event",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://readback/project-canonical-gate/v1",
  },
  "readback.project_readiness_drift": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://readback/project-readiness-drift/v1",
  },
  "readback.record_projection_drift": {
    family: "work_queue.project_event",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://readback/record-projection-drift/v1",
  },
  "provider.diagnostics.capture_response_shape": {
    family: "model.call",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://provider-diagnostics/capture-response-shape/v1",
  },
  "provider.diagnostics.record_preflight_block": {
    family: "model.call",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://provider-diagnostics/record-preflight-block/v1",
  },
  "provider.diagnostics.record_timeout_or_empty": {
    family: "model.call",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://provider-diagnostics/record-timeout-or-empty/v1",
  },
  "heap.record_phase_snapshot": {
    family: "diagnostic.bounded",
    authorityClass: "diagnostic",
    schemaRef: "runtime-tool://heap/record-phase-snapshot/v1",
  },
  "artifact.manifest.assert_bounds": {
    family: "artifact.payload",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://artifact/manifest-assert-bounds/v1",
  },
  "replay.boundary.load_checkpoint": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://replay/boundary/load-checkpoint/v1",
  },
  "replay.boundary.validate_fidelity": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/validate-fidelity/v1",
  },
  "replay.boundary.normalize_checkpoint": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/normalize-checkpoint/v1",
  },
  "replay.boundary.reject_diagnostic_only": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/reject-diagnostic-only/v1",
  },
  "replay.boundary.resume_production_path": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/resume-production-path/v1",
  },
  "replay.boundary.record_latest_state": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-latest-state/v1",
  },
  "replay.boundary.record_blocker": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-blocker/v1",
  },
  "replay.boundary.record_success": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-success/v1",
  },
  "replay.proof.run_boundary_sequence": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/run-boundary-sequence/v1",
  },
  "replay.proof.block_full_product_spec": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/block-full-product-spec/v1",
  },
  "replay.proof.admit_full_product_spec": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/admit-full-product-spec/v1",
  },
  "resource_broker.submit_request": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/submit-request/v1",
  },
  "resource_broker.resolve_inherited_resource": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-broker/resolve-inherited-context/v1",
  },
  "resource_broker.dispatch_resource_specialist_subturn": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/dispatch-context-scout/v1",
  },
  "resource_broker.mark_consumer_ready": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/mark-consumer-ready/v1",
  },
  "resource_repair.compile_requirement": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-repair/compile-requirement/v1",
  },
  "resource_repair.link_consumer": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-repair/link-consumer/v1",
  },
  "resource_repair.mark_diagnostic_only": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-repair/mark-diagnostic-only/v1",
  },
  "resource_repair.block_without_requirement": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-repair/block-without-requirement/v1",
  },
  "resource.requirement.get": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://resource-requirement/get-requirement/v1",
  },
  "context.resolve_target_refs": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://implementation-context/resolve-target-refs/v1",
  },
  "context.resolve_directory_seed": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://implementation-context/resolve-directory-seed/v1",
  },
  "repo.snapshot_target_files": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://implementation-context/snapshot-target-files/v1",
  },
  "context.compile_implementation_context_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://implementation-context/compile-packet/v1",
  },
  "implementation.compile_task_packet": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://implementation-context/compile-task-packet/v1",
  },
  "implementation.select_target_files": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://implementation-context/select-target-files/v1",
  },
  "implementation.declare_new_file_intent": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://implementation-context/declare-new-file-intent/v1",
  },
  "implementation.evaluate_readiness": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://implementation-context/evaluate-readiness/v1",
  },
  "artifact.payload.put_json": {
    family: "artifact.payload",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://artifact/payload/put-json/v1",
  },
  "artifact.payload.put_json_parts": {
    family: "artifact.payload",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://artifact/payload/put-json-parts/v1",
  },
  "artifact.payload.attach_manifest": {
    family: "artifact.payload",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://artifact/payload/attach-manifest/v1",
  },
  "artifact.payload.get_json": {
    family: "artifact.payload",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://artifact/payload/get-json/v1",
  },
  "artifact.payload.hydrate_manifest": {
    family: "artifact.payload",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://artifact/payload/hydrate-manifest/v1",
  },
  "worker_smoke.prepare_matrix": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker-smoke/prepare-matrix/v1",
  },
  "worker_smoke.hydrate_lane": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker-smoke/hydrate-lane/v1",
  },
  "worker_smoke.run_lane": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker-smoke/run-lane/v1",
  },
  "worker_smoke.record_result": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker-smoke/record-result/v1",
  },
  "worker_smoke.assert_review_artifact": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker-smoke/assert-review-artifact/v1",
  },
  "worker_smoke.record_blocker": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker-smoke/record-blocker/v1",
  },
  "proof_entry.prepare_suite": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/prepare-suite/v1",
  },
  "proof_entry.prepare_case": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/prepare-case/v1",
  },
  "proof_entry.inject_structural_fault": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/inject-structural-fault/v1",
  },
  "proof_entry.run_preflight": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/run-preflight/v1",
  },
  "proof_entry.assert_safe_block": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-safe-block/v1",
  },
  "proof_entry.assert_no_provider_invocation": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-no-provider-invocation/v1",
  },
  "proof_entry.assert_no_executable_frontier": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-no-executable-frontier/v1",
  },
  "proof_entry.assert_no_authority_widening": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-no-authority-widening/v1",
  },
  "proof_entry.assert_sibling_evidence_survived": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-sibling-evidence-survived/v1",
  },
  "proof_entry.assert_review_artifact_hydrates": {
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://proof-entry/assert-review-artifact-hydrates/v1",
  },
  "proof_entry.record_case_result": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/record-case-result/v1",
  },
  "proof_entry.record_suite_closeout": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://proof-entry/record-suite-closeout/v1",
  },
  "action_review.create": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://action-review/create/v1",
  },
  "action_review.link_validation": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://action-review/link-validation/v1",
  },
  "action_review.link_evidence": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://action-review/link-evidence/v1",
  },
  "action_review.record_rollback": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://action-review/record-rollback/v1",
  },
  "action_review.hydrate": {
    family: "validation.review",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://action-review/hydrate/v1",
  },
  "worker.edit.persist_review_artifact": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/edit/persist-review-artifact/v1",
  },
  "worker.edit.hydrate_review_artifact": {
    family: "validation.review",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/edit/hydrate-review-artifact/v1",
  },
  "review.inspect_action_artifact": {
    family: "validation.review",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://review/inspect-action-artifact/v1",
  },
  "review.record_decision": {
    family: "validation.review",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://review/record-decision/v1",
  },
  "source_prompt.index": {
    family: "source_prompt.context",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://source-prompt/index/v1",
  },
  "source_prompt.request_excerpt": {
    family: "source_prompt.context",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://source-prompt/request-excerpt/v1",
  },
  "source_prompt.provide_excerpt": {
    family: "source_prompt.context",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://source-prompt/provide-excerpt/v1",
  },
  "source_prompt.deny_excerpt": {
    family: "source_prompt.context",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://source-prompt/deny-excerpt/v1",
  },
  "repo.search": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/repo/search/v1",
  },
  "repo.list_files": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/repo/list-files/v1",
  },
  "file.read": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/file/read/v1",
  },
  "file.inspect_symbols": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/file/inspect-symbols/v1",
  },
  "test.find_related": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/test/find-related/v1",
  },
  "context.handoff": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/handoff/v1",
  },
  "context.limitations": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/limitations/v1",
  },
  "context.evidence_claim": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/evidence-claim/v1",
  },
  "context.request_more_context": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/request-more-context/v1",
  },
  "resource.scout.plan": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan/v1",
  },
  "resource.scout.search_repo": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/search-repo/v1",
  },
  "resource.scout.read_file_refs": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/read-file-refs/v1",
  },
  "resource.scout.select_relevant_files": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/select-relevant-files/v1",
  },
  "resource.scout.extract_existing_patterns": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/extract-existing-patterns/v1",
  },
  "resource.scout.assess_risks": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/assess-risks/v1",
  },
  "resource.scout.plan_edit_points": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan-edit-points/v1",
  },
  "resource.scout.plan_validation": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan-validation/v1",
  },
  "resource.scout.inspect_tests": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/inspect-tests/v1",
  },
  "resource.scout.request_prompt_excerpt": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-prompt-excerpt/v1",
  },
  "resource.scout.receive_prompt_excerpt": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/receive-prompt-excerpt/v1",
  },
  "resource.scout.verify_refs": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/verify-refs/v1",
  },
  "resource.scout.review_sufficiency": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/review-sufficiency/v1",
  },
  "resource.scout.emit_handoff_packet": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/emit-handoff-packet/v1",
  },
  "resource.scout.request_repair": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-repair/v1",
  },
  "resource.scout.build_execution_packet": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/build-execution-packet/v1",
  },
  "resource.scout.request_repo_resource": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-repo-context/v1",
  },
  "resource.scout.classify_resource_blocker": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/classify-context-blocker/v1",
  },
  "resource.scout.report_relevant_file": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/report-relevant-file/v1",
  },
  "resource.scout.report_existing_pattern": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/report-existing-pattern/v1",
  },
  "resource.scout.report_risk": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/report-risk/v1",
  },
  "resource.scout.recommend_edit_point": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/recommend-edit-point/v1",
  },
  "resource.scout.recommend_validation": {
    family: "resource.scout",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/recommend-validation/v1",
  },
  "resource.scout.submit_shard_handoff": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/submit-shard-handoff/v1",
  },
  "resource.scout.mark_insufficient_context": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/mark-insufficient-context/v1",
  },
  "worker.invoke": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/invoke/v1",
  },
  "coding.inspect_edit_validate": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/inspect-edit-validate/v1",
  },
  "coding.add_test_and_validate": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/add-test-and-validate/v1",
  },
  "coding.update_docs_and_cross_refs": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/update-docs-and-cross-refs/v1",
  },
  "coding.refactor_symbol_with_lsp": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/refactor-symbol-with-lsp/v1",
  },
  "coding.fix_type_errors": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/fix-type-errors/v1",
  },
  "coding.apply_small_patch_with_evidence": {
    family: "coding.compound",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://coding/apply-small-patch-with-evidence/v1",
  },
  "worker.context.request_more": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/request-more/v1",
  },
  "worker.context.propose_searches": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/propose-searches/v1",
  },
  "worker.context.search": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/search/v1",
  },
  "worker.context.search_symbols": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/search-symbols/v1",
  },
  "worker.context.find_callers": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/find-callers/v1",
  },
  "worker.context.find_tests": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/find-tests/v1",
  },
  "worker.context.open_adjacent": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/open-adjacent/v1",
  },
  "worker.context.open_ref": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/open-ref/v1",
  },
  "worker.context.open_around_match": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/open-around-match/v1",
  },
  "worker.context.open_window": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/open-window/v1",
  },
  "worker.context.expand_window": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/expand-window/v1",
  },
  "worker.context.contract_window": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/context/contract-window/v1",
  },
  "worker.context.accept_window": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/accept-window/v1",
  },
  "worker.context.report_pattern": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/report-pattern/v1",
  },
  "worker.context.report_risk": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/report-risk/v1",
  },
  "worker.context.report_edit_point": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/report-edit-point/v1",
  },
  "worker.context.finish_context_turn": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/finish-context-turn/v1",
  },
  "worker.context.mark_unanswerable": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/mark-unanswerable/v1",
  },
  "worker.context.provide_bounded_snapshot": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/provide-bounded-snapshot/v1",
  },
  "worker.context.deny_request": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/context/deny-request/v1",
  },
  "resource.demand.open": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/open/v1",
  },
  "resource.demand.fulfill_exact_handles": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/fulfill-exact-handles/v1",
  },
  "resource.demand.request_file_window": {
    family: "resource.demand",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://node-resource-demand/request-file-window/v1",
  },
  "resource.demand.request_symbol": {
    family: "resource.demand",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://node-resource-demand/request-symbol/v1",
  },
  "resource.demand.request_related_tests": {
    family: "resource.demand",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://node-resource-demand/request-related-tests/v1",
  },
  "resource.demand.request_memory_pack": {
    family: "resource.demand",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://node-resource-demand/request-memory-pack/v1",
  },
  "resource.demand.fulfillment_required": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/fulfillment-required/v1",
  },
  "resource.demand.recompile_from_scope_revision": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/recompile-from-scope-revision/v1",
  },
  "resource.demand.execute_recompiled_packet": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/execute-recompiled-packet/v1",
  },
  "resource.demand.mark_blocked": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/mark-blocked/v1",
  },
  "resource.demand.close": {
    family: "resource.demand",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-resource-demand/close/v1",
  },
  "resource.scout.narrow_scope": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/narrow-scope/v1",
  },
  "resource.scout.narrowing_selector_missing": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/narrowing-selector-missing/v1",
  },
  "resource.scout.narrowing_selector_failed": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/narrowing-selector-failed/v1",
  },
  "resource.scout.narrowing_selector_rejected": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/narrowing-selector-rejected/v1",
  },
  "resource.scout.dispatch_specialist_subturn": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/dispatch-subturn/v1",
  },
  "resource.scout.choose_file_from_listing": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/choose-file-from-listing/v1",
  },
  "resource.scout.choose_search_query": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/choose-search-query/v1",
  },
  "resource.scout.choose_window_from_matches": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/choose-window-from-matches/v1",
  },
  "resource.scout.expand_window": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/expand-window/v1",
  },
  "resource.scout.contract_window": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/contract-window/v1",
  },
  "resource.scout.submit_exact_handles": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/submit-exact-handles/v1",
  },
  "resource.scout.submit_specialist_handoff": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/submit-handoff/v1",
  },
  "resource.scout.mark_narrowing_blocked": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/mark-narrowing-blocked/v1",
  },
  "resource.scout.mark_specialist_blocked": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/mark-blocked/v1",
  },
  "resource.scout.append_handoff_to_ledger": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/append-handoff-to-ledger/v1",
  },
  "resource.scout.project_specialist_result": {
    family: "resource.scout",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/specialist/project-result/v1",
  },
  "resource.ledger.open": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/open/v1",
  },
  "resource.ledger.append_file_window": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-file-window/v1",
  },
  "resource.ledger.append_symbol": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-symbol/v1",
  },
  "resource.ledger.append_related_test": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-related-test/v1",
  },
  "resource.ledger.append_memory_pack": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-memory-pack/v1",
  },
  "resource.ledger.append_resource_ref": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-resource-ref/v1",
  },
  "resource.ledger.report_relevant_file": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-relevant-file/v1",
  },
  "resource.ledger.report_relevant_resource": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-relevant-resource/v1",
  },
  "resource.ledger.append_source_prompt_section": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/append-source-prompt-section/v1",
  },
  "resource.ledger.report_owner_constraint": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-owner-constraint/v1",
  },
  "resource.ledger.report_project_fact": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-project-fact/v1",
  },
  "resource.ledger.report_research_brief": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-research-brief/v1",
  },
  "resource.ledger.report_planning_capsule": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-planning-capsule/v1",
  },
  "resource.ledger.report_planning_action_point": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-planning-action-point/v1",
  },
  "resource.ledger.report_action_graph_candidate": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-action-graph-candidate/v1",
  },
  "resource.ledger.recommend_compile_readiness": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/recommend-compile-readiness/v1",
  },
  "resource.ledger.report_human_decision": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-human-decision/v1",
  },
  "resource.ledger.report_closeout_ref": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-closeout-ref/v1",
  },
  "resource.ledger.report_existing_pattern": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-existing-pattern/v1",
  },
  "resource.ledger.report_risk": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-risk/v1",
  },
  "resource.ledger.recommend_edit_point": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/recommend-edit-point/v1",
  },
  "resource.ledger.recommend_validation": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/recommend-validation/v1",
  },
  "resource.ledger.recommend_domain_validation": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/recommend-domain-validation/v1",
  },
  "resource.ledger.report_limitation": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/report-limitation/v1",
  },
  "resource.ledger.record_provider_diagnostic": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/record-provider-diagnostic/v1",
  },
  "resource.ledger.project_manifest": {
    family: "resource.ledger",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://resource-ledger/project-manifest/v1",
  },
  "resource.ledger.hydrate_entry": {
    family: "resource.ledger",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://resource-ledger/hydrate-entry/v1",
  },
  "resource.ledger.close": {
    family: "resource.ledger",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://resource-ledger/close/v1",
  },
  "worker.repo.search": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/search/v1",
  },
  "worker.repo.read_files": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/read-files/v1",
  },
  "worker.repo.inspect_tests": {
    family: "worker.invoke",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/repo/inspect-tests/v1",
  },
  "worker.edit.plan": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/edit/plan/v1",
  },
  "worker.edit.apply_patch": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/edit/apply-patch/v1",
  },
  "worker.edit.apply_from_plan": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/edit/apply-from-plan/v1",
  },
  "worker.edit.draft_from_snapshot": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/edit/draft-from-snapshot/v1",
  },
  "worker.patch.author_edit": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/patch/author-edit/v1",
  },
  "edit_transaction.start": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/start/v1",
  },
  "edit_transaction.read_file": {
    family: "edit_transaction.lifecycle",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://edit-transaction/read-file/v1",
  },
  "edit_transaction.plan": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/plan/v1",
  },
  "edit_transaction.apply_patch": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://edit-transaction/apply-patch/v1",
  },
  "edit_transaction.validate": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/validate/v1",
  },
  "edit_transaction.repair": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/repair/v1",
  },
  "edit_transaction.emit_evidence": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/emit-evidence/v1",
  },
  "edit_transaction.rollback": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://edit-transaction/rollback/v1",
  },
  "edit_transaction.close": {
    family: "edit_transaction.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://edit-transaction/close/v1",
  },
  "worker.validation.explain_failure": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/explain-failure/v1",
  },
  "worker.validation.get_failure_context": {
    family: "validation.run",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://worker/validation/get-failure-context/v1",
  },
  "worker.repair.author_edit": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/repair/author-edit/v1",
  },
  "worker.repair.mark_upstream_blocker": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/repair/mark-upstream-blocker/v1",
  },
  "worker.repair.request_high_capability_escalation": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/repair/request-high-capability-escalation/v1",
  },
  "worker.progress.mark_no_edit_blocker": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/progress/mark-no-edit-blocker/v1",
  },
  "worker.patch.force_author_from_plan": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/patch/force-author-from-plan/v1",
  },
  "worker.evidence.claim": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/claim/v1",
  },
  "worker.evidence.claim_commitment_progress": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/claim-commitment-progress/v1",
  },
  "worker.evidence.claim_from_validation": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/claim-from-validation/v1",
  },
  "worker.evidence.link_validation": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/link-validation/v1",
  },
  "planning.intent.record": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/intent/record/v1",
  },
  "planning.research.request_brief": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/research/request-brief/v1",
  },
  "planning.capsule.draft": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/capsule/draft/v1",
  },
  "planning.capsule.revise": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/capsule/revise/v1",
  },
  "planning.human_decision.request": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/human-decision/request/v1",
  },
  "planning.action_graph.propose": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/action-graph/propose/v1",
  },
  "planning.compile_readiness.evaluate": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/compile-readiness/evaluate/v1",
  },
  "planning.closeout.summarize": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/closeout/summarize/v1",
  },
  "worker.review.add_issue": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/review/add-issue/v1",
  },
  "worker.review.approve_or_request_changes": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/review/approve-or-request-changes/v1",
  },
  "worker.escalate": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/escalate/v1",
  },
  "worker.file_context.inspect": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-context/inspect/v1",
  },
  "worker.file_edit.plan": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/plan/v1",
  },
  "worker.file_edit.propose_patch": {
    family: "file_edit.propose",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/propose-patch/v1",
  },
  "worker.file_edit.apply_patch": {
    family: "file_edit.apply",
    authorityClass: "bounded_repo_write",
    schemaRef: "runtime-tool://worker/file-edit/apply-patch/v1",
  },
  "worker.validation.run": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/run/v1",
  },
  "worker.validation.run_structural_default": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/run-structural-default/v1",
  },
  "worker.validation.record_result": {
    family: "validation.run",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/record-result/v1",
  },
  "worker.validation.request_repair": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/request-repair/v1",
  },
  "worker.validation.record_blocker": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/record-blocker/v1",
  },
  "worker.escalation.request_high_capability": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/escalation/request-high-capability/v1",
  },
  "worker.escalation.execute_high_capability": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/escalation/execute-high-capability/v1",
  },
  "worker.escalation.mark_unavailable": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/escalation/mark-unavailable/v1",
  },
  "worker.validation.classify_failure": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/validation/classify-failure/v1",
  },
  "worker.file_edit.repair": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/repair/v1",
  },
  "worker.file_edit.escalate": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/file-edit/escalate/v1",
  },
  "worker.evidence.handoff": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://worker/evidence/handoff/v1",
  },
  "mission.ledger.apply_evidence_claims": {
    family: "domain.action_gate",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://mission/ledger/apply-evidence-claims/v1",
  },
};

function boundedSummary(value: string): string {
  return value.trim().slice(0, 1_200);
}

function jsonObject(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function defaultSchedulerToolExecutor(toolId: SchedulerRuntimeToolId): RuntimeToolExecutor {
  return {
    async execute(input): Promise<RuntimeToolExecutorResult> {
      if (toolId === "resource.requirement.block_broad_payload") {
        const outputRef =
          input.inputRef ??
          `runtime-tool://resource-requirement/broad-payload-blocked/${input.graphId ?? "unknown-graph"}/${input.nodeId ?? "unknown-node"}`;
        return {
          status: "needs_review",
          outputRef,
          outputHash: input.inputHash ?? outputRef,
          outputSummary: "Resource requirement payload is too broad for the worker-owned context path.",
          reasonCodes: ["resource_requirement_broad_payload_blocked"],
          metadata: {
            artifactKind: "resource_requirement_broad_payload_blocked_tool_output",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } satisfies JsonValue,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (toolId.startsWith("resource.demand.")) {
        const metadata = jsonObject(input.metadata);
        if (toolId === "resource.demand.fulfillment_required") {
          const outputRef =
            input.inputRef ??
            `runtime-tool://node-resource-demand/fulfillment-required/${input.graphId ?? "unknown-graph"}/${input.nodeId ?? "unknown-node"}`;
          return {
            status: "needs_review",
            outputRef,
            outputHash: input.inputHash ?? outputRef,
            outputSummary:
              "NodeResourceDemandSession is open and requires direct fulfillment or specialist subturn.",
            reasonCodes: [
              "node_resource_demand_fulfillment_required_recorded",
              ...(
                Array.isArray(metadata.reasonCodes)
                  ? metadata.reasonCodes.filter(
                      (reason): reason is string => typeof reason === "string",
                    )
                  : []
              ).slice(0, 20),
            ],
            metadata: {
              artifactKind: "node_resource_demand_fulfillment_required_tool_output",
              toolId,
              status: "needs_review",
              reasonCodes: Array.isArray(metadata.reasonCodes)
                ? metadata.reasonCodes.slice(0, 20)
                : [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } satisfies JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
        const compiledDemandOutput = jsonObject(metadata.nodeResourceDemandToolOutput);
        const compiledDemandStatus =
          typeof compiledDemandOutput.nodeResourceDemandStatus === "string"
            ? compiledDemandOutput.nodeResourceDemandStatus
            : null;
        if (compiledDemandStatus) {
          const outputRef =
            typeof compiledDemandOutput.nodeResourceDemandFulfillmentRef === "string"
              ? compiledDemandOutput.nodeResourceDemandFulfillmentRef
              : typeof compiledDemandOutput.nodeResourceDemandBlockerRef === "string"
                ? compiledDemandOutput.nodeResourceDemandBlockerRef
                : typeof compiledDemandOutput.nodeResourceDemandSessionRef === "string"
                  ? compiledDemandOutput.nodeResourceDemandSessionRef
                  : input.inputRef ??
                    `runtime-tool://node-resource-demand/${toolId}/${input.graphId ?? "unknown-graph"}/${input.nodeId ?? "unknown-node"}`;
          return {
            status:
              compiledDemandStatus === "open" ||
              compiledDemandStatus === "fulfilled" ||
              compiledDemandStatus === "closed"
                ? "succeeded"
                : "needs_review",
            outputRef,
            outputHash: input.inputHash ?? outputRef,
            outputSummary: `${toolId} recorded compiled ${compiledDemandStatus} node resource demand state.`,
            reasonCodes: [
              "node_resource_demand_trace_used_compiled_output",
              `node_resource_demand_${compiledDemandStatus}`,
              ...(
                Array.isArray(metadata.reasonCodes)
                  ? metadata.reasonCodes.filter(
                      (reason): reason is string => typeof reason === "string",
                    )
                  : []
              ).slice(0, 20),
            ],
            metadata: {
              artifactKind: "node_resource_demand_tool_output",
              toolId,
              status: compiledDemandStatus,
              nodeResourceDemandToolOutput: compiledDemandOutput,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } satisfies JsonValue,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
        const output = compileNodeResourceDemandToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if ((CONTEXT_SCOUT_SPECIALIST_TOOL_IDS as readonly string[]).includes(toolId)) {
        const output = compileContextScoutSpecialistToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (toolId.startsWith("resource.ledger.")) {
        const output = compileNodeResourceLedgerToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (toolId.startsWith("planning.")) {
        const output = compilePlanningDomainSmallVerbToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (toolId.startsWith("domain.action_gate.")) {
        const output = compileDomainActionGateToolOutput({
          toolId,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (
        toolId.startsWith("resource.") ||
        toolId.startsWith("node.execution_packet.") ||
        toolId.startsWith("node.") ||
        toolId.startsWith("frontier.") ||
        toolId.startsWith("readback.") ||
        toolId.startsWith("replay.") ||
        toolId.startsWith("resource_broker.") ||
        toolId.startsWith("resource_repair.") ||
        toolId === "context.resolve_target_refs" ||
        toolId === "context.resolve_directory_seed" ||
        toolId === "repo.snapshot_target_files" ||
        toolId === "context.compile_implementation_context_packet" ||
        toolId === "implementation.compile_task_packet" ||
        toolId === "implementation.select_target_files" ||
        toolId === "implementation.declare_new_file_intent" ||
        toolId === "implementation.evaluate_readiness"
      ) {
        if (
          toolId === "context.resolve_target_refs" ||
          toolId === "context.resolve_directory_seed" ||
          toolId === "repo.snapshot_target_files" ||
          toolId === "context.compile_implementation_context_packet" ||
          toolId === "implementation.compile_task_packet" ||
          toolId === "implementation.select_target_files" ||
          toolId === "implementation.declare_new_file_intent" ||
          toolId === "implementation.evaluate_readiness"
        ) {
          const output = compileImplementationContextToolOutput({
            toolId,
            volatileInput: input.volatileInput,
            metadata: input.metadata,
          });
          return {
            status: output.status,
            outputRef: output.outputRef,
            outputHash: output.outputHash,
            outputSummary: output.outputSummary,
            reasonCodes: output.reasonCodes,
            metadata: output.metadata,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
          };
        }
        const output = compileNodeResourceMaterializationToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      if (isCapabilityManifestRuntimeToolId(toolId)) {
        const output = compileCapabilityManifestRuntimeToolOutput({
          toolId,
          volatileInput: input.volatileInput,
          metadata: input.metadata,
        });
        return {
          status: output.status,
          outputRef: output.outputRef,
          outputHash: output.outputHash,
          outputSummary: output.outputSummary,
          reasonCodes: output.reasonCodes,
          metadata: output.metadata,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      const metadata = jsonObject(input.metadata);
      if (
        toolId.startsWith("action_review.") ||
        toolId === "worker.edit.persist_review_artifact" ||
        toolId === "worker.edit.hydrate_review_artifact" ||
        toolId.startsWith("review.")
      ) {
        const artifactRef =
          typeof metadata.actionReviewArtifactRef === "string"
            ? metadata.actionReviewArtifactRef
            : typeof metadata.workerEditReviewArtifactRef === "string"
              ? metadata.workerEditReviewArtifactRef
              : typeof metadata.reviewArtifactRef === "string"
                ? metadata.reviewArtifactRef
                : null;
        const reviewState =
          typeof metadata.reviewState === "string" ? metadata.reviewState : null;
        const reasonCodes =
          Array.isArray(metadata.reasonCodes) &&
          metadata.reasonCodes.every((value) => typeof value === "string")
            ? (metadata.reasonCodes as string[])
            : [`${toolId.replaceAll(".", "_")}_recorded`];
        const actionMetadata = actionReviewToolMetadata({
          toolId,
          artifactRef,
          reviewState,
          reasonCodes,
        });
        return {
          status: "succeeded",
          outputRef: artifactRef ?? `runtime-tool-output://${input.invocationId ?? toolId}`,
          outputHash: `scheduler-tool:${toolId}:${input.idempotencyKey}`,
          outputSummary: boundedSummary(`${toolId} recorded bounded action-review evidence.`),
          reasonCodes,
          artifacts: [],
          metadata: {
            ...metadata,
            ...actionMetadata,
            schedulerRuntimeToolRecorded: true,
          } as JsonValue,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        };
      }
      const repairClassification = jsonObject(metadata.runtimeRepairClassification);
      const repairClassificationRef =
        typeof repairClassification.classificationRef === "string"
          ? repairClassification.classificationRef
          : null;
      const outputRef =
        repairClassificationRef ?? `runtime-tool-output://${input.invocationId ?? toolId}`;
      return {
        status: "succeeded",
        outputRef,
        outputHash: `scheduler-tool:${toolId}:${input.idempotencyKey}`,
        outputSummary: boundedSummary(`${toolId} recorded bounded scheduler operation evidence.`),
        reasonCodes: [`${toolId.replaceAll(".", "_")}_recorded`],
        artifacts: repairClassificationRef
          ? [
              {
                invocationId: input.invocationId ?? `pending:${toolId}`,
                artifactType: "runtime_repair_classification",
                storageKind: "metadata",
                artifactRef: repairClassificationRef,
                contentHash: `repair-classification:${repairClassificationRef}`,
                boundedSummary: "Bounded repair classification recorded before retry.",
                metadata: {
                  repairClassification,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawLogsStored: false,
                  secretsStored: false,
                },
                rawContentStored: false,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                secretsStored: false,
              },
            ]
          : [],
        metadata: {
          ...metadata,
          schedulerRuntimeToolRecorded: true,
          rawPromptStored: false,
          rawResponseStored: false,
        } as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      };
    },
  };
}

export function buildSchedulerRuntimeToolDefinition(toolId: SchedulerRuntimeToolId) {
  if (isCodeIntelligenceRuntimeToolId(toolId)) {
    return buildCodeIntelligenceRuntimeToolDefinition(toolId);
  }
  const config = SCHEDULER_TOOL_FAMILIES[toolId];
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey:
      toolId === "worker.invoke"
        ? "runtime-work-graph.node-executor"
        : `runtime-work-graph.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: toolId === "worker.invoke" ? null : 30_000,
    enabled: toolId !== "scheduler.approve_and_run_first_node",
  });
}

export function registerSchedulerRuntimeTools(input: {
  registry: RuntimeToolRegistry;
  includeWorkerInvoke?: boolean;
  codeIntelligenceService?: CodeIntelligenceService;
}): void {
  for (const toolId of SCHEDULER_RUNTIME_TOOL_IDS) {
    if (toolId === "worker.invoke" && input.includeWorkerInvoke !== true) {
      continue;
    }
    if (isCodeIntelligenceRuntimeToolId(toolId)) {
      input.registry.register(
        buildCodeIntelligenceRuntimeToolDefinition(toolId),
        createCodeIntelligenceRuntimeToolExecutor({ service: input.codeIntelligenceService }),
      );
      continue;
    }
    input.registry.register(
      buildSchedulerRuntimeToolDefinition(toolId),
      defaultSchedulerToolExecutor(toolId),
    );
  }
}

export async function invokeSchedulerRuntimeTool(input: {
  kernel: RuntimeToolKernel;
  toolId: SchedulerRuntimeToolId;
  runtimeJobId?: string | null;
  graphId: string;
  nodeId?: string | null;
  roleRef?: string | null;
  modelRef?: string | null;
  idempotencyKey: string;
  inputRef?: string | null;
  inputHash?: string | null;
  inputSummary: string;
  budget?: RuntimeToolBudget;
  metadata?: JsonValue;
  volatileInput?: unknown;
}): Promise<SchedulerRuntimeToolInvocationSummary> {
  const result: RuntimeToolKernelInvokeResult = await input.kernel.invoke({
    toolId: input.toolId,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId,
    nodeId: input.nodeId ?? null,
    roleRef: input.roleRef ?? null,
    modelRef: input.modelRef ?? null,
    idempotencyScope: `runtime-work-graph-scheduler:${input.graphId}`,
    idempotencyKey: input.idempotencyKey,
    inputRef: input.inputRef ?? null,
    inputHash: input.inputHash ?? null,
    inputSummary: boundedSummary(input.inputSummary),
    volatileInput: input.volatileInput,
    budget: input.budget,
    metadata: input.metadata ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    runtimeLifecycleMutated: false,
  });
  return {
    toolId: input.toolId,
    invocationRef: result.invocationRef,
    status: result.invocation.status,
    outputRef: result.invocation.outputRef,
    outputHash: result.invocation.outputHash,
    outputSummary: result.invocation.outputSummary,
    outputMetadata: result.result?.metadata ?? result.invocation.metadata ?? null,
    reasonCodes: result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}
