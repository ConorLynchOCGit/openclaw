import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityScopeReport,
  type Phase2ControlledUserFacingProactivityScopeReport,
} from "./phase2-controlled-user-facing-proactivity-scope.ts";
import {
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";
import {
  assertPhase2ProactivityScopeExpansionApproved,
  buildPhase2ProactivityScopeExpansionDecisionReport,
  writePhase2ProactivityScopeExpansionArtifact,
  type Phase2ExpandedControlledUserFacingScope,
} from "./phase2-proactivity-scope-expansion-decision.ts";

const TEMP_ROOT = ".artifacts/test-phase2-proactivity-scope-expansion-decision";
const now = new Date("2026-04-26T17:00:00.000Z");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function prerequisites(): Promise<{
  scoped: Phase2ControlledUserFacingProactivityScopeReport;
  observability: Phase2ProactiveDeliveryHealthReport;
}> {
  const scoped = await buildPhase2ControlledUserFacingProactivityScopeReport({ now });
  return {
    scoped,
    observability: await buildPhase2ProactiveDeliveryHealthReport({ now }),
  };
}

function wildcardScope(): Phase2ExpandedControlledUserFacingScope {
  return {
    environment: "live",
    rolloutMode: "expanded_controlled_user_scope",
    scopeId: "bad-wildcard-scope",
    allowedSessionKeys: ["*"],
    allowedProjectIds: ["openclaw"],
    allowedUserIds: ["phase2-approved-user"],
    allowedRecipientIds: ["phase2-approved-recipient"],
    allowedOperatorIds: ["phase2-operator"],
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
  };
}

describe("phase2 proactivity scope expansion decision", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves only an explicit expanded controlled scope with clean telemetry", async () => {
    const { scoped, observability } = await prerequisites();
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
    });

    expect(report.decision).toBe("approved_for_expanded_controlled_scope");
    expect(report.candidate.expandedScope.rolloutMode).toBe("expanded_controlled_user_scope");
    expect(report.candidate.expandedScope.allowedUserIds.length).toBeGreaterThan(1);
    expect(report.config.broadDefaultProactivityEnabled).toBe(false);
    expect(report.config.autonomousSendingEnabled).toBe(false);
    assertPhase2ProactivityScopeExpansionApproved(report);
  });

  it("blocks without Slice 34 scoped proof", async () => {
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_missing_slice34_scope_proof");
  });

  it("blocks without Slice 33 observability proof", async () => {
    const { scoped } = await prerequisites();
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_missing_slice33_observability");
  });

  it("blocks on wrong Slice 34 report id", async () => {
    const { scoped, observability } = await prerequisites();
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
      expectedSlice34ReportId: "wrong-report-id",
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_wrong_slice34_report_id");
  });

  it("blocks when observability is degraded", async () => {
    const { scoped } = await prerequisites();
    const degraded = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingApproval: true,
    });
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: degraded,
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_observability_degraded");
    expect(report.blockedReasonCodes).toContain("blocked_missing_approval");
  });

  it("blocks when observability is blocked", async () => {
    const { scoped } = await prerequisites();
    const blocked = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRawPrivateContentLeakage: true,
    });
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: blocked,
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_observability_blocked");
    expect(report.blockedReasonCodes).toContain("blocked_leakage_alert");
  });

  it("blocks on outside-scope delivery evidence", async () => {
    const { scoped } = await prerequisites();
    const observability = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceDeliveryOutsideScope: true,
    });
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
    });

    expect(report.blockedReasonCodes).toContain("blocked_outside_scope_delivery");
  });

  it("blocks on missing explicit send approval evidence", async () => {
    const { scoped } = await prerequisites();
    const observability = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingSendApproval: true,
    });
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
    });

    expect(report.blockedReasonCodes).toContain("blocked_missing_send_approval");
  });

  it("blocks rollback bypass and repeated or stale suggestions", async () => {
    const { scoped } = await prerequisites();
    const observability = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRollbackBypass: true,
      forceStaleSuggestion: true,
    });
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
    });

    expect(report.blockedReasonCodes).toContain("blocked_rollback_bypass");
    expect(report.blockedReasonCodes).toContain("blocked_repeated_or_stale_suggestion");
  });

  it("blocks wildcard or global expanded scopes", async () => {
    const { scoped, observability } = await prerequisites();
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: scoped,
      observabilityReport: observability,
      candidateScope: wildcardScope(),
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_wildcard_scope");
  });

  it("keeps approved message classes send-approval required with no autonomous defaults", async () => {
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({ now });

    expect(report.config.allowedMessageClasses).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.config.requireExplicitSendApproval).toBe(true);
    expect(report.config.autonomousSendingEnabled).toBe(false);
    expect(report.config.broadDefaultProactivityEnabled).toBe(false);
  });

  it("blocks on no-dark-data failure in scoped proof", async () => {
    const { scoped, observability } = await prerequisites();
    const failed = clone(scoped);
    failed.noDarkDataStatus = "fail";
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({
      now,
      scopedDeliveryReport: failed,
      observabilityReport: observability,
    });

    expect(report.decision).toBe("blocked");
    expect(report.blockedReasonCodes).toContain("blocked_no_dark_data");
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({ now });
    const artifact = await writePhase2ProactivityScopeExpansionArtifact({
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
    const report = await buildPhase2ProactivityScopeExpansionDecisionReport({ now });

    await expect(
      writePhase2ProactivityScopeExpansionArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
