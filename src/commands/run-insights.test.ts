import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInsightsCommand } from "./run-insights.js";
import type { StatusSummary } from "./status.types.js";

const mocks = vi.hoisted(() => ({
  getStatusSummary: vi.fn(),
  runtime: {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  },
}));

const getStatusSummary = mocks.getStatusSummary;
const runtime = mocks.runtime;

vi.mock("./status.summary.js", () => ({
  getStatusSummary: mocks.getStatusSummary,
}));

function buildSummary(): StatusSummary {
  return {
    runtimeVersion: "test",
    heartbeat: {
      defaultAgentId: "main",
      agents: [],
    },
    channelSummary: [],
    queuedSystemEvents: [],
    tasks: {
      total: 7,
      active: 2,
      terminal: 5,
      failures: 1,
      byStatus: {
        queued: 0,
        running: 2,
        succeeded: 4,
        failed: 1,
        timed_out: 0,
        cancelled: 0,
        lost: 0,
      },
      byRuntime: {
        subagent: 3,
        acp: 0,
        cli: 4,
        cron: 0,
      },
    },
    taskAudit: {
      total: 0,
      warnings: 0,
      errors: 0,
      byCode: {
        stale_queued: 0,
        stale_running: 0,
        lost: 0,
        delivery_failed: 0,
        missing_cleanup: 0,
        inconsistent_timestamps: 0,
      },
    },
    sessions: {
      paths: ["/tmp/coding-sessions.json"],
      count: 3,
      defaults: {
        model: "gpt-5.5",
        contextTokens: 100000,
      },
      recent: [
        {
          agentId: "coding",
          key: "agent:coding:main",
          kind: "direct",
          sessionId: "sess-coding",
          updatedAt: 1_000,
          age: 5 * 60_000,
          abortedLastRun: true,
          totalTokens: 92_000,
          totalTokensFresh: true,
          inputTokens: 90_000,
          outputTokens: 2_000,
          remainingTokens: 8_000,
          percentUsed: 92,
          model: "gpt-5.5",
          configuredModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          modelSelectionReason: "configured",
          runtime: "codex",
          contextTokens: 100_000,
          flags: ["aborted"],
        },
        {
          agentId: "planning",
          key: "agent:planning:main",
          kind: "direct",
          sessionId: "sess-planning",
          updatedAt: 900,
          age: 180 * 60_000,
          totalTokens: 10_000,
          totalTokensFresh: false,
          remainingTokens: 90_000,
          percentUsed: 10,
          model: "gpt-5.5",
          configuredModel: "gpt-5.5",
          selectedModel: "gpt-5.5",
          modelSelectionReason: "configured",
          runtime: "openclaw",
          contextTokens: 100_000,
          flags: [],
        },
      ],
      byAgent: [
        {
          agentId: "coding",
          path: "/tmp/coding-sessions.json",
          count: 1,
          recent: [
            {
              agentId: "coding",
              key: "agent:coding:main",
              kind: "direct",
              sessionId: "sess-coding",
              updatedAt: 1_000,
              age: 5 * 60_000,
              abortedLastRun: true,
              totalTokens: 92_000,
              totalTokensFresh: true,
              inputTokens: 90_000,
              outputTokens: 2_000,
              remainingTokens: 8_000,
              percentUsed: 92,
              model: "gpt-5.5",
              configuredModel: "gpt-5.5",
              selectedModel: "gpt-5.5",
              modelSelectionReason: "configured",
              runtime: "codex",
              contextTokens: 100_000,
              flags: ["aborted"],
            },
          ],
        },
      ],
    },
  } as unknown as StatusSummary;
}

describe("runInsightsCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtime.exit.mockImplementation(() => {});
    getStatusSummary.mockResolvedValue(buildSummary());
  });

  it("emits bounded JSON run performance evidence from status summaries", async () => {
    await runInsightsCommand(
      {
        json: true,
        agent: "coding",
        active: "60",
        limit: "5",
      },
      runtime,
    );

    expect(getStatusSummary).toHaveBeenCalledWith({
      includeSensitive: true,
      includeChannelSummary: false,
    });
    expect(runtime.log).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(runtime.log.mock.calls[0]?.[0]));
    expect(payload.schema).toBe("openclaw.run_insights.v1");
    expect(payload.authority).toContain("not lifecycle truth");
    expect(payload.filters).toEqual({
      agent: "coding",
      activeMinutes: 60,
      limit: 5,
    });
    expect(payload.summary.tasks.failures).toBe(1);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].pointer).toBe(
      "openclaw sessions show agent:coding:main --agent coding",
    );
    expect(payload.signals.map((signal: { code: string }) => signal.code)).toEqual(
      expect.arrayContaining([
        "task_failures_present",
        "active_tasks_present",
        "session_aborted_last_run",
        "high_context_pressure",
      ]),
    );
  });

  it("prints human readback without crawling raw transcripts", async () => {
    await runInsightsCommand({}, runtime);

    const output = runtime.log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Run Insights");
    expect(output).toContain("Derived readback over native status/session/task summaries");
    expect(output).toContain("openclaw tasks audit --json");
  });

  it("rejects invalid numeric options before reading status summaries", async () => {
    await runInsightsCommand({ limit: "nope" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith("--limit must be a positive integer.");
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(getStatusSummary).not.toHaveBeenCalled();
  });
});
