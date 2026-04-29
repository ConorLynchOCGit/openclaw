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
  writeProactivityReviewEpisodePacketArtifact,
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
    expect(episode.userIntentArc.recentConcerns[0]).toContain("Deterministic surfacing");
    expect(episode.existingContext.loadedSkills[0]?.name).toBe("skill-vetter");
    expect(episode.reviewPolicy.maxSurfaceCandidates).toBe(3);
    expect(JSON.stringify(episode)).not.toMatch(/raw-transcript-marker|raw-tool-log-marker/u);
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
    expect(executor.requests[0]?.responseOptions?.reasoningEffort).toBe("high");
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

  it("prioritizes Codex user and assistant narrative over noisy tool summaries", async () => {
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
    expect(result.activities.some((activity) => activity.role === "user")).toBe(true);
    expect(result.activities.some((activity) => activity.role === "assistant")).toBe(true);
    expect(
      result.activities.filter((activity) => activity.role === "tool_summary").length,
    ).toBeLessThan(result.activities.length);
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
      maxEntries: 8,
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
