import { describe, expect, it } from "vitest";
import {
  createFirstAgentTeamImplementationPlan,
  validateAgentTeamImplementationPlan,
} from "./agent-team-plan.ts";
import { createTrustedLocalYoloProfile } from "./trusted-local-yolo-profile.ts";

describe("agent-team implementation planning", () => {
  it("creates a planning-only first agent-team implementation plan", () => {
    const plan = createFirstAgentTeamImplementationPlan({
      planId: "test-agent-team-plan",
      createdAt: "2026-05-03T12:00:00.000Z",
    });
    const validation = validateAgentTeamImplementationPlan(plan);

    expect(plan).toMatchObject({
      artifactKind: "codex_bridge_agent_team_implementation_plan",
      planMode: "planning_only",
      allowedToPlanFirstAgentTeamImplementation: true,
      allowedToRunFirstAgentTeamImplementation: false,
      noLiveFlags: {
        codexCliInvoked: false,
        acpSessionStarted: false,
        providerCallMade: false,
        workQueueLifecycleMutated: false,
      },
    });
    expect(validation.validForPlanning).toBe(true);
    expect(validation.allowedToRunFirstAgentTeamImplementation).toBe(false);
  });

  it("assigns Kimi 2.6, DeepSeek V4 Flash, and DeepSeek V4 Pro only as evidence-gated team roles", () => {
    const plan = createFirstAgentTeamImplementationPlan();

    expect(plan.modelAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleId: "implementation_engineer",
          provider: "openrouter",
          modelId: "moonshotai/kimi-k2.6",
          liveAuthorityGrantedNow: false,
        }),
        expect.objectContaining({
          roleId: "test_engineer",
          provider: "openrouter",
          modelId: "deepseek/deepseek-v4-flash",
          liveAuthorityGrantedNow: false,
        }),
        expect.objectContaining({
          roleId: "context_scout",
          provider: "openrouter",
          modelId: "deepseek/deepseek-v4-pro",
          roleTargetId: "context_scout",
          roleQualificationStatus: "needs_review",
          liveAuthorityGrantedNow: false,
        }),
      ]),
    );
    for (const assignment of plan.modelAssignments) {
      expect(assignment.evidenceRefs.length).toBeGreaterThan(0);
      expect(assignment.liveAuthorityGrantedNow).toBe(false);
    }
  });

  it("requires role coverage for orchestration, research, implementation, testing, review, security, guardrail, and observability", () => {
    const plan = createFirstAgentTeamImplementationPlan();
    const roleIds = plan.roles.map((role) => role.roleId);

    expect(roleIds).toEqual(
      expect.arrayContaining([
        "orchestrator",
        "context_scout",
        "implementation_engineer",
        "test_engineer",
        "reviewer",
        "security_privacy_reviewer",
        "refactor_engineer",
        "devops_release_sre",
        "guardrail_auditor",
        "observability_scribe",
      ]),
    );
    expect(plan.roles.find((role) => role.roleId === "orchestrator")).toMatchObject({
      mayAcceptWork: true,
      mayEditRepo: false,
    });
    expect(plan.roles.find((role) => role.roleId === "refactor_engineer")).toMatchObject({
      activation: "conditional",
      mayEditRepo: true,
    });
  });

  it("uses bounded handoff rules that reject raw transcripts and provider prompts", () => {
    const plan = createFirstAgentTeamImplementationPlan();

    expect(plan.handoffRules.length).toBeGreaterThanOrEqual(4);
    for (const rule of plan.handoffRules) {
      expect(rule.boundedContextOnly).toBe(true);
      expect(rule.rawTranscriptAllowed).toBe(false);
      expect(rule.rawProviderPromptAllowed).toBe(false);
      expect(rule.privateReasoningAllowed).toBe(false);
      expect(rule.requiredPayloadFields.length).toBeGreaterThan(0);
    }
  });

  it("blocks planning when model validation evidence is missing", () => {
    const plan = createFirstAgentTeamImplementationPlan({ modelValidationEvidenceRefs: [] });
    const validation = validateAgentTeamImplementationPlan(plan);

    expect(plan.allowedToPlanFirstAgentTeamImplementation).toBe(false);
    expect(validation.validForPlanning).toBe(false);
    expect(validation.blockingReasons).toContain("model_validation_evidence_refs_required");
  });

  it("blocks planning when runtime evidence is missing", () => {
    const plan = createFirstAgentTeamImplementationPlan({ runtimeEvidenceRefs: [] });
    const validation = validateAgentTeamImplementationPlan(plan);

    expect(plan.allowedToPlanFirstAgentTeamImplementation).toBe(false);
    expect(validation.validForPlanning).toBe(false);
    expect(validation.blockingReasons).toContain("runtime_evidence_refs_required");
  });

  it("keeps high-blast-radius authority out of the first team planning slice", () => {
    const plan = createFirstAgentTeamImplementationPlan({
      authorityProfile: createTrustedLocalYoloProfile({
        acpAllowed: true,
        installsAllowed: false,
        dependencyChangesAllowed: false,
      }),
    });

    expect(plan.authorityPlan).toMatchObject({
      highBlastRadiusAuthoritiesGrantedNow: false,
      deployAllowed: false,
      outboundSendingAllowed: false,
      modelPromotionAllowed: false,
      workQueueLifecycleMutationAllowed: false,
      durableControlsRequired: true,
      closeoutRequired: true,
    });
    expect(validateAgentTeamImplementationPlan(plan).validForPlanning).toBe(true);
  });

  it("records research source metadata that informed the rubric", () => {
    const plan = createFirstAgentTeamImplementationPlan();
    const sourceIds = plan.researchSources.map((source) => source.sourceId);

    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "openai-agents-orchestration",
        "openai-agents-guardrails",
        "anthropic-multi-agent-research",
        "google-adk-multi-agent",
        "owasp-multi-agent-threat-modeling",
        "openrouter-models-api",
      ]),
    );
    for (const source of plan.researchSources) {
      expect(source.url).toMatch(/^https:\/\//u);
      expect(source.findingApplied).not.toEqual("");
    }
  });

  it("requires closeout, review, stream, heartbeat, and validation evidence", () => {
    const plan = createFirstAgentTeamImplementationPlan();

    expect(plan.closeoutRequirements).toMatchObject({
      workEpisodeOutcomePackRequired: true,
      bridgeResultReviewRequired: true,
      validationEvidenceRequired: true,
      streamEvidenceRequired: true,
      heartbeatEvidenceRequired: true,
      noRawTranscriptPromptOrLogStorage: true,
    });
    expect(plan.successCriteria).toEqual(
      expect.arrayContaining([
        "review artifact separates deterministic validation from qualitative judgment",
        "Work Episode Outcome Pack is emitted with artifact pointers and bounded summaries",
      ]),
    );
  });
});
