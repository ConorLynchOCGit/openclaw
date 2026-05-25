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
  RuntimeToolFamily,
  RuntimeToolStatus,
} from "../runtime-tool-call/runtime-tool-types.ts";
import { CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS } from "./context-scout-tool-loop.ts";
import { compileImplementationContextToolOutput } from "./implementation-context-snapshot-compiler.ts";
import { compileNodeResourceMaterializationToolOutput } from "./node-resource-materialization.ts";

export const SCHEDULER_RUNTIME_TOOL_IDS = [
  "scheduler.mission_ledger_readiness",
  "scheduler.commitment_work_packet_readiness",
  "scheduler.evaluate_canonical_frontier",
  "scheduler.record_no_progress_signature",
  "scheduler.mission_ledger_evaluation_throttle",
  "scheduler.evaluate_expansion_admission",
  "scheduler.open_superstep_frontier",
  "scheduler.record_superstep_branch_result",
  "scheduler.join_superstep_frontier",
  "scheduler.context_synthesis.create",
  "scheduler.context_synthesis.review",
  "scheduler.context_synthesis.accept",
  "scheduler.context_synthesis.reject",
  "scheduler.draft_work_breakdown",
  "scheduler.review_work_breakdown",
  "scheduler.draft_commitment_work_breakdown",
  "scheduler.shortlist_capabilities_for_work_units",
  "scheduler.select_capability_for_work_unit",
  "scheduler.shortlist_capabilities",
  "scheduler.propose_decomposition_outline",
  "scheduler.map_commitments_to_work_units",
  "scheduler.select_capabilities_for_work_units",
  "scheduler.select_capabilities",
  "scheduler.compile_work_intents",
  "scheduler.validate_work_intent_capability",
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
  "node.compile_execution_packet",
  "node.evaluate_readiness",
  "node.record_readiness_blocker",
  "node.promote_ready_packet",
  "node.plan_resource_repair",
  "context_broker.submit_request",
  "context_broker.resolve_inherited_context",
  "context_broker.dispatch_context_scout",
  "context_broker.mark_consumer_ready",
  "context.resolve_target_refs",
  "repo.snapshot_target_files",
  "context.compile_implementation_context_packet",
  "implementation.compile_task_packet",
  "implementation.evaluate_readiness",
  "artifact.payload.put_json",
  "artifact.payload.put_json_parts",
  "artifact.payload.attach_manifest",
  "artifact.payload.get_json",
  "artifact.payload.hydrate_manifest",
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
  "worker.repair.author_edit",
  "worker.repair.mark_upstream_blocker",
  "worker.repair.request_high_capability_escalation",
  "worker.progress.mark_no_edit_blocker",
  "worker.evidence.claim",
  "worker.evidence.claim_commitment_progress",
  "worker.evidence.claim_from_validation",
  "worker.evidence.link_validation",
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
  "scheduler.commitment_work_packet_readiness": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/commitment-work-packet-readiness/v1",
  },
  "scheduler.evaluate_canonical_frontier": {
    family: "scheduler.select_next_node",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/evaluate-canonical-frontier/v1",
  },
  "scheduler.record_no_progress_signature": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/record-no-progress-signature/v1",
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
  "scheduler.context_synthesis.create": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context-synthesis-create/v1",
  },
  "scheduler.context_synthesis.review": {
    family: "scheduler.evaluate_node_result",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context-synthesis-review/v1",
  },
  "scheduler.context_synthesis.accept": {
    family: "scheduler.decompose_graph",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context-synthesis-accept/v1",
  },
  "scheduler.context_synthesis.reject": {
    family: "scheduler.repair_decision",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://scheduler/context-synthesis-reject/v1",
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
  "node.record_readiness_blocker": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://node/record-readiness-blocker/v1",
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
  "context_broker.submit_request": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/submit-request/v1",
  },
  "context_broker.resolve_inherited_context": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-broker/resolve-inherited-context/v1",
  },
  "context_broker.dispatch_context_scout": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/dispatch-context-scout/v1",
  },
  "context_broker.mark_consumer_ready": {
    family: "node.resource_materialization",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-broker/mark-consumer-ready/v1",
  },
  "context.resolve_target_refs": {
    family: "node.resource_materialization",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://implementation-context/resolve-target-refs/v1",
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
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/repo/search/v1",
  },
  "repo.list_files": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/repo/list-files/v1",
  },
  "file.read": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/file/read/v1",
  },
  "file.inspect_symbols": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/file/inspect-symbols/v1",
  },
  "test.find_related": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/test/find-related/v1",
  },
  "context.handoff": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/handoff/v1",
  },
  "context.limitations": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/limitations/v1",
  },
  "context.evidence_claim": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/evidence-claim/v1",
  },
  "context.request_more_context": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/context/request-more-context/v1",
  },
  "context_scout.plan": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan/v1",
  },
  "context_scout.search_repo": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/search-repo/v1",
  },
  "context_scout.read_file_refs": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/read-file-refs/v1",
  },
  "context_scout.select_relevant_files": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/select-relevant-files/v1",
  },
  "context_scout.extract_existing_patterns": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/extract-existing-patterns/v1",
  },
  "context_scout.assess_risks": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/assess-risks/v1",
  },
  "context_scout.plan_edit_points": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan-edit-points/v1",
  },
  "context_scout.plan_validation": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/plan-validation/v1",
  },
  "context_scout.inspect_tests": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/inspect-tests/v1",
  },
  "context_scout.request_prompt_excerpt": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-prompt-excerpt/v1",
  },
  "context_scout.receive_prompt_excerpt": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/receive-prompt-excerpt/v1",
  },
  "context_scout.verify_refs": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/verify-refs/v1",
  },
  "context_scout.review_sufficiency": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/review-sufficiency/v1",
  },
  "context_scout.emit_handoff_packet": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/emit-handoff-packet/v1",
  },
  "context_scout.request_repair": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-repair/v1",
  },
  "context_scout.build_execution_packet": {
    family: "context_scout.tool_loop",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/build-execution-packet/v1",
  },
  "context_scout.request_repo_context": {
    family: "context_scout.tool_loop",
    authorityClass: "read_only",
    schemaRef: "runtime-tool://context-scout/request-repo-context/v1",
  },
  "context_scout.classify_context_blocker": {
    family: "context_scout.tool_loop",
    authorityClass: "bounded_runtime_write",
    schemaRef: "runtime-tool://context-scout/classify-context-blocker/v1",
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
    async execute(input) {
      if (
        toolId.startsWith("node.") ||
        toolId.startsWith("context_broker.") ||
        toolId === "context.resolve_target_refs" ||
        toolId === "repo.snapshot_target_files" ||
        toolId === "context.compile_implementation_context_packet" ||
        toolId === "implementation.compile_task_packet" ||
        toolId === "implementation.evaluate_readiness"
      ) {
        if (
          toolId === "context.resolve_target_refs" ||
          toolId === "repo.snapshot_target_files" ||
          toolId === "context.compile_implementation_context_packet" ||
          toolId === "implementation.compile_task_packet" ||
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
      const metadata = jsonObject(input.metadata);
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
