// After-action artifact summary tests cover read-only timing/cost extraction.
import { describe, expect, it } from "vitest";
import {
  classifyCostLabel,
  summarizeArtifact,
} from "../../scripts/after-action-artifact-summary.mjs";

describe("scripts/after-action-artifact-summary.mjs", () => {
  it("extracts timings and slow checks from existing artifact fields", () => {
    const summary = summarizeArtifact(
      {
        schema: "openclaw-next.deploy-controller.promotion-gate.v1",
        action: "promotion-gate",
        status: "passed",
        timingsMs: {
          total: 1200,
          checks: [
            { id: "fast", durationMs: 10, status: "passed" },
            { id: "slow", durationMs: 900, status: "passed", exitCode: 0 },
          ],
        },
        usage: { tokens: 42 },
      },
      "/tmp/promotion-gate.json",
    );

    expect(summary).toMatchObject({
      path: "/tmp/promotion-gate.json",
      action: "promotion-gate",
      status: "passed",
      durationMs: 1200,
      costLabel: "usage-present",
      authority: expect.stringContaining("no telemetry store"),
    });
    expect(summary.slowestChecks[0]).toEqual({
      id: "slow",
      durationMs: 900,
      status: "passed",
      exitCode: 0,
    });
  });

  it("falls back to nested timingMs objects without inventing costs", () => {
    const summary = summarizeArtifact({
      action: "apply-runtime-config",
      timingMs: { total: 75 },
    });

    expect(summary.durationMs).toBe(75);
    expect(summary.costLabel).toBe("cost-not-recorded");
  });

  it("labels existing cost and token fields without pricing inference", () => {
    expect(classifyCostLabel({ costUsd: 0.12 })).toBe("cost-present");
    expect(classifyCostLabel({ tokenUsage: { input: 1, output: 2 } })).toBe("token-usage-present");
    expect(classifyCostLabel({ usage: { costUsd: 0.34 } })).toBe("cost-present");
  });
});
