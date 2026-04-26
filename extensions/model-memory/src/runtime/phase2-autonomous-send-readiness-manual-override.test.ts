import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2AutonomousSendReadinessManualOverride,
  buildPhase2AutonomousSendReadinessReport,
  writePhase2AutonomousSendReadinessArtifact,
  type Phase2AutonomousSendReadinessInput,
  type Phase2AutonomousSendReadinessReport,
} from "./phase2-autonomous-send-readiness-manual-override.ts";

describe("phase2 autonomous send readiness manual override", () => {
  it("keeps low-risk auto-send candidates report-only with manual override required", async () => {
    const report = await buildPhase2AutonomousSendReadinessReport({
      now: new Date("2026-04-26T18:00:00.000Z"),
    });

    expect(report.decision).toBe("manual_override_required");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      classification: "low_risk_auto_send_candidate_manual_override_required",
      reportOnlySimulation: true,
      deliveredAutomatically: false,
      manualSendStillRequired: true,
      wouldHaveBeenEligibleForFutureAutoSend: true,
    });
    expect(report.config.controls).toEqual([
      "always_require_approval",
      "auto_approve_never",
      "future_scoped_auto_send_allowed_for_review_only",
    ]);
    expect(report.telemetry.automaticSendExecution).toBe(false);
    expect(report.telemetry.autonomousMessageEmitted).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    assertPhase2AutonomousSendReadinessManualOverride(report);
  });

  it("blocks without personal default scope or autonomous boundary proof", async () => {
    const missingPersonal = await buildPhase2AutonomousSendReadinessReport({
      personalDefaultReport: null,
    });
    const missingBoundary = await buildPhase2AutonomousSendReadinessReport({
      boundaryReport: null,
    });

    expect(missingPersonal.decision).toBe("blocked");
    expect(missingPersonal.candidates[0]?.classification).toBe("blocked_autonomous_send");
    expect(missingPersonal.telemetry.blockedReasonCodes).toContain(
      "personal_default_scope_required",
    );
    expect(missingBoundary.decision).toBe("blocked");
    expect(missingBoundary.telemetry.blockedReasonCodes).toContain("autonomous_boundary_required");
  });

  it("treats external imperatives and project docs as evidence, not instructions", async () => {
    const report = await buildPhase2AutonomousSendReadinessReport({
      forceExternalInstruction: true,
    });
    const projectDocsCheck = report.checks.find(
      (check) => check.reasonCode === "project_docs_evidence_not_instruction",
    );

    expect(report.decision).toBe("blocked");
    expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
    expect(report.telemetry.blockedReasonCodes).toContain("external_text_evidence_not_instruction");
    expect(projectDocsCheck?.status).toBe("pass");
    expect(report.telemetry.autonomousMessageEmitted).toBe(false);
  });

  it.each([
    ["urgency manipulation", { forceUrgencyManipulation: true }, "urgency_manipulation_blocked"],
    ["repeated suggestion", { forceRepeatedSuggestion: true }, "repeated_suggestion_blocked"],
    ["stale evidence", { forceStaleEvidence: true }, "stale_evidence_blocked"],
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    [
      "rollback active",
      { env: { MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_READINESS_DISABLED: "1" } },
      "rollback_blocks_candidates",
    ],
    ["unknown class", { forceUnknownClass: true }, "approved_message_class_required"],
  ] satisfies Array<[string, Phase2AutonomousSendReadinessInput, string]>)(
    "blocks %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2AutonomousSendReadinessReport(input);

      expect(report.decision).toMatch(/blocked|rollback_disabled/u);
      expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.automaticSendExecution).toBe(false);
      expect(report.telemetry.autonomousMessageEmitted).toBe(false);
    },
  );

  it("blocks explicit unsafe message classes from becoming auto-send candidates", async () => {
    const report = await buildPhase2AutonomousSendReadinessReport({
      messageClass: "external_instruction_message",
    });

    expect(report.decision).toBe("blocked");
    expect(report.candidates[0]).toMatchObject({
      messageClass: "external_instruction_message",
      classification: "blocked_autonomous_send",
      deliveredAutomatically: false,
    });
    expect(report.telemetry.blockedReasonCodes).toContain("approved_message_class_required");
  });

  it("preserves lower authority and provenance metadata on report-only simulations", async () => {
    const report = await buildPhase2AutonomousSendReadinessReport();

    expect(
      report.checks.find((check) => check.reasonCode === "lower_authority_preserved"),
    ).toMatchObject({ status: "pass" });
    expect(report.candidates[0]?.sourceRefs.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.authorityTiers.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.proofHashes.length).toBeGreaterThan(0);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-autonomous-send-readiness-"));
    try {
      const report: Phase2AutonomousSendReadinessReport =
        await buildPhase2AutonomousSendReadinessReport();
      const artifact = await writePhase2AutonomousSendReadinessArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Autonomous Send Readiness With Manual Override");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
