import { describe, expect, it } from "vitest";
import {
  assertPhase2HeartbeatProactivityReliable,
  buildPhase2HeartbeatProactivityReliabilityReport,
  selectHeartbeatProactivityItems,
} from "./phase2-heartbeat-proactivity-reliability.ts";
import type { Phase2ProductProactivityQueueItem } from "./phase2-product-proactivity-presentation.ts";

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
    userFacingBrief: {
      title: `Opportunity ${id}`,
      kindLabel: "Proactive plan",
      oneLinePurpose: `Explains the next product decision for ${id}.`,
      recommendedNextStep: `Choose whether this belongs in operator review for ${id}.`,
      primaryActionLabel: "Plan this",
      detailSummary: `Model-authored details for ${id}.`,
      hiddenDiagnostics: {
        provenanceRefs: [],
        limitations: [],
      },
      quality: {
        status: "pass",
        reasons: ["model_authored_visible_copy"],
      },
      authorship: {
        source: "model",
        modelId: "test-model",
        validationStatus: "pass",
      },
    },
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
  it("orders clean model-authored opportunities by structural context only", () => {
    const selections = selectHeartbeatProactivityItems({
      queueItems: [
        item("background", { confidence: "medium" }),
        item("active", { workItemId: "work-active" }),
      ],
      activeContextWorkItemIds: ["work-active"],
    });
    expect(selections[0]).toMatchObject({
      workItemId: "work-active",
      activeContextMatch: true,
    });
    expect(selections[0]?.reasonCodes).toContain("active_context_match");
    expect(selections[0]?.reasonCodes).not.toContain("ranked_by_expected_value");
  });

  it("prefers recent assistant-output opportunities over older heartbeat-only items", () => {
    const selections = selectHeartbeatProactivityItems({
      now: new Date("2026-04-27T00:20:00.000Z"),
      queueItems: [
        item("heartbeat", {
          sourceRefs: ["gateway://heartbeat/old"],
          updatedAt: "2026-04-27T00:00:00.000Z",
        }),
        item("assistant", {
          workItemId: "work-assistant",
          sourceRefs: ["chat://main/assistant_turn/msg-assistant"],
          updatedAt: "2026-04-27T00:15:00.000Z",
          attentionRequired: false,
        }),
      ],
    });

    expect(selections[0]).toMatchObject({
      workItemId: "work-assistant",
    });
    expect(selections[0]?.reasonCodes).toContain("recent_assistant_output");
  });

  it("suppresses dirty system-sounding copy behind clean user-facing opportunities", () => {
    const selections = selectHeartbeatProactivityItems({
      queueItems: [
        item("dirty", {
          workItemId: "work-dirty",
          userFacingBrief: {
            title: "Heartbeat proactivity review",
            kindLabel: "Proactive plan",
            oneLinePurpose:
              "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. HEARTBEAT_OK.",
            recommendedNextStep: "Canonically verify the active session's planning state.",
            primaryActionLabel: "Plan this",
            hiddenDiagnostics: {
              provenanceRefs: [],
              limitations: [],
            },
            quality: {
              status: "pass",
              reasons: ["fixture_dirty_copy"],
            },
          },
          sourceRefs: ["chat://main/assistant_turn/msg-dirty"],
        }),
        item("clean", {
          workItemId: "work-clean",
          userFacingBrief: {
            title: "Prune duplicate same-session opportunities",
            kindLabel: "Proactive plan",
            oneLinePurpose: "Older assistant-derived items are crowding the actionable surfaces.",
            recommendedNextStep:
              "Review the same-session collapse plan so the newest canonical item stays actionable.",
            primaryActionLabel: "Plan this",
            hiddenDiagnostics: {
              provenanceRefs: [],
              limitations: [],
            },
            quality: {
              status: "pass",
              reasons: ["fixture_clean_copy"],
            },
          },
          sourceRefs: ["chat://main/assistant_turn/msg-clean"],
        }),
      ],
    });

    expect(selections[0]?.workItemId).toBe("work-clean");
    expect(
      selections.find((selection) => selection.workItemId === "work-dirty")?.reasonCodes,
    ).toContain("suppressed_dirty_surface_copy");
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

  it("does not surface heartbeat cards when only dirty control-plane items remain", async () => {
    const report = await buildPhase2HeartbeatProactivityReliabilityReport({
      queueItems: [
        item("dirty-only", {
          userFacingBrief: undefined,
          sourceRefs: ["chat://main/assistant_turn/msg-dirty-only"],
        }),
      ],
      inboxWorkItemIds: ["work-dirty-only"],
    });

    expect(report.surface.topItems).toHaveLength(0);
  });
});
