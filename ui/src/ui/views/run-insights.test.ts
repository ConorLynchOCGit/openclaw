/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderRunInsights, type RunInsightsProps } from "./run-insights.ts";

function createProps(overrides: Partial<RunInsightsProps> = {}): RunInsightsProps {
  return {
    loading: false,
    error: null,
    activeMinutes: 180,
    report: {
      schema: "openclaw.run_insights.v1",
      authority: "advisory_readback",
      filters: {
        activeMinutes: 180,
        limit: 10,
        includeBackground: true,
      },
      summary: {
        recentSessionsConsidered: 2,
        sessionsDisplayed: 1,
        tasksDisplayed: 1,
        childRunsDisplayed: 1,
        skillReadsDisplayed: 1,
        backgroundSignalsIncluded: true,
      },
      finality: {
        status: "done",
        finalAssistantTextPresent: true,
        finalAssistantTextChars: 10943,
        finalAssistantTextPointer: "openclaw sessions show agent:planning:main --agent planning",
      },
      activeWork: {
        phase: "succeeded",
        activeTool: null,
        source: "session-store",
      },
      costs: {
        sessionDurationMs: 420_000,
        sessionTokens: 30_000,
        sessionCostUsd: 0.1234,
        toolCalls: 55,
        deployReceiptCount: 1,
        deployKnownDurationMs: 120_000,
        slowestDeployReceipt: {
          eventId: "deploy-1",
          eventType: "deploy.promote",
          durationMs: 120_000,
          pointer: "/srv/openclaw-next/state/deploy/events.ndjson",
        },
      },
      signals: [
        {
          severity: "warn",
          code: "task_long_running",
          message: "Task has been running for 11m.",
          pointer: "openclaw tasks show task-1 --json",
        },
      ],
      sessions: [
        {
          key: "agent:planning:main",
          agentId: "planning",
          runtime: "codex",
          model: "gpt-5.5",
          age: "5m",
          totalTokens: 30_000,
          percentUsed: 30,
          status: "done",
          usage: {
            cacheStatus: "fresh",
            totalCost: 0.1234,
            totalTokens: 30_000,
            duration: "7m",
            toolCalls: 55,
            topTools: [{ name: "read", count: 40 }],
          },
          pointer: "openclaw sessions show agent:planning:main --agent planning",
        },
      ],
      tasks: [
        {
          taskId: "task-1",
          runtime: "subagent",
          status: "succeeded",
          deliveryStatus: "delivered",
          label: "Planning run",
          elapsed: "7m",
          childRunCount: 1,
          latestEvent: {
            kind: "succeeded",
            summary: "Planning completed.",
          },
          activeProgress: {
            source: "task-run-event",
            ref: "task-event:task-1:2:progress",
            currentPhase: "running",
            activeLabel: "codebase scout",
            toolName: "bash",
            command: "pnpm vitest run src/commands/run-insights.test.ts",
            childRole: "test_engineer",
            derivedBy: "resolveTaskReadbackProgressProjection",
            bounded: true,
          },
          pointer: "openclaw tasks show task-1 --json",
        },
      ],
      childRuns: [
        {
          parentTaskId: "task-1",
          runId: "child-1",
          childSessionKey: "agent:codebase-researcher:child",
          agentId: "codebase-researcher",
          status: "succeeded",
          contentChars: 2048,
          contentTruncated: false,
          elapsed: "2m",
          spawnReason: "Inspect exact refs.",
          pointer:
            "openclaw sessions show agent:codebase-researcher:child --agent codebase-researcher",
        },
      ],
      skillReads: [
        {
          sessionKey: "agent:planning:main",
          agentId: "planning",
          skillName: "comprehensive-plan-record",
          catalogVisible: true,
          visibleSkillCount: 2,
          visibleSkillNames: ["comprehensive-plan-record", "agentic-architecture-review"],
          readEvidence: "skill_used",
          readStatus: "full",
          linesRead: 775,
          totalLines: 775,
          bytesRead: 32_000,
          usedSkillNames: ["comprehensive-plan-record"],
          pointer: "openclaw sessions show agent:planning:main --agent planning",
        },
      ],
      deployEvents: [
        {
          eventId: "deploy-1",
          eventType: "deploy.promote",
          status: "succeeded",
          duration: "2m",
          durationMs: 120_000,
          sourceCommit: "abc123",
          artifactRefs: ["/srv/openclaw-next/artifacts/deploy.json"],
          pointer: "/srv/openclaw-next/state/deploy/events.ndjson",
        },
      ],
      pointers: {
        statusJson: "openclaw status --json",
        sessions: "openclaw sessions show agent:planning:main --agent planning",
        tasks: "openclaw tasks show task-1 --json",
        deployEvents: "/srv/openclaw-next/state/deploy/events.ndjson",
      },
    },
    onActiveMinutesChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderRunInsights", () => {
  it("renders the reduced native run-insights report", () => {
    const container = document.createElement("div");

    render(renderRunInsights(createProps()), container);

    expect(container.textContent).toContain("Run insights");
    expect(container.textContent).toContain("advisory_readback");
    expect(container.textContent).toContain("10,943 chars");
    expect(container.textContent).toContain("Cost and timing");
    expect(container.textContent).toContain("$0.1234");
    expect(container.textContent).toContain("task_long_running");
    expect(container.textContent).toContain("agent:planning:main");
    expect(container.textContent).toContain("Planning completed.");
    expect(container.textContent).toContain("agent:codebase-researcher:child");
    expect(container.textContent).toContain("skill_used");
    expect(container.textContent).toContain("comprehensive-plan-record");
    expect(container.textContent).toContain("status full");
    expect(container.textContent).toContain("lines 775/775");
    expect(container.textContent).toContain("deploy.promote");
    expect(container.textContent).toContain("openclaw status --json");
    expect(container.textContent).not.toContain("Diagnostic summary");
    expect(container.textContent).not.toContain("Performance and cost profile");
    expect(container.textContent).not.toContain("Attention readback");
  });

  it("changes the time window without owning runtime state", () => {
    const onActiveMinutesChange = vi.fn();
    const container = document.createElement("div");

    render(renderRunInsights(createProps({ onActiveMinutesChange })), container);
    const select = container.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error("expected window select");
    }

    select.value = "720";
    select.dispatchEvent(new Event("change"));

    expect(onActiveMinutesChange).toHaveBeenCalledWith(720);
  });
});
