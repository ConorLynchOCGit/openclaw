import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase2LiveProactivityDetectionReport,
  writePhase2LiveProactivityDetectionArtifact,
  type Phase2ModelReviewedLiveProactivityOpportunity,
  type Phase2LiveProactivitySignalSource,
} from "./phase2-live-proactivity-signals.ts";

function source(
  signalKind: Phase2LiveProactivitySignalSource["signalKind"],
  sourceType: Phase2LiveProactivitySignalSource["sourceType"] = "session_runtime_event",
): Phase2LiveProactivitySignalSource {
  return {
    sourceId: `source-${signalKind}`,
    sourceType,
    signalKind,
    projectId: "openclaw",
    sessionKey: "main",
    boundedSummary: `Live ${signalKind} event shows a concrete OpenClaw next step is needed.`,
    sourceRefs: [`gateway://event/${signalKind}`],
    sourceProfileId: sourceType === "ordinary_turn_capture" ? "explicit_user_turn" : "manual_note",
    authorityTier: sourceType === "ordinary_turn_capture" ? "user_authoritative" : "tool_grounded",
    freshness: "recent",
    conflictState: "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
  };
}

function modelReviewedOpportunity(
  sourceId: string,
  overrides: Partial<Phase2ModelReviewedLiveProactivityOpportunity> = {},
): Phase2ModelReviewedLiveProactivityOpportunity {
  return {
    sourceId,
    workItemKind: "planning_request",
    title: "Model-reviewed live follow-up",
    whyNow: "A model-reviewed candidate identified this live signal as worth operator review.",
    proposedNextStep: "Review the model-reviewed live follow-up before any execution.",
    expectedUserValue: "Keeps live proactivity tied to model-reviewed candidate judgment.",
    evidenceSummary: "Evidence comes from the bounded live signal source.",
    confidence: "high",
    ...overrides,
  };
}

describe("phase2 live proactivity signals", () => {
  it("keeps real event-shaped sources as structural signals without model-reviewed opportunities", async () => {
    const report = await buildPhase2LiveProactivityDetectionReport({
      now: new Date("2026-04-27T06:00:00.000Z"),
      sources: [
        source("active_work_state", "ordinary_turn_capture"),
        source("unresolved_question"),
        source("recent_failure", "gateway_delivery_or_error_event"),
        source("repeated_friction", "operator_feedback_event"),
        source("incomplete_follow_up", "task_or_queue_state"),
        source("maintenance_candidate", "maintenance_loop_output"),
        source("project_state_capsule", "project_state_capsule"),
      ],
    });

    expect(report.decision).toBe("no_live_opportunities");
    expect(report.signals).toHaveLength(7);
    expect(report.opportunities).toHaveLength(0);
    expect(
      report.checks.find((check) => check.reasonCode === "model_reviewed_opportunity_required")
        ?.status,
    ).toBe("fail");
    expect(report.telemetry.opportunityCount).toBe(0);
    expect(JSON.stringify(report)).not.toContain("Plan a bounded next step");
    expect(report.policy.staticFallbackPrimaryAllowed).toBe(false);
    expect(report.policy.semanticSimilarityTruthAllowed).toBe(false);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("surfaces only model-reviewed opportunities tied to live signals", async () => {
    const report = await buildPhase2LiveProactivityDetectionReport({
      now: new Date("2026-04-27T06:00:00.000Z"),
      sources: [source("active_work_state", "ordinary_turn_capture")],
      modelReviewedOpportunities: [
        modelReviewedOpportunity("source-active_work_state", {
          title: "Model-reviewed Skills planning follow-up",
          proposedNextStep: "Review the Skills planning follow-up before starting new work.",
        }),
      ],
    });

    expect(report.decision).toBe("live_opportunities_detected");
    expect(report.opportunities).toHaveLength(1);
    expect(report.opportunities[0]).toMatchObject({
      sourceId: "source-active_work_state",
      title: "Model-reviewed Skills planning follow-up",
      proposedNextStep: "Review the Skills planning follow-up before starting new work.",
      noDarkDataStatus: "pass",
    });
    expect(report.policy.requireModelReviewedOpportunity).toBe(true);
  });

  it("blocks missing provenance, raw/private material, and no-dark-data failures", async () => {
    await expect(
      buildPhase2LiveProactivityDetectionReport({
        sources: [source("session_event")],
        forceMissingProvenance: true,
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2LiveProactivityDetectionReport({
        sources: [{ ...source("session_event"), inspectionOnly: true }],
      }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2LiveProactivityDetectionReport({
        sources: [source("session_event")],
        forceNoDarkDataFail: true,
      }),
    ).resolves.toMatchObject({ decision: "blocked", noDarkDataStatus: "fail" });
    await expect(
      buildPhase2LiveProactivityDetectionReport({
        sources: [
          {
            ...source("session_event"),
            rawPrompt: "raw-prompt-marker",
          } as unknown as Phase2LiveProactivitySignalSource,
        ],
      }),
    ).rejects.toThrow(/prohibited/i);
  });

  it("reports no live opportunities instead of promoting static fallback", async () => {
    const report = await buildPhase2LiveProactivityDetectionReport({
      sources: [],
    });

    expect(report.decision).toBe("no_live_opportunities");
    expect(report.opportunities).toHaveLength(0);
    expect(report.checks.find((check) => check.reasonCode === "live_source_required")?.status).toBe(
      "fail",
    );
    expect(report.policy.staticFallbackPrimaryAllowed).toBe(false);
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-live-proactivity-"));
    try {
      const report = await buildPhase2LiveProactivityDetectionReport({
        sources: [source("active_work_state", "ordinary_turn_capture")],
      });
      const artifact = await writePhase2LiveProactivityDetectionArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Live Proactivity Generation");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
