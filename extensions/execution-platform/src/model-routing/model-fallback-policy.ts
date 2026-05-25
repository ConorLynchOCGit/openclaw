import type { ModelRosterRoleId } from "./model-roster-enforcement.ts";

export type ModelFallbackFailureKind =
  | "openrouter_http_429"
  | "openrouter_no_content"
  | "empty_response"
  | "failing_scorecard"
  | "timeout";

export type ModelFallbackRolePolicy = {
  roleId: ModelRosterRoleId;
  primaryModelId: string;
  fallbackModelIds: string[];
  fallbackAllowed: boolean;
  maxAuthority: "observe" | "testing" | "review" | "implementation" | "orchestration";
};

export type ModelFallbackDecision = {
  artifactKind: "model_fallback_decision";
  roleId: ModelRosterRoleId;
  failedModelId: string;
  failureKind: ModelFallbackFailureKind;
  action: "fallback" | "mark_degraded" | "needs_review" | "blocked";
  fallbackModelId: string | null;
  reasonCodes: string[];
  roleAuthorityBoundaryPreserved: true;
  v4ProAuthorityExpanded: false;
  falseSuccessClaimed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function defaultModelFallbackPolicies(): ModelFallbackRolePolicy[] {
  return [
    {
      roleId: "context_scout",
      primaryModelId: "qwen/qwen3-coder-next",
      fallbackModelIds: [],
      fallbackAllowed: false,
      maxAuthority: "observe",
    },
    {
      roleId: "implementation_engineer",
      primaryModelId: "moonshotai/kimi-k2.6",
      fallbackModelIds: [],
      fallbackAllowed: false,
      maxAuthority: "implementation",
    },
    {
      roleId: "test_engineer",
      primaryModelId: "deepseek/deepseek-v4-pro",
      fallbackModelIds: ["deepseek/deepseek-v4-flash"],
      fallbackAllowed: true,
      maxAuthority: "testing",
    },
    {
      roleId: "security_privacy_reviewer",
      primaryModelId: "local-codex-operator-session",
      fallbackModelIds: [],
      fallbackAllowed: false,
      maxAuthority: "review",
    },
    {
      roleId: "reviewer",
      primaryModelId: "local-codex-operator-session",
      fallbackModelIds: [],
      fallbackAllowed: false,
      maxAuthority: "review",
    },
    {
      roleId: "observability_scribe",
      primaryModelId: "deepseek/deepseek-v4-flash",
      fallbackModelIds: ["moonshotai/kimi-k2.6"],
      fallbackAllowed: true,
      maxAuthority: "observe",
    },
  ];
}

export function decideModelFallback(input: {
  roleId: ModelRosterRoleId;
  failedModelId: string;
  failureKind: ModelFallbackFailureKind;
  policies?: ModelFallbackRolePolicy[];
  failingScorecardHardBlock?: boolean;
}): ModelFallbackDecision {
  const policies = input.policies ?? defaultModelFallbackPolicies();
  const policy = policies.find((item) => item.roleId === input.roleId);
  const reasonCodes: string[] = [input.failureKind];
  if (!policy) {
    reasonCodes.push("role_fallback_policy_missing");
  }
  if (input.failedModelId === "deepseek/deepseek-v4-pro" && input.roleId !== "test_engineer") {
    reasonCodes.push("v4_pro_blocked_outside_test_engineer");
  }
  if (input.failingScorecardHardBlock || input.failureKind === "failing_scorecard") {
    reasonCodes.push("scorecard_failure_blocks_success");
    return {
      artifactKind: "model_fallback_decision",
      roleId: input.roleId,
      failedModelId: input.failedModelId,
      failureKind: input.failureKind,
      action: "blocked",
      fallbackModelId: null,
      reasonCodes: [...new Set(reasonCodes)].toSorted(),
      roleAuthorityBoundaryPreserved: true,
      v4ProAuthorityExpanded: false,
      falseSuccessClaimed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  if (!policy?.fallbackAllowed || policy.fallbackModelIds.length === 0) {
    reasonCodes.push(policy ? "fallback_not_allowed_for_role" : "human_review_required");
    return {
      artifactKind: "model_fallback_decision",
      roleId: input.roleId,
      failedModelId: input.failedModelId,
      failureKind: input.failureKind,
      action: input.failureKind === "empty_response" ? "needs_review" : "mark_degraded",
      fallbackModelId: null,
      reasonCodes: [...new Set(reasonCodes)].toSorted(),
      roleAuthorityBoundaryPreserved: true,
      v4ProAuthorityExpanded: false,
      falseSuccessClaimed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  reasonCodes.push("fallback_allowed_by_role_policy");
  return {
    artifactKind: "model_fallback_decision",
    roleId: input.roleId,
    failedModelId: input.failedModelId,
    failureKind: input.failureKind,
    action: "fallback",
    fallbackModelId: policy.fallbackModelIds[0] ?? null,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    roleAuthorityBoundaryPreserved: true,
    v4ProAuthorityExpanded: false,
    falseSuccessClaimed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
