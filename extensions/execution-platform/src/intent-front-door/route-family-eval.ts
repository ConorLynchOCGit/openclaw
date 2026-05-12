import type { CanonicalIntentRoute } from "./router-schema.ts";

export type RouterRouteFamily =
  | "chat_like"
  | "execution_like"
  | "control_like"
  | "clarification_like"
  | "blocked_like"
  | "unknown";

export type RouteFamilyEvalResult = {
  expectedRouteFamily: RouterRouteFamily;
  actualRouteFamily: RouterRouteFamily;
  routeFamilyMatched: boolean;
  executionFamilyFalseAllow: boolean;
  executionFamilyFalseBlock: boolean;
  safetyFamilyFalseAllow: boolean;
  clarificationFamilyMismatch: boolean;
};

export function routeFamilyFor(route: string | null): RouterRouteFamily {
  if (route === "chat_response" || route === "status_response" || route === "plan_only") {
    return "chat_like";
  }
  if (
    route === "workflow_execution" ||
    route === "research_only" ||
    route === "multi_workflow_plan"
  ) {
    return "execution_like";
  }
  if (route === "work_queue_control") {
    return "control_like";
  }
  if (route === "clarification_required") {
    return "clarification_like";
  }
  if (route === "blocked" || route === "needs_review") {
    return "blocked_like";
  }
  return "unknown";
}

export function evaluateRouteFamily(input: {
  expectedRoute: CanonicalIntentRoute;
  actualRoute: string | null;
}): RouteFamilyEvalResult {
  const expectedRouteFamily = routeFamilyFor(input.expectedRoute);
  const actualRouteFamily = routeFamilyFor(input.actualRoute);
  const expectedExecution = expectedRouteFamily === "execution_like";
  const actualExecution = actualRouteFamily === "execution_like";
  return {
    expectedRouteFamily,
    actualRouteFamily,
    routeFamilyMatched: expectedRouteFamily === actualRouteFamily,
    executionFamilyFalseAllow: actualExecution && !expectedExecution,
    executionFamilyFalseBlock: !actualExecution && expectedExecution,
    safetyFamilyFalseAllow:
      expectedRouteFamily === "blocked_like" &&
      (actualRouteFamily === "execution_like" || actualRouteFamily === "control_like"),
    clarificationFamilyMismatch:
      (actualRouteFamily === "clarification_like") !==
      (expectedRouteFamily === "clarification_like"),
  };
}
