import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2AutoSendSimulationObservabilityReport } from "./phase2-autosend-simulation-observability.ts";
import { buildPhase2AutoSendTrialQualityReviewReport } from "./phase2-autosend-trial-quality-review.ts";
import {
  assertPhase2FollowUpAutoSendPreflightReportOnly,
  buildPhase2FollowUpAutoSendPreflightReport,
  writePhase2FollowUpAutoSendPreflightArtifact,
  type Phase2FollowUpAutoSendPreflightInput,
} from "./phase2-follow-up-autosend-preflight.ts";
import { buildPhase2PersonalAutoSendContinuationReport } from "./phase2-personal-autosend-continuation-decision.ts";
import { buildPhase2PersonalAutoSendProductUxReport } from "./phase2-personal-autosend-product-ux.ts";
import { buildPhase2ProactivityFeedbackReport } from "./phase2-proactivity-feedback-loop.ts";

async function greenInput(overrides: Phase2FollowUpAutoSendPreflightInput = {}) {
  const now = new Date("2026-04-27T02:00:00.000Z");
  const productUxReport = await buildPhase2PersonalAutoSendProductUxReport({ now });
  const simulationReport = await buildPhase2AutoSendSimulationObservabilityReport({
    now,
    queueItemStatus: "sent",
  });
  const feedbackReport =
    overrides.feedbackReport ??
    (await buildPhase2ProactivityFeedbackReport({ now, controls: ["useful"] }));
  const qualityReviewReport = await buildPhase2AutoSendTrialQualityReviewReport({
    now,
    simulationReport,
    feedbackReport,
  });
  const continuationReport =
    overrides.continuationReport ??
    (await buildPhase2PersonalAutoSendContinuationReport({
      now,
      productUxReport,
      qualityReviewReport,
    }));
  return {
    now,
    continuationReport,
    feedbackReport,
    ...overrides,
  };
}

describe("phase2 follow-up autosend preflight", () => {
  it("keeps follow-up class manual-only by default", async () => {
    const report = await buildPhase2FollowUpAutoSendPreflightReport(await greenInput());

    expect(report.decision).toBe("follow_up_preflight_report_only");
    expect(report.candidate.classification).toBe("manual_only");
    expect(report.candidate.deliveryMode).toBe("manual_only");
    expect(report.telemetry.followUpAutoSendOccurred).toBe(false);
    assertPhase2FollowUpAutoSendPreflightReportOnly(report);
  });

  it("can classify a follow-up as a future candidate without delivery", async () => {
    const report = await buildPhase2FollowUpAutoSendPreflightReport(
      await greenInput({ evaluateFutureCandidate: true }),
    );

    expect(report.candidate.classification).toBe("future_auto_send_candidate");
    expect(report.candidate.reportOnly).toBe(true);
    expect(report.candidate.wouldDeliverAutomatically).toBe(false);
    expect(report.telemetry.manualSendRequired).toBe(true);
  });

  it.each([
    ["stale follow-up", { forceStaleFollowUp: true }, "freshness_required"],
    ["repeated follow-up", { forceRepeatedFollowUp: true }, "non_repeat_required"],
    [
      "wrong-context feedback",
      { forceWrongContextFeedback: true },
      "wrong_context_blocks_candidate",
    ],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["urgency manipulation", { forceUrgencyManipulation: true }, "urgency_manipulation_blocked"],
    ["external instruction", { forceExternalInstruction: true }, "external_instruction_blocked"],
    [
      "rollback active",
      { env: { MODEL_MEMORY_PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_DISABLED: "1" } },
      "rollback_blocks_candidate",
    ],
    ["semantic truth write", { forceSemanticTruthWrite: true }, "feedback_not_semantic_truth"],
  ] satisfies Array<[string, Phase2FollowUpAutoSendPreflightInput, string]>)(
    "blocks %s",
    async (_name, overrides, reasonCode) => {
      const report = await buildPhase2FollowUpAutoSendPreflightReport(
        await greenInput({ evaluateFutureCandidate: true, ...overrides }),
      );

      expect(report.candidate.classification).toBe("blocked");
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.followUpAutoSendOccurred).toBe(false);
    },
  );

  it("blocks attempted follow-up auto-send and keeps telemetry non-delivering", async () => {
    const report = await buildPhase2FollowUpAutoSendPreflightReport(
      await greenInput({ evaluateFutureCandidate: true, forceFollowUpAutoSendAttempt: true }),
    );

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.blockedReasonCodes).toContain("no_follow_up_auto_send");
    expect(report.telemetry.followUpAutoSendOccurred).toBe(false);
  });

  it("requires positive feedback for future candidacy", async () => {
    const feedbackReport = await buildPhase2ProactivityFeedbackReport({
      now: new Date("2026-04-27T02:00:00.000Z"),
      controls: ["not_useful"],
    });
    const report = await buildPhase2FollowUpAutoSendPreflightReport(
      await greenInput({ evaluateFutureCandidate: true, feedbackReport }),
    );

    expect(report.candidate.classification).toBe("blocked");
    expect(report.telemetry.blockedReasonCodes).toContain("positive_feedback_required");
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-follow-up-autosend-preflight-"));
    try {
      const report = await buildPhase2FollowUpAutoSendPreflightReport(await greenInput());
      const artifact = await writePhase2FollowUpAutoSendPreflightArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Follow-Up Auto-Send Preflight");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
