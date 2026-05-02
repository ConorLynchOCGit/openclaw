import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import {
  buildModelAuthoredProactivityBriefInput,
  buildModelAuthoredUserFacingProactivityBrief,
} from "./phase2-model-authored-proactivity-briefs.ts";
import type { Phase2SkillCandidateRecord } from "./phase2-skill-candidate-ledger.ts";
import { buildUserFacingProactivityBrief } from "./phase2-user-facing-proactivity-briefs.ts";

function skillCandidate(
  overrides: Partial<Phase2SkillCandidateRecord> = {},
): Phase2SkillCandidateRecord {
  return {
    skillCandidateId: "skill-candidate-test",
    proactivityOpportunityId: "opportunity-test",
    normalizedIntentKey: "skillifier draft package strategy",
    sourceRuntime: "openclaw_session",
    candidateType: "repeated_work_pattern",
    evidenceSummary: "Repeated bounded Skillifier draft-package decisions.",
    recurrenceCount: 2,
    recurrenceWindow: {
      firstSeenAt: "2026-04-28T00:00:00.000Z",
      lastSeenAt: "2026-04-28T00:10:00.000Z",
    },
    exampleHashes: ["hash-example"],
    suggestedSkillName: "skillifier-draft-package-strategy",
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

function jsonOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "model_authored_proactivity_brief_output.v1",
    decision: "surface",
    kindCode: "follow_up",
    titleWords: ["Skill", "draft", "packaging", "strategy"],
    oneLinePurposeWords: [
      "Decide",
      "whether",
      "future",
      "Skillifier",
      "drafts",
      "stay",
      "instruction-only",
      "or",
      "include",
      "helper",
      "scripts",
    ],
    recommendedNextStepWords: [
      "Choose",
      "the",
      "default",
      "package",
      "shape",
      "before",
      "drafting",
      "the",
      "next",
      "skill",
    ],
    primaryActionLabelWords: ["Plan", "next", "step"],
    statusLabelWords: null,
    detailSummaryWords: null,
    hiddenDiagnostics: { whyDemotedOrRepairedWords: null, limitations: [] },
    qualityReasons: [],
    ...overrides,
  });
}

class FakeExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  constructor(private readonly outputText: string) {}

  async execute(request: JsonModelExecutionRequest) {
    this.requests.push(request);
    return {
      outputText: this.outputText,
      resolvedModelId: "openai-codex/gpt-5.4",
      usage: { promptTokens: 100, outputTokens: 80 },
    };
  }
}

function deterministicBriefInput() {
  return {
    opportunityClass: "followup" as const,
    title: "It sets the default packaging strategy for every future",
    whyNow: "A bounded Skillifier package strategy decision is still unresolved.",
    proposedNextStep: "It sets the default packaging strategy for every future draft.",
    expectedUserValue: "Clarifies the package default before future Skillifier draft work repeats.",
    evidenceSummary: "Bounded draft-package planning evidence.",
    confidence: "medium" as const,
    sourceRefs: ["chat://main/assistant_turn/msg-fragment"],
  };
}

describe("phase2 model-authored proactivity briefs", () => {
  it("uses strict model JSON to rewrite clipped source fragments into clear cards", async () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);
    const executor = new FakeExecutor(jsonOutput());

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: true, executor, modelId: "openai-codex/gpt-5.4" },
    );

    expect(result.source).toBe("model");
    expect(result.brief.authorship?.source).toBe("model");
    expect(result.brief.authorship?.modelId).toBe("openai-codex/gpt-5.4");
    expect(result.brief.title).toBe("Skill draft packaging strategy");
    expect(result.brief.oneLinePurpose).toContain("instruction-only");
    expect(result.brief.recommendedNextStep).toContain("Choose the default package shape");
    expect(
      `${result.brief.title}\n${result.brief.oneLinePurpose}\n${result.brief.recommendedNextStep}`,
    ).not.toMatch(/Turns a recent idea|Already recurring|It sets the default/i);
    expect(executor.requests[0]?.responseOptions?.transport?.type).toBe("json_schema");
    expect(executor.requests[0]?.responseOptions?.reasoningEffort).toBe("medium");
    expect(executor.requests[0]?.responseOptions?.verbosity).toBe("low");
  });

  it("bounds long model-authored next steps at word boundaries", async () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);
    const executor = new FakeExecutor(
      jsonOutput({
        kindCode: "proactive_plan",
        titleWords: ["Memory", "validation", "matrix"],
        recommendedNextStepWords: [
          "Create",
          "a",
          "pre-wiring",
          "validation",
          "pass",
          "covering",
          "ordinary",
          "turns",
          "long",
          "prompts",
          "document",
          "ingestion",
          "daily",
          "summaries",
          "corrections",
          "reconciliation",
          "collision",
          "adjudication",
          "retrieval",
          "inclusion",
          "and",
          "proactivity",
          "compatibility",
        ],
      }),
    );

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: true, executor, modelId: "openai-codex/gpt-5.4" },
    );

    expect(result.brief.recommendedNextStep).not.toMatch(
      /\b(?:proacti|compatibilit|reconciliatio|adjudicatio)\.$/u,
    );
    expect(result.brief.recommendedNextStep).not.toContain("proacti.");
    expect(result.brief.recommendedNextStep.endsWith(".")).toBe(true);
  });

  it("demotes model output with generic filler purpose", async () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);
    const executor = new FakeExecutor(
      jsonOutput({
        titleWords: ["Skillifier", "draft", "follow-up"],
        oneLinePurposeWords: [
          "Turns",
          "a",
          "recent",
          "idea",
          "into",
          "a",
          "bounded",
          "next",
          "step",
          "you",
          "can",
          "review",
          "without",
          "digging",
          "through",
          "the",
          "inbox",
        ],
        recommendedNextStepWords: ["Review", "the", "draft", "packaging", "decision"],
      }),
    );

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: true, executor },
    );

    expect(result.source).toBe("demoted");
    expect(result.brief.quality.status).toBe("demote");
    expect(result.brief.quality.reasons).toContain("purpose_is_generic_fallback");
  });

  it("demotes model output when the next step repeats the title", async () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);
    const executor = new FakeExecutor(
      jsonOutput({
        titleWords: ["Build", "the", "bounded", "request", "with"],
        oneLinePurposeWords: [
          "Clarify",
          "the",
          "Skillifier",
          "package",
          "request",
          "before",
          "drafting",
        ],
        recommendedNextStepWords: ["Build", "the", "bounded", "request", "with"],
      }),
    );

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: true, executor },
    );

    expect(result.brief.quality.status).toBe("demote");
    expect(result.brief.quality.reasons).toEqual(
      expect.arrayContaining(["title_is_clipped_source_fragment", "next_step_repeats_title"]),
    );
  });

  it("demotes slug-like model-authored titles with hyphenated card copy", async () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);
    const executor = new FakeExecutor(
      jsonOutput({
        kindCode: "new_skill",
        titleWords: ["candidate-discovery-qa-gate"],
        oneLinePurposeWords: [
          "Define",
          "a",
          "release",
          "check",
          "for",
          "candidate",
          "review",
          "quality",
        ],
        recommendedNextStepWords: ["Draft", "the", "review", "gate", "checklist"],
      }),
    );

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: true, executor },
    );

    expect(result.brief.quality.status).toBe("demote");
    expect(result.brief.quality.reasons).toContain("title_is_slug_like");
  });

  it("demotes weak deterministic fallback when the model is unavailable", async () => {
    const input = {
      ...deterministicBriefInput(),
      title: "Already recurring",
      proposedNextStep:
        "Already recurring: multiple draft artifacts cluster around the same idea:.",
      expectedUserValue: undefined,
    };
    const deterministicBrief = buildUserFacingProactivityBrief(input);

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: false, executor: null },
    );

    expect(result.source).toBe("demoted");
    expect(result.brief.quality.status).toBe("demote");
    expect(result.report.rawResponsePersisted).toBe(false);
    expect(result.report.promptPersisted).toBe(false);
  });

  it("demotes deterministic fallback even when deterministic copy passes validators", async () => {
    const input = {
      opportunityClass: "skill_candidate" as const,
      title: "Review web research routing as a reusable skill",
      proposedNextStep: "Draft the skill contract and routing checks.",
      expectedUserValue: "Choose the correct retrieval lane before external-web research starts.",
      evidenceSummary: "Repeated bounded research-routing work.",
      confidence: "high" as const,
      skillCandidate: skillCandidate({
        normalizedIntentKey: "web research routing retrieval lane decision",
        suggestedSkillName: "web-research-routing",
        evidenceSummary: "Repeated bounded research-routing work.",
      }),
      sourceRefs: ["chat://main/assistant_turn/msg-web-research"],
    };
    const deterministicBrief = buildUserFacingProactivityBrief(input);

    const result = await buildModelAuthoredUserFacingProactivityBrief(
      { briefInput: input, deterministicBrief, opportunityId: "opportunity-test" },
      { enabled: false, executor: null },
    );

    expect(result.source).toBe("demoted");
    expect(result.brief.quality.status).toBe("demote");
    expect(result.brief.quality.reasons).toContain("model_authored_visible_copy_required");
    expect(result.report.decision).toBe("demote");
  });

  it("builds bounded model input without raw prompt, transcript, or tool-log fields", () => {
    const input = deterministicBriefInput();
    const deterministicBrief = buildUserFacingProactivityBrief(input);

    const modelInput = buildModelAuthoredProactivityBriefInput({
      briefInput: input,
      deterministicBrief,
      opportunityId: "opportunity-test",
      queueItemId: "queue-test",
    });
    const serialized = JSON.stringify(modelInput);

    expect(serialized).not.toMatch(/rawPrompt|raw prompt|full transcript|raw tool log|secret/i);
    expect(serialized.length).toBeLessThan(2500);
    expect(modelInput.safetyInstructions.presentationOnly).toBe(true);
    expect(modelInput.safetyInstructions.doNotMutateCanonicalState).toBe(true);
  });
});
