/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import type { ProductProactivityQueueItem } from "./types.ts";
const { OpenClawApp } = await import("./app.ts");

function makeQueueItem(
  id: string,
  overrides: Partial<ProductProactivityQueueItem> = {},
): ProductProactivityQueueItem {
  return {
    queueItemId: `queue-${id}`,
    candidateId: `candidate-${id}`,
    opportunityId: id,
    workItemId: `work-${id}`,
    workItemKind: "planning_request",
    workItemStatus: "planned",
    primaryAction: null,
    secondaryActions: [],
    ctaExplanation: "Review the bounded draft.",
    handoffStatus: "idle",
    handoffError: null,
    handoffMessageAnchor: null,
    plannedArtifact: {
      status: "compiled",
      title: `Plan ${id}`,
      requestSummary: `Request ${id}`,
      compiledPlan: `Compiled plan ${id}`,
      generatedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    messageClass: "operator_approved_suggestion_available",
    boundedDisplayText: `Display ${id}`,
    messagePreview: `Preview ${id}`,
    suggestedAction: `Suggested ${id}`,
    candidateSummary: `Candidate ${id}`,
    expectedUserValue: `Expected ${id}`,
    planTitle: `Plan title ${id}`,
    problem: `Problem ${id}`,
    proposedMessage: `Message ${id}`,
    userBenefit: `Benefit ${id}`,
    evidenceSummary: `Evidence ${id}`,
    confidence: "high",
    blockedIfMissing: [],
    userFacingBrief: {
      title: `Title ${id}`,
      kindLabel: "Follow-up",
      oneLinePurpose: `Purpose ${id}`,
      recommendedNextStep: `Recommended ${id}`,
      primaryActionLabel: "Review",
      detailSummary: `Detail ${id}`,
      hiddenDiagnostics: { provenanceRefs: [], limitations: [] },
      quality: { status: "pass", reasons: [] },
    },
    resolvedByChatMessageId: null,
    supersededByOpportunityId: null,
    dismissalCooldownUntil: null,
    layer: "actionable",
    attentionRequired: true,
    sendStatus: "idle",
    sendError: null,
    sentMessageAnchor: null,
    status: "pending_review",
    eligibleScope: {
      environment: "live",
      userId: "user",
      recipientId: "user",
      projectId: "openclaw",
      sessionKey: "main",
      operatorId: "operator",
      allowedMessageClasses: ["operator_approved_suggestion_available"],
      proofPrerequisiteIds: [],
      proofPrerequisiteHashes: [],
    },
    sourceRefs: [`chat://session/${id}`],
    sourceProfileIds: ["manual_note"],
    authorityTiers: ["tool_grounded"],
    contentHashes: [`content-${id}`],
    proofHashes: [`proof-${id}`],
    noDarkDataStatus: "pass",
    staleLabels: [],
    conflictLabels: [],
    blockedReasonCodes: [],
    generatedAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("OpenClawApp work queue route state", () => {
  it("updates the URL when selecting a work queue object on the work queue tab", () => {
    window.history.replaceState({}, "", "/work-queue");
    const app = new OpenClawApp();
    app.tab = "workQueue";

    app.selectWorkQueueObject("opportunity-42");

    expect(new URL(window.location.href).searchParams.get("item")).toBe("opportunity-42");
  });

  it("resolves selected object from the route deep link", () => {
    window.history.replaceState({}, "", "/work-queue?item=opportunity-2");
    const app = new OpenClawApp();
    app.productProactivityQueue = [makeQueueItem("opportunity-1"), makeQueueItem("opportunity-2")];
    app.proactivityInboxDigest = null;
    app.tab = "workQueue";
    (app as any).syncWorkQueueSelectionFromUrl();

    expect(app.getSelectedWorkQueueObject()?.id).toBe("opportunity-2");
  });
});
