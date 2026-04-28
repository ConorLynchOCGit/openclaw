import { describe, expect, it } from "vitest";
import type { Phase2SkillCandidateRecord } from "./phase2-skill-candidate-ledger.ts";
import { buildUserFacingProactivityBrief } from "./phase2-user-facing-proactivity-briefs.ts";

function skillCandidate(
  overrides: Partial<Phase2SkillCandidateRecord> = {},
): Phase2SkillCandidateRecord {
  return {
    skillCandidateId: "skill-candidate-test",
    proactivityOpportunityId: "opportunity-test",
    normalizedIntentKey: "web research routing retrieval lane decision",
    sourceRuntime: "openclaw_session",
    candidateType: "repeated_work_pattern",
    evidenceSummary: "Repeated bounded work showed the retrieval lane must be chosen first.",
    recurrenceCount: 2,
    recurrenceWindow: {
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:10:00.000Z",
    },
    exampleHashes: ["hash-example"],
    suggestedSkillName: "web-research-routing",
    riskTier: "low",
    autonomyLevelCeiling: 1,
    lifecycleStatus: "detected",
    installTargets: ["workspace_skills_dir"],
    evalStatus: "not_started",
    vettingStatus: "not_started",
    canaryStatus: "not_started",
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:10:00.000Z",
    provenanceRefs: ["chat://main/assistant_turn/msg-skill"],
    rollbackPlan: {
      rollbackId: "rollback-test",
      strategy: "disable_candidate_only",
      targetPaths: ["workspace_skills_dir"],
      directMainMutationAllowed: false,
    },
    sourceProfileIds: ["cited_assistant_answer"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["content-hash"],
    proofHashes: ["proof-hash"],
    noDarkDataStatus: "pass",
    ...overrides,
  };
}

describe("phase2 user-facing proactivity briefs", () => {
  it("rewrites noisy skill transformation titles into capability-intent briefs", () => {
    const brief = buildUserFacingProactivityBrief({
      opportunityClass: "skill_candidate",
      title: "Turn First bounded draft package should include only what is into a reusable skill",
      whyNow:
        "The user explicitly asked for skill-oriented reuse and recent OpenClaw work produced a bounded example.",
      proposedNextStep:
        "Turn Turn First bounded draft package should include only what is into a short bounded plan.",
      expectedUserValue: "Reduce repeated Skillifier draft-scoping work.",
      evidenceSummary: "Bounded skillifier draft evidence.",
      skillCandidate: skillCandidate({
        normalizedIntentKey: "first bounded draft package should include only what is",
        suggestedSkillName: "first bounded draft package should include only what is",
        evidenceSummary: "Repeated bounded draft package scoping work.",
      }),
      sourceRefs: ["chat://main/assistant_turn/msg-bad-skill-card"],
    });

    expect(brief.quality.status).toBe("pass");
    expect(brief.title).toBe("New skill: draft-skill-package-checklist");
    expect(brief.oneLinePurpose).toContain("first bounded Skillifier draft package");
    expect(brief.recommendedNextStep).toContain("Draft the skill contract");
    expect(`${brief.title}\n${brief.oneLinePurpose}\n${brief.recommendedNextStep}`).not.toMatch(
      /Why now|Skill worth creating|Turn Turn/i,
    );
    expect(brief.hiddenDiagnostics.whyNow).toContain("skill-oriented reuse");
    expect(brief.hiddenDiagnostics.limitations).toContain(
      "source_title_was_transformation_instruction",
    );
  });

  it("uses explicit skill inventory matches for existing-skill enhancements", () => {
    const brief = buildUserFacingProactivityBrief({
      opportunityClass: "skill_candidate",
      title: "Turn third-party skill vetting into a reusable skill",
      proposedNextStep: "Draft the enhancement checklist and acceptance tests.",
      expectedUserValue: "Reduce repeated ClawHub review work.",
      evidenceSummary: "Repeated skill-vetting work.",
      skillCandidate: skillCandidate({
        normalizedIntentKey: "skill vetting third party ClawHub quarantine review",
        suggestedSkillName: "skill-vetting-clawhub-review",
        suggestedExistingSkillName: "skill-vetting",
        evidenceSummary: "Repeated ClawHub quarantine and review workflow.",
      }),
      existingSkills: [{ name: "skill-vetting", description: "Review external AI skills." }],
      sourceRefs: ["chat://main/assistant_turn/msg-skill-vetting"],
    });

    expect(brief.kindLabel).toBe("Improve skill");
    expect(brief.skillPresentationKind).toBe("existing_skill_enhancement");
    expect(brief.title).toBe("Improve skill: skill-vetting");
    expect(brief.oneLinePurpose).toContain("existing skill-vetting path");
  });

  it("demotes malformed reverse prompts instead of surfacing fallback grammar", () => {
    const brief = buildUserFacingProactivityBrief({
      opportunityClass: "reverse_prompt",
      title:
        "Question worth asking before current skillifier outputs already include multiple draft artifact.",
      whyNow:
        'Recent work already surfaced "Current Skillifier outputs already include multiple draft artifacts centered" as an active thread.',
      proposedNextStep:
        'If useful, turn that missing context into a bounded checklist for "Current Skillifier outputs already include multiple draft artifacts centered".',
      expectedUserValue: "Clarify the missing constraint.",
      sourceRefs: ["chat://main/assistant_turn/msg-bad-question"],
    });

    expect(brief.quality.status).toBe("demote");
    expect(brief.quality.reasons).toEqual(
      expect.arrayContaining([
        "reverse_prompt_fallback_title",
        "reverse_prompt_title_not_complete_question",
      ]),
    );
  });

  it("surfaces reverse prompts only when the title is a complete useful question", () => {
    const brief = buildUserFacingProactivityBrief({
      opportunityClass: "reverse_prompt",
      title: "Should Skillifier drafts include helper scripts yet?",
      whyNow: "The first draft shape is blocked on the script boundary.",
      proposedNextStep: "Draft the acceptance boundary for helper scripts.",
      expectedUserValue:
        "Decide whether first draft packages stay instruction-only or include deterministic helpers.",
      sourceRefs: ["chat://main/assistant_turn/msg-good-question"],
    });

    expect(brief.quality.status).toBe("pass");
    expect(brief.title).toBe("Question: Should Skillifier drafts include helper scripts yet?");
    expect(brief.oneLinePurpose).toContain("instruction-only");
    expect(brief.recommendedNextStep).toBe("Draft the acceptance boundary for helper scripts.");
  });
});
