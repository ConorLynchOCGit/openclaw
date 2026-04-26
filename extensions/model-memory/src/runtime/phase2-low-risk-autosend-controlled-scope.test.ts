import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2LowRiskAutoSendControlledScope,
  buildPhase2LowRiskAutoSendControlledScopeReport,
  writePhase2LowRiskAutoSendControlledScopeArtifact,
  type Phase2LowRiskAutoSendControlledScopeInput,
} from "./phase2-low-risk-autosend-controlled-scope.ts";

describe("phase2 low-risk autosend controlled scope", () => {
  it("auto-sends only the approved low-risk class inside exact opted-in scope", async () => {
    const report = await buildPhase2LowRiskAutoSendControlledScopeReport({
      now: new Date("2026-04-26T20:00:00.000Z"),
      uiEvidence: {
        sessionKey: "main",
        controlledOptInVisible: true,
        insideScopeAutoSendObserved: true,
        outsideScopeManualOnlyObserved: true,
        rollbackBlocksAutoSend: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("controlled_autosend_delivered");
    expect(report.policy.allowedMessageClasses).toEqual(["operator_approved_suggestion_available"]);
    expect(report.deliveryResult.deliveredAutomatically).toBe(true);
    expect(report.deliveryResult.messageClass).toBe("operator_approved_suggestion_available");
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2LowRiskAutoSendControlledScope(report);
  });

  it("keeps follow-up messages manual-only", async () => {
    const report = await buildPhase2LowRiskAutoSendControlledScopeReport({
      messageClass: "operator_approved_follow_up_available",
    });

    expect(report.decision).toBe("manual_send_only");
    expect(report.deliveryResult.deliveredAutomatically).toBe(false);
    expect(report.telemetry.followUpClassManualOnly).toBe(true);
    expect(report.deliveryResult.reasonCodes).toContain("manual_send_only");
  });

  it.each([
    ["outside scope", { forceOutsideScope: true }, "blocked_scope"],
    [
      "wildcard scope",
      { forceWildcardScope: true, controlledScope: { sessionKey: "*" } },
      "blocked_scope",
    ],
    ["missing opt-in", { forceMissingOptIn: true }, "blocked_missing_opt_in"],
    ["degraded observability", { forceDegradedObservability: true }, "blocked_observability"],
    ["missing provenance", { forceMissingProvenance: true }, "blocked_provenance"],
    ["missing source profile", { forceMissingSourceProfile: true }, "blocked_source_profile"],
    ["stale candidate", { forceStaleCandidate: true }, "blocked_stale_repeat"],
    ["repeated candidate", { forceRepeatedCandidate: true }, "blocked_stale_repeat"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "blocked_no_dark_data"],
    [
      "rollback active",
      { env: { MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED: "1" } },
      "blocked_rollback",
    ],
    ["unknown message class", { messageClass: "unknown_message_class" }, "blocked_message_class"],
  ] satisfies Array<[string, Phase2LowRiskAutoSendControlledScopeInput, string]>)(
    "blocks %s",
    async (_name, input, decision) => {
      const report = await buildPhase2LowRiskAutoSendControlledScopeReport(input);

      expect(report.decision).toBe(decision);
      expect(report.deliveryResult.deliveredAutomatically).toBe(false);
      expect(report.telemetry.actionExecutionObserved).toBe(false);
    },
  );

  it("requires exact user/session/project/operator fields and rejects wildcard/global scope", async () => {
    const report = await buildPhase2LowRiskAutoSendControlledScopeReport({
      controlledScope: {
        userId: "phase2-user",
        recipientId: "phase2-recipient",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "phase2-operator",
      },
      requestScope: {
        userId: "phase2-user",
        recipientId: "phase2-recipient",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "phase2-operator",
      },
    });
    const wildcard = await buildPhase2LowRiskAutoSendControlledScopeReport({
      controlledScope: { operatorId: "global" },
      forceWildcardScope: true,
    });

    expect(report.decision).toBe("controlled_autosend_delivered");
    expect(report.optInConfig.scope).toMatchObject({
      environment: "live",
      rolloutMode: "controlled_auto_send_scope",
      allowedMessageClass: "operator_approved_suggestion_available",
    });
    expect(wildcard.decision).toBe("blocked_scope");
    expect(wildcard.deliveryResult.deliveredAutomatically).toBe(false);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-low-risk-autosend-"));
    try {
      const report = await buildPhase2LowRiskAutoSendControlledScopeReport();
      const artifact = await writePhase2LowRiskAutoSendControlledScopeArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Low-Risk Auto-Send Controlled Scope");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
