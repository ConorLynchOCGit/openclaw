import { describe, expect, it } from "vitest";
import type { Phase2UserFacingProactivityBrief } from "./phase2-user-facing-proactivity-briefs.ts";
import { validateUserFacingProactivityBrief } from "./phase2-user-facing-proactivity-briefs.ts";

function brief(
  overrides: Partial<Phase2UserFacingProactivityBrief> = {},
): Phase2UserFacingProactivityBrief {
  return {
    title: "Skill draft packaging strategy",
    kindLabel: "Proactive plan",
    oneLinePurpose:
      "Decide whether future Skillifier drafts stay instruction-only or include helper scripts.",
    recommendedNextStep: "Choose the default package shape before drafting the next skill.",
    primaryActionLabel: "Plan next step",
    hiddenDiagnostics: {
      provenanceRefs: ["chat://main/assistant_turn/msg-skill"],
      limitations: [],
    },
    quality: { status: "pass", reasons: [] },
    authorship: { source: "model", modelId: "openai-codex/gpt-5.4" },
    ...overrides,
  };
}

describe("phase2 user-facing proactivity brief validation", () => {
  it("rejects noisy skill transformation copy instead of preserving deterministic rewrites", () => {
    const validation = validateUserFacingProactivityBrief(
      brief({
        title: "Turn First bounded draft package should include only what is into a reusable skill",
        kindLabel: "New skill",
        oneLinePurpose:
          "Skill worth creating: Plan a bounded first-bounded-draft-package skill candidate.",
        recommendedNextStep:
          "Turn Turn First bounded draft package should include only what is into a short bounded plan.",
      }),
    );

    expect(validation.status).toBe("demote");
    expect(validation.reasons).toEqual(
      expect.arrayContaining([
        "title_derived_from_transformation_instruction",
        "title_contains_duplicated_turn",
      ]),
    );
  });

  it("accepts concise model-authored skill enhancement copy", () => {
    const validation = validateUserFacingProactivityBrief(
      brief({
        title: "Improve skill: skill-vetting",
        kindLabel: "Improve skill",
        oneLinePurpose:
          "Add a repeatable ClawHub quarantine and review workflow to the existing skill-vetting path.",
        recommendedNextStep: "Draft the enhancement checklist and acceptance tests.",
        skillPresentationKind: "existing_skill_enhancement",
      }),
    );

    expect(validation).toEqual({ status: "pass", reasons: [] });
  });

  it("accepts create and run as actionable model-authored next-step verbs", () => {
    const validation = validateUserFacingProactivityBrief(
      brief({
        title: "Gateway readiness proof matrix",
        kindLabel: "Proactive plan",
        oneLinePurpose:
          "Validate model-memory lanes before gateway wiring to catch regressions early.",
        recommendedNextStep: "Create and run a proof matrix for every lane before gateway wiring.",
      }),
    );

    expect(validation).toEqual({ status: "pass", reasons: [] });
  });

  it("demotes malformed reverse prompts instead of surfacing fallback grammar", () => {
    const validation = validateUserFacingProactivityBrief(
      brief({
        title:
          "Question worth asking before current skillifier outputs already include multiple draft artifact.",
        kindLabel: "Question",
        oneLinePurpose: "Clarify the missing constraint.",
        recommendedNextStep:
          'If useful, turn that missing context into a bounded checklist for "Current Skillifier outputs already include multiple draft artifacts centered".',
      }),
    );

    expect(validation.status).toBe("demote");
    expect(validation.reasons).toEqual(
      expect.arrayContaining([
        "reverse_prompt_fallback_title",
        "reverse_prompt_title_not_complete_question",
      ]),
    );
  });

  it("surfaces reverse prompts only when the title is a complete question", () => {
    const validation = validateUserFacingProactivityBrief(
      brief({
        title: "Question: Should Skillifier drafts include helper scripts yet?",
        kindLabel: "Question",
        oneLinePurpose:
          "Decide whether first draft packages stay instruction-only or include deterministic helpers.",
        recommendedNextStep: "Draft the acceptance boundary for helper scripts.",
      }),
    );

    expect(validation).toEqual({ status: "pass", reasons: [] });
  });
});
