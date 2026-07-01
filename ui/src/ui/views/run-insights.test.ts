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
        evidencePointers: ["/srv/openclaw-next/artifacts/proof.json"],
      },
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
    },
    onActiveMinutesChange: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderRunInsights", () => {
  it("renders native authority, deploy digest, attention, and evidence pointers", () => {
    const container = document.createElement("div");

    render(renderRunInsights(createProps()), container);

    expect(container.textContent).toContain("Run insights");
    expect(container.textContent).toContain("advisory only, not lifecycle truth");
    expect(container.textContent).toContain("deploy.promote");
    expect(container.textContent).toContain("Recent deploy receipts");
    expect(container.textContent).toContain("duration 4m");
    expect(container.textContent).toContain("slowest openclaw-native-checks 2m");
    expect(container.textContent).toContain("deploy-controller-promote-test.json");
    expect(container.textContent).toContain("sha256:caf794952d2d");
    expect(container.textContent).toContain("Validation/promotion work is active.");
    expect(container.textContent).toContain("/srv/openclaw-next/artifacts/proof.json");
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
