import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPhase2ProactivityUsefulnessReport,
  writePhase2ProactivityUsefulnessArtifact,
  type Phase2ProactivityUxEvent,
} from "./phase2-proactivity-usefulness-tuning.ts";

const fixedNow = new Date("2026-04-26T23:30:00.000Z");

function buildNoisyEvents(): Phase2ProactivityUxEvent[] {
  const base = {
    candidateId: "candidate-noisy-1",
    queueItemId: "queue-noisy-1",
    messageClass: "operator_approved_suggestion_available" as const,
    surfacingLane: "context_surface" as const,
    sourceRefs: ["docs/projects/model-memory/specs/planner-review-artifacts-and-surfacing.md"],
    sourceProfileIds: ["curated_repo_doc" as const],
    authorityTiers: ["curated_authoritative" as const],
    contentHashes: ["content-hash-noisy-1"],
    proofHashes: ["proof-hash-noisy-1"],
    timestamp: fixedNow.toISOString(),
    rawTextStored: false as const,
  };
  return [
    { ...base, eventId: "event-viewed", eventType: "viewed", signalType: "view" },
    {
      ...base,
      eventId: "event-opened-detail",
      eventType: "opened_detail",
      signalType: "detail",
    },
    {
      ...base,
      eventId: "event-dismissed",
      eventType: "dismissed",
      signalType: "feedback_negative",
    },
    {
      ...base,
      eventId: "event-ignored",
      eventType: "ignored",
      signalType: "feedback_negative",
    },
    {
      ...base,
      eventId: "event-not-useful",
      eventType: "marked_not_useful",
      signalType: "feedback_negative",
    },
    {
      ...base,
      eventId: "event-snoozed",
      eventType: "snoozed",
      signalType: "repeat_noise",
    },
  ];
}

describe("phase2 proactivity usefulness tuning", () => {
  it("captures UX events as bounded metadata and groups quality by source and lane", async () => {
    const report = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      uxEvents: buildNoisyEvents(),
    });

    expect(report.telemetry.uxEventCount).toBe(6);
    expect(report.sourceQualityReport.groupedBySurfacingLane.context_surface).toBe(6);
    expect(
      report.sourceQualityReport.groupedByCandidateSource[
        "docs/projects/model-memory/specs/planner-review-artifacts-and-surfacing.md"
      ],
    ).toBe(6);
    expect(report.uxEvents.every((event) => !event.rawTextStored)).toBe(true);
  });

  it("downranks noisy sources and suppresses repeated candidates", async () => {
    const report = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      uxEvents: buildNoisyEvents(),
    });

    expect(report.suppressionRules.some((rule) => rule.action === "downrank_source")).toBe(true);
    expect(report.suppressionRules.some((rule) => rule.action === "suppress_candidate")).toBe(true);
    expect(report.whyNotShownDiagnostics.length).toBeGreaterThan(0);
    expect(
      report.whyNotShownDiagnostics.some((entry) =>
        entry.reasonCodes.includes("repeated_snooze_or_dismiss_suppression"),
      ),
    ).toBe(true);
  });

  it("keeps feedback as control-plane metadata without semantic truth writes", async () => {
    const report = await buildPhase2ProactivityUsefulnessReport({ now: fixedNow });

    expect(report.telemetry.semanticTruthWriteObserved).toBe(false);
    expect(report.telemetry.memoryCorrectionWriteObserved).toBe(false);
    expect(
      report.checks.find((check) => check.reasonCode === "feedback_control_plane_only")?.status,
    ).toBe("pass");
  });

  it("blocks semantic truth or memory correction write attempts", async () => {
    const semanticReport = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      forceSemanticTruthWrite: true,
    });
    const correctionReport = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      forceMemoryCorrectionWrite: true,
    });

    expect(semanticReport.decision).toBe("blocked");
    expect(correctionReport.decision).toBe("blocked");
  });

  it("blocks no-dark-data failures and action execution", async () => {
    const darkDataReport = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      forceNoDarkDataFail: true,
    });
    const actionReport = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      forceActionExecution: true,
    });

    expect(darkDataReport.decision).toBe("blocked");
    expect(actionReport.decision).toBe("blocked");
  });

  it("rollback disables tuning effects and returns to neutral ranking", async () => {
    const report = await buildPhase2ProactivityUsefulnessReport({
      now: fixedNow,
      uxEvents: buildNoisyEvents(),
      env: { MODEL_MEMORY_PHASE2_PROACTIVITY_USEFULNESS_TUNING_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.suppressionRules).toHaveLength(0);
    expect(report.whyNotShownDiagnostics).toHaveLength(0);
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2ProactivityUsefulnessReport({ now: fixedNow });
    const artifact = await writePhase2ProactivityUsefulnessArtifact({
      report,
      artifactDir: path.join(os.tmpdir(), `phase2-proactivity-usefulness-${Date.now()}`),
    });

    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.byteLength).toBeGreaterThan(0);
  });
});
