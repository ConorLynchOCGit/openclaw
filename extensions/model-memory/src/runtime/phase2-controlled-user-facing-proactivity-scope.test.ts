import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityScopeReport,
  writePhase2ControlledUserFacingProactivityScopeArtifact,
  assertPhase2ControlledUserFacingProactivityScopeDelivered,
  type Phase2ControlledUserFacingProactivityRolloutScope,
} from "./phase2-controlled-user-facing-proactivity-scope.ts";
import {
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";
import {
  buildPhase2ProactiveMessageExpandedOperatorDefaultReport,
  type Phase2ProactiveMessageExpandedOperatorDefaultReport,
} from "./phase2-proactive-message-expanded-operator-default.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-user-facing-proactivity-scope";
const now = new Date("2026-04-26T16:00:00.000Z");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scope(
  overrides: Partial<Phase2ControlledUserFacingProactivityRolloutScope> = {},
): Phase2ControlledUserFacingProactivityRolloutScope {
  return {
    environment: "live",
    rolloutMode: "controlled_user_scope",
    sessionKey: "main",
    projectId: "openclaw",
    userId: "phase2-approved-user",
    recipientId: "phase2-approved-recipient",
    operatorId: "phase2-operator",
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
    ...overrides,
  };
}

async function prerequisites(): Promise<{
  expanded: Phase2ProactiveMessageExpandedOperatorDefaultReport;
  observability: Phase2ProactiveDeliveryHealthReport;
}> {
  const expanded = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });
  return {
    expanded,
    observability: await buildPhase2ProactiveDeliveryHealthReport({
      now,
      expandedOperatorDefaultReport: expanded,
    }),
  };
}

describe("phase2 controlled user-facing proactivity scope", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("delivers inside the exact approved real user-facing scope", async () => {
    const { expanded, observability } = await prerequisites();
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      expandedOperatorDefaultReport: expanded,
      observabilityReport: observability,
      approvedScope: scope(),
      requestScope: scope(),
      messageClass: "operator_approved_follow_up_available",
    });

    expect(report.decision).toBe("scoped_user_facing_proactivity_delivered");
    expect(report.telemetry.scopeMatched).toBe(true);
    expect(report.telemetry.observabilityStatus).toBe("healthy");
    expect(report.telemetry.liveUserMessageSent).toBe(true);
    assertPhase2ControlledUserFacingProactivityScopeDelivered(report);
  });

  it("requires explicit user, session, project, operator, and recipient fields", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope({ userId: "*" }),
      requestScope: scope({ userId: "*" }),
    });

    expect(report.decision).toBe("blocked_wildcard_scope");
    expect(report.checks.find((check) => check.checkId === "scope:no_wildcard")?.status).toBe(
      "fail",
    );
  });

  it("rejects unknown session", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope(),
      requestScope: scope({ sessionKey: "unknown-session" }),
    });

    expect(report.decision).toBe("blocked_scope");
  });

  it("rejects unknown project", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope(),
      requestScope: scope({ projectId: "unknown-project" }),
    });

    expect(report.decision).toBe("blocked_scope");
  });

  it("rejects unknown user or recipient", async () => {
    const userReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope(),
      requestScope: scope({ userId: "unknown-user" }),
    });
    const recipientReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope(),
      requestScope: scope({ recipientId: "unknown-recipient" }),
    });

    expect(userReport.decision).toBe("blocked_scope");
    expect(recipientReport.decision).toBe("blocked_scope");
  });

  it("rejects unknown operator", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      approvedScope: scope(),
      requestScope: scope({ operatorId: "unknown-operator" }),
    });

    expect(report.decision).toBe("blocked_scope");
  });

  it("requires Slice 32 promotion proof", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      expandedOperatorDefaultReport: null,
    });

    expect(report.decision).toBe("blocked_missing_expanded_operator_default_proof");
  });

  it("requires Slice 33 observability healthy report", async () => {
    const { expanded } = await prerequisites();
    const degraded = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      expandedOperatorDefaultReport: expanded,
      forceMissingApproval: true,
    });
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      expandedOperatorDefaultReport: expanded,
      observabilityReport: degraded,
    });

    expect(report.decision).toBe("blocked_observability_not_healthy");
  });

  it("permits only the two approved message classes", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      messageClass: "external_instruction_message",
    });

    expect(report.decision).toBe("blocked_message_class");
  });

  it("blocks without explicit send approval", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      explicitSendApproval: false,
    });

    expect(report.decision).toBe("blocked_missing_send_approval");
  });

  it("blocks on no-dark-data failure", async () => {
    const { expanded, observability } = await prerequisites();
    const failed = clone(observability);
    failed.noDarkDataStatus = "fail";
    failed.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      expandedOperatorDefaultReport: expanded,
      observabilityReport: failed,
    });

    expect(report.decision).toBe("blocked_observability_not_healthy");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks on missing provenance", async () => {
    const { expanded, observability } = await prerequisites();
    const missing = clone(expanded);
    missing.telemetry.sourceRefIds = [];
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      expandedOperatorDefaultReport: missing,
      observabilityReport: observability,
    });

    expect(report.decision).toBe("blocked_provenance");
  });

  it("rollback disables scoped real user-facing delivery", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      now,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.deliveryEvidence.liveUserMessageSent).toBe(false);
  });

  it("payload contains provenance and excludes raw/private content", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({ now });

    expect(report.telemetry.sourceRefs.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.deliveryEvidence.actionExecution).toBe(false);
    expect(report.policy.broadDefaultProactivityEnabled).toBe(false);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({ now });
    const artifact = await writePhase2ControlledUserFacingProactivityScopeArtifact({
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
    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({ now });

    await expect(
      writePhase2ControlledUserFacingProactivityScopeArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
