import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import {
  createDefaultModelTaskContractRegistry,
  INITIAL_MODEL_TASK_CONTRACTS,
} from "../model-tasks/contracts.ts";
import { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  scoreProvidedModelOutput,
  summarizeModelEvalRun,
  validateModelEvalFixture,
  type ModelEvalFixture,
} from "./eval-harness.ts";
import {
  createCodingExecutorModelCandidateEvalPlan,
  createModelCandidateValidationPlan,
  createProviderCatalogVerification,
  OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES,
  scoreCodingExecutorModelCandidateOutput,
} from "./model-candidate-validation-plan.ts";
import {
  createModelRoutePolicyForContract,
  listModelRoutePolicies,
  MODEL_ROUTE_CANDIDATES,
  routeEvidenceFromDecision,
  selectModelRoute,
} from "./policy.ts";
import type { ModelRouteCandidate } from "./types.ts";

const CONTRACT_IDS = INITIAL_MODEL_TASK_CONTRACTS.map((contract) => contract.id).toSorted(
  (left, right) => left.localeCompare(right),
);

function validInput() {
  return {
    task: "review structured result",
    input: { candidate: "bounded evidence" },
    constraints: ["return structured JSON"],
  };
}

function validOutput() {
  return {
    result: { label: "accepted", score: 0.91 },
    confidence: "high",
    evidence: ["matches deterministic expected fields"],
  };
}

function withoutCapabilities(
  model: string,
  capabilities: ModelRouteCandidate["capabilities"],
): ModelRouteCandidate[] {
  return MODEL_ROUTE_CANDIDATES.map((candidate) =>
    candidate.model === model ? { ...candidate, capabilities } : candidate,
  );
}

describe("model routing policy", () => {
  it("lists approved candidates for all five initial contracts", () => {
    const policies = listModelRoutePolicies();

    expect(policies.map((policy) => policy.contractId)).toEqual(CONTRACT_IDS);
    for (const policy of policies) {
      expect(policy.approvedModels.length).toBeGreaterThan(0);
      expect(policy.requiredCapabilities).toContain("structured_json");
      expect(policy.priority).toEqual(policy.approvedModels.map((candidate) => candidate.model));
    }
  });

  it("selects the first approved model with required capabilities", () => {
    const decision = selectModelRoute({ contractId: "retrieval.structured_json" });

    expect(decision).toMatchObject({
      selected: {
        provider: "openai",
        model: "gpt-mini-structured-json",
      },
      providerCallMade: false,
      reason: "selected first approved model satisfying required capabilities",
    });
  });

  it("rejects unknown contracts", () => {
    const decision = selectModelRoute({ contractId: "unknown.structured_json" });

    expect(decision.selected).toBeUndefined();
    expect(decision.rejected).toEqual([expect.objectContaining({ reason: "contract_unknown" })]);
  });

  it("rejects unapproved requested models", () => {
    const decision = selectModelRoute({
      contractId: "retrieval.structured_json",
      requestedModel: "openai-codex-policy-candidate",
    });

    expect(decision.selected).toBeUndefined();
    expect(decision.rejected).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "model_not_approved" })]),
    );
  });

  it("rejects approved models missing required capabilities", () => {
    const candidates = withoutCapabilities("gpt-mini-structured-json", ["structured_json"]);
    const policy = createModelRoutePolicyForContract("retrieval.structured_json", candidates);
    const decision = selectModelRoute({
      contractId: "retrieval.structured_json",
      policy,
      candidates,
      requestedModel: "gpt-mini-structured-json",
    });

    expect(decision.selected).toBeUndefined();
    expect(decision.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "missing_required_capability",
          missingCapabilities: ["json_schema", "low_cost"],
        }),
      ]),
    );
  });

  it("records no-candidate-available when all approved candidates are incapable", () => {
    const candidates = MODEL_ROUTE_CANDIDATES.map((candidate) => ({
      ...candidate,
      capabilities: ["structured_json"] as ModelRouteCandidate["capabilities"],
    }));
    const policy = createModelRoutePolicyForContract("retrieval.structured_json", candidates);
    const decision = selectModelRoute({
      contractId: "retrieval.structured_json",
      policy,
      candidates,
    });

    expect(decision.selected).toBeUndefined();
    expect(decision.rejected.at(-1)).toMatchObject({ reason: "no_candidate_available" });
  });

  it("produces JSON-safe route evidence without provider calls", () => {
    const evidence = routeEvidenceFromDecision(
      selectModelRoute({ contractId: "outcome_pack_review.structured_json" }),
    );

    expect(evidence.providerCallMade).toBe(false);
    expect(() => JSON.stringify(evidence)).not.toThrow();
    expect(JSON.parse(JSON.stringify(evidence))).toMatchObject({
      providerCallMade: false,
      policyVersion: "execution-platform.model-routing.v1",
    });
  });

  it("uses routing policy default evidence when enqueuing model tasks", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, {
        claimStrategy: "basic",
        now: () => new Date("2026-05-02T00:00:00.000Z"),
      });
      const modelTasks = new ModelTaskRepository(runtimeJobs, {
        registry: createDefaultModelTaskContractRegistry(),
      });

      const job = await modelTasks.enqueueModelTask({
        jobId: "routing-default-evidence",
        contractId: "retrieval.structured_json",
        input: validInput(),
      });
      const status = await modelTasks.readModelTaskStatus(job.jobId);

      expect(status.task?.routeEvidence).toMatchObject({
        selected: { model: "gpt-mini-structured-json" },
        providerCallMade: false,
        policyVersion: "execution-platform.model-routing.v1",
      });
      expect(status.evidence.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "model_task.route_evidence" }),
        ]),
      );
    } finally {
      await database.close();
    }
  });
});

describe("model eval harness", () => {
  const registry = createDefaultModelTaskContractRegistry();
  const candidate = MODEL_ROUTE_CANDIDATES[0]!;

  it("rejects fixtures with invalid contract input", () => {
    const fixture: ModelEvalFixture = {
      fixtureId: "invalid-input",
      contractId: "model_memory.structured_json",
      input: { input: {} },
      expectedSchemaValid: true,
    };

    expect(validateModelEvalFixture(registry, fixture)).toMatchObject({
      ok: false,
      fixtureId: "invalid-input",
    });
  });

  it("passes schema-valid supplied output with deterministic expected fields", () => {
    const fixture: ModelEvalFixture = {
      fixtureId: "valid-output",
      contractId: "skillifier.structured_json",
      input: validInput(),
      expectedSchemaValid: true,
      expectedFields: {
        "result.label": "accepted",
        confidence: "high",
      },
      notes: "fixture output is supplied by the test",
    };

    const scorecard = scoreProvidedModelOutput({
      registry,
      fixture,
      candidate,
      output: validOutput(),
    });

    expect(scorecard).toMatchObject({
      passed: true,
      score: 1,
      providerCallMade: false,
    });
  });

  it("fails schema-invalid supplied output", () => {
    const fixture: ModelEvalFixture = {
      fixtureId: "invalid-output",
      contractId: "proactivity.structured_json",
      input: validInput(),
      expectedSchemaValid: true,
    };

    const scorecard = scoreProvidedModelOutput({
      registry,
      fixture,
      candidate,
      output: { confidence: "high" },
    });

    expect(scorecard).toMatchObject({
      passed: false,
      score: 0,
      providerCallMade: false,
      validation: {
        output: { ok: false },
      },
    });
  });

  it("summarizes pass/fail counts and preserves no-provider-call evidence", () => {
    const passing = scoreProvidedModelOutput({
      registry,
      fixture: {
        fixtureId: "summary-pass",
        contractId: "retrieval.structured_json",
        input: validInput(),
        expectedSchemaValid: true,
      },
      candidate,
      output: validOutput(),
    });
    const failing = scoreProvidedModelOutput({
      registry,
      fixture: {
        fixtureId: "summary-fail",
        contractId: "retrieval.structured_json",
        input: validInput(),
        expectedSchemaValid: true,
      },
      candidate,
      output: { confidence: "medium" },
    });

    expect(summarizeModelEvalRun([passing, failing])).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      providerCallMade: false,
      scoreAverage: 0.5,
    });
  });
});

describe("agent-team model candidate validation plan", () => {
  it("requires Kimi 2.6, DeepSeek V4 Flash, and DeepSeek V4 Pro validation before first agent-team implementation", () => {
    const plan = createModelCandidateValidationPlan({
      planId: "test-agent-team-model-candidates",
      createdAt: "2026-05-03T12:20:00.000Z",
    });

    expect(plan.agentTeamImplementationAllowed).toBe(false);
    expect(plan.providerCallMade).toBe(false);
    expect(plan.liveEvalRun).toBe(false);
    expect(plan.candidates.map((candidate) => candidate.operatorRequestedLabel)).toEqual([
      "Kimi 2.6",
      "DeepSeek V4 Flash",
      "DeepSeek V4 Pro",
    ]);
    expect(plan.candidates.every((candidate) => !candidate.benchmarkClaimAcceptedAsFact)).toBe(
      true,
    );
    expect(plan.blockingReasons.join("\n")).toContain(
      "provider catalog or API availability verification",
    );
  });

  it("allows agent-team planning only after catalog and role-specific eval evidence exist", () => {
    const candidates = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES.map((candidate) => ({
      ...candidate,
      currentAvailabilityVerified: true,
      status: "ready_for_team_pilot" as const,
    }));
    const plan = createModelCandidateValidationPlan({
      planId: "test-agent-team-model-candidates-ready",
      createdAt: "2026-05-03T12:21:00.000Z",
      candidates,
      existingEvalEvidenceRefs: [
        ".artifacts/execution-platform/model-candidate-role-eval-scorecard.json",
      ],
    });

    expect(plan.agentTeamImplementationAllowed).toBe(true);
    expect(plan.blockingReasons).toEqual([]);
    expect(plan.candidates.every((candidate) => !candidate.providerCallMade)).toBe(true);
  });

  it("builds coding-executor fixtures and exact missing values for Kimi and DeepSeek evals", () => {
    const plan = createCodingExecutorModelCandidateEvalPlan({
      planId: "test-coding-executor-candidates",
      createdAt: "2026-05-03T12:22:00.000Z",
      env: {},
    });

    expect(plan.providerCallMade).toBe(false);
    expect(plan.liveEvalRun).toBe(false);
    expect(plan.evaluationRunReady).toBe(false);
    expect(plan.fixtures.map((fixture) => fixture.fixtureId)).toEqual([
      "repo_patch_with_validation_repair",
      "scope_control_and_command_hygiene",
    ]);
    expect(plan.exactMissingValues).toEqual(
      expect.arrayContaining([
        "Kimi 2.6: OPENROUTER_API_KEY",
        "DeepSeek V4 Flash: OPENROUTER_API_KEY",
        "DeepSeek V4 Pro: OPENROUTER_API_KEY",
        "OpenClaw coding-executor eval result refs",
      ]),
    );
  });

  it("tracks DeepSeek V4 Pro as a separate candidate from V4 Flash", () => {
    const flash = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES.find(
      (candidate) => candidate.candidateId === "deepseek-v4-coding-candidate",
    );
    const pro = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES.find(
      (candidate) => candidate.candidateId === "deepseek-v4-pro-coding-candidate",
    );

    expect(flash).toMatchObject({
      operatorRequestedLabel: "DeepSeek V4 Flash",
      openRouterModelId: "deepseek/deepseek-v4-flash",
      intendedUse: "coding_executor",
      currentAvailabilityVerified: false,
    });
    expect(pro).toMatchObject({
      operatorRequestedLabel: "DeepSeek V4 Pro",
      openRouterModelId: "deepseek/deepseek-v4-pro",
      intendedUse: "agent_team_role",
      currentAvailabilityVerified: false,
      status: "needs_provider_catalog_verification",
    });
    expect(pro?.openRouterModelId).not.toBe(flash?.openRouterModelId);
  });

  it("accepts catalog evidence only with provider key and model id evidence", () => {
    const kimi = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES[0]!;
    const missing = createProviderCatalogVerification({
      candidate: kimi,
      env: {},
      modelIds: ["moonshotai/kimi-k2.6"],
      sourceRefs: ["https://openrouter.ai/api/v1/models"],
      verificationKind: "openrouter_catalog_api",
    });
    expect(missing.currentAvailabilityVerified).toBe(false);
    expect(missing.exactMissingValues).toContain("OPENROUTER_API_KEY");

    const verified = createProviderCatalogVerification({
      candidate: kimi,
      env: { OPENROUTER_API_KEY: "redacted-test-key" },
      modelIds: ["moonshotai/kimi-k2.6"],
      sourceRefs: ["https://openrouter.ai/api/v1/models"],
      verificationKind: "openrouter_catalog_api",
    });
    expect(verified.currentAvailabilityVerified).toBe(true);
    expect(verified.exactMissingValues).toEqual([]);
    expect(verified.providerCallMade).toBe(false);
    expect(verified.catalogApiCallMade).toBe(true);
  });

  it("scores OpenRouter coding-executor outputs without storing raw prompt or response", () => {
    const candidate = OPERATOR_REQUESTED_AGENT_TEAM_MODEL_CANDIDATES[0]!;
    const fixture = createCodingExecutorModelCandidateEvalPlan().fixtures[0]!;

    const scorecard = scoreCodingExecutorModelCandidateOutput({
      candidate,
      fixture,
      promptHash: "sha256:prompt",
      responseHash: "sha256:response",
      providerCallMade: true,
      responseText: JSON.stringify({
        diagnosis: "The test failure needs a bounded source and test repair.",
        patchPlan: ["Edit only approved scope files."],
        validationPlan: ["Run focused tests and rerun after repair."],
        riskControls: [
          "Keep scope to approved files.",
          "Do not mutate Work Queue lifecycle.",
          "No deploy, outbound, or model promotion.",
        ],
        successCriteria: ["Validation passes after repair."],
        wouldNeedReview: false,
      }),
    });

    expect(scorecard).toMatchObject({
      provider: "openrouter",
      upstreamProvider: "moonshot",
      providerCallMade: true,
      rawPromptStored: false,
      rawResponseStored: false,
      jsonParsed: true,
      passed: true,
    });
  });
});
