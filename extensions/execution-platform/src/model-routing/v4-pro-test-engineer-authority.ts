import type {
  AgentTeamRoleEvalScorecard,
  AgentTeamRoleQualificationStatus,
} from "./agent-team-role-evals.ts";
import type { ProviderReliabilitySummary } from "./provider-reliability-summary.ts";

export type V4ProTestEngineerComparison = {
  artifactKind: "v4_pro_vs_v4_flash_test_engineer_comparison";
  comparisonId: string;
  createdAt: string;
  roleTargetId: "test_engineer";
  v4Pro: {
    modelId: "deepseek/deepseek-v4-pro";
    status: AgentTeamRoleQualificationStatus;
    scorecardCount: number;
    disqualificationCodes: string[];
    latencyMs: number | null;
    retryCount: number;
    usageComplete: boolean;
  };
  v4Flash: {
    modelId: "deepseek/deepseek-v4-flash";
    status: AgentTeamRoleQualificationStatus;
    scorecardCount: number;
    disqualificationCodes: string[];
    latencyMs: number | null;
    retryCount: number;
    usageComplete: boolean;
  };
  preferredForRole: "deepseek/deepseek-v4-pro" | "deepseek/deepseek-v4-flash" | null;
  globalWinnerEmitted: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type V4ProTestEngineerAuthorityDecision = {
  artifactKind: "v4_pro_test_engineer_authority_decision";
  decisionId: string;
  decidedAt: string;
  modelId: "deepseek/deepseek-v4-pro";
  roleTargetId: "test_engineer";
  status: AgentTeamRoleQualificationStatus;
  authorityGrantedForFutureRuns: boolean;
  operatorApprovalRequiredForUse: true;
  allOtherV4ProRolesRemain: "blocked_or_shadow_or_needs_review";
  reasonCodes: string[];
  evidenceRefs: string[];
  globalWinnerEmitted: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

function scorecardsForTestEngineer(scorecards: AgentTeamRoleEvalScorecard[]) {
  return scorecards.filter((scorecard) => scorecard.roleTargets.includes("test_engineer"));
}

function statusFromScorecards(
  scorecards: AgentTeamRoleEvalScorecard[],
): AgentTeamRoleQualificationStatus {
  if (scorecards.some((scorecard) => scorecard.status === "blocked")) {
    return "blocked";
  }
  if (scorecards.length > 0 && scorecards.every((scorecard) => scorecard.status === "qualified")) {
    return "qualified";
  }
  return "needs_review";
}

function reliabilityFor(summary: ProviderReliabilitySummary | null, modelId: string) {
  return summary?.perModel.find((entry) => entry.modelId === modelId) ?? null;
}

export function compareV4ProAndV4FlashTestEngineer(input: {
  comparisonId: string;
  createdAt: string;
  v4ProScorecards: AgentTeamRoleEvalScorecard[];
  v4FlashScorecards?: AgentTeamRoleEvalScorecard[];
  providerReliability: ProviderReliabilitySummary | null;
}): V4ProTestEngineerComparison {
  const v4ProScorecards = scorecardsForTestEngineer(input.v4ProScorecards);
  const v4FlashScorecards = scorecardsForTestEngineer(input.v4FlashScorecards ?? []);
  const v4ProStatus = statusFromScorecards(v4ProScorecards);
  const v4FlashStatus =
    v4FlashScorecards.length > 0 ? statusFromScorecards(v4FlashScorecards) : "qualified";
  const v4ProReliability = reliabilityFor(input.providerReliability, "deepseek/deepseek-v4-pro");
  const v4FlashReliability = reliabilityFor(
    input.providerReliability,
    "deepseek/deepseek-v4-flash",
  );
  return {
    artifactKind: "v4_pro_vs_v4_flash_test_engineer_comparison",
    comparisonId: input.comparisonId,
    createdAt: input.createdAt,
    roleTargetId: "test_engineer",
    v4Pro: {
      modelId: "deepseek/deepseek-v4-pro",
      status: v4ProStatus,
      scorecardCount: v4ProScorecards.length,
      disqualificationCodes: [
        ...new Set(v4ProScorecards.flatMap((scorecard) => scorecard.disqualificationCodes)),
      ],
      latencyMs: v4ProReliability?.averageLatencyMs ?? null,
      retryCount: v4ProReliability?.retryCount ?? 0,
      usageComplete: v4ProReliability?.usageComplete ?? false,
    },
    v4Flash: {
      modelId: "deepseek/deepseek-v4-flash",
      status: v4FlashStatus,
      scorecardCount: v4FlashScorecards.length,
      disqualificationCodes: [
        ...new Set(v4FlashScorecards.flatMap((scorecard) => scorecard.disqualificationCodes)),
      ],
      latencyMs: v4FlashReliability?.averageLatencyMs ?? null,
      retryCount: v4FlashReliability?.retryCount ?? 0,
      usageComplete: v4FlashReliability?.usageComplete ?? false,
    },
    preferredForRole:
      v4ProStatus === "qualified" && v4ProReliability?.usageComplete !== false
        ? "deepseek/deepseek-v4-pro"
        : v4FlashStatus === "qualified"
          ? "deepseek/deepseek-v4-flash"
          : null,
    globalWinnerEmitted: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function decideV4ProTestEngineerAuthority(input: {
  decisionId: string;
  decidedAt: string;
  comparison: V4ProTestEngineerComparison;
  evidenceRefs: string[];
}): V4ProTestEngineerAuthorityDecision {
  const qualified =
    input.comparison.v4Pro.status === "qualified" &&
    input.comparison.v4Pro.disqualificationCodes.length === 0 &&
    input.comparison.v4Pro.scorecardCount > 0;
  return {
    artifactKind: "v4_pro_test_engineer_authority_decision",
    decisionId: input.decisionId,
    decidedAt: input.decidedAt,
    modelId: "deepseek/deepseek-v4-pro",
    roleTargetId: "test_engineer",
    status: qualified ? "qualified" : input.comparison.v4Pro.status,
    authorityGrantedForFutureRuns: qualified,
    operatorApprovalRequiredForUse: true,
    allOtherV4ProRolesRemain: "blocked_or_shadow_or_needs_review",
    reasonCodes: qualified
      ? ["v4_pro_test_engineer_qualified_with_bounded_evidence"]
      : ["v4_pro_test_engineer_evidence_incomplete_or_disqualified"],
    evidenceRefs: input.evidenceRefs.slice(0, 12),
    globalWinnerEmitted: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
