// Sessions command tests cover listing, details, filtering, and transcript display behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeRuntime,
  mockSessionsConfig,
  resetMockSessionsConfig,
  runSessionsJson,
  setMockSessionsConfig,
  writeStore,
} from "./sessions.test-helpers.js";

// Disable colors for deterministic snapshots.
process.env.FORCE_COLOR = "0";

mockSessionsConfig();

import { sessionsCommand, sessionsShowCommand, testing } from "./sessions.js";

describe("sessionsCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-06T00:00:00Z"));
  });

  afterEach(() => {
    resetMockSessionsConfig();
    vi.useRealTimers();
  });

  it("renders a tabular view with token percentages", async () => {
    const store = writeStore({
      "+15555550123": {
        sessionId: "abc123",
        updatedAt: Date.now() - 45 * 60_000,
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 2000,
        totalTokensFresh: true,
        model: "test:opus",
      },
    });

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store }, runtime);

    fs.rmSync(store);

    expect(logs.join("\n")).toContain("Tokens (ctx %");

    const row = logs.find((line) => line.includes("+15555550123")) ?? "";
    expect(row).toBe(
      "direct      +15555550123               45m ago   test:opus      OpenAI Codex       2.0k/32k (6%)        id:abc123",
    );
  });

  it("renders the agent runtime in the tabular view", async () => {
    setMockSessionsConfig(() => ({
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-7" },
          models: {
            "anthropic/claude-opus-4-7": { agentRuntime: { id: "claude-cli" } },
          },
          contextTokens: 200_000,
        },
      },
    }));
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId: "main-session",
          updatedAt: Date.now() - 60_000,
          modelProvider: "claude-cli",
          model: "claude-opus-4-7",
        },
      },
      "sessions-runtime-table",
    );

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store }, runtime);

    fs.rmSync(store);

    expect(logs.join("\n")).toContain("Runtime");

    const row = logs.find((line) => line.includes("agent:main:main")) ?? "";
    expect(row).toBe(
      "direct      agent:main:main            1m ago    claude-opus-4-7 Claude CLI         unknown/200k (?%)    id:main-session",
    );
  });

  it("renders configured CLI runtime when the session stores a canonical provider", async () => {
    setMockSessionsConfig(() => ({
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-opus-4-7" },
          models: {
            "anthropic/claude-opus-4-7": { agentRuntime: { id: "claude-cli" } },
          },
          contextTokens: 200_000,
        },
      },
    }));
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId: "main-session",
          updatedAt: Date.now() - 60_000,
          modelProvider: "anthropic",
          model: "claude-opus-4-7",
        },
      },
      "sessions-runtime-canonical-provider",
    );

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store }, runtime);

    fs.rmSync(store);

    const row = logs.find((line) => line.includes("agent:main:main")) ?? "";
    expect(row).toBe(
      "direct      agent:main:main            1m ago    claude-opus-4-7 Claude CLI         unknown/200k (?%)    id:main-session",
    );
  });

  it("shows placeholder rows when tokens are missing", async () => {
    const store = writeStore({
      "quietchat:group:demo": {
        sessionId: "xyz",
        updatedAt: Date.now() - 5 * 60_000,
        thinkingLevel: "high",
      },
    });

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store }, runtime);

    fs.rmSync(store);

    const row = logs.find((line) => line.includes("quietchat:group:demo")) ?? "";
    expect(row).toBe(
      "group       quietchat:group:demo       5m ago    test:opus      OpenAI Codex       unknown/32k (?%)     think:high id:xyz",
    );
  });

  it("uses native child session lineage for active session list filtering without mutating store updatedAt", async () => {
    const staleUpdatedAt = Date.now() - 30 * 60_000;
    const childActivityAt = Date.now() - 60_000;
    const store = writeStore({
      "agent:main:main": {
        sessionId: "main-session",
        updatedAt: staleUpdatedAt,
        modelProvider: "openai",
        model: "gpt-5.5",
      },
      "agent:planning:main": {
        sessionId: "planning-session",
        spawnedBy: "agent:main:main",
        updatedAt: childActivityAt,
        modelProvider: "openai",
        model: "gpt-5.5",
      },
    });

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store, json: true, active: "5", limit: "all" }, runtime);

    fs.rmSync(store);

    const payload = JSON.parse(logs[0] ?? "{}") as {
      sessions?: Array<{
        key?: string;
        updatedAt?: number;
        activityUpdatedAt?: number | null;
      }>;
    };
    expect(payload.sessions?.map((session) => session.key)).toContain("agent:main:main");
    const parentSession = payload.sessions?.find((session) => session.key === "agent:main:main");
    expect(parentSession).toMatchObject({
      updatedAt: staleUpdatedAt,
      activityUpdatedAt: childActivityAt,
    });
  });

  it("projects done status for ended lightweight list rows without final text details", async () => {
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId: "main-ended-session",
          updatedAt: Date.now() - 60_000,
          endedAt: Date.now() - 30_000,
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      },
      "sessions-list-ended-status",
    );

    const payload = await runSessionsJson<{
      sessions?: Array<{
        key?: string;
        status?: string | null;
        finalAssistantText?: string | null;
        readbackProvenance?: {
          status?: { source?: string; note?: string };
        };
      }>;
    }>(sessionsCommand, store, { limit: "all" });

    const row = payload.sessions?.find((session) => session.key === "agent:main:main");
    expect(row).toMatchObject({
      status: "done",
    });
    expect(row?.finalAssistantText).toBeUndefined();
    expect(row?.readbackProvenance?.status).toMatchObject({
      source: "session-store",
      note: "session-store status missing; endedAt marks the session terminal",
    });
  });

  it("uses native trajectory progress for session list display freshness without mutating updatedAt", async () => {
    const staleUpdatedAt = Date.now() - 30 * 60_000;
    const observedAt = Date.parse("2025-12-05T23:59:30.000Z");
    const sessionId = "main-trajectory-list-session";
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId,
          updatedAt: staleUpdatedAt,
          status: "running",
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      },
      "sessions-list-trajectory-freshness",
    );
    const trajectory = path.join(path.dirname(store), `${sessionId}.trajectory.jsonl`);
    fs.writeFileSync(
      trajectory,
      [
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          sessionId,
          type: "agent.tool",
          ts: "2025-12-05T23:59:30.000Z",
          seq: 4,
          sourceSeq: 12,
          data: {
            phase: "start",
            name: "task",
            title: "Task",
            summary: "waiting on Planning child",
          },
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store, json: true, active: "5", limit: "all" }, runtime);

    fs.rmSync(store, { force: true });
    fs.rmSync(trajectory, { force: true });

    const payload = JSON.parse(logs[0] ?? "{}") as {
      sessions?: Array<{
        key?: string;
        updatedAt?: number;
        activityUpdatedAt?: number | null;
        lastObservedActivityAt?: number | null;
        lastObservedActivitySource?: string;
      }>;
    };
    const parentSession = payload.sessions?.find((session) => session.key === "agent:main:main");
    expect(parentSession).toMatchObject({
      updatedAt: staleUpdatedAt,
      activityUpdatedAt: observedAt,
      lastObservedActivityAt: observedAt,
      lastObservedActivitySource: "own",
    });
  });

  it("does not need task registry readback for session listing", async () => {
    const store = writeStore({
      "agent:main:main": {
        sessionId: "main-session",
        updatedAt: Date.now() - 60_000,
        modelProvider: "openai",
        model: "gpt-5.5",
      },
    });

    const { runtime, logs } = makeRuntime();
    await sessionsCommand({ store, json: true, active: "5" }, runtime);

    fs.rmSync(store);

    const payload = JSON.parse(logs[0] ?? "{}") as {
      sessions?: Array<{ key?: string; activityUpdatedAt?: number | null }>;
    };
    expect(payload.sessions?.[0]).toMatchObject({
      key: "agent:main:main",
      activityUpdatedAt: null,
    });
  });

  it("exports freshness metadata in JSON output", async () => {
    const store = writeStore({
      main: {
        sessionId: "abc123",
        updatedAt: Date.now() - 10 * 60_000,
        inputTokens: 1200,
        outputTokens: 800,
        totalTokens: 2000,
        totalTokensFresh: true,
        model: "test:opus",
      },
      "quietchat:group:demo": {
        sessionId: "xyz",
        updatedAt: Date.now() - 5 * 60_000,
        inputTokens: 20,
        outputTokens: 10,
        model: "test:opus",
      },
    });

    const payload = await runSessionsJson<{
      sessions?: Array<{
        key: string;
        totalTokens: number | null;
        totalTokensFresh: boolean;
      }>;
    }>(sessionsCommand, store);
    const main = payload.sessions?.find((row) => row.key === "main");
    const group = payload.sessions?.find((row) => row.key === "quietchat:group:demo");
    expect(main?.totalTokens).toBe(2000);
    expect(main?.totalTokensFresh).toBe(true);
    expect(group?.totalTokens).toBeNull();
    expect(group?.totalTokensFresh).toBe(false);
  });

  it("shows preserved stale totals in JSON output", async () => {
    const store = writeStore({
      main: {
        sessionId: "abc123",
        updatedAt: Date.now() - 10 * 60_000,
        totalTokens: 2000,
        totalTokensFresh: false,
        model: "test:opus",
      },
    });

    const payload = await runSessionsJson<{
      sessions?: Array<{
        key: string;
        totalTokens: number | null;
        totalTokensFresh: boolean;
      }>;
    }>(sessionsCommand, store);
    const main = payload.sessions?.find((row) => row.key === "main");
    expect(main?.totalTokens).toBe(2000);
    expect(main?.totalTokensFresh).toBe(false);
  });

  it("shows final assistant text and child session pointers in native JSON readback", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const store = writeStore(
      {
        "agent:planning:main": {
          sessionId,
          updatedAt: Date.now() - 60_000,
          status: "done",
          endedAt: Date.now() - 30_000,
          modelProvider: "openai",
          model: "gpt-5.5",
        },
        "agent:researcher:subagent:child": {
          sessionId: "22222222-2222-4222-8222-222222222222",
          parentSessionKey: "agent:planning:main",
          spawnedBy: "agent:planning:main",
          updatedAt: Date.now() - 45_000,
          status: "done",
        },
      },
      "sessions-show-compact",
    );
    const transcript = path.join(path.dirname(store), `${sessionId}.jsonl`);
    fs.writeFileSync(
      transcript,
      [
        JSON.stringify({
          message: {
            role: "user",
            content: "Improve the planning layer.",
          },
        }),
        JSON.stringify({
          message: {
            role: "assistant",
            content: "Final recursive planning improvement synthesized.",
          },
        }),
      ].join("\n"),
    );

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          store,
          sessionKey: "agent:planning:main",
          json: true,
          agent: "planning",
        },
        runtime,
      );
    } finally {
      fs.rmSync(store, { force: true });
      fs.rmSync(transcript, { force: true });
    }

    const payload = JSON.parse(logs[0] ?? "{}") as {
      key?: string | null;
      sessionKey?: string | null;
      sessionId?: string | null;
      agentId?: string;
      finalAssistantText?: string | null;
      session?: {
        key?: string;
        sessionId?: string;
        finalAssistantText?: string | null;
        childSessions?: string[];
      };
    };
    expect(payload.key).toBe("agent:planning:main");
    expect(payload.sessionKey).toBe("agent:planning:main");
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.agentId).toBe("planning");
    expect(payload.session?.key).toBe("agent:planning:main");
    expect(payload.session?.sessionId).toBe(sessionId);
    expect(payload.session?.finalAssistantText).toBe(
      "Final recursive planning improvement synthesized.",
    );
    expect(payload.finalAssistantText).toBe("Final recursive planning improvement synthesized.");
    expect(payload.session?.childSessions).toContain("agent:researcher:subagent:child");
  });

  it("derives final assistant text from transcript even when a later user turn is present", async () => {
    const sessionId = "33333333-3333-4333-8333-333333333333";
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId,
          updatedAt: Date.now() - 60_000,
          status: "done",
          endedAt: Date.now() - 30_000,
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      },
      "sessions-show-final-assistant",
    );
    const transcript = path.join(path.dirname(store), `${sessionId}.jsonl`);
    fs.writeFileSync(
      transcript,
      [
        JSON.stringify({
          message: {
            role: "user",
            content: "Run the approved proof.",
          },
        }),
        JSON.stringify({
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Commentary progress",
                textSignature: JSON.stringify({
                  v: 1,
                  id: "msg_commentary",
                  phase: "commentary",
                }),
              },
              {
                type: "text",
                text: "PHASE0W_FINAL_POSTFIX_PROOF_DONE",
                textSignature: JSON.stringify({
                  v: 1,
                  id: "msg_final",
                  phase: "final_answer",
                }),
              },
            ],
          },
        }),
        JSON.stringify({
          message: {
            role: "user",
            content: "Trailing operator readback request.",
          },
        }),
      ].join("\n"),
    );

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          store,
          sessionKey: "agent:main:main",
          json: true,
          agent: "main",
        },
        runtime,
      );
    } finally {
      fs.rmSync(store, { force: true });
      fs.rmSync(transcript, { force: true });
    }

    const payload = JSON.parse(logs[0] ?? "{}") as {
      sessionKey?: string | null;
      status?: string | null;
      finalAssistantText?: string | null;
      readbackSubject?: {
        scope?: string;
        sessionKey?: string | null;
        agentId?: string | null;
      };
      finality?: {
        status?: string | null;
        finalAssistantTextPresent?: boolean;
        finalAssistantTextChars?: number | null;
        finalAssistantTextDigest?: string | null;
        finalAssistantTextPointer?: string | null;
      };
      readbackProvenance?: {
        finalAssistantText?: {
          source?: string;
          ref?: string;
          derivedBy?: string;
          bounded?: boolean;
          note?: string;
        };
      };
      session?: {
        lastMessagePreview?: string | null;
        finalAssistantText?: string | null;
        readbackProvenance?: {
          finalAssistantText?: {
            source?: string;
            ref?: string;
            derivedBy?: string;
            bounded?: boolean;
            note?: string;
          };
        };
      };
    };
    expect(payload.session?.lastMessagePreview).toBe("Trailing operator readback request.");
    expect(payload.sessionKey).toBe("agent:main:main");
    expect(payload.status).toBe("done");
    expect(payload.readbackSubject).toMatchObject({
      scope: "session",
      sessionKey: "agent:main:main",
      agentId: "main",
    });
    expect(payload.finality).toMatchObject({
      status: "done",
      finalAssistantTextPresent: true,
      finalAssistantTextChars: "PHASE0W_FINAL_POSTFIX_PROOF_DONE".length,
      finalAssistantTextPointer: "openclaw sessions show agent:main:main --agent main",
    });
    expect(payload.finality?.finalAssistantTextDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.finalAssistantText).toBe("PHASE0W_FINAL_POSTFIX_PROOF_DONE");
    expect(payload.session?.finalAssistantText).toBe("PHASE0W_FINAL_POSTFIX_PROOF_DONE");
    expect(payload.readbackProvenance?.finalAssistantText).toMatchObject({
      source: "session-transcript",
      ref: `session:${sessionId}`,
      derivedBy: "readLastAssistantTextFromTranscript",
      bounded: false,
    });
    expect(payload.session?.readbackProvenance?.finalAssistantText).toMatchObject({
      source: "session-transcript",
      ref: `session:${sessionId}`,
      derivedBy: "readLastAssistantTextFromTranscript",
      bounded: false,
    });
    expect(payload.session?.readbackProvenance?.finalAssistantText?.note).toContain(
      "unbounded final assistant text",
    );
  });

  it("exposes active trajectory progress provenance when running session metadata is stale", async () => {
    const sessionId = "44444444-4444-4444-8444-444444444444";
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId,
          updatedAt: Date.now() - 45 * 60_000,
          status: "running",
          startedAt: Date.now() - 50 * 60_000,
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      },
      "sessions-show-readback-progress",
    );
    const trajectory = path.join(path.dirname(store), `${sessionId}.trajectory.jsonl`);
    fs.writeFileSync(
      trajectory,
      [
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "run.started",
          ts: "2025-12-05T23:15:00.000Z",
          seq: 1,
          sessionId,
          sessionKey: "agent:main:main",
        }),
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "tool.call",
          ts: "2025-12-05T23:59:00.000Z",
          seq: 7,
          sourceSeq: 12,
          sessionId,
          sessionKey: "agent:main:main",
          data: {
            name: "exec_command",
            phase: "validation",
            command: "pnpm vitest run src/commands/sessions.test.ts",
            durationMs: 1250,
            summary: "running focused regression",
            childRole: "test_engineer",
            childPhase: "post-diff validation",
            artifactPath: ".openclaw/trajectory-exports/proof",
          },
        }),
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "tool.result",
          ts: "2025-12-05T23:59:01.000Z",
          seq: 8,
          sourceSeq: 13,
          sessionId,
          sessionKey: "agent:main:main",
          data: {
            name: "exec_command",
            status: "completed",
          },
        }),
      ].join("\n"),
    );

    const { runtime, logs } = makeRuntime();
    await sessionsShowCommand(
      {
        store,
        sessionKey: "agent:main:main",
        json: true,
        agent: "main",
      },
      runtime,
    );

    const payload = JSON.parse(logs[0] ?? "{}") as {
      session?: {
        status?: string;
        updatedAt?: number | null;
        activeProgress?: {
          source?: string;
          currentPhase?: string;
          activeLabel?: string;
          elapsedMs?: number;
          observedAt?: string;
          sourceEventType?: string;
          sourceEventSeq?: number;
          command?: string;
          childRole?: string;
          childPhase?: string;
          derivedBy?: string;
          bounded?: boolean;
          note?: string;
          pointer?: { kind?: string; ref?: string };
        } | null;
        readbackProvenance?: {
          status?: { source?: string; note?: string };
          activeProgress?: {
            source?: string;
            currentPhase?: string;
            activeLabel?: string;
            elapsedMs?: number;
            observedAt?: string;
            sourceEventType?: string;
            sourceEventSeq?: number;
            command?: string;
            childRole?: string;
            childPhase?: string;
            derivedBy?: string;
            bounded?: boolean;
            note?: string;
            pointer?: { kind?: string; ref?: string };
          };
        };
      };
      activeProgress?: {
        source?: string;
        currentPhase?: string;
        activeLabel?: string;
        elapsedMs?: number;
        observedAt?: string;
        sourceEventType?: string;
        sourceEventSeq?: number;
        command?: string;
        childRole?: string;
        childPhase?: string;
        derivedBy?: string;
        bounded?: boolean;
        note?: string;
        pointer?: { kind?: string; ref?: string };
      } | null;
    };
    expect(payload.session?.status).toBe("running");
    expect(payload.session?.readbackProvenance?.status).toMatchObject({
      source: "session-store",
    });
    expect(payload.session?.readbackProvenance?.status?.note).toContain(
      "updatedAt may not track native trajectory events",
    );
    expect(payload.session?.readbackProvenance?.activeProgress).toMatchObject({
      source: "trajectory",
      currentPhase: "validation",
      activeLabel: "exec_command",
      elapsedMs: 1250,
      observedAt: "2025-12-05T23:59:01.000Z",
      sourceEventType: "tool.result",
      sourceEventSeq: 13,
      command: "pnpm vitest run src/commands/sessions.test.ts",
      childRole: "test_engineer",
      childPhase: "post-diff validation",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
      note: "running focused regression",
      pointer: {
        kind: "artifact",
        ref: ".openclaw/trajectory-exports/proof",
      },
    });
    expect(payload.activeProgress).toMatchObject({
      source: "trajectory",
      currentPhase: "validation",
      activeLabel: "exec_command",
      sourceEventType: "tool.result",
      sourceEventSeq: 13,
      command: "pnpm vitest run src/commands/sessions.test.ts",
      childRole: "test_engineer",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });
    expect(payload.session?.activeProgress).toMatchObject({
      source: "trajectory",
      currentPhase: "validation",
      activeLabel: "exec_command",
      sourceEventType: "tool.result",
      sourceEventSeq: 13,
      command: "pnpm vitest run src/commands/sessions.test.ts",
      childRole: "test_engineer",
      derivedBy: "readLatestTrajectoryProgressProjection",
      bounded: true,
    });

    const compact = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          store,
          sessionKey: "agent:main:main",
          agent: "main",
        },
        compact.runtime,
      );
    } finally {
      fs.rmSync(store, { force: true });
      fs.rmSync(trajectory, { force: true });
    }
    expect(compact.logs.join("\n")).toContain(
      "activeProgress: trajectory phase=validation exec_command tool.result seq=13 elapsedMs=1250",
    );
    expect(compact.logs.join("\n")).toContain("childRole=test_engineer");
    expect(compact.logs.join("\n")).toContain(
      "command=pnpm vitest run src/commands/sessions.test.ts",
    );
  });

  it("renders Codex cumulative usage, tool planes, and model-authored lane verdict", async () => {
    setMockSessionsConfig(() => ({
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.6-sol" },
          models: { "openai/gpt-5.6-sol": { agentRuntime: { id: "codex" } } },
        },
        list: [{ id: "coding", default: true }],
      },
    }));
    const sessionId = "77777777-7777-4777-8777-777777777777";
    const sessionKey = "agent:coding:cumulative-readback";
    const store = writeStore(
      {
        [sessionKey]: {
          sessionId,
          updatedAt: Date.now(),
          status: "done",
          modelProvider: "openai",
          model: "gpt-5.6-sol",
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          codexThreadUsage: {
            sessionId,
            threadId: "codex-parent-thread",
            totalTokens: 1_000,
          },
        },
      },
      "sessions-show-codex-cumulative",
    );
    const transcript = path.join(path.dirname(store), `${sessionId}.jsonl`);
    fs.writeFileSync(
      transcript,
      JSON.stringify({
        message: {
          role: "assistant",
          content: "Verdict: complete\nImplementation and validation are complete.",
        },
      }),
    );

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand({ store, sessionKey, agent: "coding" }, runtime);
    } finally {
      fs.rmSync(store, { force: true });
      fs.rmSync(transcript, { force: true });
    }

    const output = logs.join("\n");
    expect(output).toContain("laneVerdict: complete");
    expect(output).toContain("toolPlanes: openclaw=0; codex=inactive");
    expect(output).toContain(
      "usage: state=settled runBasis=run-cumulative input=10 output=5 contextBasis=latest-context prompt=15 window=unavailable fresh=true",
    );
    expect(output).toContain(
      "codexTeamUsage: basis=cumulative state=settled children=0 total=1000",
    );
  });

  it("exposes active trajectory progress when session status projection is missing", async () => {
    const sessionId = "55555555-5555-4555-8555-555555555555";
    const sessionKey = "agent:codebase-researcher:subagent:missing-status";
    const store = writeStore(
      {
        [sessionKey]: {
          sessionId,
          updatedAt: Date.now() - 45 * 60_000,
          startedAt: Date.now() - 50 * 60_000,
          modelProvider: "openai",
          model: "gpt-5.4-mini",
        },
      },
      "sessions-show-readback-progress-missing-status",
    );
    const trajectory = path.join(path.dirname(store), `${sessionId}.trajectory.jsonl`);
    fs.writeFileSync(
      trajectory,
      [
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "session.started",
          ts: "2026-06-30T19:40:00.000Z",
          seq: 1,
          sessionId,
          sessionKey,
        }),
        JSON.stringify({
          traceSchema: "openclaw-trajectory",
          schemaVersion: 1,
          traceId: sessionId,
          source: "runtime",
          type: "tool.call",
          ts: "2026-06-30T19:45:00.000Z",
          seq: 9,
          sourceSeq: 15,
          sessionId,
          sessionKey,
          data: {
            name: "read",
            phase: "source-inspection",
            elapsedMs: 1500,
            summary: "reading event-spine owner files",
          },
        }),
      ].join("\n"),
    );

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          store,
          sessionKey,
          json: true,
          agent: "codebase-researcher",
        },
        runtime,
      );
    } finally {
      fs.rmSync(store, { force: true });
      fs.rmSync(trajectory, { force: true });
    }

    const payload = JSON.parse(logs[0] ?? "{}") as {
      sessionKey?: string | null;
      status?: string | null;
      activeProgress?: {
        source?: string;
        currentPhase?: string;
        activeLabel?: string;
        sourceEventType?: string;
        sourceEventSeq?: number;
        bounded?: boolean;
      } | null;
      session?: {
        status?: string;
        activeProgress?: {
          source?: string;
          currentPhase?: string;
          activeLabel?: string;
          sourceEventType?: string;
          sourceEventSeq?: number;
          bounded?: boolean;
        } | null;
      };
      readbackSubject?: {
        sessionKey?: string | null;
      };
      finality?: {
        status?: string | null;
        finalAssistantTextPresent?: boolean;
      };
    };
    expect(payload.sessionKey).toBe(sessionKey);
    expect(payload.status).toBe("running");
    expect(payload.readbackSubject?.sessionKey).toBe(sessionKey);
    expect(payload.finality).toMatchObject({
      status: "running",
      finalAssistantTextPresent: false,
    });
    expect(payload).not.toHaveProperty("activeWork");
    expect(payload.session?.status).toBe("running");
    expect(payload.activeProgress).toMatchObject({
      source: "trajectory",
      currentPhase: "source-inspection",
      activeLabel: "read",
      sourceEventType: "tool.call",
      sourceEventSeq: 15,
      bounded: true,
    });
    expect(payload.session?.activeProgress).toMatchObject({
      source: "trajectory",
      currentPhase: "source-inspection",
      activeLabel: "read",
      sourceEventType: "tool.call",
      sourceEventSeq: 15,
      bounded: true,
    });
  });

  it("shows a session by session id alias while preserving canonical key", async () => {
    const sessionId = "55555555-5555-4555-9555-555555555555";
    const sessionKey = "agent:coding:phase0z-live-readback-progress-proof";
    const store = writeStore(
      {
        [sessionKey]: {
          sessionId,
          updatedAt: Date.now(),
          modelProvider: "openai",
          model: "gpt-5.5",
        },
      },
      "sessions-show-session-id-alias",
    );

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          store,
          sessionKey: sessionId,
          json: true,
          agent: "coding",
        },
        runtime,
      );
    } finally {
      fs.rmSync(store, { force: true });
    }

    const payload = JSON.parse(logs[0] ?? "{}") as {
      session?: {
        key?: string;
        sessionId?: string;
      };
    };
    expect(payload.session?.key).toBe(sessionKey);
    expect(payload.session?.sessionId).toBe(sessionId);
  });

  it("shows an agent session by session id alias through configured gateway store lookup", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-show-session-id-gateway-"));
    const storePath = path.join(dir, "sessions.json");
    const sessionId = "66666666-6666-4666-9666-666666666666";
    const sessionKey = "agent:coding:phase0z-live-readback-progress-proof";
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          [sessionKey]: {
            sessionId,
            updatedAt: Date.now(),
            modelProvider: "openai",
            model: "gpt-5.5",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    setMockSessionsConfig(() => ({
      session: { mainKey: "main", store: storePath },
      agents: {
        defaults: {
          model: { primary: "test:opus" },
          models: { "test:opus": {}, "openai/gpt-5.5": {} },
          contextTokens: 32000,
        },
        list: [{ id: "main", default: true }, { id: "coding" }],
      },
    }));

    const { runtime, logs } = makeRuntime();
    try {
      await sessionsShowCommand(
        {
          sessionKey: sessionId,
          json: true,
          agent: "coding",
        },
        runtime,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }

    const payload = JSON.parse(logs[0] ?? "{}") as {
      session?: {
        key?: string;
        sessionId?: string;
      };
    };
    expect(payload.session?.key).toBe(sessionKey);
    expect(payload.session?.sessionId).toBe(sessionId);
  });

  it("applies --active filtering in JSON output", async () => {
    const store = writeStore(
      {
        recent: {
          sessionId: "recent",
          updatedAt: Date.now() - 5 * 60_000,
          model: "test:opus",
        },
        stale: {
          sessionId: "stale",
          updatedAt: Date.now() - 45 * 60_000,
          model: "test:opus",
        },
      },
      "sessions-active",
    );

    const payload = await runSessionsJson<{
      sessions?: Array<{
        key: string;
      }>;
    }>(sessionsCommand, store, { active: "10" });
    expect(payload.sessions?.map((row) => row.key)).toEqual(["recent"]);
  });

  it("exports runtime policy aliases for collapsed external direct sessions", async () => {
    const store = writeStore(
      {
        "agent:main:main": {
          sessionId: "telegram-main",
          updatedAt: Date.now() - 60_000,
          origin: {
            provider: "telegram",
            chatType: "direct",
            to: "telegram:42",
            accountId: "default",
          },
        },
      },
      "sessions-runtime-policy-alias",
    );

    const payload = await runSessionsJson<{
      sessions?: Array<{
        key: string;
        runtimePolicySessionKey?: string;
      }>;
    }>(sessionsCommand, store, { active: "10" });

    const main = payload.sessions?.find((row) => row.key === "agent:main:main");
    expect(main?.runtimePolicySessionKey).toBe("agent:main:telegram:default:direct:42");
  });

  it("uses a default JSON output limit of 100 sessions", () => {
    expect(testing.parseSessionsLimit(undefined)).toBe(100);
  });

  it("honors explicit JSON output limits", async () => {
    const store = writeStore(
      {
        newest: { sessionId: "newest", updatedAt: Date.now(), model: "test:opus" },
        middle: { sessionId: "middle", updatedAt: Date.now() - 60_000, model: "test:opus" },
        oldest: { sessionId: "oldest", updatedAt: Date.now() - 120_000, model: "test:opus" },
      },
      "sessions-explicit-limit",
    );

    const payload = await runSessionsJson<{
      count?: number;
      totalCount?: number;
      limitApplied?: number | null;
      hasMore?: boolean;
      sessions?: Array<{ key: string }>;
    }>(sessionsCommand, store, { limit: "2" });

    expect(payload.count).toBe(2);
    expect(payload.totalCount).toBe(3);
    expect(payload.limitApplied).toBe(2);
    expect(payload.hasMore).toBe(true);
    expect(payload.sessions?.map((row) => row.key)).toEqual(["newest", "middle"]);
  });

  it("allows full JSON output with --limit all", async () => {
    const store = writeStore(
      {
        newest: { sessionId: "newest", updatedAt: Date.now(), model: "test:opus" },
        oldest: { sessionId: "oldest", updatedAt: Date.now() - 120_000, model: "test:opus" },
      },
      "sessions-limit-all",
    );

    const payload = await runSessionsJson<{
      count?: number;
      totalCount?: number;
      limitApplied?: number | null;
      hasMore?: boolean;
      sessions?: Array<{ key: string }>;
    }>(sessionsCommand, store, { limit: "all" });

    expect(payload.count).toBe(2);
    expect(payload.totalCount).toBe(2);
    expect(payload.limitApplied).toBeNull();
    expect(payload.hasMore).toBe(false);
    expect(payload.sessions?.map((row) => row.key)).toEqual(["newest", "oldest"]);
  });

  it("sorts and slices large explicit limits instead of using top-N insertion", async () => {
    const store = writeStore(
      {
        newest: { sessionId: "newest", updatedAt: Date.now(), model: "test:opus" },
        oldest: { sessionId: "oldest", updatedAt: Date.now() - 120_000, model: "test:opus" },
      },
      "sessions-large-limit",
    );

    const payload = await runSessionsJson<{
      count?: number;
      totalCount?: number;
      limitApplied?: number | null;
      hasMore?: boolean;
      sessions?: Array<{ key: string }>;
    }>(sessionsCommand, store, { limit: "100000" });

    expect(payload.count).toBe(2);
    expect(payload.totalCount).toBe(2);
    expect(payload.limitApplied).toBe(100000);
    expect(payload.hasMore).toBe(false);
    expect(payload.sessions?.map((row) => row.key)).toEqual(["newest", "oldest"]);
  });

  it("rejects invalid --active values", async () => {
    const store = writeStore(
      {
        demo: {
          sessionId: "demo",
          updatedAt: Date.now() - 5 * 60_000,
        },
      },
      "sessions-active-invalid",
    );
    const { runtime, errors } = makeRuntime();

    await expect(sessionsCommand({ store, active: "0" }, runtime)).rejects.toThrow("exit 1");
    expect(errors).toStrictEqual([
      "--active must be a positive number of minutes, for example --active 30.",
    ]);

    fs.rmSync(store);
  });

  it("rejects partial --active values", async () => {
    const store = writeStore(
      {
        demo: {
          sessionId: "demo",
          updatedAt: Date.now() - 5 * 60_000,
        },
      },
      "sessions-active-partial",
    );
    const { runtime, errors } = makeRuntime();

    await expect(sessionsCommand({ store, active: "10m" }, runtime)).rejects.toThrow("exit 1");
    expect(errors).toStrictEqual([
      "--active must be a positive number of minutes, for example --active 30.",
    ]);

    fs.rmSync(store);
  });

  it("rejects invalid --limit values", async () => {
    const store = writeStore(
      {
        demo: {
          sessionId: "demo",
          updatedAt: Date.now() - 5 * 60_000,
        },
      },
      "sessions-limit-invalid",
    );
    const { runtime, errors } = makeRuntime();

    await expect(sessionsCommand({ store, limit: "0" }, runtime)).rejects.toThrow("exit 1");
    expect(errors).toStrictEqual([
      '--limit must be a positive integer or "all", for example --limit 25.',
    ]);

    fs.rmSync(store);
  });
});
