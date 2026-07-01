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
      authority:
        "Derived readback over native status/session/task summaries; advisory only, not lifecycle truth.",
      summary: {
        recentSessionsConsidered: 10,
        tasks: {
          total: 2738,
          active: 0,
          failures: 49,
        },
        deploy: {
          lastEventType: "deploy.promote",
          lastPromotedImageDigest:
            "sha256:caf794952d2db69293b182d44630d943c7144f48bb8dc3bfb6b4a3969f2fde2f",
          recentFailures: 1,
        },
      },
      attention: {
        whyWorkMayFeelSlow: [
          {
            severity: "info",
            code: "task_validation_or_promotion",
            message: "Validation/promotion work is active.",
            pointer: "openclaw tasks show task-1",
          },
        ],
        validationAndPromotion: [
          {
            severity: "warn",
            code: "deploy_receipt_activity",
            message: "Recent deploy receipt activity is present.",
            pointer: "/srv/openclaw-next/artifacts/deploy-controller-promote-test.json",
          },
        ],
        evidencePointers: ["/srv/openclaw-next/artifacts/proof.json"],
      },
      advisory: {
        missingEvidenceLanguage: "unknown",
      },
      performanceProfile: {
        expensiveRunExplanation: [
          {
            severity: "warn",
            code: "tool_heavy_session",
            message: "Tool-heavy session evidence is present.",
            pointer: "openclaw sessions show agent:coding:main",
          },
        ],
        timeline: [
          {
            at: 200,
            age: "2m",
            source: "task",
            label: "validation task active",
            pointer: "openclaw tasks show task-1",
          },
        ],
        childSessionEvidence: [
          {
            taskId: "task-1",
            childSessionKey: "agent:coding:child:1",
            status: "running",
            elapsed: "11m",
            pointer: "openclaw tasks show task-1",
          },
        ],
        retryBuildProofCost: {
          deployReceiptCount: 2,
          totalKnownDurationMs: 420_000,
          totalKnownDuration: "7m",
          slowestReceipt: {
            eventId: "deploy-promote-test",
            eventType: "deploy.promote",
            durationMs: 240_000,
            duration: "4m",
            pointer: "/srv/openclaw-next/artifacts/deploy-controller-promote-test.json",
          },
        },
        validationBuildBottlenecks: [
          {
            code: "task_validation_or_promotion",
            message: "Validation task is active.",
            pointer: "openclaw tasks show task-1",
          },
        ],
        advisoryInefficiencyFlags: [
          {
            severity: "warn",
            code: "high_context_pressure",
            message: "Context pressure is high.",
          },
        ],
      },
      sessions: [
        {
          key: "agent:coding:main",
          agentId: "coding",
          runtime: "codex",
          model: "gpt-5.5",
          age: "5m",
          usage: {
            cacheStatus: "fresh",
            totalCost: 0.1234,
            totalTokens: 15,
            duration: "7m",
            messageCount: 4,
            toolCalls: 55,
            uniqueTools: 2,
            topTools: [
              { name: "read", count: 40 },
              { name: "grep", count: 15 },
            ],
            errors: 1,
          },
          pointer: "openclaw sessions show agent:coding:main --agent coding",
        },
      ],
      tasks: [
        {
          taskId: "task-1",
          runtime: "subagent",
          status: "running",
          deliveryStatus: "pending",
          label: "codebase scout",
          childSessionKey: "agent:coding:child:1",
          elapsed: "11m",
          progressSummary: "Running validation proof over source refs",
          attention: {
            waitClass: "validation_or_promotion",
            pointer: "openclaw tasks show task-1",
          },
          pointer: "openclaw tasks show task-1",
        },
      ],
      deployEvents: [
        {
          eventId: "deploy-promote-test",
          eventType: "deploy.promote",
          status: "passed",
          age: "3m",
          imageDigest: "sha256:caf794952d2db69293b182d44630d943c7144f48bb8dc3bfb6b4a3969f2fde2f",
          artifactRefs: [
            {
              kind: "deploy-controller-artifact",
              path: "/srv/openclaw-next/artifacts/deploy-controller-promote-test.json",
            },
          ],
          artifactSummary: {
            readable: true,
            duration: "4m",
            durationMs: 240_000,
            failedCount: 0,
            slowestChecks: [
              {
                id: "openclaw-native-checks",
                duration: "2m",
                status: "passed",
              },
            ],
          },
        },
      ],
      pointers: {
        statusJson: "openclaw status --json",
        tasksAudit: "openclaw tasks audit --json",
        deployEvents: "openclaw run-insights --json",
      },
    },
    onActiveMinutesChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderRunInsights", () => {
  it("renders the run-insights operator workbench from bounded report fields", () => {
    const container = document.createElement("div");

    render(renderRunInsights(createProps()), container);

    expect(container.textContent).toContain("Run insights");
    expect(container.textContent).toContain("advisory only, not lifecycle truth");
    expect(container.textContent).toContain("Missing evidence: unknown");
    expect(container.textContent).toContain("Performance and cost profile");
    expect(container.textContent).toContain("$0.1234");
    expect(container.textContent).toContain("read");
    expect(container.textContent).toContain("40");
    expect(container.textContent).toContain("tool_heavy_session");
    expect(container.textContent).toContain("Advisory inefficiency flags");
    expect(container.textContent).toContain("high_context_pressure");
    expect(container.textContent).toContain("Attention readback");
    expect(container.textContent).toContain("Recent deploy receipt activity is present.");
    expect(container.textContent).toContain("Timeline and phase readback");
    expect(container.textContent).toContain("validation task active");
    expect(container.textContent).toContain("Child and task evidence");
    expect(container.textContent).toContain("agent:coding:child:1");
    expect(container.textContent).toContain("Running validation proof over source refs");
    expect(container.textContent).toContain("Validation, build, and promote cost");
    expect(container.textContent).toContain("bottleneck");
    expect(container.textContent).toContain("Known duration");
    expect(container.textContent).toContain("7m");
    expect(container.textContent).toContain("deploy.promote");
    expect(container.textContent).toContain("duration");
    expect(container.textContent).toContain("slowest openclaw-native-checks 2m");
    expect(container.textContent).toContain("deploy-controller-promote-test.json");
    expect(container.textContent).toContain("sha256:caf794952d2");
    expect(container.textContent).toContain("Validation/promotion work is active.");
    expect(container.textContent).toContain("Pointers and debug fallback");
    expect(container.textContent).toContain("openclaw tasks audit --json");
    expect(container.textContent).toContain("/srv/openclaw-next/artifacts/proof.json");
    expect(container.textContent).toContain("Raw bounded report");
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
