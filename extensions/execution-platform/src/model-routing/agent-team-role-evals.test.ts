import { describe, expect, it } from "vitest";
import {
  AGENT_TEAM_ROLE_EVAL_FIXTURES,
  createAgentTeamRoleComparison,
  createWorkQueueModelReadinessSummary,
  scoreAgentTeamRoleEvalOutput,
  V4_PRO_AGENT_TEAM_ROLE_TARGETS,
} from "./agent-team-role-evals.ts";
import { OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES } from "./model-candidate-validation-plan.ts";

const v4Pro = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES.find(
  (candidate) => candidate.candidateId === "deepseek-v4-pro-coding-candidate",
)!;

function validRoleResponse(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    findings: ["bounded finding"],
    evidenceRefs: ["artifact:bounded"],
    risks: ["bounded risk"],
    recommendedNextAction: "proceed with reviewer-gated role assignment",
    wouldNeedReview: false,
    notDeterministic: true,
    fabricatedValidation: false,
    scopeDrift: false,
    unsafeAuthorityRequested: false,
    rawLogOrTranscriptLeakage: false,
    rawPromptOrResponseStored: false,
    deterministicOverclaim: false,
    workQueueLifecycleMutationClaimed: false,
    ...extra,
  });
}

describe("agent-team role eval fixtures", () => {
  it("defines V4 Pro role targets without acceptance or implementation authority", () => {
    expect(V4_PRO_AGENT_TEAM_ROLE_TARGETS.map((target) => target.roleTargetId)).toEqual(
      expect.arrayContaining([
        "context_scout",
        "test_engineer",
        "security_privacy_reviewer_assist",
        "reviewer_assist",
        "observability_scribe",
        "implementation_engineer_shadow",
        "deeper_implementation_candidate",
      ]),
    );
    for (const target of V4_PRO_AGENT_TEAM_ROLE_TARGETS) {
      expect(target.modelMayAcceptWork).toBe(false);
      expect(target.implementationAuthorityGranted).toBe(false);
      expect(target.finalAcceptanceAuthorityGranted).toBe(false);
    }
  });

  it("defines bounded role-specific fixtures with disqualification traps", () => {
    expect(AGENT_TEAM_ROLE_EVAL_FIXTURES.map((fixture) => fixture.fixtureId)).toEqual([
      "codebase_research_summary",
      "test_plan_critique",
      "security_privacy_review",
      "validation_failure_recovery",
      "scope_control_handoff_hygiene",
      "reviewer_judgment_not_deterministic",
    ]);
    for (const fixture of AGENT_TEAM_ROLE_EVAL_FIXTURES) {
      expect(fixture.requiredFields).toContain("notDeterministic");
      expect(fixture.passCriteria.length).toBeGreaterThan(0);
      expect(fixture.disqualificationTraps.length).toBeGreaterThan(0);
      expect(() => JSON.stringify(fixture)).not.toThrow();
    }
  });

  it("scores supplied role output without storing raw prompt or response", () => {
    const scorecard = scoreAgentTeamRoleEvalOutput({
      candidate: v4Pro,
      fixture: AGENT_TEAM_ROLE_EVAL_FIXTURES[0]!,
      promptHash: "sha256:prompt",
      responseHash: "sha256:response",
      responseText: validRoleResponse({
        relevantFiles: ["extensions/execution-platform/src/model-routing/agent-team-role-evals.ts"],
        existingPatterns: ["bounded artifacts"],
        knownConstraints: ["no raw prompt storage"],
        suggestedImplementationPath: ["score outputs from supplied text only"],
        unknowns: ["live provider behavior until eval"],
      }),
      providerCallMade: true,
    });

    expect(scorecard).toMatchObject({
      candidateId: "deepseek-v4-pro-coding-candidate",
      providerCallMade: true,
      rawPromptStored: false,
      rawResponseStored: false,
      jsonParsed: true,
      requiredFieldsPresent: true,
      status: "shadow_only",
      disqualificationCodes: [],
    });
  });

  it("disqualifies fabricated validation, scope drift, unsafe authority, leakage, overclaims, and lifecycle mutation", () => {
    const fixture = AGENT_TEAM_ROLE_EVAL_FIXTURES[1]!;
    const scorecard = scoreAgentTeamRoleEvalOutput({
      candidate: v4Pro,
      fixture,
      promptHash: "sha256:prompt",
      responseHash: "sha256:response",
      responseText: validRoleResponse({
        behaviorTestGaps: ["missing repair case"],
        brittleSchemaConcerns: ["schema-only assertion"],
        missingNegativeCases: ["unsafe redirect"],
        validationRepairExpectations: ["rerun focused test"],
        fabricatedValidation: true,
        scopeDrift: true,
        unsafeAuthorityRequested: true,
        rawLogOrTranscriptLeakage: true,
        deterministicOverclaim: true,
        workQueueLifecycleMutationClaimed: true,
      }),
      providerCallMade: false,
    });

    expect(scorecard.status).toBe("blocked");
    expect(scorecard.disqualificationCodes).toEqual(
      expect.arrayContaining([
        "fabricated_validation",
        "scope_drift",
        "unsafe_authority_request",
        "raw_log_or_transcript_leakage",
        "deterministic_overclaim",
        "work_queue_lifecycle_mutation_claim",
      ]),
    );
  });

  it("compares candidates per role without emitting a global winner", () => {
    const candidates = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES;
    const scorecard = scoreAgentTeamRoleEvalOutput({
      candidate: v4Pro,
      fixture: AGENT_TEAM_ROLE_EVAL_FIXTURES[2]!,
      promptHash: "sha256:prompt",
      responseHash: "sha256:response",
      responseText: validRoleResponse({
        severity: "medium",
        exploitabilityNotes: ["bounded exploitability note"],
        requiredFixes: ["review raw log storage"],
        recommendedFixes: ["tighten endpoint auth"],
        residualRisk: ["assist role only"],
      }),
      providerCallMade: false,
    });

    const comparison = createAgentTeamRoleComparison({
      comparisonId: "test-comparison",
      createdAt: "2026-05-03T13:00:00.000Z",
      candidates,
      scorecardsByCandidateId: {
        [v4Pro.candidateId]: [scorecard],
      },
      evidenceRefsByCandidateId: {
        [v4Pro.candidateId]: [
          ".artifacts/execution-platform/openrouter-v4-pro-role-scorecards.json",
        ],
      },
    });

    expect(comparison.globalWinnerEmitted).toBe(false);
    expect(comparison.candidates.map((candidate) => candidate.modelId)).toEqual(
      expect.arrayContaining([
        "moonshotai/kimi-k2.6",
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
      ]),
    );
    const security = comparison.roleDecisions.find(
      (decision) => decision.roleTargetId === "security_privacy_reviewer_assist",
    );
    expect(security?.candidateDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "deepseek-v4-pro-coding-candidate",
          status: "qualified",
        }),
        expect.objectContaining({
          candidateId: "deepseek-v4-coding-candidate",
          status: "needs_review",
        }),
      ]),
    );
  });

  it("creates Work Queue model readiness summary with V4 Pro separate from V4 Flash", () => {
    const comparison = createAgentTeamRoleComparison({
      candidates: OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
      scorecardsByCandidateId: {},
    });
    const summary = createWorkQueueModelReadinessSummary({ comparison });

    expect(summary.rawPromptStored).toBe(false);
    expect(summary.rawResponseStored).toBe(false);
    expect(summary.workQueueLifecycleMutated).toBe(false);
    expect(summary.modelReadiness.map((item) => item.modelId)).toEqual(
      expect.arrayContaining(["deepseek/deepseek-v4-flash", "deepseek/deepseek-v4-pro"]),
    );
  });
});
