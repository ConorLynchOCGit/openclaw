import { describe, expect, it } from "vitest";
import type { JsonModelExecutionRequest, JsonModelExecutor } from "../model-execution.ts";
import { buildPhase2ContextualProactivitySurfacingReport } from "./phase2-contextual-proactivity-surfacing.ts";
import { buildPhase2LiveProactivityDetectionReport } from "./phase2-live-proactivity-signals.ts";
import {
  assertPhase2ProactivityDailyReviewHeartbeatReport,
  buildPhase2ProactivityDailyReviewHeartbeatReport,
  writePhase2ProactivityDailyReviewHeartbeatArtifact,
} from "./phase2-proactivity-daily-review-heartbeat.ts";
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

async function buildModelAuthoredContextualReport() {
  const contentReport = await buildPhase2RealSuggestionContentReport({
    productSurfacingReport: await buildModelAuthoredProductSurfacingReport(),
  });
  return buildPhase2ContextualProactivitySurfacingReport({
    contentReport,
    lane: "must_surface",
  });
}

describe("phase2 proactivity daily review heartbeat", () => {
  it("includes must-surface items and grouped lower-priority counts", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      contextualReport: await buildModelAuthoredContextualReport(),
    });
    assertPhase2ProactivityDailyReviewHeartbeatReport(report);
    expect(report.reviewItems.length).toBeGreaterThan(0);
    expect(report.heartbeatSummary.mustSurfaceCount).toBe(report.reviewItems.length);
    expect(report.groups.some((group) => group.lane === "lower_priority_grouped")).toBe(true);
  });

  it("preserves candidate ids and direct inbox detail/send path", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      contextualReport: await buildModelAuthoredContextualReport(),
    });
    expect(report.telemetry.candidateIds).toContain(report.reviewItems[0]?.candidateId);
    expect(report.reviewItems[0]?.directPath).toBe("proactivity_inbox_detail_send");
    expect(report.orderings[0]?.displayOrder).toBe(1);
  });

  it("blocks unsafe review output and supports rollback", async () => {
    const missing = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      contextualReport: await buildModelAuthoredContextualReport(),
      forceMissingProvenance: true,
    });
    expect(missing.decision).toBe("blocked");

    const rollback = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      env: { MODEL_MEMORY_PHASE2_DAILY_REVIEW_PROACTIVITY_DISABLED: "1" },
    });
    expect(rollback.decision).toBe("rollback_disabled");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2ProactivityDailyReviewHeartbeatReport({
      contextualReport: await buildModelAuthoredContextualReport(),
    });
    const artifact = await writePhase2ProactivityDailyReviewHeartbeatArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-proactivity-daily-review-heartbeat-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
