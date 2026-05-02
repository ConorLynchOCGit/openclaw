import { describe, expect, it } from "vitest";
import {
  buildProactivityUserFacingFocusKey,
  cleanProactivityUserFacingText,
  extractAssistantTextForPhase,
  extractAssistantTextSignatureId,
  extractAssistantVisibleText,
  extractFirstTextBlock,
  isInternalProactivityWorkflowText,
  isMetaProactivityTitleText,
  isMeaningfulProactivityUserFacingText,
  isOperationalProactivityUserFacingText,
  isPromptScaffoldProactivityText,
  resolveAssistantMessagePhase,
} from "./chat-message-content.js";

describe("shared/chat-message-content", () => {
  it("extracts the first text block from array content", () => {
    expect(
      extractFirstTextBlock({
        content: [{ text: "hello" }, { text: "world" }],
      }),
    ).toBe("hello");
  });

  it("returns plain string content", () => {
    expect(
      extractFirstTextBlock({
        content: "hello from string content",
      }),
    ).toBe("hello from string content");
  });

  it("preserves empty-string text in the first block", () => {
    expect(
      extractFirstTextBlock({
        content: [{ text: "" }, { text: "later" }],
      }),
    ).toBe("");
  });

  it("only considers the first content block even if later blocks have text", () => {
    expect(
      extractFirstTextBlock({
        content: [null, { text: "later" }],
      }),
    ).toBeUndefined();
    expect(
      extractFirstTextBlock({
        content: [{ type: "image" }, { text: "later" }],
      }),
    ).toBeUndefined();
  });

  it("returns undefined for missing, empty, or non-text content", () => {
    expect(extractFirstTextBlock(null)).toBeUndefined();
    expect(extractFirstTextBlock({ content: [] })).toBeUndefined();
    expect(extractFirstTextBlock({ content: [{ type: "image" }] })).toBeUndefined();
    expect(extractFirstTextBlock({ content: ["hello"] })).toBeUndefined();
    expect(extractFirstTextBlock({ content: [{ text: 1 }, { text: "later" }] })).toBeUndefined();
  });
});

describe("extractAssistantVisibleText", () => {
  it("preserves boundary spacing when joining adjacent final_answer text blocks", () => {
    expect(
      extractAssistantTextForPhase(
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Hi ",
              textSignature: JSON.stringify({ v: 1, id: "msg_final_1", phase: "final_answer" }),
            },
            {
              type: "text",
              text: "there",
              textSignature: JSON.stringify({ v: 1, id: "msg_final_2", phase: "final_answer" }),
            },
          ],
        },
        { phase: "final_answer", joinWith: "" },
      ),
    ).toBe("Hi there");
  });

  it("prefers final_answer text over commentary text", () => {
    expect(
      extractAssistantVisibleText({
        role: "assistant",
        content: [
          {
            type: "text",
            text: "thinking like caveman",
            textSignature: JSON.stringify({ v: 1, id: "msg_commentary", phase: "commentary" }),
          },
          {
            type: "text",
            text: "Actual final answer",
            textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
          },
        ],
      }),
    ).toBe("Actual final answer");
  });

  it("does not fall back to commentary-only text", () => {
    expect(
      extractAssistantVisibleText({
        role: "assistant",
        content: [
          {
            type: "text",
            text: "thinking like caveman",
            textSignature: JSON.stringify({ v: 1, id: "msg_commentary", phase: "commentary" }),
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("does not fall back to unphased legacy text when final_answer is empty", () => {
    expect(
      extractAssistantVisibleText({
        role: "assistant",
        content: [
          { type: "text", text: "Legacy answer" },
          {
            type: "text",
            text: "   ",
            textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("falls back to unphased legacy text", () => {
    expect(
      extractAssistantVisibleText({
        role: "assistant",
        content: [{ type: "text", text: "Legacy answer" }],
      }),
    ).toBe("Legacy answer");
  });

  it("does not mix unphased legacy text into final_answer output", () => {
    expect(
      extractAssistantVisibleText({
        role: "assistant",
        phase: "final_answer",
        content: [
          { type: "text", text: "Legacy answer" },
          {
            type: "text",
            text: "Actual final answer",
            textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
          },
        ],
      }),
    ).toBe("Actual final answer");
  });
});

describe("resolveAssistantMessagePhase", () => {
  it("prefers the top-level assistant phase when present", () => {
    expect(resolveAssistantMessagePhase({ role: "assistant", phase: "commentary" })).toBe(
      "commentary",
    );
  });

  it("resolves a single explicit phase from textSignature metadata", () => {
    expect(
      resolveAssistantMessagePhase({
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Actual final answer",
            textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
          },
        ],
      }),
    ).toBe("final_answer");
  });

  it("returns undefined when text blocks contain mixed explicit phases", () => {
    expect(
      resolveAssistantMessagePhase({
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Working...",
            textSignature: JSON.stringify({ v: 1, id: "msg_commentary", phase: "commentary" }),
          },
          {
            type: "text",
            text: "Done.",
            textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
          },
        ],
      }),
    ).toBeUndefined();
  });
});

describe("extractAssistantTextSignatureId", () => {
  it("prefers the final_answer text signature id when requested", () => {
    expect(
      extractAssistantTextSignatureId(
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Working...",
              textSignature: JSON.stringify({ v: 1, id: "msg_commentary", phase: "commentary" }),
            },
            {
              type: "text",
              text: "Done.",
              textSignature: JSON.stringify({ v: 1, id: "msg_final", phase: "final_answer" }),
            },
          ],
        },
        { phase: "final_answer" },
      ),
    ).toBe("msg_final");
  });

  it("does not return commentary ids when requesting final_answer", () => {
    expect(
      extractAssistantTextSignatureId(
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Still thinking",
              textSignature: JSON.stringify({ v: 1, id: "msg_commentary", phase: "commentary" }),
            },
          ],
        },
        { phase: "final_answer" },
      ),
    ).toBeUndefined();
  });
});

describe("proactivity user-facing cleanup", () => {
  it("removes system/control-plane text and raw source refs from surfaced copy", () => {
    expect(
      cleanProactivityUserFacingText(
        "System: [2026-04-27 20:15 UTC] [Post-compaction context refresh] Review the current queue item. Source: chat://main/assistant_turn/msg_1.",
      ),
    ).toBe("Review the current queue item.");
  });

  it("suppresses heartbeat boilerplate and metadata-only text", () => {
    expect(
      cleanProactivityUserFacingText(
        'Sender (untrusted metadata): {"label":"openclaw-control-ui","id":"openclaw-control-ui"}',
      ),
    ).toBeUndefined();
    expect(
      cleanProactivityUserFacingText(
        "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.",
      ),
    ).toBeUndefined();
  });

  it("flags internal proactivity handoff and proof text as non-user-facing workflow text", () => {
    expect(
      isInternalProactivityWorkflowText(
        "I found a proactive item: Plan the next step. Action requested: plan this.",
      ),
    ).toBe(true);
    expect(
      isInternalProactivityWorkflowText(
        "Operator Phase 2 staged action approval proof. Proof marker: TEST. Approve the staged proposal for audit only. Do not execute.",
      ),
    ).toBe(true);
    expect(
      isInternalProactivityWorkflowText(
        "Review the roadmap and identify the top 4 concrete next implementation steps.",
      ),
    ).toBe(false);
  });

  it("detects prompt-scaffold and meta-title text for proactivity normalization", () => {
    expect(
      isPromptScaffoldProactivityText(
        "Review the current OpenClaw roadmap and active proactivity runtime work.",
      ),
    ).toBe(true);
    expect(
      isPromptScaffoldProactivityText("The current queue still leaks junk into surfaced copy."),
    ).toBe(false);
    expect(
      isMetaProactivityTitleText("Runtime-authoritative assistant-output proactivity capture"),
    ).toBe(true);
    expect(isMetaProactivityTitleText("Move assistant-output capture into the runtime path")).toBe(
      false,
    );
  });

  it("detects operational proactivity text and builds stable focus keys", () => {
    expect(isOperationalProactivityUserFacingText("HEARTBEAT_OK")).toBe(true);
    expect(
      isMeaningfulProactivityUserFacingText("Plan the heartbeat proactivity review item."),
    ).toBe(true);
    expect(
      buildProactivityUserFacingFocusKey("Plan the **heartbeat proactivity review** item only."),
    ).toBe("heartbeat proactivity review");
    expect(cleanProactivityUserFacingText("## Next concrete fix")).toBe("Next concrete fix");
  });

  it("bounds long visible copy at word boundaries instead of clipping mid-word", () => {
    expect(
      cleanProactivityUserFacingText(
        "Add Multi Pack Runtime Proof For Idempotent Consumption And Budget Enforcement",
        { maxLength: 64 },
      ),
    ).toBe("Add Multi Pack Runtime Proof For Idempotent Consumption And.");
  });
});
