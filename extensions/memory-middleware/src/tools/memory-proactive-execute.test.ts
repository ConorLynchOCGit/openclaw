import { describe, expect, it, vi } from "vitest";
import type {
  DriftCheckExecuteAcceptedResult,
  MemoryProactiveExecuteResult,
  ProcedureValidationPlanResult,
  SkillCandidateProcurementPlanResult,
} from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryProactiveExecuteTool,
  normalizeMemoryProactiveExecuteInput,
} from "./memory-proactive-execute.js";

function createDriftCheckResult(): DriftCheckExecuteAcceptedResult {
  return {
    accepted: true,
    status: "executed",
    executionMode: "approved_subset",
    reviewedFindingCount: 1,
    executedActionCount: 1,
    alreadyExecutedCount: 0,
    skippedFindingCount: 0,
    actions: [
      {
        actionType: "drift_check_review",
        status: "executed",
        affectedObjectId: "memory-1",
        affectedObjectType: "memory_object",
        driftCheckDueAt: "2026-03-01T00:00:00.000Z",
        eventId: "event-1",
        rationale: ["recorded bounded drift-check review state"],
      },
    ],
    rationale: ["1 bounded drift-check action recorded without rewriting stored facts"],
  };
}

function createRuntime() {
  return {
    candidateQuery: {
      get: vi.fn(async ({ candidateId }: { candidateId: string }) => ({
        accepted: true as const,
        status: "ok" as const,
        candidate: {
          id: candidateId,
          kind: "learning",
          memoryKind: "memory_object",
          reviewState: "candidate",
          content: "Candidate awaiting review",
          candidateMetadata: {
            canonicalIngestionCandidate: {
              record: {
                kind: "feedback",
                subject: "repo tests",
                statement: "use pnpm test -- <path-or-filter>",
                compatibility: {
                  captureCategory: "workflow_improvement",
                },
              },
              compatibility: {
                captureClass: "workflow_generalized_guidance",
              },
            },
          },
        },
      })),
    },
    proactivePlanning: {
      plan: vi.fn(),
    },
    procedureValidationPlan: {
      plan: vi.fn(
        async ({ procedureId }: { procedureId: string }) =>
          ({
            accepted: true,
            status: "ok",
            procedureId,
            procedureStatus: "draft",
            eligible: true,
            possibleTargets: ["propose_validated_procedure"],
            rationale: ["draft procedure appears validation-ready"],
            requiredGates: ["confirm the bounded validation step in chat"],
          }) satisfies ProcedureValidationPlanResult,
      ),
    },
    skillCandidateProcurementPlan: {
      plan: vi.fn(
        async ({ skillCandidateId }: { skillCandidateId: string }) =>
          ({
            accepted: true,
            status: "ok",
            skillCandidateId,
            skillCandidateStatus: "candidate",
            eligible: true,
            possibleTargets: ["propose_procurement_handoff"],
            rationale: ["skill candidate appears ready for bounded procurement follow-up"],
            requiredGates: ["confirm the bounded procurement follow-up in chat"],
          }) satisfies SkillCandidateProcurementPlanResult,
      ),
    },
    proactiveExecution: {
      execute: vi.fn(
        async () =>
          ({
            accepted: true,
            status: "executed",
            actionType: "run_drift_check",
            executionSource: "derived_plan",
            affectedIds: ["memory-1"],
            rationale: [
              "bounded proactive execution derived the run_drift_check action from the current advisory planner result",
            ],
            driftCheckExecution: createDriftCheckResult(),
          }) satisfies MemoryProactiveExecuteResult,
      ),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory proactive-execute tool", () => {
  it("normalizes proactive-execution input with optional context defaults", () => {
    expect(
      normalizeMemoryProactiveExecuteInput({
        rawParams: {
          actionType: "run_drift_check",
          projectId: " project-1 ",
          maxActions: "3",
          affectedIds: [" memory-2 ", "memory-1", "memory-2"],
        },
        context: {
          agentId: "agent-1",
        } as never,
      }),
    ).toEqual({
      actionType: "run_drift_check",
      projectId: "project-1",
      maxActions: 3,
      affectedIds: ["memory-1", "memory-2"],
      reviewerAgentId: "agent-1",
    });
  });

  it("routes proactive execution through the proactive-execution seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-1", {
      actionType: "run_drift_check",
      projectId: "project-1",
    });

    expect(runtime.proactiveExecution.execute).toHaveBeenCalledWith({
      actionType: "run_drift_check",
      projectId: "project-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "run_drift_check",
    });
  });

  it("turns candidate-review follow-up into conversational review prompts", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-2", {
      actionType: "follow_up_candidate_review",
      affectedIds: ["candidate-1"],
    });

    expect(runtime.proactiveExecution.execute).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "follow_up_candidate_review",
      executionSource: "explicit_selection",
      affectedIds: ["candidate-1"],
      rationale: [
        "bounded proactive execution prepared conversational candidate review prompts for the explicit selection",
      ],
    });
    expect(result.details).toMatchObject({
      candidateReviewPrompts: [
        expect.objectContaining({
          accepted: true,
          candidateId: "candidate-1",
          conversationalReview: expect.objectContaining({
            reviewToolName: "memory_candidate_review",
          }),
        }),
      ],
    });
  });

  it("turns procedure-validation follow-up into conversational prompts", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-3", {
      actionType: "follow_up_procedure_validation",
      affectedIds: ["procedure-1"],
    });

    expect(runtime.proactiveExecution.execute).not.toHaveBeenCalled();
    expect(runtime.procedureValidationPlan.plan).toHaveBeenCalledWith({
      procedureId: "procedure-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "follow_up_procedure_validation",
      executionSource: "explicit_selection",
      affectedIds: ["procedure-1"],
      conversationalPrompts: [
        expect.objectContaining({
          actionType: "follow_up_procedure_validation",
          targetId: "procedure-1",
          recommendedToolName: "memory_procedure_validate_plan",
        }),
      ],
    });
  });

  it("derives conversational skill-governance prompts from the planner", async () => {
    const runtime = createRuntime();
    runtime.proactivePlanning.plan = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "ok",
          outcome: "actions_available",
          advisoryOnly: true,
          advisoryNote: "Advisory only. No proactive actions were executed.",
          actions: [
            {
              actionType: "follow_up_skill_candidate_governance",
              priority: "medium",
              actionClass: "skill_candidate_governance_follow_up",
              requiredApprovalClass: "conversational_review",
              affectedIds: ["skill-1"],
              rationale: ["skill governance should be surfaced conversationally"],
              advisoryOnly: true,
              advisoryNote: "Advisory only. No proactive actions were executed.",
            },
          ],
          inspectedState: {
            pendingCandidateReviewCount: 0,
            eligibleProcedureValidationCount: 0,
            candidateSkillGovernanceCount: 1,
            staleMemoryCount: 0,
            driftCheckCount: 0,
            consolidationReviewCount: 0,
          },
          rationale: [
            "bounded middleware state contains advisory-only proactive follow-up opportunities",
          ],
        }) satisfies import("../db/runtime.js").MemoryProactivePlanResult,
    );
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-4", {
      actionType: "follow_up_skill_candidate_governance",
    });

    expect(runtime.proactiveExecution.execute).not.toHaveBeenCalled();
    expect(runtime.skillCandidateProcurementPlan.plan).toHaveBeenCalledWith({
      skillCandidateId: "skill-1",
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "follow_up_skill_candidate_governance",
      executionSource: "derived_plan",
      affectedIds: ["skill-1"],
      conversationalPrompts: [
        expect.objectContaining({
          actionType: "follow_up_skill_candidate_governance",
          targetId: "skill-1",
          recommendedToolName: "memory_skill_candidate_procurement_plan",
        }),
      ],
    });
  });

  it("turns stale-memory follow-up into a conversational consolidation prompt", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-5", {
      actionType: "revisit_stale_memory",
      affectedIds: ["memory-9"],
      projectId: "project-1",
    });

    expect(runtime.proactiveExecution.execute).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "revisit_stale_memory",
      executionSource: "explicit_selection",
      affectedIds: ["memory-9"],
      conversationalPrompts: [
        expect.objectContaining({
          actionType: "revisit_stale_memory",
          recommendedToolName: "memory_consolidation_plan",
          recommendedToolInput: {
            projectId: "project-1",
            maxFindings: 1,
          },
        }),
      ],
    });
  });

  it("derives conversational consolidation-review prompts from the planner", async () => {
    const runtime = createRuntime();
    runtime.proactivePlanning.plan = vi.fn(
      async () =>
        ({
          accepted: true,
          status: "ok",
          outcome: "actions_available",
          advisoryOnly: true,
          advisoryNote: "Advisory only. No proactive actions were executed.",
          actions: [
            {
              actionType: "review_consolidation_findings",
              priority: "medium",
              actionClass: "consolidation_review_follow_up",
              requiredApprovalClass: "conversational_review",
              affectedIds: ["memory-2", "memory-3"],
              rationale: ["consolidation findings should be surfaced conversationally"],
              advisoryOnly: true,
              advisoryNote: "Advisory only. No proactive actions were executed.",
            },
          ],
          inspectedState: {
            pendingCandidateReviewCount: 0,
            eligibleProcedureValidationCount: 0,
            candidateSkillGovernanceCount: 0,
            staleMemoryCount: 0,
            driftCheckCount: 0,
            consolidationReviewCount: 2,
          },
          rationale: [
            "bounded middleware state contains advisory-only proactive follow-up opportunities",
          ],
        }) satisfies import("../db/runtime.js").MemoryProactivePlanResult,
    );
    const tool = createMemoryProactiveExecuteTool({ runtime });

    const result = await tool.execute("call-6", {
      actionType: "review_consolidation_findings",
    });

    expect(runtime.proactiveExecution.execute).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      accepted: true,
      status: "executed",
      actionType: "review_consolidation_findings",
      executionSource: "derived_plan",
      affectedIds: ["memory-2", "memory-3"],
      conversationalPrompts: [
        expect.objectContaining({
          actionType: "review_consolidation_findings",
          recommendedToolName: "memory_consolidation_plan",
          recommendedToolInput: {
            maxFindings: 2,
          },
        }),
      ],
    });
  });

  it("rejects unknown proactive action types", () => {
    expect(() =>
      normalizeMemoryProactiveExecuteInput({
        rawParams: {
          actionType: "unknown_action",
        },
      }),
    ).toThrow("actionType must be one of:");
  });
});
