import { describe, expect, it } from "vitest";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import { runRouterShadowEval } from "./router-shadow-eval.ts";
import { ROUTING_EVAL_CORPUS } from "./routing-eval-corpus.ts";

describe("RouterShadowEval", () => {
  it("runs fixture shadow eval without live provider calls", () => {
    const run = runRouterShadowEval({ evalRunId: "shadow-fixture" });

    expect(run.status).toBe("passed");
    expect(run.totalCases).toBe(ROUTING_EVAL_CORPUS.length);
    expect(run.routeAccuracy).toBe(1);
    expect(run.routeFamilyAccuracy).toBe(1);
    expect(run.providerCallsMade).toBe(false);
    expect(run.runtimeJobsCreated).toBe(false);
    expect(run.workQueueLifecycleMutated).toBe(false);
    expect(run.rawPromptStored).toBe(false);
    expect(run.rawResponseStored).toBe(false);
  });

  it("marks live shadow eval blocked when approved provider config is missing", () => {
    const run = runRouterShadowEval({
      providerMode: "live_shadow",
      liveProviderConfigured: false,
      liveCallsEnabled: false,
    });

    expect(run.status).toBe("blocked_config_missing");
    expect(run.blockedConfigMissing).toBe(true);
    expect(run.providerCallsMade).toBe(false);
    expect(run.reasonCodes).toContain("approved_router_provider_config_missing");
  });

  it("detects false allows in candidate output", () => {
    const caseId = ROUTING_EVAL_CORPUS.find(
      (evalCase) => !evalCase.expected.runtimeJobCreated,
    )?.evalCaseId;
    expect(caseId).toBeTruthy();
    const fixtureOutputs = new Map([
      [
        caseId!,
        createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.9,
          objectiveSummary: "Incorrect execution route.",
          requestedActions: [
            { action: "code_edit", objectSummary: "incorrect edit", confidence: 1 },
          ],
          sideEffectClass: "code_edit",
          riskClass: "medium",
          requestedAuthority: "local_yolo",
        }),
      ],
    ]);

    const run = runRouterShadowEval({ fixtureOutputs });

    expect(run.status).toBe("failed");
    expect(run.falseAllows).toBeGreaterThan(0);
    expect(run.executionFamilyFalseAllows).toBeGreaterThan(0);
  });

  it("records route-family accuracy separately from exact route accuracy", () => {
    const researchCase = ROUTING_EVAL_CORPUS.find(
      (evalCase) => evalCase.expected.route === "research_only",
    )!;
    const fixtureOutputs = new Map([
      [
        researchCase.evalCaseId,
        createBaseCanonicalRouterOutput({
          route: "workflow_execution",
          responseMode: "create_runtime_job",
          executeNow: true,
          workflowId: "agent_team.coding",
          jobType: "executor.agent_team",
          confidence: 0.9,
          objectiveSummary: "Different exact execution route.",
          requestedActions: [{ action: "research", objectSummary: "research", confidence: 1 }],
          sideEffectClass: "read_only",
          riskClass: "medium",
          requestedAuthority: "local_yolo",
        }),
      ],
    ]);

    const run = runRouterShadowEval({ corpus: [researchCase], fixtureOutputs });

    expect(run.routeAccuracy).toBe(0);
    expect(run.routeFamilyAccuracy).toBe(1);
    expect(run.caseResults[0]!.actualRoute).toBe("workflow_execution");
    expect(run.caseResults[0]!.routeFamilyMatched).toBe(true);
  });
});
