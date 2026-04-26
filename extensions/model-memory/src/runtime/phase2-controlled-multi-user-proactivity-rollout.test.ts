import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPhase2ControlledMultiUserProactivityObserved,
  buildPhase2ControlledMultiUserProactivityReport,
  writePhase2ControlledMultiUserProactivityArtifact,
  type Phase2ControlledMultiUserRolloutScope,
} from "./phase2-controlled-multi-user-proactivity-rollout.ts";
import { buildPhase2ProactiveDeliveryHealthReport } from "./phase2-proactive-delivery-observability.ts";
import { buildPhase2ProactivityScopeExpansionDecisionReport } from "./phase2-proactivity-scope-expansion-decision.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-multi-user-proactivity-rollout";
const now = new Date("2026-04-26T18:00:00.000Z");

function cohort(overrides: Partial<Phase2ControlledMultiUserRolloutScope> = {}) {
  return {
    environment: "live",
    rolloutMode: "controlled_multi_user_scope",
    cohortId: "test-cohort",
    recipients: [
      {
        recipientId: "recipient-a",
        userId: "user-a",
        sessionKey: "main",
        projectId: "openclaw",
        operatorId: "operator-a",
        sendApprovalIds: ["approval-a"],
      },
      {
        recipientId: "recipient-b",
        userId: "user-b",
        sessionKey: "session-b",
        projectId: "openclaw",
        operatorId: "operator-a",
        sendApprovalIds: ["approval-b"],
      },
    ],
    allowedMessageClasses: [
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ],
    ...overrides,
  } as Phase2ControlledMultiUserRolloutScope;
}

describe("phase2 controlled multi-user proactivity rollout", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("delivers to an exact approved cohort recipient with per-recipient send approval", async () => {
    const rolloutScope = cohort();
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: rolloutScope.recipients[1],
      messageClass: "operator_approved_follow_up_available",
    });

    expect(report.decision).toBe("controlled_multi_user_delivery_observed");
    expect(report.telemetry.deliveredRecipientIds).toEqual(["recipient-b"]);
    expect(report.deliveryEvidence[0]?.sendApprovalId).toBe("approval-b");
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    assertPhase2ControlledMultiUserProactivityObserved(report);
  });

  it("requires explicit users, sessions, projects, operators, and recipients", async () => {
    const rolloutScope = cohort();
    rolloutScope.recipients[0].userId = "*";
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: rolloutScope.recipients[0],
    });

    expect(report.decision).toBe("blocked_wildcard_scope");
  });

  it("rejects unknown user or recipient", async () => {
    const rolloutScope = cohort();
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: {
        ...rolloutScope.recipients[0],
        userId: "unknown-user",
      },
    });

    expect(report.decision).toBe("blocked_non_cohort_recipient");
    expect(report.nonCohortBlocked).toBe(true);
  });

  it("rejects unknown session", async () => {
    const rolloutScope = cohort();
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: {
        ...rolloutScope.recipients[0],
        sessionKey: "unknown-session",
      },
    });

    expect(report.decision).toBe("blocked_non_cohort_recipient");
  });

  it("rejects unknown project or operator", async () => {
    const rolloutScope = cohort();
    const unknownProject = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: {
        ...rolloutScope.recipients[0],
        projectId: "unknown-project",
      },
    });
    const unknownOperator = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      rolloutScope,
      requestRecipient: {
        ...rolloutScope.recipients[0],
        operatorId: "unknown-operator",
      },
    });

    expect(unknownProject.decision).toBe("blocked_non_cohort_recipient");
    expect(unknownOperator.decision).toBe("blocked_non_cohort_recipient");
  });

  it("requires Slice 35 expansion decision", async () => {
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      scopeExpansionReport: null,
    });

    expect(report.decision).toBe("blocked_missing_scope_expansion_decision");
  });

  it("requires healthy observability", async () => {
    const scopeExpansionReport = await buildPhase2ProactivityScopeExpansionDecisionReport({ now });
    const degraded = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceMissingSendApproval: true,
    });
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      scopeExpansionReport,
      observabilityReport: degraded,
    });

    expect(report.decision).toBe("blocked_observability_not_healthy");
  });

  it("permits only approved message classes", async () => {
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      messageClass: "external_instruction_message",
    });

    expect(report.decision).toBe("blocked_message_class");
  });

  it("blocks without per-recipient send approval", async () => {
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      perRecipientSendApproval: false,
    });

    expect(report.decision).toBe("blocked_missing_per_recipient_send_approval");
  });

  it("blocks on no-dark-data failure", async () => {
    const scopeExpansionReport = await buildPhase2ProactivityScopeExpansionDecisionReport({ now });
    const observabilityReport = await buildPhase2ProactiveDeliveryHealthReport({
      now,
      forceRawPrivateContentLeakage: true,
    });
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      scopeExpansionReport,
      observabilityReport,
    });

    expect(report.decision).toBe("blocked_observability_not_healthy");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks when rollback is active", async () => {
    const report = await buildPhase2ControlledMultiUserProactivityReport({
      now,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ControlledMultiUserProactivityReport({ now });
    const artifact = await writePhase2ControlledMultiUserProactivityArtifact({
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
    const report = await buildPhase2ControlledMultiUserProactivityReport({ now });

    await expect(
      writePhase2ControlledMultiUserProactivityArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
