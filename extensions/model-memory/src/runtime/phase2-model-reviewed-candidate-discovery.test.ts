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
  buildProactivityReviewEpisodePacketFromOutcomePack,
  convertCandidateReviewProposalsToLedgerSources,
  evaluateCandidateReviewTrigger,
  loadCodexSessionActivityForCandidateReview,
  reviewEpisodeForCandidates,
  writeProactivityReviewEpisodePacketArtifact,
  type CandidateReviewRecentActivity,
} from "./phase2-model-reviewed-candidate-discovery.ts";
import { createPhase2SkillifierDraft } from "./phase2-skillifier-draft.ts";
import { buildWorkEpisodeOutcomePack } from "./phase2-work-episode-outcome-pack.ts";

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
    schemaVersion: "candidate_review_proposal.v2",
    proposals: [
      {
        proposalKind: "proactive_plan",
        title: "Verify model route isolation",
        purpose:
          "Prove chat, memory, candidate review, and brief routes stay separate before the next eval milestone.",
        recommendedNextStep:
          "Add a route matrix proof covering model id, reasoning effort, schema, and persistence boundary.",
        expectedUserValue:
          "Prevents candidate review changes from breaking memory capture, retrieval, or default chat behavior.",
        leverageClass: "stability_risk",
        whyHighImpact:
          "Model-route confusion can break multiple runtime pathways and would be expensive to debug after Milestone 4.",
        whyNotSmallCleanup:
          "This is a cross-route stability proof, not a local wording or formatting cleanup.",
        suggestedSkillName: null,
        suggestedExistingSkillName: null,
        mergeTargetCandidateId: null,
        sourceRuntime: "openclaw",
        evidenceRefs: ["chat://main/user_turn/concern", "chat://main/assistant_turn/architecture"],
        recurrenceSignals: [
          "model route isolation came up during presentation and candidate-review design",
        ],
        frictionSignals: ["user worried one model schema change could break another route"],
        confidence: "high",
        riskTier: "low",
        shouldSurface: true,
        demotionReason: null,
      },
      {
        proposalKind: "new_skill_candidate",
        title: "OpenClaw model route verifier",
        purpose:
          "Check each OpenClaw model pathway uses the intended model, schema, reasoning level, and persistence boundary.",
        recommendedNextStep:
          "Draft the verification workflow and success checks for chat, memory, candidate review, and presentation routes.",
        expectedUserValue:
          "Makes model pathway checks repeatable before gateway or proactivity changes.",
        leverageClass: "workflow_acceleration",
        whyHighImpact:
          "The same route-isolation concern recurs across proactivity, memory, and Codex compatibility work.",
        whyNotSmallCleanup:
          "This would become a reusable verification workflow rather than a one-off wording fix.",
        suggestedSkillName: "openclaw-model-route-verifier",
        suggestedExistingSkillName: null,
        mergeTargetCandidateId: null,
        sourceRuntime: "mixed",
        evidenceRefs: ["chat://main/user_turn/concern", "chat://main/user_turn/codex"],
        recurrenceSignals: ["route verification recurred across proactivity and skills work"],
        frictionSignals: ["model route confusion is high risk"],
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
  it("builds candidate-review packets from a structured work episode outcome pack", () => {
    const outcomePack = buildWorkEpisodeOutcomePack({
      runtime: "codex",
      projectId: "openclaw",
      sessionKey: "agent:main:main",
      completedAt: "2026-05-01T20:00:00.000Z",
      userGoal:
        "Replace broad skill and proactivity review input with a structured work episode pack.",
      workSummary:
        "Added a bounded outcome pack path that summarizes files, tests, failures, follow-ups, and skill evidence.",
      finalOutcome:
        "Candidate review can use the structured pack as primary evidence instead of broad raw session tails.",
      filesTouched: [
        {
          path: "extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.ts",
          changeKind: "created",
          summary: "Defines the bounded outcome pack contract.",
        },
      ],
      testsRun: [
        {
          command:
            "pnpm test:file extensions/model-memory/src/runtime/phase2-work-episode-outcome-pack.test.ts",
          status: "passed",
          summary: "Pack schema and safety checks pass.",
        },
      ],
      failuresAndFixes: [
        {
          failure: "OpenClaw heartbeat history included proof and scaffold traffic.",
          fix: "Use outcome pack primary evidence.",
          status: "fixed",
        },
      ],
      unresolvedQuestions: [],
      followUpCandidates: [
        {
          title: "Wire outcome packs into heartbeat candidate review",
          rationale: "Heartbeat review should prefer structured closeout evidence.",
          sourceRefs: ["work-episode://test/summary"],
        },
      ],
      skillImprovementEvidence: [
        {
          workflowName: "Work Queue UX Review",
          evidence: "Repeated UX review needs a pre-check for selected evidence substrate.",
          suggestedDirection: "Add outcome-pack quality review to the workflow.",
          sourceRefs: ["work-episode://test/summary"],
        },
      ],
      sourceRefs: ["work-episode://test/summary"],
    });

    const packet = buildProactivityReviewEpisodePacketFromOutcomePack({ outcomePack });

    expect(packet.sourceSelection).toMatchObject({
      primaryInputKind: "work_episode_outcome_pack",
      primaryRuntime: "codex",
      outcomePackId: outcomePack.episodeId,
    });
    expect(packet.packetQuality.status).toBe("pass");
    expect(packet.packetQuality.reasonCodes).not.toContain("assistant_finals_missing");
    expect(packet.episodeTurns[0]?.boundedText).toContain("Work episode outcome pack");
    expect(packet.episodeTurns[0]?.boundedText).toContain("Files touched");
    expect(packet.episodeTurns[0]?.boundedText).toContain("Skill improvement evidence");
    expect(packet.codexActivitySummary.commandSummaries[0]).toMatchObject({
      status: "passed",
    });
    expect(JSON.stringify(packet).toLowerCase()).not.toContain("raw tool log");
  });

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

    expect(episode.schemaVersion).toBe("proactivity_review_episode.v2");
    expect(episode.reviewGoal).toBe("find_few_high_value_candidates");
    expect(episode.episodeTurns).toHaveLength(3);
    expect(episode.userIntentArc.explicitAsks).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Deterministic surfacing"),
        expect.stringContaining("OpenClaw should pull Codex"),
      ]),
    );
    expect(episode.userIntentArc.recentConcerns).toEqual([]);
    expect(episode.existingContext.loadedSkills[0]?.name).toBe("skill-vetter");
    expect(episode.reviewPolicy.maxSurfaceCandidates).toBe(3);
    expect(episode.packetQuality.contiguousWindowPresent).toBe(true);
    expect(JSON.stringify(episode)).not.toMatch(/raw-transcript-marker|raw-tool-log-marker/u);
  });

  it("preserves a contiguous episode window instead of only model-selected refs", () => {
    const activities: CandidateReviewRecentActivity[] = Array.from({ length: 6 }, (_, index) => ({
      ref: `chat://main/${index % 2 === 0 ? "user" : "assistant"}_turn/${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      kind: index % 2 === 0 ? "ask" : "final",
      boundedText: `Turn ${index} contains ordinary narrative context with no special keywords.`,
      sourceRuntime: "openclaw",
    }));
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: activities.map((activity) => activity.ref),
      boundedSummary: "Review the recent contiguous episode.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: activities,
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["related_turn_cluster"],
        confidence: "high",
        episodeWindow: {
          startRef: activities[2]?.ref ?? event.eventId,
          endRef: activities[3]?.ref ?? event.eventId,
          includedRefs: [activities[2]?.ref, activities[3]?.ref].filter(Boolean) as string[],
        },
        reviewGoal: "both",
        why: "The selector should not narrow the packet to selected refs.",
      },
      recentActivities: activities,
    });

    expect(episode.episodeTurns.map((turn) => turn.ref)).toEqual(
      activities.map((activity) => activity.ref),
    );
  });

  it("keeps high-context turns substantial instead of collapsing them into atomic snippets", () => {
    const longAssistantFinal = [
      "The high-context review should preserve the architecture diagnosis.",
      "It needs to include the user critique, the assistant explanation, the Codex requirement, and the final implementation consequence.",
      "This repeated concern spans multiple paragraphs and would be lost if reduced to a single atomic memory sentence.",
    ].join("\n\n");
    const activities: CandidateReviewRecentActivity[] = [
      ...recentDiscussionActivities(),
      {
        ref: "chat://main/assistant_turn/high-context",
        role: "assistant",
        kind: "final",
        boundedText: longAssistantFinal.repeat(12),
        sourceRuntime: "openclaw",
      },
    ];
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: activities.map((activity) => activity.ref),
      boundedSummary: "Review a larger recent work episode.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: activities,
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["related_turn_cluster"],
        confidence: "high",
        episodeWindow: {
          startRef: activities[0]?.ref ?? event.eventId,
          endRef: activities.at(-1)?.ref ?? event.eventId,
          includedRefs: activities.map((activity) => activity.ref),
        },
        reviewGoal: "both",
        why: "The episode has enough context for high-value review.",
      },
      recentActivities: activities,
    });

    const highContextTurn = episode.episodeTurns.find((turn) => turn.ref.endsWith("high-context"));

    expect(highContextTurn?.boundedText.length).toBeGreaterThan(760);
    expect(highContextTurn?.boundedText).toContain("architecture diagnosis");
    expect(highContextTurn?.excerptPolicy.rawTranscriptPersisted).toBe(false);
  });

  it("writes a sanitized high-context packet artifact for auditability", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "candidate-packet-"));
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

    const artifact = await writeProactivityReviewEpisodePacketArtifact(episode, {
      artifactRoot: root,
      timestamp: "2026-04-29T00:00:00.000Z",
    });

    expect(artifact.packetHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.promptPersisted).toBe(false);
    expect(artifact.rawResponsePersisted).toBe(false);
    expect(artifact.rawFullTranscriptPersisted).toBe(false);
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
    expect(result.report.episodeTurnCount).toBe(3);
    expect(result.report.packetQuality?.status).toBe("pass");
    expect(executor.requests[0]?.responseOptions?.reasoningEffort).toBe("high");
  });

  it("instructs the reviewer to distinguish bounded skills from proactive plans", async () => {
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
    const executor = new FakeExecutor(
      proposalOutput({
        proposals: [
          {
            proposalKind: "proactive_plan",
            title: "Candidate review release gate",
            purpose:
              "Run a pre-release check that verifies candidate review packet quality and card formatting before gateway wiring.",
            recommendedNextStep:
              "Create the release gate checklist and run it against the current local proof matrix.",
            expectedUserValue:
              "Reduces the risk of surfacing malformed or weak candidates before live UI validation.",
            leverageClass: "stability_risk",
            whyHighImpact:
              "The work is a release verification step for a model-owned candidate pipeline.",
            whyNotSmallCleanup:
              "This is a cross-lane quality gate rather than a small local cleanup.",
            suggestedSkillName: null,
            suggestedExistingSkillName: null,
            mergeTargetCandidateId: null,
            sourceRuntime: "openclaw",
            evidenceRefs: ["chat://main/user_turn/concern"],
            recurrenceSignals: ["candidate-review quality gates recurred"],
            frictionSignals: ["broad review labels created weaker skill candidates"],
            confidence: "high",
            riskTier: "low",
            shouldSurface: true,
            demotionReason: null,
          },
        ],
      }),
    );

    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor,
      modelId: "openai-codex/gpt-5.4",
    });

    expect(executor.requests[0]?.systemPrompt).toContain(
      "prefer bounded reusable capabilities over broad activity labels",
    );
    expect(executor.requests[0]?.systemPrompt).toContain(
      "Existing skill enhancement is also a legitimate surfaced card",
    );
    expect(executor.requests[0]?.systemPrompt).toContain(
      "what inputs it expects, what outputs it produces, and what quality gate proves it worked",
    );
    expect(result.proposals[0]).toMatchObject({
      proposalKind: "proactive_plan",
      shouldSurface: true,
    });
    expect(result.proposals[0]?.demotionReason).toBeUndefined();
  });

  it("allows an exact loaded-skill enhancement to surface as a legitimate card candidate", async () => {
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
      loadedSkills: [
        {
          name: "model-memory-deep-ingest",
          description: "Operate MMV2 deep document ingestion safely.",
          source: "codex-skill",
        },
      ],
    });

    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "existing_skill_enhancement",
              title: "Model memory lane validation checklist",
              purpose:
                "Extend the existing model-memory deep ingest workflow with repeatable lane validation before large memory changes.",
              recommendedNextStep:
                "Add inputs, outputs, and pass criteria for Codex capture, daily summaries, retrieval inclusion, and local candidate review.",
              expectedUserValue:
                "Improves an existing model-memory workflow without creating an overlapping new skill.",
              leverageClass: "workflow_acceleration",
              whyHighImpact:
                "The same validation steps recur before model-memory capture and retrieval changes.",
              whyNotSmallCleanup:
                "This improves a reusable workflow rather than a one-off proof wording issue.",
              suggestedSkillName: null,
              suggestedExistingSkillName: "model-memory-deep-ingest",
              mergeTargetCandidateId: null,
              sourceRuntime: "mixed",
              evidenceRefs: ["chat://main/user_turn/concern", "chat://main/user_turn/codex"],
              recurrenceSignals: ["model-memory lane validation recurred"],
              frictionSignals: ["missing validation checklist caused proof friction"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      proposalKind: "existing_skill_enhancement",
      suggestedExistingSkillName: "model-memory-deep-ingest",
      shouldSurface: true,
    });
    expect(result.proposals[0]?.demotionReason).toBeUndefined();
  });

  it("keeps slug-like proposal titles as candidate input for the model-authored card rewrite", async () => {
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
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "proactive_plan",
              title: "Route-proofharnessformodel-routeandpersistence-boundaryverification",
              purpose: "Prove model route isolation before Milestone 4.",
              recommendedNextStep: "Draft the route matrix proof.",
              expectedUserValue: "Prevents route regressions.",
              leverageClass: "stability_risk",
              whyHighImpact: "Route regressions affect chat, memory, and proactivity.",
              whyNotSmallCleanup: "This is a cross-route stability proof.",
              suggestedSkillName: null,
              suggestedExistingSkillName: null,
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["route proof recurred"],
              frictionSignals: ["route confusion is expensive"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(true);
    expect(result.proposals[0]?.demotionReason).toBeUndefined();
    expect(result.report.rejectedProposalDiagnostics).toEqual([]);
  });

  it("rejects model proposals that concatenate normal English copy without spaces", async () => {
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
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "proactive_plan",
              title: "Addprovenancegatingbeforeproactivecardsreachtheprimarysurface",
              purpose:
                "Defineadecisiongatethatrequiresprovenancereceiptsforproactivecardssoambiguousitemsaredemoted.",
              recommendedNextStep:
                "Specifyacompactprovenancereceiptschemaandreviewrulesetcoveringoriginandfreshness.",
              expectedUserValue:
                "Improvestrustinsurfacedproactivecardsbypreventingambiguousorstaleitems.",
              leverageClass: "stability_risk",
              whyHighImpact: "Cardscanlookreadablewhilehidingwhethertheyareorganicstaleorseeded.",
              whyNotSmallCleanup:
                "Thischangesdecisionqualityatauservisibleproductboundarynotjustwording.",
              suggestedSkillName: null,
              suggestedExistingSkillName: null,
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["provenance ambiguity recurred"],
              frictionSignals: ["readable cards can hide weak provenance"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(false);
    expect(result.proposals[0]?.demotionReason).toContain("candidate_copy_lacks_word_spacing");
    expect(result.report.rejectedProposalDiagnostics?.[0]?.reasonCodes).toContain(
      "candidate_copy_lacks_word_spacing",
    );
  });

  it("rejects clipped or dangling visible proposal copy", async () => {
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
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "proactive_plan",
              title: "Validate candidate review packet quality",
              purpose:
                "Compare candidate review outcomes from contiguous mixed-runtime windows versus deterministic selected snippets,",
              recommendedNextStep:
                "Run a small benchmark set and record where missed candidates originate.",
              expectedUserValue:
                "Prevents thin packet artifacts from hiding legitimate candidates.",
              leverageClass: "stability_risk",
              whyHighImpact: "Packet quality controls candidate review recall.",
              whyNotSmallCleanup: "This validates a full candidate discovery funnel.",
              suggestedSkillName: null,
              suggestedExistingSkillName: null,
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["packet quality failures recurred"],
              frictionSignals: ["thin packets can suppress good candidates"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(false);
    expect(result.proposals[0]?.demotionReason).toContain("clipped_candidate_copy");
    expect(result.report.rejectedProposalDiagnostics?.[0]?.reasonCodes).toContain(
      "clipped_candidate_copy",
    );
  });

  it("rejects fused trailing fragments in visible proposal copy", async () => {
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
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "proactive_plan",
              title: "Validate candidate review packet quality",
              purpose: "Check packet quality before reviewing generated candidate cards.",
              recommendedNextStep:
                "Update the proof to verify selected evidence substrate, packet quality, model proposals, andpro",
              expectedUserValue:
                "Prevents malformed card copy from reaching the active Work Queue.",
              leverageClass: "stability_risk",
              whyHighImpact: "Packet quality controls candidate review output quality.",
              whyNotSmallCleanup: "This validates a user-visible candidate discovery path.",
              suggestedSkillName: null,
              suggestedExistingSkillName: null,
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["packet quality failures recurred"],
              frictionSignals: ["thin packets can suppress good candidates"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(false);
    expect(result.proposals[0]?.demotionReason).toContain("clipped_candidate_copy");
  });

  it("rejects dangling terminal modifier proposal copy", async () => {
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
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "new_skill_candidate",
              title: "Outcome Pack Evidence Gate",
              purpose: "Verify the selected evidence substrate before reviewing card quality.",
              recommendedNextStep:
                "Draft a workflow that checks outcome-pack refs, touched files, tests, and the exact missing",
              expectedUserValue:
                "Prevents malformed card copy from reaching the active Work Queue.",
              leverageClass: "workflow_acceleration",
              whyHighImpact: "Reusable evidence checks prevent repeated review churn.",
              whyNotSmallCleanup: "This validates a user-visible candidate discovery path.",
              suggestedSkillName: "outcome-pack-evidence-gate",
              suggestedExistingSkillName: null,
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["candidate review quality checks recurred"],
              frictionSignals: ["bad evidence substrate caused weak cards"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(false);
    expect(result.proposals[0]?.demotionReason).toContain("clipped_candidate_copy");
  });

  it("requires existing skill enhancements to name an explicit loaded skill", async () => {
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
      loadedSkills: [{ name: "skill-vetter", description: "Vet skills", source: "user" }],
    });

    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor: new FakeExecutor(
        proposalOutput({
          proposals: [
            {
              proposalKind: "existing_skill_enhancement",
              title: "Model route verification checklist",
              purpose: "Add repeatable model route checks to an existing skill.",
              recommendedNextStep: "Draft the route isolation checks for the existing workflow.",
              expectedUserValue: "Prevents accidental model route regressions.",
              leverageClass: "stability_risk",
              whyHighImpact: "Route regressions can break multiple model-backed pathways.",
              whyNotSmallCleanup: "This is a reusable verification workflow, not a local cleanup.",
              suggestedSkillName: null,
              suggestedExistingSkillName: "missing-skill",
              mergeTargetCandidateId: null,
              sourceRuntime: "openclaw",
              evidenceRefs: ["chat://main/user_turn/concern"],
              recurrenceSignals: ["route verification recurred"],
              frictionSignals: ["route confusion is expensive"],
              confidence: "high",
              riskTier: "low",
              shouldSurface: true,
              demotionReason: null,
            },
          ],
        }),
      ),
    });

    expect(result.proposals[0]?.shouldSurface).toBe(false);
    expect(result.proposals[0]?.demotionReason).toContain(
      "existing_skill_enhancement_requires_loaded_skill_match",
    );
    expect(result.report.rejectedProposalDiagnostics?.[0]?.reasonCodes).toContain(
      "existing_skill_enhancement_requires_loaded_skill_match",
    );
  });

  it("allows the reviewer to return zero candidates for weak input", async () => {
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "openclaw",
      sessionKey: "main",
      refs: ["chat://main/assistant_turn/trivial"],
      boundedSummary: "The assistant fixed a tiny local wording issue.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: [
        {
          ref: "chat://main/assistant_turn/trivial",
          role: "assistant",
          kind: "final",
          boundedText: "Fixed one typo in a local paragraph.",
          sourceRuntime: "openclaw",
        },
      ],
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["related_turn_cluster"],
        confidence: "medium",
        episodeWindow: {
          startRef: "chat://main/assistant_turn/trivial",
          endRef: "chat://main/assistant_turn/trivial",
          includedRefs: ["chat://main/assistant_turn/trivial"],
        },
        reviewGoal: "both",
        why: "Cadence review.",
      },
      recentActivities: triggerPacket.recentRefs.map((entry) => ({
        ref: entry.ref,
        role: "assistant" as const,
        kind: "final" as const,
        boundedText: entry.boundedText,
        sourceRuntime: "openclaw" as const,
      })),
    });

    const result = await reviewEpisodeForCandidates(episode, {
      enabled: true,
      executor: new FakeExecutor(
        JSON.stringify({
          schemaVersion: "candidate_review_proposal.v2",
          proposals: [],
        }),
      ),
    });

    expect(result.proposals).toHaveLength(0);
    expect(result.report.validationStatus).toBe("pass");
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
    expect(
      converted.opportunities.some(
        (source) =>
          source.sourceFamily === "pattern_or_followup" &&
          source.opportunityClass === "proactive_plan",
      ),
    ).toBe(true);
  });

  it("preserves existing skill enhancement classification through conversion and review-only draft creation", async () => {
    const proposal = {
      schemaVersion: "candidate_review_proposal.v2" as const,
      proposalId: "proposal-existing-skill-enhancement",
      proposalKind: "existing_skill_enhancement" as const,
      title: "Improve Work Queue UX Review Outcome Pack Gate",
      purpose:
        "Enhance the existing Work Queue UX Review workflow so it verifies outcome-pack evidence selection before UI or card-quality fixes.",
      recommendedNextStep:
        "Add a checklist section that inspects pack source refs, packet quality, draft artifacts, and no-raw-transcript fallback before live gateway validation.",
      expectedUserValue:
        "Keeps future Work Queue UX reviews focused on the real task evidence rather than noisy raw session tails.",
      leverageClass: "workflow_acceleration" as const,
      whyHighImpact:
        "The same evidence-substrate mistake has repeatedly produced low-signal proactivity cards.",
      whyNotSmallCleanup: "This improves a reusable review workflow, not one card or one title.",
      suggestedSkillName: "work-queue-ux-review",
      suggestedExistingSkillName: "work-queue-ux-review",
      sourceRuntime: "codex" as const,
      evidenceRefs: ["work-episode://pack/enhancement"],
      evidenceHashes: ["enhancement-evidence-hash"],
      recurrenceSignals: ["Work Queue UX review needed the same input-substrate check repeatedly"],
      frictionSignals: ["card quality degraded when raw transcript evidence was used"],
      confidence: "high" as const,
      riskTier: "low" as const,
      shouldSurface: true,
    };
    const converted = convertCandidateReviewProposalsToLedgerSources({
      proposals: [proposal],
      projectId: "openclaw",
      sessionKey: "main",
      generatedAt: "2026-05-02T02:00:00.000Z",
      episodePacketHash: "enhancement-packet-hash",
    });
    const enhancement = converted.skillCandidates[0];
    const opportunity = converted.opportunities.find(
      (source) => source.sourceFamily === "skill_candidate",
    );

    expect(proposal.proposalKind).toBe("existing_skill_enhancement");
    expect(proposal.suggestedExistingSkillName).toBe("work-queue-ux-review");
    expect(enhancement).toMatchObject({
      suggestedSkillName: "work-queue-ux-review",
      suggestedExistingSkillName: "work-queue-ux-review",
      installTargets: ["workspace_skills_dir"],
      lifecycleStatus: "detected",
    });
    expect(opportunity).toEqual(
      expect.objectContaining({
        sourceFamily: "skill_candidate",
        opportunityClass: "skill_candidate",
        skillCandidate: expect.objectContaining({
          suggestedExistingSkillName: "work-queue-ux-review",
        }),
      }),
    );

    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-enhancement-draft-"));
    const draft = await createPhase2SkillifierDraft({
      workspaceDir,
      skillCandidate: enhancement!,
      ledgerEntry: {
        opportunityId: opportunity!.opportunityId,
        title: opportunity!.title,
        whyNow: opportunity!.whyNow,
        proposedNextStep: opportunity!.proposedNextStep,
        expectedUserValue: opportunity!.expectedUserValue,
        evidenceSummary: opportunity!.evidenceSummary,
        confidence: opportunity!.confidence,
        sourceRefs: opportunity!.sourceRefs,
        sourceProfileIds: opportunity!.sourceProfileIds,
        authorityTiers: opportunity!.authorityTiers,
        contentHashes: opportunity!.contentHashes,
        proofHashes: opportunity!.proofHashes,
      },
      now: new Date("2026-05-02T02:00:00.000Z"),
    });

    expect(draft.decision).toBe("draft_ready");
    expect(draft.draft.draftTarget.reviewOnly).toBe(true);
    expect(draft.draft.draftTarget.installationEnabled).toBe(false);
    expect(draft.draft.draftTarget.promotionEnabled).toBe(false);
    expect(draft.draft.lifecycleStatus).toBe("draft_ready");
    expect(draft.draft.suggestedSkillName).toBe("work-queue-ux-review");
  });

  it("does not surface merge-or-extend proposals as new skill or plan cards", () => {
    const converted = convertCandidateReviewProposalsToLedgerSources({
      proposals: [
        {
          schemaVersion: "candidate_review_proposal.v2",
          proposalId: "proposal-merge-existing-card",
          proposalKind: "merge_or_extend_candidate",
          title: "Merge heartbeat fallback gate duplicate",
          purpose:
            "Merge new evidence into an existing heartbeat fallback release gate card instead of surfacing another card.",
          recommendedNextStep:
            "Attach the evidence to the existing card and avoid a duplicate active inbox item.",
          candidateType: "merge_or_extend_candidate",
          mergeTargetCandidateId: "existing-opportunity-1",
          sourceRuntime: "openclaw",
          evidenceRefs: ["chat://main/user_turn/concern"],
          evidenceHashes: ["evidence-hash-1"],
          recurrenceSignals: ["duplicate candidate observed"],
          frictionSignals: ["operator saw repeated inbox cards"],
          expectedUserValue: "Keeps the active inbox focused on one reviewable card per issue.",
          leverageClass: "stability_risk",
          whyHighImpact: "Duplicate cards reduce trust in the proactivity inbox.",
          whyNotSmallCleanup: "This controls release-facing candidate quality.",
          confidence: "high",
          riskTier: "low",
          shouldSurface: true,
        },
      ],
      projectId: "openclaw",
      sessionKey: "main",
      generatedAt: "2026-04-28T20:00:00.000Z",
    });

    expect(converted.skillCandidates).toEqual([]);
    expect(converted.opportunities).toEqual([]);
  });

  it("marks thin Codex command-only evidence as degraded packet quality", () => {
    const activities: CandidateReviewRecentActivity[] = [
      {
        ref: "codex://rollout.jsonl#1",
        role: "assistant",
        kind: "final",
        boundedText: "The gateway is healthy and the proof is running.",
        sourceRuntime: "codex",
      },
      {
        ref: "codex://rollout.jsonl#2",
        role: "tool_summary",
        kind: "result_summary",
        boundedText: "Command function_call_output unknown",
        sourceRuntime: "codex",
      },
    ];
    const event = buildCandidateReviewPrefilterEvent({
      eventType: "assistant_final_completed",
      runtime: "codex",
      sessionKey: "main",
      refs: activities.map((activity) => activity.ref),
      boundedSummary: "Review thin Codex activity.",
    });
    const triggerPacket = buildCandidateReviewTriggerPacket({
      event,
      recentActivities: activities,
    });
    const episode = buildProactivityReviewEpisodePacket({
      triggerPacket,
      triggerDecision: {
        schemaVersion: "candidate_review_trigger_decision.v1",
        shouldRun: true,
        reasonCodes: ["related_turn_cluster"],
        confidence: "high",
        episodeWindow: {
          startRef: activities[0]?.ref ?? event.eventId,
          endRef: activities.at(-1)?.ref ?? event.eventId,
          includedRefs: activities.map((activity) => activity.ref),
        },
        reviewGoal: "both",
        why: "Cadence review.",
      },
      recentActivities: activities,
      codexAdapterReport: {
        status: "loaded",
        entryCount: activities.length,
      },
    });

    expect(episode.packetQuality.status).toBe("degraded");
    expect(episode.packetQuality.reasonCodes).toContain("codex_command_summaries_generic");
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

  it("reads explicit Codex session roots and nested Codex JSONL records", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-root-"));
    const sessions = path.join(root, "2026", "04", "29");
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, "rollout.jsonl"),
      [
        JSON.stringify({
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Fix the Codex session adapter and prove the UI output quality.",
            },
          ],
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "The adapter should mount the real session source and parse nested Codex records.",
              },
            ],
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "function_call",
            name: "exec_command",
            arguments: '{"cmd":"pnpm test:file raw-tool-log-marker"}',
          },
        }),
        JSON.stringify({
          type: "event_msg",
          payload: {
            type: "exec_command_end",
            command: ["pnpm", "test:file"],
            exit_code: 1,
            aggregated_output: "raw-tool-log-marker should not persist",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await loadCodexSessionActivityForCandidateReview({
      sessionRoot: root,
      maxFiles: 4,
      maxEntries: 12,
    });

    expect(result.report.status).toBe("loaded");
    expect(result.report.sourceRoot).toBe(root);
    expect(result.activities.some((activity) => activity.role === "user")).toBe(true);
    expect(result.activities.some((activity) => activity.role === "assistant")).toBe(true);
    expect(result.activities.some((activity) => activity.role === "tool_summary")).toBe(true);
    expect(result.activities.some((activity) => activity.kind === "failure_summary")).toBe(true);
    expect(JSON.stringify(result.activities)).not.toMatch(/raw-tool-log-marker/u);
  });

  it("tails large Codex session files instead of requiring full-file reads", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-tail-"));
    const sessions = path.join(root, "2026", "04", "29");
    await mkdir(sessions, { recursive: true });
    await writeFile(
      path.join(sessions, "large-rollout.jsonl"),
      [
        "x".repeat(8_000),
        JSON.stringify({
          role: "assistant",
          text: "Tail-visible assistant final with enough context for candidate review.",
        }),
      ].join("\n"),
      "utf8",
    );

    const result = await loadCodexSessionActivityForCandidateReview({
      sessionRoot: root,
      maxFiles: 4,
      maxEntries: 8,
      maxFileTailBytes: 1_000,
    });

    expect(result.report.status).toBe("loaded");
    expect(
      result.activities.some((activity) =>
        activity.boundedText.includes("Tail-visible assistant final"),
      ),
    ).toBe(true);
  });

  it("keeps the contiguous Codex tail instead of role-balancing narrative into the packet", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-narrative-"));
    const sessions = path.join(root, "2026", "04", "29");
    await mkdir(sessions, { recursive: true });
    const records = [
      JSON.stringify({
        role: "user",
        text: "Review the OpenClaw and Codex work and identify reusable skill candidates.",
      }),
      JSON.stringify({
        role: "assistant",
        text: "A reusable verifier skill could check route isolation, candidate provenance, and UI card quality.",
      }),
      ...Array.from({ length: 40 }, (_, index) =>
        JSON.stringify({
          role: "tool",
          command: `pnpm test:file noisy-${index}.ts`,
          status: index % 2 === 0 ? "passed" : "failed",
          output: "raw-tool-log-marker should not persist",
        }),
      ),
    ];
    await writeFile(path.join(sessions, "noisy-rollout.jsonl"), records.join("\n"), "utf8");

    const result = await loadCodexSessionActivityForCandidateReview({
      sessionRoot: root,
      maxFiles: 4,
      maxEntries: 8,
      maxTailLines: 80,
    });

    expect(result.report.status).toBe("loaded");
    expect(result.activities.every((activity) => activity.role === "tool_summary")).toBe(true);
    expect(result.activities.map((activity) => activity.ref)).toEqual(
      Array.from({ length: 8 }, (_, index) =>
        expect.stringContaining(`#${records.length - 8 + index}`),
      ),
    );
    expect(JSON.stringify(result.activities)).not.toMatch(/raw-tool-log-marker/u);
  });

  it("uses Codex history as bounded recent user context alongside session tails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-history-"));
    const sessions = path.join(root, "sessions", "2026", "04", "29");
    await mkdir(sessions, { recursive: true });
    const historyPath = path.join(root, "history.jsonl");
    await writeFile(
      historyPath,
      [
        JSON.stringify({
          session_id: "session-a",
          ts: 1_777_465_607,
          text: "A 15 minute wait during test time is not viable, the cooldown should be toggleable so we can test without 15 minute delays.",
        }),
        JSON.stringify({
          session_id: "session-a",
          ts: 1_777_465_700,
          text: "Review the Codex session context and identify reusable skill and proactive plan candidates from the full recent work episode.",
        }),
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(sessions, "rollout.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-04-29T13:16:00.000Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "The proof can bypass cooldown and cadence while production keeps heartbeat and every-three-final review.",
              },
            ],
          },
        }),
        ...Array.from({ length: 30 }, (_, index) =>
          JSON.stringify({
            type: "event_msg",
            payload: {
              type: "exec_command_end",
              command: ["pnpm", "test:file", `fixture-${index}.ts`],
              exit_code: index % 2,
              aggregated_output: "raw-tool-log-marker should not persist",
            },
          }),
        ),
      ].join("\n"),
      "utf8",
    );

    const result = await loadCodexSessionActivityForCandidateReview({
      codexHome: root,
      historyPath,
      maxFiles: 4,
      maxEntries: 40,
      maxTailLines: 80,
    });

    expect(result.report.status).toBe("loaded");
    expect(result.activities.some((activity) => activity.ref.startsWith("codex-history://"))).toBe(
      true,
    );
    expect(
      result.activities.some((activity) =>
        activity.boundedText.includes("cooldown should be toggleable"),
      ),
    ).toBe(true);
    expect(result.activities.some((activity) => activity.role === "assistant")).toBe(true);
    expect(JSON.stringify(result.activities)).not.toMatch(/raw-tool-log-marker/u);
  });
});
