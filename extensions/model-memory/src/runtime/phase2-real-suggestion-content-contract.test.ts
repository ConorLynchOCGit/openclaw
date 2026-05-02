import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import { buildPhase2ProductProactivitySurfacingReport } from "./phase2-product-proactivity-presentation.ts";
import {
  assertPhase2RealSuggestionContentReport,
  buildPhase2RealSuggestionContentReport,
  writePhase2RealSuggestionContentArtifact,
} from "./phase2-real-suggestion-content-contract.ts";

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

describe("phase2 real suggestion content contract", () => {
  it("requires concrete preview, action, summary, and expected value", async () => {
    const report = await buildPhase2RealSuggestionContentReport({
      productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
    });
    assertPhase2RealSuggestionContentReport(report);
    expect(report.previews[0]?.fields).toMatchObject({
      messagePreview: expect.any(String),
      suggestedAction: expect.any(String),
      candidateSummary: expect.any(String),
      expectedUserValue: expect.any(String),
    });
    expect(report.telemetry.genericPlaceholderObserved).toBe(false);
    expect(report.telemetry.approvalUsesExactPreview).toBe(true);
  });

  it("blocks generic placeholder-only candidates as non-actionable", async () => {
    const report = await buildPhase2RealSuggestionContentReport({
      productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
      forceGenericPlaceholder: true,
    });
    expect(report.decision).toBe("blocked");
    expect(report.previews[0]?.actionable).toBe(false);
    expect(report.previews[0]?.blockedReasonCodes).toContain("generic_placeholder_blocked");
  });

  it("blocks missing provenance and no-dark-data failures", async () => {
    const missingProvenance = await buildPhase2RealSuggestionContentReport({
      productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
      forceMissingProvenance: true,
    });
    expect(missingProvenance.decision).toBe("blocked");
    expect(missingProvenance.previews[0]?.blockedReasonCodes).toContain("provenance_required");

    const noDarkData = await buildPhase2RealSuggestionContentReport({
      productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
      forceNoDarkDataFail: true,
    });
    expect(noDarkData.decision).toBe("blocked");
    expect(noDarkData.previews[0]?.blockedReasonCodes).toContain("no_dark_data_required");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2RealSuggestionContentReport({
      productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
    });
    const artifact = await writePhase2RealSuggestionContentArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-real-suggestion-content-contract-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
