import { describe, expect, it, vi } from "vitest";
import { cleanupEmbeddedAttemptResources } from "./attempt.subscription-cleanup.js";

describe("cleanupEmbeddedAttemptResources", () => {
  it("shuts down caller-owned native LSP service during attempt cleanup", async () => {
    const shutdown = vi.fn(async () => {});
    const disposeBundle = vi.fn(async () => {});
    const release = vi.fn(async () => {});

    await cleanupEmbeddedAttemptResources({
      flushPendingToolResultsAfterIdle: async () => {},
      sessionManager: {},
      releaseWsSession: () => {},
      sessionId: "session-1",
      nativeLspService: { shutdown },
      bundleLspRuntime: { dispose: disposeBundle },
      sessionLock: { release },
    });

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(disposeBundle).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
