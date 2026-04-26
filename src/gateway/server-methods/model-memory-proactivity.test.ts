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
      boundedDisplayText: "An approved operator suggestion is available.",
      noDarkDataStatus: "pass",
    });
    expect(JSON.stringify(payload).toLowerCase()).not.toContain("raw-prompt-marker");
  });
});
