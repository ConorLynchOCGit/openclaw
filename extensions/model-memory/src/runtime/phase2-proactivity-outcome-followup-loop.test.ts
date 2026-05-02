import { describe, expect, it } from "vitest";
import type { Phase2OpportunityLedgerEntry } from "./phase2-proactivity-opportunity-ledger.ts";
import { buildPhase2ProactivityOutcomeFollowupReport } from "./phase2-proactivity-outcome-followup-loop.ts";

function followupEntry(
  overrides: Partial<Phase2OpportunityLedgerEntry> = {},
): Phase2OpportunityLedgerEntry {
  return {
    opportunityId: "opp-followup-1",
    workItemId: "work-item-followup-1",
    candidateId: "candidate-followup-1",
    queueItemId: "queue-item-followup-1",
    sourceFamily: "assistant_output",
    projectId: "openclaw",
    sessionKey: "main",
    title: "Investigate stale proof items",
    whyNow: "Proof-originated items are still surfacing after completion.",
    proposedNextStep:
      "Investigate why stale proof-originated items still surface and define completion signals.",
    expectedUserValue: "Stops obsolete items from lingering in the actionable UX.",
    evidenceSummary: "Later work shows the item should have retired automatically.",
    confidence: "high",
    workItemKind: "investigation_request",
    status: "planning_started",
    sourceRefs: ["chat://main/assistant_turn/msg-followup-1"],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["tool_grounded"],
    contentHashes: ["content-hash-followup-1"],
    proofHashes: ["proof-hash-followup-1"],
    blockedReasonCodes: [],
    resolvedByChatMessageId: null,
    supersededByOpportunityId: null,
    attentionRequired: true,
    staleLabels: [],
    conflictLabels: [],
    noDarkDataStatus: "pass",
    generatedAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("phase2 outcome followup loop", () => {
  it("does not deterministically resurface unfinished work and only closes superseded items", async () => {
    const report = await buildPhase2ProactivityOutcomeFollowupReport({
      now: new Date("2026-04-27T12:00:00.000Z"),
      entries: [
        followupEntry(),
        followupEntry({
          opportunityId: "opp-followup-2",
          workItemId: "work-item-followup-2",
          queueItemId: "queue-item-followup-2",
          status: "superseded",
        }),
      ],
    });

    expect(report.decisions).toEqual([
      expect.objectContaining({
        opportunityId: "opp-followup-2",
        nextStatus: "superseded",
        reasonCode: "superseded_closed",
      }),
    ]);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        reasonCode: "model_review_required_for_followup",
        status: "pass",
      }),
    );
  });
});
