import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPhase2ControlledProactivitySuggestionReport,
  type Phase2ControlledProactivitySuggestionReport,
} from "./phase2-controlled-proactivity-suggestions.ts";
import {
  assertPhase2ControlledUserFacingProactivityProven,
  buildPhase2ControlledUserFacingProactivityReport,
  writePhase2ControlledUserFacingProactivityArtifact,
} from "./phase2-controlled-user-facing-proactivity.ts";
import {
  buildPhase2StagedActionApprovalReport,
  type Phase2StagedActionApprovalReport,
} from "./phase2-staged-action-approval-workflow.ts";

const TEMP_ROOT = ".artifacts/test-phase2-controlled-user-facing-proactivity";
const now = new Date("2026-04-26T08:00:00.000Z");
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

async function suggestionReport(): Promise<Phase2ControlledProactivitySuggestionReport> {
  return buildPhase2ControlledProactivitySuggestionReport({
    now,
    proofMarker: "PHASE2-CONTROLLED-USER-FACING-PROACTIVITY-TEST",
    approvedScope: scope,
    requestScope: requestScope(),
  });
}

async function approvalReport(
  suggestion: Phase2ControlledProactivitySuggestionReport,
): Promise<Phase2StagedActionApprovalReport> {
  return buildPhase2StagedActionApprovalReport({
    now,
    proofMarker: "PHASE2-CONTROLLED-USER-FACING-PROACTIVITY-TEST",
    controlledSuggestionReport: suggestion,
    approvedScope: scope,
    requestScope: requestScope(),
    operatorDecision: "approve",
    operatorId: scope.operatorId,
  });
}

describe("phase2 controlled user-facing proactivity", () => {
  beforeEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEMP_ROOT, { recursive: true, force: true });
  });

  it("proof-delivers the approved low-risk message class inside approved scope", async () => {
    const suggestion = await suggestionReport();
    const approval = await approvalReport(suggestion);
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: approval,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("controlled_proactive_message_proof_delivered");
    expect(report.message?.messageClass).toBe("operator_approved_suggestion_available");
    expect(report.deliveryResult.deliveryMode).toBe("proof_delivery_artifact");
    expect(report.telemetry.liveUserMessageSent).toBe(false);
    expect(report.telemetry.broadDefaultProactivityEnabled).toBe(false);
    assertPhase2ControlledUserFacingProactivityProven(report);
  });

  it("blocks outside approved scope", async () => {
    const suggestion = await suggestionReport();
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(suggestion),
      approvedScope: scope,
      requestScope: { ...requestScope(), operatorId: "other-operator" },
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("blocked_scope");
    expect(report.message).toBeUndefined();
  });

  it("blocks without approved suggestion and proposal", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: null,
      approvalReport: null,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("blocked_missing_approval");
  });

  it("blocks without explicit send approval", async () => {
    const suggestion = await suggestionReport();
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(suggestion),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: false,
    });

    expect(report.decision).toBe("blocked_missing_send_approval");
  });

  it("blocks no-dark-data failures", async () => {
    const suggestion = clone(await suggestionReport());
    suggestion.noDarkDataStatus = "fail";
    suggestion.telemetry.noDarkDataStatus = "fail";
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(await suggestionReport()),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("blocked_no_dark_data");
  });

  it("blocks missing provenance", async () => {
    const suggestion = await suggestionReport();
    const approval = clone(await approvalReport(suggestion));
    const proposal = approval.proposals.find((candidate) => candidate.approved);
    if (!proposal) {
      throw new Error("test fixture missing approved proposal");
    }
    proposal.sourceRefIds = [];
    proposal.sourceProfileIds = [];
    proposal.authorityTiers = [];
    proposal.contentHashes = [];
    proposal.proofHashes = [];
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: approval,
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("blocked_provenance");
  });

  it("blocks when rollback is active", async () => {
    const suggestion = await suggestionReport();
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(suggestion),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_DISABLED: "1" },
    });

    expect(report.decision).toBe("blocked_rollback");
    expect(report.telemetry.rollbackObserved).toBe(true);
  });

  it("blocks unsafe message classes", async () => {
    const suggestion = await suggestionReport();
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(suggestion),
      approvedScope: scope,
      requestScope: requestScope(),
      messageClass: "external_instruction_message",
      explicitSendApproval: true,
    });

    expect(report.decision).toBe("blocked_message_class");
  });

  it("treats project docs and external text as evidence, not instructions", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      explicitSendApproval: true,
    });

    expect(report.policy.externalTextHandling).toBe("evidence_not_instruction");
  });

  it("message payload includes provenance and excludes raw/private content", async () => {
    const suggestion = await suggestionReport();
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      suggestionReport: suggestion,
      approvalReport: await approvalReport(suggestion),
      approvedScope: scope,
      requestScope: requestScope(),
      explicitSendApproval: true,
    });

    expect(report.message?.sourceRefIds.length).toBeGreaterThan(0);
    expect(report.message?.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.message?.authorityTiers.length).toBeGreaterThan(0);
    expect(report.message?.rawContentIncluded).toBe(false);
    expect(report.message?.privateOrSecretContentIncluded).toBe(false);
  });

  it("message delivery does not execute actions", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      explicitSendApproval: true,
    });

    expect(report.message?.actionExecution).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
  });

  it("broad default proactivity remains disabled", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      explicitSendApproval: true,
    });

    expect(report.policy.broadDefaultProactivityEnabled).toBe(false);
    expect(report.telemetry.broadDefaultProactivityEnabled).toBe(false);
  });

  it("writes bounded JSON and Markdown artifacts", async () => {
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      explicitSendApproval: true,
    });
    const artifact = await writePhase2ControlledUserFacingProactivityArtifact({
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
    const report = await buildPhase2ControlledUserFacingProactivityReport({
      now,
      explicitSendApproval: true,
    });

    await expect(
      writePhase2ControlledUserFacingProactivityArtifact({
        report: { ...report, raw_prompt: "not allowed" } as never,
        artifactDir: TEMP_ROOT,
      }),
    ).rejects.toThrow(/prohibited field/u);
  });
});
