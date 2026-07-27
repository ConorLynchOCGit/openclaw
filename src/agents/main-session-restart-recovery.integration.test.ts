// Exercises persisted main-session recovery across repeated gateway lifecycles.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionEntry } from "../config/sessions.js";
import {
  appendTranscriptMessage,
  loadSessionEntry,
  replaceSessionEntry,
} from "../config/sessions/session-accessor.js";
import { callGateway } from "../gateway/call.js";
import {
  getAgentEventLifecycleGeneration,
  resetAgentEventsForTest,
  rotateAgentEventLifecycleGeneration,
} from "../infra/agent-events.js";
import {
  markRestartAbortedMainSessions,
  recoverRestartAbortedMainSessions,
} from "./main-session-restart-recovery.js";

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(async () => ({ runId: "logical-recovery-run" })),
}));

const gatewayRuntime = {
  dispatchAgent: async <T>(params: Record<string, unknown>, timeoutMs?: number) =>
    (await callGateway({ method: "agent", params, timeoutMs })) as T,
  waitForAgent: async <T>(params: Record<string, unknown>, timeoutMs?: number) =>
    (await callGateway({ method: "agent.wait", params, timeoutMs })) as T,
  sendRecoveryNotice: async <T>(params: Record<string, unknown>, timeoutMs?: number) =>
    (await callGateway({ method: "message.action", params, timeoutMs })) as T,
};

describe("main-session restart recovery integration", () => {
  const cfg = {};
  let stateDir = "";
  let sessionsDir: string;
  let storePath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetAgentEventsForTest();
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-three-restarts-"));
    sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    storePath = path.join(sessionsDir, "sessions.json");
    await fs.mkdir(sessionsDir, { recursive: true });
    await replaceSessionEntry({ sessionKey: "agent:main:main", storePath }, {
      sessionId: "persistent-main-session",
      status: "running",
      updatedAt: Date.now() - 10_000,
    } satisfies SessionEntry);
    await appendTranscriptMessage(
      {
        sessionId: "persistent-main-session",
        sessionKey: "agent:main:main",
        storePath,
      },
      {
        cwd: sessionsDir,
        message: { role: "user", content: "finish the accepted work" },
      },
    );
    resetAgentEventsForTest();
  });

  afterEach(async () => {
    if (stateDir) {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  });

  it("keeps one logical recovery identity across three gateway generations", async () => {
    const observedGenerations: string[] = [];
    const recoveryAttempts: number[] = [];

    for (let restart = 1; restart <= 3; restart += 1) {
      const interruptedGeneration = getAgentEventLifecycleGeneration();
      const marked = await markRestartAbortedMainSessions({
        cfg,
        stateDir,
        sessionKeys: ["agent:main:main"],
        sessionIds: ["persistent-main-session"],
        activeRuns: [
          {
            runId: "logical-recovery-run",
            lifecycleGeneration: interruptedGeneration,
            sessionKey: "agent:main:main",
            sessionId: "persistent-main-session",
          },
        ],
      });
      expect(marked).toEqual({ marked: 1, skipped: 0 });

      const markedEntry = loadSessionEntry({
        sessionKey: "agent:main:main",
        storePath,
      });
      expect(markedEntry?.sessionId).toBe("persistent-main-session");
      expect(markedEntry?.restartRecoveryRuns).toEqual(
        expect.arrayContaining([
          {
            runId: "logical-recovery-run",
            lifecycleGeneration: interruptedGeneration,
          },
        ]),
      );
      observedGenerations.push(interruptedGeneration);

      rotateAgentEventLifecycleGeneration();
      const recovered = await recoverRestartAbortedMainSessions({
        cfg,
        gatewayRuntime,
        stateDir,
      });
      expect(recovered).toEqual({ recovered: 1, failed: 0, skipped: 0 });
      recoveryAttempts.push(vi.mocked(callGateway).mock.calls.length);

      const duplicateRecovery = await recoverRestartAbortedMainSessions({
        cfg,
        gatewayRuntime,
        stateDir,
      });
      expect(duplicateRecovery).toEqual({ recovered: 0, failed: 0, skipped: 0 });
      expect(vi.mocked(callGateway)).toHaveBeenCalledTimes(restart);
    }

    expect(new Set(observedGenerations).size).toBe(3);
    expect(recoveryAttempts).toEqual([1, 2, 3]);
    expect(vi.mocked(callGateway).mock.calls.every(([request]) => request.method === "agent")).toBe(
      true,
    );
    expect(
      vi
        .mocked(callGateway)
        .mock.calls.map(([request]) => (request.params as { sessionKey?: string }).sessionKey),
    ).toEqual(["agent:main:main", "agent:main:main", "agent:main:main"]);

    const finalEntry = loadSessionEntry({
      sessionKey: "agent:main:main",
      storePath,
    });
    expect(finalEntry?.sessionId).toBe("persistent-main-session");
    expect(finalEntry?.abortedLastRun).toBe(false);
    if (!finalEntry) {
      throw new Error("expected persisted main session");
    }

    await replaceSessionEntry({ sessionKey: "agent:main:main", storePath }, {
      ...finalEntry,
      status: "done",
      endedAt: Date.now(),
    } satisfies SessionEntry);
    rotateAgentEventLifecycleGeneration();
    expect(await recoverRestartAbortedMainSessions({ cfg, gatewayRuntime, stateDir })).toEqual({
      recovered: 0,
      failed: 0,
      skipped: 0,
    });
    expect(vi.mocked(callGateway)).toHaveBeenCalledTimes(3);
  });
});
