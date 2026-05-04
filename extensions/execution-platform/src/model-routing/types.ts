import type { JsonValue } from "../runtime-job-repository.ts";

export const MODEL_ROUTE_POLICY_VERSION = "execution-platform.model-routing.v1";

export const MODEL_CAPABILITIES = [
  "structured_json",
  "json_schema",
  "tool_calling",
  "large_context",
  "low_cost",
  "reasoning",
  "code_execution_ready",
] as const;

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export type ModelCandidateFamily =
  | "OpenAI-Codex"
  | "GPT mini/nano lanes"
  | "DeepSeek"
  | "MiniMax"
  | "Qwen"
  | "OpenRouter-hosted candidates";

export type ModelRouteCandidate = {
  provider: string;
  model: string;
  family: ModelCandidateFamily;
  capabilities: ModelCapability[];
  metadata?: Record<string, JsonValue>;
};

export type ModelRoutePolicy = {
  contractId: string;
  approvedModels: ModelRouteCandidate[];
  priority: string[];
  requiredCapabilities: ModelCapability[];
  timeoutMs: number;
  maxAttempts: number;
  schemaMode: "structured_json";
};

export type ModelRouteRejectionReason =
  | "model_not_approved"
  | "missing_required_capability"
  | "contract_unknown"
  | "no_candidate_available";

export type ModelRouteRejection = {
  reason: ModelRouteRejectionReason;
  provider?: string;
  model?: string;
  missingCapabilities?: ModelCapability[];
  message: string;
};

export type ModelRouteDecision = {
  contractId: string;
  policyVersion: typeof MODEL_ROUTE_POLICY_VERSION;
  selected?: ModelRouteCandidate;
  rejected: ModelRouteRejection[];
  requiredCapabilities: ModelCapability[];
  fallbackChain: ModelRouteCandidate[];
  providerCallMade: false;
  reason: string;
};

export type ModelRouteEvidence = {
  selected?: ModelRouteCandidate;
  reason: string;
  fallbackChain: ModelRouteCandidate[];
  providerCallMade: false;
  rejectedCandidates?: ModelRouteRejection[];
  requiredCapabilities?: ModelCapability[];
  policyVersion?: typeof MODEL_ROUTE_POLICY_VERSION;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  costEstimateUsd?: number;
};
