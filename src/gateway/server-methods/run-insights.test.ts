import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInsightsHandlers, __test } from "./run-insights.js";

const mocks = vi.hoisted(() => ({
  resolveRunInsightsOptions: vi.fn(),
  loadRunInsightsReport: vi.fn(),
}));

vi.mock("../../commands/run-insights.js", () => ({
  resolveRunInsightsOptions: mocks.resolveRunInsightsOptions,
  loadRunInsightsReport: mocks.loadRunInsightsReport,
}));

function createRespond() {
  return vi.fn();
}

describe("runInsightsHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a bounded run-insights report through the gateway method", async () => {
    const resolved = { agent: "coding", activeMinutes: 30, limit: 5 };
    const report = {
      schema: "openclaw.run_insights.v1",
      authority: "advisory only",
      generatedAt: "2026-07-01T00:00:00.000Z",
    };
    mocks.resolveRunInsightsOptions.mockReturnValueOnce({ ok: true, value: resolved });
    mocks.loadRunInsightsReport.mockResolvedValueOnce(report);
    const respond = createRespond();

    await runInsightsHandlers["run.insights"]({
      params: { agent: "coding", activeMinutes: "30", limit: 5 },
      respond,
    } as never);

    expect(mocks.resolveRunInsightsOptions).toHaveBeenCalledWith({
      agent: "coding",
      active: "30",
      limit: 5,
    });
    expect(mocks.loadRunInsightsReport).toHaveBeenCalledWith(resolved);
    expect(respond).toHaveBeenCalledWith(true, report);
  });

  it("rejects conflicting active filters before loading report data", async () => {
    const respond = createRespond();

    await runInsightsHandlers["run.insights"]({
      params: { active: "15", activeMinutes: "30" },
      respond,
    } as never);

    expect(mocks.loadRunInsightsReport).not.toHaveBeenCalled();
    expect(respond.mock.calls[0]?.[0]).toBe(false);
    expect(String(respond.mock.calls[0]?.[2]?.message)).toContain(
      "active and activeMinutes must not conflict",
    );
  });

  it("normalizes empty params and rejects invalid resolved options", async () => {
    mocks.resolveRunInsightsOptions.mockReturnValueOnce({
      ok: false,
      message: "limit must be a positive integer.",
    });
    const respond = createRespond();

    await runInsightsHandlers["run.insights"]({
      params: { limit: "nope" },
      respond,
    } as never);

    expect(respond.mock.calls[0]?.[0]).toBe(false);
    expect(String(respond.mock.calls[0]?.[2]?.message)).toContain(
      "limit must be a positive integer.",
    );
  });
});

describe("run insights param normalization", () => {
  it("accepts active as the CLI-style alias", () => {
    expect(__test.normalizeRunInsightsParams({ active: 10 })).toEqual({
      ok: true,
      value: { active: 10 },
    });
  });
});
