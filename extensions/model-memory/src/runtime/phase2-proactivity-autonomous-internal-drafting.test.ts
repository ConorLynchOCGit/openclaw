import { describe, expect, it } from "vitest";
import { buildPhase2ProactivityAutonomousInternalDraftingReport } from "./phase2-proactivity-autonomous-internal-drafting.ts";
import type { Phase2OpportunityLedgerEntry } from "./phase2-proactivity-opportunity-ledger.ts";

function ledgerEntry(
  overrides: Partial<Phase2OpportunityLedgerEntry> = {},
): Phase2OpportunityLedgerEntry {
  return {
    opportunityId: "opp-draft-1",
    workItemId: "work-item-draft-1",
    candidateId: "candidate-draft-1",
    queueItemId: "queue-item-draft-1",
    sourceFamily: "assistant_output",
    projectId: "openclaw",
    sessionKey: "main",
    title: "Plan the generator reset",
    whyNow: "The current chat produced concrete next steps that should become proactivity traffic.",
    proposedNextStep:
      "Plan the generator reset so assistant next-step output becomes inbox work automatically.",
    expectedUserValue: "Creates momentum before the user opens the inbox.",
    evidenceSummary: "Bounded assistant output and heartbeat ranking support this opportunity.",
    confidence: "high",
    workItemKind: "planning_request",
    status: "open",
    sourceRefs: ["chat://main/assistant_turn/msg-1"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["content-hash-draft-1"],
    proofHashes: ["proof-hash-draft-1"],
    blockedReasonCodes: [],
    resolvedByChatMessageId: null,
    supersededByOpportunityId: null,
    attentionRequired: true,
    staleLabels: [],
    conflictLabels: [],
    noDarkDataStatus: "pass",
    generatedAt: "2026-04-27T15:00:00.000Z",
    updatedAt: "2026-04-27T15:00:00.000Z",
    ...overrides,
  };
}

describe("phase2 autonomous internal drafting", () => {
  it("creates bounded internal drafts for top opportunities only", async () => {
    const report = await buildPhase2ProactivityAutonomousInternalDraftingReport({
      topEntries: [
        ledgerEntry(),
        ledgerEntry({
          opportunityId: "opp-draft-2",
          workItemId: "work-item-draft-2",
          queueItemId: "queue-item-draft-2",
        }),
      ],
    });

    expect(report.decision).toBe("drafts_ready");
    expect(report.drafts).toHaveLength(2);
    expect(report.drafts[0]).toMatchObject({
      opportunityId: "opp-draft-1",
      workItemId: "work-item-draft-1",
      draftKind: "planning_brief",
    });
    expect(report.drafts[0].safetyBoundary).toContain("Do not edit files");
  });
});
