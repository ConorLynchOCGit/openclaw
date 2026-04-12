import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { buildContextSegmentPlan } from "./context-segment-planner.js";

function makeAgentMessage(message: {
  role: string;
  content: unknown;
  timestamp?: number;
}): AgentMessage {
  return {
    timestamp: message.timestamp ?? Date.now(),
    ...message,
  } as unknown as AgentMessage;
}

describe("buildContextSegmentPlan", () => {
  it("builds stable, semi-stable, and volatile segments with deterministic ordering", () => {
    const plan = buildContextSegmentPlan({
      baseSystemPrompt: "Base instructions",
      contextEngineSystemPromptAddition: "Summary block",
      promptPrependContext:
        "## Approved Durable Memory Context\n\n## User Memory Pack\n\n- Prefer concise answers.",
      currentPrompt: "Please fix the tests",
      messages: [
        makeAgentMessage({ role: "user", content: "old user turn", timestamp: 1 }),
        makeAgentMessage({ role: "assistant", content: "old assistant turn", timestamp: 2 }),
      ],
      tokenBudget: 8_000,
    });

    expect(plan?.segments.map((segment) => segment.id)).toEqual([
      "context_engine_system_addition",
      "base_system_prompt",
      "approved_memory_context_prompt",
      "recent_messages",
      "current_turn_prompt",
    ]);
    expect(plan?.segments.map((segment) => segment.class)).toEqual([
      "semi_stable",
      "stable",
      "semi_stable",
      "volatile",
      "volatile",
    ]);
    expect(plan?.totals.stableTokens).toBeGreaterThan(0);
    expect(plan?.totals.semiStableTokens).toBeGreaterThan(0);
    expect(plan?.totals.volatileTokens).toBeGreaterThan(0);
    expect(plan?.policy.stableTargetTokens).toBeGreaterThan(0);
  });

  it("marks base system prompt as omitted when a hook override replaces it", () => {
    const plan = buildContextSegmentPlan({
      baseSystemPrompt: "Base instructions",
      approvedMemoryContextText: "## User Memory Pack\n\n- Prefer concise answers.",
      hookSystemPromptOverride: "Dynamic override",
    });

    expect(plan?.segments.map((segment) => segment.id)).toEqual(["hook_system_prompt_override"]);
    expect(plan?.omittedSegments).toEqual([
      {
        id: "base_system_prompt",
        label: "Base system prompt",
        class: "stable",
        reason: "replaced_by_hook_system_prompt_override",
      },
      {
        id: "approved_memory_context",
        label: "Approved durable memory packs",
        class: "semi_stable",
        reason: "replaced_by_hook_system_prompt_override",
      },
    ]);
  });
});
