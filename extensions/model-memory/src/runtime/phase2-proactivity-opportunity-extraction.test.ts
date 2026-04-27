import { describe, expect, it } from "vitest";
import { buildPhase2ProactivityOpportunityExtractionReport } from "./phase2-proactivity-opportunity-extraction.ts";

describe("phase2 proactivity opportunity extraction", () => {
  it("extracts concrete opportunities from assistant planning output", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      now: new Date("2026-04-27T15:00:00.000Z"),
      sources: [
        {
          sourceId: "assistant-plan-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-assistant-1",
          sourceRunId: "run-assistant-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText: [
            "Potential next steps:",
            "1. Plan the generator reset so roadmap review results become inbox opportunities automatically.",
            "2. Investigate stale proactivity items that still surface after the work is already done.",
          ].join("\n"),
          userPromptSummary:
            "Review the roadmap and active work to generate potential proactivity plans.",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("opportunities_extracted");
    expect(report.candidates).toHaveLength(2);
    expect(report.candidates[0]).toMatchObject({
      sourceKind: "assistant_turn",
      sourceMessageId: "msg-assistant-1",
      projectId: "openclaw",
      sessionKey: "main",
      noDarkDataStatus: "pass",
    });
    expect(report.candidates.map((candidate) => candidate.proposedNextStep)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("roadmap review results become inbox opportunities automatically"),
        expect.stringContaining("stale proactivity items"),
      ]),
    );
  });

  it("blocks generic placeholder output from becoming opportunities", async () => {
    const report = await buildPhase2ProactivityOpportunityExtractionReport({
      sources: [
        {
          sourceId: "assistant-placeholder-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "msg-assistant-placeholder-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "A suggestion is available. Review the memory-derived suggestion when convenient.",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant-placeholder-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        },
      ],
    });

    expect(report.decision).toBe("no_concrete_opportunities");
    expect(report.candidates).toHaveLength(0);
    expect(
      report.checks.find((check) => check.reasonCode === "generic_placeholder_blocked")?.status,
    ).toBe("pass");
  });
});
