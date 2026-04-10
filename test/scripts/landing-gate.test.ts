import { describe, expect, it } from "vitest";
import { resolveLandingGatePlan } from "../../scripts/run-landing-gate.mjs";

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

  it("rejects unknown tiers", () => {
    expect(() => resolveLandingGatePlan("unknown")).toThrow("usage:");
  });
});
