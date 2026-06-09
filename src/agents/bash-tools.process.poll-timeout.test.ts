import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { resetDiagnosticSessionStateForTest } from "../logging/diagnostic-session-state.js";
import {
  addSession,
  appendOutput,
  markBackgrounded,
  markExited,
  resetProcessRegistryForTests,
} from "./bash-process-registry.js";
import { createProcessSessionFixture } from "./bash-process-registry.test-helpers.js";
import { runExecProcess } from "./bash-tools.exec-runtime.js";
import { createProcessTool } from "./bash-tools.process.js";

afterEach(() => {
  resetProcessRegistryForTests();
  resetDiagnosticSessionStateForTest();
});

function createProcessSessionHarness(sessionId: string) {
  const processTool = createProcessTool();
  const session = createProcessSessionFixture({
    id: sessionId,
    command: "test",
    backgrounded: true,
  });
  addSession(session);
  return { processTool, session };
}

async function pollSession(
  processTool: ReturnType<typeof createProcessTool>,
  callId: string,
  sessionId: string,
  timeout?: number | string,
) {
  const args = {
    action: "poll",
    sessionId,
    ...(timeout === undefined ? {} : { timeout }),
  } as unknown as Parameters<ReturnType<typeof createProcessTool>["execute"]>[1];
  return processTool.execute(callId, args);
}

function retryMs(result: Awaited<ReturnType<ReturnType<typeof createProcessTool>["execute"]>>) {
  return (result.details as { retryInMs?: number }).retryInMs;
}

function pollStatus(result: Awaited<ReturnType<ReturnType<typeof createProcessTool>["execute"]>>) {
  return (result.details as { status?: string }).status;
}

function currentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

async function expectCompletedPollWithTimeout(params: {
  sessionId: string;
  callId: string;
  timeout: number | string;
  advanceMs: number;
  assertUnresolvedAtMs?: number;
}) {
  vi.useFakeTimers();
  try {
    const { processTool, session } = createProcessSessionHarness(params.sessionId);

    setTimeout(() => {
      appendOutput(session, "stdout", "done\n");
      markExited(session, 0, null, "completed");
    }, 10);

    const pollPromise = pollSession(processTool, params.callId, params.sessionId, params.timeout);
    if (params.assertUnresolvedAtMs !== undefined) {
      let resolved = false;
      void pollPromise.finally(() => {
        resolved = true;
      });
      await vi.advanceTimersByTimeAsync(params.assertUnresolvedAtMs);
      expect(resolved).toBe(false);
    }

    await vi.advanceTimersByTimeAsync(params.advanceMs);
    const poll = await pollPromise;
    const details = poll.details as { status?: string; aggregated?: string };
    expect(details.status).toBe("completed");
    expect(details.aggregated ?? "").toContain("done");
  } finally {
    vi.useRealTimers();
  }
}

test("process poll waits for completion when timeout is provided", async () => {
  await expectCompletedPollWithTimeout({
    sessionId: "sess",
    callId: "toolcall",
    timeout: 2000,
    assertUnresolvedAtMs: 200,
    advanceMs: 100,
  });
});

test("process poll accepts string timeout values", async () => {
  await expectCompletedPollWithTimeout({
    sessionId: "sess-2",
    callId: "toolcall",
    timeout: "2000",
    advanceMs: 350,
  });
});

test("process poll exposes adaptive retryInMs for repeated no-output polls", async () => {
  const sessionId = "sess-retry";
  const { processTool } = createProcessSessionHarness(sessionId);

  const polls = await Promise.all([
    pollSession(processTool, "toolcall-1", sessionId),
    pollSession(processTool, "toolcall-2", sessionId),
    pollSession(processTool, "toolcall-3", sessionId),
    pollSession(processTool, "toolcall-4", sessionId),
    pollSession(processTool, "toolcall-5", sessionId),
  ]);

  expect(polls.map((poll) => retryMs(poll))).toEqual([5000, 10000, 30000, 60000, 60000]);
});

test("process poll resets retryInMs when output appears and clears on completion", async () => {
  const sessionId = "sess-reset";
  const { processTool, session } = createProcessSessionHarness(sessionId);

  const poll1 = await pollSession(processTool, "toolcall-1", sessionId);
  const poll2 = await pollSession(processTool, "toolcall-2", sessionId);
  expect(retryMs(poll1)).toBe(5000);
  expect(retryMs(poll2)).toBe(10000);

  appendOutput(session, "stdout", "step complete\n");
  const pollWithOutput = await pollSession(processTool, "toolcall-output", sessionId);
  expect(retryMs(pollWithOutput)).toBe(5000);

  markExited(session, 0, null, "completed");
  const pollCompleted = await pollSession(processTool, "toolcall-completed", sessionId);
  expect(pollStatus(pollCompleted)).toBe("completed");
  expect(retryMs(pollCompleted)).toBeUndefined();

  const pollFinished = await pollSession(processTool, "toolcall-finished", sessionId);
  expect(pollStatus(pollFinished)).toBe("completed");
  expect(retryMs(pollFinished)).toBeUndefined();
});

test("process poll exposes managed-output refs for output beyond the in-memory cap", async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-process-managed-output-"));
  try {
    const processTool = createProcessTool();
    const outputSize = 250_000;
    const run = await runExecProcess({
      command: `node -e "setTimeout(()=>process.stdout.write('x'.repeat(${outputSize})),20)"`,
      workdir: process.cwd(),
      env: currentEnv(),
      usePty: false,
      warnings: [],
      maxOutput: 20_000,
      pendingMaxOutput: 20_000,
      notifyOnExit: false,
      timeoutSec: 5,
      stateRoot,
      sessionKey: "agent:execution-validation-scout:subagent:test",
      toolCallId: "call-process",
    });
    markBackgrounded(run.session);
    await run.promise;

    const poll = await processTool.execute("poll-call", {
      action: "poll",
      sessionId: run.session.id,
    });
    const details = poll.details as {
      status?: string;
      aggregated?: string;
      managedOutputRef?: string | null;
      managedOutputBytes?: number;
      managedOutputHash?: string;
    };
    expect(details.status).toBe("completed");
    expect(details.aggregated?.length).toBeLessThan(outputSize);
    expect(details.managedOutputRef).toContain("openclaw-managed-output://");
    expect(details.managedOutputBytes).toBe(outputSize);
    expect(details.managedOutputHash).toMatch(/^[a-f0-9]{64}$/);

    const outputFiles = fs
      .readdirSync(
        path.join(stateRoot, "managed-tool-output", new Date().toISOString().slice(0, 10)),
      )
      .filter((file) => file.endsWith(".txt"));
    expect(outputFiles.length).toBe(1);
    const persisted = fs.readFileSync(
      path.join(
        stateRoot,
        "managed-tool-output",
        new Date().toISOString().slice(0, 10),
        outputFiles[0],
      ),
      "utf8",
    );
    expect(persisted.length).toBe(outputSize);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
