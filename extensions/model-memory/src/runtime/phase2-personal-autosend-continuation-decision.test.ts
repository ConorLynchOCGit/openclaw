import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2AutoSendSimulationObservabilityReport } from "./phase2-autosend-simulation-observability.ts";
import { buildPhase2AutoSendTrialQualityReviewReport } from "./phase2-autosend-trial-quality-review.ts";
import {
  assertPhase2PersonalAutoSendContinuationDecided,
  buildPhase2PersonalAutoSendContinuationReport,
  writePhase2PersonalAutoSendContinuationArtifact,
  type Phase2PersonalAutoSendContinuationInput,
} from "./phase2-personal-autosend-continuation-decision.ts";
import { buildPhase2PersonalAutoSendProductUxReport } from "./phase2-personal-autosend-product-ux.ts";
import { buildPhase2ProactivityFeedbackReport } from "./phase2-proactivity-feedback-loop.ts";

async function greenInput(overrides: Phase2PersonalAutoSendContinuationInput = {}) {
  const now = new Date("2026-04-27T01:15:00.000Z");
  const productUxReport =
    overrides.productUxReport ??
    (await buildPhase2PersonalAutoSendProductUxReport({
      now,
      uiEvidence: {
        settingsVisible: true,
        modeVisible: true,
        allowedClassVisible: true,
        followUpManualOnlyVisible: true,
        toggleOffReturnsManual: true,
        killSwitchStateVisible: true,
        terminalEvidence: true,
      },
    }));
  const simulationReport = await buildPhase2AutoSendSimulationObservabilityReport({
    now,
    queueItemStatus: "sent",
  });
  const feedbackReport = await buildPhase2ProactivityFeedbackReport({
    now,
    controls: ["useful"],
  });
  const qualityReviewReport =
    overrides.qualityReviewReport ??
    (await buildPhase2AutoSendTrialQualityReviewReport({
      now,
      simulationReport,
      feedbackReport,
      uiEvidence: {
        qualityReviewVisible: true,
        comparisonVisible: true,
        feedbackSignalsVisible: true,
        terminalEvidence: true,
      },
    }));
  return {
    now,
    productUxReport,
    qualityReviewReport,
    ...overrides,
  };
}

describe("phase2 personal autosend continuation decision", () => {
  it("pauses when product UX and report-only quality review pass safety checks", async () => {
    const report = await buildPhase2PersonalAutoSendContinuationReport(await greenInput());

    expect(report.decision).toBe("pause_personal_autosend_trial");
    expect(report.telemetry.personalTrialPaused).toBe(true);
    expect(report.telemetry.allowedAutoSendClass).toBe("operator_approved_suggestion_available");
    expect(report.telemetry.followUpClassManualOnly).toBe(true);
    assertPhase2PersonalAutoSendContinuationDecided(report);
  });

  it.each([
    ["missing Slice 50 UX proof", { productUxReport: null }, "slice50_product_ux_required"],
    [
      "missing Slice 51 quality review",
      { qualityReviewReport: null },
      "slice51_quality_review_required",
    ],
    ["leakage", { forceLeakage: true }, "no_leakage_required"],
    ["action execution", { forceActionExecution: true }, "action_execution_disabled"],
    [
      "broad autonomous sending",
      { forceBroadAutonomousSending: true },
      "broad_autonomous_sending_disabled",
    ],
    ["unhealthy kill switch", { forceUnhealthyKillSwitch: true }, "kill_switch_healthy_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
  ] satisfies Array<[string, Phase2PersonalAutoSendContinuationInput, string]>)(
    "rolls back on %s",
    async (_name, overrides, reasonCode) => {
      const report = await buildPhase2PersonalAutoSendContinuationReport(
        await greenInput(overrides),
      );

      expect(report.decision).toBe("rollback_to_manual_only");
      expect(report.telemetry.rollbackToManualOnly).toBe(true);
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
    },
  );

  it("does not narrow or continue the trial from deterministic quality observations", async () => {
    const input = await greenInput();
    const simulationReport = await buildPhase2AutoSendSimulationObservabilityReport({
      now: input.now,
      queueItemStatus: "sent",
    });
    const feedbackReport = await buildPhase2ProactivityFeedbackReport({
      now: input.now,
      controls: ["useful"],
    });
    const recorded = await buildPhase2AutoSendTrialQualityReviewReport({
      now: input.now,
      simulationReport,
      feedbackReport,
      forceRepeatedCount: 1,
    });
    const report = await buildPhase2PersonalAutoSendContinuationReport({
      ...input,
      qualityReviewReport: recorded,
    });

    expect(recorded.decision).toBe("trial_quality_review_recorded");
    expect(report.decision).toBe("pause_personal_autosend_trial");
    expect(report.telemetry.personalTrialPaused).toBe(true);
  });

  it("rolls back when quality is blocked", async () => {
    const input = await greenInput();
    const simulationReport = await buildPhase2AutoSendSimulationObservabilityReport({
      now: input.now,
      queueItemStatus: "sent",
    });
    const feedbackReport = await buildPhase2ProactivityFeedbackReport({
      now: input.now,
      controls: ["useful"],
    });
    const blocked = await buildPhase2AutoSendTrialQualityReviewReport({
      now: input.now,
      simulationReport,
      feedbackReport,
      forceLeakageOrPrivateFlag: true,
    });
    const report = await buildPhase2PersonalAutoSendContinuationReport({
      ...input,
      qualityReviewReport: blocked,
    });

    expect(blocked.decision).toBe("trial_quality_blocked");
    expect(report.decision).toBe("rollback_to_manual_only");
    expect(report.telemetry.blockedReasonCodes).toContain("blocked_quality_rolls_back");
  });

  it("pauses when the user has already returned the product UX to manual-only", async () => {
    const input = await greenInput({
      productUxReport: await buildPhase2PersonalAutoSendProductUxReport({ userDisabled: true }),
    });
    const report = await buildPhase2PersonalAutoSendContinuationReport(input);

    expect(report.decision).toBe("pause_personal_autosend_trial");
    expect(report.telemetry.personalTrialPaused).toBe(true);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-personal-autosend-continuation-"));
    try {
      const report = await buildPhase2PersonalAutoSendContinuationReport(await greenInput());
      const artifact = await writePhase2PersonalAutoSendContinuationArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Personal Auto-Send Continuation Decision");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
