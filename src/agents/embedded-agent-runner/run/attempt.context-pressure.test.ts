// Focused acceptance for native provider-boundary context handling.
import { notifyLlmRequestActivity } from "@openclaw/ai/internal/runtime";
import type { AgentMessage } from "openclaw/plugin-sdk/agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../../config/types.js";
import { clearMemoryPluginState } from "../../../plugins/memory-state.js";
import {
  cleanupTempPaths,
  createContextEngineAttemptRunner,
  createContextEngineBootstrapAndAssemble,
  getHoisted,
  resetEmbeddedAttemptHarness,
} from "./attempt.spawn-workspace.test-support.js";

const doneMessage = {
  role: "assistant",
  content: "done",
  timestamp: 10_000,
} as unknown as AgentMessage;
const hoisted = getHoisted();

function sumToolResultTextChars(messages: AgentMessage[]): number {
  return messages.reduce((sum, message) => {
    if (message.role !== "toolResult") {
      return sum;
    }
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return sum;
    }
    return (
      sum +
      content.reduce((blockSum, block) => {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          block.type === "text" &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          return blockSum + block.text.length;
        }
        return blockSum;
      }, 0)
    );
  }, 0);
}

describe("runEmbeddedAttempt native context boundary", () => {
  const sessionKey = "agent:planning:reliability-context-pressure";
  const tempPaths: string[] = [];

  beforeEach(() => {
    resetEmbeddedAttemptHarness();
    clearMemoryPluginState();
  });

  afterEach(async () => {
    await cleanupTempPaths(tempPaths);
    clearMemoryPluginState();
    vi.restoreAllMocks();
  });

  it("keeps mid-turn precheck disabled unless explicitly enabled", async () => {
    await createContextEngineAttemptRunner({
      contextEngine: createContextEngineBootstrapAndAssemble(),
      sessionKey,
      tempPaths,
    });

    const [guardOptions] = hoisted.installToolResultContextGuardMock.mock.calls.at(-1) ?? [];
    expect(guardOptions).not.toHaveProperty("midTurnPrecheck");
  });

  it("installs mid-turn precheck only for the explicit opt-in", async () => {
    await createContextEngineAttemptRunner({
      contextEngine: createContextEngineBootstrapAndAssemble(),
      sessionKey,
      tempPaths,
      attemptOverrides: {
        config: {
          agents: {
            defaults: {
              compaction: {
                mode: "safeguard",
                midTurnPrecheck: { enabled: true },
              },
            },
          },
        } as OpenClawConfig,
      },
    });

    const [guardOptions] = hoisted.installToolResultContextGuardMock.mock.calls.at(-1) ?? [];
    expect(guardOptions).toMatchObject({
      midTurnPrecheck: {
        enabled: true,
      },
    });
  });

  it("allows a text-silent reasoning interval while native request progress continues", async () => {
    vi.useFakeTimers();
    let markProviderStarted = () => {};
    let finishProvider = () => {};
    let requestSignal: AbortSignal | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerFinished = new Promise<void>((resolve) => {
      finishProvider = resolve;
    });

    try {
      const run = createContextEngineAttemptRunner({
        contextEngine: createContextEngineBootstrapAndAssemble(),
        sessionKey,
        tempPaths,
        attemptOverrides: {
          timeoutMs: 10 * 60_000,
        },
        sessionPrompt: async (session, _prompt, options) => {
          requestSignal = options?.signal;
          markProviderStarted();
          await providerFinished;
          session.messages = [...session.messages, doneMessage];
        },
      });
      let settled = false;
      void run.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await providerStarted;
      for (let minute = 0; minute < 3; minute += 1) {
        await vi.advanceTimersByTimeAsync(60_000);
        notifyLlmRequestActivity(requestSignal);
      }
      expect(settled).toBe(false);

      finishProvider();
      const result = await run;
      expect(result.terminal).toEqual({ kind: "ok" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("projects aggregate tool-result pressure without rewriting the transcript or compacting", async () => {
    const toolText = "process output ".repeat(70);
    const sessionMessages: AgentMessage[] = [{ role: "user", content: "seed", timestamp: 1 }];
    for (let index = 0; index < 8; index += 1) {
      const toolCallId = `call_${index}`;
      sessionMessages.push({
        role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name: "process", input: {} }],
        timestamp: 2 + index * 2,
      } as unknown as AgentMessage);
      sessionMessages.push({
        role: "toolResult",
        toolCallId,
        toolName: "process",
        content: [{ type: "text", text: `${index}: ${toolText}` }],
        isError: false,
        timestamp: 3 + index * 2,
      } as AgentMessage);
    }
    const originalSessionJson = JSON.stringify(sessionMessages);
    let providerCalls = 0;

    const result = await createContextEngineAttemptRunner({
      contextEngine: createContextEngineBootstrapAndAssemble(),
      sessionKey,
      tempPaths,
      sessionMessages,
      attemptOverrides: {
        contextTokenBudget: 128_000,
        config: {
          agents: {
            defaults: {
              contextLimits: {
                toolResultMaxChars: 1_000,
              },
            },
            list: [{ id: "planning" }],
          },
        } as OpenClawConfig,
      },
      sessionPrompt: async (session) => {
        providerCalls += 1;
        session.messages = [...session.messages, doneMessage];
      },
    });

    expect(sumToolResultTextChars(sessionMessages)).toBeGreaterThan(4_000);
    expect(providerCalls).toBe(1);
    expect(result.terminal).toEqual({ kind: "ok" });
    expect(result.preflightRecovery).toBeUndefined();
    expect(JSON.stringify(sessionMessages)).toBe(originalSessionJson);
    expect(originalSessionJson).not.toContain("sessions_history");
  });

  it("keeps eight child packets intact and reaches the provider once under Planning pressure", async () => {
    const sessionMessages: AgentMessage[] = [{ role: "user", content: "seed", timestamp: 1 }];
    const childPacketTexts: string[] = [];
    let timestamp = 2;
    for (let index = 0; index < 8; index += 1) {
      const toolCallId = `child_${index}`;
      const packet = `# Child packet ${index + 1}\n\n${"bounded decision evidence ".repeat(1_000)}`;
      childPacketTexts.push(packet);
      sessionMessages.push({
        role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name: "task", input: {} }],
        timestamp: timestamp++,
      } as unknown as AgentMessage);
      sessionMessages.push({
        role: "toolResult",
        toolCallId,
        toolName: "task",
        content: [{ type: "text", text: packet }],
        details: { childResult: true, contentChars: packet.length, contentTruncated: false },
        isError: false,
        timestamp: timestamp++,
      } as unknown as AgentMessage);
    }
    for (let index = 0; index < 6; index += 1) {
      const toolCallId = `source_${index}`;
      sessionMessages.push({
        role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name: "read", input: {} }],
        timestamp: timestamp++,
      } as unknown as AgentMessage);
      sessionMessages.push({
        role: "toolResult",
        toolCallId,
        toolName: "read",
        content: [{ type: "text", text: "large ordinary source result ".repeat(1_400) }],
        isError: false,
        timestamp: timestamp++,
      } as AgentMessage);
    }
    const originalSessionJson = JSON.stringify(sessionMessages);
    let providerCalls = 0;

    const result = await createContextEngineAttemptRunner({
      contextEngine: createContextEngineBootstrapAndAssemble(),
      sessionKey,
      tempPaths,
      sessionMessages,
      attemptOverrides: {
        contextTokenBudget: 272_000,
        config: {
          agents: {
            defaults: {
              contextLimits: { toolResultMaxChars: 80_000 },
            },
            list: [{ id: "planning" }],
          },
        } as OpenClawConfig,
      },
      sessionPrompt: async (session) => {
        providerCalls += 1;
        session.messages = [...session.messages, doneMessage];
      },
    });

    expect(providerCalls).toBe(1);
    expect(result.preflightRecovery).toBeUndefined();
    expect(result.terminal).toEqual({ kind: "ok" });
    expect(JSON.stringify(sessionMessages)).toBe(originalSessionJson);
    expect(originalSessionJson).not.toContain("sessions_history");
    for (const packet of childPacketTexts) {
      expect(
        sessionMessages.some((message) => {
          if (message.role !== "toolResult" || !Array.isArray(message.content)) {
            return false;
          }
          return message.content.some(
            (block) => block.type === "text" && "text" in block && block.text === packet,
          );
        }),
      ).toBe(true);
    }
  });
});
