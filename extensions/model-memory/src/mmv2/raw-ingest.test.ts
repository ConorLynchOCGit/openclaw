import { describe, expect, it } from "vitest";
import { createRawIngestEvent } from "./raw-ingest.ts";

describe("mmv2/raw-ingest", () => {
  it("rejects empty raw_text", () => {
    expect(() =>
      createRawIngestEvent({
        sourceId: "source-001",
        rawText: " \n\n ",
      }),
    ).toThrow("raw_text must not be empty");
  });

  it("normalizes unicode and line endings while preserving content", () => {
    const event = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "Cafe\u0301\r\n\r\nLine 2",
    });

    expect(event.raw_text).toBe("Café\n\nLine 2");
  });

  it("preserves event metadata fields", () => {
    const event = createRawIngestEvent({
      sourceId: "source-001",
      rawText: "Alpha",
      tenantId: "tenant-001",
      userId: "user-001",
      sessionId: "session-001",
      metadata: {
        channel: "test-channel",
        locale: "en-US",
        sensitivity_hint: "none",
      },
    });

    expect(event.tenant_id).toBe("tenant-001");
    expect(event.user_id).toBe("user-001");
    expect(event.session_id).toBe("session-001");
    expect(event.metadata.channel).toBe("test-channel");
  });
});
