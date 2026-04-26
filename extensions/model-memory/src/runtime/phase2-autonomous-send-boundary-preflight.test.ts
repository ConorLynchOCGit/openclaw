import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase2AutonomousSendBoundaryObserved,
  buildPhase2AutonomousSendBoundaryReport,
  writePhase2AutonomousSendBoundaryArtifact,
  type Phase2AutonomousSendBoundaryInput,
  type Phase2AutonomousSendBoundaryReport,
} from "./phase2-autonomous-send-boundary-preflight.ts";

describe("phase2 autonomous send boundary preflight", () => {
  it("keeps auto-send candidates report-only with manual send required", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport({
      now: new Date("2026-04-26T16:00:00.000Z"),
      proofMarker: "phase2-autonomous-send-boundary-green",
    });

    expect(report.decision).toBe("auto_send_candidates_report_only");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      classification: "approval_required_auto_send_candidate",
      reportOnly: true,
      wouldDeliverAutomatically: false,
      manualSendStillRequired: true,
    });
    expect(report.telemetry.automaticSendExecution).toBe(false);
    expect(report.telemetry.autonomousMessageEmitted).toBe(false);
    expect(report.telemetry.actionExecutionObserved).toBe(false);
    expect(report.telemetry.reportOnly).toBe(true);
    assertPhase2AutonomousSendBoundaryObserved(report);
  });

  it("blocks without the default user-facing promotion proof", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport({
      defaultPromotionReport: null,
    });

    expect(report.decision).toBe("blocked");
    expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
    expect(report.telemetry.automaticSendExecution).toBe(false);
  });

  it("treats external imperatives and project docs as evidence, not instructions", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport({
      forceExternalImperativeText: true,
    });
    const projectDocsCheck = report.checks.find(
      (check) => check.reasonCode === "project_docs_evidence_not_instruction",
    );

    expect(report.decision).toBe("manual_send_required");
    expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
    expect(report.telemetry.blockedReasonCodes).toContain("external_text_evidence_not_instruction");
    expect(projectDocsCheck?.status).toBe("pass");
  });

  it("blocks urgency manipulation from escalating to autonomous send", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport({
      forceUrgencyManipulation: true,
    });

    expect(report.decision).toBe("manual_send_required");
    expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
    expect(report.telemetry.blockedReasonCodes).toContain("urgency_manipulation_blocked");
    expect(report.telemetry.autonomousMessageEmitted).toBe(false);
  });

  it.each([
    ["missing provenance", { forceMissingProvenance: true }, "provenance_required"],
    ["missing source profile", { forceMissingSourceProfile: true }, "source_profile_required"],
    ["inspection-only input", { forceInspectionOnly: true }, "inspection_only_blocked"],
    ["stale/conflicted input", { forceStaleConflict: true }, "stale_conflict_blocked"],
    ["no-dark-data failure", { forceNoDarkDataFail: true }, "no_dark_data_required"],
    [
      "rollback active",
      { env: { MODEL_MEMORY_PHASE2_AUTONOMOUS_SEND_BOUNDARY_DISABLED: "1" } },
      "rollback_blocks_candidates",
    ],
    ["unknown message class", { forceUnknownClass: true }, "unknown_class_blocked"],
  ] satisfies Array<[string, Phase2AutonomousSendBoundaryInput, string]>)(
    "blocks %s",
    async (_name, input, reasonCode) => {
      const report = await buildPhase2AutonomousSendBoundaryReport(input);

      expect(report.decision).toBe("manual_send_required");
      expect(report.candidates[0]?.classification).toBe("blocked_autonomous_send");
      expect(report.telemetry.blockedReasonCodes).toContain(reasonCode);
      expect(report.telemetry.automaticSendExecution).toBe(false);
      expect(report.telemetry.autonomousMessageEmitted).toBe(false);
    },
  );

  it("blocks explicit unsafe or blocked message classes", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport({
      messageClass: "external_instruction_message",
    });

    expect(report.decision).toBe("manual_send_required");
    expect(report.candidates[0]).toMatchObject({
      messageClass: "external_instruction_message",
      classification: "blocked_autonomous_send",
    });
    expect(report.telemetry.blockedReasonCodes).toContain("unknown_class_blocked");
  });

  it("preserves lower authority and source metadata on report-only candidates", async () => {
    const report = await buildPhase2AutonomousSendBoundaryReport();

    expect(
      report.checks.find((check) => check.reasonCode === "lower_authority_preserved"),
    ).toMatchObject({ status: "pass" });
    expect(report.candidates[0]?.sourceRefs.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.sourceProfileIds.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.authorityTiers.length).toBeGreaterThan(0);
    expect(report.candidates[0]?.proofHashes.length).toBeGreaterThan(0);
  });

  it("writer emits bounded artifacts without prohibited content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "phase2-autonomous-send-boundary-"));
    try {
      const report: Phase2AutonomousSendBoundaryReport =
        await buildPhase2AutonomousSendBoundaryReport();
      const artifact = await writePhase2AutonomousSendBoundaryArtifact({
        report,
        artifactDir: dir,
      });
      const json = await readFile(artifact.jsonPath, "utf8");
      const markdown = await readFile(artifact.markdownPath, "utf8");

      expect(JSON.parse(json)).toMatchObject({ reportId: report.reportId });
      expect(markdown).toContain("Autonomous Send Boundary Preflight");
      expect(json.toLowerCase()).not.toContain("raw-prompt-marker");
      expect(markdown.toLowerCase()).not.toContain("secret-marker");
      expect(artifact.byteLength).toBeLessThan(256 * 1024);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
