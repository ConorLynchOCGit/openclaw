import { describe, expect, it } from "vitest";
import { EXECUTION_INTENTS, normalizeExecutionIntent } from "./execution-intent.ts";

describe("execution intent contract", () => {
  it("uses shared resource demand instead of retired resource fulfillment aliases", () => {
    expect(EXECUTION_INTENTS).toContain("resource_demand");
    expect(EXECUTION_INTENTS).not.toContain("resource_fulfillment");

    expect(normalizeExecutionIntent("resource_demand")).toBe("resource_demand");
    expect(normalizeExecutionIntent("resource-demand")).toBe("resource_demand");
    expect(normalizeExecutionIntent("resourceDemand")).toBe("resource_demand");
    expect(normalizeExecutionIntent("resource_fulfillment")).toBeNull();
    expect(normalizeExecutionIntent("resource-fulfillment")).toBeNull();
    expect(normalizeExecutionIntent("resourceFulfillment")).toBeNull();
  });
});
