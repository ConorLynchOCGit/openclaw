import { describe, expect, it } from "vitest";
import { resolveContextScoutModelCallBudget } from "./context-scout-node-executor.ts";

describe("context scout node executor", () => {
  it("bounds repair model calls by remaining node budget", () => {
    const budget = resolveContextScoutModelCallBudget({
      startedAtMs: 1_000,
      nowMs: 51_000,
      totalTimeoutMs: 60_000,
      minimumUsefulTimeoutMs: 1_000,
    });

    expect(budget.status).toBe("available");
    expect(budget.timeoutMs).toBe(10_000);
    expect(budget.reasonCodes).toContain("context_scout_model_call_budget_resolved");
  });

  it("expires repair turns instead of granting a second full timeout", () => {
    const budget = resolveContextScoutModelCallBudget({
      startedAtMs: 1_000,
      nowMs: 61_000,
      totalTimeoutMs: 60_000,
      minimumUsefulTimeoutMs: 30_000,
    });

    expect(budget.status).toBe("expired");
    expect(budget.timeoutMs).toBe(0);
    expect(budget.reasonCodes).toContain("context_scout_total_budget_exhausted");
  });
});
