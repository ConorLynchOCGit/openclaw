import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2ProactivityFeedbackLoopEnabled,
  buildPhase2ProactivityFeedbackReport,
  writePhase2ProactivityFeedbackArtifact,
  type Phase2ProactivityFeedbackInput,
} from "./phase2-proactivity-feedback-loop.ts";

describe("phase2 proactivity feedback loop", () => {
  it("records all feedback controls as bounded control-plane metadata", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({
      now: new Date("2026-04-26T23:00:00.000Z"),
      uiEvidence: {
        sessionKey: "main",
        feedbackControlsVisible: true,
        feedbackSubmissionObserved: true,
        suppressionReportVisible: true,
        unsafePrivateBlocksFutureSurfacing: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("feedback_loop_enabled");
    expect(report.policy.controls).toEqual([
      "useful",
      "not_useful",
      "too_repetitive",
      "wrong_context",
      "unsafe_private",
    ]);
    expect(report.feedbackRecords).toHaveLength(5);
    expect(report.feedbackRecords.every((record) => !record.rawTextStored)).toBe(true);
    expect(report.feedbackRecords.every((record) => !record.canonicalTruthWrite)).toBe(true);
    expect(report.feedbackRecords.every((record) => !record.memoryCorrectionWrite)).toBe(true);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2ProactivityFeedbackLoopEnabled(report);
  });

  it("useful feedback affects the quality report only", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({ controls: ["useful"] });

    expect(report.qualityReport.positiveFeedbackCount).toBe(1);
    expect(report.qualityReport.negativeFeedbackCandidateIds).toEqual([]);
    expect(report.qualityReport.suppressedCandidateIds).toEqual([]);
    expect(report.qualityReport.blockedCandidateIds).toEqual([]);
    expect(report.qualityReport.canonicalTruthWritesCreated).toBe(false);
  });

  it("not useful and wrong context feedback are metadata only without ranking writes", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({
      controls: ["not_useful", "wrong_context"],
    });

    expect(report.policy.feedbackMayAffectRanking).toBe(false);
    expect(report.qualityReport.negativeFeedbackCandidateIds).toHaveLength(1);
    expect(
      report.suppressionDecisions.every(
        (decision) =>
          decision.decision === "negative_feedback_recorded" &&
          !decision.canonicalTruthWrite &&
          !decision.memoryCorrectionWrite,
      ),
    ).toBe(true);
  });

  it("too repetitive feedback creates deterministic suppression", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({ controls: ["too_repetitive"] });

    expect(report.qualityReport.suppressedCandidateIds).toHaveLength(1);
    expect(report.suppressionDecisions[0]?.reasonCodes).toContain(
      "feedback_suppress_too_repetitive",
    );
  });

  it("unsafe private feedback blocks future surfacing safely", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({ controls: ["unsafe_private"] });

    expect(report.qualityReport.blockedCandidateIds).toHaveLength(1);
    expect(report.suppressionDecisions[0]?.decision).toBe("block_future_surfacing_pending_review");
    expect(report.suppressionDecisions[0]?.reasonCodes).toContain(
      "feedback_unsafe_private_block_future_surfacing",
    );
  });

  it.each([
    ["missing product queue", { productSurfacingReport: null }, "product_queue_required"],
    ["raw feedback text", { rawFeedbackText: "free-form feedback" }, "raw_feedback_text_rejected"],
    ["private content", { rawFeedbackText: "private-phrase-marker" }, "no_dark_data_required"],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["canonical truth write", { forceCanonicalTruthWrite: true }, "canonical_truth_write_disabled"],
    [
      "memory correction write",
      { forceMemoryCorrectionWrite: true },
      "memory_correction_write_disabled",
    ],
  ] satisfies Array<[string, Phase2ProactivityFeedbackInput, string]>)(
    "blocks %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2ProactivityFeedbackReport(input);

      expect(report.decision).toBe("blocked");
      expect(report.telemetry.rawTextStored).toBe(false);
      expect(report.telemetry.canonicalTruthWriteObserved).toBe(false);
      expect(report.telemetry.memoryCorrectionWriteObserved).toBe(false);
      expect(report.checks.map((check) => check.reasonCode)).toContain(reasonCode);
      expect(JSON.stringify(report)).not.toContain("free-form feedback");
    },
  );

  it("rollback disables feedback submission while preserving product queue", async () => {
    const report = await buildPhase2ProactivityFeedbackReport({
      env: { MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.rollbackPlan.preservesProductQueue).toBe(true);
    expect(report.rollbackPlan.disablesFeedbackSubmission).toBe(true);
    expect(
      report.suppressionDecisions.every((decision) => decision.decision === "rollback_disabled"),
    ).toBe(true);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-feedback-loop-"));
    try {
      const report = await buildPhase2ProactivityFeedbackReport();
      const artifact = await writePhase2ProactivityFeedbackArtifact({ report, artifactDir: dir });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Proactivity Feedback Loop");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
