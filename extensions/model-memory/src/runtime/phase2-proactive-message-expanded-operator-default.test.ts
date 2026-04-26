import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledUserFacingProactivityExpansionReport,
  type Phase2ControlledUserFacingProactivityExpansionAdapter,
  type Phase2ControlledUserFacingProactivityExpansionReport,
} from "./phase2-controlled-user-facing-proactivity-expansion.ts";
import {
  buildPhase2ProactiveMessageExpandedOperatorDefaultReport,
  writePhase2ProactiveMessageExpandedOperatorDefaultArtifact,
  assertPhase2ProactiveMessageExpandedOperatorDefaultApproved,
} from "./phase2-proactive-message-expanded-operator-default.ts";
import {
  buildPhase2ProactiveMessageOperatorDefaultReport,
  type Phase2ProactiveMessageOperatorDefaultReport,
} from "./phase2-proactive-message-operator-default.ts";

const TEMP_ROOT = ".artifacts/test-phase2-proactive-message-expanded-operator-default";
const now = new Date("2026-04-26T14:00:00.000Z");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function adapter(): Phase2ControlledUserFacingProactivityExpansionAdapter {
  return {
    kind: "gateway_chat_inject",
    deliver(input) {
      return {
        ok: true,
        adapterKind: "gateway_chat_inject",
        delivered: true,
        messageId: `expanded-default-test-${input.message.messageId}`,
        observableInOperatorUi: true,
        resultHash: "expanded-default-adapter-result-hash",
        reasonCodes: ["gateway_chat_inject_delivered"],
      };
    },
  };
}

async function operatorDefaultReport(
  input: Partial<Parameters<typeof buildPhase2ProactiveMessageOperatorDefaultReport>[0]> = {},
): Promise<Phase2ProactiveMessageOperatorDefaultReport> {
  return buildPhase2ProactiveMessageOperatorDefaultReport({
    now,
    proofMarker: "PHASE2-PROACTIVE-EXPANDED-OPERATOR-DEFAULT-TEST",
    ...input,
  });
}

async function expansionReport(
  input: Partial<
    Parameters<typeof buildPhase2ControlledUserFacingProactivityExpansionReport>[0]
  > = {},
): Promise<Phase2ControlledUserFacingProactivityExpansionReport> {
  const defaultReport =
    input.operatorDefaultReport === null
      ? null
      : (input.operatorDefaultReport ?? (await operatorDefaultReport()));
  return buildPhase2ControlledUserFacingProactivityExpansionReport({
    now,
    proofMarker: "PHASE2-PROACTIVE-EXPANDED-OPERATOR-DEFAULT-TEST",
    operatorDefaultReport: defaultReport,
    explicitSendApproval: true,
    messageClass: "operator_approved_follow_up_available",
    adapter: adapter(),
    ...input,
  });
}

describe("phase2 proactive message expanded operator default", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("approves expanded default-visible operator workflow after Slice 30 and Slice 31 proofs", async () => {
    const slice30 = await operatorDefaultReport();
    const slice31 = await expansionReport({ operatorDefaultReport: slice30 });
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: slice30,
      controlledExpansionReport: slice31,
    });

    expect(report.decision).toBe("approved_for_default_operator_visible_expanded_send_workflow");
    expect(report.config.allowedMessageClasses).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.config.requireExplicitSendApproval).toBe(true);
    expect(report.config.automaticSendAllowed).toBe(false);
    expect(report.config.autonomousSendingAllowed).toBe(false);
    expect(report.config.broadDefaultProactivityAllowed).toBe(false);
    expect(report.telemetry.defaultVisibleExpandedOperatorSendWorkflowObserved).toBe(true);
    assertPhase2ProactiveMessageExpandedOperatorDefaultApproved(report);
  });

  it("blocks without Slice 30 operator-default proof", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: null,
      controlledExpansionReport: await expansionReport(),
    });

    expect(report.decision).toBe("blocked");
    expect(report.checks.find((check) => check.checkId === "proof:slice30_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks without Slice 31 controlled expansion proof", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: await operatorDefaultReport(),
      controlledExpansionReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.checks.find((check) => check.checkId === "proof:slice31_present")?.status).toBe(
      "fail",
    );
  });

  it("blocks on failed no-dark-data status", async () => {
    const slice30 = clone(await operatorDefaultReport());
    const slice31 = clone(await expansionReport({ operatorDefaultReport: slice30 }));
    slice30.noDarkDataStatus = "fail";
    slice30.telemetry.noDarkDataStatus = "fail";
    slice31.noDarkDataStatus = "fail";
    slice31.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: slice30,
      controlledExpansionReport: slice31,
    });

    expect(report.decision).toBe("blocked");
    expect(report.noDarkDataStatus).toBe("fail");
  });

  it("blocks if either message class can send without explicit approval", async () => {
    const slice30 = clone(await operatorDefaultReport());
    const slice31 = clone(await expansionReport({ operatorDefaultReport: slice30 }));
    slice31.telemetry.explicitSendApproval = false;
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: slice30,
      controlledExpansionReport: slice31,
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.reasonCodes).toContain("explicit_send_approval_required");
  });

  it("blocks if autonomous sending is enabled", async () => {
    const slice30 = clone(await operatorDefaultReport());
    const slice31 = clone(await expansionReport({ operatorDefaultReport: slice30 }));
    slice31.telemetry.autonomousSendingEnabled = true as false;
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      operatorDefaultReport: slice30,
      controlledExpansionReport: slice31,
    });

    expect(report.decision).toBe("partial_approval");
    expect(report.telemetry.reasonCodes).toContain("autonomous_sending_must_remain_off");
  });

  it("exposes exactly the two approved low-risk message classes", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });

    expect(report.config.allowedMessageClasses).toEqual([
      "operator_approved_suggestion_available",
      "operator_approved_follow_up_available",
    ]);
    expect(report.config.blockedMessageClasses).toContain("external_instruction_message");
    expect(report.config.blockedMessageClasses).toContain("unknown_message_class");
  });

  it("keeps both approved message classes send-approval required", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });

    expect(report.config.requireStagedApproval).toBe(true);
    expect(report.config.requireExplicitSendApproval).toBe(true);
    expect(report.capabilityDecision.explicitSendApprovalRequired).toBe(true);
  });

  it("rollback kill-switch disables expanded default-visible workflow", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
      now,
      env: { MODEL_MEMORY_PHASE2_PROACTIVE_MESSAGE_EXPANDED_OPERATOR_DEFAULT_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.rollbackObserved).toBe(true);
    expect(report.telemetry.defaultVisibleExpandedOperatorSendWorkflowObserved).toBe(false);
  });

  it("preserves audit and provenance metadata from proof reports", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });

    expect(report.telemetry.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.telemetry.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.telemetry.authorityTiers.length).toBeGreaterThan(0);
    expect(report.telemetry.proofHashes.length).toBeGreaterThan(0);
  });

  it("treats project docs and external text as evidence, not instructions", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });

    expect(report.config.externalTextHandling).toBe("evidence_not_instruction");
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });
    const artifact = await writePhase2ProactiveMessageExpandedOperatorDefaultArtifact({
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
    const report = await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({ now });

    await expect(
      writePhase2ProactiveMessageExpandedOperatorDefaultArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
