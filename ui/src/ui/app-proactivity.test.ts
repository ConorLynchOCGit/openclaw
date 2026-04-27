/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import type { ProactivityInboxDigest, ProactivityInboxItem } from "./types.ts";

const loadChatHistoryMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./controllers/chat.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./controllers/chat.ts")>();
  return {
    ...actual,
    loadChatHistory: loadChatHistoryMock,
  };
});

const { OpenClawApp } = await import("./app.ts");

function actionableInboxItem(overrides: Partial<ProactivityInboxItem> = {}): ProactivityInboxItem {
  return {
    itemId: "inbox-item-1",
    sourceArtifactReportId: "report-1",
    candidateId: "candidate-1",
    queueItemId: "queue-item-1",
    messageClass: "operator_approved_suggestion_available",
    boundedDisplayText: "Fix the broken Proactivity Inbox before expanding capability.",
    candidateSummary: "Fix the broken Proactivity Inbox before expanding capability.",
    suggestedAction: "Review and send the concrete proactivity correction if useful.",
    messagePreview: "Should we fix the broken Proactivity Inbox before adding more capability?",
    planTitle: "Fix Proactivity Inbox correctness",
    problem: "Approve & Send, filters, counts, and generic cards are not product-correct.",
    proposedMessage: "Should we fix the broken Proactivity Inbox before adding more capability?",
    expectedUserValue: "Makes proactivity reviewable and actionable in the real product UX.",
    userBenefit: "Makes proactivity reviewable and actionable in the real product UX.",
    evidenceSummary: "The current remediation sequence targets product correctness issues.",
    confidence: "high",
    blockedIfMissing: [],
    status: "pending_review",
    filterTags: ["actionable", "pending"],
    layer: "actionable",
    attentionRequired: true,
    sendStatus: "idle",
    sendError: null,
    sentMessageAnchor: null,
    sourceRefs: ["docs/projects/model-memory/phase-2-execution-roadmap.md"],
    sourceProfileIds: ["curated_repo_doc"],
    authorityTiers: ["curated_authoritative"],
    contentHashes: ["content-hash-1"],
    proofHashes: ["proof-hash-1"],
    noDarkDataStatus: "pass",
    feedbackSummary: {
      usefulCount: 0,
      notUsefulCount: 0,
      tooRepetitiveCount: 0,
      wrongContextCount: 0,
      unsafePrivateCount: 0,
    },
    whyThisAppearedSummary: "Generated from bounded proactivity correctness evidence.",
    blockedReasonCodes: [],
    ...overrides,
  };
}

function inboxDigest(item: ProactivityInboxItem): ProactivityInboxDigest {
  return {
    digestId: "digest-1",
    generatedAt: "2026-04-27T04:00:00.000Z",
    filters: [
      "actionable",
      "pending",
      "sent",
      "snoozed",
      "dismissed",
      "blocked",
      "autosend_trial",
      "diagnostics",
    ],
    counts: {
      actionable: item.layer === "actionable" && item.status === "pending_review" ? 1 : 0,
      pending: item.status === "pending_review" ? 1 : 0,
      sent: item.status === "sent" ? 1 : 0,
      snoozed: item.status === "snoozed" ? 1 : 0,
      dismissed: item.status === "dismissed" ? 1 : 0,
      blocked: item.status === "blocked" ? 1 : 0,
      autosend_trial: item.status === "autosend_trial" ? 1 : 0,
      diagnostics: item.layer === "diagnostic" ? 1 : 0,
    },
    layerCounts: {
      actionable: item.layer === "actionable" && item.status === "pending_review" ? 1 : 0,
      history: item.layer === "history" ? 1 : 0,
      diagnostic: item.layer === "diagnostic" ? 1 : 0,
    },
    items: [item],
  };
}

describe("OpenClawApp proactivity product correctness", () => {
  it("approve/send uses the inbox item source of truth and sends the edited message", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(actionableInboxItem());
    app.productProactivityQueue = [];
    app.productProactivityEditedMessages = {
      "queue-item-1": "Edited proactive message before send.",
    };

    await app.handleProductProactivityApproveSend("queue-item-1");

    expect(request).toHaveBeenCalledWith("chat.inject", {
      sessionKey: "main",
      message: "Edited proactive message before send.",
      label: "Model Memory",
    });
    expect(loadChatHistoryMock).toHaveBeenCalledWith(app);
    const sentItem = app.proactivityInboxDigest?.items[0];
    expect(sentItem).toMatchObject({
      status: "sent",
      layer: "history",
      sendStatus: "sent",
      proposedMessage: "Edited proactive message before send.",
    });
    expect(app.proactivityInboxDigest?.counts.actionable).toBe(0);
    expect(app.proactivityInboxDigest?.counts.sent).toBe(1);
    expect(app.proactivityInboxView).toBe("sent");
  });

  it("keeps the inbox item pending and shows failure feedback when chat.inject fails", async () => {
    const request = vi.fn(async () => {
      throw new Error("simulated inject failure");
    });
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(actionableInboxItem());
    app.productProactivityQueue = [];

    await app.handleProductProactivityApproveSend("queue-item-1");

    expect(request).toHaveBeenCalledWith("chat.inject", expect.any(Object));
    const failedItem = app.proactivityInboxDigest?.items[0];
    expect(failedItem).toMatchObject({
      status: "pending_review",
      layer: "actionable",
      sendStatus: "failed",
    });
    expect(failedItem?.sendError).toContain("simulated inject failure");
    expect(app.productProactivityError).toContain("simulated inject failure");
  });
});
