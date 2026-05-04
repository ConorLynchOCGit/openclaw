import type { ModelTaskContractId } from "../model-tasks/types.ts";
import {
  MODEL_ROUTE_POLICY_VERSION,
  type ModelCapability,
  type ModelRouteCandidate,
  type ModelRouteDecision,
  type ModelRouteEvidence,
  type ModelRoutePolicy,
  type ModelRouteRejection,
} from "./types.ts";

export const MODEL_ROUTE_CANDIDATES: ModelRouteCandidate[] = [
  {
    provider: "openai",
    model: "openai-codex-policy-candidate",
    family: "OpenAI-Codex",
    capabilities: [
      "structured_json",
      "json_schema",
      "tool_calling",
      "large_context",
      "reasoning",
      "code_execution_ready",
    ],
    metadata: {
      lane: "future_acp_codex_ready",
      executionEnabled: false,
    },
  },
  {
    provider: "openai",
    model: "gpt-mini-structured-json",
    family: "GPT mini/nano lanes",
    capabilities: ["structured_json", "json_schema", "low_cost"],
    metadata: {
      lane: "low_cost_structured_json",
      executionEnabled: false,
    },
  },
  {
    provider: "openai",
    model: "gpt-nano-classifier",
    family: "GPT mini/nano lanes",
    capabilities: ["structured_json", "low_cost"],
    metadata: {
      lane: "tiny_classification",
      executionEnabled: false,
    },
  },
  {
    provider: "deepseek",
    model: "deepseek-structured-json",
    family: "DeepSeek",
    capabilities: ["structured_json", "json_schema", "reasoning"],
    metadata: {
      lane: "reasoning_candidate",
      executionEnabled: false,
    },
  },
  {
    provider: "minimax",
    model: "minimax-structured-json",
    family: "MiniMax",
    capabilities: ["structured_json", "json_schema", "large_context"],
    metadata: {
      lane: "large_context_candidate",
      executionEnabled: false,
    },
  },
  {
    provider: "qwen",
    model: "qwen-structured-json",
    family: "Qwen",
    capabilities: ["structured_json", "json_schema", "reasoning"],
    metadata: {
      lane: "open_weight_candidate",
      executionEnabled: false,
    },
  },
  {
    provider: "openrouter",
    model: "openrouter-structured-json",
    family: "OpenRouter-hosted candidates",
    capabilities: ["structured_json", "json_schema", "tool_calling"],
    metadata: {
      lane: "hosted_candidate",
      executionEnabled: false,
    },
  },
];

const CONTRACT_ROUTE_REQUIREMENTS: Record<
  string,
  {
    requiredCapabilities: ModelCapability[];
    priority: string[];
    timeoutMs: number;
    maxAttempts: number;
  }
> = {
  "model_memory.structured_json": {
    requiredCapabilities: ["structured_json", "json_schema", "large_context"],
    priority: [
      "minimax-structured-json",
      "openai-codex-policy-candidate",
      "deepseek-structured-json",
    ],
    timeoutMs: 60_000,
    maxAttempts: 2,
  },
  "retrieval.structured_json": {
    requiredCapabilities: ["structured_json", "json_schema", "low_cost"],
    priority: ["gpt-mini-structured-json", "openrouter-structured-json", "qwen-structured-json"],
    timeoutMs: 45_000,
    maxAttempts: 2,
  },
  "proactivity.structured_json": {
    requiredCapabilities: ["structured_json", "json_schema", "reasoning"],
    priority: ["deepseek-structured-json", "qwen-structured-json", "openai-codex-policy-candidate"],
    timeoutMs: 60_000,
    maxAttempts: 2,
  },
  "skillifier.structured_json": {
    requiredCapabilities: ["structured_json", "json_schema", "reasoning"],
    priority: ["qwen-structured-json", "deepseek-structured-json", "openai-codex-policy-candidate"],
    timeoutMs: 60_000,
    maxAttempts: 2,
  },
  "outcome_pack_review.structured_json": {
    requiredCapabilities: ["structured_json", "json_schema", "tool_calling"],
    priority: [
      "openrouter-structured-json",
      "openai-codex-policy-candidate",
      "gpt-mini-structured-json",
    ],
    timeoutMs: 60_000,
    maxAttempts: 2,
  },
};

function candidateByModel(candidates: ModelRouteCandidate[]) {
  return new Map(candidates.map((candidate) => [candidate.model, candidate]));
}

function missingCapabilities(
  candidate: ModelRouteCandidate,
  requiredCapabilities: ModelCapability[],
): ModelCapability[] {
  return requiredCapabilities.filter((capability) => !candidate.capabilities.includes(capability));
}

export function createModelRoutePolicyForContract(
  contractId: ModelTaskContractId,
  candidates: ModelRouteCandidate[] = MODEL_ROUTE_CANDIDATES,
): ModelRoutePolicy {
  const requirements = CONTRACT_ROUTE_REQUIREMENTS[contractId];
  if (!requirements) {
    throw new Error(`model route policy contract not registered: ${contractId}`);
  }
  const candidatesByModel = candidateByModel(candidates);
  const approvedModels = requirements.priority
    .map((model) => candidatesByModel.get(model))
    .filter((candidate): candidate is ModelRouteCandidate => Boolean(candidate));
  return {
    contractId,
    approvedModels,
    priority: requirements.priority,
    requiredCapabilities: requirements.requiredCapabilities,
    timeoutMs: requirements.timeoutMs,
    maxAttempts: requirements.maxAttempts,
    schemaMode: "structured_json",
  };
}

export function listModelRoutePolicies(
  candidates: ModelRouteCandidate[] = MODEL_ROUTE_CANDIDATES,
): ModelRoutePolicy[] {
  return Object.keys(CONTRACT_ROUTE_REQUIREMENTS)
    .toSorted((left, right) => left.localeCompare(right))
    .map((contractId) =>
      createModelRoutePolicyForContract(contractId as ModelTaskContractId, candidates),
    );
}

export function selectModelRoute(input: {
  contractId: ModelTaskContractId;
  policy?: ModelRoutePolicy;
  candidates?: ModelRouteCandidate[];
  requestedModel?: string;
}): ModelRouteDecision {
  const candidates = input.candidates ?? MODEL_ROUTE_CANDIDATES;
  let policy = input.policy;
  if (!policy) {
    try {
      policy = createModelRoutePolicyForContract(input.contractId, candidates);
    } catch {
      return {
        contractId: input.contractId,
        policyVersion: MODEL_ROUTE_POLICY_VERSION,
        rejected: [
          {
            reason: "contract_unknown",
            message: `contract has no model route policy: ${input.contractId}`,
          },
        ],
        requiredCapabilities: [],
        fallbackChain: [],
        providerCallMade: false,
        reason: "contract unknown",
      };
    }
  }

  const candidatesByModel = candidateByModel(candidates);
  const approvedModels = new Set(policy.priority);
  const rejected: ModelRouteRejection[] = [];
  const fallbackChain: ModelRouteCandidate[] = [];

  const modelsToEvaluate = input.requestedModel ? [input.requestedModel] : policy.priority;
  for (const model of modelsToEvaluate) {
    const candidate = candidatesByModel.get(model);
    if (!approvedModels.has(model) || !candidate) {
      rejected.push({
        reason: "model_not_approved",
        model,
        message: `model is not approved for contract ${input.contractId}`,
      });
      continue;
    }

    const missing = missingCapabilities(candidate, policy.requiredCapabilities);
    if (missing.length > 0) {
      rejected.push({
        reason: "missing_required_capability",
        provider: candidate.provider,
        model: candidate.model,
        missingCapabilities: missing,
        message: `model is missing required capabilities: ${missing.join(", ")}`,
      });
      continue;
    }

    fallbackChain.push(
      ...policy.priority
        .slice(policy.priority.indexOf(model) + 1)
        .map((candidateModel) => candidatesByModel.get(candidateModel))
        .filter((fallback): fallback is ModelRouteCandidate => Boolean(fallback)),
    );
    return {
      contractId: input.contractId,
      policyVersion: MODEL_ROUTE_POLICY_VERSION,
      selected: candidate,
      rejected,
      requiredCapabilities: policy.requiredCapabilities,
      fallbackChain,
      providerCallMade: false,
      reason: "selected first approved model satisfying required capabilities",
    };
  }

  rejected.push({
    reason: "no_candidate_available",
    message: `no approved candidate satisfies contract ${input.contractId}`,
  });
  return {
    contractId: input.contractId,
    policyVersion: MODEL_ROUTE_POLICY_VERSION,
    rejected,
    requiredCapabilities: policy.requiredCapabilities,
    fallbackChain: [],
    providerCallMade: false,
    reason: "no candidate available",
  };
}

export function routeEvidenceFromDecision(decision: ModelRouteDecision): ModelRouteEvidence {
  return {
    selected: decision.selected,
    reason: decision.reason,
    fallbackChain: decision.fallbackChain,
    providerCallMade: false,
    rejectedCandidates: decision.rejected,
    requiredCapabilities: decision.requiredCapabilities,
    policyVersion: decision.policyVersion,
  };
}
