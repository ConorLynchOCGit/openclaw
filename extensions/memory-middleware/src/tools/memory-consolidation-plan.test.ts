import { describe, expect, it, vi } from "vitest";
import type { ConsolidationPlanResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryConsolidationPlanTool,
  normalizeMemoryConsolidationPlanInput,
} from "./memory-consolidation-plan.js";

function createAcceptedResult(): ConsolidationPlanResult {
  return {
    accepted: true,
    status: "ok",
    outcome: "review_needed",
    inspectedRecordCount: 4,
    includeValidatedProcedures: true,
    findings: [
      {
        actionType: "duplicate_merge_review",
        priority: "medium",
        confidence: "high",
        affectedObjectIds: ["object-1", "object-2"],
        affectedObjectTypes: ["memory_object", "memory_object"],
        rationale: ["approved memory objects share the same normalized content"],
      },
    ],
    rationale: ["bounded durable memory contains 1 consolidation finding"],
  };
}

function createRuntime() {
  return {
    consolidationPlanning: {
      plan: vi.fn(async () => createAcceptedResult()),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory consolidation plan tool", () => {
  it("normalizes a consolidation-planning payload", () => {
    expect(
      normalizeMemoryConsolidationPlanInput({
        projectId: "project-1",
        includeValidatedProcedures: true,
        limit: "40",
        maxFindings: "10",
      }),
    ).toEqual({
      projectId: "project-1",
      includeValidatedProcedures: true,
      limit: 40,
      maxFindings: 10,
    });
  });

  it("routes planning through the consolidation-planning seam", async () => {
    const runtime = createRuntime();
    const tool = createMemoryConsolidationPlanTool({ runtime });

    const result = await tool.execute("call-1", {
      projectId: "project-1",
      includeValidatedProcedures: true,
      maxFindings: 10,
    });

    expect(runtime.consolidationPlanning.plan).toHaveBeenCalledWith({
      projectId: "project-1",
      includeValidatedProcedures: true,
      maxFindings: 10,
    });
    expect(result.details).toEqual(createAcceptedResult());
  });
});
