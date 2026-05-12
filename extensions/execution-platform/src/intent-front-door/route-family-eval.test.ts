import { describe, expect, it } from "vitest";
import { evaluateRouteFamily, routeFamilyFor } from "./route-family-eval.ts";

describe("route-family eval metrics", () => {
  it("groups research_only and workflow_execution as execution-like without rewriting routes", () => {
    const result = evaluateRouteFamily({
      expectedRoute: "workflow_execution",
      actualRoute: "research_only",
    });

    expect(result.expectedRouteFamily).toBe("execution_like");
    expect(result.actualRouteFamily).toBe("execution_like");
    expect(result.routeFamilyMatched).toBe(true);
    expect("research_only").toBe("research_only");
  });

  it("groups chat/status/plan as chat-like while preserving exact mismatch evidence", () => {
    const result = evaluateRouteFamily({
      expectedRoute: "chat_response",
      actualRoute: "status_response",
    });

    expect(result.routeFamilyMatched).toBe(true);
    expect(result.expectedRouteFamily).toBe("chat_like");
    expect(result.actualRouteFamily).toBe("chat_like");
  });

  it("groups blocked and needs_review as blocked-like", () => {
    expect(routeFamilyFor("blocked")).toBe("blocked_like");
    expect(routeFamilyFor("needs_review")).toBe("blocked_like");
  });

  it("keeps high-risk execution false allows visible at family level", () => {
    const result = evaluateRouteFamily({
      expectedRoute: "blocked",
      actualRoute: "workflow_execution",
    });

    expect(result.routeFamilyMatched).toBe(false);
    expect(result.executionFamilyFalseAllow).toBe(true);
    expect(result.safetyFamilyFalseAllow).toBe(true);
  });
});
