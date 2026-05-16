import { describe, expect, it } from "vitest";
import {
  createChildWorkOrder,
  createChildWorkOrdersFromPlan,
  normalizeOrchestratorDelegationReview,
  parseContextScoutOutput,
  validateContextScoutOutputShape,
  validateChildWorkOrder,
  validateOrchestratorDelegationReviewShape,
} from "./child-work-order.ts";

describe("child work order contract", () => {
  it("creates concrete work orders from orchestrator child tasks", () => {
    const orders = createChildWorkOrdersFromPlan({
      graphId: "graph-1",
      orchestratorNodeId: "node-orchestrator",
      parentObjectiveSummary: "Improve Product/Spec Planning owner readback.",
      repoScopeRefs: ["extensions/execution-platform/src/work-queue/"],
      inputArtifactRefs: ["runtime-job://job/orchestrator"],
      validationCommandRefs: ["pnpm test:file work-queue.test.ts"],
      childTasks: [
        {
          actionId: "context",
          actionKind: "coding",
          title: "Inspect exact readback files",
          assignedRole: "context_scout",
          assignedWorkflow: "agent_team.coding",
          metadata: {
            objective:
              "Find exact files and code patterns needed for the owner readback implementation.",
            rationaleForCallingThisRole:
              "Context scout is needed before implementation so the edit worker receives concrete target evidence.",
            expectedOutput:
              "Relevant files, existing patterns, risks, recommended edit points, and implementation handoff summary.",
            acceptanceCriteria: ["Names concrete files.", "Provides handoff to implementation."],
            downstreamConsumer: "implementation_engineer",
            targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
          },
        },
        {
          actionId: "implement",
          actionKind: "coding",
          title: "Implement owner readback detail",
          assignedRole: "implementation_engineer",
          assignedWorkflow: "agent_team.coding",
          dependencyActionIds: ["context"],
          metadata: {
            targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
            objective:
              "Edit execution-read-model.ts to improve owner readback detail for the scoped planning objective.",
            rationaleForCallingThisRole:
              "Implementation engineer is needed because this child task requires a source edit.",
            expectedOutput: "Changed-file refs, diff hash, validation refs, and limitations.",
            acceptanceCriteria: [
              "Changes stay inside execution-read-model.ts.",
              "Validation refs are produced or handed off.",
            ],
            downstreamConsumer: "test_engineer",
          },
        },
      ],
    });

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      roleId: "context_scout",
      parentGraphId: "graph-1",
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(orders[0]?.objective).toContain("Find exact files");
    expect(orders[0]?.handoffTo).toContain("implementation_engineer");
    expect(orders[1]?.targetRefs).toEqual([
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ]);
    expect(validateChildWorkOrder(orders[0]!).valid).toBe(true);
    expect(validateChildWorkOrder(orders[1]!).valid).toBe(true);
  });

  it("rejects empty generic work orders without target or downstream consumer", () => {
    const order = createChildWorkOrder({
      parentGraphId: "graph-1",
      roleId: "reviewer",
      taskTitle: "Review",
      parentObjectiveSummary: "",
      repoScopeRefs: [],
      inputArtifactRefs: [],
      validationCommandRefs: [],
      handoffTo: [],
      objective: "Review.",
      rationaleForCallingThisRole: "Review.",
      expectedOutput: "Review.",
      acceptanceCriteria: [],
    });
    const validation = validateChildWorkOrder({
      ...order,
      handoffTo: [],
      targetRefs: [],
      targetRefsUnavailableReason: undefined,
      acceptanceCriteria: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "child_work_order_objective_missing_or_too_short",
        "child_work_order_rationale_missing_or_too_short",
        "child_work_order_target_refs_missing",
        "child_work_order_expected_output_missing_or_too_short",
        "child_work_order_acceptance_criteria_missing",
        "child_work_order_downstream_consumer_missing",
      ]),
    );
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("parses context scout output into useful implementation handoff evidence", () => {
    const output = parseContextScoutOutput({
      responseText: JSON.stringify({
        relevantFiles: [
          {
            path: "extensions/execution-platform/src/work-queue/execution-read-model.ts",
            whyRelevant: "Builds owner readback.",
            keySymbolsOrFunctions: ["buildExecutionReadModel"],
          },
        ],
        existingPatterns: ["readback projects bounded refs"],
        risks: ["do not store raw prompts"],
        recommendedEditPoints: [
          {
            path: "extensions/execution-platform/src/work-queue/execution-read-model.ts",
            symbolOrRegion: "owner progress section",
            reason: "surface child work order summaries",
          },
        ],
        validationSuggestions: ["pnpm test:file execution-read-model.test.ts"],
        handoffSummaryForImplementation:
          "Update owner progress readback to include child work order summaries.",
        confidence: 0.8,
        limitations: [],
      }),
      targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationCommandRefs: ["pnpm test:file execution-read-model.test.ts"],
    });

    expect(output.relevantFiles[0]?.keySymbolsOrFunctions).toContain("buildExecutionReadModel");
    expect(output.recommendedEditPoints[0]?.symbolOrRegion).toContain("owner progress");
    expect(validateContextScoutOutputShape(output)).toMatchObject({
      valid: true,
      semanticQualityJudgedByDeterministicCode: false,
    });
  });

  it("validates only required shape, not semantic usefulness", () => {
    const output = parseContextScoutOutput({
      responseText: JSON.stringify({
        relevantFiles: [{ path: "a.ts", whyRelevant: "target", keySymbolsOrFunctions: [] }],
      }),
      targetRefs: ["a.ts"],
      validationCommandRefs: [],
    });

    expect(validateContextScoutOutputShape(output)).toMatchObject({
      valid: true,
      reasonCodes: [],
      semanticQualityJudgedByDeterministicCode: false,
    });
  });

  it("normalizes orchestrator delegation review while keeping judgment model-authored", () => {
    const review = normalizeOrchestratorDelegationReview({
      reviewedWorkOrderId: "child-work-order-context",
      reviewedRoleId: "context_scout",
      modelRef: "openai-codex/gpt-5.5",
      providerPath: "codex_app_server",
      modelRunRef: "codex-app-server://review",
      responseText: JSON.stringify({
        assessment: {
          answeredWorkOrder: true,
          specificEnoughForNextStep: true,
          missingInformation: [],
          nextAction: "handoff_to_implementation",
          reasoningSummary:
            "Scout identified the readback builder and UI detail component, enough for a scoped edit.",
        },
        nextNodePlan: {
          roleId: "implementation_engineer",
          objective: "Add child work-order summaries to Work Queue readback.",
          targetRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
        },
        reasonCodes: ["context_scout_output_accepted_by_orchestrator"],
      }),
    });

    expect(review.assessment).toMatchObject({
      answeredWorkOrder: true,
      specificEnoughForNextStep: true,
      nextAction: "handoff_to_implementation",
    });
    expect(validateOrchestratorDelegationReviewShape(review)).toMatchObject({
      valid: true,
      semanticQualityJudgedByDeterministicCode: false,
    });
  });

  it("flags missing delegation review shape without judging child output quality", () => {
    const review = normalizeOrchestratorDelegationReview({
      reviewedWorkOrderId: "child-work-order-context",
      reviewedRoleId: "context_scout",
      modelRef: "openai-codex/gpt-5.5",
      providerPath: "codex_app_server",
      modelRunRef: "codex-app-server://review",
      responseText: JSON.stringify({}),
    });

    expect(validateOrchestratorDelegationReviewShape(review)).toMatchObject({
      valid: false,
      semanticQualityJudgedByDeterministicCode: false,
    });
    expect(validateOrchestratorDelegationReviewShape(review).reasonCodes).toEqual(
      expect.arrayContaining([
        "delegation_review_answered_work_order_missing",
        "delegation_review_specific_enough_missing",
      ]),
    );
  });
});
