import { describe, expect, it, vi } from "vitest";
import type { MemoryProactivePlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryProactivePlanTool,
  normalizeMemoryProactivePlanInput,
} from "./memory-proactive-plan.js";

function createPlanResult(): MemoryProactivePlanResult {
  return {
    accepted: true,
    status: "ok",
    outcome: "actions_available",
    projectId: "project-1",
    advisoryOnly: true,
    advisoryNote: "Advisory only. No proactive actions were executed.",
    actions: [
      {
        actionType: "follow_up_candidate_review",
        priority: "high",
        actionClass: "candidate_review_follow_up",
        requiredApprovalClass: "conversational_review",
        affectedIds: ["candidate-1", "candidate-2"],
        rationale: [
          "candidate-state memory objects remain unreviewed",
          "a conversational review step is required before any later promotion planning or writes",
        ],
        advisoryOnly: true,
        advisoryNote: "Advisory only. No proactive actions were executed.",
      },
    ],
    inspectedState: {
      pendingCandidateReviewCount: 2,
      eligibleProcedureValidationCount: 0,
      candidateSkillGovernanceCount: 0,
      staleMemoryCount: 0,
      driftCheckCount: 0,
      consolidationReviewCount: 0,
    },
    rationale: [
      "bounded middleware state contains advisory-only proactive follow-up opportunities",
    ],
  };
}

function createRuntime() {
  return {
    proactivePlanning: {
      plan: vi.fn(async () => createPlanResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory proactive-plan tool", () => {
  it("normalizes optional proactive-planning inputs", () => {
    expect(
      normalizeMemoryProactivePlanInput({
        projectId: " project-1 ",
        maxActions: "4",
      }),
    ).toEqual({
      projectId: "project-1",
      maxActions: 4,
    });
  });

  it("routes planning requests through the proactive-planning seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryProactivePlanTool({ runtime });

    const result = await tool.execute("call-1", {
      projectId: "project-1",
      maxActions: 3,
    });

    expect(runtime.proactivePlanning.plan).toHaveBeenCalledWith({
      projectId: "project-1",
      maxActions: 3,
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(createPlanResult(), null, 2),
        },
      ],
      details: createPlanResult(),
    });
  });

  it("surfaces advisory no-action results without mutation", async () => {
    const runtime = createRuntime();
    const noActionResult: MemoryProactivePlanResult = {
      accepted: true,
      status: "ok",
      outcome: "no_action",
      advisoryOnly: true,
      advisoryNote: "Advisory only. No proactive actions were executed.",
      actions: [
        {
          actionType: "no_action",
          priority: "none",
          actionClass: "none",
          requiredApprovalClass: "none",
          affectedIds: [],
          rationale: [
            "bounded middleware state does not currently suggest a useful proactive follow-up",
          ],
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
        consolidationReviewCount: 0,
      },
      rationale: ["no bounded proactive follow-up opportunities were identified"],
    };
    runtime.proactivePlanning.plan = vi.fn(async () => noActionResult);
    const tool = createMemoryProactivePlanTool({ runtime });

    const result = await tool.execute("call-2", {});

    expect(result.details).toEqual(noActionResult);
  });
});
