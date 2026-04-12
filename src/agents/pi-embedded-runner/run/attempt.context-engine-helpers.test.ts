import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { assembleAttemptManagedContext } from "./attempt.context-engine-helpers.js";

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

describe("assembleAttemptManagedContext", () => {
  it("assembles context-engine and hook contributions through one managed path", async () => {
    const hookRunner = {
      hasHooks: vi.fn((hookName: string) => hookName === "before_prompt_build"),
      runBeforePromptBuild: vi.fn(async () => ({
        prependContext: "Prompt prefix",
        appendSystemContext: "## User Memory Pack\n\n- Prefer concise answers.",
      })),
      runBeforeAgentStart: vi.fn(async () => undefined),
    };

    const result = await assembleAttemptManagedContext({
      contextEngine: {
        info: { id: "test", name: "Test Engine" },
        ingest: async () => ({ ingested: false }),
        compact: async () => ({ ok: true, compacted: false }),
        assemble: async () => ({
          messages: [makeAgentMessage({ role: "assistant", content: "summary", timestamp: 2 })],
          estimatedTokens: 12,
          systemPromptAddition: "Session summary",
        }),
      },
      sessionId: "session-1",
      sessionKey: "agent:default:main",
      messages: [makeAgentMessage({ role: "user", content: "old turn", timestamp: 1 })],
      tokenBudget: 4_000,
      modelId: "gpt-5.4",
      prompt: "Current prompt",
      baseSystemPrompt: "Base system prompt",
      hookCtx: {
        runId: "run-1",
        agentId: "main",
        sessionId: "session-1",
        sessionKey: "agent:default:main",
        workspaceDir: "/workspace",
      },
      hookRunner,
    });

    expect(result.messages).toEqual([
      expect.objectContaining({ role: "assistant", content: "summary" }),
    ]);
    expect(result.prompt).toBe(["Prompt prefix", "Current prompt"].join("\n\n"));
    expect(result.systemPrompt).toContain("Session summary");
    expect(result.systemPrompt).toContain("Base system prompt");
    expect(result.systemPrompt).toContain("## User Memory Pack");
    expect(result.contextEngineSystemPromptAddition).toBe("Session summary");
    expect(result.hookResult.appendSystemContext).toContain("## User Memory Pack");
  });
});
