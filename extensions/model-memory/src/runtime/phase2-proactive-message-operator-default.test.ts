import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityReport,
  type Phase2ControlledUserFacingProactivityReport,
} from "./phase2-controlled-user-facing-proactivity.ts";
import {
  buildPhase2LiveProactiveMessageDeliveryReport,
  type Phase2LiveProactiveMessageDeliveryAdapter,
  type Phase2LiveProactiveMessageDeliveryReport,
} from "./phase2-live-proactive-message-delivery.ts";
import {
  assertPhase2ProactiveMessageOperatorDefaultApproved,
  buildPhase2ProactiveMessageOperatorDefaultReport,
  writePhase2ProactiveMessageOperatorDefaultArtifact,
} from "./phase2-proactive-message-operator-default.ts";

const TEMP_ROOT = ".artifacts/test-phase2-proactive-message-operator-default";
const now = new Date("2026-04-26T10:00:00.000Z");
const scope = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
};

function requestScope() {
  return { ...scope, purpose: "operator_eval" as const };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function adapter(): Phase2LiveProactiveMessageDeliveryAdapter {
  return {
    kind: "gateway_chat_inject",
    deliver(input) {
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `operator-default-${input.message.messageId}`,
        observableInOperatorUi: true,
        resultHash: "operator-default-adapter-result-hash",
        reasonCodes: ["gateway_chat_inject_delivered"],
      };
    },
  };
}

async function controlledReport(
  input: Partial<Parameters<typeof buildPhase2ControlledUserFacingProactivityReport>[0]> = {},
): Promise<Phase2ControlledUserFacingProactivityReport> {
  return buildPhase2ControlledUserFacingProactivityReport({
    now,
    proofMarker: "PHASE2-PROACTIVE-MESSAGE-OPERATOR-DEFAULT-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
    explicitSendApproval: true,
    ...input,
  });
}

async function liveDeliveryReport(
  input: Partial<Parameters<typeof buildPhase2LiveProactiveMessageDeliveryReport>[0]> = {},
): Promise<Phase2LiveProactiveMessageDeliveryReport> {
  return buildPhase2LiveProactiveMessageDeliveryReport({
    now,
    proofMarker: "PHASE2-PROACTIVE-MESSAGE-OPERATOR-DEFAULT-TEST",
    controlledReport: await controlledReport(),
    adapter: adapter(),
    ...input,
  });
}

describe("phase2 proactive message operator default", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves only the operator-visible send workflow after Slice 28 and Slice 29 proofs", async () => {
    const controlled = await controlledReport();
    const live = await liveDeliveryReport({ controlledReport: controlled });
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: controlled,
      liveDeliveryReport: live,
    });

    expect(report.decision).toBe("approved_for_default_operator_visible_send_workflow");
    expect(report.config.allowedMessageClasses).toEqual(["operator_approved_suggestion_available"]);
    expect(report.config.requireExplicitSendApproval).toBe(true);
    expect(report.config.automaticSendAllowed).toBe(false);
    expect(report.config.autonomousSendingAllowed).toBe(false);
    expect(report.config.broadDefaultProactivityAllowed).toBe(false);
    expect(report.telemetry.defaultVisibleOperatorSendWorkflowObserved).toBe(true);
    assertPhase2ProactiveMessageOperatorDefaultApproved(report);
  });

  it("blocks without Slice 28 controlled user-facing proof", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: null,
      liveDeliveryReport: await liveDeliveryReport(),
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.checks.find((check) => check.checkId === "proof:slice28_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks without Slice 29 live delivery proof", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: null,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.checks.find((check) => check.checkId === "proof:slice29_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks failed no-dark-data status", async () => {
    const controlled = clone(await controlledReport());
    const live = clone(await liveDeliveryReport({ controlledReport: controlled }));
    controlled.noDarkDataStatus = "fail";
    controlled.telemetry.noDarkDataStatus = "fail";
    live.noDarkDataStatus = "fail";
    live.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: controlled,
      liveDeliveryReport: live,
    });

    expect(report.decision).toBe("blocked");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks when send approval is not explicit", async () => {
    const controlled = clone(await controlledReport());
    const live = clone(await liveDeliveryReport({ controlledReport: controlled }));
    controlled.telemetry.explicitSendApproval = false;
    live.telemetry.explicitSendApproval = false;
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: controlled,
      liveDeliveryReport: live,
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.reasonCodes).toContain("explicit_send_approval_required");
  });

  it("blocks if autonomous sending is enabled", async () => {
    const live = clone(await liveDeliveryReport());
    live.telemetry.autonomousSendingEnabled = true as false;
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      liveDeliveryReport: live,
      controlledUserFacingProactivityReport: live.controlledReport,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.telemetry.reasonCodes).toContain("autonomous_sending_must_remain_off");
  });

  it("exposes only the approved low-risk message class", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });

    expect(report.config.allowedMessageClasses).toEqual(["operator_approved_suggestion_available"]);
    expect(report.config.blockedMessageClasses).toContain("external_instruction_message");
    expect(report.capabilityDecision.autonomousSendingAllowed).toBe(false);
  });

  it("keeps operator_approved_suggestion_available send-approval required", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });

    expect(report.config.requireStagedApproval).toBe(true);
    expect(report.config.requireExplicitSendApproval).toBe(true);
    expect(report.capabilityDecision.explicitSendApprovalRequired).toBe(true);
  });

  it("rollback kill-switch disables default-visible send workflow", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
      env: { MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_OPERATOR_DEFAULT_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.telemetry.defaultVisibleOperatorSendWorkflowObserved).toBe(false);
  });

  it("preserves audit and provenance metadata from proof reports", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });

    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.telemetry.proofHashes.length).toBeGreaterThan(0);
  });

  it("treats project docs and external text as evidence, not instructions", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });

    expect(report.config.externalTextHandling).toBe("evidence_not_instruction");
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });
    const artifact = await writePhase2ProactiveMessageOperatorDefaultArtifact({
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
    const report = await buildPhase2ProactiveMessageOperatorDefaultReport({
      now,
      controlledUserFacingProactivityReport: await controlledReport(),
      liveDeliveryReport: await liveDeliveryReport(),
    });

    await expect(
      writePhase2ProactiveMessageOperatorDefaultArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
