import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import {
  assertPhase2ContextualProactivitySurfacingReport,
  buildPhase2ContextualProactivitySurfacingReport,
  writePhase2ContextualProactivitySurfacingArtifact,
} from "./phase2-contextual-proactivity-surfacing.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import { buildPhase2ProductProactivitySurfacingReport } from "./phase2-product-proactivity-presentation.ts";
import { buildPhase2RealSuggestionContentReport } from "./phase2-real-suggestion-content-contract.ts";

class FakeModelBriefExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  async execute(request: JsonModelExecutionRequest) {
    this.requests.push(request);
    return {
      outputText: JSON.stringify({
        schemaVersion: "model_authored_proactivity_brief_output.v1",
        decision: "surface",
        kindCode: "follow_up",
        titleWords: ["Skills", "platform", "planning", "follow-up"],
        oneLinePurposeWords: [
          "Clarifies",
          "the",
          "next",
          "bounded",
          "Skills",
          "Platform",
          "implementation",
          "step",
        ],
        recommendedNextStepWords: [
          "Review",
          "the",
          "Skills",
          "Platform",
          "follow-up",
          "before",
          "starting",
          "new",
          "work",
        ],
        primaryActionLabelWords: ["Plan", "this"],
        statusLabelWords: null,
        detailSummaryWords: ["Bounded", "proactivity", "evidence", "is", "available"],
        hiddenDiagnostics: { whyDemotedOrRepairedWords: null, limitations: [] },
        qualityReasons: [],
      }),
      resolvedModelId: request.contract.modelId,
      usage: { promptTokens: 120, outputTokens: 80 },
    };
  }
}

async function buildModelAuthoredProductSurfacingReport() {
  const liveDetectionReport = await buildPhase2LiveProactivityDetectionReport({
    sources: [
      {
        sourceId: "ordinary-turn-live-event-1",
        sourceType: "ordinary_turn_capture",
        signalKind: "active_work_state",
        projectId: "openclaw",
        sessionKey: "main",
        boundedSummary:
          "The active OpenClaw session is ready to plan the Skills path after proactivity remediation.",
        sourceRefs: ["gateway://event/ordinary-turn-live-event-1"],
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
        freshness: "recent",
        conflictState: "clear",
        inspectionOnly: false,
        noDarkDataStatus: "pass",
      },
    ],
    modelReviewedOpportunities: [
      {
        sourceId: "ordinary-turn-live-event-1",
        workItemKind: "planning_request",
        title: "Skills platform planning follow-up",
        whyNow:
          "The active OpenClaw session is ready to plan the Skills path after proactivity remediation.",
        proposedNextStep: "Review the Skills Platform follow-up before starting new work.",
        expectedUserValue: "Clarifies the next bounded Skills Platform implementation step.",
        evidenceSummary:
          "The active OpenClaw session is ready to plan the Skills path after proactivity remediation.",
        confidence: "high",
      },
    ],
  });
  return buildPhase2ProductProactivitySurfacingReport({
    now: new Date("2026-04-26T16:00:00.000Z"),
    liveDetectionReport,
    eligibilityScope: {
      userId: "conor",
      recipientId: "conor",
      projectId: "openclaw",
      sessionKey: "main",
      operatorId: "operator-conor",
    },
    modelBriefOptions: {
      enabled: true,
      executor: new FakeModelBriefExecutor(),
      modelId: "openai-codex/gpt-5.4",
    },
  });
}

async function buildModelAuthoredContentReport() {
  return buildPhase2RealSuggestionContentReport({
    productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
  });
}

describe("phase2 contextual proactivity surfacing", () => {
  it("supports required lanes and surfaces exact active context matches", async () => {
    const report = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      lane: "context_surface",
    });
    assertPhase2ContextualProactivitySurfacingReport(report);
    expect(report.supportedLanes).toEqual(["must_surface", "context_surface", "background_only"]);
    expect(report.contextualCards).toHaveLength(1);
    expect(report.relevanceDecisions[0]?.relevanceExplanation).toContain(
      "matches project openclaw-platform / session main",
    );
  });

  it("keeps background or non-matching candidates in the inbox", async () => {
    const background = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      forceBackgroundOnly: true,
    });
    expect(background.contextualCards).toHaveLength(0);
    expect(background.relevanceDecisions[0]?.inboxOnly).toBe(true);

    const unknownSession = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      forceUnknownSession: true,
    });
    expect(unknownSession.contextualCards).toHaveLength(0);
    expect(unknownSession.relevanceDecisions[0]?.blockedReasonCodes).toContain(
      "typed_context_overlap_required",
    );
  });

  it("suppresses stale, repeated, or wildcard scoped candidates", async () => {
    const stale = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      forceStale: true,
    });
    expect(stale.contextualCards).toHaveLength(0);
    expect(stale.suppressionDecisions[0]?.reasonCodes).toContain("stale_candidate");

    const repeated = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      forceRepeated: true,
    });
    expect(repeated.contextualCards).toHaveLength(0);
    expect(repeated.suppressionDecisions[0]?.reasonCodes).toContain("repeated_candidate");

    const wildcard = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      forceWildcardScope: true,
    });
    expect(wildcard.decision).toBe("blocked");
    expect(wildcard.relevanceDecisions[0]?.blockedReasonCodes).toContain("wildcard_scope_rejected");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2ContextualProactivitySurfacingReport({
      contentReport: await buildModelAuthoredContentReport(),
      lane: "must_surface",
    });
    const artifact = await writePhase2ContextualProactivitySurfacingArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-contextual-proactivity-surfacing-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
