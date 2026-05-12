import { describe, expect, it } from "vitest";
import { ROUTING_EVAL_CORPUS, validateRoutingEvalCorpus } from "./routing-eval-corpus.ts";
import { runRoutingEvalHarness } from "./routing-eval-harness.ts";
import { runRoutingInjectionHardeningEval } from "./routing-injection-cases.ts";
import { InMemoryRoutingTelemetryStore } from "./routing-telemetry-store.ts";

describe("Intent Front Door Slices 24-26 integration", () => {
  it("feeds corpus cases through the eval harness and records bounded telemetry", async () => {
    const telemetry = new InMemoryRoutingTelemetryStore();
    const validation = validateRoutingEvalCorpus();
    const result = await runRoutingEvalHarness({
      evalRunId: "slices-24-26-integration",
      telemetryStore: telemetry,
    });

    expect(validation.valid).toBe(true);
    expect(result.status).toBe("passed");
    expect(result.totalCases).toBe(ROUTING_EVAL_CORPUS.length);
    expect(telemetry.list().length).toBeGreaterThan(0);
    expect(telemetry.list().every((record) => !record.rawPromptStored)).toBe(true);
    expect(telemetry.list().every((record) => !record.rawProviderLogStored)).toBe(true);
  });

  it("preserves negation, conditional deploy, multi-intent, control, and provider-outage safety", async () => {
    const result = await runRoutingEvalHarness({ evalRunId: "slices-24-26-safety" });
    const byCategory = new Map(
      result.caseResults.map((caseResult) => [caseResult.category, caseResult]),
    );

    expect(byCategory.get("do_not_send")?.runtimeJobCreated).toBe(true);
    expect(
      ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "do_not_send")?.expected.actions
        .negated,
    ).toContain("outbound_send");
    expect(
      ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "deploy_if_policy_permits")
        ?.expected.actions.conditional,
    ).toContain("deploy");
    expect(byCategory.get("research_then_implement")?.runtimeJobCreated).toBe(true);
    expect(byCategory.get("cancel_that_job")?.runtimeJobCreated).toBe(false);
    expect(byCategory.get("continue")?.clarificationRequired).toBe(true);
    expect(byCategory.get("ship_it")?.clarificationRequired).toBe(true);
    expect(byCategory.get("provider_unavailable")?.validatorOutcome).toBe("blocked");
    expect(result.hardFailures).toEqual([]);
  });

  it("proves malicious tool output cannot grant authority, create jobs, or mutate lifecycle", async () => {
    const result = await runRoutingInjectionHardeningEval({
      evalRunId: "slices-24-26-injection",
    });

    expect(result.status).toBe("passed");
    expect(result.falseAllows).toBe(0);
    expect(result.hardFailures).toEqual([]);
    expect(result.providerCallsMade).toBe(false);
    expect(result.runtimeJobsCreated).toBe(false);
    expect(result.workQueueLifecycleMutated).toBe(false);
    expect(JSON.stringify(result)).not.toContain("raw provider log");
  });
});
