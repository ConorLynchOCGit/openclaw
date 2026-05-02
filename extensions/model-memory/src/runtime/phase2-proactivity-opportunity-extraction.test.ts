import { describe, expect, it } from "vitest";
import {
  buildPhase2ProactivityOpportunityExtractionReport,
  type Phase2OpportunityExtractionCandidate,
  type Phase2OpportunityExtractionSource,
} from "./phase2-proactivity-opportunity-extraction.ts";

function source(
  overrides: Partial<Phase2OpportunityExtractionSource> = {},
): Phase2OpportunityExtractionSource {
  return {
    sourceId: "assistant-plan-1",
    sourceKind: "assistant_turn",
    sourceMessageId: "msg-assistant-1",
    sourceRunId: "run-assistant-1",
    projectId: "openclaw",
    sessionKey: "main",
    boundedText: [
      "Potential next steps:",
      "1. Plan the generator reset so roadmap review results become inbox opportunities automatically.",
      "2. Investigate stale proactivity items that still appear after the work is already done.",
    ].join("\n"),
    userPromptSummary:
      "Review the roadmap and active work to generate potential proactivity plans.",
    sourceRefs: ["chat://main/assistant_turn/msg-assistant-1"],
    sourceProfileId: "manual_note",
    authorityTier: "tool_grounded",
    noDarkDataStatus: "pass",
    ...overrides,
  };
}

function modelReviewedCandidate(
  overrides: Partial<Phase2OpportunityExtractionCandidate> = {},
): Phase2OpportunityExtractionCandidate {
  return {
    opportunityId: "opportunity-model-reviewed-1",
    sourceKind: "assistant_turn",
    sourceMessageId: "msg-assistant-1",
    sourceRunId: "run-assistant-1",
    projectId: "openclaw",
    sessionKey: "main",
    workItemKind: "planning_request",
    title: "Model-reviewed roadmap follow-up",
    whyNow: "A model-reviewed proposal identified this as a bounded follow-up.",
    proposedNextStep: "Review the roadmap follow-up before starting the next implementation pass.",
    expectedUserValue: "Keeps proactivity work tied to model-reviewed candidate judgment.",
    evidenceSummary: "Evidence comes from the bounded assistant turn source.",
    confidence: "high",
    limitations: [],
    sourceRefs: ["chat://main/assistant_turn/msg-assistant-1"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["hash-content-1"],
    proofHashes: ["hash-proof-1"],
    completionSignals: ["source_message:msg-assistant-1"],
    supersessionSignals: ["proposed_next_step_hash:hash-next-step-1"],
    blockedReasonCodes: [],
    noDarkDataStatus: "pass",
    generatedAt: "2026-04-27T15:00:00.000Z",
    ...overrides,
  };
}

describe("phase2 proactivity opportunity extraction", () => {
  it("does not create opportunities from assistant text without model-reviewed candidates", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      now: new Date("2026-04-27T15:00:00.000Z"),
      sources: [source()],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
    expect(report.telemetry.candidateCount).toBe(0);
    expect(
      report.checks.find((check) => check.reasonCode === "concrete_next_step_required")?.status,
    ).toBe("fail");
  });

  it("accepts explicit model-reviewed candidates tied to provided sources", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      now: new Date("2026-04-27T15:00:00.000Z"),
      sources: [source()],
      modelReviewedCandidates: [modelReviewedCandidate()],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      sourceKind: "assistant_turn",
      sourceMessageId: "msg-assistant-1",
      projectId: "openclaw",
      sessionKey: "main",
      title: "Model-reviewed roadmap follow-up",
      noDarkDataStatus: "pass",
    });
  });

  it("does not admit model-reviewed candidates that are not tied to the provided source set", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [source()],
      modelReviewedCandidates: [
        modelReviewedCandidate({
          sourceMessageId: "msg-other",
          sourceRefs: ["chat://main/assistant_turn/msg-other"],
        }),
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
  });

  it("keeps placeholder assistant text as structural evidence only", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        source({
          sourceId: "assistant-placeholder-1",
          sourceMessageId: "msg-assistant-placeholder-1",
          boundedText:
            "A suggestion is available. Review the memory-derived suggestion when convenient.",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-placeholder-1"],
        }),
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
    expect(
      report.checks.find((check) => check.reasonCode === "generic_placeholder_blocked")?.status,
    ).toBe("pass");
  });

  it("keeps heartbeat proof and plan-handoff text as structural evidence only", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        source({
          sourceId: "assistant-heartbeat-control-1",
          sourceMessageId: "msg-heartbeat-control-1",
          boundedText:
            "Read HEARTBEAT.md if it exists. HEARTBEAT_OK. Verify the active session state.",
          userPromptSummary:
            "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.",
          sourceRefs: ["chat://main/assistant_turn/msg-heartbeat-control-1"],
        }),
        source({
          sourceId: "assistant-handoff-1",
          sourceMessageId: "msg-handoff-1",
          boundedText:
            "## Bounded plan: Heartbeat proactivity review\n### Scope\nDecide the next bounded repo move.",
          userPromptSummary:
            "Start a bounded plan for this proactive work item. Context to use: heartbeat.",
          sourceRefs: ["chat://main/assistant_turn/msg-handoff-1"],
        }),
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
  });

  it("keeps no-dark-data and rollback guardrails", async () => {
    await expect(
      buildPhase2ProactivityOpportunityExtractionReport({
        sources: [
          source({
            rawPrompt: "raw-prompt-marker",
          } as unknown as Partial<Phase2OpportunityExtractionSource>),
        ],
      }),
    ).rejects.toThrow(/prohibited/i);

    const rollback = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [source()],
      modelReviewedCandidates: [modelReviewedCandidate()],
      env: { MODEL_MEMORY_PHASE2_OPPORTUNITY_EXTRACTION_DISABLED: "1" },
    });

    expect(rollback.decision).toBe("rollback_disabled");
    expect(rollback.candidates).toHaveLength(0);
    expect(rollback.rollbackPlan.targetMode).toBe("model_reviewed_candidate_only");
  });
});
