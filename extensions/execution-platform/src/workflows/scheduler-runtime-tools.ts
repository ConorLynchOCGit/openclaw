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
  compileCapabilityManifestRuntimeToolOutput,
  isCapabilityManifestRuntimeToolId,
} from "./capability-manifest-domain-lifecycle.ts";
import { compilePlanningSmallVerbToolOutput } from "./planning-small-verb-tool-surface.ts";

export const SCHEDULER_RUNTIME_TOOL_IDS = [
  "scheduler.accept_requirement_map",
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
  "scheduler.apply_graph_patch_tool_calls",
  "capability.lookup",
  "capability.validate_intent",
  "capability.require_resources",
  "capability.require_validation",
  "capability.require_evidence",
  "capability.list_legal_transitions",
  "scheduler.accept_graph_patch",
  "scheduler.persist_graph_patch_node",
  "scheduler.persist_graph_patch_edge",
  "scheduler.reject_graph_patch",
  "scheduler.evaluate_frontier_readiness",
  "scheduler.open_executable_frontier",
  "scheduler.record_node_transition",
  "scheduler.create_prerequisite_node",
  "scheduler.link_prerequisite_to_target",
  "scheduler.block_node_for_precondition",
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
  "readback.project_canonical_gate",
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
  ...CODE_INTELLIGENCE_RUNTIME_TOOL_IDS,
  "node.agent_session.invoke",
  "node.agent_session.invoke_high_capability",
  "worker.invoke",
  "coding.inspect_edit_validate",
  "coding.add_test_and_validate",
  "coding.update_docs_and_cross_refs",
  "coding.refactor_symbol_with_lsp",
  "coding.fix_type_errors",
  "coding.apply_small_patch_with_evidence",
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
  "scheduler.accept_requirement_map": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-requirement-map/v1",
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
  "scheduler.apply_graph_patch_tool_calls": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/apply-staged-graph-tool-calls/v1",
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
  "scheduler.accept_graph_patch": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/accept-graph-patch/v1",
  },
  "scheduler.persist_graph_patch_node": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/persist-graph-patch-node/v1",
  },
  "scheduler.persist_graph_patch_edge": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/persist-graph-patch-edge/v1",
  },
  "scheduler.reject_graph_patch": {
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
  "readback.project_canonical_gate": {
    family: "work_queue.project_event",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://readback/project-canonical-gate/v1",
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
    family: "diagnostic.bounded",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://replay/boundary/load-checkpoint/v1",
  },
  "replay.boundary.validate_fidelity": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/validate-fidelity/v1",
  },
  "replay.boundary.normalize_checkpoint": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/normalize-checkpoint/v1",
  },
  "replay.boundary.reject_diagnostic_only": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/reject-diagnostic-only/v1",
  },
  "replay.boundary.resume_production_path": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/resume-production-path/v1",
  },
  "replay.boundary.record_latest_state": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-latest-state/v1",
  },
  "replay.boundary.record_blocker": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-blocker/v1",
  },
  "replay.boundary.record_success": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/boundary/record-success/v1",
  },
  "replay.proof.run_boundary_sequence": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/run-boundary-sequence/v1",
  },
  "replay.proof.block_full_product_spec": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/block-full-product-spec/v1",
  },
  "replay.proof.admit_full_product_spec": {
    family: "diagnostic.bounded",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://replay/proof/admit-full-product-spec/v1",
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
  "node.agent_session.invoke": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-agent-session/invoke/v1",
  },
  "node.agent_session.invoke_high_capability": {
    family: "worker.invoke",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node-agent-session/invoke-high-capability/v1",
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
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/intent/record/v1",
  },
  "planning.research.request_brief": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/research/request-brief/v1",
  },
  "planning.capsule.draft": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/capsule/draft/v1",
  },
  "planning.capsule.revise": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/capsule/revise/v1",
  },
  "planning.human_decision.request": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/human-decision/request/v1",
  },
  "planning.action_graph.propose": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/action-graph/propose/v1",
  },
  "planning.compile_readiness.evaluate": {
    family: "planning.lifecycle",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://planning/compile-readiness/evaluate/v1",
  },
  "planning.closeout.summarize": {
    family: "planning.lifecycle",
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
    family: "mission.ledger",
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
      if (toolId.startsWith("planning.")) {
        const output = compilePlanningSmallVerbToolOutput({
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
      if (toolId.startsWith("replay.")) {
        const outputHash =
          input.inputHash ??
          `replay-diagnostic:${toolId}:${JSON.stringify(input.metadata ?? {}).length}`;
        return {
          status: "succeeded",
          outputRef:
            input.inputRef ??
            `runtime-tool://${toolId}/${outputHash.replace(/[^a-zA-Z0-9:._-]/gu, "_").slice(0, 80)}`,
          outputHash,
          outputSummary: `Recorded replay diagnostic tool ${toolId}.`,
          reasonCodes: ["scheduler_replay_diagnostic_tool_recorded", `runtime_tool:${toolId}`],
          metadata: {
            toolId,
            ...jsonObject(input.metadata),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
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
        const reviewState = typeof metadata.reviewState === "string" ? metadata.reviewState : null;
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
  const nodeExecutorTool =
    toolId === "worker.invoke" ||
    toolId === "node.agent_session.invoke" ||
    toolId === "node.agent_session.invoke_high_capability";
  return buildRuntimeToolDefinition({
    toolId,
    toolVersion: "v1",
    toolFamily: config.family,
    executorKey: nodeExecutorTool
      ? "runtime-work-graph.node-executor"
      : `runtime-work-graph.${toolId}`,
    schemaRef: config.schemaRef,
    authorityClass: config.authorityClass,
    defaultTimeoutMs: nodeExecutorTool ? null : 30_000,
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
    idempotencyScope: `scheduler-runtime-tools:${input.graphId}`,
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
