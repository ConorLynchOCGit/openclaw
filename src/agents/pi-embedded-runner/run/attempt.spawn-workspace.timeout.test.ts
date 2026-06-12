import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupTempPaths,
  createContextEngineAttemptRunner,
  getHoisted,
  resetEmbeddedAttemptHarness,
  testModel,
} from "./attempt.spawn-workspace.test-support.js";

const hoisted = getHoisted();

describe("runEmbeddedAttempt undici timeout wiring", () => {
  const tempPaths: string[] = [];

  beforeEach(() => {
    resetEmbeddedAttemptHarness();
  });

  afterEach(async () => {
    await cleanupTempPaths(tempPaths);
  });

  it("forwards the configured run timeout into global undici stream tuning", async () => {
    await createContextEngineAttemptRunner({
      sessionKey: "agent:main:ollama-timeout-test",
      tempPaths,
      contextEngine: {
        assemble: async ({ messages }) => ({
          messages,
          estimatedTokens: 1,
        }),
      },
      attemptOverrides: {
        timeoutMs: 123_456,
      },
    });

    expect(hoisted.ensureGlobalUndiciEnvProxyDispatcherMock).toHaveBeenCalledOnce();
    expect(hoisted.ensureGlobalUndiciStreamTimeoutsMock).toHaveBeenCalledWith({
      timeoutMs: 123_456,
    });
  });

  it("passes admitted context-scout thinking into the PI session creation path", async () => {
    await createContextEngineAttemptRunner({
      sessionKey: "agent:execution-context-scout:subagent:thinking-test",
      tempPaths,
      contextEngine: {
        assemble: async ({ messages }) => ({
          messages,
          estimatedTokens: 1,
        }),
      },
      attemptOverrides: {
        agentId: "execution-context-scout",
        provider: "openrouter",
        modelId: "qwen/qwen3-coder-plus",
        model: { ...testModel, reasoning: false },
        thinkLevel: "low",
      },
    });

    expect(hoisted.createAgentSessionMock).toHaveBeenCalledOnce();
    expect(hoisted.createAgentSessionMock.mock.calls[0]?.[0]).toMatchObject({
      thinkingLevel: "low",
      model: expect.objectContaining({
        reasoning: true,
      }),
    });
  });
});
