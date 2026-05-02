import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2AutoSendSimulationObservabilityReport } from "./phase2-autosend-simulation-observability.ts";
import {
  assertPhase2AutoSendTrialQualityReviewed,
  buildPhase2AutoSendTrialQualityReviewReport,
  writePhase2AutoSendTrialQualityArtifact,
  type Phase2AutoSendTrialQualityReviewInput,
} from "./phase2-autosend-trial-quality-review.ts";
import { buildPhase2ProactivityFeedbackReport } from "./phase2-proactivity-feedback-loop.ts";

async function greenInput(overrides: Phase2AutoSendTrialQualityReviewInput = {}) {
  const now = new Date("2026-04-27T00:30:00.000Z");
  const simulationReport =
    overrides.simulationReport ??
    (await buildPhase2AutoSendSimulationObservabilityReport({
      now,
      queueItemStatus: "sent",
    }));
  const feedbackReport =
    overrides.feedbackReport ??
    (await buildPhase2ProactivityFeedbackReport({
      now,
      controls: ["useful"],
    }));
  return {
    now,
    simulationReport,
    feedbackReport,
    ...overrides,
  };
}

describe("phase2 autosend trial quality review", () => {
  it("records Slice 45 simulation and Slice 49 feedback without quality promotion", async () => {
    const report = await buildPhase2AutoSendTrialQualityReviewReport(await greenInput());

    expect(report.decision).toBe("trial_quality_review_recorded");
    expect(report.telemetry.wouldHaveSentCount).toBe(1);
    expect(report.telemetry.manualApprovedCount).toBe(1);
    expect(report.telemetry.positiveFeedbackCount).toBe(1);
    expect(report.telemetry.falsePositiveCount).toBe(0);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    expect(report.telemetry.broadAutonomousSendingObserved).toBe(false);
    assertPhase2AutoSendTrialQualityReviewed(report);
  });

  it.each([
    ["missing Slice 45 simulation", { simulationReport: null }, "slice45_simulation_required"],
    ["missing Slice 49 feedback", { feedbackReport: null }, "slice49_feedback_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["action execution", { forceActionExecution: true }, "action_execution_disabled"],
    [
      "broad autonomous sending",
      { forceBroadAutonomousSending: true },
      "broad_autonomous_sending_disabled",
    ],
  ] satisfies Array<[string, Phase2AutoSendTrialQualityReviewInput, string]>)(
    "blocks %s",
    async (_name, overrides, reasonCode) => {
      const report = await buildPhase2AutoSendTrialQualityReviewReport(await greenInput(overrides));

      expect(report.decision).toBe("trial_quality_blocked");
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
    },
  );

  it.each([
    ["false positive", { forceFalsePositiveCount: 1 }, "false_positive_under_threshold"],
    ["repeat", { forceRepeatedCount: 1 }, "repeat_under_threshold"],
    ["stale", { forceStaleCount: 1 }, "stale_under_threshold"],
  ] satisfies Array<[string, Phase2AutoSendTrialQualityReviewInput, string]>)(
    "records %s observations without deterministic quality judgment",
    async (_name, overrides, reasonCode) => {
      const report = await buildPhase2AutoSendTrialQualityReviewReport(await greenInput(overrides));

      expect(report.decision).toBe("trial_quality_review_recorded");
      expect(report.telemetry.blockedReasonCodes).not.toContain(reasonCode);
    },
  );

  it("blocks on unsafe/private feedback flags", async () => {
    const feedbackReport = await buildPhase2ProactivityFeedbackReport({
      now: new Date("2026-04-27T00:30:00.000Z"),
      controls: ["unsafe_private"],
    });
    const report = await buildPhase2AutoSendTrialQualityReviewReport(
      await greenInput({ feedbackReport }),
    );

    expect(report.decision).toBe("trial_quality_blocked");
    expect(report.telemetry.unsafePrivateCount).toBe(1);
    expect(report.telemetry.blockedReasonCodes).toContain("unsafe_private_zero");
  });

  it("records wrong-context and negative feedback ratio without quality judgment", async () => {
    const feedbackReport = await buildPhase2ProactivityFeedbackReport({
      now: new Date("2026-04-27T00:30:00.000Z"),
      controls: ["not_useful", "wrong_context"],
    });
    const report = await buildPhase2AutoSendTrialQualityReviewReport(
      await greenInput({ feedbackReport }),
    );

    expect(report.decision).toBe("trial_quality_review_recorded");
    expect(report.telemetry.wrongContextOrNegativeFeedbackRatio).toBe(1);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-autosend-trial-quality-"));
    try {
      const report = await buildPhase2AutoSendTrialQualityReviewReport(await greenInput());
      const artifact = await writePhase2AutoSendTrialQualityArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Auto-Send Trial Quality Review");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
