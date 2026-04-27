import { describe, expect, it } from "vitest";
import {
  assertPhase2RealSuggestionContentReport,
  buildPhase2RealSuggestionContentReport,
  writePhase2RealSuggestionContentArtifact,
} from "./phase2-real-suggestion-content-contract.ts";

describe("phase2 real suggestion content contract", () => {
  it("requires concrete preview, action, summary, and expected value", async () => {
    const report = await buildPhase2RealSuggestionContentReport();
    assertPhase2RealSuggestionContentReport(report);
    expect(report.previews[0]?.fields).toMatchObject({
      messagePreview: expect.any(String),
      suggestedAction: expect.any(String),
      candidateSummary: expect.any(String),
      expectedUserValue: expect.any(String),
    });
    expect(report.telemetry.genericPlaceholderObserved).toBe(false);
    expect(report.telemetry.approvalUsesExactPreview).toBe(true);
  });

  it("blocks generic placeholder-only candidates as non-actionable", async () => {
    const report = await buildPhase2RealSuggestionContentReport({ forceGenericPlaceholder: true });
    expect(report.decision).toBe("blocked");
    expect(report.previews[0]?.actionable).toBe(false);
    expect(report.previews[0]?.blockedReasonCodes).toContain("generic_placeholder_blocked");
  });

  it("blocks missing provenance and no-dark-data failures", async () => {
    const missingProvenance = await buildPhase2RealSuggestionContentReport({
      forceMissingProvenance: true,
    });
    expect(missingProvenance.decision).toBe("blocked");
    expect(missingProvenance.previews[0]?.blockedReasonCodes).toContain("provenance_required");

    const noDarkData = await buildPhase2RealSuggestionContentReport({
      forceNoDarkDataFail: true,
    });
    expect(noDarkData.decision).toBe("blocked");
    expect(noDarkData.previews[0]?.blockedReasonCodes).toContain("no_dark_data_required");
  });

  it("writes bounded artifacts without prohibited content", async () => {
    const report = await buildPhase2RealSuggestionContentReport();
    const artifact = await writePhase2RealSuggestionContentArtifact({
      report,
      artifactDir: ".artifacts/test/model-memory/phase2-real-suggestion-content-contract-test",
    });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify({ report, artifact }).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
