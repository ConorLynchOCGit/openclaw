import { describe, expect, it } from "vitest";
import {
  buildRigidCaptureWindowsFromValidatedHints,
  buildSectionMapCandidateHintsInput,
  buildSectionMapStrategyTelemetry,
  buildSectionMapDocument,
  planSectionMapAdaptiveFallback,
  selectDocumentIngestStrategy,
  validateSectionMapHint,
  validateSectionMapHints,
  type SectionMapCandidateHint,
} from "./section-map-candidate-hints.ts";

const sourceText = [
  "# Runbook",
  "",
  "Follow the rollback checklist before restarting the gateway.",
  "",
  "| Step | Owner |",
  "| --- | --- |",
  "| health check | operator |",
  "",
  "## Decisions",
  "",
  "Decision: benchmark artifacts must remain outside durable memory.",
  "",
  "## Changelog",
  "",
  "- 2026-04-23: section maps preserve exact source spans.",
].join("\n");

describe("section-map candidate-hints strategy", () => {
  it("builds stable deterministic section ids for unchanged docs", () => {
    const first = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const second = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });

    expect(first.sections.map((section) => section.sectionId)).toEqual(
      second.sections.map((section) => section.sectionId),
    );
    expect(first.sections.map((section) => section.windowId)).toEqual(
      second.sections.map((section) => section.windowId),
    );
    expect(first.rawContentPersisted).toBe(false);
    expect(first.canonicalTruth).toBe(false);
  });

  it("changes only the modified section hash when one section changes", () => {
    const first = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const changed = buildSectionMapDocument({
      sourceId: "source-doc",
      text: sourceText.replace(
        "section maps preserve exact source spans",
        "section maps preserve changed spans",
      ),
    });

    const unchanged = first.sections
      .filter((section) => section.title !== "Changelog")
      .map((section) => [section.sectionId, section.sectionHash]);
    const changedUnchanged = changed.sections
      .filter((section) => section.title !== "Changelog")
      .map((section) => [section.sectionId, section.sectionHash]);
    expect(changedUnchanged).toEqual(unchanged);
    expect(changed.sections.find((section) => section.title === "Changelog")?.sectionHash).not.toBe(
      first.sections.find((section) => section.title === "Changelog")?.sectionHash,
    );
  });

  it("maps markdown table sections with source offsets that validate original text", () => {
    const document = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const tableSection = document.sections.find((section) => section.title === "Runbook");

    expect(tableSection?.text).toContain("| Step | Owner |");
    expect(sourceText.slice(tableSection?.startOffset, tableSection?.endOffset)).toContain(
      "rollback checklist",
    );
  });

  it("validates exact quotes and rejects unsupported quote/span hints without fuzzy matching", () => {
    const document = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const section = document.sections.find((entry) => entry.title === "Decisions");
    expect(section).toBeDefined();
    const validHint: SectionMapCandidateHint = {
      candidateId: "hint-1",
      candidateType: "decision",
      text: "Benchmark artifacts stay outside durable memory.",
      sourceSectionId: section!.sectionId,
      sourceSpanId: section!.spanId,
      boundedQuote: "benchmark artifacts must remain outside durable memory",
      confidence: 0.9,
    };

    expect(validateSectionMapHint(document, validHint)).toMatchObject({
      status: "validated",
    });
    expect(
      validateSectionMapHint(document, {
        ...validHint,
        candidateId: "hint-2",
        boundedQuote: "benchmark artifacts may be stored in durable memory",
      }),
    ).toMatchObject({
      status: "unsupported",
      failureClass: "quote_not_found",
    });
    expect(
      validateSectionMapHint(document, {
        ...validHint,
        candidateId: "hint-3",
        sourceSpanId: "span_wrong",
      }),
    ).toMatchObject({
      status: "unsupported",
      failureClass: "wrong_span",
    });
  });

  it("passes only validated hints into rigid capture windows", () => {
    const document = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const section = document.sections.find((entry) => entry.title === "Runbook")!;
    const validations = validateSectionMapHints(document, {
      strategy: "section_map_candidate_hints",
      sourceId: document.sourceId,
      sourceHash: document.sourceHash,
      canonicalTruth: false,
      omittedSections: [],
      uncertainSections: [],
      hints: [
        {
          candidateId: "hint-valid",
          candidateType: "procedure",
          text: "Follow rollback checklist before restart.",
          sourceSectionId: section.sectionId,
          sourceSpanId: section.spanId,
          boundedQuote: "Follow the rollback checklist before restarting the gateway.",
          confidence: 0.95,
        },
        {
          candidateId: "hint-invalid",
          candidateType: "claim",
          text: "Unsupported.",
          sourceSectionId: section.sectionId,
          sourceSpanId: section.spanId,
          boundedQuote: "not in the source",
          confidence: 0.95,
        },
      ],
    });

    const windows = buildRigidCaptureWindowsFromValidatedHints({ document, validations });

    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({
      hintId: "hint-valid",
      candidateType: "procedure",
      sourceId: "source-doc",
    });
  });

  it("classifies low coverage and quote failures as partial adaptive fallback work", () => {
    const document = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const section = document.sections[0];
    const validations = [
      validateSectionMapHint(document, {
        candidateId: "hint-invalid",
        candidateType: "claim",
        text: "Unsupported.",
        sourceSectionId: section.sectionId,
        sourceSpanId: section.spanId,
        boundedQuote: "not in source",
        confidence: 0.9,
      }),
    ];

    const fallback = planSectionMapAdaptiveFallback({ document, validations });
    const telemetry = buildSectionMapStrategyTelemetry({ document, validations });

    expect(fallback.partial).toBe(true);
    expect(fallback.reasons).toEqual(
      expect.arrayContaining(["low_candidate_coverage", "quote_validation_failed"]),
    );
    expect(telemetry.quarantinedCount).toBe(1);
    expect(JSON.stringify(telemetry)).not.toContain("not in source");
  });

  it("selects section-map strategy for auto large docs and keeps small docs on direct capture", () => {
    const large = `${sourceText}\n${"word ".repeat(3000)}`;

    expect(
      selectDocumentIngestStrategy({
        requestedStrategy: "auto",
        sourceText: large,
      }),
    ).toBe("section_map_candidate_hints");
    expect(
      selectDocumentIngestStrategy({
        sourceText: large,
      }),
    ).toBe("section_map_candidate_hints");
    expect(
      selectDocumentIngestStrategy({
        requestedStrategy: "section_map_candidate_hints",
        sourceText: large,
      }),
    ).toBe("section_map_candidate_hints");
    expect(
      selectDocumentIngestStrategy({
        requestedStrategy: "section_map_candidate_hints",
        sourceText,
      }),
    ).toBe("direct_rigid_capture");
    expect(
      selectDocumentIngestStrategy({
        requestedStrategy: "direct_rigid_capture",
        sourceText: large,
      }),
    ).toBe("direct_rigid_capture");
  });

  it("builds prompt input without making hints canonical truth", () => {
    const document = buildSectionMapDocument({ sourceId: "source-doc", text: sourceText });
    const input = buildSectionMapCandidateHintsInput(document);

    expect(input.sections[0]).toHaveProperty("boundedSummary");
    expect(JSON.stringify(input)).not.toContain("raw prompt");
    expect(JSON.stringify(document)).not.toContain("/root/.openclaw/workspace/MEMORY.md");
  });
});
