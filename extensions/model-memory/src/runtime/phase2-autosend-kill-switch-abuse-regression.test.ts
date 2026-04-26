import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2AutoSendKillSwitchReport,
  buildPhase2AutoSendKillSwitchReport,
  writePhase2AutoSendKillSwitchArtifact,
  type Phase2AutoSendKillSwitchInput,
} from "./phase2-autosend-kill-switch-abuse-regression.ts";

describe("phase2 autosend kill switch abuse regression", () => {
  it("reports healthy controlled autosend and preserves manual-send workflow", async () => {
    const report = await buildPhase2AutoSendKillSwitchReport({
      now: new Date("2026-04-26T21:00:00.000Z"),
      uiEvidence: {
        sessionKey: "main",
        healthReportVisible: true,
        controlledAutoSendBeforeKillSwitch: true,
        killSwitchStopsAutoSend: true,
        manualSendStillAvailable: true,
        terminalEvidence: true,
      },
    });

    expect(report.decision).toBe("autosend_health_healthy");
    expect(report.healthReport.status).toBe("healthy");
    expect(report.telemetry.successfulControlledDeliveries).toBe(1);
    expect(report.telemetry.manualSendWorkflowPreserved).toBe(true);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2AutoSendKillSwitchReport(report);
  });

  it("kill switch disables all auto-send behavior and preserves manual send", async () => {
    const report = await buildPhase2AutoSendKillSwitchReport({
      env: { MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED: "1" },
    });

    expect(report.decision).toBe("autosend_kill_switch_engaged");
    expect(report.healthReport.status).toBe("blocked");
    expect(report.telemetry.successfulControlledDeliveries).toBe(0);
    expect(report.healthReport.blockedReasonCodes).toContain("blocked_kill_switch");
    expect(report.telemetry.manualSendWorkflowPreserved).toBe(true);
  });

  it.each([
    ["outside-scope auto-send", { forceOutsideScopeSend: true }, "blocked_outside_scope"],
    ["repeated auto-send", { forceRepeatedSend: true }, "blocked_repeated_autosend"],
    ["private/raw content", { forcePrivateContent: true }, "blocked_raw_private_content"],
    [
      "external instruction escalation",
      { forceExternalInstructionEscalation: true },
      "blocked_external_instruction_escalation",
    ],
    ["rollback bypass", { forceRollbackBypass: true }, "blocked_rollback_bypass"],
    ["missing provenance", { forceMissingProvenance: true }, "blocked_missing_provenance"],
    [
      "missing source profile",
      { forceMissingSourceProfile: true },
      "blocked_missing_source_profile",
    ],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "blocked_no_dark_data"],
  ] satisfies Array<[string, Phase2AutoSendKillSwitchInput, string]>)(
    "degrades health for %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2AutoSendKillSwitchReport(input);

      expect(report.decision).toBe("autosend_health_degraded");
      expect(report.healthReport.status).toBe("degraded");
      expect(report.healthReport.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.successfulControlledDeliveries).toBe(0);
      expect(report.telemetry.actionExecutionObserved).toBe(false);
    },
  );

  it("health report includes attempts, deliveries, blocked reasons, scope, and provenance", async () => {
    const report = await buildPhase2AutoSendKillSwitchReport();

    expect(report.healthReport.attemptCount).toBe(1);
    expect(report.healthReport.deliveryIds.length).toBeGreaterThan(0);
    expect(report.healthReport.sessionKeys).toContain("main");
    expect(report.healthReport.sourceRefs.length).toBeGreaterThan(0);
    expect(report.healthReport.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.healthReport.authorityTiers.length).toBeGreaterThan(0);
    expect(
      report.healthReport.contentHashes.length + report.healthReport.proofHashes.length,
    ).toBeGreaterThan(0);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-autosend-kill-switch-"));
    try {
      const report = await buildPhase2AutoSendKillSwitchReport();
      const artifact = await writePhase2AutoSendKillSwitchArtifact({ report, artifactDir: dir });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Auto-Send Kill Switch");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
