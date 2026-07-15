import { describe, expect, it, vi } from "vitest";
import type { AgentMessage } from "../../runtime/index.js";
import {
  createYieldAbortedResponse,
  stripSessionsYieldArtifacts,
} from "./attempt.sessions-yield.js";

describe("sessions_yield attempt helpers", () => {
  it("reports the synthetic yield unwind as a native successful stop", async () => {
    const stream = createYieldAbortedResponse({
      api: "anthropic-messages",
      provider: "anthropic",
      id: "test-model",
    });

    const events = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(events).toEqual([]);
    expect(await stream.result()).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "" }],
      stopReason: "stop",
      api: "anthropic-messages",
      provider: "anthropic",
      model: "test-model",
    });
  });

  it("strips only empty yield assistant artifacts from memory and persistence", async () => {
    const userMessage: AgentMessage = {
      role: "user",
      content: "wait for the child",
      timestamp: 1,
    };
    const interruptMessage: AgentMessage = {
      role: "custom",
      customType: "openclaw.sessions_yield_interrupt",
      content: "[sessions_yield interrupt]",
      display: false,
      timestamp: 2,
    };
    const yieldedAssistant = await createYieldAbortedResponse({}).result();
    const messages = [userMessage, interruptMessage, yieldedAssistant];
    const removeTrailingEntries = vi.fn();
    const activeSession = {
      messages,
      agent: { state: { messages } },
      sessionManager: { removeTrailingEntries },
    };

    stripSessionsYieldArtifacts(activeSession);

    expect(activeSession.agent.state.messages).toEqual([userMessage]);
    expect(removeTrailingEntries).toHaveBeenCalledOnce();
    const predicate = removeTrailingEntries.mock.calls[0]?.[0] as (entry: unknown) => boolean;
    expect(predicate({ type: "message", message: yieldedAssistant })).toBe(true);
    expect(
      predicate({
        type: "message",
        message: {
          ...yieldedAssistant,
          content: [{ type: "text", text: "real final answer" }],
        },
      }),
    ).toBe(false);
    expect(
      predicate({
        type: "custom_message",
        customType: "openclaw.sessions_yield_interrupt",
      }),
    ).toBe(true);
  });
});
