import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { prepareAttemptPromptContextStage } from "./attempt.prompt-context-stage.js";

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

describe("prepareAttemptPromptContextStage", () => {
  it("replaces session messages, updates the system prompt, and rebuilds report segments", async () => {
    const replaceMessages = vi.fn();
    const setSystemPrompt = vi.fn();
    const session = {
      messages: [makeAgentMessage({ role: "user", content: "older", timestamp: 1 })],
      agent: {
        replaceMessages,
        setSystemPrompt,
      },
    };
    const hookRunner = {
      hasHooks: vi.fn((hookName: string) => hookName === "before_prompt_build"),
      runBeforePromptBuild: vi.fn(async () => ({
        prependContext: "## User Memory Pack\n\n- Prefer concise answers.",
        appendSystemContext: "Hook system tail",
      })),
      runBeforeAgentStart: vi.fn(async () => undefined),
    };

    const result = await prepareAttemptPromptContextStage({
      session,
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
      systemPromptReportBase: {
        source: "run",
        generatedAt: 0,
        bootstrapMaxChars: 20_000,
        bootstrapFiles: [],
        injectedFiles: [],
        skillsPrompt: "",
        tools: [],
      },
      currentPrompt: "Current prompt",
      onLog: vi.fn(),
    });

    expect(replaceMessages).toHaveBeenCalledWith([
      expect.objectContaining({ role: "assistant", content: "summary" }),
    ]);
    expect(setSystemPrompt).toHaveBeenCalledWith(expect.stringContaining("Base system prompt"));
    expect(result.effectivePrompt).toContain("## User Memory Pack");
    expect(result.systemPrompt).toContain("Session summary");
    expect(result.systemPrompt).toContain("Hook system tail");
    expect(
      result.systemPromptReport.contextSegments?.segments.some(
        (segment) => segment.owner === "context_engine",
      ),
    ).toBe(true);
    expect(result.contextEngineSystemPromptAddition).toBe("Session summary");
  });
});
