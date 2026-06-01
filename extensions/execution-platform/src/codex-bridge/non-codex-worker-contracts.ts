import type { JsonValue } from "../runtime-job-repository.ts";

export type NonCodexWorkerModelSlot =
  | "controller"
  | "patch"
  | "validation_repair"
  | "evidence"
  | "context_decision"
  | "escalation";

export type NonCodexToolUsingWorkerToolId =
  | "coding.inspect_edit_validate"
  | "coding.add_test_and_validate"
  | "coding.update_docs_and_cross_refs"
  | "coding.refactor_symbol_with_lsp"
  | "coding.fix_type_errors"
  | "coding.apply_small_patch_with_evidence"
  | "worker.context.request_more"
  | "worker.context.propose_searches"
  | "worker.context.search"
  | "worker.context.open_ref"
  | "worker.context.open_around_match"
  | "worker.context.open_window"
  | "worker.context.expand_window"
  | "worker.context.contract_window"
  | "worker.context.accept_window"
  | "worker.context.search_symbols"
  | "worker.context.find_callers"
  | "worker.context.find_tests"
  | "worker.context.open_adjacent"
  | "worker.context.report_pattern"
  | "worker.context.report_risk"
  | "worker.context.report_edit_point"
  | "worker.context.finish_context_turn"
  | "worker.context.mark_unanswerable"
  | "worker.context.provide_bounded_snapshot"
  | "worker.context.deny_request"
  | "worker.repo.search"
  | "worker.repo.read_files"
  | "worker.repo.inspect_tests"
  | "worker.edit.plan"
  | "worker.edit.apply_patch"
  | "worker.edit.apply_from_plan"
  | "worker.edit.draft_from_snapshot"
  | "worker.edit.persist_review_artifact"
  | "worker.edit.hydrate_review_artifact"
  | "worker.patch.force_author_from_plan"
  | "worker.patch.author_edit"
  | "worker.validation.run"
  | "worker.validation.run_structural_default"
  | "worker.validation.get_failure_context"
  | "worker.validation.explain_failure"
  | "worker.validation.classify_failure"
  | "worker.repair.author_edit"
  | "worker.repair.mark_upstream_blocker"
  | "worker.repair.request_high_capability_escalation"
  | "worker.progress.mark_no_edit_blocker"
  | "worker.evidence.claim"
  | "worker.evidence.claim_commitment_progress"
  | "worker.evidence.claim_from_validation"
  | "worker.evidence.link_validation"
  | "worker.review.add_issue"
  | "worker.review.approve_or_request_changes"
  | "action_review.create"
  | "action_review.link_validation"
  | "action_review.link_evidence"
  | "action_review.record_rollback"
  | "action_review.hydrate"
  | "review.inspect_action_artifact"
  | "review.record_decision"
  | "worker.escalate";

export type NonCodexToolCall = {
  callId: string;
  toolId: NonCodexToolUsingWorkerToolId;
  reason: string;
  input: Record<string, JsonValue>;
};

export type NonCodexToolResult = {
  callId: string;
  toolId: NonCodexToolUsingWorkerToolId;
  invocationRef: string;
  status: "succeeded" | "needs_review" | "failed";
  summary: string;
  outputRefs: string[];
  reasonCodes: string[];
  metadata: JsonValue;
  repairClassificationRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawToolLogStored: false;
};
