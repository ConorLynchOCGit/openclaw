import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeEvidenceRef,
  compactString,
} from "./types.ts";

export type PromptRouterMemoryRouteKind =
  | "protocol"
  | "triage"
  | "chat_send"
  | "advanced_intent_front_door"
  | "workflow_execution"
  | "clarification"
  | "status"
  | "control";

export type PromptRouterMemoryPolicyInput = {
  routeKind: PromptRouterMemoryRouteKind;
  promptHash: string;
  boundedPromptSummary: string;
  contextBudgetRemainingTokens: number;
  runtimeStatePresent?: boolean;
  untrustedExternalContentPresent?: boolean;
  stateVersionMismatch?: boolean;
  requestedMemoryContext?: boolean;
  activeWorkflowRuntimeJobId?: string | null;
};

export type PromptRouterMemoryPolicyDecision = {
  artifactKind: "prompt_router_memory_policy_decision";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  routeKind: PromptRouterMemoryRouteKind;
  decision:
    | "no_memory"
    | "triage_state_facts_only"
    | "bounded_chat_retrieval"
    | "bounded_advanced_retrieval"
    | "runtime_context_refs_only"
    | "skip_over_budget"
    | "skip_untrusted_or_stale";
  maxRetrievalPackTokens: number;
  maxProjectionTokens: number;
  maxCloseoutContextTokens: number;
  memoryContextRefs: MemoryRuntimeEvidenceRef[];
  reasonCodes: string[];
  promptHash: string;
  boundedPromptSummary: string;
  retrievedMemoryTrustedForAuthority: false;
  rawMemoryStored: false;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

function baseDecision(input: PromptRouterMemoryPolicyInput) {
  return {
    artifactKind: "prompt_router_memory_policy_decision" as const,
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION as typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    routeKind: input.routeKind,
    memoryContextRefs: [],
    promptHash: input.promptHash,
    boundedPromptSummary: compactString(input.boundedPromptSummary, 500),
    retrievedMemoryTrustedForAuthority: false as const,
    rawMemoryStored: false as const,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    workQueueLifecycleMutated: false as const,
  };
}

export function decidePromptRouterMemoryPolicy(
  input: PromptRouterMemoryPolicyInput,
): PromptRouterMemoryPolicyDecision {
  const budget = Math.max(0, Math.floor(input.contextBudgetRemainingTokens));
  if (input.routeKind === "protocol") {
    return {
      ...baseDecision(input),
      decision: "no_memory",
      maxRetrievalPackTokens: 0,
      maxProjectionTokens: 0,
      maxCloseoutContextTokens: 0,
      reasonCodes: ["protocol_pregate_bypasses_memory_retrieval"],
    };
  }
  if (input.routeKind === "triage") {
    return {
      ...baseDecision(input),
      decision: "triage_state_facts_only",
      maxRetrievalPackTokens: 0,
      maxProjectionTokens: 0,
      maxCloseoutContextTokens: 0,
      reasonCodes: ["simple_triage_receives_state_facts_only_no_retrieval_pack"],
    };
  }
  if (input.untrustedExternalContentPresent || input.stateVersionMismatch) {
    return {
      ...baseDecision(input),
      decision: "skip_untrusted_or_stale",
      maxRetrievalPackTokens: 0,
      maxProjectionTokens: 0,
      maxCloseoutContextTokens: 0,
      reasonCodes: [
        ...(input.untrustedExternalContentPresent ? ["untrusted_external_content_present"] : []),
        ...(input.stateVersionMismatch ? ["state_version_mismatch"] : []),
        "memory_cannot_grant_authority",
      ],
    };
  }
  if (budget < 1_000) {
    return {
      ...baseDecision(input),
      decision: "skip_over_budget",
      maxRetrievalPackTokens: 0,
      maxProjectionTokens: 0,
      maxCloseoutContextTokens: 0,
      reasonCodes: ["context_budget_too_low_for_memory_retrieval"],
    };
  }
  if (input.routeKind === "chat_send" || input.routeKind === "status") {
    return {
      ...baseDecision(input),
      decision: "bounded_chat_retrieval",
      maxRetrievalPackTokens: Math.min(2_000, budget),
      maxProjectionTokens: Math.min(1_000, budget),
      maxCloseoutContextTokens: 500,
      reasonCodes: ["chat_lane_allows_small_bounded_memory_refs"],
    };
  }
  if (input.routeKind === "workflow_execution") {
    return {
      ...baseDecision(input),
      decision: "runtime_context_refs_only",
      maxRetrievalPackTokens: Math.min(8_000, budget),
      maxProjectionTokens: Math.min(3_000, budget),
      maxCloseoutContextTokens: Math.min(2_000, budget),
      memoryContextRefs: input.activeWorkflowRuntimeJobId
        ? [
            {
              ref: `runtime-job://${input.activeWorkflowRuntimeJobId}/memory-context`,
              kind: "context_pack",
              boundedSummary: "Workflow runtime receives memory refs, not raw memory text.",
            },
          ]
        : [],
      reasonCodes: ["workflow_receives_memory_context_refs_only"],
    };
  }
  if (input.routeKind === "advanced_intent_front_door") {
    return {
      ...baseDecision(input),
      decision: "bounded_advanced_retrieval",
      maxRetrievalPackTokens: Math.min(6_000, budget),
      maxProjectionTokens: Math.min(2_000, budget),
      maxCloseoutContextTokens: Math.min(1_500, budget),
      reasonCodes: ["advanced_front_door_allows_bounded_memory_refs"],
    };
  }
  return {
    ...baseDecision(input),
    decision: "no_memory",
    maxRetrievalPackTokens: 0,
    maxProjectionTokens: 0,
    maxCloseoutContextTokens: 0,
    reasonCodes: ["route_kind_does_not_need_memory_context"],
  };
}
