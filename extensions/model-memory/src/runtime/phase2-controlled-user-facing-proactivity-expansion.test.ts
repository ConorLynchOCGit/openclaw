import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityExpansionReport,
  writePhase2ControlledUserFacingProactivityExpansionArtifact,
  type Phase2ControlledUserFacingProactivityExpansionAdapter,
} from "./phase2-controlled-user-facing-proactivity-expansion.ts";
import {
  buildPhase2ProactiveMessageOperatorDefaultReport,
  type Phase2ProactiveMessageOperatorDefaultReport,
} from "./phase2-proactive-message-operator-default.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-user-facing-proactivity-expansion";
const now = new Date("2026-04-26T11:00:00.000Z");
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

function adapter(): Phase2ControlledUserFacingProactivityExpansionAdapter {
  return {
    kind: "gateway_chat_inject",
    deliver(input) {
      expect(input.label).toBe("Model Memory");
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `expanded-${input.message.messageId}`,
        observableInOperatorUi: true,
        resultHash: "expanded-adapter-result-hash",
        reasonCodes: ["gateway_chat_inject_delivered"],
      };
    },
  };
}

async function operatorDefaultReport(): Promise<Phase2ProactiveMessageOperatorDefaultReport> {
  return buildPhase2ProactiveMessageOperatorDefaultReport({
    now,
    proofMarker: "PHASE2-CONTROLLED-PROACTIVITY-EXPANSION-TEST",
  });
}

describe("phase2 controlled user-facing proactivity expansion", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("delivers the second approved low-risk message class only in controlled scope", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("expanded_proactive_message_delivered");
    expect(report.message?.boundedDisplayText).toBe(
      "An approved follow-up suggestion is available.",
    );
    expect(report.telemetry.controlledOnlySecondClass).toBe(true);
    expect(report.config.controlledOnlyMessageClasses).toEqual([
      "operator_approved_follow_up_available",
    ]);
  });

  it("keeps the first class governed by the Slice 30 default-visible operator workflow", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_suggestion_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("expanded_proactive_message_delivered");
    expect(report.config.defaultVisibleMessageClasses).toEqual([
      "operator_approved_suggestion_available",
    ]);
    expect(report.telemetry.controlledOnlySecondClass).toBe(false);
  });

  it("blocks outside approved scope", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: { ...requestScope(), operatorId: "outside-operator" },
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_scope");
    expect(report.deliveryResult.delivered).toBe(false);
  });

  it("blocks without Slice 30 operator-default proof", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: null,
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_missing_operator_default_proof");
  });

  it("blocks without explicit send approval", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      explicitSendApproval: false,
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_missing_send_approval");
  });

  it("blocks no-dark-data failures", async () => {
    const unsafe = clone(await operatorDefaultReport());
    unsafe.noDarkDataStatus = "fail";
    unsafe.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: unsafe,
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_missing_operator_default_proof");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks missing provenance", async () => {
    const unsafe = clone(await operatorDefaultReport());
    unsafe.telemetry.sourceRefIds = [];
    unsafe.telemetry.sourceProfileIds = [];
    unsafe.telemetry.authorityTiers = [];
    unsafe.telemetry.contentHashes = [];
    unsafe.telemetry.proofHashes = [];
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: unsafe,
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_provenance");
  });

  it("blocks when rollback is active", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
  });

  it("blocks unknown and unsafe message classes", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "unknown_message_class",
      adapter: adapter(),
    });

    expect(report.decision).toBe("blocked_message_class");
  });

  it("requires a live delivery adapter", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
    });

    expect(report.decision).toBe("blocked_delivery_adapter");
  });

  it("payloads include provenance and exclude raw/private content", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    expect(report.message?.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.message?.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.message?.authorityTiers.length).toBeGreaterThan(0);
    expect(report.message?.rawContentIncluded).toBe(false);
    expect(report.message?.privateOrSecretContentIncluded).toBe(false);
    expect(report.telemetry.broadDefaultProactivityEnabled).toBe(false);
    expect(report.telemetry.autonomousSendingEnabled).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });
    const artifact = await writePhase2ControlledUserFacingProactivityExpansionArtifact({
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
    const report = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      now,
      approvedScope: scope,
      requestScope: requestScope(),
      operatorDefaultReport: await operatorDefaultReport(),
      messageClass: "operator_approved_follow_up_available",
      adapter: adapter(),
    });

    await expect(
      writePhase2ControlledUserFacingProactivityExpansionArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
