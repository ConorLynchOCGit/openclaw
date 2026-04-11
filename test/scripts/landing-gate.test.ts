import { describe, expect, it } from "vitest";
import {
  resolveLandingGateExecution,
  resolveLandingGatePlan,
} from "../../scripts/run-landing-gate.mjs";

describe("landing gate plan", () => {
  it("defines the feature gate as the cheapest repo-wide tier", () => {
    expect(resolveLandingGatePlan("feature")).toEqual({
      tier: "feature",
      steps: [{ command: "pnpm", args: ["check:fast"] }],
    });
  });

  it("defines the production gate as the strongest repo-wide tier", () => {
    expect(resolveLandingGatePlan("production").steps).toEqual([
      { command: "pnpm", args: ["check"] },
      { command: "pnpm", args: ["test"] },
      { command: "pnpm", args: ["build"] },
    ]);
  });

  it("reuses unchanged-tree integration results when production only still needs build", () => {
    expect(resolveLandingGateExecution("production", new Set(["gate-check", "test"]))).toEqual({
      tier: "production",
      steps: [
        { command: "pnpm", args: ["check"], latestKey: "gate-check", reused: true },
        { command: "pnpm", args: ["test"], latestKey: "test", reused: true },
        { command: "pnpm", args: ["build"], latestKey: "build", reused: false },
      ],
      pendingSteps: [{ command: "pnpm", args: ["build"], latestKey: "build", reused: false }],
      reusedSteps: [
        { command: "pnpm", args: ["check"], latestKey: "gate-check", reused: true },
        { command: "pnpm", args: ["test"], latestKey: "test", reused: true },
      ],
    });
  });

  it("marks feature gate as fully reusable on an unchanged tree", () => {
    expect(resolveLandingGateExecution("feature", new Set(["gate-check-fast"]))).toEqual({
      tier: "feature",
      steps: [
        { command: "pnpm", args: ["check:fast"], latestKey: "gate-check-fast", reused: true },
      ],
      pendingSteps: [],
      reusedSteps: [
        { command: "pnpm", args: ["check:fast"], latestKey: "gate-check-fast", reused: true },
      ],
    });
  });

  it("rejects unknown tiers", () => {
    expect(() => resolveLandingGatePlan("unknown")).toThrow("usage:");
  });
});
