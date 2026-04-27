import { describe, expect, it } from "vitest";
import {
  assertPhase2HeartbeatProactivityReliable,
  buildPhase2HeartbeatProactivityReliabilityReport,
  rankHeartbeatProactivityItems,
} from "./phase2-heartbeat-proactivity-reliability.ts";
import type { Phase2ProductProactivityQueueItem } from "./phase2-product-proactivity-surfacing.ts";

function item(id: string, overrides: Partial<Phase2ProductProactivityQueueItem> = {}) {
  return {
    queueItemId: `queue-${id}`,
    candidateId: `candidate-${id}`,
    workItemId: `work-${id}`,
    workItemKind: "planning_request",
    workItemStatus: "not_started",
    primaryAction: {
      actionType: "plan_this",
      label: "Plan this",
      description: "Start bounded planning handoff.",
      requiresChatInject: false,
      executesAction: false,
    },
    secondaryActions: [],
    ctaExplanation: "Starts a bounded handoff.",
    handoffStatus: "idle",
    handoffError: null,
    handoffMessageAnchor: null,
    messageClass: "operator_approved_suggestion_available",
    boundedDisplayText: `Plan ${id}`,
    messagePreview: `Plan ${id}`,
    suggestedAction: `Plan ${id}`,
    candidateSummary: `Plan ${id}`,
    expectedUserValue: "High value proactive planning work.",
    planTitle: `Plan ${id}`,
    problem: `Why now for ${id}`,
    proposedMessage: `Produce a concrete plan for ${id}.`,
    userBenefit: "Helps the user move work forward.",
    evidenceSummary: "Bounded source evidence.",
    confidence: "high",
    blockedIfMissing: [],
    layer: "actionable",
    attentionRequired: true,
    sendStatus: "idle",
    sendError: null,
    sentMessageAnchor: null,
    status: "pending_review",
    eligibleScope: {
      environment: "live",
      userId: "conor",
      recipientId: "conor",
      projectId: "openclaw",
      sessionKey: "main",
      operatorId: "operator",
      allowedMessageClasses: [
        "operator_approved_suggestion_available",
        "operator_approved_follow_up_available",
      ],
      proofPrerequisiteIds: [],
      proofPrerequisiteHashes: [],
    },
    sourceRefs: [`gateway://heartbeat/${id}`],
    sourceProfileIds: ["tool_result_capture"],
    authorityTiers: ["tool_grounded"],
    contentHashes: [`content-${id}`],
    proofHashes: [`proof-${id}`],
    noDarkDataStatus: "pass",
    staleLabels: [],
    conflictLabels: [],
    blockedReasonCodes: [],
    generatedAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  } satisfies Phase2ProductProactivityQueueItem;
}

describe("phase2 heartbeat proactivity reliability", () => {
  it("ranks top live opportunities deterministically", () => {
    const rankings = rankHeartbeatProactivityItems({
      queueItems: [
        item("background", { confidence: "medium" }),
        item("active", { workItemId: "work-active" }),
      ],
      activeContextWorkItemIds: ["work-active"],
    });
    expect(rankings[0]).toMatchObject({
      workItemId: "work-active",
      activeContextMatch: true,
    });
    expect(rankings[0]?.reasonCodes).toContain("ranked_by_expected_value");
  });

  it("builds primary heartbeat surface with shared work item ids", async () => {
    const queueItem = item("top");
    const report = await buildPhase2HeartbeatProactivityReliabilityReport({
      queueItems: [queueItem],
      inboxWorkItemIds: [queueItem.workItemId],
      activeContextWorkItemIds: [queueItem.workItemId],
    });
    assertPhase2HeartbeatProactivityReliable(report);
    expect(report.surface).toMatchObject({
      heading: "What would help this user today?",
      diagnosticsOnly: false,
    });
    expect(report.surface.topItems[0]).toMatchObject({
      workItemId: queueItem.workItemId,
      primaryActionLabel: "Plan this",
    });
  });

  it("blocks missing top items, leakage, and action execution", async () => {
    const report = await buildPhase2HeartbeatProactivityReliabilityReport({
      queueItems: [],
      forceNoDarkDataFail: true,
      forceActionExecution: true,
    });
    expect(report.decision).toBe("blocked");
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reasonCode: "top_live_opportunity_required", status: "fail" }),
        expect.objectContaining({ reasonCode: "no_dark_data_required", status: "fail" }),
        expect.objectContaining({ reasonCode: "action_execution_disabled", status: "fail" }),
      ]),
    );
  });
});
