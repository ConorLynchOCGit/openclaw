// Session utility tests cover key parsing, store migration, agent/default rows,
// model identity resolution, title derivation, and byte-capped row payloads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { writeAcpSessionMetaForMigration } from "../acp/runtime/session-meta.js";
import { resetConfigRuntimeState, setRuntimeConfigSnapshot } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";
import { loadSessionStore, type SessionEntry } from "../config/sessions.js";
import { writeSessionStoreForTest } from "../config/sessions/test-helpers.js";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import { createTaskRecord, resetTaskRegistryForTests } from "../tasks/task-registry.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import {
  canonicalizeSpawnedByForAgent,
  buildGatewaySessionRow,
  capArrayByJsonBytes,
  classifySessionKey,
  deriveSessionTitle,
  getSessionDefaults,
  listAgentsForGateway,
  listSessionsFromStore,
  listSessionsFromStoreAsync,
  loadSessionEntry,
  migrateAndPruneGatewaySessionStoreKey,
  parseGroupKey,
  pruneLegacyStoreKeys,
  resolveDeletedAgentIdFromSessionKey,
  resolveGatewayModelSupportsImages,
  resolveGatewaySessionStoreTarget,
  resolveGatewaySessionStoreTargetWithStore,
  resolveSessionDisplayModelIdentityRef,
  resolveSessionModelIdentityRef,
  resolveSessionModelRef,
  resolveSessionStoreKey,
} from "./session-utils.js";

function resolveSyncRealpath(filePath: string): string {
  return fs.realpathSync.native(filePath);
}

function createSymlinkOrSkip(targetPath: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(targetPath, linkPath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === "win32" && (code === "EPERM" || code === "EACCES")) {
      return false;
    }
    throw error;
  }
}

function createSingleAgentAvatarConfig(workspace: string): OpenClawConfig {
  return {
    session: { mainKey: "main" },
    agents: {
      list: [{ id: "main", default: true, workspace, identity: { avatar: "avatar-link.png" } }],
    },
  } as OpenClawConfig;
}

function createModelDefaultsConfig(params: {
  primary: string;
  models?: Record<string, { agentRuntime?: { id: string } }>;
  agentRuntime?: { id: string };
}): OpenClawConfig {
  return {
    agents: {
      defaults: {
        model: { primary: params.primary },
        models: {
          ...params.models,
          ...(params.agentRuntime
            ? { [params.primary]: { agentRuntime: params.agentRuntime } }
            : {}),
        },
      },
    },
  } as OpenClawConfig;
}

function requireString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`expected ${label}`);
  }
  return value;
}

function expectFields(value: unknown, expected: Record<string, unknown>): void {
  if (!value || typeof value !== "object") {
    throw new Error("expected fields object");
  }
  const record = value as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    expect(record[key], key).toEqual(expectedValue);
  }
}

describe("gateway session utils", () => {
  afterEach(() => {
    resetConfigRuntimeState();
    resetPluginRuntimeStateForTest();
    resetTaskRegistryForTests({ persist: false });
  });

  test("capArrayByJsonBytes trims from the front", () => {
    const res = capArrayByJsonBytes(["a", "b", "c"], 10);
    expect(res.items).toEqual(["b", "c"]);
  });

  test("session lists apply a bounded default and expose truncation metadata", async () => {
    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.4" });
    const store = Object.fromEntries(
      Array.from({ length: 101 }, (_value, index) => [
        `session-${index}`,
        {
          sessionId: `session-${index}`,
          updatedAt: 1_000 - index,
          modelProvider: "openai",
          model: "gpt-5.4",
        } satisfies SessionEntry,
      ]),
    );

    const listed = await listSessionsFromStoreAsync({
      cfg,
      storePath: "",
      store,
      opts: {},
    });

    expect(listed.sessions).toHaveLength(100);
    expect(listed.count).toBe(100);
    expect(listed.totalCount).toBe(101);
    expect(listed.limitApplied).toBe(100);
    expect(listed.nextOffset).toBe(100);
    expect(listed.hasMore).toBe(true);
    expect(listed.sessions[0]?.key).toBe("session-0");
    expect(listed.sessions.at(-1)?.key).toBe("session-99");
  });

  test("session lists honor explicit caller limits", () => {
    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.4" });
    const store = Object.fromEntries(
      Array.from({ length: 5 }, (_value, index) => [
        `session-${index}`,
        {
          sessionId: `session-${index}`,
          updatedAt: 1_000 - index,
        } satisfies SessionEntry,
      ]),
    );

    const listed = listSessionsFromStore({
      cfg,
      storePath: "",
      store,
      opts: { limit: 3 },
    });

    expect(listed.sessions.map((session) => session.key)).toEqual([
      "session-0",
      "session-1",
      "session-2",
    ]);
    expect(listed.count).toBe(3);
    expect(listed.totalCount).toBe(5);
    expect(listed.limitApplied).toBe(3);
    expect(listed.nextOffset).toBe(3);
    expect(listed.hasMore).toBe(true);
  });

  test("session lists page from an offset after filtering and sorting", () => {
    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.4" });
    const store = Object.fromEntries(
      Array.from({ length: 6 }, (_value, index) => [
        `session-${index}`,
        {
          sessionId: `session-${index}`,
          updatedAt: 1_000 - index,
          displayName: index === 5 ? "Different project" : `Project Alpha ${index}`,
        } satisfies SessionEntry,
      ]),
    );

    const listed = listSessionsFromStore({
      cfg,
      storePath: "",
      store,
      opts: { search: "alpha", limit: 2, offset: 2 },
    });

    expect(listed.sessions.map((session) => session.key)).toEqual(["session-2", "session-3"]);
    expect(listed.count).toBe(2);
    expect(listed.totalCount).toBe(5);
    expect(listed.limitApplied).toBe(2);
    expect(listed.offset).toBe(2);
    expect(listed.nextOffset).toBe(4);
    expect(listed.hasMore).toBe(true);
  });

  test("session list search includes direct-session origin display labels", () => {
    const cfg = { agents: { list: [{ id: "main", default: true }] } } as OpenClawConfig;
    const store = {
      "agent:main:telegram:direct:42": {
        chatType: "direct",
        channel: "telegram",
        origin: { label: "openclaw-tui" },
        updatedAt: 2,
      } as SessionEntry,
      "agent:main:telegram:direct:99": {
        chatType: "direct",
        channel: "telegram",
        origin: { label: "other-direct" },
        updatedAt: 1,
      } as SessionEntry,
    };

    const listed = listSessionsFromStore({
      cfg,
      storePath: "",
      store,
      opts: { search: "openclaw-tui" },
    });

    expect(listed.sessions.map((session) => session.key)).toEqual([
      "agent:main:telegram:direct:42",
    ]);
    expect(listed.sessions[0]?.displayName).toBe("openclaw-tui");
  });

  test("session lists mark the final offset page without hasMore", () => {
    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.4" });
    const store = Object.fromEntries(
      Array.from({ length: 5 }, (_value, index) => [
        `session-${index}`,
        {
          sessionId: `session-${index}`,
          updatedAt: 1_000 - index,
        } satisfies SessionEntry,
      ]),
    );

    const listed = listSessionsFromStore({
      cfg,
      storePath: "",
      store,
      opts: { limit: 2, offset: 4 },
    });

    expect(listed.sessions.map((session) => session.key)).toEqual(["session-4"]);
    expect(listed.totalCount).toBe(5);
    expect(listed.offset).toBe(4);
    expect(listed.nextOffset).toBeNull();
    expect(listed.hasMore).toBe(false);
  });

  test("session detail projects mirrored Codex-native child runs", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.6-sol" },
          models: { "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } } },
        },
        list: [{ id: "coding", default: true }],
      },
    } as OpenClawConfig;
    const sessionKey = "agent:coding:session-1";
    const store = {
      [sessionKey]: {
        sessionId: "session-1",
        updatedAt: 2_000,
        status: "done",
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        totalTokensFresh: true,
        codexThreadUsage: {
          sessionId: "session-1",
          threadId: "parent-thread",
          inputTokens: 700,
          outputTokens: 200,
          cachedInputTokens: 100,
          reasoningOutputTokens: 50,
          totalTokens: 1_000,
        },
      } satisfies SessionEntry,
    };
    createTaskRecord({
      runtime: "subagent",
      taskKind: "codex-native",
      sourceId: "codex-thread:child-thread-1",
      requesterSessionKey: sessionKey,
      agentId: "coding",
      runId: "codex-thread:child-thread-1",
      label: "project_explorer (worker)",
      task: "Inspect source seams",
      status: "succeeded",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
      startedAt: 2_100,
      lastEventAt: 2_500,
      terminalSummary: "Codex native subagent finished: inspected source seams.",
      eventMetadata: {
        codexNativeSubagent: true,
        parentThreadId: "parent-thread",
        parentTurnId: "turn-1",
        childThreadId: "child-thread-1",
        childPhase: "child_completed",
        childRole: "worker",
        childAgentPath: "agents/project_explorer.toml",
        childTaskName: "source-seam-inventory",
        childModel: "gpt-5.6-terra",
        childReasoningEffort: "medium",
        childInputTokens: 300,
        childOutputTokens: 100,
        childCachedInputTokens: 50,
        childReasoningOutputTokens: 25,
        childTotalTokens: 500,
        spawnReason: "inspect source seams",
      },
    });

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store,
      key: sessionKey,
      entry: store[sessionKey],
    });

    expect(row.codexNativeChildRuns).toEqual([
      expect.objectContaining({
        source: "codex-native",
        runId: "codex-thread:child-thread-1",
        childThreadId: "child-thread-1",
        parentThreadId: "parent-thread",
        parentTurnId: "turn-1",
        finalRef: "codex-thread:child-thread-1",
        role: "worker",
        agentPath: "agents/project_explorer.toml",
        objective: "inspect source seams",
        taskName: "source-seam-inventory",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        label: "project_explorer (worker)",
        status: "succeeded",
        terminalSummary: "Codex native subagent finished: inspected source seams.",
        usage: {
          inputTokens: 300,
          outputTokens: 100,
          cachedInputTokens: 50,
          reasoningOutputTokens: 25,
          totalTokens: 500,
        },
      }),
    ]);
    expect(row.codexTeamUsage).toEqual({
      basis: "cumulative",
      state: "settled",
      childCount: 1,
      inputTokens: 1_000,
      freshInputTokens: 850,
      outputTokens: 300,
      cachedInputTokens: 150,
      reasoningOutputTokens: 75,
      totalTokens: 1_500,
    });
    expect(row.codexExecutionTree).toMatchObject({
      source: "trajectory",
      settlement: "partial",
      rounds: [],
      unassignedChildren: [expect.objectContaining({ childThreadId: "child-thread-1" })],
    });
  });

  test("session detail reports partial cumulative Codex usage without parent authority", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.6-sol" },
          models: { "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } } },
        },
        list: [{ id: "coding", default: true }],
      },
    } as OpenClawConfig;
    const sessionKey = "agent:coding:session-partial-cumulative";
    const entry = {
      sessionId: "session-partial-cumulative",
      updatedAt: 2_000,
      status: "running",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      totalTokensFresh: true,
    } satisfies SessionEntry;

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: { [sessionKey]: entry },
      key: sessionKey,
      entry,
    });

    expect(row.codexTeamUsage).toEqual({
      basis: "cumulative",
      state: "partial",
      childCount: 0,
      inputTokens: undefined,
      freshInputTokens: undefined,
      outputTokens: undefined,
      cachedInputTokens: undefined,
      reasoningOutputTokens: undefined,
      totalTokens: undefined,
    });
  });

  test("session detail derives settled team usage from parent-round trajectory fallback", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-session-team-usage-"));
    try {
      const sessionId = "33333333-3333-4333-8333-333333333333";
      const sessionKey = "agent:coding:session-team-usage";
      const storePath = path.join(tempDir, "sessions.json");
      fs.writeFileSync(path.join(tempDir, `${sessionId}.jsonl`), "", "utf8");
      const base = {
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: sessionId,
        source: "runtime",
        sessionId,
        sessionKey,
        runId: "run-team-usage",
        workspaceDir: "/home/node/.openclaw/workspace",
        provider: "openai",
        modelId: "gpt-5.6-sol",
        modelApi: "openai-chatgpt-responses",
      };
      const events = [
        {
          ...base,
          type: "prompt.submitted",
          ts: "2026-07-14T18:00:00.000Z",
          seq: 1,
          sourceSeq: 1,
          data: { threadId: "parent-thread", turnId: "turn-1" },
        },
        {
          ...base,
          type: "thread.token_usage.updated",
          ts: "2026-07-14T18:00:01.000Z",
          seq: 2,
          sourceSeq: 2,
          data: {
            threadId: "parent-thread",
            turnId: "turn-1",
            cumulativeUsage: {
              inputTokens: 1_000,
              cachedInputTokens: 800,
              outputTokens: 100,
              totalTokens: 1_100,
            },
            currentTurnUsage: {
              input: 200,
              cacheRead: 800,
              output: 100,
              totalTokens: 1_100,
            },
          },
        },
        {
          ...base,
          type: "model.completed",
          ts: "2026-07-14T18:00:02.000Z",
          seq: 3,
          sourceSeq: 3,
          data: {
            threadId: "parent-thread",
            turnId: "turn-1",
            usage: { input: 200, cacheRead: 800, output: 100, totalTokens: 1_100 },
          },
        },
      ];
      fs.writeFileSync(
        path.join(tempDir, `${sessionId}.trajectory.jsonl`),
        `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );

      const cfg = {
        agents: {
          defaults: {
            model: { primary: "openai/gpt-5.6-sol" },
            models: { "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } } },
          },
          list: [{ id: "coding", default: true }],
        },
      } as OpenClawConfig;
      const entry = {
        sessionId,
        updatedAt: Date.parse("2026-07-14T18:00:03.000Z"),
        status: "done",
      } satisfies SessionEntry;
      const row = buildGatewaySessionRow({
        cfg,
        storePath,
        store: { [sessionKey]: entry },
        key: sessionKey,
        entry,
      });

      expect(row.codexTeamUsage).toEqual({
        basis: "cumulative",
        state: "settled",
        parentRoundCount: 1,
        childCount: 0,
        inputTokens: 1_000,
        freshInputTokens: 200,
        outputTokens: 100,
        cachedInputTokens: 800,
        reasoningOutputTokens: undefined,
        totalTokens: 1_100,
      });
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("session detail assigns Codex children only to an exact parent turn across rounds", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-session-child-turns-"));
    try {
      const sessionId = "44444444-4444-4444-8444-444444444444";
      const sessionKey = "agent:coding:session-child-turns";
      const storePath = path.join(tempDir, "sessions.json");
      fs.writeFileSync(path.join(tempDir, `${sessionId}.jsonl`), "", "utf8");
      const base = {
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: sessionId,
        source: "runtime",
        sessionId,
        sessionKey,
        runId: "run-child-turns",
        workspaceDir: "/home/node/.openclaw/workspace",
        provider: "openai",
        modelId: "gpt-5.6-sol",
        modelApi: "openai-chatgpt-responses",
      };
      const events = [
        {
          ...base,
          type: "prompt.submitted",
          ts: "2026-07-14T18:00:00.000Z",
          seq: 1,
          sourceSeq: 1,
          data: { threadId: "parent-thread", turnId: "turn-1" },
        },
        {
          ...base,
          type: "model.completed",
          ts: "2026-07-14T18:00:01.000Z",
          seq: 2,
          sourceSeq: 2,
          data: { threadId: "parent-thread", turnId: "turn-1" },
        },
        {
          ...base,
          type: "prompt.submitted",
          ts: "2026-07-14T18:01:00.000Z",
          seq: 3,
          sourceSeq: 3,
          data: { threadId: "parent-thread", turnId: "turn-2" },
        },
        {
          ...base,
          type: "model.completed",
          ts: "2026-07-14T18:01:01.000Z",
          seq: 4,
          sourceSeq: 4,
          data: { threadId: "parent-thread", turnId: "turn-2" },
        },
      ];
      fs.writeFileSync(
        path.join(tempDir, `${sessionId}.trajectory.jsonl`),
        `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );
      const createChild = (params: {
        childThreadId: string;
        parentTurnId?: string;
        startedAt: number;
      }) =>
        createTaskRecord({
          runtime: "subagent",
          taskKind: "codex-native",
          sourceId: `codex-thread:${params.childThreadId}`,
          requesterSessionKey: sessionKey,
          agentId: "coding",
          runId: `codex-thread:${params.childThreadId}`,
          label: "project_explorer",
          task: "Inspect one bounded decision",
          status: "succeeded",
          deliveryStatus: "not_applicable",
          notifyPolicy: "silent",
          startedAt: params.startedAt,
          lastEventAt: params.startedAt + 1,
          eventMetadata: {
            codexNativeSubagent: true,
            parentThreadId: "parent-thread",
            ...(params.parentTurnId ? { parentTurnId: params.parentTurnId } : {}),
            childThreadId: params.childThreadId,
            childPhase: "child_completed",
          },
        });
      createChild({
        childThreadId: "child-exact-turn-1",
        parentTurnId: "turn-1",
        startedAt: Date.parse("2026-07-14T18:01:30.000Z"),
      });
      createChild({
        childThreadId: "child-ambiguous",
        startedAt: Date.parse("2026-07-14T18:01:30.000Z"),
      });

      const entry = {
        sessionId,
        updatedAt: Date.parse("2026-07-14T18:02:00.000Z"),
        status: "done",
      } satisfies SessionEntry;
      const row = buildGatewaySessionRow({
        cfg: { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig,
        storePath,
        store: { [sessionKey]: entry },
        key: sessionKey,
        entry,
      });

      expect(row.codexExecutionTree?.rounds).toHaveLength(2);
      expect(row.codexExecutionTree?.rounds[0]?.children).toEqual([
        expect.objectContaining({ childThreadId: "child-exact-turn-1", parentTurnId: "turn-1" }),
      ]);
      expect(row.codexExecutionTree?.rounds[1]?.children).toEqual([]);
      expect(row.codexExecutionTree?.unassignedChildren).toEqual([
        expect.objectContaining({ childThreadId: "child-ambiguous" }),
      ]);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("session detail leaves an untagged Codex child unassigned with one parent round", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-session-untagged-child-"));
    try {
      const sessionId = "55555555-5555-4555-8555-555555555555";
      const sessionKey = "agent:coding:session-untagged-child";
      const storePath = path.join(tempDir, "sessions.json");
      fs.writeFileSync(path.join(tempDir, `${sessionId}.jsonl`), "", "utf8");
      fs.writeFileSync(
        path.join(tempDir, `${sessionId}.trajectory.jsonl`),
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          sessionId,
          sessionKey,
          runId: "run-untagged-child",
          workspaceDir: "/home/node/.openclaw/workspace",
          provider: "openai",
          modelId: "gpt-5.6-sol",
          modelApi: "openai-chatgpt-responses",
          type: "prompt.submitted",
          ts: "2026-07-14T18:00:00.000Z",
          seq: 1,
          sourceSeq: 1,
          data: { threadId: "parent-thread", turnId: "only-turn" },
        })}\n`,
        "utf8",
      );
      createTaskRecord({
        runtime: "subagent",
        taskKind: "codex-native",
        sourceId: "codex-thread:untagged-child",
        requesterSessionKey: sessionKey,
        agentId: "coding",
        runId: "codex-thread:untagged-child",
        label: "project_explorer",
        task: "Inspect one bounded decision",
        status: "succeeded",
        deliveryStatus: "not_applicable",
        notifyPolicy: "silent",
        startedAt: Date.parse("2026-07-14T18:00:01.000Z"),
        lastEventAt: Date.parse("2026-07-14T18:00:02.000Z"),
        eventMetadata: {
          codexNativeSubagent: true,
          parentThreadId: "parent-thread",
          childThreadId: "untagged-child",
          childPhase: "child_completed",
        },
      });
      const entry = {
        sessionId,
        updatedAt: Date.parse("2026-07-14T18:00:03.000Z"),
        status: "done",
      } satisfies SessionEntry;
      const row = buildGatewaySessionRow({
        cfg: { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig,
        storePath,
        store: { [sessionKey]: entry },
        key: sessionKey,
        entry,
      });

      expect(row.codexExecutionTree?.rounds).toHaveLength(1);
      expect(row.codexExecutionTree?.rounds[0]?.children).toEqual([]);
      expect(row.codexExecutionTree?.unassignedChildren).toEqual([
        expect.objectContaining({ childThreadId: "untagged-child" }),
      ]);
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test("session detail derives Codex-native child labels from role metadata", () => {
    const cfg = { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig;
    const sessionKey = "agent:coding:session-generic-child-label";
    const store = {
      [sessionKey]: {
        sessionId: "session-generic-child-label",
        updatedAt: 3_000,
      } satisfies SessionEntry,
    };
    createTaskRecord({
      runtime: "subagent",
      taskKind: "codex-native",
      sourceId: "codex-thread:child-thread-2",
      requesterSessionKey: sessionKey,
      agentId: "coding",
      runId: "codex-thread:child-thread-2",
      label: "Codex subagent",
      task: "Review bounded substrate evidence",
      status: "succeeded",
      deliveryStatus: "not_applicable",
      notifyPolicy: "silent",
      startedAt: 3_100,
      lastEventAt: 3_500,
      terminalSummary: "Codex native subagent finished: review complete.",
      eventMetadata: {
        codexNativeSubagent: true,
        parentThreadId: "parent-thread",
        childThreadId: "child-thread-2",
        childPhase: "child_completed",
        childRole: "codex_reviewer",
        childNickname: "Banach",
        childAgentPath: "agents/codex_reviewer.toml",
        spawnReason: "review bounded substrate evidence",
      },
    });

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store,
      key: sessionKey,
      entry: store[sessionKey],
    });

    expect(row.codexNativeChildRuns).toEqual([
      expect.objectContaining({
        source: "codex-native",
        runId: "codex-thread:child-thread-2",
        childThreadId: "child-thread-2",
        role: "codex_reviewer",
        agentPath: "agents/codex_reviewer.toml",
        objective: "review bounded substrate evidence",
        label: "Banach (codex_reviewer)",
        status: "succeeded",
      }),
    ]);
  });

  test("session detail labels live usage as provisional and terminal usage as settled", () => {
    const cfg = { agents: { list: [{ id: "main", default: true }] } } as OpenClawConfig;
    const runningEntry = {
      sessionId: "session-running-usage",
      updatedAt: 2_000,
      status: "running",
      inputTokens: 120,
      outputTokens: 30,
      estimatedCostUsd: 0.01,
    } satisfies SessionEntry;
    const terminalEntry = {
      sessionId: "session-terminal-usage",
      updatedAt: 3_000,
      status: "done",
      inputTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
      totalTokensFresh: true,
      estimatedCostUsd: 0.02,
    } satisfies SessionEntry;
    const store = {
      "agent:main:running-usage": runningEntry,
      "agent:main:terminal-usage": terminalEntry,
    };

    const running = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store,
      key: "agent:main:running-usage",
      entry: runningEntry,
    });
    const terminal = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store,
      key: "agent:main:terminal-usage",
      entry: terminalEntry,
    });

    expect(running.usageCostState).toBe("provisional");
    expect(terminal.usageCostState).toBe("settled");
    expect(running.usage).toEqual({
      state: "provisional",
      run: {
        basis: "run-cumulative",
        inputTokens: 120,
        outputTokens: 30,
      },
    });
    expect(terminal.usage).toEqual({
      state: "settled",
      run: {
        basis: "run-cumulative",
        inputTokens: 200,
        outputTokens: 50,
      },
      context: {
        basis: "latest-context",
        promptTokens: 250,
        fresh: true,
      },
    });
  });

  test("Codex sessions do not fabricate dollar cost from local model pricing", () => {
    const cfg = createModelDefaultsConfig({
      primary: "openai/gpt-5.6-sol",
      agentRuntime: { id: "codex" },
    });
    const entry = {
      sessionId: "session-codex-cost",
      updatedAt: 3_000,
      status: "done",
      inputTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
      totalTokensFresh: true,
      estimatedCostUsd: 0.02,
    } satisfies SessionEntry;
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: { "agent:main:codex-cost": entry },
      key: "agent:main:codex-cost",
      entry,
    });

    expect(row.agentRuntime?.id).toBe("codex");
    expect(row.estimatedCostUsd).toBeUndefined();
    expect(row.usageCostState).toBe("settled");
  });

  test("session detail projects Codex-native workbench capability readback", () => {
    const cfg = { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig;
    const sessionKey = "agent:coding:session-workbench";
    const store = {
      [sessionKey]: {
        sessionId: "session-workbench",
        updatedAt: 2_000,
        systemPromptReport: {
          source: "run",
          generatedAt: 1_900,
          sessionId: "session-workbench",
          sessionKey,
          workspaceDir: "/home/node/.openclaw/workspace",
          codexNativeSurface: {
            owner: "codex_app_server",
            nativeExecutionAllowed: true,
            nativeExecutionReason: "enabled",
            codeModeConfigured: true,
            codeModeOnlyConfigured: false,
            nativeSubagents: {
              expectedTool: "spawn_agent",
              owner: "codex_app_server",
              listedInOpenClawDynamicTools: false,
              guidanceInjected: true,
              disabledByOpenClawModelProfile: false,
            },
            workbenchCapability: {
              schemaVersion: "openclaw.codex-workbench-capability.v1",
              owner: "codex_app_server",
              openclawDynamicTools: { count: 0, names: [] },
              codexNativeTools: { mode: "code" },
              codexWorkbench: {
                workbenchRoot: "/home/node/.openclaw/workspace",
                mcpServers: ["openclaw_repo_workbench"],
              },
              customAgents: {
                count: 10,
                names: ["codex_reviewer", "project_explorer"],
                hasCodexReviewer: true,
                hasCreativeQualityReviewer: true,
              },
            },
          },
          systemPrompt: {
            chars: 10,
            projectContextChars: 0,
            nonProjectContextChars: 10,
          },
          injectedWorkspaceFiles: [],
          skills: { promptChars: 0, hash: "hash", entries: [] },
          tools: { listChars: 0, schemaChars: 0, entries: [] },
        },
      } satisfies SessionEntry,
    };

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store,
      key: sessionKey,
      entry: store[sessionKey],
    });

    expect(row.promptContext?.codexNativeSurface).toMatchObject({
      owner: "codex_app_server",
      nativeExecutionAllowed: true,
      codeModeConfigured: true,
      workbenchCapability: {
        schemaVersion: "openclaw.codex-workbench-capability.v1",
        owner: "codex_app_server",
        openclawDynamicTools: { count: 0, names: [] },
        customAgents: {
          count: 10,
          hasCodexReviewer: true,
          hasCreativeQualityReviewer: true,
        },
      },
    });
    expect(row.promptContext).toMatchObject({
      tools: { surface: "openclaw-dynamic", count: 0, names: [] },
      openclawDynamicTools: { count: 0, names: [] },
      codexNativeWorkbench: {
        active: true,
        mode: "code",
        codeModeConfigured: true,
      },
      codexMcpServers: { count: 1, names: ["openclaw_repo_workbench"] },
      codexCustomAgents: {
        count: 2,
        names: ["codex_reviewer", "project_explorer"],
      },
    });
  });

  test("session detail recovers Codex-native launch surface from trajectory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-session-codex-surface-"));
    const sessionId = "22222222-2222-4222-8222-222222222222";
    const sessionKey = "agent:coding:session-codex-surface";
    const storePath = path.join(tempDir, "sessions.json");
    const transcriptPath = path.join(tempDir, `${sessionId}.jsonl`);
    fs.writeFileSync(transcriptPath, "", "utf8");
    const trajectoryPath = path.join(tempDir, `${sessionId}.trajectory.jsonl`);
    fs.writeFileSync(
      trajectoryPath,
      `${JSON.stringify({
        traceSchema: "openclaw-trajectory",
        schemaVersion: 1,
        traceId: sessionId,
        source: "runtime",
        sessionId,
        sessionKey,
        runId: "run-1",
        workspaceDir: "/home/node/.openclaw/workspace",
        provider: "openai",
        modelId: "gpt-5.5",
        modelApi: "openai-chatgpt-responses",
        type: "session.started",
        ts: "2026-07-10T01:00:00.000Z",
        seq: 1,
        sourceSeq: 1,
        data: {
          threadId: "thread-parent",
          codexNativeSurface: {
            owner: "codex_app_server",
            nativeExecutionAllowed: true,
            nativeExecutionReason: "enabled",
            codeModeConfigured: true,
            codeModeOnlyConfigured: false,
            nativeSubagents: {
              expectedTool: "spawn_agent",
              owner: "codex_app_server",
              listedInOpenClawDynamicTools: false,
              guidanceInjected: true,
              disabledByOpenClawModelProfile: false,
            },
            workbenchCapability: {
              schemaVersion: "openclaw.codex-workbench-capability.v1",
              owner: "codex_app_server",
              thread: { cwd: "/home/node/.openclaw/workspace" },
              openclawDynamicTools: { count: 0, names: [] },
              codexWorkbench: {
                workbenchRoot: "/home/node/.openclaw/workspace",
                mcpServers: ["openclaw_repo_workbench"],
              },
              codexNativeTools: { mode: "code" },
              customAgents: {
                count: 10,
                names: ["codex_reviewer", "creative_quality_reviewer", "project_explorer"],
                hasCodexReviewer: true,
                hasCreativeQualityReviewer: true,
              },
            },
          },
        },
      })}\n`,
      "utf8",
    );

    const cfg = { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig;
    const store = {
      [sessionKey]: {
        sessionId,
        updatedAt: 2_000,
      } satisfies SessionEntry,
    };

    const row = buildGatewaySessionRow({
      cfg,
      storePath,
      store,
      key: sessionKey,
      entry: store[sessionKey],
    });

    expect(row.promptContext?.codexNativeSurface).toMatchObject({
      owner: "codex_app_server",
      nativeExecutionAllowed: true,
      codeModeConfigured: true,
      nativeSubagents: {
        expectedTool: "spawn_agent",
        listedInOpenClawDynamicTools: false,
      },
      workbenchCapability: {
        schemaVersion: "openclaw.codex-workbench-capability.v1",
        thread: { cwd: "/home/node/.openclaw/workspace" },
        openclawDynamicTools: { count: 0, names: [] },
        codexWorkbench: { workbenchRoot: "/home/node/.openclaw/workspace" },
        customAgents: {
          count: 10,
          hasCodexReviewer: true,
          hasCreativeQualityReviewer: true,
        },
      },
    });
    expect(row.promptContext).toMatchObject({
      openclawDynamicTools: { count: 0, names: [] },
      codexNativeWorkbench: { active: true, mode: "code" },
      codexMcpServers: { count: 1, names: ["openclaw_repo_workbench"] },
      codexCustomAgents: {
        count: 3,
        names: ["codex_reviewer", "creative_quality_reviewer", "project_explorer"],
      },
    });
  });

  test("session detail projects bounded Codex execution evidence from trajectory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-session-codex-evidence-"));
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const sessionKey = "agent:coding:session-codex-evidence";
    const storePath = path.join(tempDir, "sessions.json");
    const transcriptPath = path.join(tempDir, `${sessionId}.jsonl`);
    fs.writeFileSync(transcriptPath, "", "utf8");
    const trajectoryPath = path.join(tempDir, `${sessionId}.trajectory.jsonl`);
    const base = {
      traceSchema: "openclaw-trajectory",
      schemaVersion: 1,
      traceId: sessionId,
      source: "runtime",
      sessionId,
      sessionKey,
      runId: "run-1",
      workspaceDir: "/home/node/.openclaw/workspace",
      provider: "openai",
      modelId: "gpt-5.5",
      modelApi: "openai-chatgpt-responses",
    };
    const events = [
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:00.000Z",
        seq: 1,
        sourceSeq: 1,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-bash-pwd",
          name: "bash",
          arguments: { command: "/usr/bin/bash -lc pwd", cwd: "/home/node/.openclaw/workspace" },
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:01.000Z",
        seq: 2,
        sourceSeq: 2,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-repo-search",
          name: "openclaw_repo_workbench.repo_search_many",
          arguments: {
            queries: [
              { path: "business-ops", pattern: "onboarding" },
              { path: "src/openclaw", pattern: "buildCodingWorkbenchMcpServer" },
            ],
          },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:02.000Z",
        seq: 3,
        sourceSeq: 3,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-bash-pwd",
          name: "bash",
          status: "completed",
          isError: false,
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:03.000Z",
        seq: 4,
        sourceSeq: 4,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-repo-search",
          name: "openclaw_repo_workbench.repo_search_many",
          status: "completed",
          isError: false,
          result: { result: { structuredContent: { root: "/home/node/.openclaw/workspace" } } },
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:04.000Z",
        seq: 5,
        sourceSeq: 5,
        data: {
          threadId: "thread-parent",
          name: "openclaw_repo_workbench.lsp_hover_typescript",
          arguments: {
            file: "src/openclaw/src/agents/codex-mcp-config.ts",
            line: 231,
            character: 10,
          },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:05.000Z",
        seq: 6,
        sourceSeq: 6,
        data: {
          threadId: "thread-parent",
          name: "openclaw_repo_workbench.lsp_hover_typescript",
          status: "completed",
          isError: false,
          result: {
            result: {
              structuredContent: {
                root: "/home/node/.openclaw/workspace",
                file: "src/openclaw/src/agents/codex-mcp-config.ts",
                projectMode: "single_file_bounded",
                lspPartial: true,
              },
            },
          },
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:06.000Z",
        seq: 7,
        sourceSeq: 7,
        data: {
          threadId: "thread-parent",
          name: "apply_patch",
          arguments: { input: "*** Begin Patch\n*** End Patch\n" },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:07.000Z",
        seq: 8,
        sourceSeq: 8,
        data: {
          threadId: "thread-parent",
          name: "apply_patch",
          status: "completed",
          isError: false,
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:08.000Z",
        seq: 9,
        sourceSeq: 9,
        data: {
          threadId: "thread-parent",
          name: "bash",
          arguments: {
            command: "node scripts/check-coding-runtime-readiness.mjs --json",
            cwd: "/home/node/.openclaw/workspace",
          },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:09.000Z",
        seq: 10,
        sourceSeq: 10,
        data: { threadId: "thread-parent", name: "bash", status: "completed", isError: false },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:10.000Z",
        seq: 11,
        sourceSeq: 11,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-browser",
          name: "browser",
          arguments: { url: "http://127.0.0.1/workboard" },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:10.200Z",
        seq: 12,
        sourceSeq: 12,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-browser",
          name: "browser",
          status: "completed",
          isError: false,
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:10.300Z",
        seq: 13,
        sourceSeq: 13,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-image",
          name: "view_image",
          arguments: { path: "/tmp/workboard.png" },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:10.400Z",
        seq: 14,
        sourceSeq: 14,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-image",
          name: "view_image",
          status: "completed",
          isError: false,
        },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:10.500Z",
        seq: 15,
        sourceSeq: 15,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-spawn",
          name: "spawn_agent",
          arguments: { agent_type: "codex_reviewer" },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:10.600Z",
        seq: 16,
        sourceSeq: 16,
        data: {
          threadId: "thread-parent",
          toolCallId: "call-spawn",
          name: "spawn_agent",
          status: "completed",
          isError: false,
        },
      },
      {
        ...base,
        type: "model.completed",
        ts: "2026-07-10T01:00:10.700Z",
        seq: 17,
        sourceSeq: 17,
        data: { threadId: "thread-parent" },
      },
      {
        ...base,
        type: "tool.call",
        ts: "2026-07-10T01:00:10.800Z",
        seq: 18,
        sourceSeq: 18,
        data: {
          threadId: "thread-child",
          toolCallId: "call-child-read",
          role: "codex_reviewer",
          objective: "review Codex workbench evidence",
          name: "openclaw_repo_workbench.repo_read_many",
          arguments: {
            files: [{ path: "src/openclaw/extensions/codex/src/app-server/thread-lifecycle.ts" }],
          },
        },
      },
      {
        ...base,
        type: "tool.result",
        ts: "2026-07-10T01:00:10.900Z",
        seq: 19,
        sourceSeq: 19,
        data: {
          threadId: "thread-child",
          toolCallId: "call-child-read",
          role: "codex_reviewer",
          name: "openclaw_repo_workbench.repo_read_many",
          status: "completed",
          isError: false,
          result: { result: { structuredContent: { root: "/home/node/.openclaw/workspace" } } },
        },
      },
      {
        ...base,
        type: "session.ended",
        ts: "2026-07-10T01:00:11.000Z",
        seq: 20,
        sourceSeq: 20,
        data: {
          threadId: "thread-parent",
          status: "success",
          lifecycleScope: "attempt",
          attemptId: "attempt-parent-1",
          logicalRunId: "run-parent-1",
        },
      },
    ];
    fs.writeFileSync(
      trajectoryPath,
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
    const cfg = { agents: { list: [{ id: "coding", default: true }] } } as OpenClawConfig;
    const store = {
      [sessionKey]: {
        sessionId,
        updatedAt: 2_000,
      } satisfies SessionEntry,
    };

    const row = buildGatewaySessionRow({
      cfg,
      storePath,
      store,
      key: sessionKey,
      entry: store[sessionKey],
    });

    expect(row.codexExecutionEvidence).toMatchObject({
      source: "trajectory",
      ref: `session:${sessionId}`,
      bounded: true,
      toolCallCount: 9,
      toolResultCount: 9,
      peakConcurrentToolCalls: 2,
      nativeParallelActivity: { observed: true, peakConcurrentToolCalls: 2 },
      patchCount: 1,
      validationCommands: ["node scripts/check-coding-runtime-readiness.mjs --json"],
      workspaceDirs: ["/home/node/.openclaw/workspace"],
      threadIds: ["thread-parent", "thread-child"],
      toolMix: {
        shell: 2,
        mcp: 3,
        lsp: 1,
        browser: 1,
        image: 1,
        collaboration: 1,
        spawnAgent: 1,
        waitAgent: 0,
        applyPatch: 1,
      },
      modelCompleted: true,
      latestAttemptStatus: "success",
      latestAttemptId: "attempt-parent-1",
    });
    expect(row.codexExecutionEvidence?.sessionEndedStatus).toBeUndefined();
    expect(row.codexExecutionEvidence?.mcpTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          server: "openclaw_repo_workbench",
          tool: "repo_search_many",
          count: 1,
          completed: 1,
          paths: ["business-ops", "src/openclaw"],
          roots: ["/home/node/.openclaw/workspace"],
        }),
        expect.objectContaining({
          server: "openclaw_repo_workbench",
          tool: "lsp_hover_typescript",
          count: 1,
          completed: 1,
          paths: ["src/openclaw/src/agents/codex-mcp-config.ts"],
          projectModes: ["single_file_bounded"],
        }),
      ]),
    );
    expect(row.codexExecutionEvidence?.byThread).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          threadId: "thread-parent",
          observedEventCount: 18,
          toolCallCount: 8,
          toolResultCount: 8,
          peakConcurrentToolCalls: 2,
          toolMix: {
            shell: 2,
            mcp: 2,
            lsp: 1,
            browser: 1,
            image: 1,
            collaboration: 1,
            spawnAgent: 1,
            waitAgent: 0,
            applyPatch: 1,
          },
          validationCommands: ["node scripts/check-coding-runtime-readiness.mjs --json"],
        }),
        expect.objectContaining({
          threadId: "thread-child",
          role: "codex_reviewer",
          objective: "review Codex workbench evidence",
          observedEventCount: 2,
          toolCallCount: 1,
          toolResultCount: 1,
          peakConcurrentToolCalls: 1,
          toolMix: {
            shell: 0,
            mcp: 1,
            lsp: 0,
            browser: 0,
            image: 0,
            collaboration: 0,
            spawnAgent: 0,
            waitAgent: 0,
            applyPatch: 0,
          },
          mcpTools: ["openclaw_repo_workbench.repo_read_many"],
        }),
      ]),
    );
    expect(row.codexExecutionEvidence?.lspTools).toEqual([
      expect.objectContaining({
        tool: "lsp_hover_typescript",
        count: 1,
        completed: 1,
        files: ["src/openclaw/src/agents/codex-mcp-config.ts"],
        projectModes: ["single_file_bounded"],
        partial: true,
      }),
    ]);
    expect(row.codexExecutionEvidence?.shell).toMatchObject({
      count: 2,
      completed: 2,
      cwd: ["/home/node/.openclaw/workspace"],
      commandSamples: [
        "/usr/bin/bash -lc pwd",
        "node scripts/check-coding-runtime-readiness.mjs --json",
      ],
    });
  });

  test("parseGroupKey handles group keys", () => {
    expect(parseGroupKey("discord:group:dev")).toEqual({
      channel: "discord",
      kind: "group",
      id: "dev",
    });
    expect(parseGroupKey("agent:ops:discord:group:dev")).toEqual({
      channel: "discord",
      kind: "group",
      id: "dev",
    });
    expect(parseGroupKey("foo:bar")).toBeNull();
  });

  test("session defaults include provider-owned thinking options", () => {
    const registry = createEmptyPluginRegistry();
    registry.providers.push({
      pluginId: "test",
      source: "test",
      provider: {
        id: "openai",
        label: "OpenAI Codex",
        auth: [],
        resolveThinkingProfile: ({ modelId }) => ({
          levels: [
            { id: "off" },
            { id: "minimal" },
            { id: "low" },
            { id: "medium" },
            { id: "adaptive" },
            { id: "high" },
            ...(modelId === "gpt-5.5" ? [{ id: "xhigh" as const }] : []),
            { id: "max", label: "maximum" },
          ],
          defaultLevel: "adaptive",
        }),
      },
    });
    setActivePluginRegistry(registry);

    const defaults = getSessionDefaults(createModelDefaultsConfig({ primary: "openai/gpt-5.5" }));

    expectFields(defaults, {
      modelProvider: "openai",
      model: "gpt-5.5",
      thinkingDefault: "adaptive",
    });
    const levelLabels = Object.fromEntries(
      defaults.thinkingLevels?.map((level) => [level.id, level.label]) ?? [],
    );
    expectFields(levelLabels, {
      adaptive: "adaptive",
      xhigh: "xhigh",
      max: "maximum",
    });
    expect(defaults.thinkingOptions).toContain("adaptive");
    expect(defaults.thinkingOptions).toContain("xhigh");
    expect(defaults.thinkingOptions).toContain("maximum");
  });

  test("session defaults and rows use catalog reasoning metadata for provider thinking options", () => {
    const registry = createEmptyPluginRegistry();
    registry.providers.push({
      pluginId: "ollama",
      source: "test",
      provider: {
        id: "ollama",
        label: "Ollama",
        auth: [],
        resolveThinkingProfile: ({ reasoning }) => ({
          levels:
            reasoning === true
              ? [{ id: "off" }, { id: "low" }, { id: "medium" }, { id: "high" }, { id: "max" }]
              : [{ id: "off" }],
          defaultLevel: reasoning === true ? "medium" : "off",
        }),
      },
    });
    setActivePluginRegistry(registry);

    const cfg = createModelDefaultsConfig({ primary: "ollama/qwen3:0.6b" });
    const catalog = [
      {
        provider: "ollama",
        id: "qwen3:0.6b",
        name: "qwen3:0.6b",
        reasoning: true,
      },
    ];

    const defaults = getSessionDefaults(cfg, catalog);
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: {},
      key: "main",
      modelCatalog: catalog,
    });

    expect(defaults.thinkingLevels?.map((level) => level.id)).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "max",
    ]);
    expect(row.thinkingLevels?.map((level) => level.id)).toEqual([
      "off",
      "low",
      "medium",
      "high",
      "max",
    ]);
    expect(defaults.thinkingDefault).toBe("medium");
    expect(row.thinkingDefault).toBe("medium");
  });

  test("session rows ignore malformed compaction checkpoints", () => {
    const row = buildGatewaySessionRow({
      cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
      storePath: "",
      store: {},
      key: "agent:main:main",
      entry: {
        sessionId: "session-1",
        updatedAt: 1,
        compactionCheckpoints: [
          {
            checkpointId: "checkpoint-older",
            sessionKey: "agent:main:main",
            sessionId: "session-1",
            createdAt: 10,
            reason: "manual",
            preCompaction: { sessionId: "session-1" },
            postCompaction: { sessionId: "session-1" },
          },
          null,
          {
            checkpointId: "",
            createdAt: 30,
            reason: "manual",
          },
          {
            checkpointId: "checkpoint-bad-reason",
            createdAt: 40,
            reason: "bogus",
          },
          {
            checkpointId: "checkpoint-newer",
            sessionKey: "agent:main:main",
            sessionId: "session-1",
            createdAt: 50,
            reason: "overflow-retry",
            preCompaction: { sessionId: "session-1" },
            postCompaction: { sessionId: "session-1" },
          },
        ],
      } as unknown as SessionEntry,
    });

    expect(row.compactionCheckpointCount).toBe(2);
    expect(row.latestCompactionCheckpoint).toEqual({
      checkpointId: "checkpoint-newer",
      createdAt: 50,
      reason: "overflow-retry",
    });
  });

  test("async session list reuses thinking metadata for lightweight rows", async () => {
    const resolveThinkingProfile = vi.fn(() => ({
      levels: [{ id: "off" as const }, { id: "medium" as const }],
      defaultLevel: "medium" as const,
    }));
    const registry = createEmptyPluginRegistry();
    registry.providers.push({
      pluginId: "test",
      source: "test",
      provider: {
        id: "openai",
        label: "OpenAI Codex",
        auth: [],
        resolveThinkingProfile,
      },
    });
    setActivePluginRegistry(registry);

    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.5" });
    const store = Object.fromEntries(
      Array.from({ length: 5 }, (_value, index) => [
        `session-${index}`,
        {
          sessionId: `session-${index}`,
          modelProvider: "openai",
          model: "gpt-5.5",
          updatedAt: Date.now() - index,
        } satisfies SessionEntry,
      ]),
    );

    const result = await listSessionsFromStoreAsync({
      cfg,
      storePath: "",
      store,
      opts: {},
    });

    expect(result.sessions).toHaveLength(5);
    const missingMediumLevelSessionIds = result.sessions
      .filter((session) => !session.thinkingLevels?.some((level) => level.id === "medium"))
      .map((session) => session.sessionId);
    const missingMediumOptionSessionIds = result.sessions
      .filter((session) => !session.thinkingOptions?.includes("medium"))
      .map((session) => session.sessionId);

    expect(missingMediumLevelSessionIds).toStrictEqual([]);
    expect(missingMediumOptionSessionIds).toStrictEqual([]);
    expect(result.sessions.map((session) => session.thinkingDefault)).toEqual(
      Array.from({ length: result.sessions.length }, () => "medium"),
    );
    expect(resolveThinkingProfile).toHaveBeenCalled();
  });

  test("session list thinking cache preserves case-distinct model catalog entries", () => {
    const cfg = createModelDefaultsConfig({ primary: "custom/CaseModel" });
    const modelCatalog = [
      {
        provider: "custom",
        id: "CaseModel",
        name: "CaseModel",
        reasoning: true,
        compat: { supportedReasoningEfforts: ["low", "medium", "high", "xhigh"] },
      },
      {
        provider: "custom",
        id: "casemodel",
        name: "casemodel",
        reasoning: true,
        compat: { supportedReasoningEfforts: ["low", "medium", "high"] },
      },
    ];
    const result = listSessionsFromStore({
      cfg,
      storePath: "",
      modelCatalog,
      store: {
        upper: {
          sessionId: "upper",
          modelProvider: "custom",
          model: "CaseModel",
          updatedAt: 2,
        } satisfies SessionEntry,
        lower: {
          sessionId: "lower",
          modelProvider: "custom",
          model: "casemodel",
          updatedAt: 1,
        } satisfies SessionEntry,
      },
      opts: {},
    });

    const upper = result.sessions.find((session) => session.key === "upper");
    const lower = result.sessions.find((session) => session.key === "lower");
    expect(upper?.thinkingLevels?.map((level) => level.id)).toContain("xhigh");
    expect(lower?.thinkingLevels?.map((level) => level.id)).not.toContain("xhigh");
  });

  test("session defaults and rows expose xhigh from configured catalog compat", () => {
    const cfg = createModelDefaultsConfig({ primary: "gmn/gpt-5.4" });
    const catalog = [
      {
        provider: "gmn",
        id: "gpt-5.4",
        name: "GPT 5.4 via GMN",
        reasoning: true,
        compat: { supportedReasoningEfforts: ["low", "medium", "high", "xhigh"] },
      },
    ];

    const defaults = getSessionDefaults(cfg, catalog);
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: {},
      key: "main",
      modelCatalog: catalog,
    });

    expect(defaults.thinkingLevels?.map((level) => level.id)).toContain("xhigh");
    expect(row.thinkingLevels?.map((level) => level.id)).toContain("xhigh");
  });

  test("session defaults and rows expose bundled startup-lazy provider thinking without catalog", () => {
    const cfg = createModelDefaultsConfig({ primary: "openai/gpt-5.5" });

    const defaults = getSessionDefaults(cfg);
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: {},
      key: "main",
    });

    expect(defaults.thinkingLevels?.map((level) => level.id)).toContain("xhigh");
    expect(row.thinkingLevels?.map((level) => level.id)).toContain("xhigh");
  });

  test("session rows expose unavailable active-progress evidence when a running session has no useful native event", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-active-progress-"));
    try {
      const sessionId = "session-active-progress-empty-tail";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "session.ended",
            ts: "2026-07-01T00:00:00.000Z",
            data: {},
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:main:main",
        entry: {
          sessionId,
          sessionFile,
          status: "running",
          updatedAt: 1,
        },
      });

      expect(row.activeProgress).toMatchObject({
        source: "unavailable",
        ref: `session:${sessionId}`,
        currentPhase: "running",
        activeLabel: null,
        note: "Native active progress event unavailable for running session; session-store status=running.",
        pointer: {
          kind: "session",
          ref: "agent:main:main",
          label: "session readback",
        },
        derivedBy: "buildGatewaySessionRow",
        bounded: true,
      });
      expect(row.readbackProvenance?.activeProgress).toEqual(row.activeProgress);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows expose bounded validation failure evidence from trajectory tool results", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-validation-progress-"));
    try {
      const sessionId = "session-validation-progress";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "tool.call",
            ts: "2026-07-01T00:00:59.000Z",
            seq: 3,
            sourceSeq: 11,
            data: {
              name: "bash",
              toolCallId: "call-validation-progress",
              arguments: {
                command: "pnpm vitest run src/gateway/session-utils.test.ts",
                cwd: "/workspace/src/openclaw",
              },
            },
          }),
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "tool.result",
            ts: "2026-07-01T00:01:00.000Z",
            seq: 4,
            sourceSeq: 13,
            data: {
              name: "bash",
              toolCallId: "call-validation-progress",
              status: "failed",
              result: {
                status: "failed",
                exitCode: 1,
                durationMs: 1275,
              },
              output: "FAIL src/gateway/session-utils.test.ts > expected active progress evidence",
              repairAction: "Inspect active progress projection output fields.",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:coding:main",
        entry: {
          sessionId,
          sessionFile,
          status: "running",
          updatedAt: 1,
        },
      });

      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${sessionId}`,
        activeLabel: "bash",
        observedAt: "2026-07-01T00:01:00.000Z",
        elapsedMs: 1275,
        durationMs: 1275,
        sourceEventType: "tool.result",
        sourceEventSeq: 13,
        toolName: "bash",
        command: "pnpm vitest run src/gateway/session-utils.test.ts",
        exitCode: 1,
        validationClass: "test",
        outputSummary: "FAIL src/gateway/session-utils.test.ts > expected active progress evidence",
        repairAction: "Inspect active progress projection output fields.",
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows do not project related task wait-chain progress when trajectory has no useful event", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-task-progress-"));
    try {
      const now = Date.UTC(2026, 6, 1, 0, 2, 0);
      const taskStartedAt = now - 45_000;
      createTaskRecord({
        runtime: "subagent",
        taskKind: "openclaw-agent",
        requesterSessionKey: "agent:main:main",
        ownerKey: "agent:main:main",
        scopeKind: "session",
        agentId: "planning",
        runId: "planning-task-progress",
        label: "Planning",
        task: "Produce the plan and wait for source scout evidence.",
        status: "running",
        deliveryStatus: "delivered",
        notifyPolicy: "silent",
        startedAt: taskStartedAt,
        lastEventAt: now - 5_000,
        progressSummary: "Planning child is waiting on codebase-researcher source evidence.",
      });

      const sessionId = "session-task-progress";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "session.ended",
            ts: "2026-07-01T00:00:00.000Z",
            data: {},
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:main:main",
        entry: {
          sessionId,
          sessionFile,
          status: "running",
          updatedAt: now,
        },
        now,
      });

      expect(row.activeProgress).toMatchObject({
        source: "unavailable",
        ref: `session:${sessionId}`,
        currentPhase: "running",
        pointer: {
          kind: "session",
          ref: "agent:main:main",
          label: "session readback",
        },
        derivedBy: "buildGatewaySessionRow",
        bounded: true,
      });
      expect(row.readbackProvenance?.activeProgress).toEqual(row.activeProgress);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows project active descendant session trajectory through native lineage", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-child-lineage-progress-"));
    try {
      const now = Date.UTC(2026, 6, 1, 0, 2, 0);
      const parentSessionId = "session-parent-lineage-progress";
      const childSessionId = "session-child-lineage-progress";
      const parentKey = "agent:main:main";
      const childKey = "agent:codebase-researcher:subagent:child-lineage-progress";
      const parentSessionFile = path.join(dir, `${parentSessionId}.jsonl`);
      const childSessionFile = path.join(dir, `${childSessionId}.jsonl`);
      const parentTrajectoryFile = path.join(dir, `${parentSessionId}.trajectory.jsonl`);
      const childTrajectoryFile = path.join(dir, `${childSessionId}.trajectory.jsonl`);
      fs.writeFileSync(parentSessionFile, "", "utf8");
      fs.writeFileSync(childSessionFile, "", "utf8");
      fs.writeFileSync(
        parentTrajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId: parentSessionId,
            type: "session.started",
            ts: "2026-07-01T00:00:00.000Z",
            data: {},
          }),
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        childTrajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId: childSessionId,
            type: "agent.tool",
            ts: "2026-07-01T00:01:30.000Z",
            seq: 6,
            sourceSeq: 22,
            data: {
              phase: "start",
              name: "rg",
              toolCallId: "call-child-lineage-rg",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );
      const store: Record<string, SessionEntry> = {
        [parentKey]: {
          sessionId: parentSessionId,
          sessionFile: parentSessionFile,
          status: "running",
          updatedAt: now - 120_000,
          startedAt: now - 180_000,
        },
        [childKey]: {
          sessionId: childSessionId,
          sessionFile: childSessionFile,
          status: "running",
          parentSessionKey: parentKey,
          spawnedBy: parentKey,
          updatedAt: now - 30_000,
          startedAt: now - 60_000,
        },
      };

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store,
        key: parentKey,
        entry: store[parentKey],
        now,
      });

      expect(row.childSessions).toEqual([childKey]);
      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${childSessionId}`,
        currentPhase: "start",
        activeLabel: "rg",
        sourceEventType: "agent.tool",
        sourceEventSeq: 22,
        toolName: "rg",
        pointer: {
          kind: "session",
          ref: childKey,
          label: "active child session",
        },
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
      expect(row.updatedAt).toBe(now - 120_000);
      expect(row.lastObservedActivityAt).toBe(Date.parse("2026-07-01T00:01:30.000Z"));
      expect(row.lastObservedActivitySource).toBe("direct-child");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows keep descendant work visible after the parent turn settles", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-settled-parent-child-"));
    try {
      const now = Date.UTC(2026, 6, 1, 0, 2, 0);
      const parentKey = "agent:main:main";
      const childKey = "agent:business-ops:subagent:active-continuation";
      const parentSessionId = "session-parent-settled";
      const childSessionId = "session-child-continuation";
      const parentSessionFile = path.join(dir, `${parentSessionId}.jsonl`);
      const childSessionFile = path.join(dir, `${childSessionId}.jsonl`);
      fs.writeFileSync(parentSessionFile, "", "utf8");
      fs.writeFileSync(childSessionFile, "", "utf8");
      fs.writeFileSync(
        path.join(dir, `${childSessionId}.trajectory.jsonl`),
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: childSessionId,
          type: "agent.tool",
          ts: "2026-07-01T00:01:30.000Z",
          seq: 6,
          sourceSeq: 22,
          data: { phase: "start", name: "read", toolCallId: "call-child-read" },
        })}\n`,
        "utf8",
      );
      const store: Record<string, SessionEntry> = {
        [parentKey]: {
          sessionId: parentSessionId,
          sessionFile: parentSessionFile,
          status: "done",
          updatedAt: now - 30_000,
          startedAt: now - 120_000,
          endedAt: now - 30_000,
        },
        [childKey]: {
          sessionId: childSessionId,
          sessionFile: childSessionFile,
          status: "running",
          parentSessionKey: parentKey,
          spawnedBy: parentKey,
          updatedAt: now - 5_000,
          startedAt: now - 20_000,
        },
      };

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store,
        key: parentKey,
        entry: store[parentKey],
        now,
      });

      expect(row.status).toBe("done");
      expect(row.hasActiveSubagentRun).toBe(true);
      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${childSessionId}`,
        activeLabel: "read",
        pointer: {
          kind: "session",
          ref: childKey,
          label: "active child session",
        },
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows project grandchild descendant activity without mutating parent updatedAt", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-grandchild-progress-"));
    try {
      const now = Date.UTC(2026, 6, 1, 0, 3, 0);
      const mainSessionId = "session-main-grandchild-progress";
      const planningSessionId = "session-planning-grandchild-progress";
      const reviewerSessionId = "session-reviewer-grandchild-progress";
      const mainKey = "agent:main:main";
      const planningKey = "agent:planning:subagent:planning-grandchild-progress";
      const reviewerKey = "agent:reviewer:subagent:reviewer-grandchild-progress";
      const mainSessionFile = path.join(dir, `${mainSessionId}.jsonl`);
      const planningSessionFile = path.join(dir, `${planningSessionId}.jsonl`);
      const reviewerSessionFile = path.join(dir, `${reviewerSessionId}.jsonl`);
      const mainTrajectoryFile = path.join(dir, `${mainSessionId}.trajectory.jsonl`);
      const planningTrajectoryFile = path.join(dir, `${planningSessionId}.trajectory.jsonl`);
      const reviewerTrajectoryFile = path.join(dir, `${reviewerSessionId}.trajectory.jsonl`);
      fs.writeFileSync(mainSessionFile, "", "utf8");
      fs.writeFileSync(planningSessionFile, "", "utf8");
      fs.writeFileSync(reviewerSessionFile, "", "utf8");
      fs.writeFileSync(
        mainTrajectoryFile,
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: mainSessionId,
          type: "agent.tool",
          ts: "2026-07-01T00:01:00.000Z",
          seq: 2,
          sourceSeq: 12,
          data: {
            phase: "start",
            name: "task",
            childRole: "planning",
          },
        })}\n`,
        "utf8",
      );
      fs.writeFileSync(
        planningTrajectoryFile,
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: planningSessionId,
          type: "session.started",
          ts: "2026-07-01T00:00:10.000Z",
          data: {},
        })}\n`,
        "utf8",
      );
      fs.writeFileSync(
        reviewerTrajectoryFile,
        `${JSON.stringify({
          traceSchema: "openclaw-trajectory",
          sessionId: reviewerSessionId,
          type: "agent.tool",
          ts: "2026-07-01T00:02:10.000Z",
          seq: 5,
          sourceSeq: 30,
          data: {
            phase: "reviewing",
            name: "read",
            childRole: "reviewer",
          },
        })}\n`,
        "utf8",
      );
      const store: Record<string, SessionEntry> = {
        [mainKey]: {
          sessionId: mainSessionId,
          sessionFile: mainSessionFile,
          status: "running",
          updatedAt: now - 180_000,
          startedAt: now - 200_000,
        },
        [planningKey]: {
          sessionId: planningSessionId,
          sessionFile: planningSessionFile,
          status: "running",
          parentSessionKey: mainKey,
          spawnedBy: mainKey,
          updatedAt: now - 120_000,
          startedAt: now - 150_000,
        },
        [reviewerKey]: {
          sessionId: reviewerSessionId,
          sessionFile: reviewerSessionFile,
          status: "running",
          parentSessionKey: planningKey,
          spawnedBy: planningKey,
          updatedAt: now - 30_000,
          startedAt: now - 60_000,
        },
      };

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store,
        key: mainKey,
        entry: store[mainKey],
        now,
      });

      expect(row.childSessions).toEqual([planningKey]);
      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${reviewerSessionId}`,
        currentPhase: "reviewing",
        activeLabel: "read",
        sourceEventType: "agent.tool",
        sourceEventSeq: 30,
        toolName: "read",
        childRole: "reviewer",
        pointer: {
          kind: "session",
          ref: reviewerKey,
          label: "active child session",
        },
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
      expect(row.updatedAt).toBe(now - 180_000);
      expect(row.lastObservedActivityAt).toBe(Date.parse("2026-07-01T00:02:10.000Z"));
      expect(row.lastObservedActivitySource).toBe("descendant");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows project native lifecycle finalization instead of generic running state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-lifecycle-progress-"));
    try {
      const sessionId = "session-lifecycle-finalizing";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "tool.result",
            ts: "2026-07-01T00:01:10.000Z",
            seq: 6,
            sourceSeq: 18,
            data: {
              name: "task",
              status: "completed",
              summary: "reviewer returned approval packet",
            },
          }),
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "agent.lifecycle",
            ts: "2026-07-01T00:01:14.000Z",
            seq: 7,
            sourceSeq: 19,
            data: {
              phase: "finishing",
              title: "assistant generation",
              summary: "assistant generating final response after child work",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:planning:main",
        entry: {
          sessionId,
          sessionFile,
          status: "running",
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
      });

      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${sessionId}`,
        currentPhase: "finishing",
        activeLabel: "assistant generation",
        observedAt: "2026-07-01T00:01:14.000Z",
        sourceEventType: "agent.lifecycle",
        sourceEventSeq: 19,
        note: "assistant generating final response after child work",
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
      expect(row.lastObservedActivityAt).toBe(Date.parse("2026-07-01T00:01:14.000Z"));
      expect(row.lastObservedActivitySource).toBe("own");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows project native assistant events as finalization progress", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-assistant-progress-"));
    try {
      const sessionId = "session-assistant-finalizing";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "tool.result",
            ts: "2026-07-01T00:01:10.000Z",
            seq: 6,
            sourceSeq: 18,
            data: {
              name: "task",
              status: "completed",
              summary: "reviewer returned approval packet",
            },
          }),
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "agent.assistant",
            ts: "2026-07-01T00:01:20.000Z",
            seq: 7,
            sourceSeq: 19,
            data: {},
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:planning:main",
        entry: {
          sessionId,
          sessionFile,
          status: "running",
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
      });

      expect(row.activeProgress).toMatchObject({
        source: "trajectory",
        ref: `session:${sessionId}`,
        activeLabel: "assistant generation",
        observedAt: "2026-07-01T00:01:20.000Z",
        sourceEventType: "agent.assistant",
        sourceEventSeq: 19,
        note: "assistant generation/finalization event observed",
        derivedBy: "readLatestTrajectoryProgressProjection",
        bounded: true,
      });
      expect(row.lastObservedActivityAt).toBe(Date.parse("2026-07-01T00:01:20.000Z"));
      expect(row.lastObservedActivitySource).toBe("own");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows derive running status from native trajectory when store status is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-trajectory-status-"));
    try {
      const sessionId = "session-trajectory-status";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(sessionFile, "", "utf8");
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "agent.tool",
            ts: "2026-07-01T00:01:20.000Z",
            seq: 8,
            sourceSeq: 20,
            data: {
              phase: "start",
              name: "task",
              title: "Task",
              summary: "running child scout",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:planning:main",
        entry: {
          sessionId,
          sessionFile,
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
      });

      expect(row.status).toBe("running");
      expect(row.readbackProvenance?.status).toMatchObject({
        source: "trajectory",
        ref: `session:${sessionId}`,
        eventType: "agent.tool",
        eventSeq: 20,
        derivedBy: "buildGatewaySessionRow",
        bounded: true,
        note: "session-store status missing; native trajectory progress shows active work",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("running session rows do not expose prior settled closeout observations", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-running-verdict-"));
    try {
      const sessionId = "session-running-verdict";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      const trajectoryFile = path.join(dir, `${sessionId}.trajectory.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({
            message: { role: "assistant", content: "Verdict: complete\nEarlier turn settled." },
          }),
          JSON.stringify({ message: { role: "user", content: "Continue the episode." } }),
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        trajectoryFile,
        [
          JSON.stringify({
            traceSchema: "openclaw-trajectory",
            sessionId,
            type: "agent.tool",
            ts: "2026-07-01T00:01:20.000Z",
            seq: 8,
            sourceSeq: 20,
            data: { phase: "start", name: "sessions_send", title: "Session Send" },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:main:main",
        entry: {
          sessionId,
          sessionFile,
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
        includeLastMessage: true,
      });

      expect(row.status).toBe("running");
      expect(row.finalAssistantText).toBe("Verdict: complete\nEarlier turn settled.");
      expect(row.taskStatus).toBeUndefined();
      expect(row.reviewDecision).toBeUndefined();
      expect(row.laneVerdict).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("settled review rows expose task status and review decision independently", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-review-closeout-"));
    try {
      const sessionId = "session-review-closeout";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({
            message: {
              role: "assistant",
              content:
                "Task status: complete\nReview decision: revise\nThe review completed; the artifact needs changes.",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:reviewer:subagent:review-closeout",
        entry: {
          sessionId,
          sessionFile,
          status: "done",
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
        includeLastMessage: true,
      });

      expect(row.status).toBe("done");
      expect(row.taskStatus).toBe("complete");
      expect(row.reviewDecision).toBe("revise");
      expect(row.laneVerdict).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("settled task status does not imply a review decision", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-task-closeout-"));
    try {
      const sessionId = "session-task-closeout";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({
            message: {
              role: "assistant",
              content: "Task status: complete\nImplementation and validation are complete.",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:coding:subagent:task-closeout",
        entry: {
          sessionId,
          sessionFile,
          status: "done",
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
        includeLastMessage: true,
      });

      expect(row.taskStatus).toBe("complete");
      expect(row.reviewDecision).toBeUndefined();
      expect(row.laneVerdict).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("settled legacy transcripts retain lane verdict compatibility", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-legacy-verdict-"));
    try {
      const sessionId = "session-legacy-verdict";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({
            message: { role: "assistant", content: "Verdict: partial\nLegacy closeout." },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:planning:subagent:legacy-closeout",
        entry: {
          sessionId,
          sessionFile,
          status: "done",
          updatedAt: Date.UTC(2026, 6, 1, 0, 1, 0),
        },
        includeLastMessage: true,
      });

      expect(row.taskStatus).toBeUndefined();
      expect(row.reviewDecision).toBeUndefined();
      expect(row.laneVerdict).toBe("partial");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows prefer final assistant transcript truth over stale failed status metadata", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-final-status-"));
    try {
      const sessionId = "session-final-status";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({ message: { role: "assistant", content: "Visible final closeout." } }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:main:main",
        entry: {
          sessionId,
          sessionFile,
          status: "failed",
          updatedAt: 1,
        },
        includeLastMessage: true,
      });

      expect(row.status).toBe("done");
      expect(row.finalAssistantText).toBe("Visible final closeout.");
      expect(row.readbackProvenance?.status).toMatchObject({
        source: "session-transcript",
        ref: `session:${sessionId}`,
        bounded: true,
      });
      expect(row.readbackProvenance?.status?.note).toContain("session-store status=failed");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session rows do not reuse an earlier final after the latest user turn fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-failed-latest-turn-"));
    try {
      const sessionId = "session-failed-latest-turn";
      const sessionFile = path.join(dir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        sessionFile,
        [
          JSON.stringify({ type: "session", version: 1, id: sessionId }),
          JSON.stringify({ message: { role: "user", content: "Earlier request." } }),
          JSON.stringify({ message: { role: "assistant", content: "Earlier closeout." } }),
          JSON.stringify({ message: { role: "user", content: "Latest request." } }),
          JSON.stringify({
            message: {
              role: "assistant",
              content: [],
              stopReason: "error",
              errorCode: "server_is_overloaded",
            },
          }),
          "",
        ].join("\n"),
        "utf8",
      );

      const row = buildGatewaySessionRow({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.5" }),
        storePath: path.join(dir, "sessions.json"),
        store: {},
        key: "agent:main:main",
        entry: {
          sessionId,
          sessionFile,
          status: "failed",
          updatedAt: 1,
        },
        includeLastMessage: true,
      });

      expect(row.status).toBe("failed");
      expect(row.finalAssistantText).toBe("Earlier closeout.");
      expect(row.readbackProvenance?.finalAssistantText?.note).toContain(
        "predates latest user turn",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("session defaults use configured thinking default", () => {
    const defaults = getSessionDefaults({
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.5" },
          thinkingDefault: "high",
        },
      },
    } as OpenClawConfig);

    expectFields(defaults, {
      modelProvider: "openai",
      model: "gpt-5.5",
      thinkingDefault: "high",
    });
  });

  test("session rows expose estimated context budget status", () => {
    const row = buildGatewaySessionRow({
      cfg: createModelDefaultsConfig({ primary: "anthropic/claude-sonnet-4.6" }),
      storePath: "",
      store: {},
      key: "agent:main:main",
      entry: {
        sessionId: "session-1",
        sessionFile: "/tmp/openclaw/agents/main/sessions/session-1.jsonl",
        updatedAt: 1,
        contextBudgetStatus: {
          schemaVersion: 1,
          source: "pre-prompt-estimate",
          updatedAt: 2,
          provider: "anthropic",
          model: "claude-sonnet-4.6",
          route: "compact_then_truncate",
          shouldCompact: true,
          estimatedPromptTokens: 640_000,
          contextTokenBudget: 200_000,
          promptBudgetBeforeReserve: 180_000,
          reserveTokens: 20_000,
          effectiveReserveTokens: 20_000,
          remainingPromptBudgetTokens: 0,
          overflowTokens: 460_000,
          toolResultReducibleChars: 12_000,
          messageCount: 42,
          unwindowedMessageCount: 39,
          sessionId: "session-1",
        },
      },
    });

    expect(row.contextBudgetStatus).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4.6",
      estimatedPromptTokens: 640_000,
      contextTokenBudget: 200_000,
      sessionId: "session-1",
    });
  });

  test("selected global rows read transcript usage from the selected agent", async () => {
    await withStateDirEnv("session-utils-selected-global-usage-", async ({ stateDir }) => {
      const sessionId = "selected-global-usage";
      for (const [agentId, input] of [
        ["main", 10],
        ["work", 40],
      ] as const) {
        const sessionsDir = path.join(stateDir, "agents", agentId, "sessions");
        fs.mkdirSync(sessionsDir, { recursive: true });
        fs.writeFileSync(
          path.join(sessionsDir, `${sessionId}.jsonl`),
          [
            JSON.stringify({ type: "session", version: 1, id: sessionId }),
            JSON.stringify({
              message: {
                role: "assistant",
                content: "done",
                usage: { input, output: 2 },
              },
            }),
          ].join("\n"),
          "utf-8",
        );
      }

      const row = buildGatewaySessionRow({
        cfg: {
          agents: { list: [{ id: "main", default: true }, { id: "work" }] },
        } as OpenClawConfig,
        storePath: "",
        store: {},
        key: "global",
        agentId: "work",
        entry: { sessionId, updatedAt: 1 },
      });

      expect(row.totalTokens).toBe(40);
    });
  });

  test("session rows use per-agent thinking default from config", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.5" },
          thinkingDefault: "low",
          models: {
            "openai/gpt-5.5": {
              params: { thinking: "max" },
            },
          },
        },
        list: [
          {
            id: "alpha",
            default: true,
            thinkingDefault: "high",
          },
        ],
      },
    } as OpenClawConfig;

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: {},
      key: "agent:alpha:main",
    });

    expectFields(row, {
      modelProvider: "openai",
      model: "gpt-5.5",
      thinkingDefault: "high",
    });
  });

  test("session rows prefer per-model thinking over global default", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.5" },
          thinkingDefault: "low",
          models: {
            "openai/gpt-5.5": {
              params: { thinking: "max" },
            },
          },
        },
      },
    } as OpenClawConfig;

    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: {},
      key: "main",
    });

    expectFields(row, {
      modelProvider: "openai",
      model: "gpt-5.5",
      thinkingDefault: "max",
    });
  });

  test("classifySessionKey respects chat type + prefixes", () => {
    expect(classifySessionKey("global")).toBe("global");
    expect(classifySessionKey("unknown")).toBe("unknown");
    expect(classifySessionKey("discord:group:dev")).toBe("group");
    expect(classifySessionKey("main")).toBe("direct");
    const entry = { chatType: "group" } as SessionEntry;
    expect(classifySessionKey("main", entry)).toBe("group");
  });

  test("buildGatewaySessionRow displayName falls through to origin label for direct sessions", () => {
    const cfg = { agents: { list: [{ id: "main", default: true }] } } as OpenClawConfig;
    const entry = {
      chatType: "direct",
      channel: "telegram",
      origin: { label: "openclaw-tui" },
    } as SessionEntry;
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: { "agent:main:telegram:direct:42": entry },
      key: "agent:main:telegram:direct:42",
      entry,
    });
    expect(row.displayName).toBe("openclaw-tui");
  });

  test("buildGatewaySessionRow displayName uses group display name for group sessions", () => {
    const cfg = { agents: { list: [{ id: "main", default: true }] } } as OpenClawConfig;
    const entry = {
      chatType: "group",
      channel: "telegram",
      subject: "Engineering",
      origin: { label: "openclaw-tui" },
    } as SessionEntry;
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: { "agent:main:telegram:group:99": entry },
      key: "agent:main:telegram:group:99",
      entry,
    });
    expect(row.displayName).toMatch(/^telegram:/);
    expect(row.displayName).not.toBe("openclaw-tui");
  });

  test("buildGatewaySessionRow prefers entry.label over origin.label for direct sessions", () => {
    const cfg = { agents: { list: [{ id: "main", default: true }] } } as OpenClawConfig;
    const entry = {
      chatType: "direct",
      channel: "telegram",
      label: "Alice",
      origin: { label: "openclaw-tui" },
    } as SessionEntry;
    const row = buildGatewaySessionRow({
      cfg,
      storePath: "",
      store: { "agent:main:telegram:direct:42": entry },
      key: "agent:main:telegram:direct:42",
      entry,
    });
    expect(row.displayName).toBe("Alice");
  });

  test("resolveSessionStoreKey maps main aliases to default agent main", () => {
    const cfg = {
      session: { mainKey: "work" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "main" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "work" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:ops:main" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:ops:MAIN" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:main:main" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:main:work" })).toBe("agent:ops:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "MAIN" })).toBe("agent:ops:work");
  });

  test("resolveSessionStoreKey preserves non-alias agent:main keys for deleted-agent checks", () => {
    const cfg = {
      session: { mainKey: "work" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:main:discord:direct:u1" })).toBe(
      "agent:main:discord:direct:u1",
    );
  });

  test("resolveDeletedAgentIdFromSessionKey rejects non-alias main keys when main is absent", () => {
    const cfg = {
      session: { mainKey: "work" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const legacyMainAlias = resolveSessionStoreKey({ cfg, sessionKey: "agent:main:main" });

    expect(legacyMainAlias).toBe("agent:ops:work");
    expect(resolveDeletedAgentIdFromSessionKey(cfg, legacyMainAlias)).toBeNull();
    expect(resolveDeletedAgentIdFromSessionKey(cfg, "global")).toBeNull();
    expect(resolveDeletedAgentIdFromSessionKey(cfg, "unknown")).toBeNull();
    expect(resolveDeletedAgentIdFromSessionKey(cfg, "main")).toBeNull();
    expect(resolveDeletedAgentIdFromSessionKey(cfg, "agent:main:discord:direct:u1")).toBe("main");
  });

  test("resolveDeletedAgentIdFromSessionKey ignores confirmed ACP runtime session keys", () => {
    const cfg = {
      agents: { list: [{ id: "main", default: true }] },
    } as OpenClawConfig;
    const acpEntry = (agent: string, runtimeSessionName: string) =>
      ({
        acp: {
          backend: "acpx",
          agent,
          runtimeSessionName,
          mode: "oneshot",
          state: "idle",
          lastActivityAt: 1,
        },
      }) as SessionEntry;
    const claudeKey = "agent:claude:acp:11111111-1111-4111-8111-111111111111";
    const cursorKey = "agent:cursor:acp:22222222-2222-4222-8222-222222222222";
    expect(
      resolveDeletedAgentIdFromSessionKey(cfg, claudeKey, acpEntry("claude", claudeKey)),
    ).toBeNull();
    expect(
      resolveDeletedAgentIdFromSessionKey(cfg, cursorKey, acpEntry("cursor", cursorKey)),
    ).toBeNull();
  });

  test("resolveDeletedAgentIdFromSessionKey rejects ACP-shaped bridge keys without ACP metadata", () => {
    const cfg = {
      agents: { list: [{ id: "main", default: true }] },
    } as OpenClawConfig;

    expect(
      resolveDeletedAgentIdFromSessionKey(cfg, "agent:main:acp:configured-bridge-without-meta", {
        acp: undefined,
        sessionId: "sess-configured-bridge",
        updatedAt: 1,
      }),
    ).toBeNull();

    expect(
      resolveDeletedAgentIdFromSessionKey(
        cfg,
        "agent:deleted-agent:acp:bridge-session-without-runtime-meta",
        { acp: undefined, sessionId: "sess-deleted-bridge", updatedAt: 1 },
      ),
    ).toBe("deleted-agent");
  });

  test("resolveDeletedAgentIdFromSessionKey repairs canonical ACP metadata aliases", async () => {
    await withStateDirEnv("session-utils-acp-deleted-agent-repair-", async ({ stateDir }) => {
      const storePath = path.join(stateDir, "agents", "claude", "sessions", "sessions.json");
      const acpKey = "agent:claude:acp:55555555-5555-4555-8555-555555555555";
      const legacyAcpKey = "agent:CLAUDE:acp:55555555-5555-4555-8555-555555555555";
      const entry = {
        sessionId: "sess-acp-repair",
        updatedAt: 1,
      } satisfies SessionEntry;
      writeSessionStoreForTest(storePath, {
        [acpKey]: entry,
      });
      writeAcpSessionMetaForMigration({
        sessionKey: legacyAcpKey,
        sessionId: "sess-acp-repair",
        meta: {
          backend: "acpx",
          agent: "claude",
          runtimeSessionName: legacyAcpKey,
          mode: "oneshot",
          state: "idle",
          lastActivityAt: 1,
        },
      });
      const cfg = {
        session: {
          store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
        },
        agents: { list: [{ id: "main", default: true }] },
      } as OpenClawConfig;

      expect(
        resolveDeletedAgentIdFromSessionKey(cfg, acpKey, entry, {
          acpMetadataSessionKey: acpKey,
        }),
      ).toBeNull();
    });
  });

  test("resolveDeletedAgentIdFromSessionKey rejects deleted configured ACP binding owners", () => {
    const cfg = {
      agents: { list: [{ id: "main", default: true }] },
    } as OpenClawConfig;

    expect(
      resolveDeletedAgentIdFromSessionKey(
        cfg,
        "agent:deleted-agent:acp:binding:discord:default:feedface",
      ),
    ).toBe("deleted-agent");
    expect(
      resolveDeletedAgentIdFromSessionKey(cfg, "agent:main:acp:binding:discord:default:feedface"),
    ).toBeNull();
  });

  test("resolveSessionStoreKey canonicalizes bare keys to default agent", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "discord:group:123" })).toBe(
      "agent:ops:discord:group:123",
    );
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:alpha:main" })).toBe(
      "agent:alpha:main",
    );
  });

  test("resolveSessionStoreKey falls back to first list entry when no agent is marked default", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "ops" }, { id: "review" }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "main" })).toBe("agent:ops:main");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "discord:group:123" })).toBe(
      "agent:ops:discord:group:123",
    );
  });

  test("resolveSessionStoreKey falls back to main when agents.list is missing", () => {
    const cfg = {
      session: { mainKey: "work" },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "main" })).toBe("agent:main:work");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "thread-1" })).toBe("agent:main:thread-1");
  });

  test("resolveSessionStoreKey normalizes session key casing", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "CoP" })).toBe(
      resolveSessionStoreKey({ cfg, sessionKey: "cop" }),
    );
    expect(resolveSessionStoreKey({ cfg, sessionKey: "MySession" })).toBe("agent:ops:mysession");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:ops:CoP" })).toBe("agent:ops:cop");
    expect(resolveSessionStoreKey({ cfg, sessionKey: "agent:alpha:MySession" })).toBe(
      "agent:alpha:mysession",
    );
  });

  test("resolveSessionStoreKey preserves Signal group ids", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const mixedGroupId = "VWATodkf2hc8zdOS76q9Tb0+5Bi522E03qLdaQ/9ypg=";
    expect(resolveSessionStoreKey({ cfg, sessionKey: `Signal:Group:${mixedGroupId}` })).toBe(
      `agent:ops:signal:group:${mixedGroupId}`,
    );
    expect(
      resolveSessionStoreKey({ cfg, sessionKey: `Agent:Alpha:Signal:Group:${mixedGroupId}` }),
    ).toBe(`agent:alpha:signal:group:${mixedGroupId}`);
  });

  test("canonicalizeSpawnedByForAgent preserves Signal group ids", () => {
    const cfg = {
      session: { mainKey: "main" },
    } as OpenClawConfig;
    const mixedGroupId = "VWATodkf2hc8zdOS76q9Tb0+5Bi522E03qLdaQ/9ypg=";

    expect(canonicalizeSpawnedByForAgent(cfg, "ops", `Signal:Group:${mixedGroupId}`)).toBe(
      `agent:ops:signal:group:${mixedGroupId}`,
    );
    expect(
      canonicalizeSpawnedByForAgent(cfg, "ops", `Agent:Main:Signal:Group:${mixedGroupId}`),
    ).toBe(`agent:main:signal:group:${mixedGroupId}`);
  });

  test("resolveSessionStoreKey honors global scope", () => {
    const cfg = {
      session: { scope: "global", mainKey: "work" },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    expect(resolveSessionStoreKey({ cfg, sessionKey: "main" })).toBe("global");
    const target = resolveGatewaySessionStoreTarget({ cfg, key: "main" });
    expect(target.canonicalKey).toBe("global");
    expect(target.agentId).toBe("ops");
  });

  test("resolveGatewaySessionStoreTarget uses canonical key for main alias", () => {
    const storeTemplate = path.join(
      os.tmpdir(),
      "openclaw-session-utils",
      "{agentId}",
      "sessions.json",
    );
    const cfg = {
      session: { mainKey: "main", store: storeTemplate },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const target = resolveGatewaySessionStoreTarget({ cfg, key: "main" });
    expect(target.canonicalKey).toBe("agent:ops:main");
    expect(target.storeKeys).toContain("agent:ops:main");
    expect(target.storeKeys).toContain("main");
    expect(target.storePath).toBe(path.resolve(storeTemplate.replace("{agentId}", "ops")));
  });

  test("resolveGatewaySessionStoreTarget includes legacy mixed-case store key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-case-"));
    const storePath = path.join(dir, "sessions.json");
    fs.writeFileSync(
      storePath,
      JSON.stringify({ "agent:ops:MySession": { sessionId: "s1", updatedAt: 1 } }),
      "utf8",
    );
    const cfg = {
      session: { mainKey: "main", store: storePath },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const target = resolveGatewaySessionStoreTarget({ cfg, key: "agent:ops:mysession" });
    expect(target.canonicalKey).toBe("agent:ops:mysession");
    expect(target.storeKeys).toContain("agent:ops:mysession");
    expect(target.storeKeys).toContain("agent:ops:MySession");
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    const found = target.storeKeys.some((k) => Boolean(store[k]));
    expect(found).toBe(true);
  });

  test("resolveGatewaySessionStoreTarget includes all case-variant duplicate keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-dupes-"));
    const storePath = path.join(dir, "sessions.json");
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        "agent:ops:mysession": { sessionId: "s-lower", updatedAt: 2 },
        "agent:ops:MySession": { sessionId: "s-mixed", updatedAt: 1 },
      }),
      "utf8",
    );
    const cfg = {
      session: { mainKey: "main", store: storePath },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const target = resolveGatewaySessionStoreTarget({ cfg, key: "agent:ops:mysession" });
    expect(target.storeKeys).toContain("agent:ops:mysession");
    expect(target.storeKeys).toContain("agent:ops:MySession");
  });

  test("resolveGatewaySessionStoreTarget finds an agent session by native sessionId alias", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-session-id-"));
    const storeTemplate = path.join(dir, "{agentId}", "sessions.json");
    const codingStorePath = path.join(dir, "coding", "sessions.json");
    fs.mkdirSync(path.dirname(codingStorePath), { recursive: true });
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const sessionKey = "agent:coding:phase0z-live-readback-progress-proof";
    fs.writeFileSync(
      codingStorePath,
      JSON.stringify({ [sessionKey]: { sessionId, updatedAt: 2 } }),
      "utf8",
    );
    const cfg = {
      session: { mainKey: "main", store: storeTemplate },
      agents: { list: [{ id: "main", default: true }, { id: "coding" }] },
    } as OpenClawConfig;

    const target = resolveGatewaySessionStoreTarget({
      cfg,
      key: sessionId,
      agentId: "coding",
    });

    expect(target.agentId).toBe("coding");
    expect(target.storePath).toBe(resolveSyncRealpath(codingStorePath));
    expect(target.storeKeys).toContain(sessionId);
    expect(target.storeKeys).toContain(sessionKey);
  });

  test("resolveGatewaySessionStoreTarget finds legacy main alias key when mainKey is customized", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-alias-"));
    const storePath = path.join(dir, "sessions.json");
    fs.writeFileSync(
      storePath,
      JSON.stringify({ "agent:ops:MAIN": { sessionId: "s1", updatedAt: 1 } }),
      "utf8",
    );
    const cfg = {
      session: { mainKey: "work", store: storePath },
      agents: { list: [{ id: "ops", default: true }] },
    } as OpenClawConfig;
    const target = resolveGatewaySessionStoreTarget({ cfg, key: "agent:ops:main" });
    expect(target.canonicalKey).toBe("agent:ops:work");
    expect(target.storeKeys).toContain("agent:ops:MAIN");
  });

  test("resolveGatewaySessionStoreTarget preserves discovered store paths for non-round-tripping agent dirs", async () => {
    await withStateDirEnv("session-utils-discovered-store-", async ({ stateDir }) => {
      const retiredSessionsDir = path.join(stateDir, "agents", "Retired Agent", "sessions");
      fs.mkdirSync(retiredSessionsDir, { recursive: true });
      const retiredStorePath = path.join(retiredSessionsDir, "sessions.json");
      fs.writeFileSync(
        retiredStorePath,
        JSON.stringify({
          "agent:retired-agent:main": { sessionId: "sess-retired", updatedAt: 1 },
        }),
        "utf8",
      );

      const cfg = {
        session: {
          mainKey: "main",
          store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
        },
        agents: { list: [{ id: "main", default: true }] },
      } as OpenClawConfig;

      const target = resolveGatewaySessionStoreTarget({ cfg, key: "agent:retired-agent:main" });

      expect(target.storePath).toBe(resolveSyncRealpath(retiredStorePath));
    });
  });

  test("loadSessionEntry reads discovered stores from non-round-tripping agent dirs", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-entry-", async ({ stateDir }) => {
        const retiredSessionsDir = path.join(stateDir, "agents", "Retired Agent", "sessions");
        fs.mkdirSync(retiredSessionsDir, { recursive: true });
        const retiredStorePath = path.join(retiredSessionsDir, "sessions.json");
        fs.writeFileSync(
          retiredStorePath,
          JSON.stringify({
            "agent:retired-agent:main": { sessionId: "sess-retired", updatedAt: 7 },
          }),
          "utf8",
        );
        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry("agent:retired-agent:main");

        expect(loaded.storePath).toBe(resolveSyncRealpath(retiredStorePath));
        expect(loaded.entry?.sessionId).toBe("sess-retired");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry can borrow the cached store for read-only hot paths", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-entry-borrowed-", async ({ stateDir }) => {
        const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
        fs.mkdirSync(sessionsDir, { recursive: true });
        const storePath = path.join(sessionsDir, "sessions.json");
        fs.writeFileSync(
          storePath,
          JSON.stringify({
            "agent:main:main": { sessionId: "sess-main", updatedAt: 7 },
          }),
          "utf8",
        );
        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry("agent:main:main", { clone: false });
        const borrowedStore = loadSessionStore(loaded.storePath, { clone: false });

        expect(loaded.entry).toBe(borrowedStore["agent:main:main"]);
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry resolves a backing session id alias to the stored session key", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-entry-session-id-alias-", async ({ stateDir }) => {
        const sessionsDir = path.join(stateDir, "agents", "coding", "sessions");
        fs.mkdirSync(sessionsDir, { recursive: true });
        const storePath = path.join(sessionsDir, "sessions.json");
        const sessionId = "77777777-7777-4777-9777-777777777777";
        const sessionKey = "agent:coding:phase0z-readback-session-id-alias";
        fs.writeFileSync(
          storePath,
          JSON.stringify({
            [sessionKey]: { sessionId, updatedAt: 7 },
          }),
          "utf8",
        );
        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }, { id: "coding" }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry(sessionId, { agentId: "coding" });

        expect(loaded.storePath).toBe(resolveSyncRealpath(storePath));
        expect(loaded.canonicalKey).toBe(sessionKey);
        expect(loaded.entry?.sessionId).toBe(sessionId);
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("resolveGatewaySessionStoreTargetWithStore returns the caller-provided store", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-target-store-", async ({ stateDir }) => {
        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }] },
        } as OpenClawConfig;
        const store: Record<string, SessionEntry> = {
          "agent:main:main": { sessionId: "sess-main", updatedAt: 7 },
        };

        const target = resolveGatewaySessionStoreTargetWithStore({
          cfg,
          key: "agent:main:main",
          store,
        });

        expect(target.store).toBe(store);
        expect(target.storeKeys).toContain("agent:main:main");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry preserves a listed deleted main session over the live default main", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-deleted-main-entry-", async ({ stateDir }) => {
        const storeTemplate = path.join(
          stateDir,
          "agents",
          "{agentId}",
          "sessions",
          "sessions.json",
        );
        const liveSessionsDir = path.join(stateDir, "agents", "ops", "sessions");
        const deletedSessionsDir = path.join(stateDir, "agents", "main", "sessions");
        fs.mkdirSync(liveSessionsDir, { recursive: true });
        fs.mkdirSync(deletedSessionsDir, { recursive: true });
        const liveStorePath = path.join(liveSessionsDir, "sessions.json");
        const deletedStorePath = path.join(deletedSessionsDir, "sessions.json");
        fs.writeFileSync(
          liveStorePath,
          JSON.stringify({
            "agent:ops:main": { sessionId: "sess-live-default", updatedAt: 10 },
          }),
          "utf8",
        );
        fs.writeFileSync(
          deletedStorePath,
          JSON.stringify({
            "agent:main:main": { sessionId: "sess-deleted-main", updatedAt: 20 },
          }),
          "utf8",
        );
        const cfg = {
          session: { mainKey: "main", store: storeTemplate },
          agents: { list: [{ id: "ops", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const target = resolveGatewaySessionStoreTarget({ cfg, key: "agent:main:main" });
        const loaded = loadSessionEntry("agent:main:main");

        expect(target.canonicalKey).toBe("agent:main:main");
        expect(target.agentId).toBe("main");
        expect(target.storePath).toBe(resolveSyncRealpath(deletedStorePath));
        expect(loaded.canonicalKey).toBe("agent:main:main");
        expect(loaded.storePath).toBe(resolveSyncRealpath(deletedStorePath));
        expect(loaded.entry?.sessionId).toBe("sess-deleted-main");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry resolves deleted main aliases when mainKey is customized", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-deleted-main-alias-", async ({ stateDir }) => {
        const storeTemplate = path.join(
          stateDir,
          "agents",
          "{agentId}",
          "sessions",
          "sessions.json",
        );
        const liveSessionsDir = path.join(stateDir, "agents", "ops", "sessions");
        const deletedSessionsDir = path.join(stateDir, "agents", "main", "sessions");
        fs.mkdirSync(liveSessionsDir, { recursive: true });
        fs.mkdirSync(deletedSessionsDir, { recursive: true });
        fs.writeFileSync(
          path.join(liveSessionsDir, "sessions.json"),
          JSON.stringify({
            "agent:ops:work": { sessionId: "sess-live-default", updatedAt: 10 },
          }),
          "utf8",
        );
        const deletedStorePath = path.join(deletedSessionsDir, "sessions.json");
        fs.writeFileSync(
          deletedStorePath,
          JSON.stringify({
            "agent:main:main": { sessionId: "sess-deleted-main", updatedAt: 20 },
          }),
          "utf8",
        );
        const cfg = {
          session: { mainKey: "work", store: storeTemplate },
          agents: { list: [{ id: "ops", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry("agent:main:work");

        expect(loaded.canonicalKey).toBe("agent:main:work");
        expect(loaded.storePath).toBe(resolveSyncRealpath(deletedStorePath));
        expect(loaded.entry?.sessionId).toBe("sess-deleted-main");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry prefers the freshest duplicate row for a logical key", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-entry-freshest-", async ({ stateDir }) => {
        const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
        fs.mkdirSync(sessionsDir, { recursive: true });
        const storePath = path.join(sessionsDir, "sessions.json");
        fs.writeFileSync(
          storePath,
          JSON.stringify(
            {
              "agent:main:main": { sessionId: "sess-stale", updatedAt: 1 },
              "agent:main:MAIN": { sessionId: "sess-fresh", updatedAt: 2 },
            },
            null,
            2,
          ),
          "utf8",
        );
        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry("agent:main:main");

        expect(loaded.entry?.sessionId).toBe("sess-fresh");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("loadSessionEntry prefers the freshest duplicate row across discovered stores", async () => {
    resetConfigRuntimeState();
    try {
      await withStateDirEnv("session-utils-load-entry-cross-store-", async ({ stateDir }) => {
        const canonicalSessionsDir = path.join(stateDir, "agents", "main", "sessions");
        fs.mkdirSync(canonicalSessionsDir, { recursive: true });
        fs.writeFileSync(
          path.join(canonicalSessionsDir, "sessions.json"),
          JSON.stringify(
            {
              "agent:main:main": { sessionId: "sess-canonical-stale", updatedAt: 10 },
              "agent:main:MAIN": { sessionId: "sess-canonical-fresh", updatedAt: 1000 },
            },
            null,
            2,
          ),
          "utf8",
        );

        const discoveredSessionsDir = path.join(stateDir, "agents", "main ", "sessions");
        fs.mkdirSync(discoveredSessionsDir, { recursive: true });
        fs.writeFileSync(
          path.join(discoveredSessionsDir, "sessions.json"),
          JSON.stringify(
            {
              "agent:main:main": { sessionId: "sess-discovered-mid", updatedAt: 500 },
            },
            null,
            2,
          ),
          "utf8",
        );

        const cfg = {
          session: {
            mainKey: "main",
            store: path.join(stateDir, "agents", "{agentId}", "sessions", "sessions.json"),
          },
          agents: { list: [{ id: "main", default: true }] },
        } as OpenClawConfig;
        setRuntimeConfigSnapshot(cfg, cfg);

        const loaded = loadSessionEntry("agent:main:main");

        expect(loaded.entry?.sessionId).toBe("sess-canonical-fresh");
      });
    } finally {
      resetConfigRuntimeState();
    }
  });

  test("pruneLegacyStoreKeys removes alias and case-variant ghost keys", () => {
    const store: Record<string, unknown> = {
      "agent:ops:work": { sessionId: "canonical", updatedAt: 3 },
      "agent:ops:MAIN": { sessionId: "legacy-upper", updatedAt: 1 },
      "agent:ops:Main": { sessionId: "legacy-mixed", updatedAt: 2 },
      "agent:ops:main": { sessionId: "legacy-lower", updatedAt: 4 },
    };
    pruneLegacyStoreKeys({
      store,
      canonicalKey: "agent:ops:work",
      candidates: ["agent:ops:work", "agent:ops:main"],
    });
    expect(Object.keys(store).toSorted()).toEqual(["agent:ops:work"]);
  });

  test("migrateAndPruneGatewaySessionStoreKey promotes the freshest duplicate row", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "main", default: true }] },
    } as OpenClawConfig;
    const store: Record<string, SessionEntry> = {
      "agent:main:Main": {
        sessionId: "sess-stale",
        updatedAt: 1,
      } as SessionEntry,
      "agent:main:MAIN": {
        sessionId: "sess-fresh",
        updatedAt: 2,
      } as SessionEntry,
    };

    const result = migrateAndPruneGatewaySessionStoreKey({
      cfg,
      key: "agent:main:main",
      store,
    });

    expect(result.primaryKey).toBe("agent:main:main");
    expect(result.entry?.sessionId).toBe("sess-fresh");
    expect(store["agent:main:main"]?.sessionId).toBe("sess-fresh");
    expect(store["agent:main:MAIN"]).toBeUndefined();
    expect(store["agent:main:Main"]).toBeUndefined();
  });

  test("migrateAndPruneGatewaySessionStoreKey replaces a stale canonical row with a fresher duplicate", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: { list: [{ id: "main", default: true }] },
    } as OpenClawConfig;
    const store: Record<string, SessionEntry> = {
      "agent:main:main": {
        sessionId: "sess-stale",
        updatedAt: 1,
      } as SessionEntry,
      "agent:main:MAIN": {
        sessionId: "sess-fresh",
        updatedAt: 2,
      } as SessionEntry,
    };

    const result = migrateAndPruneGatewaySessionStoreKey({
      cfg,
      key: "agent:main:main",
      store,
    });

    expect(result.primaryKey).toBe("agent:main:main");
    expect(result.entry?.sessionId).toBe("sess-fresh");
    expect(store["agent:main:main"]?.sessionId).toBe("sess-fresh");
    expect(store["agent:main:MAIN"]).toBeUndefined();
  });

  test("listAgentsForGateway rejects avatar symlink escapes outside workspace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-avatar-outside-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(workspace, { recursive: true });
    const outsideFile = path.join(root, "outside.txt");
    fs.writeFileSync(outsideFile, "top-secret", "utf8");
    const linkPath = path.join(workspace, "avatar-link.png");
    if (!createSymlinkOrSkip(outsideFile, linkPath)) {
      return;
    }

    const cfg = createSingleAgentAvatarConfig(workspace);

    const result = listAgentsForGateway(cfg);
    expect(result.agents[0]?.identity?.avatarUrl).toBeUndefined();
  });

  test("listAgentsForGateway allows avatar symlinks that stay inside workspace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-utils-avatar-inside-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "avatars"), { recursive: true });
    const targetPath = path.join(workspace, "avatars", "actual.png");
    fs.writeFileSync(targetPath, "avatar", "utf8");
    const linkPath = path.join(workspace, "avatar-link.png");
    if (!createSymlinkOrSkip(targetPath, linkPath)) {
      return;
    }

    const cfg = createSingleAgentAvatarConfig(workspace);

    const result = listAgentsForGateway(cfg);
    expect(result.agents[0]?.identity?.avatarUrl).toBe(
      `data:image/png;base64,${Buffer.from("avatar").toString("base64")}`,
    );
  });

  test("listAgentsForGateway falls back to identity.name when name is unset", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        list: [{ id: "main", default: true, identity: { name: "开发助手" } }],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);

    expect(result.agents[0]).toMatchObject({
      id: "main",
      name: "开发助手",
      identity: { name: "开发助手" },
    });
  });

  test("listAgentsForGateway prefers explicit name over identity.name", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        list: [
          {
            id: "main",
            default: true,
            name: "Ops",
            identity: { name: "开发助手" },
          },
        ],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);

    expect(result.agents[0]).toMatchObject({
      id: "main",
      name: "Ops",
      identity: { name: "开发助手" },
    });
  });

  test("listAgentsForGateway leaves name unset when both configured and identity names are absent", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        list: [{ id: "main", default: true, identity: {} }],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);

    expect(result.agents[0]).toMatchObject({
      id: "main",
      name: undefined,
      identity: {},
    });
  });

  test("listAgentsForGateway keeps explicit agents.list scope over disk-only agents (scope boundary)", async () => {
    await withStateDirEnv("openclaw-agent-list-scope-", async ({ stateDir }) => {
      fs.mkdirSync(path.join(stateDir, "agents", "main"), { recursive: true });
      fs.mkdirSync(path.join(stateDir, "agents", "codex"), { recursive: true });

      const cfg = {
        session: { mainKey: "main" },
        agents: { list: [{ id: "main", default: true }] },
      } as OpenClawConfig;

      const { agents } = listAgentsForGateway(cfg);
      expect(agents.map((agent) => agent.id)).toEqual(["main"]);
    });
  });

  test("listAgentsForGateway includes effective workspace + model for default agent", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        defaults: {
          workspace: "/tmp/default-workspace",
          model: {
            primary: "openai/gpt-5.4",
            fallbacks: ["openai/gpt-5.4"],
          },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);
    expectFields(result.agents[0], {
      id: "main",
      workspace: "/tmp/default-workspace",
    });
    expect(result.agents[0]?.model).toEqual({
      primary: "openai/gpt-5.4",
      fallbacks: ["openai/gpt-5.4"],
    });
    expect(result.agents[0]?.agentRuntime).toEqual({
      id: "codex",
      source: "implicit",
    });
  });

  test("listAgentsForGateway reports explicit plugin runtime metadata", () => {
    const cfg = {
      session: { mainKey: "main" },
      models: {
        providers: {
          openai: {
            baseUrl: "https://api.openai.com/v1",
            agentRuntime: { id: "codex" },
            models: [],
          },
        },
      },
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.4" },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);
    expectFields(result.agents[0], {
      id: "main",
    });
    expect(result.agents[0]?.agentRuntime).toEqual({
      id: "codex",
      source: "provider",
    });
  });

  test("listAgentsForGateway respects per-agent fallback override (including explicit empty list)", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.4",
            fallbacks: ["openai/gpt-5.4"],
          },
        },
        list: [
          { id: "main", default: true },
          {
            id: "ops",
            model: {
              primary: "anthropic/claude-opus-4-6",
              fallbacks: [],
            },
          },
        ],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);
    const ops = result.agents.find((agent) => agent.id === "ops");
    expect(ops?.model).toEqual({ primary: "anthropic/claude-opus-4-6" });
  });

  test("listAgentsForGateway reports per-agent thinking defaults from the agent model", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        defaults: {
          model: { primary: "minimax/MiniMax-M2.7" },
          thinkingDefault: "off",
        },
        list: [
          { id: "main", default: true },
          {
            id: "investment-master",
            model: { primary: "deepseek/deepseek-v4-flash" },
            thinkingDefault: "xhigh",
          },
        ],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg);
    const agent = result.agents.find((row) => row.id === "investment-master");

    expect(agent?.model).toEqual({ primary: "deepseek/deepseek-v4-flash" });
    expect(agent?.thinkingDefault).toBe("xhigh");
    expect(agent?.thinkingLevels?.map((level) => level.id)).toEqual(
      expect.arrayContaining(["off", "minimal", "low", "medium", "high", "xhigh"]),
    );
    expect(agent?.thinkingOptions).toEqual(agent?.thinkingLevels?.map((level) => level.label));
  });

  test("listAgentsForGateway uses the model catalog for per-agent thinking metadata", () => {
    const cfg = {
      session: { mainKey: "main" },
      agents: {
        defaults: {
          model: { primary: "local/custom-reasoner" },
        },
        list: [{ id: "main", default: true }],
      },
    } as OpenClawConfig;

    const result = listAgentsForGateway(cfg, [
      { provider: "local", id: "custom-reasoner", name: "Custom Reasoner", reasoning: true },
    ]);
    const agent = result.agents.find((row) => row.id === "main");

    expect(agent?.thinkingDefault).toBe("medium");
    expect(agent?.thinkingLevels?.map((level) => level.id)).toContain("medium");
  });
});

describe("resolveSessionModelRef", () => {
  test("prefers explicit session overrides ahead of runtime model fields", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s1",
      updatedAt: Date.now(),
      modelProvider: "openai",
      model: "gpt-5.4",
      modelOverride: "claude-opus-4-6",
      providerOverride: "anthropic",
    });

    expect(resolved).toEqual({ provider: "anthropic", model: "claude-opus-4-6" });
  });

  test("preserves openrouter provider when model contains vendor prefix", () => {
    const cfg = createModelDefaultsConfig({
      primary: "openrouter/minimax/minimax-m2.7",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s-or",
      updatedAt: Date.now(),
      modelProvider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });

    expect(resolved).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });
  });

  test("falls back to override when runtime model is not recorded yet", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s2",
      updatedAt: Date.now(),
      modelOverride: "openai/gpt-5.4",
    });

    expect(resolved).toEqual({ provider: "openai", model: "gpt-5.4" });
  });

  test("keeps nested model ids under the stored provider override", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s-nested",
      updatedAt: Date.now(),
      providerOverride: "nvidia",
      modelOverride: "moonshotai/kimi-k2.5",
    });

    expect(resolved).toEqual({ provider: "nvidia", model: "moonshotai/kimi-k2.5" });
  });

  test("preserves explicit wrapper providers for vendor-prefixed override models", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s-openrouter-override",
      updatedAt: Date.now(),
      providerOverride: "openrouter",
      modelOverride: "anthropic/claude-haiku-4.5",
      modelProvider: "openrouter",
      model: "openrouter/free",
    });

    expect(resolved).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-haiku-4.5",
    });
  });

  test("strips a duplicated provider prefix from stored overrides", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "s-qualified-override",
      updatedAt: Date.now(),
      providerOverride: "openai",
      modelOverride: "openai/gpt-5.4",
    });

    expect(resolved).toEqual({ provider: "openai", model: "gpt-5.4" });
  });

  test("falls back to resolved provider for unprefixed legacy runtime model", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "legacy-session",
      updatedAt: Date.now(),
      model: "claude-sonnet-4-6",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({
      provider: "google-gemini-cli",
      model: "claude-sonnet-4-6",
    });
  });

  test("preserves provider from slash-prefixed model when modelProvider is missing", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });

    const resolved = resolveSessionModelRef(cfg, {
      sessionId: "slash-model",
      updatedAt: Date.now(),
      model: "anthropic/claude-sonnet-4-6",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({ provider: "anthropic", model: "claude-sonnet-4-6" });
  });
});

describe("listSessionsFromStore selected model display", () => {
  test("async list yields during bulk transcript title and last-message hydration", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-sessions-list-yield-"));
    try {
      const storePath = path.join(tmpDir, "sessions.json");
      const store: Record<string, SessionEntry> = {};
      const now = Date.now();
      for (let i = 0; i < 11; i += 1) {
        const sessionId = `sess-yield-${i}`;
        store[`agent:main:${sessionId}`] = {
          sessionId,
          updatedAt: now - i,
          modelProvider: "openai",
          model: "gpt-5.4",
          totalTokens: 1,
          totalTokensFresh: true,
          contextTokens: 1,
          estimatedCostUsd: 0,
        } as SessionEntry;
        fs.writeFileSync(
          path.join(tmpDir, `${sessionId}.jsonl`),
          [
            JSON.stringify({ type: "session", version: 1, id: sessionId }),
            JSON.stringify({ message: { role: "user", content: `title ${i}` } }),
            JSON.stringify({ message: { role: "assistant", content: `last ${i}` } }),
          ].join("\n"),
          "utf-8",
        );
      }

      const params = {
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
        storePath,
        store,
        opts: { includeDerivedTitles: true, includeLastMessage: true, limit: 11 },
      };
      const expected = listSessionsFromStore(params);
      const listedPromise = listSessionsFromStoreAsync(params);
      let settled = false;
      void listedPromise.then(() => {
        settled = true;
      });

      await Promise.resolve();

      expect(settled).toBe(false);
      const listed = await listedPromise;
      expect(listed.path).toBe(expected.path);
      expect(listed.count).toBe(expected.count);
      expect(listed.defaults).toEqual(expected.defaults);
      expect(listed.sessions).toHaveLength(expected.sessions.length);
      expectFields(listed.sessions[0], {
        key: "agent:main:sess-yield-0",
        derivedTitle: "title 0",
        lastMessagePreview: "last 0",
      });
      expect(listed.sessions[0]?.agentRuntime).toEqual({ id: "codex", source: "implicit" });
      expect(listed.sessions[0]?.thinkingLevel).toBeUndefined();
      expect(listed.sessions[0]?.thinkingLevels?.length).toBeGreaterThan(0);
      expect(listed.sessions[0]?.thinkingOptions?.length).toBeGreaterThan(0);
      expect(listed.sessions[0]?.thinkingDefault).toBe("off");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("caps transcript title and last-message hydration for bulk list responses", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-sessions-list-cap-"));
    try {
      const storePath = path.join(tmpDir, "sessions.json");
      const store: Record<string, SessionEntry> = {};
      const now = Date.now();
      for (let i = 0; i < 101; i += 1) {
        const sessionId = `sess-${i}`;
        store[`agent:main:${sessionId}`] = {
          sessionId,
          updatedAt: now - i,
          modelProvider: "openai",
          model: "gpt-5.4",
        } as SessionEntry;
        if (i === 0 || i === 99 || i === 100) {
          fs.writeFileSync(
            path.join(tmpDir, `${sessionId}.jsonl`),
            [
              JSON.stringify({ type: "session", version: 1, id: sessionId }),
              JSON.stringify({ message: { role: "user", content: `title ${i}` } }),
              JSON.stringify({ message: { role: "assistant", content: `last ${i}` } }),
            ].join("\n"),
            "utf-8",
          );
        }
      }

      const result = await listSessionsFromStoreAsync({
        cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
        storePath,
        store,
        opts: { includeDerivedTitles: true, includeLastMessage: true, limit: 101 },
      });

      expect(result.sessions).toHaveLength(101);
      expect(result.sessions[0]?.derivedTitle).toBe("title 0");
      expect(result.sessions[0]?.lastMessagePreview).toBe("last 0");
      expect(result.sessions[99]?.derivedTitle).toBe("title 99");
      expect(result.sessions[99]?.lastMessagePreview).toBe("last 99");
      expect(result.sessions[100]?.derivedTitle).toBeUndefined();
      expect(result.sessions[100]?.lastMessagePreview).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("uses bounded top-N selection for small limited lists", () => {
    const now = Date.now();
    const store: Record<string, SessionEntry> = {
      "agent:main:old": { sessionId: "old", updatedAt: now - 10_000 } as SessionEntry,
      "agent:main:newest": { sessionId: "newest", updatedAt: now } as SessionEntry,
      "agent:main:middle-a": { sessionId: "middle-a", updatedAt: now - 5_000 } as SessionEntry,
      "agent:main:middle-b": { sessionId: "middle-b", updatedAt: now - 5_000 } as SessionEntry,
      "agent:main:newer": { sessionId: "newer", updatedAt: now - 1_000 } as SessionEntry,
    };
    const result = listSessionsFromStore({
      cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
      storePath: "/tmp/sessions.json",
      store,
      opts: { limit: 4 },
    });

    expect(result.sessions.map((session) => session.key)).toEqual([
      "agent:main:newest",
      "agent:main:newer",
      "agent:main:middle-a",
      "agent:main:middle-b",
    ]);
  });

  test("keeps the scoped global row when filtering by agent", () => {
    const now = Date.now();
    const result = listSessionsFromStore({
      cfg: {
        ...createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
        agents: {
          defaults: { model: { primary: "openai/gpt-5.4" } },
          list: [
            { id: "main", default: true, model: { primary: "openai/gpt-5.4" } },
            { id: "work", model: { primary: "anthropic/claude-opus-4-6" } },
          ],
        },
      } as OpenClawConfig,
      storePath: "/tmp/sessions.json",
      store: {
        global: { sessionId: "global", updatedAt: now } as SessionEntry,
        "agent:main:main": { sessionId: "main", updatedAt: now - 1 } as SessionEntry,
        "agent:work:main": { sessionId: "work", updatedAt: now - 2 } as SessionEntry,
      },
      opts: { agentId: "work", includeGlobal: true, search: "global" },
    });

    expect(result.sessions.map((session) => session.key)).toEqual(["global"]);
    expect(result.sessions[0]).toMatchObject({
      modelProvider: "anthropic",
      model: "claude-opus-4-6",
    });
  });

  test("filters phantom agent store placeholder rows from session lists", () => {
    const now = Date.now();
    const result = listSessionsFromStore({
      cfg: createModelDefaultsConfig({ primary: "openai/gpt-5.4" }),
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:sessions": {} as SessionEntry,
        "agent:main:main": { sessionId: "sess-main", updatedAt: now } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions.map((session) => session.key)).toEqual(["agent:main:main"]);
  });

  test("shows the selected override model even when a fallback runtime model exists", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-6",
    });

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
          providerOverride: "anthropic",
          modelOverride: "claude-opus-4-6",
          modelProvider: "openai",
          model: "gpt-5.4",
        } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe("anthropic");
    expect(result.sessions[0]?.model).toBe("claude-opus-4-6");
  });

  test("separates Claude CLI runtime metadata from canonical model identity", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-7",
      agentRuntime: { id: "claude-cli" },
    });

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
          modelProvider: "claude-cli",
          model: "claude-opus-4-7",
        } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe("anthropic");
    expect(result.sessions[0]?.model).toBe("claude-opus-4-7");
    expect(result.sessions[0]?.agentRuntime).toEqual({
      id: "claude-cli",
      source: "model",
    });
  });

  test("infers canonical provider for bare CLI models before default-provider fallback", () => {
    const cfg = createModelDefaultsConfig({
      primary: "openai/gpt-5.4",
      models: {
        "anthropic/claude-opus-4-7": {},
      },
      agentRuntime: { id: "claude-cli" },
    });

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
          modelProvider: "claude-cli",
          model: "claude-opus-4-7",
        } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe("anthropic");
    expect(result.sessions[0]?.model).toBe("claude-opus-4-7");
  });

  test("uses qualified selected defaults for rows without runtime model metadata", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.4" },
          models: {
            "anthropic/claude-sonnet-4-6": { alias: "sonnet" },
          },
        },
        list: [
          { id: "main", model: { primary: "anthropic/claude-sonnet-4-6" } },
          {
            id: "review",
            model: { primary: "vercel-ai-gateway/anthropic/claude-haiku-4-5" },
          },
          { id: "alias", model: { primary: "anthropic/sonnet-4.6" } },
        ],
      },
    } as OpenClawConfig;

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: 2,
        } as SessionEntry,
        "agent:review:review": {
          sessionId: "sess-review",
          updatedAt: 1,
        } as SessionEntry,
        "agent:alias:alias": {
          sessionId: "sess-alias",
          updatedAt: 0,
        } as SessionEntry,
      },
      opts: {},
    });

    expect(
      result.sessions.map((session) => [session.key, session.modelProvider, session.model]),
    ).toEqual([
      ["agent:main:main", "anthropic", "claude-sonnet-4-6"],
      ["agent:review:review", "vercel-ai-gateway", "anthropic/claude-haiku-4-5"],
      ["agent:alias:alias", "anthropic", "claude-sonnet-4-6"],
    ]);
  });

  test("uses persisted runtime model metadata before selected defaults", () => {
    const cfg = {
      agents: {
        defaults: { model: { primary: "openai/gpt-5.4" } },
        list: [{ id: "main", model: { primary: "anthropic/claude-sonnet-4-6" } }],
      },
    } as OpenClawConfig;

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
          modelProvider: "openai",
          model: "gpt-5.5",
        } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe("openai");
    expect(result.sessions[0]?.model).toBe("gpt-5.5");
  });

  test("uses complete model overrides without default-model fallback", () => {
    const cfg = {
      agents: {
        defaults: { model: { primary: "openai/gpt-5.4" } },
        list: [{ id: "main", model: { primary: "anthropic/claude-sonnet-4-6" } }],
      },
    } as OpenClawConfig;

    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
          providerOverride: "anthropic",
          modelOverride: "sonnet-4.6",
        } as SessionEntry,
      },
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe("anthropic");
    expect(result.sessions[0]?.model).toBe("claude-sonnet-4-6");
  });
});

describe("resolveSessionModelIdentityRef", () => {
  const resolveLegacyIdentityRef = (cfg: OpenClawConfig, modelProvider?: string) =>
    resolveSessionModelIdentityRef(cfg, {
      sessionId: "legacy-session",
      updatedAt: Date.now(),
      model: "claude-sonnet-4-6",
      modelProvider,
    });

  test("does not inherit default provider for unprefixed legacy runtime model", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });

    const resolved = resolveLegacyIdentityRef(cfg);

    expect(resolved).toEqual({ model: "claude-sonnet-4-6" });
  });

  test("infers provider from configured model allowlist when unambiguous", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
      models: {
        "anthropic/claude-sonnet-4-6": {},
      },
    });

    const resolved = resolveLegacyIdentityRef(cfg);

    expect(resolved).toEqual({ provider: "anthropic", model: "claude-sonnet-4-6" });
  });

  test("infers provider from configured provider catalogs when allowlist is absent", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });
    cfg.models = {
      providers: {
        "qwen-dashscope": {
          models: [{ id: "qwen-max" }],
        },
      },
    } as unknown as OpenClawConfig["models"];

    const resolved = resolveSessionModelIdentityRef(cfg, {
      sessionId: "custom-provider-runtime-model",
      updatedAt: Date.now(),
      model: "qwen-max",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({ provider: "qwen-dashscope", model: "qwen-max" });
  });

  test("keeps provider unknown when configured models are ambiguous", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
      models: {
        "anthropic/claude-sonnet-4-6": {},
        "minimax/claude-sonnet-4-6": {},
      },
    });

    const resolved = resolveLegacyIdentityRef(cfg);

    expect(resolved).toEqual({ model: "claude-sonnet-4-6" });
  });

  test("keeps provider unknown when configured provider catalog matches are ambiguous", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });
    cfg.models = {
      providers: {
        "qwen-dashscope": {
          models: [{ id: "qwen-max" }],
        },
        qwen: {
          models: [{ id: "qwen-max" }],
        },
      },
    } as unknown as OpenClawConfig["models"];

    const resolved = resolveSessionModelIdentityRef(cfg, {
      sessionId: "ambiguous-custom-provider-runtime-model",
      updatedAt: Date.now(),
      model: "qwen-max",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({ model: "qwen-max" });
  });

  test("preserves provider from slash-prefixed runtime model", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
    });

    const resolved = resolveSessionModelIdentityRef(cfg, {
      sessionId: "slash-model",
      updatedAt: Date.now(),
      model: "anthropic/claude-sonnet-4-6",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({ provider: "anthropic", model: "claude-sonnet-4-6" });
  });

  test("infers wrapper provider for slash-prefixed runtime model when allowlist match is unique", () => {
    const cfg = createModelDefaultsConfig({
      primary: "google-gemini-cli/gemini-3.1-pro-preview",
      models: {
        "vercel-ai-gateway/anthropic/claude-sonnet-4-6": {},
      },
    });

    const resolved = resolveSessionModelIdentityRef(cfg, {
      sessionId: "slash-model",
      updatedAt: Date.now(),
      model: "anthropic/claude-sonnet-4-6",
      modelProvider: undefined,
    });

    expect(resolved).toEqual({
      provider: "vercel-ai-gateway",
      model: "anthropic/claude-sonnet-4-6",
    });
  });
});

describe("resolveSessionDisplayModelIdentityRef", () => {
  test("canonicalizes CLI runtime provider to the selected model provider", () => {
    const cfg = createModelDefaultsConfig({
      primary: "anthropic/claude-opus-4-7",
      agentRuntime: { id: "claude-cli" },
    });

    expect(
      resolveSessionDisplayModelIdentityRef({
        cfg,
        agentId: "main",
        provider: "claude-cli",
        model: "claude-opus-4-7",
      }),
    ).toEqual({ provider: "anthropic", model: "claude-opus-4-7" });
  });

  test("prefers configured provider inference over default-provider parsing for bare CLI models", () => {
    const cfg = createModelDefaultsConfig({
      primary: "openai/gpt-5.4",
      models: {
        "anthropic/claude-opus-4-7": {},
      },
      agentRuntime: { id: "claude-cli" },
    });

    expect(
      resolveSessionDisplayModelIdentityRef({
        cfg,
        agentId: "main",
        provider: "claude-cli",
        model: "claude-opus-4-7",
      }),
    ).toEqual({ provider: "anthropic", model: "claude-opus-4-7" });
  });
});

describe("deriveSessionTitle", () => {
  test("returns undefined for undefined entry", () => {
    expect(deriveSessionTitle(undefined)).toBeUndefined();
  });

  test("prefers displayName when set", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "My Custom Session",
      subject: "Group Chat",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("My Custom Session");
  });

  test("falls back to subject when displayName is missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      subject: "Dev Team Chat",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Dev Team Chat");
  });

  test("uses first user message when displayName and subject missing", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    expect(deriveSessionTitle(entry, "Hello, how are you?")).toBe("Hello, how are you?");
  });

  test("truncates long first user message to 60 chars with ellipsis", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    const longMsg =
      "This is a very long message that exceeds sixty characters and should be truncated appropriately";
    const result = requireString(deriveSessionTitle(entry, longMsg), "truncated session title");
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("…")).toBe(true);
  });

  test("truncates at word boundary when possible", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
    } as SessionEntry;
    const longMsg = "This message has many words and should be truncated at a word boundary nicely";
    const result = requireString(deriveSessionTitle(entry, longMsg), "word-boundary session title");
    expect(result.endsWith("…")).toBe(true);
    expect(result.includes("  ")).toBe(false);
  });

  test("falls back to sessionId prefix with date", () => {
    const entry = {
      sessionId: "abcd1234-5678-90ef-ghij-klmnopqrstuv",
      updatedAt: new Date("2024-03-15T10:30:00Z").getTime(),
    } as SessionEntry;
    const result = deriveSessionTitle(entry);
    expect(result).toBe("abcd1234 (2024-03-15)");
  });

  test("falls back to sessionId prefix without date when updatedAt missing", () => {
    const entry = {
      sessionId: "abcd1234-5678-90ef-ghij-klmnopqrstuv",
      updatedAt: 0,
    } as SessionEntry;
    const result = deriveSessionTitle(entry);
    expect(result).toBe("abcd1234");
  });

  test("trims whitespace from displayName", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "  Padded Name  ",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Padded Name");
  });

  test("ignores empty displayName and falls through", () => {
    const entry = {
      sessionId: "abc123",
      updatedAt: Date.now(),
      displayName: "   ",
      subject: "Actual Subject",
    } as SessionEntry;
    expect(deriveSessionTitle(entry)).toBe("Actual Subject");
  });
});

describe("resolveGatewayModelSupportsImages", () => {
  test("keeps Foundry GPT deployments image-capable even when stale catalog metadata says text-only", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "gpt-5.4",
        provider: "microsoft-foundry",
        loadGatewayModelCatalog: async () => [
          { id: "gpt-5.4", name: "GPT-5.4", provider: "microsoft-foundry", input: ["text"] },
        ],
      }),
    ).resolves.toBe(true);
  });

  test("uses the preserved Foundry model name hint for alias deployments with stale text-only input metadata", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "deployment-gpt5",
        provider: "microsoft-foundry",
        loadGatewayModelCatalog: async () => [
          {
            id: "deployment-gpt5",
            name: "gpt-5.4",
            provider: "microsoft-foundry",
            input: ["text"],
          },
        ],
      }),
    ).resolves.toBe(true);
  });

  test("treats claude-cli Claude models as image-capable even when catalog metadata is stale or missing", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "claude-sonnet-4-6",
        provider: "claude-cli",
        loadGatewayModelCatalog: async () => [
          {
            id: "claude-sonnet-4-6",
            name: "Claude Sonnet 4.6",
            provider: "claude-cli",
            input: ["text"],
          },
        ],
      }),
    ).resolves.toBe(true);
  });

  test("matches catalog model ids case-insensitively for explicit providers", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "Qwen/Qwen3.5-35B-A3B",
        provider: "modelscope",
        loadGatewayModelCatalog: async () => [
          {
            id: "qwen/qwen3.5-35b-a3b",
            name: "Qwen3.5 35B",
            provider: "modelscope",
            input: ["text", "image"],
          },
        ],
      }),
    ).resolves.toBe(true);
  });

  test("does not borrow image support from another provider when provider is explicit", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "gpt-4",
        provider: "openai",
        loadGatewayModelCatalog: async () => [
          { id: "gpt-4", name: "GPT-4", provider: "other", input: ["text", "image"] },
        ],
      }),
    ).resolves.toBe(false);
  });

  test("uses a unique providerless catalog match", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "Qwen/Qwen3.5-35B-A3B",
        loadGatewayModelCatalog: async () => [
          {
            id: "qwen/qwen3.5-35b-a3b",
            name: "Qwen3.5 35B",
            provider: "modelscope",
            input: ["text", "image"],
          },
        ],
      }),
    ).resolves.toBe(true);
  });

  test("fails closed on ambiguous providerless catalog matches", async () => {
    await expect(
      resolveGatewayModelSupportsImages({
        model: "shared-vision",
        loadGatewayModelCatalog: async () => [
          { id: "shared-vision", name: "Shared Vision", provider: "first", input: ["text"] },
          {
            id: "shared-vision",
            name: "Shared Vision",
            provider: "second",
            input: ["text", "image"],
          },
        ],
      }),
    ).resolves.toBe(false);
  });
});
