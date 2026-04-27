import { describe, expect, it } from "vitest";
import {
  assertPhase2ProactivityAcceptanceGateDecided,
  buildPhase2ProactivityAcceptanceGateReport,
} from "./phase2-proactivity-acceptance-gate.ts";

const greenMetrics = {
  liveSignalsObserved: 5,
  opportunitiesGenerated: 4,
  actionableWorkItemsGenerated: 3,
  inboxSurfaced: 3,
  heartbeatSurfaced: 2,
  contextualSurfaced: 1,
  handoffsStarted: 2,
  plansInvestigationsDraftsProduced: 2,
  dismissedSnoozedIgnored: 0,
  markedUsefulOrActioned: 1,
  markedNotUsefulWrongContext: 0,
  suppressedNoiseBudgeted: 1,
  leakagePrivateFailures: 0,
  unsafeActionAttempts: 0,
  autonomousSendAttempts: 0,
  autonomousSendExpansions: 0,
  staticFallbackPrimaryCount: 0,
  heartbeatInboxSharedSource: true,
};

describe("phase2 proactivity acceptance gate", () => {
  it("accepts only when live usefulness criteria pass", async () => {
    const report = await buildPhase2ProactivityAcceptanceGateReport({ metrics: greenMetrics });
    assertPhase2ProactivityAcceptanceGateDecided(report);
    expect(report.decision).toBe("proactivity_accepted_move_to_skills");
    expect(report.metricResults.every((metric) => metric.passed)).toBe(true);
    expect(report.recommendation).toContain("Move to Skills");
  });

  it("continues tuning when useful generation exists but noise or frequency is not green", async () => {
    const report = await buildPhase2ProactivityAcceptanceGateReport({
      metrics: {
        ...greenMetrics,
        liveSignalsObserved: 1,
        dismissedSnoozedIgnored: 4,
        suppressedNoiseBudgeted: 4,
      },
    });
    expect(report.decision).toBe("continue_tuning");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "generation_frequency_required", status: "fail" }),
        expect.objectContaining({ reasonCode: "low_noise_required", status: "fail" }),
      ]),
    );
  });

  it("pauses on leakage or unsafe action evidence", async () => {
    const report = await buildPhase2ProactivityAcceptanceGateReport({
      metrics: { ...greenMetrics, leakagePrivateFailures: 1 },
    });
    expect(report.decision).toBe("pause_automation");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks acceptance when static fallbacks become primary", async () => {
    const report = await buildPhase2ProactivityAcceptanceGateReport({
      metrics: { ...greenMetrics, staticFallbackPrimaryCount: 1 },
    });
    expect(report.decision).toBe("continue_tuning");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "static_fallback_not_primary", status: "fail" }),
      ]),
    );
  });
});
