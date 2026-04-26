import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPhase2ProactiveDeliveryHealthReport } from "./phase2-proactive-delivery-observability.ts";
import { buildPhase2ProactivityDefaultReadinessReport } from "./phase2-proactivity-default-readiness.ts";
import {
  buildPhase2UserFacingProactivityDefaultPromotionReport,
  writePhase2UserFacingProactivityDefaultPromotionArtifact,
} from "./phase2-user-facing-proactivity-default-promotion.ts";

describe("phase2 user-facing proactivity default promotion", () => {
  it("approves exactly the two low-risk classes for eligible users after readiness", async () => {
    const report = await buildPhase2UserFacingProactivityDefaultPromotionReport({
      now: new Date("2026-04-26T15:30:00.000Z"),
      proofMarker: "phase2-user-facing-default-green",
      messageClass: "operator_approved_follow_up_available",
    });

    expect(report.decision).toBe("approved_for_default_eligible_user_facing_delivery");
    expect(report.config.allowedMessageClasses).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.telemetry.explicitSendApprovalRequired).toBe(true);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("blocks without ready Slice 37 readiness", async () => {
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ readinessReport: null }),
    ).resolves.toMatchObject({ decision: "blocked" });

    const partial = await buildPhase2ProactivityDefaultReadinessReport({
      forceSendApprovalNotMandatory: true,
    });
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ readinessReport: partial }),
    ).resolves.toMatchObject({ decision: "blocked" });
  });

  it("blocks degraded observability, missing send approval, autonomous sending, and action execution", async () => {
    const degraded = await buildPhase2ProactiveDeliveryHealthReport({
      forceMissingApproval: true,
    });
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ observabilityReport: degraded }),
    ).resolves.toMatchObject({ decision: "blocked" });
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ explicitSendApproval: false }),
    ).resolves.toMatchObject({ decision: "partial_approval" });
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ forceAutonomousSending: true }),
    ).resolves.toMatchObject({ decision: "partial_approval" });
    await expect(
      buildPhase2UserFacingProactivityDefaultPromotionReport({ forceActionExecution: true }),
    ).resolves.toMatchObject({ decision: "partial_approval" });
  });

  it("blocks non-eligible users and blocked message classes", async () => {
    const nonEligible = await buildPhase2UserFacingProactivityDefaultPromotionReport({
      eligibleUserScope: false,
    });
    const blockedClass = await buildPhase2UserFacingProactivityDefaultPromotionReport({
      messageClass: "external_instruction_message",
    });

    expect(nonEligible.decision).toBe("partial_approval");
    expect(nonEligible.eligibleUserDeliveryObserved).toBe(false);
    expect(blockedClass.decision).toBe("partial_approval");
    expect(
      blockedClass.checks.find((check) => check.reasonCode === "approved_message_class_required")
        ?.status,
    ).toBe("fail");
  });

  it("rollback kill-switch disables default-eligible delivery", async () => {
    const report = await buildPhase2UserFacingProactivityDefaultPromotionReport({
      env: { MODEL_MEMORY_PHASE2_USER_FACING_PROACTIVITY_DEFAULT_DISABLED: "1" },
    });

    expect(report.decision).toBe("partial_approval");
    expect(
      report.checks.find((check) => check.reasonCode === "rollback_kill_switch_inactive")?.status,
    ).toBe("fail");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-user-facing-default-"));
    try {
      const report = await buildPhase2UserFacingProactivityDefaultPromotionReport();
      const artifact = await writePhase2UserFacingProactivityDefaultPromotionArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("User-Facing Proactivity Default Promotion");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
