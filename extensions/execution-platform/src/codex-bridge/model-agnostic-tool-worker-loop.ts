export type ModelAgnosticWorkerPhase =
  | "worker.loop.started"
  | "worker.model_call.started"
  | "worker.model_call.waiting"
  | "worker.model_call.completed"
  | "worker.model_call.failed"
  | "worker.phase_queue.deferred"
  | "worker.phase_queue.replayed"
  | "worker.phase_queue.routed_subturn"
  | "worker.plan.started"
  | "worker.plan.completed"
  | "worker.explore.started"
  | "worker.tool.selected"
  | "worker.tool.started"
  | "worker.tool.completed"
  | "worker.context.insufficient"
  | "worker.edit.plan_started"
  | "worker.edit.plan_completed"
  | "worker.edit.apply_started"
  | "worker.edit.apply_completed"
  | "worker.validation.started"
  | "worker.validation.failed"
  | "worker.validation.passed"
  | "worker.repair.started"
  | "worker.repair.completed"
  | "worker.escalation.recommended"
  | "worker.evidence.claimed"
  | "worker.loop.completed"
  | "worker.loop.needs_review"
  | "worker.loop.failed";

export type ModelAgnosticWorkerSpecializationKind =
  | "kimi_implementation"
  | "non_codex_context_scout"
  | "non_codex_test_writer"
  | "non_codex_docs_editor"
  | "non_codex_validation_failure_explainer"
  | "non_codex_frontend_editor";

export type ModelAgnosticWorkerSpecialization = {
  specializationId: ModelAgnosticWorkerSpecializationKind;
  displayName: string;
  roleClass: "context" | "implementation" | "validation" | "docs" | "frontend";
  workerRef: string;
  modelPolicyRef: string;
  qualificationProfileIds: string[];
  providerPath: string;
  runnableState: "production" | "contract_only";
  idealTaskShape: string;
  toolPermissionIds: string[];
  maxRecommendedFileCount: number;
  maxRecommendedDiffSize: number;
  maxRecommendedContextRefs: number;
  validationExpectations: string[];
  escalationTargets: string[];
  authorityBoundaries: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelAgnosticWorkerPhaseEvent = {
  artifactKind: "model_agnostic_worker_phase_event";
  phase: ModelAgnosticWorkerPhase;
  runtimeJobId: string | null;
  graphId: string | null;
  nodeId: string | null;
  workerSpecializationId: ModelAgnosticWorkerSpecializationKind;
  workerId: string;
  roleId: string;
  modelRef: string;
  providerPath: string;
  objectiveSummary: string;
  whySelected: string | null;
  targetRefs: string[];
  inputPacketRefs: string[];
  contextRefs: string[];
  contextSynthesisRefs: string[];
  codeIntelligenceRefs: string[];
  toolId: string | null;
  toolInvocationRef: string | null;
  toolStatus: string | null;
  compoundToolId: string | null;
  compoundSubEventCount: number | null;
  compoundSubEventPhases: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  currentValidationCommandRef: string | null;
  currentValidationCommandSummary: string | null;
  editTransactionRefs: string[];
  editTransactionPhase: string | null;
  editTransactionStatus: string | null;
  editTransactionRepairCount: number | null;
  outputHash: string | null;
  outputContentLength: number | null;
  providerLatencyMs: number | null;
  providerTimeoutMs: number | null;
  providerFinishReason: string | null;
  providerTokenCount: number | null;
  providerUsage: {
    inputTokenCount: number | null;
    outputTokenCount: number | null;
    totalTokenCount: number | null;
    estimatedCostUsd: number | null;
    usageUnavailableReason: string | null;
  } | null;
  modelProviderDiagnostics: Record<string, unknown> | null;
  commitmentIdsAdvanced: string[];
  blockerSummary: string | null;
  nextAction: string | null;
  eli5Progress: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ModelAgnosticWorkerPhaseSink = (
  event: ModelAgnosticWorkerPhaseEvent,
) => void | Promise<void>;

export const MODEL_AGNOSTIC_WORKER_SPECIALIZATIONS: ModelAgnosticWorkerSpecialization[] = [
  {
    specializationId: "kimi_implementation",
    displayName: "Kimi implementation worker",
    roleClass: "implementation",
    workerRef: "worker.kimi.file-implementation",
    modelPolicyRef:
      "policy://codex-parity/openclaw-role/implementation-standard/qwen-controller-kimi-patch",
    qualificationProfileIds: [
      "openrouter.qwen.qwen3-coder-next",
      "openrouter.moonshotai.kimi-k2.6",
    ],
    providerPath: "openrouter",
    runnableState: "production",
    idealTaskShape:
      "Scoped implementation or test edit with bounded target refs, acceptance criteria, validation refs, Qwen controller/repair/evidence turns, and Kimi reasoning-none patch turns.",
    toolPermissionIds: [
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
      "worker.validation.run",
      "worker.validation.explain_failure",
      "worker.evidence.claim",
      "worker.escalate",
    ],
    maxRecommendedFileCount: 6,
    maxRecommendedDiffSize: 1_200,
    maxRecommendedContextRefs: 18,
    validationExpectations: [
      "source edit evidence when source edit is required",
      "focused validation refs",
      "commitment-linked evidence claims",
    ],
    escalationTargets: ["implementation_complex", "non_codex_validation_failure_explainer"],
    authorityBoundaries: ["approved_file_scope_only", "approved_validation_refs_only"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    specializationId: "non_codex_context_scout",
    displayName: "Non-Codex context scout",
    roleClass: "context",
    workerRef: "worker.non-codex.context-scout",
    modelPolicyRef: "policy://codex-parity/openclaw-role/context-scout/non-codex",
    qualificationProfileIds: [
      "openrouter.deepseek.deepseek-v4-flash",
      "openrouter.deepseek.deepseek-v4-pro",
    ],
    providerPath: "openrouter",
    runnableState: "production",
    idealTaskShape:
      "Read-only repo exploration that returns bounded file refs, edit-point hypotheses, and uncertainty notes.",
    toolPermissionIds: ["worker.repo.search", "worker.repo.read_files", "worker.evidence.claim"],
    maxRecommendedFileCount: 20,
    maxRecommendedDiffSize: 0,
    maxRecommendedContextRefs: 30,
    validationExpectations: ["bounded context handoff refs", "no source edits"],
    escalationTargets: ["kimi_implementation", "implementation_complex"],
    authorityBoundaries: ["read_only"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    specializationId: "non_codex_test_writer",
    displayName: "Non-Codex test writer",
    roleClass: "validation",
    workerRef: "worker.non-codex.test-writer",
    modelPolicyRef: "policy://codex-parity/openclaw-role/test-writer/non-codex",
    qualificationProfileIds: [
      "openrouter.moonshotai.kimi-k2.6",
      "openrouter.deepseek.deepseek-v4-pro",
    ],
    providerPath: "openrouter",
    runnableState: "production",
    idealTaskShape:
      "Focused test creation or repair with explicit test file refs and validation command refs.",
    toolPermissionIds: [
      "coding.add_test_and_validate",
      "coding.fix_type_errors",
      "worker.repo.search",
      "worker.repo.read_files",
      "worker.repo.inspect_tests",
      "worker.edit.plan",
      "worker.edit.apply_patch",
      "worker.validation.run",
      "worker.evidence.claim",
    ],
    maxRecommendedFileCount: 4,
    maxRecommendedDiffSize: 900,
    maxRecommendedContextRefs: 16,
    validationExpectations: ["test file edit refs", "focused validation refs"],
    escalationTargets: ["kimi_implementation", "implementation_complex"],
    authorityBoundaries: ["test_or_adjacent_files_only", "no_test_weakening_without_review"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    specializationId: "non_codex_docs_editor",
    displayName: "Non-Codex docs editor",
    roleClass: "docs",
    workerRef: "worker.non-codex.docs-editor",
    modelPolicyRef: "policy://codex-parity/openclaw-role/docs-editor/non-codex",
    qualificationProfileIds: [
      "openrouter.moonshotai.kimi-k2.6",
      "openrouter.deepseek.deepseek-v4-flash",
    ],
    providerPath: "openrouter",
    runnableState: "production",
    idealTaskShape: "Bounded docs/spec/runbook edits with formatting validation where available.",
    toolPermissionIds: [
      "coding.update_docs_and_cross_refs",
      "worker.repo.search",
      "worker.repo.read_files",
      "worker.edit.plan",
      "worker.edit.apply_patch",
      "worker.validation.run",
      "worker.evidence.claim",
    ],
    maxRecommendedFileCount: 6,
    maxRecommendedDiffSize: 1_600,
    maxRecommendedContextRefs: 20,
    validationExpectations: ["docs changed refs", "format/check refs when available"],
    escalationTargets: ["implementation_complex"],
    authorityBoundaries: ["docs_and_specs_only"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    specializationId: "non_codex_validation_failure_explainer",
    displayName: "Non-Codex validation failure explainer",
    roleClass: "validation",
    workerRef: "worker.non-codex.validation-failure-explainer",
    modelPolicyRef: "policy://codex-parity/openclaw-role/validation-explainer/non-codex",
    qualificationProfileIds: [
      "openrouter.deepseek.deepseek-v4-flash",
      "openrouter.deepseek.deepseek-v4-pro",
    ],
    providerPath: "openrouter",
    runnableState: "production",
    idealTaskShape:
      "Read bounded validation summaries and propose repair guidance; does not complete implementation by itself.",
    toolPermissionIds: [
      "worker.repo.read_files",
      "worker.validation.explain_failure",
      "worker.evidence.claim",
    ],
    maxRecommendedFileCount: 8,
    maxRecommendedDiffSize: 0,
    maxRecommendedContextRefs: 16,
    validationExpectations: ["repair guidance refs", "no source edit completion"],
    escalationTargets: ["kimi_implementation", "implementation_complex"],
    authorityBoundaries: ["read_only", "cannot_mark_source_edit_complete"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    specializationId: "non_codex_frontend_editor",
    displayName: "Non-Codex frontend editor",
    roleClass: "frontend",
    workerRef: "worker.non-codex.frontend-editor",
    modelPolicyRef: "policy://codex-parity/openclaw-role/frontend-editor/non-codex",
    qualificationProfileIds: [],
    providerPath: "openrouter",
    runnableState: "contract_only",
    idealTaskShape:
      "Frontend code edits after UI validation command refs and screenshot/readback checks are wired.",
    toolPermissionIds: [],
    maxRecommendedFileCount: 0,
    maxRecommendedDiffSize: 0,
    maxRecommendedContextRefs: 0,
    validationExpectations: ["not production-selectable until executable tools are wired"],
    escalationTargets: ["implementation_complex"],
    authorityBoundaries: ["not_selectable_in_production"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
];

export function modelAgnosticWorkerSpecializationFor(
  specializationId: ModelAgnosticWorkerSpecializationKind,
): ModelAgnosticWorkerSpecialization {
  const profile = MODEL_AGNOSTIC_WORKER_SPECIALIZATIONS.find(
    (item) => item.specializationId === specializationId,
  );
  if (!profile) {
    throw new Error(`model_agnostic_worker_specialization_unknown:${specializationId}`);
  }
  return profile;
}

export function buildModelAgnosticWorkerPhaseEvent(input: {
  phase: ModelAgnosticWorkerPhase;
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  workerSpecializationId?: ModelAgnosticWorkerSpecializationKind;
  workerId: string;
  roleId: string;
  modelRef: string;
  providerPath: string;
  objectiveSummary: string;
  whySelected?: string | null;
  targetRefs?: string[];
  inputPacketRefs?: string[];
  contextRefs?: string[];
  contextSynthesisRefs?: string[];
  codeIntelligenceRefs?: string[];
  toolId?: string | null;
  toolInvocationRef?: string | null;
  toolStatus?: string | null;
  compoundToolId?: string | null;
  compoundSubEventCount?: number | null;
  compoundSubEventPhases?: string[];
  changedFileRefs?: string[];
  validationRefs?: string[];
  currentValidationCommandRef?: string | null;
  currentValidationCommandSummary?: string | null;
  editTransactionRefs?: string[];
  editTransactionPhase?: string | null;
  editTransactionStatus?: string | null;
  editTransactionRepairCount?: number | null;
  outputHash?: string | null;
  outputContentLength?: number | null;
  providerLatencyMs?: number | null;
  providerTimeoutMs?: number | null;
  providerFinishReason?: string | null;
  providerTokenCount?: number | null;
  providerUsage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
    usageUnavailableReason?: string | null;
  } | null;
  modelProviderDiagnostics?: Record<string, unknown> | null;
  commitmentIdsAdvanced?: string[];
  blockerSummary?: string | null;
  nextAction?: string | null;
  eli5Progress: string;
  reasonCodes?: string[];
}): ModelAgnosticWorkerPhaseEvent {
  return {
    artifactKind: "model_agnostic_worker_phase_event",
    phase: input.phase,
    runtimeJobId: input.runtimeJobId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    workerSpecializationId: input.workerSpecializationId ?? "kimi_implementation",
    workerId: input.workerId,
    roleId: input.roleId,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    objectiveSummary: input.objectiveSummary.trim().replace(/\s+/gu, " ").slice(0, 1_000),
    whySelected: input.whySelected?.trim().replace(/\s+/gu, " ").slice(0, 1_000) ?? null,
    targetRefs: [...new Set(input.targetRefs ?? [])].slice(0, 20),
    inputPacketRefs: [...new Set(input.inputPacketRefs ?? [])].slice(0, 20),
    contextRefs: [...new Set(input.contextRefs ?? [])].slice(0, 30),
    contextSynthesisRefs: [...new Set(input.contextSynthesisRefs ?? [])].slice(0, 20),
    codeIntelligenceRefs: [...new Set(input.codeIntelligenceRefs ?? [])].slice(0, 20),
    toolId: input.toolId ?? null,
    toolInvocationRef: input.toolInvocationRef ?? null,
    toolStatus: input.toolStatus?.trim().replace(/\s+/gu, " ").slice(0, 120) ?? null,
    compoundToolId: input.compoundToolId?.trim().replace(/\s+/gu, " ").slice(0, 180) ?? null,
    compoundSubEventCount:
      typeof input.compoundSubEventCount === "number" &&
      Number.isFinite(input.compoundSubEventCount)
        ? Math.max(0, Math.trunc(input.compoundSubEventCount))
        : null,
    compoundSubEventPhases: [...new Set(input.compoundSubEventPhases ?? [])].slice(0, 20),
    changedFileRefs: [...new Set(input.changedFileRefs ?? [])].slice(0, 20),
    validationRefs: [...new Set(input.validationRefs ?? [])].slice(0, 20),
    currentValidationCommandRef:
      input.currentValidationCommandRef?.trim().replace(/\s+/gu, " ").slice(0, 320) ?? null,
    currentValidationCommandSummary:
      input.currentValidationCommandSummary?.trim().replace(/\s+/gu, " ").slice(0, 700) ?? null,
    editTransactionRefs: [...new Set(input.editTransactionRefs ?? [])].slice(0, 20),
    editTransactionPhase:
      input.editTransactionPhase?.trim().replace(/\s+/gu, " ").slice(0, 120) ?? null,
    editTransactionStatus:
      input.editTransactionStatus?.trim().replace(/\s+/gu, " ").slice(0, 120) ?? null,
    editTransactionRepairCount:
      typeof input.editTransactionRepairCount === "number" &&
      Number.isFinite(input.editTransactionRepairCount)
        ? Math.max(0, Math.trunc(input.editTransactionRepairCount))
        : null,
    outputHash: input.outputHash?.trim().replace(/\s+/gu, " ").slice(0, 180) ?? null,
    outputContentLength:
      typeof input.outputContentLength === "number" && Number.isFinite(input.outputContentLength)
        ? Math.max(0, Math.trunc(input.outputContentLength))
        : null,
    providerLatencyMs:
      typeof input.providerLatencyMs === "number" && Number.isFinite(input.providerLatencyMs)
        ? Math.max(0, Math.trunc(input.providerLatencyMs))
        : null,
    providerTimeoutMs:
      typeof input.providerTimeoutMs === "number" && Number.isFinite(input.providerTimeoutMs)
        ? Math.max(0, Math.trunc(input.providerTimeoutMs))
        : null,
    providerFinishReason:
      input.providerFinishReason?.trim().replace(/\s+/gu, " ").slice(0, 160) ?? null,
    providerTokenCount:
      typeof input.providerTokenCount === "number" && Number.isFinite(input.providerTokenCount)
        ? Math.max(0, Math.trunc(input.providerTokenCount))
        : null,
    providerUsage: input.providerUsage
      ? {
          inputTokenCount:
            typeof input.providerUsage.inputTokenCount === "number" &&
            Number.isFinite(input.providerUsage.inputTokenCount)
              ? Math.max(0, Math.trunc(input.providerUsage.inputTokenCount))
              : null,
          outputTokenCount:
            typeof input.providerUsage.outputTokenCount === "number" &&
            Number.isFinite(input.providerUsage.outputTokenCount)
              ? Math.max(0, Math.trunc(input.providerUsage.outputTokenCount))
              : null,
          totalTokenCount:
            typeof input.providerUsage.totalTokenCount === "number" &&
            Number.isFinite(input.providerUsage.totalTokenCount)
              ? Math.max(0, Math.trunc(input.providerUsage.totalTokenCount))
              : null,
          estimatedCostUsd:
            typeof input.providerUsage.estimatedCostUsd === "number" &&
            Number.isFinite(input.providerUsage.estimatedCostUsd)
              ? input.providerUsage.estimatedCostUsd
              : null,
          usageUnavailableReason:
            input.providerUsage.usageUnavailableReason
              ?.trim()
              .replace(/\s+/gu, " ")
              .slice(0, 260) ?? null,
        }
      : null,
    modelProviderDiagnostics: input.modelProviderDiagnostics
      ? {
          ...input.modelProviderDiagnostics,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }
      : null,
    commitmentIdsAdvanced: [...new Set(input.commitmentIdsAdvanced ?? [])].slice(0, 20),
    blockerSummary: input.blockerSummary?.trim().replace(/\s+/gu, " ").slice(0, 1_000) ?? null,
    nextAction: input.nextAction?.trim().replace(/\s+/gu, " ").slice(0, 1_000) ?? null,
    eli5Progress: input.eli5Progress.trim().replace(/\s+/gu, " ").slice(0, 500),
    reasonCodes: [...new Set(input.reasonCodes ?? [])].slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function modelAgnosticWorkerSpecializationManifest(): {
  artifactKind: "model_agnostic_worker_specialization_manifest";
  specializationCount: number;
  productionRunnableCount: number;
  specializations: ModelAgnosticWorkerSpecialization[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
} {
  return {
    artifactKind: "model_agnostic_worker_specialization_manifest",
    specializationCount: MODEL_AGNOSTIC_WORKER_SPECIALIZATIONS.length,
    productionRunnableCount: MODEL_AGNOSTIC_WORKER_SPECIALIZATIONS.filter(
      (item) => item.runnableState === "production",
    ).length,
    specializations: MODEL_AGNOSTIC_WORKER_SPECIALIZATIONS,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
