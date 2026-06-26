import { describe, expect, it } from "vitest";
import { appendBackgroundTaskProgressSummary } from "./manager.background-task.js";

describe("ACP background task progress summaries", () => {
  it("preserves bounded child Context Pack progress beyond tiny one-line status caps", () => {
    const chunk = Array.from({ length: 700 }, (_, index) => `finding-${index}`).join(" ");

    const summary = appendBackgroundTaskProgressSummary("", chunk);

    expect(summary.length).toBeGreaterThan(2_000);
    expect(summary).toContain("finding-0");
    expect(summary).toContain("finding-699");
    expect(summary).not.toContain("…");
  });

  it("stays bounded for very large progress streams", () => {
    const huge = "plan-shaping evidence ".repeat(4_000);

    const summary = appendBackgroundTaskProgressSummary("", huge);

    expect(summary.length).toBeLessThanOrEqual(32_000);
    expect(summary.endsWith("…")).toBe(true);
  });
});
