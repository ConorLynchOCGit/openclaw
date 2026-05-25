import type { JsonValue } from "../runtime-job-repository.ts";

export const MODEL_TASK_CLASSIFICATION_VERSION = "execution-platform.model-task-classification.v2";

export const MODEL_TASK_CLASSES = [
  "global_reasoning",
  "local_semantic_extraction",
  "schema_normalization",
  "tool_selection",
  "resource_materialization",
  "implementation_patch",
  "validation_classification",
  "closeout_judgment",
] as const;

export type ModelTaskClass = (typeof MODEL_TASK_CLASSES)[number];

export type ModelTaskReasoningMode =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | null;

export type ModelTaskProviderPath = "codex_app_server" | "openrouter" | "runtime_only";

export type ModelTaskParserMode =
  | "runtime_json_object"
  | "strict_json_schema"
  | "field_patch_json"
  | "runtime_only";

export type ModelTaskResponseFormatMode =
  | "json_object"
  | "json_schema"
  | "prompt_only_json"
  | "runtime_only";

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
      "mission_ledger",
      "scheduler.global_reasoning",
      "context_synthesis",
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
      "commitment_packet.semantic_content",
      "context_scout.summary",
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
    supportedScopes: [
      "router.enum_repair",
      "commitment_packet.targeted_normalization",
      "scheduler.field_repair",
      "validation.field_repair",
    ],
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
  resource_materialization: {
    artifactKind: "model_task_policy",
    classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
    taskClass: "resource_materialization",
    policyRef: "model-task-policy://resource-materialization/runtime-only",
    modelPolicyRef: "model-task-policy://resource-materialization/runtime-only",
    providerPath: "runtime_only",
    preferredModelRef: null,
    allowedFallbackModelRefs: [],
    reasoningMode: null,
    timeoutMs: 30_000,
    softTimeoutMs: null,
    maxInputBytes: null,
    maxOutputTokens: null,
    parserMode: "runtime_only",
    responseFormatMode: "runtime_only",
    retryPolicy: retryPolicy(0, [], "not_applicable"),
    escalationPolicy: {
      escalationModelRefs: [],
      requiresStructuredReason: false,
      terminalStatusWhenExhausted: "needs_review",
    },
    telemetryPolicy: telemetryPolicy({
      tokenUsageRequired: false,
      costUsageRequired: false,
      allowEstimatedUsage: false,
    }),
    supportedScopes: [
      "node.compile_execution_packet",
      "context.resolve_target_refs",
      "repo.snapshot_target_files",
      "implementation.compile_task_packet",
    ],
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
> = {
  "commitment_packet.semantic_content": {
    local_semantic_extraction: {
      policyRefSuffix: "commitment-packet-semantic-content",
      timeoutMs: 180_000,
      softTimeoutMs: 90_000,
      maxInputBytes: 32_000,
      maxOutputTokens: 8_000,
      reasonCode: "model_task_call_site_bounds:commitment_packet.semantic_content",
    },
  },
  "commitment_packet.semantic_content.fallback": {
    local_semantic_extraction: {
      policyRefSuffix: "commitment-packet-semantic-content-fallback",
      timeoutMs: 180_000,
      softTimeoutMs: 90_000,
      maxInputBytes: 32_000,
      maxOutputTokens: 8_000,
      reasonCode: "model_task_call_site_bounds:commitment_packet.semantic_content.fallback",
    },
  },
};

function callSitePolicyOverride(
  taskClass: ModelTaskClass,
  callSite: string,
): ModelTaskCallSitePolicyOverride | null {
  return MODEL_TASK_CALL_SITE_POLICY_OVERRIDES[callSite]?.[taskClass] ?? null;
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
      ...(boundsOverride ? [boundsOverride.reasonCode] : []),
      ...(exception ? ["model_task_policy_exception_recorded"] : []),
    ],
    providerCallAllowed: policy.providerPath !== "runtime_only",
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

export function assertModelTaskPolicy(input: {
  classification: ModelTaskClassification;
  providerCallRequested?: boolean;
}): void {
  if (
    input.classification.taskClass === "resource_materialization" &&
    (input.providerCallRequested ?? true)
  ) {
    throw new Error("resource_materialization_provider_call_forbidden");
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
    modelPolicyRef: input.classification.modelPolicyRef,
    selectedModelRef: input.classification.selectedModelRef,
    providerPath: input.classification.providerPath,
    reasoningMode: input.classification.reasoningMode,
    parserMode: input.classification.parserMode,
    responseFormatMode: input.classification.responseFormatMode,
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
  if (classification.taskClass === "resource_materialization") {
    return "Runtime-only resource materialization; provider calls are forbidden.";
  }
  return `${classification.taskClass} uses ${classification.selectedModelRef ?? "no model"} via ${classification.providerPath} with ${classification.reasoningMode ?? "no"} reasoning.`;
}
