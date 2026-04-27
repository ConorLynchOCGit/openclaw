import { describe, expect, it, vi } from "vitest";
import { modelMemoryProactivityHandlers } from "./model-memory-proactivity.js";

describe("model-memory proactivity gateway handlers", () => {
  it("returns bounded product proactivity queue data for the active session", async () => {
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
      noDarkDataStatus: "pass",
    });
    expect(typeof payload.queue.items[0].boundedDisplayText).toBe("string");
    expect(payload.queue.items[0].boundedDisplayText.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
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
