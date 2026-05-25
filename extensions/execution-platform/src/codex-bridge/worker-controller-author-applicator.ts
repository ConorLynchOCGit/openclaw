import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  NonCodexWorkerModelSlot,
  NonCodexToolCall,
  NonCodexToolResult,
  NonCodexToolUsingWorkerToolId,
} from "./non-codex-worker-contracts.ts";

export type WorkerSplitPhase =
  | "controller"
  | "context"
  | "author"
  | "applicator"
  | "validation"
  | "validation_repair"
  | "evidence"
  | "review"
  | "compound"
  | "escalation";

export type WorkerPhaseAuthorityMode = "strict" | "diagnostic";

export type WorkerPhaseStatus =
  | "planned"
  | "selected"
  | "started"
  | "succeeded"
  | "needs_review"
  | "failed"
  | "blocked";

export type WorkerPhaseRecord = {
  artifactKind: "worker_controller_author_applicator_phase";
  phaseRef: string;
  phase: WorkerSplitPhase;
  status: WorkerPhaseStatus;
  runtimeJobId: string | null;
  graphId: string | null;
  nodeId: string | null;
  workerId: string;
  roleId: string;
  taskId: string;
  modelSlot: NonCodexWorkerModelSlot | null;
  modelRef: string | null;
  providerPath: string | null;
  toolId: NonCodexToolUsingWorkerToolId | null;
  toolInvocationRef: string | null;
  transactionRef: string | null;
  targetCommitmentIds: string[];
  targetFileRefs: string[];
  objectiveSummary: string;
  summary: string;
  blockerSummary: string | null;
  nextAction: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
};

export type WorkerControllerDecision = {
  artifactKind: "worker_controller_decision";
  phase: "controller";
  selectedPhase: WorkerSplitPhase;
  selectedToolId: NonCodexToolUsingWorkerToolId | null;
  objectiveSummary: string;
  rationale: string;
  targetCommitmentIds: string[];
  missingContextRefs: string[];
  nextAction: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type EditAuthorRequest = {
  artifactKind: "edit_author_request";
  phase: "author";
  transactionRef: string;
  targetFileRefs: string[];
  targetCommitmentIds: string[];
  contextRefs: string[];
  validationCommandRefs: string[];
  objectiveSummary: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type EditAuthorResult = {
  artifactKind: "edit_author_result";
  phase: "author";
  status: "authored" | "needs_context" | "needs_review" | "escalated";
  transactionRef: string | null;
  toolCallRef: string | null;
  operationCount: number;
  targetFileRefs: string[];
  targetCommitmentIds: string[];
  summary: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeApplicatorRequest = {
  artifactKind: "runtime_applicator_request";
  phase: "applicator";
  transactionRef: string;
  toolCallRef: string;
  targetFileRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeApplicatorResult = {
  artifactKind: "runtime_applicator_result";
  phase: "applicator";
  status: "applied" | "needs_review" | "failed";
  transactionRef: string | null;
  changedFileRefs: string[];
  rejectedOperationCount: number;
  summary: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawToolLogStored: false;
};

export type WorkerContextRequest = {
  artifactKind: "worker_context_request";
  phase: "context";
  status: "requested" | "provided" | "denied";
  requestedFileRefs: string[];
  providedContextRefs: string[];
  reason: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkerRepairDecision = {
  artifactKind: "worker_repair_decision";
  phase: "validation_repair";
  failedPhaseRef: string | null;
  failedToolId: NonCodexToolUsingWorkerToolId | null;
  failureClass: string;
  preservedRefs: string[];
  nextAction: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkerEvidenceAuthorRequest = {
  artifactKind: "worker_evidence_author_request";
  phase: "evidence";
  transactionRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  targetCommitmentIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkerEvidenceAuthorResult = {
  artifactKind: "worker_evidence_author_result";
  phase: "evidence";
  status: "claimed" | "needs_review";
  evidenceRefs: string[];
  targetCommitmentIds: string[];
  summary: string;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type WorkerEscalationResult = {
  artifactKind: "worker_escalation_result";
  phase: "escalation";
  reason: string;
  partialEvidenceRefs: string[];
  unsuitableReasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export function splitPhaseForTool(toolId: NonCodexToolUsingWorkerToolId): WorkerSplitPhase {
  if (toolId.startsWith("coding.")) {
    return "compound";
  }
  if (
    toolId === "worker.context.request_more" ||
    toolId === "worker.context.provide_bounded_snapshot" ||
    toolId === "worker.context.deny_request" ||
    toolId === "worker.repo.search" ||
    toolId === "worker.repo.read_files" ||
    toolId === "worker.repo.inspect_tests"
  ) {
    return "context";
  }
  if (toolId === "worker.edit.plan" || toolId === "worker.edit.draft_from_snapshot") {
    return "author";
  }
  if (
    toolId === "worker.edit.apply_patch" ||
    toolId === "worker.edit.apply_from_plan" ||
    toolId === "worker.patch.force_author_from_plan" ||
    toolId === "worker.patch.author_edit" ||
    toolId === "worker.repair.author_edit"
  ) {
    return "applicator";
  }
  if (toolId === "worker.validation.run" || toolId === "worker.validation.run_structural_default") {
    return "validation";
  }
  if (
    toolId === "worker.validation.get_failure_context" ||
    toolId === "worker.validation.explain_failure" ||
    toolId === "worker.validation.classify_failure" ||
    toolId === "worker.repair.mark_upstream_blocker" ||
    toolId === "worker.repair.request_high_capability_escalation" ||
    toolId === "worker.progress.mark_no_edit_blocker"
  ) {
    return "validation_repair";
  }
  if (
    toolId === "worker.evidence.claim" ||
    toolId === "worker.evidence.claim_commitment_progress" ||
    toolId === "worker.evidence.claim_from_validation" ||
    toolId === "worker.evidence.link_validation"
  ) {
    return "evidence";
  }
  if (
    toolId === "worker.review.add_issue" ||
    toolId === "worker.review.approve_or_request_changes"
  ) {
    return "review";
  }
  return "escalation";
}

export function splitPhaseAllowedForModelSlot(input: {
  phase: WorkerSplitPhase;
  modelSlot: NonCodexWorkerModelSlot;
}): boolean {
  if (input.phase === "context") {
    return input.modelSlot === "context_decision" || input.modelSlot === "controller";
  }
  if (input.phase === "author") {
    return input.modelSlot === "patch" || input.modelSlot === "validation_repair";
  }
  if (input.phase === "applicator") {
    return input.modelSlot === "patch" || input.modelSlot === "validation_repair";
  }
  if (input.phase === "validation") {
    return input.modelSlot === "controller" || input.modelSlot === "validation_repair";
  }
  if (input.phase === "validation_repair") {
    return input.modelSlot === "validation_repair";
  }
  if (input.phase === "evidence") {
    return input.modelSlot === "evidence";
  }
  if (input.phase === "review") {
    return input.modelSlot === "evidence" || input.modelSlot === "controller";
  }
  if (input.phase === "compound") {
    return (
      input.modelSlot === "controller" ||
      input.modelSlot === "patch" ||
      input.modelSlot === "validation_repair"
    );
  }
  if (input.phase === "escalation") {
    return input.modelSlot === "escalation" || input.modelSlot === "controller";
  }
  return input.modelSlot === "controller";
}

export function enforceWorkerPhaseAuthority(input: {
  toolCalls: NonCodexToolCall[];
  modelSlot: NonCodexWorkerModelSlot;
  mode: WorkerPhaseAuthorityMode;
}): {
  acceptedToolCalls: NonCodexToolCall[];
  blockedToolCalls: NonCodexToolCall[];
  reasonCodes: string[];
  repairNotes: string[];
} {
  const blockedToolCalls: NonCodexToolCall[] = [];
  const acceptedToolCalls: NonCodexToolCall[] = [];
  const reasonCodes: string[] = [];
  const repairNotes: string[] = [];
  for (const call of input.toolCalls) {
    const phase = splitPhaseForTool(call.toolId);
    const allowed = splitPhaseAllowedForModelSlot({ phase, modelSlot: input.modelSlot });
    if (allowed || input.mode === "diagnostic") {
      acceptedToolCalls.push(call);
      if (!allowed) {
        reasonCodes.push(
          `worker_phase_authority_diagnostic:${input.modelSlot}:${phase}:${call.toolId}`,
        );
      }
      continue;
    }
    blockedToolCalls.push(call);
    reasonCodes.push(`worker_phase_authority_blocked:${input.modelSlot}:${phase}:${call.toolId}`);
    repairNotes.push(
      `The ${input.modelSlot} slot selected ${call.toolId}, which belongs to the ${phase} phase. Preserve completed progress and use the correct slot/phase next; controller/context slots may request context, patch slot authors edits, runtime applicator applies transactions, validation_repair repairs failures, and evidence slot claims evidence.`,
    );
  }
  return { acceptedToolCalls, blockedToolCalls, reasonCodes, repairNotes };
}

export function buildWorkerPhaseRef(input: {
  taskId: string;
  phase: WorkerSplitPhase;
  toolId?: string | null;
  sequence: number;
}): string {
  return `worker-phase://${input.taskId}/${input.sequence}/${input.phase}${
    input.toolId ? `/${input.toolId.replaceAll(".", "_")}` : ""
  }`;
}

export function buildWorkerPhaseRecord(input: {
  phaseRef: string;
  phase: WorkerSplitPhase;
  status: WorkerPhaseStatus;
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  workerId: string;
  roleId: string;
  taskId: string;
  modelSlot?: NonCodexWorkerModelSlot | null;
  modelRef?: string | null;
  providerPath?: string | null;
  toolId?: NonCodexToolUsingWorkerToolId | null;
  toolInvocationRef?: string | null;
  transactionRef?: string | null;
  targetCommitmentIds?: string[];
  targetFileRefs?: string[];
  objectiveSummary: string;
  summary: string;
  blockerSummary?: string | null;
  nextAction?: string | null;
  reasonCodes?: string[];
}): WorkerPhaseRecord {
  return {
    artifactKind: "worker_controller_author_applicator_phase",
    phaseRef: input.phaseRef,
    phase: input.phase,
    status: input.status,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    workerId: input.workerId,
    roleId: input.roleId,
    taskId: input.taskId,
    modelSlot: input.modelSlot ?? null,
    modelRef: input.modelRef ?? null,
    providerPath: input.providerPath ?? null,
    toolId: input.toolId ?? null,
    toolInvocationRef: input.toolInvocationRef ?? null,
    transactionRef: input.transactionRef ?? null,
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds ?? [], 20),
    targetFileRefs: uniqueStrings(input.targetFileRefs ?? [], 20),
    objectiveSummary: bounded(input.objectiveSummary, 1_000),
    summary: bounded(input.summary, 1_000),
    blockerSummary: input.blockerSummary ? bounded(input.blockerSummary, 1_000) : null,
    nextAction: input.nextAction ? bounded(input.nextAction, 300) : null,
    reasonCodes: uniqueStrings(input.reasonCodes ?? [], 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function summarizeWorkerPhasesForMetadata(phases: WorkerPhaseRecord[]): JsonValue {
  return phases.slice(-20).map((phase) => ({
    phaseRef: phase.phaseRef,
    phase: phase.phase,
    status: phase.status,
    modelSlot: phase.modelSlot,
    modelRef: phase.modelRef,
    toolId: phase.toolId,
    toolInvocationRef: phase.toolInvocationRef,
    transactionRef: phase.transactionRef,
    summary: phase.summary,
    blockerSummary: phase.blockerSummary,
    nextAction: phase.nextAction,
    targetCommitmentIds: phase.targetCommitmentIds.slice(0, 8),
    targetFileRefs: phase.targetFileRefs.slice(0, 8),
    reasonCodes: phase.reasonCodes.slice(0, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawToolLogStored: false,
  }));
}

export function workerPhaseRefs(phases: WorkerPhaseRecord[]): string[] {
  return uniqueStrings(
    phases.map((phase) => phase.phaseRef),
    50,
  );
}

export function buildControllerDecision(input: {
  toolCall: NonCodexToolCall | null;
  modelSlot: NonCodexWorkerModelSlot;
  objectiveSummary: string;
  targetCommitmentIds: string[];
}): WorkerControllerDecision {
  const selectedPhase = input.toolCall ? splitPhaseForTool(input.toolCall.toolId) : "controller";
  return {
    artifactKind: "worker_controller_decision",
    phase: "controller",
    selectedPhase,
    selectedToolId: input.toolCall?.toolId ?? null,
    objectiveSummary: bounded(input.objectiveSummary, 1_000),
    rationale: input.toolCall?.reason ?? `Model slot ${input.modelSlot} selected no tool.`,
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 20),
    missingContextRefs:
      input.toolCall?.toolId === "worker.context.request_more"
        ? stringList(input.toolCall.input.requestedFileRefs ?? input.toolCall.input.fileRefs, 12)
        : [],
    nextAction: input.toolCall ? `run_${selectedPhase}_phase` : "needs_review",
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function buildEditAuthorRequest(input: {
  transactionRef: string;
  targetFileRefs: string[];
  targetCommitmentIds: string[];
  contextRefs: string[];
  validationCommandRefs: string[];
  objectiveSummary: string;
}): EditAuthorRequest {
  return {
    artifactKind: "edit_author_request",
    phase: "author",
    transactionRef: input.transactionRef,
    targetFileRefs: uniqueStrings(input.targetFileRefs, 20),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 20),
    contextRefs: uniqueStrings(input.contextRefs, 30),
    validationCommandRefs: uniqueStrings(input.validationCommandRefs, 12),
    objectiveSummary: bounded(input.objectiveSummary, 1_000),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function buildEditAuthorResult(input: {
  transactionRef: string | null;
  toolCall: NonCodexToolCall;
  operationCount: number;
  targetFileRefs: string[];
  targetCommitmentIds: string[];
  status?: EditAuthorResult["status"];
  reasonCodes?: string[];
}): EditAuthorResult {
  return {
    artifactKind: "edit_author_result",
    phase: "author",
    status: input.status ?? (input.operationCount > 0 ? "authored" : "needs_review"),
    transactionRef: input.transactionRef,
    toolCallRef: input.toolCall.callId,
    operationCount: input.operationCount,
    targetFileRefs: uniqueStrings(input.targetFileRefs, 20),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 20),
    summary: bounded(input.toolCall.reason, 1_000),
    reasonCodes: uniqueStrings(input.reasonCodes ?? ["edit_author_result_recorded"], 20),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function buildRuntimeApplicatorResult(input: {
  result: NonCodexToolResult;
}): RuntimeApplicatorResult {
  const metadata = jsonRecord(input.result.metadata);
  return {
    artifactKind: "runtime_applicator_result",
    phase: "applicator",
    status:
      input.result.status === "succeeded"
        ? "applied"
        : input.result.status === "needs_review"
          ? "needs_review"
          : "failed",
    transactionRef:
      typeof metadata.editTransactionRef === "string" ? metadata.editTransactionRef : null,
    changedFileRefs: stringList(metadata.changedFileRefs, 20),
    rejectedOperationCount: stringList(metadata.failures, 20).length,
    summary: bounded(input.result.summary, 1_000),
    reasonCodes: uniqueStrings(input.result.reasonCodes, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawToolLogStored: false,
  };
}

function bounded(value: string, max = 500): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: string[], max = 40): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function stringList(value: unknown, max = 20): string[] {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return values
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}
