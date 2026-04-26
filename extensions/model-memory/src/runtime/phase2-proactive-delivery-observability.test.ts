import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ProactiveDeliveryObservabilityHealthy,
  buildPhase2ProactiveDeliveryHealthReport,
  writePhase2ProactiveDeliveryObservabilityArtifact,
} from "./phase2-proactive-delivery-observability.ts";

const TEMP_ROOT = ".artifacts/test-phase2-proactive-delivery-observability";
const now = new Date("2026-04-26T15:00:00.000Z");

describe("phase2 proactive delivery observability", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("builds a healthy report for both approved proactive message classes", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({ now });

    expect(report.status).toBe("healthy");
    expect(report.telemetrySummaries.map((summary) => summary.messageClass)).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.telemetry.deliveryIds.length).toBe(2);
    expect(report.telemetry.sendApprovalIds.length).toBe(2);
    expect(report.telemetry.autonomousSendingAllowed).toBe(false);
    expect(report.telemetry.broadDefaultProactivityEnabled).toBe(false);
    assertPhase2ProactiveDeliveryObservabilityHealthy(report);
  });

  it("includes blocked reason code counts and regression cases", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingSendApproval: true,
      forceBlockedMessageClassDelivery: true,
    });

    expect(report.status).toBe("degraded");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_missing_send_approval");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_message_class");
    expect(report.regressionCases.filter((testCase) => testCase.status === "fail")).toHaveLength(2);
  });

  it("includes source refs, source profiles, authority tiers, hashes, and latency stats", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({ now });
    const summary = report.telemetrySummaries[0];

    expect(summary.sourceRefs.length).toBeGreaterThan(0);
    expect(summary.sourceProfileIds.length).toBeGreaterThan(0);
    expect(summary.authorityTiers.length).toBeGreaterThan(0);
    expect(summary.proofHashes.length).toBeGreaterThan(0);
    expect(summary.latencyMs.p95).toBeGreaterThanOrEqual(summary.latencyMs.p50);
    expect(summary.budget.overflow).toBe(false);
  });

  it("alerts and blocks on missing provenance", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingProvenance: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.telemetry.alertReasonCodes).toContain("alert_missing_provenance");
    expect(
      report.healthChecks.find((check) => check.checkId === "provenance:present")?.status,
    ).toBe("fail");
  });

  it("records outside-scope delivery regression as blocked_scope", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceDeliveryOutsideScope: true,
    });

    expect(report.status).toBe("degraded");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_scope");
  });

  it("records missing approval regression", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingApproval: true,
    });

    expect(report.status).toBe("degraded");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_missing_approval");
  });

  it("records raw/private leakage as a critical alert and fails health", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRawPrivateContentLeakage: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.telemetry.alertReasonCodes).toContain("alert_leakage_detected");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("keeps external imperative text as evidence, never instruction", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceExternalInstruction: true,
    });

    expect(report.status).toBe("degraded");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_external_instruction");
  });

  it("blocks or downgrades repeated and stale suggestions with reason codes", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRepeatedSuggestion: true,
      forceStaleSuggestion: true,
    });

    expect(report.status).toBe("degraded");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_repeated_suggestion");
    expect(report.telemetry.alertReasonCodes).toContain("blocked_stale_suggestion");
  });

  it("proves rollback disables all proactive delivery", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      env: { MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK: "1" },
    });

    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.rollbackProof.allProactiveDeliveryDisabled).toBe(true);
    expect(report.telemetrySummaries.every((summary) => summary.deliveredCount === 0)).toBe(true);
  });

  it("detects rollback bypass", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRollbackBypass: true,
    });

    expect(report.status).toBe("blocked");
    expect(report.telemetry.alertReasonCodes).toContain("alert_rollback_bypass");
    expect(report.rollbackProof.allProactiveDeliveryDisabled).toBe(false);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({ now });
    const artifact = await writePhase2ProactiveDeliveryObservabilityArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    expect(artifact.byteLength).toBeGreaterThan(0);
    expect(artifact.byteLength).toBeLessThan(256 * 1024);
    await expect(fs.stat(artifact.markdownPath)).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
  });

  it("rejects prohibited raw-content keys", async () => {
    const report = await buildPhase2ProactiveDeliveryHealthReport({ now });

    await expect(
      writePhase2ProactiveDeliveryObservabilityArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
