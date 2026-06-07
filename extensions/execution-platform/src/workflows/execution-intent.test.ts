import { describe, expect, it } from "vitest";
import { EXECUTION_INTENTS, normalizeExecutionIntent } from "./execution-intent.ts";

describe("execution intent contract", () => {
  it("uses source grounding instead of retired resource demand or fulfillment aliases", () => {
    expect(EXECUTION_INTENTS).toContain("source_grounding");
    expect(EXECUTION_INTENTS).not.toContain("resource_demand");
    expect(EXECUTION_INTENTS).not.toContain("resource_fulfillment");

    expect(normalizeExecutionIntent("source_grounding")).toBe("source_grounding");
    expect(normalizeExecutionIntent("resource_demand")).toBeNull();
    expect(normalizeExecutionIntent("resource-demand")).toBeNull();
    expect(normalizeExecutionIntent("resourceDemand")).toBeNull();
    expect(normalizeExecutionIntent("resource_fulfillment")).toBeNull();
    expect(normalizeExecutionIntent("resource-fulfillment")).toBeNull();
    expect(normalizeExecutionIntent("resourceFulfillment")).toBeNull();
  });
});
