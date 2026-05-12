import { describe, expect, it } from "vitest";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import { ROUTING_EVAL_CORPUS, type RoutingEvalCase } from "./routing-eval-corpus.ts";
import { runRoutingEvalHarness } from "./routing-eval-harness.ts";

describe("Routing eval harness", () => {
  it("runs the routing corpus through real front-door gates with fixture router outputs", async () => {
    const result = await runRoutingEvalHarness({ evalRunId: "routing-eval-harness-test" });

    expect(result.status).toBe("passed");
    expect(result.totalCases).toBe(ROUTING_EVAL_CORPUS.length);
    expect(result.passedCount).toBe(result.totalCases);
    expect(result.routeAccuracy).toBe(1);
    expect(result.falseAllows).toBe(0);
    expect(result.falseBlocks).toBe(0);
    expect(result.schemaFailures).toBe(0);
    expect(result.hardFailures).toEqual([]);
    expect(result.rawPromptStored).toBe(false);
    expect(result.rawProviderLogStored).toBe(false);
    expect(result.providerCallsMade).toBe(false);
    expect(result.runtimeJobsCreated).toBe(false);
    expect(result.workQueueLifecycleMutated).toBe(false);
  });

  it("reports clarification, escalation, blocked, and provider outage metrics", async () => {
    const result = await runRoutingEvalHarness({ evalRunId: "routing-eval-harness-metrics" });

    expect(result.clarificationRate).toBeGreaterThan(0);
    expect(result.escalationCount).toBeGreaterThan(0);
    expect(result.blockedCount).toBeGreaterThan(0);
    expect(
      result.caseResults.some((caseResult) => caseResult.category === "provider_unavailable"),
    ).toBe(true);
    expect(
      result.caseResults.find((caseResult) => caseResult.category === "provider_unavailable")
        ?.validatorOutcome,
    ).toBe("blocked");
  });

  it("detects false allows and unexpected runtime job creation as hard failures", async () => {
    const unsafeCase = {
      ...ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "have_the_team")!,
      evalCaseId: "eval-false-allow-fixture",
      expected: {
        ...ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "have_the_team")!.expected,
        runtimeJobCreated: false,
      },
    } satisfies RoutingEvalCase;

    const result = await runRoutingEvalHarness({
      evalRunId: "routing-eval-false-allow",
      corpus: [unsafeCase],
    });

    expect(result.status).toBe("failed");
    expect(result.falseAllows).toBe(1);
    expect(result.hardFailures.map((failure) => failure.kind)).toContain(
      "unexpected_runtime_job_created",
    );
  });

  it("detects false blocks", async () => {
    const falseBlockCase = {
      ...ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "chat_only")!,
      evalCaseId: "eval-false-block-fixture",
      expected: {
        ...ROUTING_EVAL_CORPUS.find((evalCase) => evalCase.category === "chat_only")!.expected,
        runtimeJobCreated: true,
      },
    } satisfies RoutingEvalCase;

    const result = await runRoutingEvalHarness({
      evalRunId: "routing-eval-false-block",
      corpus: [falseBlockCase],
    });

    expect(result.status).toBe("failed");
    expect(result.falseBlocks).toBe(1);
  });

  it("detects schema failure and raw-storage violations", async () => {
    const schemaFailureCase = {
      ...ROUTING_EVAL_CORPUS[0]!,
      evalCaseId: "eval-schema-failure-fixture",
      routerOutput: {
        ...createBaseCanonicalRouterOutput({
          route: "chat_response",
          responseMode: "answer_in_chat",
          confidence: 0.9,
          objectiveSummary: "Invalid raw storage fixture.",
        }),
        rawPromptStored: true as false,
      },
      expected: {
        ...ROUTING_EVAL_CORPUS[0]!.expected,
        validatorOutcome: "blocked",
        runtimeJobCreated: false,
      },
    } satisfies RoutingEvalCase;

    const result = await runRoutingEvalHarness({
      evalRunId: "routing-eval-schema-failure",
      corpus: [schemaFailureCase],
    });

    expect(result.status).toBe("failed");
    expect(result.schemaFailures).toBe(1);
    expect(result.caseResults[0]?.hardFailures.map((failure) => failure.kind)).toContain(
      "raw_storage_allow",
    );
  });

  it("keeps slash protocol cases out of model routing", async () => {
    const slashCase = ROUTING_EVAL_CORPUS.find(
      (evalCase) => evalCase.category === "slash_protocol",
    )!;
    const result = await runRoutingEvalHarness({
      evalRunId: "routing-eval-slash",
      corpus: [slashCase],
    });

    expect(result.status).toBe("passed");
    expect(result.caseResults[0]?.validatorOutcome).toBe("protocol_bypass");
    expect(result.caseResults[0]?.hardFailures).toEqual([]);
  });
});
