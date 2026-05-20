import type { ModelAgnosticWorkerSpecializationKind } from "./model-agnostic-tool-worker-loop.ts";

export type ModelAgnosticWorkerTaskFamily =
  | "repo_context_scout"
  | "small_source_edit"
  | "test_writing_edit"
  | "docs_spec_edit"
  | "validation_failure_explanation"
  | "frontend_scoped_edit";

export type ModelAgnosticWorkerQualificationStatus =
  | "production_qualified"
  | "candidate"
  | "blocked"
  | "needs_review";

export type ModelAgnosticWorkerCandidateProfile = {
  candidateId: string;
  displayName: string;
  modelRef: string;
  providerPath: "openrouter" | "codex_app_server" | "policy_owned";
  specializationIds: ModelAgnosticWorkerSpecializationKind[];
  responseFormatMode: "native_json" | "prompt_json" | "tool_loop" | "policy_owned";
  reasoningMode: "none" | "omit" | "low" | "medium" | "high" | "policy_owned";
  maxOutputTokens: number;
  timeoutMs: number;
  maxAttempts: number;
  costClass: "cheap" | "standard" | "premium";
  latencyClass: "fast" | "medium" | "slow";
  contextCapacity: "small" | "medium" | "large" | "very_large";
  idealTaskFamilies: ModelAgnosticWorkerTaskFamily[];
  maxTargetFiles: number;
  maxDiffBytes: number;
  toolProfileRefs: string[];
  knownWeaknesses: string[];
  escalationCandidateIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelAgnosticWorkerTaskFamilyQualification = {
  taskFamily: ModelAgnosticWorkerTaskFamily;
  status: ModelAgnosticWorkerQualificationStatus;
  evidenceRefs: string[];
  modelRunRefs: string[];
  qualityReviewRef: string | null;
  changedFileRefs: string[];
  validationRefs: string[];
  limitations: string[];
  reasonCodes: string[];
  liveModelCallMade: boolean;
  liveSourceEditMade: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelAgnosticWorkerQualificationRecord = {
  candidateId: string;
  modelRef: string;
  providerPath: string;
  status: ModelAgnosticWorkerQualificationStatus;
  taskFamilies: ModelAgnosticWorkerTaskFamilyQualification[];
  generatedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelAgnosticWorkerQualificationMatrix = {
  artifactKind: "model_agnostic_worker_qualification_matrix";
  schemaVersion: "execution-platform.model-agnostic-worker-qualification.v1";
  candidateProfiles: ModelAgnosticWorkerCandidateProfile[];
  records: ModelAgnosticWorkerQualificationRecord[];
  schedulerRecommendations: ModelAgnosticWorkerSchedulerRecommendation[];
  productionSelectableCandidateIds: string[];
  needsReviewCandidateIds: string[];
  blockedCandidateIds: string[];
  generatedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelAgnosticWorkerSchedulerRecommendation = {
  taskFamily: ModelAgnosticWorkerTaskFamily;
  preferredCandidateId: string | null;
  fallbackCandidateIds: string[];
  requiredEvidenceRefs: string[];
  status: "ready" | "needs_review" | "blocked";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
};

export type SelectModelAgnosticWorkerCandidateInput = {
  taskFamily: ModelAgnosticWorkerTaskFamily;
  specializationId?: ModelAgnosticWorkerSpecializationKind;
  requireProductionQualified?: boolean;
  matrix?: ModelAgnosticWorkerQualificationMatrix;
};

export type ModelPolicyPromotionStage =
  | "worker_controller"
  | "worker_context_decision"
  | "worker_patch"
  | "validation_repair"
  | "worker_evidence"
  | "worker_escalation"
  | "router_front_door"
  | "context_scout";

export type NonCodexProviderRoleSlot =
  | "controller"
  | "context_decision"
  | "patch"
  | "validation_repair"
  | "evidence"
  | "escalation";

export type ProviderCapabilitySlotProfile = {
  candidateId: string;
  modelRef: string;
  providerPath: string;
  slot: NonCodexProviderRoleSlot;
  status: ModelAgnosticWorkerQualificationStatus;
  reasoningModesAllowed: string[];
  responseFormatModesAllowed: string[];
  taskFamilies: ModelAgnosticWorkerTaskFamily[];
  requiresEvidenceRefs: boolean;
  evidenceRefs: string[];
  limitations: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ProviderCapabilitySlotGate = {
  artifactKind: "provider_capability_slot_gate";
  status: "passed" | "blocked";
  slotProfiles: ProviderCapabilitySlotProfile[];
  reasonCodes: string[];
  selectedControllerModelRef: string | null;
  selectedPatchModelRef: string | null;
  kimiControllerBlocked: boolean;
  kimiPatchAuthorAllowed: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ModelPolicyStageBenchmarkObservation = {
  stage: ModelPolicyPromotionStage;
  candidateId: string;
  validOutput: boolean;
  latencyMs: number;
  evidenceRef: string;
  failureReasonCode?: string | null;
};

export type ModelPolicyStagePromotionGate = {
  artifactKind: "model_policy_stage_promotion_gate";
  stage: ModelPolicyPromotionStage;
  candidateId: string;
  status: "passed" | "blocked";
  minimumRuns: number;
  validOutputRate: number;
  p95LatencyMs: number;
  maxAllowedP95LatencyMs: number;
  evidenceRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const MODEL_POLICY_STAGE_MIN_RUNS: Record<ModelPolicyPromotionStage, number> = {
  worker_controller: 3,
  worker_context_decision: 3,
  worker_patch: 3,
  validation_repair: 3,
  worker_evidence: 3,
  worker_escalation: 3,
  router_front_door: 8,
  context_scout: 8,
};

const MODEL_POLICY_STAGE_MAX_P95_LATENCY_MS: Record<ModelPolicyPromotionStage, number> = {
  worker_controller: 30_000,
  worker_context_decision: 30_000,
  worker_patch: 90_000,
  validation_repair: 30_000,
  worker_evidence: 30_000,
  worker_escalation: 30_000,
  router_front_door: 15_000,
  context_scout: 45_000,
};

export function evaluateModelPolicyStagePromotionGate(input: {
  stage: ModelPolicyPromotionStage;
  candidateId: string;
  observations: ModelPolicyStageBenchmarkObservation[];
}): ModelPolicyStagePromotionGate {
  const matching = input.observations.filter(
    (observation) =>
      observation.stage === input.stage && observation.candidateId === input.candidateId,
  );
  const minimumRuns = MODEL_POLICY_STAGE_MIN_RUNS[input.stage];
  const sortedLatencies = matching
    .map((observation) => observation.latencyMs)
    .toSorted((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1);
  const p95LatencyMs = sortedLatencies[p95Index] ?? 0;
  const validOutputRate =
    matching.length === 0
      ? 0
      : matching.filter((observation) => observation.validOutput).length / matching.length;
  const maxAllowedP95LatencyMs = MODEL_POLICY_STAGE_MAX_P95_LATENCY_MS[input.stage];
  const reasonCodes: string[] = [];
  if (matching.length < minimumRuns) {
    reasonCodes.push("model_policy_stage_gate_insufficient_runs");
  }
  if (validOutputRate < 1) {
    reasonCodes.push("model_policy_stage_gate_invalid_output_seen");
  }
  if (p95LatencyMs > maxAllowedP95LatencyMs) {
    reasonCodes.push("model_policy_stage_gate_latency_exceeded");
  }
  if (
    (input.stage === "router_front_door" || input.stage === "context_scout") &&
    input.candidateId === "openrouter.qwen.qwen3-coder-next" &&
    matching.length < minimumRuns
  ) {
    reasonCodes.push("qwen_router_context_default_promotion_requires_stage_gate");
  }
  return {
    artifactKind: "model_policy_stage_promotion_gate",
    stage: input.stage,
    candidateId: input.candidateId,
    status: reasonCodes.length === 0 ? "passed" : "blocked",
    minimumRuns,
    validOutputRate,
    p95LatencyMs,
    maxAllowedP95LatencyMs,
    evidenceRefs: unique(
      matching.map((observation) => observation.evidenceRef),
      50,
    ),
    reasonCodes: unique(reasonCodes, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

const PROFILE_KIMI: ModelAgnosticWorkerCandidateProfile = {
  candidateId: "openrouter.moonshotai.kimi-k2.6",
  displayName: "Kimi K2.6 implementation lane",
  modelRef: "moonshotai/kimi-k2.6",
  providerPath: "openrouter",
  specializationIds: ["kimi_implementation", "non_codex_docs_editor", "non_codex_test_writer"],
  responseFormatMode: "tool_loop",
  reasoningMode: "none",
  maxOutputTokens: 10_000,
  timeoutMs: 480_000,
  maxAttempts: 5,
  costClass: "cheap",
  latencyClass: "medium",
  contextCapacity: "large",
  idealTaskFamilies: ["small_source_edit", "test_writing_edit", "docs_spec_edit"],
  maxTargetFiles: 6,
  maxDiffBytes: 1_600,
  toolProfileRefs: ["tool-profile://non-codex-file-edit-worker/kimi-k2.6/v1"],
  knownWeaknesses: [
    "works best with concrete microtask packets and bounded file snapshots",
    "should escalate when target scope becomes broad architectural implementation",
  ],
  escalationCandidateIds: ["codex.policy.strongest-coding"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

const PROFILE_QWEN_CODER_NEXT: ModelAgnosticWorkerCandidateProfile = {
  candidateId: "openrouter.qwen.qwen3-coder-next",
  displayName: "Qwen3 Coder Next worker controller lane",
  modelRef: "qwen/qwen3-coder-next",
  providerPath: "openrouter",
  specializationIds: [
    "kimi_implementation",
    "non_codex_context_scout",
    "non_codex_validation_failure_explainer",
    "non_codex_test_writer",
    "non_codex_docs_editor",
  ],
  responseFormatMode: "tool_loop",
  reasoningMode: "none",
  maxOutputTokens: 4_000,
  timeoutMs: 180_000,
  maxAttempts: 1,
  costClass: "cheap",
  latencyClass: "fast",
  contextCapacity: "large",
  idealTaskFamilies: [
    "repo_context_scout",
    "validation_failure_explanation",
    "small_source_edit",
    "test_writing_edit",
    "docs_spec_edit",
  ],
  maxTargetFiles: 6,
  maxDiffBytes: 1_200,
  toolProfileRefs: ["tool-profile://non-codex-worker-controller/qwen3-coder-next/v1"],
  knownWeaknesses: [
    "should control tool selection, validation repair, context requests, and evidence turns before broad router/context defaults are promoted",
    "patch generation remains assigned to Kimi reasoning-none until Qwen patch gates pass",
  ],
  escalationCandidateIds: ["openrouter.moonshotai.kimi-k2.6", "codex.policy.strongest-coding"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

const PROFILE_DEEPSEEK_FLASH: ModelAgnosticWorkerCandidateProfile = {
  candidateId: "openrouter.deepseek.deepseek-v4-flash",
  displayName: "DeepSeek v4 Flash support lane",
  modelRef: "deepseek/deepseek-v4-flash",
  providerPath: "openrouter",
  specializationIds: [
    "non_codex_context_scout",
    "non_codex_validation_failure_explainer",
    "non_codex_docs_editor",
  ],
  responseFormatMode: "native_json",
  reasoningMode: "omit",
  maxOutputTokens: 6_000,
  timeoutMs: 180_000,
  maxAttempts: 2,
  costClass: "cheap",
  latencyClass: "fast",
  contextCapacity: "medium",
  idealTaskFamilies: ["repo_context_scout", "validation_failure_explanation", "docs_spec_edit"],
  maxTargetFiles: 4,
  maxDiffBytes: 900,
  toolProfileRefs: ["tool-profile://non-codex-support-worker/deepseek-v4-flash/v1"],
  knownWeaknesses: [
    "not production-qualified for source implementation without file-edit evidence",
    "best used for bounded readback, context, validation explanation, and small docs tasks",
  ],
  escalationCandidateIds: ["openrouter.moonshotai.kimi-k2.6", "codex.policy.strongest-coding"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

const PROFILE_DEEPSEEK_PRO: ModelAgnosticWorkerCandidateProfile = {
  candidateId: "openrouter.deepseek.deepseek-v4-pro",
  displayName: "DeepSeek v4 Pro candidate lane",
  modelRef: "deepseek/deepseek-v4-pro",
  providerPath: "openrouter",
  specializationIds: [
    "non_codex_context_scout",
    "non_codex_validation_failure_explainer",
    "non_codex_test_writer",
  ],
  responseFormatMode: "native_json",
  reasoningMode: "low",
  maxOutputTokens: 8_000,
  timeoutMs: 240_000,
  maxAttempts: 2,
  costClass: "standard",
  latencyClass: "medium",
  contextCapacity: "large",
  idealTaskFamilies: ["repo_context_scout", "validation_failure_explanation", "test_writing_edit"],
  maxTargetFiles: 4,
  maxDiffBytes: 1_000,
  toolProfileRefs: ["tool-profile://non-codex-support-worker/deepseek-v4-pro/v1"],
  knownWeaknesses: [
    "requires current provider availability proof before production selection",
    "previous evidence was role-specific and should not be generalized to broad implementation",
  ],
  escalationCandidateIds: ["openrouter.moonshotai.kimi-k2.6", "codex.policy.strongest-coding"],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

const PROFILE_CODEX: ModelAgnosticWorkerCandidateProfile = {
  candidateId: "codex.policy.strongest-coding",
  displayName: "Codex strongest coding escalation lane",
  modelRef: "policy.codex.strongest-coding",
  providerPath: "codex_app_server",
  specializationIds: ["kimi_implementation"],
  responseFormatMode: "policy_owned",
  reasoningMode: "policy_owned",
  maxOutputTokens: 32_000,
  timeoutMs: 3_600_000,
  maxAttempts: 3,
  costClass: "premium",
  latencyClass: "slow",
  contextCapacity: "very_large",
  idealTaskFamilies: [
    "small_source_edit",
    "test_writing_edit",
    "docs_spec_edit",
    "validation_failure_explanation",
    "frontend_scoped_edit",
  ],
  maxTargetFiles: 30,
  maxDiffBytes: 5_000,
  toolProfileRefs: ["tool-profile://codex-parity-runtime-adapter/strongest-coding/v1"],
  knownWeaknesses: ["premium fallback should require cost/quality justification"],
  escalationCandidateIds: [],
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
};

export const MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES: ModelAgnosticWorkerCandidateProfile[] = [
  PROFILE_QWEN_CODER_NEXT,
  PROFILE_KIMI,
  PROFILE_DEEPSEEK_FLASH,
  PROFILE_DEEPSEEK_PRO,
  PROFILE_CODEX,
];

const CANONICAL_SLOT_PROFILES: ProviderCapabilitySlotProfile[] = [
  ...(
    ["controller", "context_decision", "validation_repair", "evidence", "escalation"] as const
  ).map(
    (slot): ProviderCapabilitySlotProfile => ({
      candidateId: "openrouter.qwen.qwen3-coder-next",
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      slot,
      status: "production_qualified",
      reasoningModesAllowed: ["none"],
      responseFormatModesAllowed: ["prompt_only", "tool_loop"],
      taskFamilies: [
        "repo_context_scout",
        "small_source_edit",
        "test_writing_edit",
        "docs_spec_edit",
        "validation_failure_explanation",
      ],
      requiresEvidenceRefs: false,
      evidenceRefs: ["profile://openrouter.qwen.qwen3-coder-next/non-codex-worker-control"],
      limitations: [
        "router and broad context-scout default promotion still require separate stage gates",
      ],
      reasonCodes: [`provider_slot_profile_qwen_${slot}_qualified`],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  ),
  {
    candidateId: "openrouter.qwen.qwen3-coder-next",
    modelRef: "qwen/qwen3-coder-next",
    providerPath: "openrouter",
    slot: "patch",
    status: "candidate",
    reasoningModesAllowed: ["none"],
    responseFormatModesAllowed: ["prompt_only", "tool_loop"],
    taskFamilies: ["small_source_edit", "test_writing_edit", "docs_spec_edit"],
    requiresEvidenceRefs: true,
    evidenceRefs: [],
    limitations: ["patch-author slot remains assigned to Kimi until Qwen patch gates pass"],
    reasonCodes: ["provider_slot_profile_qwen_patch_candidate_not_production_default"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  {
    candidateId: "openrouter.moonshotai.kimi-k2.6",
    modelRef: "moonshotai/kimi-k2.6",
    providerPath: "openrouter",
    slot: "patch",
    status: "production_qualified",
    reasoningModesAllowed: ["none"],
    responseFormatModesAllowed: ["prompt_only", "tool_loop"],
    taskFamilies: ["small_source_edit", "test_writing_edit", "docs_spec_edit"],
    requiresEvidenceRefs: false,
    evidenceRefs: ["profile://openrouter.moonshotai.kimi-k2.6/patch-author-reasoning-none"],
    limitations: [
      "qualified for bounded patch-author turns only after context snapshots and exact objectives are present",
    ],
    reasonCodes: ["provider_slot_profile_kimi_patch_author_qualified"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
  ...(
    ["controller", "context_decision", "validation_repair", "evidence", "escalation"] as const
  ).map(
    (slot): ProviderCapabilitySlotProfile => ({
      candidateId: "openrouter.moonshotai.kimi-k2.6",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      slot,
      status: "blocked",
      reasoningModesAllowed: [],
      responseFormatModesAllowed: [],
      taskFamilies: [],
      requiresEvidenceRefs: true,
      evidenceRefs: [],
      limitations: [
        "Kimi is retired as a critical-path non-Codex worker controller until a dedicated controller qualification suite passes",
      ],
      reasonCodes: [`provider_slot_profile_kimi_${slot}_controller_retired_until_qualified`],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  ),
  {
    candidateId: "codex.policy.strongest-coding",
    modelRef: "policy.codex.strongest-coding",
    providerPath: "codex_app_server",
    slot: "escalation",
    status: "production_qualified",
    reasoningModesAllowed: ["policy_owned"],
    responseFormatModesAllowed: ["policy_owned"],
    taskFamilies: [
      "small_source_edit",
      "test_writing_edit",
      "docs_spec_edit",
      "validation_failure_explanation",
      "frontend_scoped_edit",
    ],
    requiresEvidenceRefs: false,
    evidenceRefs: ["profile://codex.policy.strongest-coding/escalation"],
    limitations: ["premium escalation requires cheaper-worker unsuitability evidence"],
    reasonCodes: ["provider_slot_profile_codex_escalation_qualified"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  },
];

function unique(values: string[], max = 24): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function candidateIdForModelRef(modelRef: string): string {
  const normalized = modelRef.trim().toLowerCase();
  if (normalized.includes("kimi")) {
    return "openrouter.moonshotai.kimi-k2.6";
  }
  if (normalized.includes("qwen3-coder-next") || normalized.includes("qwen/qwen")) {
    return "openrouter.qwen.qwen3-coder-next";
  }
  if (normalized.includes("codex") || normalized.includes("gpt-5.5")) {
    return "codex.policy.strongest-coding";
  }
  return normalized;
}

export function providerCapabilitySlotProfiles(): ProviderCapabilitySlotProfile[] {
  return CANONICAL_SLOT_PROFILES.map((profile) => ({
    ...profile,
    evidenceRefs: [...profile.evidenceRefs],
    limitations: [...profile.limitations],
    reasonCodes: [...profile.reasonCodes],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  }));
}

export function findProviderCapabilitySlotProfile(input: {
  modelRef: string;
  providerPath: string;
  slot: NonCodexProviderRoleSlot;
  profiles?: ProviderCapabilitySlotProfile[];
}): ProviderCapabilitySlotProfile | null {
  const candidateId = candidateIdForModelRef(input.modelRef);
  const providerPath = input.providerPath.trim().toLowerCase();
  return (
    (input.profiles ?? CANONICAL_SLOT_PROFILES).find(
      (profile) =>
        profile.candidateId === candidateId &&
        profile.slot === input.slot &&
        (profile.providerPath === providerPath || profile.providerPath === "policy_owned"),
    ) ?? null
  );
}

export function evaluateProviderCapabilitySlotGate(input: {
  modelPolicy: Record<
    NonCodexProviderRoleSlot,
    {
      modelRef: string;
      providerPath: string;
      reasoningMode: string;
      responseFormatMode: string;
    }
  >;
  requiredSlots?: NonCodexProviderRoleSlot[];
  profiles?: ProviderCapabilitySlotProfile[];
}): ProviderCapabilitySlotGate {
  const requiredSlots = input.requiredSlots ?? [
    "controller",
    "context_decision",
    "patch",
    "validation_repair",
    "evidence",
    "escalation",
  ];
  const reasonCodes: string[] = [];
  const slotProfiles: ProviderCapabilitySlotProfile[] = [];
  let kimiControllerBlocked = false;
  let kimiPatchAuthorAllowed = false;
  for (const slot of requiredSlots) {
    const policy = input.modelPolicy[slot];
    if (!policy) {
      reasonCodes.push(`provider_slot_policy_missing:${slot}`);
      continue;
    }
    const profile = findProviderCapabilitySlotProfile({
      modelRef: policy.modelRef,
      providerPath: policy.providerPath,
      slot,
      profiles: input.profiles,
    });
    if (!profile) {
      reasonCodes.push(`provider_slot_profile_missing:${slot}:${policy.modelRef}`);
      continue;
    }
    slotProfiles.push(profile);
    reasonCodes.push(...profile.reasonCodes);
    if (profile.status !== "production_qualified") {
      reasonCodes.push(
        `provider_slot_profile_not_production_qualified:${slot}:${profile.candidateId}`,
      );
    }
    if (!profile.reasoningModesAllowed.includes(policy.reasoningMode)) {
      reasonCodes.push(`provider_slot_reasoning_mode_not_allowed:${slot}:${policy.reasoningMode}`);
    }
    if (!profile.responseFormatModesAllowed.includes(policy.responseFormatMode)) {
      reasonCodes.push(
        `provider_slot_response_format_not_allowed:${slot}:${policy.responseFormatMode}`,
      );
    }
    if (profile.candidateId === "openrouter.moonshotai.kimi-k2.6" && slot !== "patch") {
      kimiControllerBlocked = true;
      reasonCodes.push(`kimi_controller_role_blocked:${slot}`);
    }
    if (
      profile.candidateId === "openrouter.moonshotai.kimi-k2.6" &&
      slot === "patch" &&
      profile.status === "production_qualified" &&
      policy.reasoningMode === "none"
    ) {
      kimiPatchAuthorAllowed = true;
    }
  }
  return {
    artifactKind: "provider_capability_slot_gate",
    status: reasonCodes.some((code) =>
      /missing|not_production_qualified|not_allowed|blocked/iu.test(code),
    )
      ? "blocked"
      : "passed",
    slotProfiles,
    reasonCodes: unique(reasonCodes, 80),
    selectedControllerModelRef: input.modelPolicy.controller?.modelRef ?? null,
    selectedPatchModelRef: input.modelPolicy.patch?.modelRef ?? null,
    kimiControllerBlocked,
    kimiPatchAuthorAllowed,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function recordStatus(
  record: ModelAgnosticWorkerQualificationRecord,
): ModelAgnosticWorkerQualificationStatus {
  if (record.status === "blocked") {
    return "blocked";
  }
  if (record.taskFamilies.some((task) => task.status === "production_qualified")) {
    return "production_qualified";
  }
  if (record.taskFamilies.some((task) => task.status === "candidate")) {
    return "candidate";
  }
  return record.status;
}

function profileSortScore(profile: ModelAgnosticWorkerCandidateProfile): number {
  const costScore = profile.costClass === "cheap" ? 0 : profile.costClass === "standard" ? 10 : 100;
  const latencyScore =
    profile.latencyClass === "fast" ? 0 : profile.latencyClass === "medium" ? 2 : 8;
  return costScore + latencyScore;
}

export function createModelAgnosticWorkerQualificationRecord(input: {
  candidateId: string;
  modelRef: string;
  providerPath: string;
  taskFamilies: ModelAgnosticWorkerTaskFamilyQualification[];
  generatedAt?: string;
}): ModelAgnosticWorkerQualificationRecord {
  const record: ModelAgnosticWorkerQualificationRecord = {
    candidateId: input.candidateId,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    status: "needs_review",
    taskFamilies: input.taskFamilies.map((task) => ({
      ...task,
      evidenceRefs: unique(task.evidenceRefs),
      modelRunRefs: unique(task.modelRunRefs),
      changedFileRefs: unique(task.changedFileRefs),
      validationRefs: unique(task.validationRefs),
      limitations: unique(task.limitations, 12),
      reasonCodes: unique(task.reasonCodes, 20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    })),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  return { ...record, status: recordStatus(record) };
}

export function buildModelAgnosticWorkerQualificationMatrix(input?: {
  records?: ModelAgnosticWorkerQualificationRecord[];
  candidateProfiles?: ModelAgnosticWorkerCandidateProfile[];
  generatedAt?: string;
}): ModelAgnosticWorkerQualificationMatrix {
  const candidateProfiles = input?.candidateProfiles ?? MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES;
  const records = input?.records ?? [];
  const schedulerRecommendations = buildModelAgnosticWorkerSchedulerRecommendations({
    candidateProfiles,
    records,
  });
  const productionSelectableCandidateIds = records
    .filter((record) => record.status === "production_qualified")
    .map((record) => record.candidateId);
  return {
    artifactKind: "model_agnostic_worker_qualification_matrix",
    schemaVersion: "execution-platform.model-agnostic-worker-qualification.v1",
    candidateProfiles,
    records,
    schedulerRecommendations,
    productionSelectableCandidateIds: unique(productionSelectableCandidateIds, 50),
    needsReviewCandidateIds: unique(
      records
        .filter((record) => record.status === "needs_review" || record.status === "candidate")
        .map((record) => record.candidateId),
      50,
    ),
    blockedCandidateIds: unique(
      records.filter((record) => record.status === "blocked").map((record) => record.candidateId),
      50,
    ),
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function buildModelAgnosticWorkerSchedulerRecommendations(input: {
  candidateProfiles?: ModelAgnosticWorkerCandidateProfile[];
  records: ModelAgnosticWorkerQualificationRecord[];
}): ModelAgnosticWorkerSchedulerRecommendation[] {
  const candidateProfiles = input.candidateProfiles ?? MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES;
  const recordsByCandidate = new Map(input.records.map((record) => [record.candidateId, record]));
  const taskFamilies: ModelAgnosticWorkerTaskFamily[] = [
    "repo_context_scout",
    "small_source_edit",
    "test_writing_edit",
    "docs_spec_edit",
    "validation_failure_explanation",
    "frontend_scoped_edit",
  ];
  return taskFamilies.map((taskFamily) => {
    const supportedProfiles = candidateProfiles
      .filter((profile) => profile.idealTaskFamilies.includes(taskFamily))
      .toSorted((left, right) => profileSortScore(left) - profileSortScore(right));
    const qualified = supportedProfiles.filter((profile) => {
      const record = recordsByCandidate.get(profile.candidateId);
      const task = record?.taskFamilies.find((item) => item.taskFamily === taskFamily);
      return task?.status === "production_qualified";
    });
    const preferred = qualified[0] ?? null;
    const fallbackCandidateIds = qualified.slice(1).map((profile) => profile.candidateId);
    const requiredEvidenceRefs = preferred
      ? unique(
          recordsByCandidate
            .get(preferred.candidateId)
            ?.taskFamilies.find((task) => task.taskFamily === taskFamily)?.evidenceRefs ?? [],
          12,
        )
      : [];
    return {
      taskFamily,
      preferredCandidateId: preferred?.candidateId ?? null,
      fallbackCandidateIds,
      requiredEvidenceRefs,
      status: preferred ? "ready" : supportedProfiles.length > 0 ? "needs_review" : "blocked",
      reasonCodes: preferred
        ? ["qualified_candidate_selected", `candidate:${preferred.candidateId}`]
        : ["no_production_qualified_candidate_for_task_family"],
      rawPromptStored: false,
      rawResponseStored: false,
    };
  });
}

export function selectModelAgnosticWorkerCandidate(
  input: SelectModelAgnosticWorkerCandidateInput,
): {
  profile: ModelAgnosticWorkerCandidateProfile | null;
  recommendation: ModelAgnosticWorkerSchedulerRecommendation;
  reasonCodes: string[];
} {
  const matrix = input.matrix ?? buildModelAgnosticWorkerQualificationMatrix();
  const recommendation = matrix.schedulerRecommendations.find(
    (item) => item.taskFamily === input.taskFamily,
  ) ?? {
    taskFamily: input.taskFamily,
    preferredCandidateId: null,
    fallbackCandidateIds: [],
    requiredEvidenceRefs: [],
    status: "blocked" as const,
    reasonCodes: ["task_family_not_in_qualification_matrix"],
    rawPromptStored: false,
    rawResponseStored: false,
  };
  const profilesByCandidate = new Map(
    matrix.candidateProfiles.map((profile) => [profile.candidateId, profile]),
  );
  const profile = recommendation.preferredCandidateId
    ? (profilesByCandidate.get(recommendation.preferredCandidateId) ?? null)
    : null;
  if (!profile) {
    return {
      profile: null,
      recommendation,
      reasonCodes: unique([
        "model_agnostic_worker_candidate_not_selectable",
        ...recommendation.reasonCodes,
      ]),
    };
  }
  if (input.specializationId && !profile.specializationIds.includes(input.specializationId)) {
    return {
      profile: null,
      recommendation,
      reasonCodes: [
        "qualified_candidate_does_not_support_requested_specialization",
        `candidate:${profile.candidateId}`,
        `specialization:${input.specializationId}`,
      ],
    };
  }
  if (input.requireProductionQualified !== false && recommendation.status !== "ready") {
    return {
      profile: null,
      recommendation,
      reasonCodes: ["model_agnostic_worker_candidate_requires_production_qualification"],
    };
  }
  return {
    profile,
    recommendation,
    reasonCodes: unique([
      "model_agnostic_worker_candidate_selected",
      ...recommendation.reasonCodes,
    ]),
  };
}

export function buildQualificationTaskFamilyResult(input: {
  taskFamily: ModelAgnosticWorkerTaskFamily;
  status: ModelAgnosticWorkerQualificationStatus;
  evidenceRefs?: string[];
  modelRunRefs?: string[];
  qualityReviewRef?: string | null;
  changedFileRefs?: string[];
  validationRefs?: string[];
  limitations?: string[];
  reasonCodes?: string[];
  liveModelCallMade?: boolean;
  liveSourceEditMade?: boolean;
}): ModelAgnosticWorkerTaskFamilyQualification {
  return {
    taskFamily: input.taskFamily,
    status: input.status,
    evidenceRefs: unique(input.evidenceRefs ?? []),
    modelRunRefs: unique(input.modelRunRefs ?? []),
    qualityReviewRef: input.qualityReviewRef ?? null,
    changedFileRefs: unique(input.changedFileRefs ?? []),
    validationRefs: unique(input.validationRefs ?? []),
    limitations: unique(input.limitations ?? [], 12),
    reasonCodes: unique(input.reasonCodes ?? [], 20),
    liveModelCallMade: input.liveModelCallMade ?? false,
    liveSourceEditMade: input.liveSourceEditMade ?? false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
