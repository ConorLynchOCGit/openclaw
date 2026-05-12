import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../../config/sessions.js";
import {
  clearMemoryPluginState,
  registerMemoryFlushPlanResolver,
} from "../../plugins/memory-state.js";
import type { TemplateContext } from "../templating.js";
import {
  runMemoryFlushIfNeeded,
  runPreflightCompactionIfNeeded,
  setAgentRunnerMemoryTestDeps,
} from "./agent-runner-memory.js";
import type { FollowupRun } from "./queue.js";

const runWithModelFallbackMock = vi.fn();
const runEmbeddedPiAgentMock = vi.fn();
const compactEmbeddedPiSessionMock = vi.fn();
const refreshQueuedFollowupSessionMock = vi.fn();
const incrementCompactionCountMock = vi.fn();

function createReplyOperation() {
  return {
    abortSignal: new AbortController().signal,
    setPhase: vi.fn(),
    updateSessionId: vi.fn(),
  } as never;
}

function createFollowupRun(overrides: Partial<FollowupRun["run"]> = {}): FollowupRun {
  return {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: "main",
      messageProvider: "whatsapp",
      sessionFile: "/tmp/session.jsonl",
      workspaceDir: "/tmp",
      config: {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: { enabled: false, allowed: false, defaultLevel: "off" },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
      skipProviderRuntimeHints: true,
      ...overrides,
    },
  } as unknown as FollowupRun;
}

async function writeSessionStore(
  storePath: string,
  sessionKey: string,
  entry: SessionEntry,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify({ [sessionKey]: entry }, null, 2), "utf8");
}

describe("runMemoryFlushIfNeeded", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-memory-unit-"));
    registerMemoryFlushPlanResolver(() => ({
      softThresholdTokens: 4_000,
      forceFlushTranscriptBytes: 1_000_000_000,
      reserveTokensFloor: 20_000,
      prompt: "Pre-compaction memory flush.\nNO_REPLY",
      systemPrompt: "Write memory to memory/YYYY-MM-DD.md.",
      relativePath: "memory/2023-11-14.md",
    }));
    runWithModelFallbackMock.mockReset().mockImplementation(async ({ provider, model, run }) => ({
      result: await run(provider, model),
      provider,
      model,
      attempts: [],
    }));
    runEmbeddedPiAgentMock.mockReset().mockResolvedValue({ payloads: [], meta: {} });
    compactEmbeddedPiSessionMock.mockReset().mockResolvedValue({
      ok: true,
      compacted: true,
      result: { tokensAfter: 12_000, summary: "compacted" },
    });
    refreshQueuedFollowupSessionMock.mockReset();
    incrementCompactionCountMock.mockReset().mockImplementation(async (params) => {
      const sessionKey = String(params.sessionKey ?? "");
      if (!sessionKey || !params.sessionStore?.[sessionKey]) {
        return undefined;
      }
      const previous = params.sessionStore[sessionKey] as SessionEntry;
      const nextEntry: SessionEntry = {
        ...previous,
        compactionCount: (previous.compactionCount ?? 0) + (params.amount ?? 1),
      };
      if (typeof params.tokensAfter === "number") {
        nextEntry.totalTokens = params.tokensAfter;
        nextEntry.totalTokensFresh = true;
      }
      if (typeof params.newSessionId === "string" && params.newSessionId) {
        nextEntry.sessionId = params.newSessionId;
        const storePath = typeof params.storePath === "string" ? params.storePath : rootDir;
        nextEntry.sessionFile = path.join(path.dirname(storePath), `${params.newSessionId}.jsonl`);
      }
      params.sessionStore[sessionKey] = nextEntry;
      if (typeof params.storePath === "string") {
        await writeSessionStore(params.storePath, sessionKey, nextEntry);
      }
      return nextEntry.compactionCount;
    });
    setAgentRunnerMemoryTestDeps({
      runWithModelFallback: runWithModelFallbackMock as never,
      runEmbeddedPiAgent: runEmbeddedPiAgentMock as never,
      compactEmbeddedPiSession: compactEmbeddedPiSessionMock as never,
      refreshQueuedFollowupSession: refreshQueuedFollowupSessionMock as never,
      incrementCompactionCount: incrementCompactionCountMock as never,
      registerAgentRunContext: vi.fn() as never,
      randomUUID: () => "00000000-0000-0000-0000-000000000001",
      now: () => 1_700_000_000_000,
    });
  });

  afterEach(async () => {
    setAgentRunnerMemoryTestDeps();
    clearMemoryPluginState();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("runs a memory flush turn, rotates after compaction, and persists metadata", async () => {
    const storePath = path.join(rootDir, "sessions.json");
    const sessionKey = "main";
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 1,
    };
    const sessionStore = { [sessionKey]: sessionEntry };
    await writeSessionStore(storePath, sessionKey, sessionEntry);

    runEmbeddedPiAgentMock.mockImplementationOnce(
      async (params: {
        onAgentEvent?: (evt: { stream: string; data: { phase: string } }) => void;
      }) => {
        params.onAgentEvent?.({ stream: "compaction", data: { phase: "end" } });
        return {
          payloads: [],
          meta: { agentMeta: { sessionId: "session-rotated" } },
        };
      },
    );

    const followupRun = createFollowupRun();
    const entry = await runMemoryFlushIfNeeded({
      cfg: {
        agents: {
          defaults: {
            compaction: {
              memoryFlush: {},
            },
          },
        },
      },
      followupRun,
      sessionCtx: { Provider: "whatsapp" } as unknown as TemplateContext,
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      sessionEntry,
      sessionStore,
      sessionKey,
      storePath,
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(entry?.sessionId).toBe("session-rotated");
    expect(followupRun.run.sessionId).toBe("session-rotated");
    expect(runEmbeddedPiAgentMock).toHaveBeenCalledTimes(1);
    const flushCall = runEmbeddedPiAgentMock.mock.calls[0]?.[0] as {
      prompt?: string;
      memoryFlushWritePath?: string;
      silentExpected?: boolean;
    };
    expect(flushCall.prompt).toContain("Pre-compaction memory flush.");
    expect(flushCall.memoryFlushWritePath).toMatch(/^memory\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(flushCall.silentExpected).toBe(true);
    expect(refreshQueuedFollowupSessionMock).toHaveBeenCalledWith({
      key: sessionKey,
      previousSessionId: "session",
      nextSessionId: "session-rotated",
      nextSessionFile: expect.stringContaining("session-rotated.jsonl"),
    });

    const persisted = JSON.parse(await fs.readFile(storePath, "utf8")) as {
      main: SessionEntry;
    };
    expect(persisted.main.sessionId).toBe("session-rotated");
    expect(persisted.main.compactionCount).toBe(2);
    expect(persisted.main.memoryFlushCompactionCount).toBe(2);
    expect(persisted.main.memoryFlushAt).toBe(1_700_000_000_000);
  });

  it("skips memory flush for CLI providers", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 1,
    };

    const entry = await runMemoryFlushIfNeeded({
      cfg: { agents: { defaults: { cliBackends: { "codex-cli": { command: "codex" } } } } },
      followupRun: createFollowupRun({ provider: "codex-cli" }),
      sessionCtx: { Provider: "whatsapp" } as unknown as TemplateContext,
      defaultModel: "codex-cli/gpt-5.4",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(entry).toBe(sessionEntry);
    expect(runEmbeddedPiAgentMock).not.toHaveBeenCalled();
  });

  it("uses configured prompts and stored bootstrap warning signatures", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 80_000,
      compactionCount: 1,
      systemPromptReport: {
        source: "run",
        generatedAt: Date.now(),
        systemPrompt: { chars: 1, projectContextChars: 0, nonProjectContextChars: 1 },
        injectedWorkspaceFiles: [],
        skills: { promptChars: 0, entries: [] },
        tools: { listChars: 0, schemaChars: 0, entries: [] },
        bootstrapTruncation: {
          warningMode: "once",
          warningShown: true,
          promptWarningSignature: "sig-b",
          warningSignaturesSeen: ["sig-a", "sig-b"],
          truncatedFiles: 1,
          nearLimitFiles: 0,
          totalNearLimit: false,
        },
      },
    };
    registerMemoryFlushPlanResolver(() => ({
      softThresholdTokens: 4_000,
      forceFlushTranscriptBytes: 1_000_000_000,
      reserveTokensFloor: 20_000,
      prompt: "Write notes.\nNO_REPLY to memory/2023-11-14.md and MEMORY.md",
      systemPrompt: "Flush memory now. NO_REPLY memory/YYYY-MM-DD.md MEMORY.md",
      relativePath: "memory/2023-11-14.md",
    }));

    await runMemoryFlushIfNeeded({
      cfg: { agents: { defaults: { compaction: { memoryFlush: {} } } } },
      followupRun: createFollowupRun({ extraSystemPrompt: "extra system" }),
      sessionCtx: { Provider: "whatsapp" } as unknown as TemplateContext,
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    const flushCall = runEmbeddedPiAgentMock.mock.calls[0]?.[0] as {
      prompt?: string;
      extraSystemPrompt?: string;
      bootstrapPromptWarningSignaturesSeen?: string[];
      bootstrapPromptWarningSignature?: string;
      memoryFlushWritePath?: string;
      silentExpected?: boolean;
    };
    expect(flushCall.prompt).toContain("Write notes.");
    expect(flushCall.prompt).toContain("NO_REPLY");
    expect(flushCall.prompt).toContain("MEMORY.md");
    expect(flushCall.extraSystemPrompt).toContain("extra system");
    expect(flushCall.extraSystemPrompt).toContain("Flush memory now.");
    expect(flushCall.memoryFlushWritePath).toBe("memory/2023-11-14.md");
    expect(flushCall.silentExpected).toBe(true);
    expect(flushCall.bootstrapPromptWarningSignaturesSeen).toEqual(["sig-a", "sig-b"]);
    expect(flushCall.bootstrapPromptWarningSignature).toBe("sig-b");
  });
});

describe("runPreflightCompactionIfNeeded", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-preflight-unit-"));
    compactEmbeddedPiSessionMock.mockReset().mockResolvedValue({
      ok: true,
      compacted: true,
      result: { tokensAfter: 12_000, summary: "compacted" },
    });
    incrementCompactionCountMock.mockReset().mockImplementation(async (params) => {
      const sessionKey = String(params.sessionKey ?? "");
      if (!sessionKey || !params.sessionStore?.[sessionKey]) {
        return undefined;
      }
      const previous = params.sessionStore[sessionKey] as SessionEntry;
      const nextEntry: SessionEntry = {
        ...previous,
        compactionCount: (previous.compactionCount ?? 0) + 1,
      };
      if (typeof params.tokensAfter === "number") {
        nextEntry.totalTokens = params.tokensAfter;
        nextEntry.totalTokensFresh = true;
      }
      params.sessionStore[sessionKey] = nextEntry;
      if (typeof params.storePath === "string") {
        await writeSessionStore(params.storePath, sessionKey, nextEntry);
      }
      return nextEntry.compactionCount;
    });
    setAgentRunnerMemoryTestDeps({
      compactEmbeddedPiSession: compactEmbeddedPiSessionMock as never,
      incrementCompactionCount: incrementCompactionCountMock as never,
    });
  });

  afterEach(async () => {
    setAgentRunnerMemoryTestDeps();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("compacts when a fresh persisted token count is already over threshold", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 90_000,
      totalTokensFresh: true,
      compactionCount: 0,
    };
    const sessionStore = { main: sessionEntry };
    const replyOperation = createReplyOperation() as { setPhase: ReturnType<typeof vi.fn> };

    const entry = await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun(),
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore,
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: replyOperation as never,
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
    expect(replyOperation.setPhase).toHaveBeenCalledWith("preflight_compacting");
    expect(entry?.compactionCount).toBe(1);
    expect(entry?.totalTokens).toBe(12_000);
    expect(entry?.totalTokensFresh).toBe(true);
  });

  it("uses transcript fallback when persisted token state is stale", async () => {
    const sessionFile = path.join(rootDir, "session.jsonl");
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        message: {
          role: "user",
          content: "large prior context ".repeat(45_000),
          timestamp: Date.now(),
        },
      }) + "\n",
      "utf8",
    );
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      sessionFile,
      updatedAt: Date.now(),
      totalTokens: 10,
      totalTokensFresh: false,
      compactionCount: 0,
    };

    await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun({ sessionFile }),
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
  });

  it("compacts when the next prompt pushes a fresh session over threshold", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 75_500,
      totalTokensFresh: true,
      compactionCount: 0,
    };

    await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun(),
      promptForEstimate: "next prompt ".repeat(2_000),
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
  });

  it("uses the persisted session context window as the preflight compaction budget cap", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 190_000,
      totalTokensFresh: true,
      contextTokens: 200_000,
      compactionCount: 0,
    };

    await runPreflightCompactionIfNeeded({
      cfg: {
        models: {
          providers: {
            "openai-codex": {
              baseUrl: "http://localhost.test",
              models: [
                {
                  id: "gpt-5.4",
                  name: "GPT-5.4",
                  reasoning: true,
                  input: ["text"],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 1_050_000,
                  maxTokens: 16_384,
                },
              ],
            },
          },
        },
      },
      followupRun: createFollowupRun({ provider: "openai-codex", model: "gpt-5.4" }),
      defaultModel: "openai-codex/gpt-5.4",
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentTokenCount: expect.any(Number),
        tokenBudget: 200_000,
      }),
    );
    const compactionCall = compactEmbeddedPiSessionMock.mock.calls[0]?.[0] as
      | { currentTokenCount?: number }
      | undefined;
    expect(compactionCall?.currentTokenCount).toBeGreaterThanOrEqual(190_000);
  });

  it("repairs stale token ledger when compaction reports an already compacted branch", async () => {
    const sessionFile = path.join(rootDir, "session.jsonl");
    await fs.writeFile(
      sessionFile,
      JSON.stringify({
        type: "compaction",
        id: "cmp-1",
        summary: "bounded compacted context ".repeat(200),
      }) + "\n",
      "utf8",
    );
    compactEmbeddedPiSessionMock.mockResolvedValueOnce({
      ok: true,
      compacted: false,
      reason: "no real conversation messages",
    });
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      sessionFile,
      updatedAt: Date.now(),
      totalTokens: 229_253,
      totalTokensFresh: true,
      contextTokens: 200_000,
      compactionCount: 1,
    };
    const sessionStore = { main: sessionEntry };

    const entry = await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun({ sessionFile }),
      defaultModel: "openai-codex/gpt-5.4",
      sessionEntry,
      sessionStore,
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(entry?.compactionCount).toBe(1);
    expect(entry?.totalTokensFresh).toBe(true);
    expect(entry?.totalTokens).toBeGreaterThan(20_000);
    expect(entry?.totalTokens).toBeLessThan(200_000);
  });

  it("does not compact under-threshold sessions", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 40_000,
      totalTokensFresh: true,
      compactionCount: 0,
    };

    await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun(),
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).not.toHaveBeenCalled();
  });

  it("allows heartbeat runs to compact oversized main sessions before replay", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 90_000,
      totalTokensFresh: true,
      compactionCount: 0,
    };

    await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun: createFollowupRun({ messageProvider: "heartbeat" }),
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore: { main: sessionEntry },
      sessionKey: "main",
      isHeartbeat: true,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not repeatedly compact after the same context is reduced below threshold", async () => {
    const sessionEntry: SessionEntry = {
      sessionId: "session",
      updatedAt: Date.now(),
      totalTokens: 90_000,
      totalTokensFresh: true,
      compactionCount: 0,
    };
    const sessionStore = { main: sessionEntry };
    const followupRun = createFollowupRun();

    const first = await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun,
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry,
      sessionStore,
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });
    const second = await runPreflightCompactionIfNeeded({
      cfg: {},
      followupRun,
      defaultModel: "anthropic/claude-opus-4-6",
      agentCfgContextTokens: 100_000,
      sessionEntry: first,
      sessionStore,
      sessionKey: "main",
      isHeartbeat: false,
      replyOperation: createReplyOperation(),
    });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledTimes(1);
    expect(second?.compactionCount).toBe(1);
    expect(second?.totalTokens).toBe(12_000);
  });
});
