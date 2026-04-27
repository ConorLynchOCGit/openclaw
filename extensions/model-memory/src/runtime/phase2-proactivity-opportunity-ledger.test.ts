import { describe, expect, it } from "vitest";
import type { Phase2OpportunityExtractionCandidate } from "./phase2-proactivity-opportunity-extraction.ts";
import type { Phase2OpportunityExtractionSource } from "./phase2-proactivity-opportunity-extraction.ts";
import { buildPhase2ProactivityOpportunityLedgerReport } from "./phase2-proactivity-opportunity-ledger.ts";

function extractionCandidate(): Phase2OpportunityExtractionCandidate {
  return {
    opportunityId: "opp-ledger-1",
    sourceKind: "assistant_turn",
    sourceMessageId: "assistant-message-1",
    sourceRunId: "run-1",
    projectId: "openclaw",
    sessionKey: "main",
    workItemKind: "planning_request",
    title: "Plan the generator reset",
    whyNow: "The roadmap review produced concrete proactivity next steps.",
    proposedNextStep:
      "Plan the generator reset so roadmap review results become inbox opportunities automatically.",
    expectedUserValue: "Makes normal planning output become actionable proactivity traffic.",
    evidenceSummary: "Extracted from bounded assistant output.",
    confidence: "high",
    limitations: ["bounded_assistant_output_extraction_only"],
    sourceRefs: ["chat://main/assistant_turn/assistant-message-1"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["content-hash-ledger-1"],
    proofHashes: ["proof-hash-ledger-1"],
    completionSignals: ["source_message:assistant-message-1"],
    supersessionSignals: ["title_hash:abc"],
    blockedReasonCodes: [],
    noDarkDataStatus: "pass",
    generatedAt: "2026-04-27T15:00:00.000Z",
  };
}

describe("phase2 proactivity opportunity ledger", () => {
  it("resolves an opportunity from a later assistant turn and preserves canonical ids", async () => {
    const report = await buildPhase2ProactivityOpportunityLedgerReport({
      now: new Date("2026-04-27T16:00:00.000Z"),
      opportunities: [{ ...extractionCandidate(), sourceFamily: "assistant_output" }],
      activitySources: [
        {
          sourceId: "assistant-resolution-1",
          sourceKind: "assistant_turn",
          sourceMessageId: "assistant-resolution-message-1",
          projectId: "openclaw",
          sessionKey: "main",
          boundedText:
            "Plan the generator reset is already done and handled, so this opportunity can close.",
          sourceRefs: ["chat://main/assistant_turn/assistant-resolution-message-1"],
          sourceProfileId: "manual_note",
          authorityTier: "tool_grounded",
          noDarkDataStatus: "pass",
        } satisfies Phase2OpportunityExtractionSource,
      ],
    });

    expect(report.decision).toBe("ledger_ready");
    expect(report.ledger.entries).toHaveLength(1);
    expect(report.ledger.entries[0]).toMatchObject({
      opportunityId: "opp-ledger-1",
      status: "done",
      resolvedByChatMessageId: "assistant-resolution-message-1",
    });
    expect(report.ledger.entries[0].workItemId).toBeTruthy();
    expect(report.ledger.entries[0].candidateId).toBeTruthy();
    expect(report.ledger.entries[0].queueItemId).toBeTruthy();
  });

  it("applies deterministic duplicate supersession", async () => {
    const first = extractionCandidate();
    const second = {
      ...extractionCandidate(),
      opportunityId: "opp-ledger-2",
      sourceMessageId: "assistant-message-2",
      contentHashes: ["content-hash-ledger-2"],
      proofHashes: ["proof-hash-ledger-2"],
    };
    const report = await buildPhase2ProactivityOpportunityLedgerReport({
      opportunities: [
        { ...first, sourceFamily: "assistant_output" },
        { ...second, sourceFamily: "assistant_output" },
      ],
    });

    expect(report.ledger.entries).toHaveLength(2);
    expect(
      report.ledger.entries.find((entry) => entry.opportunityId === "opp-ledger-1"),
    ).toMatchObject({
      status: "superseded",
      supersededByOpportunityId: "opp-ledger-2",
    });
    expect(
      report.supersessionSignals.some((signal) => signal.reasonCode === "duplicate_replaced"),
    ).toBe(true);
  });
});
