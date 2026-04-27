import { describe, expect, it } from "vitest";
import type { Phase2LiveProactivitySignalSource } from "./phase2-live-proactivity-signals.ts";
import {
  assertPhase2ProactivityNoiseBudgetApplied,
  buildPhase2ProactivityNoiseBudgetReport,
} from "./phase2-proactivity-signal-noise-budget.ts";

function source(id: string, contentHash = id): Phase2LiveProactivitySignalSource {
  return {
    sourceId: id,
    sourceType: "session_runtime_event",
    signalKind: "active_work_state",
    projectId: "openclaw",
    sessionKey: "main",
    boundedSummary: `Source ${id} describes a bounded live proactive planning opportunity.`,
    sourceRefs: [`gateway://noise/${id}`],
    sourceProfileId: "tool_result_capture",
    authorityTier: "tool_grounded",
    contentHash,
    proofHash: `proof-${id}`,
    freshness: "recent",
    conflictState: "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
    limitations: [],
  };
}

describe("phase2 proactivity signal noise budget", () => {
  it("keeps first live signal and suppresses repeated same-content signals", async () => {
    const report = await buildPhase2ProactivityNoiseBudgetReport({
      sources: [source("one", "same"), source("two", "same")],
    });
    assertPhase2ProactivityNoiseBudgetApplied(report);
    expect(report.eligibleSources.map((entry) => entry.sourceId)).toEqual(["one"]);
    expect(report.suppressionDecisions[1]).toMatchObject({
      sourceId: "two",
      suppressed: true,
      reasonCodes: ["cooldown_same_content"],
    });
    expect(report.whyNotShownDiagnostics[0]).toMatchObject({
      sourceId: "two",
      shown: false,
      displayLocation: "proactivity_diagnostics",
    });
  });

  it("applies recurrence limits by signal kind and source type", async () => {
    const report = await buildPhase2ProactivityNoiseBudgetReport({
      sources: [source("one"), source("two"), source("three")],
    });
    expect(report.eligibleSources.map((entry) => entry.sourceId)).toEqual(["one", "two"]);
    expect(report.suppressionDecisions[2]?.reasonCodes).toContain("threshold_signal_kind_exceeded");
    expect(report.suppressionDecisions[2]?.reasonCodes).toContain("recurrence_limit_exceeded");
  });

  it("uses bounded feedback as control-plane suppression only", async () => {
    const report = await buildPhase2ProactivityNoiseBudgetReport({
      sources: [source("one", "feedback-hash")],
      feedbackByContentHash: { "feedback-hash": ["dismissed", "not_useful"] },
    });
    expect(report.eligibleSources).toEqual([]);
    expect(report.suppressionDecisions[0]).toMatchObject({
      suppressed: true,
      reasonCodes: ["feedback_suppressed_signal"],
    });
    expect(report.policy.feedbackCreatesSemanticTruth).toBe(false);
    expect(report.telemetry.semanticTruthWriteObserved).toBe(false);
  });

  it("blocks no-dark-data and action-execution failures", async () => {
    const report = await buildPhase2ProactivityNoiseBudgetReport({
      sources: [source("one")],
      forceNoDarkDataFail: true,
      forceActionExecution: true,
    });
    expect(report.decision).toBe("blocked");
    expect(report.telemetry.noDarkDataStatus).toBe("fail");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "no_dark_data_required", status: "fail" }),
        expect.objectContaining({ reasonCode: "no_action_execution", status: "fail" }),
      ]),
    );
  });
});
