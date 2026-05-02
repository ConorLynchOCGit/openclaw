import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2AutoSendSimulationObserved,
  buildPhase2AutoSendSimulationObservabilityReport,
  writePhase2AutoSendSimulationArtifact,
  type Phase2AutoSendSimulationObservabilityInput,
} from "./phase2-autosend-simulation-observability.ts";

describe("phase2 autosend simulation observability", () => {
  it("reports simulated auto-send candidates and compares manual decisions", async () => {
    const report = await buildPhase2AutoSendSimulationObservabilityReport({
      now: new Date("2026-04-26T19:00:00.000Z"),
      queueItemStatus: "sent",
      uiEvidence: {
        sessionKey: "main",
        simulationReportVisible: true,
        comparisonVisible: true,
        controlSignalsVisible: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("simulation_observability_enabled");
    expect(report.observations[0]).toMatchObject({
      wouldHaveAutoSent: true,
      actualManualDecision: "approved_manually",
    });
    expect(report.comparisons[0]).toMatchObject({
      wouldHaveAutoSent: true,
      matchedManualDecision: true,
    });
    expect(report.healthReport.approvedManuallyCount).toBe(1);
    expect(report.telemetry.automaticSendExecution).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2AutoSendSimulationObserved(report);
  });

  it.each([
    ["dismissed", "dismissed", "dismissedCount"],
    ["snoozed", "snoozed", "snoozedCount"],
    ["blocked", "blocked", "blockedCount"],
  ] as const)("tracks %s explicit control signal", async (status, decision, countKey) => {
    const report = await buildPhase2AutoSendSimulationObservabilityReport({
      queueItemStatus: status,
    });

    expect(report.observations[0]?.actualManualDecision).toBe(decision);
    expect(report.healthReport[countKey]).toBe(1);
    expect(report.telemetry.autonomousMessageEmitted).toBe(false);
  });

  it.each([
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["urgency manipulation", { forceUrgencyManipulation: true }, "urgency_manipulation_blocked"],
    ["stale suggestion", { forceStaleSuggestion: true }, "stale_repeat_blocked"],
    ["repeated suggestion", { forceRepeatedSuggestion: true }, "stale_repeat_blocked"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["leakage", { forceLeakage: true }, "leakage_blocked"],
    [
      "external instruction",
      { forceExternalInstruction: true },
      "external_text_evidence_not_instruction",
    ],
  ] satisfies Array<[string, Phase2AutoSendSimulationObservabilityInput, string]>)(
    "blocks or degrades %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2AutoSendSimulationObservabilityReport(input);

      expect(report.healthReport.status).toBe("degraded");
      expect(report.healthReport.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.automaticSendExecution).toBe(false);
      expect(report.telemetry.actionExecutionObserved).toBe(false);
    },
  );

  it("rollback disables simulation observability", async () => {
    const report = await buildPhase2AutoSendSimulationObservabilityReport({
      env: { MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.healthReport.status).toBe("blocked");
    expect(report.rollbackPlan.disablesSimulationObservability).toBe(true);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-autosend-simulation-"));
    try {
      const report = await buildPhase2AutoSendSimulationObservabilityReport();
      const artifact = await writePhase2AutoSendSimulationArtifact({ report, artifactDir: dir });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Auto-Send Simulation Observability");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
