import { describe, expect, it, vi } from "vitest";
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
      status: "pending_review",
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

  it("records a live event and returns it as an actionable queue item", async () => {
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
      },
      client: null,
      isWebchatConnect: () => true,
      respond,
      context: {} as never,
    });

    const [ok, payload] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(payload.liveDetectionReport).toMatchObject({
      decision: "live_opportunities_detected",
    });
    expect(payload.queue.items[0]).toMatchObject({
      layer: "actionable",
      attentionRequired: true,
      workItemKind: "planning_request",
      primaryAction: { actionType: "plan_this", requiresChatInject: false },
      planTitle: "Advance current openclaw work",
    });
    expect(payload.queue.items[0].proposedMessage).toContain("concrete planning handoff");
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
      decision: "ux_remediated",
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
