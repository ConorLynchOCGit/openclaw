import type {
  ModelCapability,
  ModelRouteCandidate,
  ModelRoutePolicy,
} from "../model-routing/types.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ModelTaskContractId } from "./types.ts";

export const MODEL_TASK_MODEL_POLICY_VERSION = "execution-platform.model-task-model-policy.v1";

export type ModelTaskLane =
  | "implementation_engineer"
  | "test_engineer"
  | "resource_scout"
  | "security_privacy_reviewer"
  | "reviewer"
  | "observability_scribe"
  | "closeout_synthesis"
  | "model_memory_capture"
  | "model_memory_capture_interpretation"
  | "retrieval_interpretation"
  | "retrieval_final_inclusion_review"
  | "skillifier"
  | "proactivity"
  | "proactivity_merge_adjudication"
  | "closeout_opportunity_seed_extraction";

export type ModelTaskModelSettings = {
  timeoutMs: number;
  maxAttempts: number;
  maxOutputTokens: number;
  reasoningEffort: "minimal" | "low" | "medium" | "high" | "xhigh" | null;
  speedPreference: "latency" | "throughput" | null;
  retryReasons: string[];
};

export type ModelTaskRosterCandidate = {
  modelRef: string;
  providerPath: "openrouter" | "codex_app_server";
  roleLanes: ModelTaskLane[];
  capabilities: ModelCapability[];
  settings: ModelTaskModelSettings;
  status: "enabled" | "needs_review" | "blocked_config_missing" | "disabled";
  policyRef: string;
  rollbackRef: string | null;
};

export type ModelTaskRosterResolution = {
  artifactKind: "model_task_roster_resolution";
  policyVersion: typeof MODEL_TASK_MODEL_POLICY_VERSION;
  contractId: ModelTaskContractId;
  lane: ModelTaskLane;
  status: "resolved" | "needs_review" | "blocked";
  selectedModelRef: string | null;
  providerPath: ModelTaskRosterCandidate["providerPath"] | null;
  policyRef: string | null;
  rollbackRef: string | null;
  settings: ModelTaskModelSettings | null;
  requiredCapabilities: ModelCapability[];
  fallbackModelRefs: string[];
  reasonCodes: string[];
  providerCallMade: false;
  modelPromotionPerformed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export const DEFAULT_MODEL_TASK_ROSTER: ModelTaskRosterCandidate[] = [
  {
    modelRef: "moonshotai/kimi-k2.6",
    providerPath: "openrouter",
    roleLanes: ["implementation_engineer", "skillifier"],
    capabilities: ["structured_json", "json_schema", "reasoning", "code_execution_ready"],
    settings: {
      timeoutMs: 300_000,
      maxAttempts: 2,
      maxOutputTokens: 2_400,
      reasoningEffort: null,
      speedPreference: "throughput",
      retryReasons: ["openrouter_no_content", "openrouter_http_429", "openrouter_http_503"],
    },
    status: "enabled",
    policyRef: "model-task-policy://openrouter/kimi-k2.6/implementation",
    rollbackRef: "model-task-policy://rollback/deepseek-v4-flash",
  },
  {
    modelRef: "deepseek/deepseek-v4-flash",
    providerPath: "openrouter",
    roleLanes: ["resource_scout", "observability_scribe", "retrieval_interpretation"],
    capabilities: ["structured_json", "json_schema", "low_cost"],
    settings: {
      timeoutMs: 120_000,
      maxAttempts: 2,
      maxOutputTokens: 1_400,
      reasoningEffort: "low",
      speedPreference: "latency",
      retryReasons: ["openrouter_no_content", "openrouter_http_429", "openrouter_http_503"],
    },
    status: "enabled",
    policyRef: "model-task-policy://openrouter/deepseek-v4-flash/fast-json",
    rollbackRef: "model-task-policy://rollback/openai-codex-gpt-5.4",
  },
  {
    modelRef: "deepseek/deepseek-v4-pro",
    providerPath: "openrouter",
    roleLanes: ["test_engineer", "security_privacy_reviewer", "reviewer"],
    capabilities: ["structured_json", "json_schema", "reasoning"],
    settings: {
      timeoutMs: 600_000,
      maxAttempts: 2,
      maxOutputTokens: 6_000,
      reasoningEffort: "medium",
      speedPreference: "throughput",
      retryReasons: ["openrouter_no_content", "openrouter_http_429", "openrouter_http_503"],
    },
    status: "enabled",
    policyRef: "model-task-policy://openrouter/deepseek-v4-pro/review-json",
    rollbackRef: "model-task-policy://rollback/deepseek-v4-flash",
  },
  {
    modelRef: "openai-codex/gpt-5.4",
    providerPath: "codex_app_server",
    roleLanes: [
      "closeout_synthesis",
      "model_memory_capture",
      "model_memory_capture_interpretation",
      "proactivity",
      "proactivity_merge_adjudication",
      "closeout_opportunity_seed_extraction",
      "reviewer",
    ],
    capabilities: ["structured_json", "json_schema", "large_context", "reasoning"],
    settings: {
      timeoutMs: 240_000,
      maxAttempts: 1,
      maxOutputTokens: 8_000,
      reasoningEffort: "medium",
      speedPreference: "throughput",
      retryReasons: ["codex_app_server_timeout"],
    },
    status: "enabled",
    policyRef: "model-task-policy://codex-app-server/gpt-5.4/structured-json",
    rollbackRef: "model-task-policy://rollback/gpt-5.4-mini",
  },
  {
    modelRef: "openai-codex/gpt-5.4-mini",
    providerPath: "codex_app_server",
    roleLanes: [
      "model_memory_capture",
      "model_memory_capture_interpretation",
      "retrieval_interpretation",
      "retrieval_final_inclusion_review",
    ],
    capabilities: ["structured_json", "json_schema", "low_cost"],
    settings: {
      timeoutMs: 120_000,
      maxAttempts: 1,
      maxOutputTokens: 2_000,
      reasoningEffort: "low",
      speedPreference: "latency",
      retryReasons: ["codex_app_server_timeout"],
    },
    status: "enabled",
    policyRef: "model-task-policy://codex-app-server/gpt-5.4-mini/memory-json",
    rollbackRef: null,
  },
];

const CONTRACT_LANES: Record<string, ModelTaskLane[]> = {
  "model_memory.structured_json": ["model_memory_capture", "closeout_synthesis"],
  "model_memory.capture_interpretation": [
    "model_memory_capture_interpretation",
    "model_memory_capture",
  ],
  "retrieval.structured_json": ["retrieval_interpretation", "resource_scout"],
  "retrieval.request_interpretation": ["retrieval_interpretation", "resource_scout"],
  "retrieval.final_inclusion_review": ["retrieval_final_inclusion_review", "reviewer"],
  "proactivity.structured_json": ["proactivity", "closeout_synthesis"],
  "proactivity.opportunity_extraction": ["proactivity", "closeout_synthesis"],
  "proactivity.merge_adjudication": ["proactivity_merge_adjudication", "reviewer"],
  "skillifier.structured_json": ["skillifier", "implementation_engineer"],
  "closeout.opportunity_seed_extraction": [
    "closeout_opportunity_seed_extraction",
    "closeout_synthesis",
  ],
  "outcome_pack_review.structured_json": ["closeout_synthesis", "reviewer"],
};

const CONTRACT_REQUIRED_CAPABILITIES: Record<string, ModelCapability[]> = {
  "model_memory.structured_json": ["structured_json", "json_schema"],
  "retrieval.structured_json": ["structured_json", "json_schema"],
  "proactivity.structured_json": ["structured_json", "json_schema"],
  "skillifier.structured_json": ["structured_json", "json_schema"],
  "outcome_pack_review.structured_json": ["structured_json", "json_schema"],
};

export function laneForModelTaskContract(input: {
  contractId: ModelTaskContractId;
  preferredLane?: ModelTaskLane | null;
}): ModelTaskLane {
  const lanes = CONTRACT_LANES[input.contractId] ?? ["closeout_synthesis"];
  return input.preferredLane && lanes.includes(input.preferredLane)
    ? input.preferredLane
    : lanes[0]!;
}

export function resolveModelTaskRoster(input: {
  contractId: ModelTaskContractId;
  preferredLane?: ModelTaskLane | null;
  requestedModelRef?: string | null;
  roster?: ModelTaskRosterCandidate[];
  providerSecrets?: Partial<Record<ModelTaskRosterCandidate["providerPath"], boolean>>;
}): ModelTaskRosterResolution {
  const lane = laneForModelTaskContract(input);
  const roster = input.roster ?? DEFAULT_MODEL_TASK_ROSTER;
  const requiredCapabilities = CONTRACT_REQUIRED_CAPABILITIES[input.contractId] ?? [
    "structured_json",
    "json_schema",
  ];
  const candidates = roster.filter((candidate) => candidate.roleLanes.includes(lane));
  const orderedCandidates = input.requestedModelRef
    ? candidates.filter((candidate) => candidate.modelRef === input.requestedModelRef)
    : candidates;
  const reasonCodes: string[] = [];
  if (candidates.length === 0) {
    reasonCodes.push("model_task_roster_lane_missing");
  }
  if (input.requestedModelRef && orderedCandidates.length === 0) {
    reasonCodes.push("model_task_requested_model_not_allowed_for_lane");
  }
  const selected = orderedCandidates.find((candidate) => {
    if (candidate.status !== "enabled") {
      return false;
    }
    return requiredCapabilities.every((capability) => candidate.capabilities.includes(capability));
  });
  if (!selected) {
    reasonCodes.push("model_task_roster_candidate_not_resolved");
  } else if (input.providerSecrets?.[selected.providerPath] === false) {
    reasonCodes.push(`model_task_provider_config_missing:${selected.providerPath}`);
  }
  const blocked = reasonCodes.some((reason) => reason.includes("config_missing"));
  return {
    artifactKind: "model_task_roster_resolution",
    policyVersion: MODEL_TASK_MODEL_POLICY_VERSION,
    contractId: input.contractId,
    lane,
    status:
      selected && reasonCodes.length === 0 ? "resolved" : blocked ? "blocked" : "needs_review",
    selectedModelRef: reasonCodes.length === 0 ? (selected?.modelRef ?? null) : null,
    providerPath: reasonCodes.length === 0 ? (selected?.providerPath ?? null) : null,
    policyRef: reasonCodes.length === 0 ? (selected?.policyRef ?? null) : null,
    rollbackRef: reasonCodes.length === 0 ? (selected?.rollbackRef ?? null) : null,
    settings: reasonCodes.length === 0 ? (selected?.settings ?? null) : null,
    requiredCapabilities,
    fallbackModelRefs: orderedCandidates
      .filter((candidate) => candidate.modelRef !== selected?.modelRef)
      .map((candidate) => candidate.modelRef)
      .slice(0, 10),
    reasonCodes: reasonCodes.length === 0 ? ["model_task_roster_resolved"] : reasonCodes,
    providerCallMade: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function modelTaskRosterCandidateToRouteCandidate(
  candidate: ModelTaskRosterCandidate,
): ModelRouteCandidate {
  return {
    provider: candidate.providerPath === "openrouter" ? "openrouter" : "openai",
    model: candidate.modelRef,
    family: candidate.modelRef.includes("kimi")
      ? "Moonshot"
      : candidate.modelRef.includes("deepseek")
        ? "DeepSeek"
        : "OpenAI-Codex",
    capabilities: candidate.capabilities,
    metadata: {
      policyRef: candidate.policyRef,
      rollbackRef: candidate.rollbackRef,
      timeoutMs: candidate.settings.timeoutMs,
      maxAttempts: candidate.settings.maxAttempts,
      maxOutputTokens: candidate.settings.maxOutputTokens,
      reasoningEffort: candidate.settings.reasoningEffort,
      speedPreference: candidate.settings.speedPreference,
    } satisfies Record<string, JsonValue>,
  };
}

export function createModelTaskRoutePolicyFromRoster(input: {
  contractId: ModelTaskContractId;
  preferredLane?: ModelTaskLane | null;
  roster?: ModelTaskRosterCandidate[];
}): ModelRoutePolicy {
  const lane = laneForModelTaskContract(input);
  const roster = input.roster ?? DEFAULT_MODEL_TASK_ROSTER;
  const candidates = roster
    .filter((candidate) => candidate.roleLanes.includes(lane))
    .map(modelTaskRosterCandidateToRouteCandidate);
  const selectedSettings =
    roster.find((candidate) => candidate.roleLanes.includes(lane))?.settings ??
    DEFAULT_MODEL_TASK_ROSTER[0]!.settings;
  return {
    contractId: input.contractId,
    approvedModels: candidates,
    priority: candidates.map((candidate) => candidate.model),
    requiredCapabilities: CONTRACT_REQUIRED_CAPABILITIES[input.contractId] ?? [
      "structured_json",
      "json_schema",
    ],
    timeoutMs: selectedSettings.timeoutMs,
    maxAttempts: selectedSettings.maxAttempts,
    schemaMode: "structured_json",
  };
}
