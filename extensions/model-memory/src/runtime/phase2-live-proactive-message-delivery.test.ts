import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityReport,
  type Phase2ControlledUserFacingProactivityReport,
} from "./phase2-controlled-user-facing-proactivity.ts";
import {
  assertPhase2LiveProactiveMessageDeliveryProven,
  buildPhase2LiveProactiveMessageDeliveryReport,
  writePhase2LiveProactiveMessageDeliveryArtifact,
  type Phase2LiveProactiveMessageDeliveryAdapter,
} from "./phase2-live-proactive-message-delivery.ts";

const TEMP_ROOT = ".artifacts/test-phase2-live-proactive-message-delivery";
const now = new Date("2026-04-26T09:00:00.000Z");
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
      expect(input.boundedDisplayText).toBe("An approved operator suggestion is available.");
      expect(input.label).toBe("Model Memory");
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `gateway-${input.message.messageId}`,
        observableInOperatorUi: true,
        resultHash: "adapter-result-hash",
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
    proofMarker: "PHASE2-LIVE-PROACTIVE-DELIVERY-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
    explicitSendApproval: true,
    ...input,
  });
}

describe("phase2 live proactive message delivery", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("delivers the approved message class through the live gateway inject adapter", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport(),
      adapter: adapter(),
    });

    expect(report.decision).toBe("live_proactive_message_delivered");
    expect(report.policy.deliveryAdapterKind).toBe("gateway_chat_inject");
    expect(report.controlledReport.messageClass).toBe("operator_approved_suggestion_available");
    expect(report.deliveryResult.deliveryMode).toBe("gateway_chat_inject");
    expect(report.deliveryResult.liveUserMessageSent).toBe(true);
    expect(report.telemetry.broadDefaultProactivityEnabled).toBe(false);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    assertPhase2LiveProactiveMessageDeliveryProven(report);
  });

  it("blocks outside approved scope before using the adapter", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport({
        requestScope: { ...requestScope(), operatorId: "outside-operator" },
      }),
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_scope");
    expect(report.deliveryResult.delivered).toBe(false);
  });

  it("blocks without staged approval", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport({ approvalReport: null }),
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_missing_approval");
  });

  it("blocks without explicit send approval", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport({ explicitSendApproval: false }),
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_missing_send_approval");
  });

  it("blocks no-dark-data failures", async () => {
    const controlled = clone(await controlledReport());
    controlled.noDarkDataStatus = "fail";
    controlled.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: controlled,
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_no_dark_data");
  });

  it("blocks missing provenance", async () => {
    const controlled = clone(await controlledReport());
    if (!controlled.message) {
      throw new Error("test fixture missing controlled message");
    }
    controlled.message.sourceRefIds = [];
    controlled.message.sourceProfileIds = [];
    controlled.message.authorityTiers = [];
    controlled.message.contentHashes = [];
    controlled.message.proofHashes = [];
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: controlled,
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_provenance");
  });

  it("blocks when rollback is active", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport(),
      adapter: adapter(),
      env: { MODEL_MEMORY_PHASE2_LIVE_PROACTIVE_DELIVERY_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
  });

  it("blocks unsafe message classes", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport({ messageClass: "external_instruction_message" }),
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_message_class");
  });

  it("blocks when no live delivery adapter is provided", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport(),
    });

    expect(report.decision).toBe("blocked_delivery_adapter");
  });

  it("emits bounded delivery telemetry and audit metadata", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport(),
      adapter: adapter(),
    });

    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(
      report.telemetry.contentHashes.length + report.telemetry.proofHashes.length,
    ).toBeGreaterThan(0);
    expect(report.auditTrail[0]).toMatchObject({
      actionExecution: false,
      autonomousSending: false,
      messageClass: "operator_approved_suggestion_available",
    });
    expect(JSON.stringify(report).toLowerCase()).not.toContain("raw-prompt-marker");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("secret-marker");
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2LiveProactiveMessageDeliveryReport({
      now,
      controlledReport: await controlledReport(),
      adapter: adapter(),
    });
    const artifact = await writePhase2LiveProactiveMessageDeliveryArtifact({
      report,
      artifactDir: TEMP_ROOT,
    });

    expect(artifact.jsonPath).toContain("phase2-live-proactive-message-delivery");
    expect(artifact.markdownPath).toContain("report.md");
    expect(artifact.byteLength).toBeGreaterThan(0);
  });
});
