import { describe, expect, it } from "vitest";
import type { Phase2OpportunityExtractionSource } from "./phase2-proactivity-opportunity-extraction.ts";
import { buildPhase2ProactivityRecurringPatternReport } from "./phase2-proactivity-recurring-pattern-loop.ts";

describe("phase2 recurring pattern loop", () => {
  it("creates a repeated-user-ask opportunity only after the threshold is met", async () => {
    const sources: Phase2OpportunityExtractionSource[] = [
      {
        sourceId: "user-ask-1",
        sourceKind: "user_turn",
        sourceMessageId: "user-msg-1",
        projectId: "openclaw",
        sessionKey: "main",
        boundedText: "Review the roadmap and active work to generate potential proactivity plans.",
        userPromptSummary: "Review roadmap for proactivity plans",
        sourceRefs: ["chat://main/user_turn/user-msg-1"],
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
        noDarkDataStatus: "pass",
      },
      {
        sourceId: "user-ask-2",
        sourceKind: "user_turn",
        sourceMessageId: "user-msg-2",
        projectId: "openclaw",
        sessionKey: "main",
        boundedText: "Review the roadmap and active work to generate potential proactivity plans.",
        userPromptSummary: "Review roadmap for proactivity plans",
        sourceRefs: ["chat://main/user_turn/user-msg-2"],
        sourceProfileId: "explicit_user_turn",
        authorityTier: "user_authoritative",
        noDarkDataStatus: "pass",
      },
    ];
    const report = await buildPhase2ProactivityRecurringPatternReport({ sources });

    expect(report.decision).toBe("pattern_opportunities_ready");
    expect(report.opportunities).toHaveLength(1);
    expect(report.opportunities[0]).toMatchObject({
      workItemKind: "planning_request",
      title: "Follow up on repeated openclaw ask",
    });
  });
});
