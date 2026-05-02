import { describe, expect, it } from "vitest";
import {
  adaptOrdinaryTurnSource,
  redactOrdinaryTurnSourceEnvelopeForPersistence,
} from "./ordinary-turn-source-adapter.ts";

describe("ordinary-turn-source-adapter", () => {
  it("preserves speaker boundaries in deterministic normalized windows", () => {
    const result = adaptOrdinaryTurnSource({
      recentContext: [{ speaker: "assistant", text: "What format should I use?" }],
      currentTurnText: "Please keep explanations high level by default.",
      sessionId: "session-001",
      projectId: "project-001",
    });

    expect(result.source.sourceKind).toBe("ordinary_turn");
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].normalizedText).toContain("assistant: What format should I use?");
    expect(result.windows[0].normalizedText).toContain(
      "user: Please keep explanations high level by default.",
    );
  });

  it("splits only by structural message boundaries when the word budget requires it", () => {
    const result = adaptOrdinaryTurnSource({
      recentContext: [
        { speaker: "assistant", text: "Context one." },
        { speaker: "assistant", text: "Context two." },
      ],
      currentTurnText: "Please keep explanations high level by default.",
      maxWordsPerWindow: 4,
    });

    expect(result.windows.length).toBeGreaterThan(1);
    expect(
      result.windows.every((window) =>
        window.blockDescriptors.every((block) => block.kind === "message"),
      ),
    ).toBe(true);
  });

  it("splits a single long OpenClaw prompt into bounded structural windows", () => {
    const result = adaptOrdinaryTurnSource({
      currentTurnText:
        "Memory point alpha one two three four five six. Memory point beta seven eight nine ten eleven twelve.",
      maxWordsPerWindow: 5,
      sessionId: "session-long-prompt",
      projectId: "project-001",
    });

    expect(result.windows.length).toBeGreaterThan(1);
    expect(result.windows.every((window) => window.tokenEstimate <= 5)).toBe(true);
    expect(result.windows.map((window) => window.windowIndex)).toEqual(
      result.windows.map((_, index) => index),
    );
    expect(result.normalizedText).toContain("Memory point alpha");
    expect(result.normalizedText).toContain("Memory point beta");
  });

  it("allows assistant turns to be captured as the current turn for live runtime ingestion", () => {
    const result = adaptOrdinaryTurnSource({
      recentContext: [{ speaker: "user", text: "What should I remember?" }],
      currentTurnSpeaker: "assistant",
      currentTurnText: "Keep rollback pointed at native no-memory mode.",
      sessionId: "session-002",
    });

    expect(result.windows[0]?.normalizedText).toContain("user: What should I remember?");
    expect(result.windows[0]?.normalizedText).toContain(
      "assistant: Keep rollback pointed at native no-memory mode.",
    );
  });

  it("uses current timestamps by default instead of epoch placeholders", () => {
    const before = Date.now();
    const result = adaptOrdinaryTurnSource({
      currentTurnText: "Track this as a recent live turn.",
    });
    const after = Date.now();

    expect(result.source.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.source.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(result.windows[0]?.createdAt.getTime()).toBe(result.source.createdAt.getTime());
  });

  it("redacts full ordinary-turn text before persistence while preserving source and window ids", () => {
    const envelope = adaptOrdinaryTurnSource({
      recentContext: [{ speaker: "assistant", text: "Private assistant context" }],
      currentTurnText: "Please remember this private-ish standing preference.",
      sessionId: "session-redaction",
    });

    const redacted = redactOrdinaryTurnSourceEnvelopeForPersistence(envelope);

    expect(redacted.source.id).toBe(envelope.source.id);
    expect(redacted.windows[0]?.id).toBe(envelope.windows[0]?.id);
    expect(redacted.windows[0]?.normalizedText).toContain("[redacted ordinary_turn_window");
    expect(redacted.windows[0]?.normalizedText).not.toContain("Please remember");
    expect(JSON.stringify(redacted.windows[0]?.blockDescriptors)).not.toContain(
      "Private assistant context",
    );
    expect(redacted.source.sourceMetadata).toMatchObject({
      rawContentPersisted: false,
      ordinaryTurnCharCount: envelope.normalizedText.length,
    });
    expect(typeof redacted.source.sourceMetadata.ordinaryTurnTextSha256).toBe("string");
  });
});
