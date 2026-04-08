import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryLearnedGuidancePlanTool,
  normalizeMemoryLearnedGuidancePlanInput,
} from "./memory-learned-guidance-plan.js";

function createRuntime() {
  return {
    learnedGuidanceAdvisoryPlanning: {
      plan: vi.fn(async () => ({
        accepted: true as const,
        status: "ok" as const,
        outcome: "guidance_available" as const,
        advisoryOnly: true as const,
        advisoryNote:
          "Advisory only. Approved workflow guidance is surfaced as bounded inline suggestions and does not change execution authority.",
        query: "how should I commit scoped repo changes?",
        applicationMode: "guidance_only" as const,
        suggestions: [],
        suppressedConflicts: [],
        rationale: [
          "approved workflow-guidance lessons matched the current query strongly enough to surface inline advice",
        ],
        rolloutScope: {
          rolloutPhase: "bounded_rollout_proof_v1" as const,
          enablementTarget: "off-production" as const,
          mode: "inline-only" as const,
          source: "approved_workflow_guidance" as const,
          approvedOnly: true as const,
          advisoryOnly: true as const,
          inlineOnly: true as const,
          allowedLessonFamilies: ["generalized_workflow_lesson", "supported_lesson"] as const,
          defaultMaxSuggestions: 2,
        },
        observability: {
          outcomeCode: "guidance_available" as const,
          retrievedRecordCount: 1,
          eligibleWorkflowGuidanceCount: 1,
          filteredOutByScopeCount: 0,
          suggestionCount: 0,
          suppressedConflictCount: 0,
          nativeSuggestionCount: 0,
          selfImprovingSuggestionCount: 0,
          estimatedPromptTokens: 12,
          reasons: ["approved workflow guidance matched the current query"],
        },
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory learned-guidance-plan tool", () => {
  it("normalizes bounded learned-guidance planning input", () => {
    expect(
      normalizeMemoryLearnedGuidancePlanInput({
        query: "  how should I commit scoped repo changes? ",
        projectId: " project-1 ",
        maxSuggestions: "2",
      }),
    ).toEqual({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
      maxSuggestions: 2,
    });
  });

  it("routes learned-guidance planning through the advisory planner seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryLearnedGuidancePlanTool({ runtime });

    const result = await tool.execute("call-1", {
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
      maxSuggestions: 2,
    });

    expect(runtime.learnedGuidanceAdvisoryPlanning.plan).toHaveBeenCalledWith({
      query: "how should I commit scoped repo changes?",
      projectId: "project-1",
      maxSuggestions: 2,
    });
    expect(result.details).toMatchObject({
      accepted: true,
      status: "ok",
      outcome: "guidance_available",
      advisoryOnly: true,
      applicationMode: "guidance_only",
      rolloutScope: {
        defaultMaxSuggestions: 2,
      },
      observability: {
        outcomeCode: "guidance_available",
      },
    });
  });
});
