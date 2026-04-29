import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import {
  buildCandidateReviewPrefilterDecision,
  buildCandidateReviewPrefilterEvent,
  buildCandidateReviewTriggerPacket,
  buildProactivityReviewEpisodePacket,
  convertCandidateReviewProposalsToLedgerSources,
  evaluateCandidateReviewTrigger,
  loadCodexSessionActivityForCandidateReview,
  reviewEpisodeForCandidates,
  type CandidateReviewRecentActivity,
} from "./phase2-model-reviewed-candidate-discovery.ts";

class FakeExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  constructor(private readonly outputText: string) {}

  async execute(request: JsonModelExecutionRequest) {
    this.requests.push(request);
    return {
      outputText: this.outputText,
      resolvedModelId: request.contract.modelId,
      usage: { promptTokens: 100, outputTokens: 120 },
    };
  }
}

function recentDiscussionActivities(): CandidateReviewRecentActivity[] {
  return [
    {
      ref: "chat://main/user_turn/concern",
      role: "user",
      kind: "correction",
      boundedText:
        "Deterministic surfacing is a poor fit for subjective questions like what repeatable process could become a skill and what potential next step follows from current work.",
      sourceRuntime: "openclaw",
    },
    {
      ref: "chat://main/assistant_turn/architecture",
      role: "assistant",
      kind: "result_summary",
      boundedText:
        "A two-stage trigger system should use deterministic prefiltering, model trigger evaluation, bounded episode packets, model candidate review, and deterministic validation before ledger writes.",
      sourceRuntime: "openclaw",
    },
    {
      ref: "chat://main/user_turn/codex",
      role: "user",
      kind: "ask",
      boundedText:
        "OpenClaw should pull Codex session transcripts as bounded training fodder for skill and proactive plan candidates.",
      sourceRuntime: "openclaw",
    },
  ];
}

function triggerOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "candidate_review_trigger_decision.v1",
    shouldRun: true,
    reasonCodes: ["explicit_user_ask", "user_correction_or_critique", "related_turn_cluster"],
    confidence: "high",
    episodeWindow: {
      startRef: "chat://main/user_turn/concern",
      endRef: "chat://main/user_turn/codex",
      includedRefs: [
        "chat://main/user_turn/concern",
        "chat://main/assistant_turn/architecture",
        "chat://main/user_turn/codex",
      ],
    },
    reviewGoal: "both",
    whyWords: [
      "Recent",
      "work",
      "contains",
      "a",
      "clear",
      "skills",
      "and",
      "proactivity",
      "architecture",
      "decision",
    ],
    ...overrides,
  });
}

function proposalOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schemaVersion: "candidate_review_proposal.v1",
    proposals: [
      {
        proposalKind: "proactive_plan",
        titleWords: ["Verify", "model", "route", "isolation"],
        purposeWords: [
          "Prove",
          "chat",
          "memory",
          "candidate",
          "review",
          "and",
          "brief",
          "routes",
          "stay",
          "separate",
        ],
        recommendedNextStepWords: [
          "Add",
          "a",
          "route",
          "matrix",
          "proof",
          "before",
          "Milestone",
          "4",
        ],
        suggestedSkillNameWords: null,
        suggestedExistingSkillName: null,
        mergeTargetCandidateId: null,
        sourceRuntime: "openclaw",
        evidenceRefs: ["chat://main/user_turn/concern", "chat://main/assistant_turn/architecture"],
        recurrenceSignals: [
          "model route isolation came up during presentation and candidate-review design",
        ],
        frictionSignals: ["user worried one model schema change could break another route"],
        expectedUserValueWords: [
          "Prevents",
          "candidate",
          "review",
          "from",
          "breaking",
          "memory",
          "or",
          "chat",
          "routes",
        ],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: null,
      },
      {
        proposalKind: "new_skill_candidate",
        titleWords: ["OpenClaw", "model", "route", "verifier"],
        purposeWords: [
          "Check",
          "each",
          "OpenClaw",
          "model",
          "pathway",
          "uses",
          "the",
          "intended",
          "schema",
        ],
        recommendedNextStepWords: [
          "Draft",
          "the",
          "verification",
          "workflow",
          "and",
          "success",
          "checks",
        ],
        suggestedSkillNameWords: ["openclaw", "model", "route", "verifier"],
        suggestedExistingSkillName: null,
        mergeTargetCandidateId: null,
        sourceRuntime: "mixed",
        evidenceRefs: ["chat://main/user_turn/concern", "chat://main/user_turn/codex"],
        recurrenceSignals: ["route verification recurred across proactivity and skills work"],
        frictionSignals: ["model route confusion is high risk"],
        expectedUserValueWords: [
          "Makes",
          "model",
          "pathway",
          "checks",
          "repeatable",
          "before",
          "gateway",
          "changes",
        ],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: null,
      },
    ],
    ...overrides,
  });
}

describe("phase2 model-reviewed candidate discovery", () => {
  it("uses deterministic prefilter as a cheap over-inclusive gate", () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "agent:main:main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "The latest assistant final completed and has bounded recent context.",
      createdAt: "2026-04-28T20:00:00.000Z",
    });

    const decision = buildCandidateReviewPrefilterDecision({ event });

    expect(decision.shouldAskModel).toBe(true);
    expect(decision.episodeKey).toMatch(/^[a-f0-9]{24}$/u);
  });

  it("does not use content keywords as prefilter gates or hints", () => {
    const keywordHeavyEvent = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "agent:main:main",
      refs: ["chat://main/assistant_turn/one"],
      boundedSummary:
        "skill proactive candidate workflow recurring repeatable fix this next milestone",
      createdAt: "2026-04-28T20:01:00.000Z",
    });
    const keywordFreeEvent = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "agent:main:main",
      refs: ["chat://main/assistant_turn/two"],
      boundedSummary: "Here is the completed review with concrete next details.",
      createdAt: "2026-04-28T20:02:00.000Z",
    });

    const keywordHeavyDecision = buildCandidateReviewPrefilterDecision({
      event: keywordHeavyEvent,
    });
    const keywordFreeDecision = buildCandidateReviewPrefilterDecision({
      event: keywordFreeEvent,
    });

    expect(keywordHeavyDecision.reasonCodes).toEqual(["assistant_final_completed"]);
    expect(keywordFreeDecision.reasonCodes).toEqual(["assistant_final_completed"]);
  });

  it("builds a bounded trigger packet from recent user and assistant activity", () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });

    const packet = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
      recentCardSummaries: [
        {
          id: "card-1",
          kind: "skill_candidate",
          title: "New skill: unclear fragment",
          status: "blocked",
          quality: "demote",
        },
      ],
      recentActivitySignals: ["card_quality_failure"],
    });

    expect(packet.recentRefs).toHaveLength(3);
    expect(packet.recentRefs[0]?.boundedText).toContain("Deterministic surfacing");
    expect(JSON.stringify(packet)).not.toMatch(/raw-tool-log-marker|secret-marker/u);
  });

  it("accepts a model trigger decision only when refs and confidence are valid", async () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });
    const packet = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
    });
    const executor = new FakeExecutor(triggerOutput());

    const result = await evaluateCandidateReviewTrigger(packet, {
      enabled: true,
      executor,
      modelId: "openai-codex/gpt-5.4-mini",
    });

    expect(result.decision.shouldRun).toBe(true);
    expect(result.decision.reviewGoal).toBe("both");
    expect(result.report.source).toBe("model");
    expect(executor.requests[0]?.responseOptions?.transport?.type).toBe("json_schema");
    expect(executor.requests[0]?.responseOptions?.reasoningEffort).toBe("low");
  });

  it("rejects trigger output with invalid refs", async () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });
    const packet = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
    });
    const executor = new FakeExecutor(
      triggerOutput({
        episodeWindow: {
          startRef: "chat://main/user_turn/concern",
          endRef: "chat://main/unknown",
          includedRefs: ["chat://main/unknown"],
        },
      }),
    );

    const result = await evaluateCandidateReviewTrigger(packet, { enabled: true, executor });

    expect(result.decision.shouldRun).toBe(false);
    expect(result.report.validationStatus).toBe("reject");
    expect(result.report.reasonCodes).toContain("included_ref_not_allowed");
  });

  it("builds an episode packet that preserves narrative context without raw transcript storage", () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });
    const packet = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket: packet,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["explicit_user_ask", "user_correction_or_critique"],
        confidence: "high",
        episodeWindow: {
          startRef: "chat://main/user_turn/concern",
          endRef: "chat://main/user_turn/codex",
          includedRefs: packet.recentRefs.map((entry) => entry.ref),
        },
        reviewGoal: "both",
        why: "The recent discussion contains a clear candidate discovery architecture decision.",
      },
      recentActivities: recentDiscussionActivities(),
      loadedSkills: [{ name: "skill-vetter", description: "Vet third-party skills." }],
      recentCandidateIds: ["candidate-1"],
      possibleDuplicateTitles: ["OpenClaw model route verifier"],
      rejectedOrDemotedSummary: ["demoted malformed reverse prompt"],
    });

    expect(episode.boundedTurnExcerpts).toHaveLength(3);
    expect(episode.userIntentArc.recentConcerns[0]).toContain("Deterministic surfacing");
    expect(episode.existingContext.loadedSkills[0]?.name).toBe("skill-vetter");
    expect(JSON.stringify(episode)).not.toMatch(/raw-transcript-marker|raw-tool-log-marker/u);
  });

  it("reviews an episode into proactive and skill proposals", async () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["explicit_user_ask"],
        confidence: "high",
        episodeWindow: {
          startRef: "chat://main/user_turn/concern",
          endRef: "chat://main/user_turn/codex",
          includedRefs: triggerPacket.recentRefs.map((entry) => entry.ref),
        },
        reviewGoal: "both",
        why: "Review requested.",
      },
      recentActivities: recentDiscussionActivities(),
    });
    const executor = new FakeExecutor(proposalOutput());

    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor,
      modelId: "openai-codex/gpt-5.4",
    });

    expect(result.proposals).toHaveLength(2);
    expect(result.proposals.map((proposal) => proposal.title)).toEqual(
      expect.arrayContaining(["Verify model route isolation", "OpenClaw model route verifier"]),
    );
    expect(result.report.source).toBe("model");
    expect(executor.requests[0]?.responseOptions?.reasoningEffort).toBe("medium");
  });

  it("converts valid proposals into existing proactivity ledger sources", async () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/user_turn/concern"],
      boundedSummary: "Review recurring skills and proactive plans.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: recentDiscussionActivities(),
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["explicit_user_ask"],
        confidence: "high",
        episodeWindow: {
          startRef: "chat://main/user_turn/concern",
          endRef: "chat://main/user_turn/codex",
          includedRefs: triggerPacket.recentRefs.map((entry) => entry.ref),
        },
        reviewGoal: "both",
        why: "Review requested.",
      },
      recentActivities: recentDiscussionActivities(),
    });
    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor: new FakeExecutor(proposalOutput()),
    });

    const converted = convertCandidateReviewProposalsToLedgerSources({
      proposals: result.proposals,
      projectId: "openclaw",
      sessionKey: "main",
      generatedAt: "2026-04-28T20:00:00.000Z",
    });

    expect(converted.skillCandidates).toHaveLength(1);
    expect(converted.opportunities).toHaveLength(2);
    expect(
      converted.opportunities.some((source) => source.sourceFamily === "skill_candidate"),
    ).toBe(true);
    expect(
      converted.opportunities.some((source) => source.sourceFamily === "pattern_or_followup"),
    ).toBe(true);
  });

  it("reads Codex session activity as bounded summaries from fixture files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-"));
    const sessions = path.join(root, "sessions", "2026");
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, "session.jsonl"),
      [
        JSON.stringify({
          role: "user",
          text: "Run the same validation lane again and turn it into a reusable skill.",
        }),
        JSON.stringify({
          role: "assistant",
          text: "Validation failed because the gateway route used the wrong model schema.",
        }),
        JSON.stringify({
          role: "tool",
          command: "pnpm test:file extensions/model-memory/src/runtime/test.ts",
          status: "failed",
          output: "raw-tool-log-marker should not persist",
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await loadCodexSessionActivityForCandidateReview({
      codexHome: root,
      maxFiles: 4,
      maxEntries: 8,
    });

    expect(result.report.status).toBe("loaded");
    expect(result.activities.length).toBeGreaterThanOrEqual(2);
    expect(result.activities.some((activity) => activity.ref.startsWith("codex://"))).toBe(true);
    expect(JSON.stringify(result.activities)).not.toMatch(/raw-tool-log-marker/u);
  });
});
