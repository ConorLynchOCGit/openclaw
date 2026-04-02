import { describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import {
  createMemoryDriftCheckExecuteTool,
  executeMemoryDriftCheckFromTool,
  normalizeMemoryDriftCheckExecuteInput,
} from "./memory-drift-check-execute.js";

function createRuntime(): MemoryMiddlewareRuntime {
  return {
    driftCheckExecution: {
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

describe("memory_drift_check_execute tool", () => {
  it("normalizes optional planner fields plus approved drift findings", () => {
    expect(
      normalizeMemoryDriftCheckExecuteInput({
        rawParams: {
          projectId: "project-1",
          includeValidatedProcedures: true,
          limit: 12,
          maxFindings: 4,
          reviewerAgentId: "agent-reviewer",
          approvedFindings: [
            {
              actionType: "drift_check_review",
              affectedObjectIds: ["object-1"],
            },
          ],
        },
      }),
    ).toEqual({
      projectId: "project-1",
      includeValidatedProcedures: true,
      limit: 12,
      maxFindings: 4,
      reviewerAgentId: "agent-reviewer",
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["object-1"],
        },
      ],
    });
  });

  it("falls back to trusted tool context for reviewerAgentId", () => {
    expect(
      normalizeMemoryDriftCheckExecuteInput({
        rawParams: {},
        context: { agentId: "agent-from-context" },
      }),
    ).toEqual({
      reviewerAgentId: "agent-from-context",
    });
  });

  it("routes execution through the drift-check runtime seam", async () => {
    const runtime = createRuntime();

    const result = await executeMemoryDriftCheckFromTool({
      runtime,
      input: {
        approvedFindings: [
          {
            actionType: "drift_check_review",
            affectedObjectIds: ["procedure-1"],
          },
        ],
      },
    });

    expect(runtime.driftCheckExecution.execute).toHaveBeenCalledWith({
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["procedure-1"],
        },
      ],
    });
    expect(result).toMatchObject({
      accepted: true,
      status: "executed",
      executionMode: "approved_subset",
    });
  });

  it("registers the bounded drift-check execution tool shape", async () => {
    const runtime = createRuntime();
    const tool = createMemoryDriftCheckExecuteTool({
      runtime,
      context: { agentId: "agent-from-context" },
    });

    expect(tool.name).toBe("memory_drift_check_execute");

    const result = await tool.execute("call-1", {
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["memory-1"],
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
