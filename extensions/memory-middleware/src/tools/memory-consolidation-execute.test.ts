import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryConsolidationExecuteTool,
  executeMemoryConsolidationFromTool,
  normalizeMemoryConsolidationExecuteInput,
} from "./memory-consolidation-execute.js";

function createRuntime(): MemoryMiddlewareRuntime {
  return {
    consolidationExecution: {
      execute: vi.fn(async (input) => ({
        accepted: true,
        status: "executed",
        executionMode: input.approvedFindings?.length ? "approved_subset" : "plan_all_eligible",
        reviewedFindingCount: input.approvedFindings?.length ?? 0,
        executedActionCount: 1,
        alreadyExecutedCount: 0,
        skippedFindingCount: 0,
        actions: [],
        rationale: ["ok"],
      })),
    },
  } as unknown as MemoryMiddlewareRuntime;
}

describe("memory_consolidation_execute tool", () => {
  it("normalizes optional planner fields plus approved findings", () => {
    expect(
      normalizeMemoryConsolidationExecuteInput({
        rawParams: {
          projectId: "project-1",
          includeValidatedProcedures: false,
          limit: 12,
          maxFindings: 4,
          reviewerAgentId: "agent-reviewer",
          approvedFindings: [
            {
              actionType: "duplicate_merge_review",
              affectedObjectIds: ["memory-b", "memory-a"],
            },
          ],
        },
      }),
    ).toEqual({
      projectId: "project-1",
      includeValidatedProcedures: false,
      limit: 12,
      maxFindings: 4,
      reviewerAgentId: "agent-reviewer",
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: ["memory-b", "memory-a"],
        },
      ],
    });
  });

  it("falls back to trusted tool context for reviewerAgentId", () => {
    expect(
      normalizeMemoryConsolidationExecuteInput({
        rawParams: {},
        context: { agentId: "agent-from-context" },
      }),
    ).toEqual({
      reviewerAgentId: "agent-from-context",
    });
  });

  it("routes execution through the consolidation runtime seam", async () => {
    const runtime = createRuntime();

    const result = await executeMemoryConsolidationFromTool({
      runtime,
      input: {
        approvedFindings: [
          {
            actionType: "stale_superseded_review",
            affectedObjectIds: ["memory-1"],
          },
        ],
      },
    });

    expect(runtime.consolidationExecution.execute).toHaveBeenCalledWith({
      approvedFindings: [
        {
          actionType: "stale_superseded_review",
          affectedObjectIds: ["memory-1"],
        },
      ],
    });
    expect(result).toMatchObject({
      accepted: true,
      status: "executed",
      executionMode: "approved_subset",
    });
  });

  it("registers the bounded execution tool shape", async () => {
    const runtime = createRuntime();
    const tool = createMemoryConsolidationExecuteTool({
      runtime,
      context: { agentId: "agent-from-context" },
    });

    expect(tool.name).toBe("memory_consolidation_execute");

    const result = await tool.execute("call-1", {
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: ["memory-1", "memory-2"],
        },
      ],
    });

    expect(result).toMatchObject({
      details: expect.objectContaining({
        accepted: true,
        status: "executed",
      }),
    });
  });
});
