import type { JsonValue } from "../runtime-job-repository.ts";

export const MODEL_TASK_CLASSIFICATION_VERSION = "execution-platform.model-task-classification.v2";

export const MODEL_TASK_CLASSES = [
  "global_reasoning",
  "local_semantic_extraction",
  "schema_normalization",
  "tool_selection",
  "implementation_patch",
  "validation_classification",
  "closeout_judgment",
] as const;

export type ModelTaskClass = (typeof MODEL_TASK_CLASSES)[number];

export const MODEL_CONTRACT_BOUNDARY_SCHEMA_VERSION =
  "execution-platform.model-contract-boundary-policy.v1";

export const MODEL_CONTRACT_BOUNDARIES = [
  "router_front_door",
  "source_prompt_excerpt_interpretation",
  "scheduler_global_reasoning",
  "scheduler_capability_selection",
  "scheduler_field_repair",
  "implementation_patch_author",
  "worker_local_tool_selection",
  "validation_failure_classification",
  "validation_repair_plan",
  "evidence_summary",
  "closeout_acceptance",
] as const;

export type ModelContractBoundaryId = (typeof MODEL_CONTRACT_BOUNDARIES)[number];

export type ModelTaskReasoningMode =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | null;

export type ModelTaskProviderPath = "codex_app_server" | "openrouter";

export type ModelTaskParserMode = "runtime_json_object" | "strict_json_schema" | "field_patch_json";

export type ModelTaskResponseFormatMode = "json_object" | "json_schema" | "prompt_only_json";

export type ModelTaskRetryPolicy = {
  maxAttempts: number;
  retryReasonCodes: string[];
  noContentRetryPolicy: "retry_same_bounded_task" | "escalate" | "not_applicable";
  schemaRepairPolicy: "field_specific_only" | "bounded_structural_repair" | "not_applicable";
};

export type ModelTaskEscalationPolicy = {
  escalationModelRefs: string[];
  requiresStructuredReason: boolean;
  terminalStatusWhenExhausted: "needs_review" | "failed";
};

export type ModelTaskTelemetryPolicy = {
  tokenUsageRequired: boolean;
  costUsageRequired: boolean;
  allowEstimatedUsage: boolean;
  progressSpanRequired: boolean;
  workQueueReadbackRequired: boolean;
};

export type ModelTaskProofCleanlinessPolicy = {
  hiddenRescueForbidden: boolean;
  escalationCountsAsConcern: boolean;
  rescueRequiresOwnerAcceptance: boolean;
  cleanProofRequiresPrimaryPolicy: boolean;
};

export type ModelContractBoundaryPolicyBinding = {
  artifactKind: "model_contract_boundary_policy_binding";
  schemaVersion: typeof MODEL_CONTRACT_BOUNDARY_SCHEMA_VERSION;
  boundaryId: ModelContractBoundaryId;
  boundaryRef: string;
  taskClass: ModelTaskClass;
  callSite: string;
  modelPolicyRef: string;
  providerPath: ModelTaskProviderPath;
  preferredModelRef: string | null;
  allowedFallbackModelRefs: string[];
  reasoningMode: ModelTaskReasoningMode;
  parserMode: ModelTaskParserMode;
  responseFormatMode: ModelTaskResponseFormatMode;
  timeoutMs: number;
  softTimeoutMs: number | null;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  retryPolicy: ModelTaskRetryPolicy;
  escalationPolicy: ModelTaskEscalationPolicy;
  telemetryPolicy: ModelTaskTelemetryPolicy;
  proofCleanlinessPolicy: ModelTaskProofCleanlinessPolicy;
  allowedToolFamily: string;
  allowedOutputContractId: string;
  allowedOutputContractVersion: string;
  providerCallAllowed: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ModelPolicyBindingMismatch = {
  fieldPath: string;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
  reasonCode: string;
};

export type ModelPolicyBindingPreflight = {
  artifactKind: "model_policy_binding_preflight";
  schemaVersion: typeof MODEL_CONTRACT_BOUNDARY_SCHEMA_VERSION;
  accepted: boolean;
  boundaryId: ModelContractBoundaryId | null;
  boundaryRef: string | null;
  modelPolicyBindingRef: string | null;
  taskClass: ModelTaskClass | null;
  modelPolicyRef: string | null;
  providerCallAllowed: boolean;
  mismatches: ModelPolicyBindingMismatch[];
  proofCleanliness: {
    state: "clean" | "concern" | "blocked";
    hiddenRescueDetected: boolean;
    rescueCount: number;
    escalationCount: number;
    ownerAcceptedProviderIncident: boolean;
    reasonCodes: string[];
  };
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ModelTaskPolicy = {
  artifactKind: "model_task_policy";
  classificationVersion: typeof MODEL_TASK_CLASSIFICATION_VERSION;
  taskClass: ModelTaskClass;
  policyRef: string;
  modelPolicyRef: string;
  providerPath: ModelTaskProviderPath;
  preferredModelRef: string | null;
  allowedFallbackModelRefs: string[];
  reasoningMode: ModelTaskReasoningMode;
  timeoutMs: number;
  softTimeoutMs: number | null;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  parserMode: ModelTaskParserMode;
  responseFormatMode: ModelTaskResponseFormatMode;
  retryPolicy: ModelTaskRetryPolicy;
  escalationPolicy: ModelTaskEscalationPolicy;
  telemetryPolicy: ModelTaskTelemetryPolicy;
  supportedScopes: string[];
  productionReadinessStatus: "production_primary" | "needs_review" | "blocked";
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ModelTaskClassification = {
  artifactKind: "model_task_classification";
  classificationVersion: typeof MODEL_TASK_CLASSIFICATION_VERSION;
  taskClass: ModelTaskClass;
  callSite: string;
  contractBoundaryId: ModelContractBoundaryId | null;
  modelPolicyBindingRef: string | null;
  allowedToolFamily: string | null;
  allowedOutputContractId: string | null;
  allowedOutputContractVersion: string | null;
  workflowId: string | null;
  graphId: string | null;
  nodeId: string | null;
  runtimeJobId: string | null;
  modelPolicyRef: string;
  selectedModelRef: string | null;
  providerPath: ModelTaskProviderPath;
  reasoningMode: ModelTaskReasoningMode;
  timeoutMs: number;
  softTimeoutMs: number | null;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  parserMode: ModelTaskParserMode;
  responseFormatMode: ModelTaskResponseFormatMode;
  retryPolicy: ModelTaskRetryPolicy;
  escalationPolicy: ModelTaskEscalationPolicy;
  telemetryPolicy: ModelTaskTelemetryPolicy;
  exception: ModelTaskPolicyException | null;
  reasonCodes: string[];
  providerCallAllowed: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ModelTaskPolicyException = {
  artifactKind: "model_task_policy_exception";
  originalTaskClass: ModelTaskClass;
  defaultPolicyRef: string;
  selectedOverridePolicyRef: string;
  reasonCode: string;
  semanticRationale: string | null;
  runtimeCaller: string;
  workflowId: string | null;
  nodeId: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

const retryableOpenRouter = [
  "openrouter_no_content",
  "openrouter_empty_response",
  "openrouter_http_429",
  "openrouter_http_503",
  "openrouter_network_timeout",
];

function retryPolicy(
  maxAttempts: number,
  retryReasonCodes: string[],
  schemaRepairPolicy: ModelTaskRetryPolicy["schemaRepairPolicy"],
): ModelTaskRetryPolicy {
  return {
    maxAttempts,
    retryReasonCodes,
    noContentRetryPolicy: maxAttempts > 1 ? "retry_same_bounded_task" : "escalate",
    schemaRepairPolicy,
  };
}

function telemetryPolicy(input: Partial<ModelTaskTelemetryPolicy> = {}): ModelTaskTelemetryPolicy {
  return {
    tokenUsageRequired: input.tokenUsageRequired ?? true,
    costUsageRequired: input.costUsageRequired ?? true,
    allowEstimatedUsage: input.allowEstimatedUsage ?? true,
    progressSpanRequired: input.progressSpanRequired ?? true,
    workQueueReadbackRequired: input.workQueueReadbackRequired ?? true,
  };
}

export const MODEL_TASK_POLICY_REGISTRY: Record<ModelTaskClass, ModelTaskPolicy> = {
  global_reasoning: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "global_reasoning",
    policyRef: "model-task-policy://global-reasoning/gpt-5.5",
    modelPolicyRef: "model-task-policy://global-reasoning/gpt-5.5",
    providerPath: "codex_app_server",
    preferredModelRef: "openai-codex/gpt-5.5",
    allowedFallbackModelRefs: [],
    reasoningMode: "xhigh",
    timeoutMs: 900_000,
    softTimeoutMs: null,
    maxInputBytes: 240_000,
    maxOutputTokens: 12_000,
    parserMode: "runtime_json_object",
    responseFormatMode: "json_object",
    retryPolicy: retryPolicy(1, ["codex_app_server_timeout"], "bounded_structural_repair"),
    escalationPolicy: {
      escalationModelRefs: [],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: [
      "router.front_door",
      "mission_evidence_evaluation",
      "scheduler.global_reasoning",
      "closeout.maximality_review",
    ],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  local_semantic_extraction: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "local_semantic_extraction",
    policyRef: "model-task-policy://local-semantic-extraction/qwen3-coder-next",
    modelPolicyRef: "model-task-policy://local-semantic-extraction/qwen3-coder-next",
    providerPath: "openrouter",
    preferredModelRef: "qwen/qwen3-coder-next",
    allowedFallbackModelRefs: ["openai-codex/gpt-5.5"],
    reasoningMode: "none",
    timeoutMs: 90_000,
    softTimeoutMs: 60_000,
    maxInputBytes: 32_000,
    maxOutputTokens: 8_000,
    parserMode: "runtime_json_object",
    responseFormatMode: "prompt_only_json",
    retryPolicy: retryPolicy(2, retryableOpenRouter, "field_specific_only"),
    escalationPolicy: {
      escalationModelRefs: ["openai-codex/gpt-5.5"],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: [
      "context.scout.summary",
      "validation.summary",
      "evidence.summary",
      "source_prompt.excerpt_interpretation",
    ],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  schema_normalization: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "schema_normalization",
    policyRef: "model-task-policy://schema-normalization/qwen3-coder-next",
    modelPolicyRef: "model-task-policy://schema-normalization/qwen3-coder-next",
    providerPath: "openrouter",
    preferredModelRef: "qwen/qwen3-coder-next",
    allowedFallbackModelRefs: [],
    reasoningMode: "none",
    timeoutMs: 45_000,
    softTimeoutMs: 30_000,
    maxInputBytes: 24_000,
    maxOutputTokens: 2_400,
    parserMode: "field_patch_json",
    responseFormatMode: "prompt_only_json",
    retryPolicy: retryPolicy(1, retryableOpenRouter, "field_specific_only"),
    escalationPolicy: {
      escalationModelRefs: [],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: ["router.enum_repair", "scheduler.field_repair", "validation.field_repair"],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  tool_selection: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "tool_selection",
    policyRef: "model-task-policy://tool-selection/qwen3-coder-next",
    modelPolicyRef: "model-task-policy://tool-selection/qwen3-coder-next",
    providerPath: "openrouter",
    preferredModelRef: "qwen/qwen3-coder-next",
    allowedFallbackModelRefs: ["openai-codex/gpt-5.5"],
    reasoningMode: "none",
    timeoutMs: 60_000,
    softTimeoutMs: 45_000,
    maxInputBytes: 32_000,
    maxOutputTokens: 3_000,
    parserMode: "strict_json_schema",
    responseFormatMode: "prompt_only_json",
    retryPolicy: retryPolicy(2, retryableOpenRouter, "bounded_structural_repair"),
    escalationPolicy: {
      escalationModelRefs: ["openai-codex/gpt-5.5"],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: ["scheduler.capability_selection", "worker.tool_selection"],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  implementation_patch: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "implementation_patch",
    policyRef: "model-task-policy://implementation-patch/kimi-k2.6",
    modelPolicyRef: "model-task-policy://implementation-patch/kimi-k2.6",
    providerPath: "openrouter",
    preferredModelRef: "moonshotai/kimi-k2.6",
    allowedFallbackModelRefs: ["qwen/qwen3-coder-next", "openai-codex/gpt-5.5"],
    reasoningMode: "none",
    timeoutMs: 240_000,
    softTimeoutMs: 180_000,
    maxInputBytes: 80_000,
    maxOutputTokens: 8_000,
    parserMode: "runtime_json_object",
    responseFormatMode: "prompt_only_json",
    retryPolicy: retryPolicy(2, retryableOpenRouter, "bounded_structural_repair"),
    escalationPolicy: {
      escalationModelRefs: ["openai-codex/gpt-5.5"],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: ["worker.implementation_patch", "non_codex.patch_author"],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  validation_classification: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "validation_classification",
    policyRef: "model-task-policy://validation-classification/qwen3-coder-next",
    modelPolicyRef: "model-task-policy://validation-classification/qwen3-coder-next",
    providerPath: "openrouter",
    preferredModelRef: "qwen/qwen3-coder-next",
    allowedFallbackModelRefs: ["openai-codex/gpt-5.5"],
    reasoningMode: "none",
    timeoutMs: 90_000,
    softTimeoutMs: 60_000,
    maxInputBytes: 48_000,
    maxOutputTokens: 4_000,
    parserMode: "runtime_json_object",
    responseFormatMode: "prompt_only_json",
    retryPolicy: retryPolicy(2, retryableOpenRouter, "field_specific_only"),
    escalationPolicy: {
      escalationModelRefs: ["openai-codex/gpt-5.5"],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: ["validation.failure_classification", "validation.repair_plan"],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
  closeout_judgment: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "closeout_judgment",
    policyRef: "model-task-policy://closeout-judgment/gpt-5.5",
    modelPolicyRef: "model-task-policy://closeout-judgment/gpt-5.5",
    providerPath: "codex_app_server",
    preferredModelRef: "openai-codex/gpt-5.5",
    allowedFallbackModelRefs: [],
    reasoningMode: "xhigh",
    timeoutMs: 900_000,
    softTimeoutMs: null,
    maxInputBytes: 160_000,
    maxOutputTokens: 8_000,
    parserMode: "runtime_json_object",
    responseFormatMode: "json_object",
    retryPolicy: retryPolicy(1, ["codex_app_server_timeout"], "bounded_structural_repair"),
    escalationPolicy: {
      escalationModelRefs: [],
      requiresStructuredReason: true,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy(),
    supportedScopes: ["closeout.finalization", "closeout.maximality_review"],
    productionReadinessStatus: "production_primary",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  },
};

export function isModelTaskClass(value: unknown): value is ModelTaskClass {
  return typeof value === "string" && (MODEL_TASK_CLASSES as readonly string[]).includes(value);
}

export function modelTaskPolicyFor(taskClass: ModelTaskClass): ModelTaskPolicy {
  return MODEL_TASK_POLICY_REGISTRY[taskClass];
}

type ModelTaskCallSitePolicyOverride = {
  policyRefSuffix: string;
  timeoutMs?: number;
  softTimeoutMs?: number | null;
  maxInputBytes?: number | null;
  maxOutputTokens?: number | null;
  retryPolicy?: ModelTaskRetryPolicy;
  escalationPolicy?: ModelTaskEscalationPolicy;
  reasonCode: string;
};

const MODEL_TASK_CALL_SITE_POLICY_OVERRIDES: Record<
  string,
  Partial<Record<ModelTaskClass, ModelTaskCallSitePolicyOverride>>
> = {};

function callSitePolicyOverride(
  taskClass: ModelTaskClass,
  callSite: string,
): ModelTaskCallSitePolicyOverride | null {
  return MODEL_TASK_CALL_SITE_POLICY_OVERRIDES[callSite]?.[taskClass] ?? null;
}

type ModelContractBoundaryDefinition = {
  boundaryId: ModelContractBoundaryId;
  taskClass: ModelTaskClass;
  callSite: string;
  allowedToolFamily: string;
  allowedOutputContractId: string;
  allowedOutputContractVersion: string;
  proofCleanlinessPolicy?: Partial<ModelTaskProofCleanlinessPolicy>;
};

const DEFAULT_PROOF_CLEANLINESS_POLICY: ModelTaskProofCleanlinessPolicy = {
  hiddenRescueForbidden: true,
  escalationCountsAsConcern: true,
  rescueRequiresOwnerAcceptance: true,
  cleanProofRequiresPrimaryPolicy: true,
};

const MODEL_CONTRACT_BOUNDARY_DEFINITIONS: Record<
  ModelContractBoundaryId,
  ModelContractBoundaryDefinition
> = {
  router_front_door: {
    boundaryId: "router_front_door",
    taskClass: "global_reasoning",
    callSite: "router.front_door",
    allowedToolFamily: "router.front_door",
    allowedOutputContractId: "intent_front_door_route_decision",
    allowedOutputContractVersion: "v1",
  },
  source_prompt_excerpt_interpretation: {
    boundaryId: "source_prompt_excerpt_interpretation",
    taskClass: "local_semantic_extraction",
    callSite: "source_prompt.excerpt_interpretation",
    allowedToolFamily: "source_prompt.excerpt_interpretation",
    allowedOutputContractId: "source_prompt_excerpt_interpretation",
    allowedOutputContractVersion: "v1",
  },
  scheduler_global_reasoning: {
    boundaryId: "scheduler_global_reasoning",
    taskClass: "global_reasoning",
    callSite: "scheduler.global_reasoning",
    allowedToolFamily: "scheduler.orchestrator_decision",
    allowedOutputContractId: "runtime_work_graph_orchestrator_plan",
    allowedOutputContractVersion: "v1",
  },
  scheduler_capability_selection: {
    boundaryId: "scheduler_capability_selection",
    taskClass: "tool_selection",
    callSite: "scheduler.capability_selection",
    allowedToolFamily: "scheduler.capability_selection",
    allowedOutputContractId: "scheduler_capability_selection",
    allowedOutputContractVersion: "v1",
  },
  scheduler_field_repair: {
    boundaryId: "scheduler_field_repair",
    taskClass: "schema_normalization",
    callSite: "scheduler.field_repair",
    allowedToolFamily: "scheduler.field_patch",
    allowedOutputContractId: "scheduler_field_patch",
    allowedOutputContractVersion: "v1",
  },
  implementation_patch_author: {
    boundaryId: "implementation_patch_author",
    taskClass: "implementation_patch",
    callSite: "worker.implementation_patch",
    allowedToolFamily: "worker.patch.author",
    allowedOutputContractId: "worker_patch_author_edit",
    allowedOutputContractVersion: "v1",
  },
  worker_local_tool_selection: {
    boundaryId: "worker_local_tool_selection",
    taskClass: "tool_selection",
    callSite: "worker.tool_selection",
    allowedToolFamily: "worker.local_tool_selection",
    allowedOutputContractId: "worker_tool_selection",
    allowedOutputContractVersion: "v1",
  },
  validation_failure_classification: {
    boundaryId: "validation_failure_classification",
    taskClass: "validation_classification",
    callSite: "validation.failure_classification",
    allowedToolFamily: "validation.failure_classification",
    allowedOutputContractId: "validation_failure_classification",
    allowedOutputContractVersion: "v1",
  },
  validation_repair_plan: {
    boundaryId: "validation_repair_plan",
    taskClass: "validation_classification",
    callSite: "validation.repair_plan",
    allowedToolFamily: "validation.repair_plan",
    allowedOutputContractId: "validation_repair_plan",
    allowedOutputContractVersion: "v1",
  },
  evidence_summary: {
    boundaryId: "evidence_summary",
    taskClass: "local_semantic_extraction",
    callSite: "evidence.summary",
    allowedToolFamily: "evidence.summary",
    allowedOutputContractId: "typed_evidence_summary",
    allowedOutputContractVersion: "v1",
  },
  closeout_acceptance: {
    boundaryId: "closeout_acceptance",
    taskClass: "closeout_judgment",
    callSite: "closeout.finalization",
    allowedToolFamily: "closeout.acceptance",
    allowedOutputContractId: "closeout_acceptance_judgment",
    allowedOutputContractVersion: "v1",
  },
};

const CALL_SITE_TO_CONTRACT_BOUNDARY: Record<string, ModelContractBoundaryId> = Object.fromEntries(
  Object.values(MODEL_CONTRACT_BOUNDARY_DEFINITIONS).map((definition) => [
    definition.callSite,
    definition.boundaryId,
  ]),
) as Record<string, ModelContractBoundaryId>;

function boundaryDefinitionForCallSite(
  callSite: string,
  taskClass?: ModelTaskClass,
): ModelContractBoundaryDefinition | null {
  const boundaryId = CALL_SITE_TO_CONTRACT_BOUNDARY[callSite];
  if (!boundaryId) {
    return null;
  }
  const definition = MODEL_CONTRACT_BOUNDARY_DEFINITIONS[boundaryId];
  return !taskClass || definition.taskClass === taskClass ? definition : null;
}

function resolvedPolicySettings(taskClass: ModelTaskClass, callSite: string): ModelTaskPolicy {
  const policy = modelTaskPolicyFor(taskClass);
  const boundsOverride = callSitePolicyOverride(taskClass, callSite);
  return {
    ...policy,
    modelPolicyRef: boundsOverride
      ? `${policy.modelPolicyRef}/${boundsOverride.policyRefSuffix}`
      : policy.modelPolicyRef,
    timeoutMs: boundsOverride?.timeoutMs ?? policy.timeoutMs,
    softTimeoutMs:
      boundsOverride && "softTimeoutMs" in boundsOverride
        ? (boundsOverride.softTimeoutMs ?? null)
        : policy.softTimeoutMs,
    maxInputBytes:
      boundsOverride && "maxInputBytes" in boundsOverride
        ? (boundsOverride.maxInputBytes ?? null)
        : policy.maxInputBytes,
    maxOutputTokens:
      boundsOverride && "maxOutputTokens" in boundsOverride
        ? (boundsOverride.maxOutputTokens ?? null)
        : policy.maxOutputTokens,
    retryPolicy: boundsOverride?.retryPolicy ?? policy.retryPolicy,
    escalationPolicy: boundsOverride?.escalationPolicy ?? policy.escalationPolicy,
  };
}

export function modelContractBoundaryBindingFor(
  boundaryId: ModelContractBoundaryId,
): ModelContractBoundaryPolicyBinding {
  const definition = MODEL_CONTRACT_BOUNDARY_DEFINITIONS[boundaryId];
  const policy = resolvedPolicySettings(definition.taskClass, definition.callSite);
  const proofCleanlinessPolicy = {
    ...DEFAULT_PROOF_CLEANLINESS_POLICY,
    ...definition.proofCleanlinessPolicy,
  };
  return {
    artifactKind: "model_contract_boundary_policy_binding",
    schemaVersion: MODEL_CONTRACT_BOUNDARY_SCHEMA_VERSION,
    boundaryId: definition.boundaryId,
    boundaryRef: `model-contract-boundary://${definition.boundaryId}`,
    taskClass: definition.taskClass,
    callSite: definition.callSite,
    modelPolicyRef: policy.modelPolicyRef,
    providerPath: policy.providerPath,
    preferredModelRef: policy.preferredModelRef,
    allowedFallbackModelRefs: policy.allowedFallbackModelRefs,
    reasoningMode: policy.reasoningMode,
    parserMode: policy.parserMode,
    responseFormatMode: policy.responseFormatMode,
    timeoutMs: policy.timeoutMs,
    softTimeoutMs: policy.softTimeoutMs,
    maxInputBytes: policy.maxInputBytes,
    maxOutputTokens: policy.maxOutputTokens,
    retryPolicy: policy.retryPolicy,
    escalationPolicy: policy.escalationPolicy,
    telemetryPolicy: policy.telemetryPolicy,
    proofCleanlinessPolicy,
    allowedToolFamily: definition.allowedToolFamily,
    allowedOutputContractId: definition.allowedOutputContractId,
    allowedOutputContractVersion: definition.allowedOutputContractVersion,
    providerCallAllowed: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function modelContractBoundaryBindingForCallSite(input: {
  taskClass: ModelTaskClass;
  callSite: string;
}): ModelContractBoundaryPolicyBinding | null {
  const definition = boundaryDefinitionForCallSite(input.callSite, input.taskClass);
  return definition ? modelContractBoundaryBindingFor(definition.boundaryId) : null;
}

export function createModelTaskPolicyException(input: {
  originalTaskClass: ModelTaskClass;
  defaultPolicyRef: string;
  selectedOverridePolicyRef: string;
  reasonCode: string;
  semanticRationale?: string | null;
  runtimeCaller: string;
  workflowId?: string | null;
  nodeId?: string | null;
}): ModelTaskPolicyException {
  return {
    artifactKind: "model_task_policy_exception",
    originalTaskClass: input.originalTaskClass,
    defaultPolicyRef: input.defaultPolicyRef,
    selectedOverridePolicyRef: input.selectedOverridePolicyRef,
    reasonCode: input.reasonCode,
    semanticRationale: input.semanticRationale ?? null,
    runtimeCaller: input.runtimeCaller,
    workflowId: input.workflowId ?? null,
    nodeId: input.nodeId ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function classifyModelTaskCall(input: {
  taskClass: ModelTaskClass;
  callSite: string;
  workflowId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  runtimeJobId?: string | null;
  overridePolicyRef?: string | null;
  overrideModelRef?: string | null;
  overrideReasonCode?: string | null;
  overrideRationale?: string | null;
}): ModelTaskClassification {
  const policy = modelTaskPolicyFor(input.taskClass);
  const boundsOverride = callSitePolicyOverride(input.taskClass, input.callSite);
  const boundaryBinding = modelContractBoundaryBindingForCallSite({
    taskClass: input.taskClass,
    callSite: input.callSite,
  });
  const overrideModelDiffers = Boolean(
    input.overrideModelRef && input.overrideModelRef !== policy.preferredModelRef,
  );
  const hasOverride = Boolean(input.overridePolicyRef || overrideModelDiffers);
  const exception = hasOverride
    ? createModelTaskPolicyException({
        originalTaskClass: input.taskClass,
        defaultPolicyRef: policy.policyRef,
        selectedOverridePolicyRef:
          input.overridePolicyRef ?? `model-task-policy://override/${input.overrideModelRef}`,
        reasonCode: input.overrideReasonCode ?? "model_task_policy_override",
        semanticRationale: input.overrideRationale ?? null,
        runtimeCaller: input.callSite,
        workflowId: input.workflowId ?? null,
        nodeId: input.nodeId ?? null,
      })
    : null;
  return {
    artifactKind: "model_task_classification",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: input.taskClass,
    callSite: input.callSite,
    contractBoundaryId: boundaryBinding?.boundaryId ?? null,
    modelPolicyBindingRef: boundaryBinding?.boundaryRef ?? null,
    allowedToolFamily: boundaryBinding?.allowedToolFamily ?? null,
    allowedOutputContractId: boundaryBinding?.allowedOutputContractId ?? null,
    allowedOutputContractVersion: boundaryBinding?.allowedOutputContractVersion ?? null,
    workflowId: input.workflowId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    runtimeJobId: input.runtimeJobId ?? null,
    modelPolicyRef:
      exception?.selectedOverridePolicyRef ??
      (boundsOverride
        ? `${policy.modelPolicyRef}/${boundsOverride.policyRefSuffix}`
        : policy.modelPolicyRef),
    selectedModelRef: input.overrideModelRef ?? policy.preferredModelRef,
    providerPath: policy.providerPath,
    reasoningMode: policy.reasoningMode,
    timeoutMs: boundsOverride?.timeoutMs ?? policy.timeoutMs,
    softTimeoutMs:
      boundsOverride && "softTimeoutMs" in boundsOverride
        ? (boundsOverride.softTimeoutMs ?? null)
        : policy.softTimeoutMs,
    maxInputBytes:
      boundsOverride && "maxInputBytes" in boundsOverride
        ? (boundsOverride.maxInputBytes ?? null)
        : policy.maxInputBytes,
    maxOutputTokens:
      boundsOverride && "maxOutputTokens" in boundsOverride
        ? (boundsOverride.maxOutputTokens ?? null)
        : policy.maxOutputTokens,
    parserMode: policy.parserMode,
    responseFormatMode: policy.responseFormatMode,
    retryPolicy: boundsOverride?.retryPolicy ?? policy.retryPolicy,
    escalationPolicy: boundsOverride?.escalationPolicy ?? policy.escalationPolicy,
    telemetryPolicy: policy.telemetryPolicy,
    exception,
    reasonCodes: [
      "model_task_classified",
      `model_task_class:${input.taskClass}`,
      ...(boundaryBinding
        ? [`model_contract_boundary:${boundaryBinding.boundaryId}`, "model_policy_binding_attached"]
        : []),
      ...(boundsOverride ? [boundsOverride.reasonCode] : []),
      ...(exception ? ["model_task_policy_exception_recorded"] : []),
    ],
    providerCallAllowed: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function requireModelTaskClassification(
  value: ModelTaskClassification | null | undefined,
): ModelTaskClassification {
  if (!value) {
    throw new Error("model_task_classification_required");
  }
  return value;
}

function primitiveString(value: unknown): string | number | boolean | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return JSON.stringify(value) ?? "";
}

function addMismatch(
  mismatches: ModelPolicyBindingMismatch[],
  input: {
    fieldPath: string;
    expected: string | number | boolean | null;
    actual: string | number | boolean | null | undefined;
    reasonCode: string;
  },
): void {
  const actual = input.actual ?? null;
  if (actual !== input.expected) {
    mismatches.push({
      fieldPath: input.fieldPath,
      expected: input.expected,
      actual,
      reasonCode: input.reasonCode,
    });
  }
}

function addBoundMismatch(
  mismatches: ModelPolicyBindingMismatch[],
  input: {
    fieldPath: string;
    policyBound: number | null;
    requested: number | null | undefined;
    reasonCode: string;
  },
): void {
  if (
    input.policyBound !== null &&
    input.requested !== null &&
    input.requested !== undefined &&
    input.requested > input.policyBound
  ) {
    mismatches.push({
      fieldPath: input.fieldPath,
      expected: input.policyBound,
      actual: input.requested,
      reasonCode: input.reasonCode,
    });
  }
}

function proofCleanliness(input: {
  binding: ModelContractBoundaryPolicyBinding | null;
  proofMode?: boolean;
  hiddenRescueDetected?: boolean;
  rescueCount?: number | null;
  escalationCount?: number | null;
  ownerAcceptedProviderIncident?: boolean;
}): ModelPolicyBindingPreflight["proofCleanliness"] {
  const policy = input.binding?.proofCleanlinessPolicy ?? DEFAULT_PROOF_CLEANLINESS_POLICY;
  const hiddenRescueDetected = input.hiddenRescueDetected ?? false;
  const rescueCount = Math.max(0, Math.trunc(input.rescueCount ?? 0));
  const escalationCount = Math.max(0, Math.trunc(input.escalationCount ?? 0));
  const ownerAcceptedProviderIncident = input.ownerAcceptedProviderIncident ?? false;
  const reasonCodes = ["model_policy_proof_cleanliness_evaluated"];
  let state: "clean" | "concern" | "blocked" = "clean";
  if (hiddenRescueDetected && policy.hiddenRescueForbidden) {
    reasonCodes.push("model_policy_hidden_rescue_forbidden");
    state = "blocked";
  }
  if (rescueCount > 0) {
    reasonCodes.push("model_policy_rescue_count_nonzero");
    if (policy.rescueRequiresOwnerAcceptance && !ownerAcceptedProviderIncident && input.proofMode) {
      reasonCodes.push("model_policy_rescue_requires_owner_acceptance");
      state = "blocked";
    } else if (state !== "blocked") {
      state = "concern";
    }
  }
  if (escalationCount > 0 && policy.escalationCountsAsConcern) {
    reasonCodes.push("model_policy_escalation_count_nonzero");
    if (
      policy.cleanProofRequiresPrimaryPolicy &&
      !ownerAcceptedProviderIncident &&
      input.proofMode
    ) {
      reasonCodes.push("model_policy_escalation_requires_owner_acceptance");
      state = "blocked";
    } else if (state !== "blocked") {
      state = "concern";
    }
  }
  if (ownerAcceptedProviderIncident) {
    reasonCodes.push("model_policy_provider_incident_owner_accepted");
  }
  if (state === "clean") {
    reasonCodes.push("model_policy_proof_clean");
  }
  return {
    state,
    hiddenRescueDetected,
    rescueCount,
    escalationCount,
    ownerAcceptedProviderIncident,
    reasonCodes,
  };
}

export function evaluateModelPolicyBindingPreflight(input: {
  classification: ModelTaskClassification;
  providerCallRequested?: boolean;
  actualModelRef?: string | null;
  actualProviderPath?: ModelTaskProviderPath | string | null;
  actualReasoningMode?: ModelTaskReasoningMode | string | null;
  actualParserMode?: ModelTaskParserMode | string | null;
  actualResponseFormatMode?: ModelTaskResponseFormatMode | string | null;
  requestedTimeoutMs?: number | null;
  requestedSoftTimeoutMs?: number | null;
  requestedMaxOutputTokens?: number | null;
  requestedInputBytes?: number | null;
  actualAllowedToolFamily?: string | null;
  actualOutputContractId?: string | null;
  actualOutputContractVersion?: string | null;
  proofMode?: boolean;
  hiddenRescueDetected?: boolean;
  rescueCount?: number | null;
  escalationCount?: number | null;
  ownerAcceptedProviderIncident?: boolean;
}): ModelPolicyBindingPreflight {
  const binding = input.classification.contractBoundaryId
    ? modelContractBoundaryBindingFor(input.classification.contractBoundaryId)
    : null;
  const mismatches: ModelPolicyBindingMismatch[] = [];
  if (binding) {
    addMismatch(mismatches, {
      fieldPath: "taskClass",
      expected: binding.taskClass,
      actual: input.classification.taskClass,
      reasonCode: "model_policy_task_class_mismatch",
    });
    addMismatch(mismatches, {
      fieldPath: "modelPolicyRef",
      expected: binding.modelPolicyRef,
      actual: input.classification.modelPolicyRef,
      reasonCode: "model_policy_ref_mismatch",
    });
    addMismatch(mismatches, {
      fieldPath: "providerPath",
      expected: binding.providerPath,
      actual: input.actualProviderPath ?? input.classification.providerPath,
      reasonCode: "model_policy_provider_path_mismatch",
    });
    addMismatch(mismatches, {
      fieldPath: "reasoningMode",
      expected: primitiveString(binding.reasoningMode),
      actual: primitiveString(input.actualReasoningMode ?? input.classification.reasoningMode),
      reasonCode: "model_policy_reasoning_mode_mismatch",
    });
    addMismatch(mismatches, {
      fieldPath: "parserMode",
      expected: binding.parserMode,
      actual: input.actualParserMode ?? input.classification.parserMode,
      reasonCode: "model_policy_parser_mode_mismatch",
    });
    addMismatch(mismatches, {
      fieldPath: "responseFormatMode",
      expected: binding.responseFormatMode,
      actual: input.actualResponseFormatMode ?? input.classification.responseFormatMode,
      reasonCode: "model_policy_response_format_mismatch",
    });
    if (input.actualAllowedToolFamily !== undefined && input.actualAllowedToolFamily !== null) {
      addMismatch(mismatches, {
        fieldPath: "allowedToolFamily",
        expected: binding.allowedToolFamily,
        actual: input.actualAllowedToolFamily,
        reasonCode: "model_policy_allowed_tool_family_mismatch",
      });
    }
    if (input.actualOutputContractId !== undefined && input.actualOutputContractId !== null) {
      addMismatch(mismatches, {
        fieldPath: "allowedOutputContractId",
        expected: binding.allowedOutputContractId,
        actual: input.actualOutputContractId,
        reasonCode: "model_policy_output_contract_mismatch",
      });
    }
    if (
      input.actualOutputContractVersion !== undefined &&
      input.actualOutputContractVersion !== null
    ) {
      addMismatch(mismatches, {
        fieldPath: "allowedOutputContractVersion",
        expected: binding.allowedOutputContractVersion,
        actual: input.actualOutputContractVersion,
        reasonCode: "model_policy_output_contract_version_mismatch",
      });
    }
    addBoundMismatch(mismatches, {
      fieldPath: "timeoutMs",
      policyBound: binding.timeoutMs,
      requested: input.requestedTimeoutMs,
      reasonCode: "model_policy_timeout_exceeds_bound",
    });
    addBoundMismatch(mismatches, {
      fieldPath: "softTimeoutMs",
      policyBound: binding.softTimeoutMs,
      requested: input.requestedSoftTimeoutMs,
      reasonCode: "model_policy_soft_timeout_exceeds_bound",
    });
    addBoundMismatch(mismatches, {
      fieldPath: "maxOutputTokens",
      policyBound: binding.maxOutputTokens,
      requested: input.requestedMaxOutputTokens,
      reasonCode: "model_policy_output_tokens_exceed_bound",
    });
    addBoundMismatch(mismatches, {
      fieldPath: "inputBytes",
      policyBound: binding.maxInputBytes,
      requested: input.requestedInputBytes,
      reasonCode: "model_policy_input_exceeds_bound",
    });
    if ((input.providerCallRequested ?? true) && !binding.providerCallAllowed) {
      mismatches.push({
        fieldPath: "providerCallRequested",
        expected: false,
        actual: true,
        reasonCode: "model_policy_provider_call_forbidden",
      });
    }
  }
  const modelRef = input.actualModelRef ?? input.classification.selectedModelRef;
  if (
    binding?.preferredModelRef &&
    modelRef &&
    modelRef !== binding.preferredModelRef &&
    !binding.allowedFallbackModelRefs.includes(modelRef)
  ) {
    mismatches.push({
      fieldPath: "selectedModelRef",
      expected: binding.preferredModelRef,
      actual: modelRef,
      reasonCode: "model_policy_model_ref_not_allowed",
    });
  }
  const cleanliness = proofCleanliness({
    binding,
    proofMode: input.proofMode,
    hiddenRescueDetected: input.hiddenRescueDetected,
    rescueCount: input.rescueCount,
    escalationCount: input.escalationCount,
    ownerAcceptedProviderIncident: input.ownerAcceptedProviderIncident,
  });
  const reasonCodes = [
    "model_policy_binding_preflight_evaluated",
    ...(binding
      ? [`model_contract_boundary:${binding.boundaryId}`]
      : ["model_contract_boundary_missing"]),
    ...mismatches.map((mismatch) => mismatch.reasonCode),
    ...cleanliness.reasonCodes,
  ];
  const accepted = mismatches.length === 0 && cleanliness.state !== "blocked";
  return {
    artifactKind: "model_policy_binding_preflight",
    schemaVersion: MODEL_CONTRACT_BOUNDARY_SCHEMA_VERSION,
    accepted,
    boundaryId: binding?.boundaryId ?? null,
    boundaryRef: binding?.boundaryRef ?? null,
    modelPolicyBindingRef: binding?.boundaryRef ?? null,
    taskClass: input.classification.taskClass,
    modelPolicyRef: input.classification.modelPolicyRef,
    providerCallAllowed: binding?.providerCallAllowed ?? input.classification.providerCallAllowed,
    mismatches,
    proofCleanliness: cleanliness,
    reasonCodes: accepted
      ? [...reasonCodes, "model_policy_binding_preflight_accepted"]
      : reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function assertModelTaskPolicy(input: {
  classification: ModelTaskClassification;
  providerCallRequested?: boolean;
}): void {
  const preflight = evaluateModelPolicyBindingPreflight({
    classification: input.classification,
    providerCallRequested: input.providerCallRequested,
  });
  if (!preflight.accepted) {
    throw new Error(preflight.mismatches[0]?.reasonCode ?? "model_policy_binding_preflight_failed");
  }
  if (!input.classification.callSite.trim()) {
    throw new Error("model_task_classification_call_site_missing");
  }
  if (!input.classification.modelPolicyRef.trim()) {
    throw new Error("model_task_policy_ref_missing");
  }
}

export function buildModelTaskTelemetryEnvelope(input: {
  classification: ModelTaskClassification;
  retryCount?: number | null;
  escalationStatus?: "not_escalated" | "escalated" | "exhausted" | null;
  usage?: JsonValue | null;
  usageUnavailableReason?: string | null;
}): JsonValue {
  return {
    artifactKind: "model_task_telemetry_envelope",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: input.classification.taskClass,
    callSite: input.classification.callSite,
    contractBoundaryId: input.classification.contractBoundaryId,
    modelPolicyBindingRef: input.classification.modelPolicyBindingRef,
    modelPolicyRef: input.classification.modelPolicyRef,
    selectedModelRef: input.classification.selectedModelRef,
    providerPath: input.classification.providerPath,
    reasoningMode: input.classification.reasoningMode,
    parserMode: input.classification.parserMode,
    responseFormatMode: input.classification.responseFormatMode,
    allowedToolFamily: input.classification.allowedToolFamily,
    allowedOutputContractId: input.classification.allowedOutputContractId,
    allowedOutputContractVersion: input.classification.allowedOutputContractVersion,
    timeoutMs: input.classification.timeoutMs,
    softTimeoutMs: input.classification.softTimeoutMs,
    retryCount: input.retryCount ?? null,
    escalationStatus: input.escalationStatus ?? null,
    usage: input.usage ?? null,
    usageUnavailableReason: input.usageUnavailableReason ?? null,
    exception: input.classification.exception,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function explainModelTaskPolicyDecision(classification: ModelTaskClassification): string {
  return `${classification.taskClass} uses ${classification.selectedModelRef ?? "no model"} via ${classification.providerPath} with ${classification.reasoningMode ?? "no"} reasoning.`;
}
