import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { emitHeartbeatEvent, resetHeartbeatEventsForTest } from "../../infra/heartbeat-events.js";
import { enqueueSystemEvent, resetSystemEventsForTest } from "../../infra/system-events.js";
import { modelMemoryProactivityHandlers } from "./model-memory-proactivity.js";

describe("model-memory proactivity gateway handlers", () => {
  it("returns diagnostics-only proactivity when no live event exists", async () => {
    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: { type: "req", id: "req-1", method: "modelMemory.proactivity.queue", params: {} },
      params: {
        sessionKey: "main",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      decision: "product_queue_enabled",
      queue: { surface: "chat" },
    });
    expect(payload.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
      attentionRequired: false,
      noDarkDataStatus: "pass",
    });
    expect(payload.liveDetectionReport).toMatchObject({
      decision: "no_live_opportunities",
    });
    expect(typeof payload.queue.items[0].boundedDisplayText).toBe("string");
    expect(payload.queue.items[0].boundedDisplayText.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("records a live event as structural evidence without creating an opportunity", async () => {
    const recordRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordLiveEvent"]({
      req: {
        type: "req",
        id: "req-live-event",
        method: "modelMemory.proactivity.recordLiveEvent",
        params: {},
      },
      params: {
        sourceId: "gateway-test-live-event",
        sourceType: "ordinary_turn_capture",
        signalKind: "active_work_state",
        sessionKey: "gateway-live-test",
        projectId: "openclaw",
        boundedSummary:
          "A real gateway test event says the current OpenClaw work needs a concrete planning handoff.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: recordRespond,
      context: {} as never,
    });
    expect(recordRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, sourceId: "gateway-test-live-event" }),
    );

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: { type: "req", id: "req-1b", method: "modelMemory.proactivity.queue", params: {} },
      params: {
        sessionKey: "gateway-live-test",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.liveDetectionReport).toMatchObject({
      decision: "no_live_opportunities",
      telemetry: {
        signalCount: expect.any(Number),
        opportunityCount: 0,
      },
    });
    expect(payload.liveDetectionReport.telemetry.signalCount).toBeGreaterThanOrEqual(1);
    expect(payload.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
      attentionRequired: false,
      workItemKind: "diagnostic",
      primaryAction: null,
    });
    expect(payload.queue.items[0].blockedReasonCodes).toContain("no_live_opportunities_detected");
  });

  it("keeps queued runtime system events as structural evidence until model review", async () => {
    resetSystemEventsForTest();
    const sessionKey = "gateway-system-event-live-test";
    enqueueSystemEvent(
      "Gateway rebuild completed and the user needs a concrete verification plan for proactivity.",
      { sessionKey, contextKey: "gateway:rebuild" },
    );

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-system-event",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey,
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.liveDetectionReport).toMatchObject({
      decision: "no_live_opportunities",
      telemetry: {
        signalCount: expect.any(Number),
        opportunityCount: 0,
      },
    });
    expect(payload.liveDetectionReport.telemetry.signalCount).toBeGreaterThanOrEqual(1);
    expect(payload.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
      workItemKind: "diagnostic",
      primaryAction: null,
    });
    expect(payload.queue.items[0].blockedReasonCodes).toContain("no_live_opportunities_detected");
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("keeps failed command events as structural evidence until model review", async () => {
    resetSystemEventsForTest();
    const sessionKey = "gateway-failed-command-live-test";
    enqueueSystemEvent("Exec finished (node=local id=run-1, code 1)\nGateway rebuild failed.", {
      sessionKey,
      contextKey: "exec:run-1",
      trusted: false,
    });

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-failed-command-event",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey,
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
      workItemKind: "diagnostic",
      primaryAction: null,
    });
    expect(payload.liveDetectionReport.telemetry.signalCount).toBeGreaterThanOrEqual(1);
    expect(payload.liveDetectionReport.telemetry.opportunityCount).toBe(0);
    expect(payload.queue.items[0].blockedReasonCodes).toContain("no_live_opportunities_detected");
    expect(payload.queue.items[0].blockedReasonCodes).not.toContain(
      "static_default_candidate_demoted",
    );
  });

  it("keeps heartbeat events as structural evidence until model review", async () => {
    resetHeartbeatEventsForTest();
    emitHeartbeatEvent({
      status: "failed",
      reason: "Heartbeat failed while checking the active OpenClaw workflow boundary.",
      durationMs: 1200,
    });

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-heartbeat-event",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey: "gateway-heartbeat-live-test",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.liveDetectionReport).toMatchObject({
      decision: "no_live_opportunities",
      telemetry: {
        signalCount: expect.any(Number),
        opportunityCount: 0,
      },
    });
    expect(payload.liveDetectionReport.telemetry.signalCount).toBeGreaterThanOrEqual(1);
    expect(payload.queue.items[0]).toMatchObject({
      status: "blocked",
      layer: "diagnostic",
      workItemKind: "diagnostic",
      primaryAction: null,
    });
    expect(payload.queue.items[0].blockedReasonCodes).toContain("no_live_opportunities_detected");
  });

  it("keeps assistant planning output structural without model-reviewed candidate seeding", async () => {
    const recordRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-chat-activity-1",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey: "generator-reset-chat-test",
        projectId: "openclaw",
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-generator-reset-1",
        boundedText: [
          "Potential next steps:",
          "1. Plan the generator reset so roadmap review results become inbox opportunities automatically.",
          "2. Investigate stale proactivity items that still surface after the work is already done.",
        ].join("\n"),
        userPromptSummary:
          "Review the roadmap and active work to generate potential proactivity plans.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: recordRespond,
      context: {} as never,
    });

    expect(recordRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, sourceKind: "assistant_turn" }),
    );

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-generator-reset-chat-queue",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey: "generator-reset-chat-test",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.extractionReport).toMatchObject({
      decision: "no_concrete_opportunities",
      candidateCount: 0,
    });
    expect(payload.ledgerReport).toMatchObject({
      decision: "no_opportunities",
    });
    expect(
      payload.queue.items.some(
        (item: { layer: string; draftReady?: boolean; opportunityId?: string }) =>
          item.layer === "diagnostic" && item.draftReady === true && Boolean(item.opportunityId),
      ),
    ).toBe(false);
  });

  it("surfaces a repeated skills workflow as one canonical skill candidate", async () => {
    const firstRecordRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-skill-chat-activity-1",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey: "skill-candidate-chat-test",
        projectId: "openclaw",
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-skill-candidate-1",
        boundedText:
          "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
        userPromptSummary:
          "Review recurring work in this repo that should eventually become reusable skills.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: firstRecordRespond,
      context: {} as never,
    });

    const secondRecordRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-skill-chat-activity-2",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey: "skill-candidate-chat-test",
        projectId: "openclaw",
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-skill-candidate-2",
        boundedText:
          "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
        userPromptSummary:
          "Stay on the same skill candidate area and identify the next implementation step.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: secondRecordRespond,
      context: {} as never,
    });

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-skill-candidate-queue",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey: "skill-candidate-chat-test",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.skillCandidateReport).toMatchObject({
      decision: "skill_candidates_ready",
      recordCount: 1,
      opportunityCount: 1,
    });
    const skillItems = payload.queue.items.filter(
      (item: { opportunityClass?: string }) => item.opportunityClass === "skill_candidate",
    );
    expect(skillItems).toHaveLength(1);
    expect(skillItems[0]?.skillCandidate).toMatchObject({
      sourceRuntime: "openclaw_session",
      lifecycleStatus: "detected",
      installTargets: ["workspace_skills_dir"],
    });
  });

  it("skillifies one canonical skill candidate into a bounded workspace-local draft", async () => {
    const sessionKey = "skillifier-gateway-test";
    const projectId = "openclaw";
    const userId = "conor";
    const recipientId = "conor";
    const operatorId = "operator-conor";

    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-skillifier-chat-activity-1",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey,
        projectId,
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-skillifier-1",
        boundedText:
          "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
        userPromptSummary:
          "Review recurring work in this repo that should eventually become reusable skills.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: vi.fn(),
      context: {} as never,
    });
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-skillifier-chat-activity-2",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey,
        projectId,
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-skillifier-2",
        boundedText:
          "Plan the skill candidate ledger integration so recurring work becomes one canonical opportunity across inline, heartbeat, inbox, and handoff.",
        userPromptSummary:
          "Stay on the same skill candidate area and identify the next implementation step.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: vi.fn(),
      context: {} as never,
    });

    const queueRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.queue"]({
      req: {
        type: "req",
        id: "req-skillifier-queue",
        method: "modelMemory.proactivity.queue",
        params: {},
      },
      params: {
        sessionKey,
        projectId,
        userId,
        recipientId,
        operatorId,
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond: queueRespond,
      context: {} as never,
    });
    const [, queuePayload] = queueRespond.mock.calls[0];
    const skillCandidateItem = queuePayload.queue.items.find(
      (item: { opportunityClass?: string; skillCandidate?: { skillCandidateId?: string } }) =>
        item.opportunityClass === "skill_candidate",
    );
    const skillCandidateId = skillCandidateItem?.skillCandidate?.skillCandidateId;
    expect(skillCandidateId).toBeTruthy();

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.skillifyCandidateDraft"]({
      req: {
        type: "req",
        id: "req-skillifier-draft",
        method: "modelMemory.proactivity.skillifyCandidateDraft",
        params: {},
      },
      params: {
        sessionKey,
        projectId,
        userId,
        recipientId,
        operatorId,
        skillCandidateId,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      decision: "draft_ready",
      skillCandidateId,
      reviewOnly: true,
      installationEnabled: false,
      promotionEnabled: false,
    });
    expect(payload.draftPath).toContain("/skills/");
    expect(payload.draftPath).not.toContain("/root/services/openclaw-roles/live/skills/");
    const reportRaw = await fs.readFile(payload.reportPath, "utf8");
    expect(reportRaw).toContain("draft_ready");
    const artifactRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.readArtifact"]({
      req: {
        type: "req",
        id: "req-skillifier-artifact-read",
        method: "modelMemory.proactivity.readArtifact",
        params: {},
      },
      params: {
        sessionKey,
        projectId,
        userId,
        recipientId,
        operatorId,
        queueItemId: skillCandidateItem.queueItemId,
        artifactKind: "skill",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: artifactRespond,
      context: {} as never,
    });
    const [artifactOk, artifactPayload] = artifactRespond.mock.calls[0];
    expect(artifactOk).toBe(true);
    expect(artifactPayload.artifactText).toContain("#");
    await fs.rm(payload.draftPath, { recursive: true, force: true }).catch(() => undefined);
  });

  it("skips assistant-turn fallback capture when bounded text is missing", async () => {
    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordChatActivity"]({
      req: {
        type: "req",
        id: "req-chat-activity-missing-text",
        method: "modelMemory.proactivity.recordChatActivity",
        params: {},
      },
      params: {
        sessionKey: "main",
        projectId: "openclaw",
        sourceKind: "assistant_turn",
        sourceMessageId: "assistant-missing-text",
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        skipped: true,
        reasonCode: "missing_bounded_text",
        sourceKind: "assistant_turn",
      }),
    );
  });

  it("returns personal autosend UX settings without raw content", async () => {
    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.personalAutosendUx"]({
      req: {
        type: "req",
        id: "req-2",
        method: "modelMemory.proactivity.personalAutosendUx",
        params: {},
      },
      params: { candidateReviewForceRun: true },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      decision: "product_ux_visible",
      settings: {
        mode: "controlled_autosend_trial",
        allowedAutoSendClass: "operator_approved_suggestion_available",
        manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
      },
    });
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("returns bounded proactivity inbox digest data", async () => {
    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.inbox"]({
      req: {
        type: "req",
        id: "req-3",
        method: "modelMemory.proactivity.inbox",
        params: {},
      },
      params: { candidateReviewForceRun: true },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      decision: "inbox_visible",
      digest: {
        counts: {
          pending: expect.any(Number),
          sent: expect.any(Number),
          snoozed: expect.any(Number),
          dismissed: expect.any(Number),
          blocked: expect.any(Number),
          autosend_trial: expect.any(Number),
        },
      },
    });
    expect(payload.digest.items.length).toBeGreaterThan(0);
    expect(payload.digest.items[0]).toMatchObject({
      noDarkDataStatus: "pass",
      whyThisAppearedSummary: expect.any(String),
    });
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });

  it("does not synthesize history rows for a single pending planning item", async () => {
    const recordRespond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.recordLiveEvent"]({
      req: {
        type: "req",
        id: "req-live-event-inbox",
        method: "modelMemory.proactivity.recordLiveEvent",
        params: {},
      },
      params: {
        sourceId: "gateway-test-inbox-live-event",
        sourceType: "ordinary_turn_capture",
        signalKind: "active_work_state",
        sessionKey: "gateway-inbox-live-test",
        projectId: "openclaw",
        boundedSummary:
          "A real OpenClaw task left a bounded planning follow-up for the active session.",
      },
      client: null,
      isWebchatConnect: () => true,
      respond: recordRespond,
      context: {} as never,
    });
    expect(recordRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ ok: true, sourceId: "gateway-test-inbox-live-event" }),
    );

    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.inbox"]({
      req: {
        type: "req",
        id: "req-inbox-live",
        method: "modelMemory.proactivity.inbox",
        params: {},
      },
      params: {
        sessionKey: "gateway-inbox-live-test",
        userId: "conor",
        recipientId: "conor",
        projectId: "openclaw",
        operatorId: "operator-conor",
        candidateReviewForceRun: true,
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    const actionableItems = payload.digest.items.filter(
      (item: { layer?: string }) => item.layer === "actionable",
    );
    const diagnosticItems = payload.digest.items.filter(
      (item: { layer?: string; status?: string }) =>
        item.layer === "diagnostic" && item.status === "blocked",
    );
    const plannedItems = payload.digest.items.filter(
      (item: { status?: string }) => item.status === "planned",
    );
    const sentItems = payload.digest.items.filter(
      (item: { status?: string }) => item.status === "sent",
    );
    expect(actionableItems).toHaveLength(0);
    expect(diagnosticItems.length).toBeGreaterThanOrEqual(1);
    expect(plannedItems).toHaveLength(0);
    expect(sentItems).toHaveLength(0);
    expect(payload.digest.counts.planned).toBe(0);
    expect(diagnosticItems.every((item: { status?: string }) => item.status === "blocked")).toBe(
      true,
    );
  });

  it("returns compact proactivity UX remediation state", async () => {
    const respond = vi.fn();
    await modelMemoryProactivityHandlers["modelMemory.proactivity.uxRemediation"]({
      req: {
        type: "req",
        id: "req-4",
        method: "modelMemory.proactivity.uxRemediation",
        params: {},
      },
      params: {},
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      ok: true,
      decision: "blocked",
      entryPoint: {
        label: "Proactivity",
        visibleInChatChrome: true,
        consumesTranscriptHeight: false,
      },
      drawer: {
        drawerKind: "existing_side_panel",
        fullInboxInChatThread: false,
        alwaysOpenWorkspacePanel: false,
      },
    });
    expect(payload.drawer.cards[0]).toMatchObject({
      suggestedAction: expect.any(String),
      messagePreview: expect.any(String),
      whyThisAppeared: expect.any(String),
    });
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
