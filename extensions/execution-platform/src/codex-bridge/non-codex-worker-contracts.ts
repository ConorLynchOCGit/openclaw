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
  | "worker.context.provide_bounded_snapshot"
  | "worker.context.deny_request"
  | "worker.repo.search"
  | "worker.repo.read_files"
  | "worker.repo.inspect_tests"
  | "worker.edit.plan"
  | "worker.edit.apply_patch"
  | "worker.validation.run"
  | "worker.validation.explain_failure"
  | "worker.validation.classify_failure"
  | "worker.evidence.claim"
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
