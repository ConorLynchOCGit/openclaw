import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2PersonalAutoSendTrialApproved,
  buildPhase2PersonalAutoSendTrialReport,
  writePhase2PersonalAutoSendTrialArtifact,
  type Phase2PersonalAutoSendTrialInput,
} from "./phase2-personal-autosend-trial-decision.ts";

describe("phase2 personal autosend trial decision", () => {
  it("approves a narrow personal autosend trial with explicit opt-in and controls", async () => {
    const report = await buildPhase2PersonalAutoSendTrialReport({
      now: new Date("2026-04-26T22:00:00.000Z"),
      uiEvidence: {
        personalOptInVisible: true,
        visibleUxControls: true,
        personalScopeAutoSendEnabled: true,
        userDisableReturnsManualSend: true,
        nonPersonalScopeAutoSendBlocked: true,
        killSwitchDisablesTrial: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("approved_for_personal_autosend_trial");
    expect(report.telemetry.personalTrialAutoSendEnabled).toBe(true);
    expect(report.telemetry.allowedMessageClass).toBe("operator_approved_suggestion_available");
    expect(report.telemetry.followUpClassManualOnly).toBe(true);
    expect(report.telemetry.nonPersonalScopeAutoSendBlocked).toBe(true);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2PersonalAutoSendTrialApproved(report);
  });

  it.each([
    [
      "Slice 45 observability proof",
      { simulationObservabilityReport: null },
      "Slice 45 autosend simulation observability proof is required",
    ],
    [
      "Slice 46 controlled-scope proof",
      { controlledAutoSendReport: null },
      "Slice 46 controlled autosend scope proof is required",
    ],
    [
      "Slice 47 kill-switch proof",
      { killSwitchReport: null },
      "Slice 47 autosend kill-switch health proof is required",
    ],
  ] satisfies Array<[string, Phase2PersonalAutoSendTrialInput, string]>)(
    "blocks without %s",
    async (_name, input, message) => {
      await expect(buildPhase2PersonalAutoSendTrialReport(input)).rejects.toThrow(message);
    },
  );

  it.each([
    [
      "unhealthy observability",
      { forceUnhealthyObservability: true },
      "clean_simulation_telemetry_required",
    ],
    [
      "missing personal opt-in",
      { forceMissingPersonalOptIn: true },
      "explicit_personal_opt_in_required",
    ],
    ["wildcard scope", { forceWildcardScope: true }, "wildcard_scope_rejected"],
    ["follow-up autosend", { forceFollowUpAutoSend: true }, "follow_up_class_manual_only"],
    [
      "non-personal autosend",
      { forceNonPersonalScopeAutoSend: true },
      "non_personal_scope_manual_only",
    ],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
  ] satisfies Array<[string, Phase2PersonalAutoSendTrialInput, string]>)(
    "blocks on %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2PersonalAutoSendTrialReport(input);

      expect(report.decision).toBe("blocked");
      expect(report.telemetry.personalTrialAutoSendEnabled).toBe(false);
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.actionExecutionObserved).toBe(false);
    },
  );

  it("kill switch disables the personal trial and preserves manual send mode", async () => {
    const report = await buildPhase2PersonalAutoSendTrialReport({
      env: { MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.telemetry.killSwitchActive).toBe(true);
    expect(report.telemetry.personalTrialAutoSendEnabled).toBe(false);
    expect(report.rollbackPlan.targetMode).toBe("manual_send_only");
    expect(report.rollbackPlan.preservesManualSendWorkflow).toBe(true);
  });

  it("global autosend kill switch also disables the personal trial", async () => {
    const report = await buildPhase2PersonalAutoSendTrialReport({
      env: { MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED: "1" },
    });

    expect(report.decision).toBe("rollback_disabled");
    expect(report.telemetry.killSwitchActive).toBe(true);
    expect(report.telemetry.personalTrialAutoSendEnabled).toBe(false);
  });

  it("user disable must return to manual-send mode", async () => {
    const report = await buildPhase2PersonalAutoSendTrialReport({
      forceUserDisableFails: true,
    });

    expect(report.decision).toBe("blocked");
    expect(report.telemetry.blockedReasonCodes).toContain("user_disable_returns_manual_send");
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-personal-autosend-trial-"));
    try {
      const report = await buildPhase2PersonalAutoSendTrialReport();
      const artifact = await writePhase2PersonalAutoSendTrialArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Personal Auto-Send Trial");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(1024 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
