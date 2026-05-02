/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import type {
  ProductProactivityQueueItem,
  ProactivityInboxDigest,
  ProactivityInboxItem,
} from "./types.ts";

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
    workItemId: "work-item-1",
    workItemKind: "planning_request",
    workItemStatus: "not_started",
    primaryAction: {
      actionType: "plan_this",
      label: "Plan this",
      description: "Starts a bounded planning request in the current chat.",
      requiresChatInject: false,
      executesAction: false,
    },
    secondaryActions: [],
    ctaExplanation: "Starts a bounded planning request in chat; no action executes.",
    handoffStatus: "idle",
    handoffError: null,
    handoffMessageAnchor: null,
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
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 0,
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
      "planned",
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
      planned: item.status === "planned" ? 1 : 0,
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
  it("Plan this uses normal chat handoff instead of chat.inject", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(actionableInboxItem());
    app.productProactivityQueue = [];
    const sendChat = vi.spyOn(app, "handleSendChat").mockResolvedValue("run-plan-1");
    const loadQueue = vi.spyOn(app, "loadProductProactivityQueue").mockResolvedValue(undefined);
    const loadInbox = vi.spyOn(app, "loadProactivityInbox").mockResolvedValue(undefined);

    await app.handleProductProactivityWorkAction("queue-item-1", "plan_this");

    expect(request).not.toHaveBeenCalledWith("chat.inject", expect.any(Object));
    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(sendChat.mock.calls[0]?.[0]).toContain("Start a bounded plan this");
    expect(sendChat.mock.calls[0]?.[0]).toContain("Title:");
    expect(sendChat.mock.calls[0]?.[0]).toContain("Expected output");
    expect(sendChat.mock.calls[0]?.[0]).toContain("Safety boundary");
    const item = app.proactivityInboxDigest?.items[0];
    expect(item).toMatchObject({
      status: "planned",
      layer: "history",
      filterTags: ["planned"],
      workItemStatus: "planning_started",
      handoffStatus: "started",
      handoffMessageAnchor: "chat-message:queue-item-1",
      plannedArtifact: expect.objectContaining({
        status: "requested",
        title: "Fix Proactivity Inbox correctness",
        sourceRunId: "run-plan-1",
      }),
    });
    expect(item?.plannedArtifact?.requestSummary).toContain("Start a bounded plan this");
    expect(item?.feedbackSummary.positiveFeedbackCount).toBe(1);
    expect(loadQueue).not.toHaveBeenCalled();
    expect(loadInbox).not.toHaveBeenCalled();
    expect(app.proactivityInboxView).toBe("planned");
  });

  it("handoff failure is visible and preserves the pending item", async () => {
    const app = new OpenClawApp();
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(actionableInboxItem());
    app.productProactivityQueue = [];
    vi.spyOn(app, "handleSendChat").mockRejectedValue(new Error("simulated handoff failure"));

    await app.handleProductProactivityWorkAction("queue-item-1", "investigate");

    const item = app.proactivityInboxDigest?.items[0];
    expect(item).toMatchObject({
      status: "pending_review",
      handoffStatus: "failed",
    });
    expect(item?.handoffError).toContain("simulated handoff failure");
    expect(app.productProactivityError).toContain("simulated handoff failure");
  });

  it("draft skill package calls the bounded skillifier gateway method instead of chat handoff", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "modelMemory.proactivity.skillifyCandidateDraft") {
        return {
          ok: true,
          skillCandidateId: "skill-candidate-1",
          reportId: "skillifier-report-1",
          decision: "draft_ready",
          skillPackageId: "skill-package-1",
          packageTitle: "Skill Candidate Ledger Integration",
          draftPath: "/tmp/skills/skill-candidate-ledger-integration",
          reportPath:
            "/tmp/skills/skill-candidate-ledger-integration/.openclaw-skillifier/report.json",
          reviewSummary: "Review-only skill draft created.",
          nextReviewStep: "Review the generated SKILL.md.",
        };
      }
      return { ok: true, queue: { items: [] }, digest: { items: [] } };
    });
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(
      actionableInboxItem({
        primaryAction: {
          actionType: "draft_skill_package",
          label: "Draft skill package",
          description: "Creates a bounded review-only skill draft.",
          requiresChatInject: false,
          executesAction: false,
        },
        skillCandidate: {
          skillCandidateId: "skill-candidate-1",
          proactivityOpportunityId: "opportunity-1",
          normalizedIntentKey: "skill candidate ledger integration",
          sourceRuntime: "openclaw_session",
          candidateType: "repeated_work_pattern",
          evidenceSummary: "Bounded repeated workflow evidence.",
          recurrenceCount: 2,
          recurrenceWindow: {
            firstSeenAt: "2026-04-28T09:00:00.000Z",
            lastSeenAt: "2026-04-28T09:01:00.000Z",
          },
          exampleHashes: ["hash-1"],
          suggestedSkillName: "skill-candidate-ledger-integration",
          riskTier: "low",
          autonomyLevelCeiling: 1,
          lifecycleStatus: "detected",
          installTargets: ["workspace_skills_dir"],
          evalStatus: "not_started",
          vettingStatus: "not_started",
          canaryStatus: "not_started",
          createdAt: "2026-04-28T09:01:00.000Z",
          updatedAt: "2026-04-28T09:01:00.000Z",
          provenanceRefs: ["chat://main/assistant_turn/skill-candidate-1"],
          rollbackPlan: {
            rollbackId: "rollback-1",
            strategy: "disable_candidate_only",
            targetPaths: ["workspace_skills_dir"],
            directMainMutationAllowed: false,
          },
        },
      }),
    );
    app.productProactivityQueue = [];
    const loadQueue = vi.spyOn(app, "loadProductProactivityQueue").mockResolvedValue(undefined);
    const loadInbox = vi.spyOn(app, "loadProactivityInbox").mockResolvedValue(undefined);
    const sendChat = vi.spyOn(app, "handleSendChat").mockResolvedValue(null);

    await app.handleProductProactivityWorkAction("queue-item-1", "draft_skill_package");

    expect(sendChat).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("modelMemory.proactivity.skillifyCandidateDraft", {
      sessionKey: "main",
      projectId: "openclaw",
      operatorId: undefined,
      userId: undefined,
      recipientId: undefined,
      skillCandidateId: "skill-candidate-1",
    });
    expect(loadQueue).not.toHaveBeenCalled();
    expect(loadInbox).not.toHaveBeenCalled();
    expect(app.productProactivityError).toBeNull();
    expect(app.proactivityInboxDigest?.items[0]).toMatchObject({
      draftReady: true,
      skillifierDraft: {
        skillPackageId: "skill-package-1",
        draftPath: "/tmp/skills/skill-candidate-ledger-integration",
      },
      workItemStatus: "drafted",
    });
  });

  it("dismisses one inbox item locally without reloading or dropping the rest of the inbox", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const first = actionableInboxItem({
      itemId: "inbox-item-1",
      queueItemId: "queue-item-1",
      opportunityId: "opportunity-1",
    });
    const second = actionableInboxItem({
      itemId: "inbox-item-2",
      queueItemId: "queue-item-2",
      opportunityId: "opportunity-2",
      candidateId: "candidate-2",
      workItemId: "work-item-2",
      planTitle: "Second proactivity item",
    });
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.connected = true;
    app.sessionKey = "main";
    app.productProactivityQueue = [];
    app.proactivityInboxDigest = {
      ...inboxDigest(first),
      counts: {
        actionable: 2,
        pending: 2,
        planned: 0,
        sent: 0,
        snoozed: 0,
        dismissed: 0,
        blocked: 0,
        autosend_trial: 0,
        diagnostics: 0,
      },
      layerCounts: { actionable: 2, history: 0, diagnostic: 0 },
      items: [first, second],
    };
    const loadQueue = vi.spyOn(app, "loadProductProactivityQueue").mockResolvedValue(undefined);
    const loadInbox = vi.spyOn(app, "loadProactivityInbox").mockResolvedValue(undefined);

    await app.handleProductProactivityDismiss("queue-item-1");

    expect(loadQueue).not.toHaveBeenCalled();
    expect(loadInbox).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith("modelMemory.proactivity.updateOpportunityState", {
      opportunityId: "opportunity-1",
      status: "dismissed",
      sessionKey: "main",
      projectId: "openclaw",
      resolvedByChatMessageId: null,
      dismissalCooldownUntil: expect.any(String),
      plannedArtifact: null,
      reviewStatus: null,
    });
    expect(app.proactivityInboxDigest?.items).toHaveLength(2);
    expect(app.proactivityInboxDigest?.items[0]).toMatchObject({
      status: "dismissed",
      layer: "history",
      filterTags: ["dismissed"],
    });
    expect(app.proactivityInboxDigest?.items[0]?.feedbackSummary.negativeFeedbackCount).toBe(1);
    expect(app.proactivityInboxDigest?.items[1]).toMatchObject({
      queueItemId: "queue-item-2",
      status: "pending_review",
      layer: "actionable",
    });
    expect(app.proactivityInboxDigest?.counts.actionable).toBe(1);
    expect(app.proactivityInboxDigest?.counts.dismissed).toBe(1);
  });

  it("preserves started handoff state across queue and inbox reloads", async () => {
    const queueItem: ProductProactivityQueueItem = {
      ...actionableInboxItem({
        status: "planned",
        layer: "history",
        handoffStatus: "started",
        handoffMessageAnchor: "chat-message:queue-item-1",
      }),
      queueItemId: "queue-item-1",
      candidateId: "candidate-1",
      status: "planned",
      layer: "history",
      messageClass: "operator_approved_suggestion_available",
      eligibleScope: {
        environment: "live",
        userId: "user-1",
        recipientId: "recipient-1",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-1",
        allowedMessageClasses: ["operator_approved_suggestion_available"],
        proofPrerequisiteIds: [],
        proofPrerequisiteHashes: [],
      },
      staleLabels: [],
      conflictLabels: [],
      generatedAt: "2026-04-27T04:00:00.000Z",
      updatedAt: "2026-04-27T04:00:00.000Z",
    };
    const startedInboxItem = actionableInboxItem({
      status: "planned",
      layer: "history",
      handoffStatus: "started",
      handoffMessageAnchor: "chat-message:queue-item-1",
    });
    const request = vi.fn(async (method: string) => {
      if (method === "modelMemory.proactivity.queue") {
        return {
          queue: {
            items: [
              {
                ...queueItem,
                handoffStatus: "idle",
                handoffMessageAnchor: null,
              },
            ],
          },
        };
      }
      if (method === "modelMemory.proactivity.inbox") {
        return {
          digest: inboxDigest(
            actionableInboxItem({
              status: "planned",
              layer: "history",
              handoffStatus: "idle",
              handoffMessageAnchor: null,
            }),
          ),
        };
      }
      throw new Error(`unexpected method ${method}`);
    });
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.connected = true;
    app.sessionKey = "main";
    app.productProactivityQueue = [queueItem];
    app.proactivityInboxDigest = inboxDigest(startedInboxItem);

    await app.loadProductProactivityQueue();
    await app.loadProactivityInbox();

    expect(app.productProactivityQueue[0]).toMatchObject({
      handoffStatus: "started",
      handoffMessageAnchor: "chat-message:queue-item-1",
    });
    expect(app.proactivityInboxDigest?.items[0]).toMatchObject({
      handoffStatus: "started",
      handoffMessageAnchor: "chat-message:queue-item-1",
    });
  });

  it("does not run model-reviewed refresh from normal proactivity reads", async () => {
    const diagnosticItem = {
      ...actionableInboxItem({
        status: "blocked",
        layer: "diagnostic",
        blockedIfMissing: ["live_candidate", "model_authored_visible_copy"],
      }),
      queueItemId: "diagnostic-queue-item",
      staleLabels: [],
      conflictLabels: [],
      eligibleScope: {
        environment: "live",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator-conor",
        allowedMessageClasses: [],
        proofPrerequisiteIds: [],
        proofPrerequisiteHashes: [],
      },
      generatedAt: "2026-04-27T04:00:00.000Z",
      updatedAt: "2026-04-27T04:00:00.000Z",
    } as unknown as ProductProactivityQueueItem;
    const request = vi.fn().mockResolvedValueOnce({ ok: true, queue: { items: [diagnosticItem] } });
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.connected = true;
    app.sessionKey = "main";

    await app.loadProductProactivityQueue();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]).toEqual([
      "modelMemory.proactivity.queue",
      { sessionKey: "main", projectId: "openclaw" },
    ]);
    expect(app.productProactivityQueue).toEqual([diagnosticItem]);
  });

  it("approve/send uses the inbox item source of truth and sends the edited message", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const app = new OpenClawApp();
    app.client = { request } as never;
    app.sessionKey = "main";
    app.proactivityInboxDigest = inboxDigest(
      actionableInboxItem({
        workItemKind: "message_candidate",
        primaryAction: {
          actionType: "send_message",
          label: "Send message",
          description: "Sends the reviewed message through the explicit message path.",
          requiresChatInject: true,
          executesAction: false,
        },
      }),
    );
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
    expect(app.proactivityInboxView).toBe("actionable");
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
