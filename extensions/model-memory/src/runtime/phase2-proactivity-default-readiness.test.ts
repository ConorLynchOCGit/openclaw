import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2ProactiveDeliveryHealthReport } from "./phase2-proactive-delivery-observability.ts";
import {
  buildPhase2ProactivityDefaultReadinessReport,
  writePhase2ProactivityDefaultReadinessArtifact,
} from "./phase2-proactivity-default-readiness.ts";

describe("phase2 proactivity default readiness", () => {
  it("reports ready only after all prerequisite proofs and safety criteria pass", async () => {
    const report = await buildPhase2ProactivityDefaultReadinessReport({
      now: new Date("2026-04-26T15:00:00.000Z"),
      proofMarker: "phase2-readiness-green",
    });

    expect(report.decision).toBe("ready_for_default_promotion_decision");
    expect(report.telemetry.proofReportIds).toHaveLength(5);
    expect(report.telemetry.sendApprovalCoverage).toBe("complete");
    expect(report.telemetry.deliverySuccessCount).toBeGreaterThanOrEqual(2);
    expect(report.telemetry.defaultPromotionAppliedByThisSlice).toBe(false);
    expect(report.defaultPromotionApplied).toBe(false);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks without each required prerequisite proof", async () => {
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ expandedOperatorDefaultReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ observabilityReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ scopedDeliveryReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ scopeExpansionReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ cohortRolloutReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });
  });

  it("blocks on failed no-dark-data, missing send approval, autonomous send, or action execution", async () => {
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ forceNoDarkDataFail: true }),
    ).resolves.toMatchObject({ decision: "partial_readiness", noDarkDataStatus: "fail" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ forceSendApprovalNotMandatory: true }),
    ).resolves.toMatchObject({ decision: "partial_readiness" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ forceAutonomousSending: true }),
    ).resolves.toMatchObject({ decision: "partial_readiness" });
    await expect(
      buildPhase2ProactivityDefaultReadinessReport({ forceActionExecution: true }),
    ).resolves.toMatchObject({ decision: "partial_readiness" });
  });

  it("blocks on blocked-class delivery, outside-scope delivery, leakage, missing provenance, or stale repeat regression", async () => {
    for (const input of [
      { forceBlockedClassDelivery: true },
      { forceOutsideScopeDelivery: true },
      { forceLeakageAlert: true },
      { forceMissingProvenance: true },
      { forceStaleRepeatRegression: true },
    ]) {
      const report = await buildPhase2ProactivityDefaultReadinessReport(input);
      expect(report.decision).toBe("partial_readiness");
      expect(report.checks.some((check) => check.status === "fail")).toBe(true);
    }
  });

  it("blocks when observability is degraded", async () => {
    const degraded = await buildPhase2ProactiveDeliveryHealthReport({
      forceMissingApproval: true,
    });
    const report = await buildPhase2ProactivityDefaultReadinessReport({
      observabilityReport: degraded,
    });

    expect(report.decision).toBe("blocked");
    expect(
      report.checks.find((check) => check.reasonCode === "slice33_healthy_observability_required")
        ?.status,
    ).toBe("fail");
  });

  it("writes bounded JSON and Markdown artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-proactivity-readiness-"));
    try {
      const report = await buildPhase2ProactivityDefaultReadinessReport();
      const artifact = await writePhase2ProactivityDefaultReadinessArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Phase 2 Proactivity Default Readiness");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("private-phrase-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
