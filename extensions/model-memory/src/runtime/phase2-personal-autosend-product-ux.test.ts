import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2PersonalAutoSendProductUxVisible,
  buildPhase2PersonalAutoSendProductUxReport,
  writePhase2PersonalAutoSendProductUxArtifact,
  type Phase2PersonalAutoSendProductUxInput,
} from "./phase2-personal-autosend-product-ux.ts";

describe("phase2 personal autosend product ux", () => {
  it("shows controlled autosend trial mode with narrow allowed class", async () => {
    const report = await buildPhase2PersonalAutoSendProductUxReport({
      now: new Date("2026-04-26T23:30:00.000Z"),
      uiEvidence: {
        settingsVisible: true,
        modeVisible: true,
        allowedClassVisible: true,
        followUpManualOnlyVisible: true,
        toggleOffReturnsManual: true,
        killSwitchStateVisible: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("product_ux_visible");
    expect(report.settings.mode).toBe("controlled_autosend_trial");
    expect(report.settings.allowedAutoSendClass).toBe("operator_approved_suggestion_available");
    expect(report.settings.manualOnlyMessageClasses).toEqual([
      "operator_approved_follow_up_available",
    ]);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2PersonalAutoSendProductUxVisible(report);
  });

  it("shows manual-only mode when the user disables the trial", async () => {
    const report = await buildPhase2PersonalAutoSendProductUxReport({ userDisabled: true });

    expect(report.decision).toBe("manual_only");
    expect(report.settings.mode).toBe("manual_only");
    expect(report.settings.userDisabled).toBe(true);
    expect(report.telemetry.manualSendWorkflowPreserved).toBe(true);
  });

  it("shows disabled-by-kill-switch mode when a kill switch is active", async () => {
    const report = await buildPhase2PersonalAutoSendProductUxReport({
      env: { MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED: "1" },
    });

    expect(report.decision).toBe("disabled_by_kill_switch");
    expect(report.settings.mode).toBe("disabled_by_kill_switch");
    expect(report.telemetry.killSwitchActive).toBe(true);
  });

  it.each([
    ["missing Slice 48 proof", { personalTrialReport: null }, "slice48_personal_trial_required"],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    ["failed toggle-off control", { forceToggleOffFails: true }, "toggle_off_returns_manual"],
    ["action execution", { forceActionExecution: true }, "action_execution_disabled"],
  ] satisfies Array<[string, Phase2PersonalAutoSendProductUxInput, string]>)(
    "blocks %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2PersonalAutoSendProductUxReport(input);

      expect(report.decision).toBe("blocked");
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.allowedAutoSendClass).toBe("operator_approved_suggestion_available");
      expect(report.telemetry.followUpClassManualOnly).toBe(true);
    },
  );

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-personal-autosend-product-ux-"));
    try {
      const report = await buildPhase2PersonalAutoSendProductUxReport();
      const artifact = await writePhase2PersonalAutoSendProductUxArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Personal Auto-Send Product UX");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(json.toLowerCase()).not.toContain("private-phrase-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
