import { describe, expect, it } from "vitest";
import type { AgentTeamRoleEvalScorecard } from "./agent-team-role-evals.ts";
import {
  compareV4ProAndV4FlashTestEngineer,
  decideV4ProTestEngineerAuthority,
} from "./v4-pro-test-engineer-authority.ts";

function scorecard(input: {
  candidateId: string;
  modelId: string;
  status: AgentTeamRoleEvalScorecard["status"];
  disqualificationCodes?: AgentTeamRoleEvalScorecard["disqualificationCodes"];
}): AgentTeamRoleEvalScorecard {
  return {
    artifactKind: "agent_team_role_eval_scorecard",
    candidateId: input.candidateId,
    operatorRequestedLabel: input.modelId,
    provider: "openrouter",
    upstreamProvider: "deepseek",
    modelId: input.modelId,
    fixtureId: "test_plan_critique",
    roleTargets: ["test_engineer"],
    evaluatedAt: "2026-05-03T21:00:00.000Z",
    providerCallMade: true,
    rawPromptStored: false,
    rawResponseStored: false,
    promptHash: "sha256:prompt",
    responseHash: "sha256:response",
    jsonParsed: true,
    requiredFieldsPresent: true,
    status: input.status,
    disqualificationCodes: input.disqualificationCodes ?? [],
    issues: [],
    boundedSummary: {
      findingsCount: 1,
      evidenceRefsCount: 1,
      riskCount: 0,
      recommendedNextActionPresent: true,
      wouldNeedReview: false,
      qualitativeJudgmentLabeledNotDeterministic: true,
    },
  };
}

describe("V4 Pro test-engineer authority", () => {
  it("qualifies only the test-engineer role with complete bounded evidence", () => {
    const comparison = compareV4ProAndV4FlashTestEngineer({
      comparisonId: "comparison",
      createdAt: "2026-05-03T21:00:00.000Z",
      v4ProScorecards: [
        scorecard({
          candidateId: "deepseek-v4-pro-coding-candidate",
          modelId: "deepseek/deepseek-v4-pro",
          status: "qualified",
        }),
      ],
      providerReliability: null,
    });
    const decision = decideV4ProTestEngineerAuthority({
      decisionId: "decision",
      decidedAt: "2026-05-03T21:00:00.000Z",
      comparison,
      evidenceRefs: ["artifact://comparison"],
    });
    expect(comparison.globalWinnerEmitted).toBe(false);
    expect(decision).toMatchObject({
      roleTargetId: "test_engineer",
      status: "qualified",
      authorityGrantedForFutureRuns: true,
      allOtherV4ProRolesRemain: "blocked_or_shadow_or_needs_review",
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("blocks authority when disqualification evidence exists", () => {
    const comparison = compareV4ProAndV4FlashTestEngineer({
      comparisonId: "comparison",
      createdAt: "2026-05-03T21:00:00.000Z",
      v4ProScorecards: [
        scorecard({
          candidateId: "deepseek-v4-pro-coding-candidate",
          modelId: "deepseek/deepseek-v4-pro",
          status: "blocked",
          disqualificationCodes: ["fabricated_validation"],
        }),
      ],
      providerReliability: null,
    });
    expect(
      decideV4ProTestEngineerAuthority({
        decisionId: "decision",
        decidedAt: "2026-05-03T21:00:00.000Z",
        comparison,
        evidenceRefs: ["artifact://comparison"],
      }),
    ).toMatchObject({
      status: "blocked",
      authorityGrantedForFutureRuns: false,
    });
  });
});
