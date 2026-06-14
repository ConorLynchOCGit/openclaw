import { describe, expect, it, vi } from "vitest";
import {
  createWorkQueueExecutionEligibilityTool,
  formatWorkQueueExecutionEligibilityResult,
} from "./work-queue-execution-eligibility-tool.js";

function firstTextContent(
  result: Awaited<
    ReturnType<ReturnType<typeof createWorkQueueExecutionEligibilityTool>["execute"]>
  >,
): string {
  const content = result.content?.[0];
  return content?.type === "text" ? content.text : "";
}

describe("work_queue_execution_eligibility tool", () => {
  it("keeps the schema deterministic and out of semantic routing", () => {
    const tool = createWorkQueueExecutionEligibilityTool({
      readEligibility: vi.fn(),
    });
    const schema = JSON.stringify(tool.parameters);

    expect(schema).toContain("limit");
    expect(schema).toContain('"additionalProperties":false');
    expect(schema).not.toContain("executor");
    expect(schema).not.toContain("requirements");
    expect(schema).not.toContain("route");
    expect(tool.description).toContain("deterministic Work Queue execution eligibility");
    expect(tool.description).toContain("does not infer requirements");
    expect(tool.description).toContain("does not");
    expect(tool.description).toContain("mutate Work Queue lifecycle");
  });

  it("delegates to runtime readback and returns concise model-visible eligibility", async () => {
    const readEligibility = vi.fn(async () => ({
      artifactKind: "work_queue_execution_eligibility_read_model" as const,
      eligible: [
        {
          workItemId: "work-1",
          title: "Implement native orchestration",
          description: "Use native RuntimeJob sessions instead of legacy routing.",
          itemType: "platform_hardening",
          queueStatus: "active",
          lifecycleState: "draft",
          queueRank: 10,
          queuePosition: 1,
          sourceDocRefs: ["docs/projects/execution-platform/specs/native-orchestration.md"],
          artifactRefs: ["artifact://native-orchestration/context"],
          nextAction: "Start the native execution session from this queue item.",
          runtimeJobIds: [],
          reasonCodes: ["work_queue_item_eligible_by_queue_rank"],
        },
      ],
      excluded: [
        {
          workItemId: "work-2",
          title: "Already running",
          itemType: "platform_hardening",
          queueStatus: "active",
          lifecycleState: "draft",
          queueRank: 11,
          queuePosition: 2,
          runtimeJobIds: ["job-running"],
          reasonCodes: ["work_queue_item_already_has_active_runtime_job"],
        },
      ],
      source: "execution_platform_work_queue_db",
      ranking: "db_queue_rank_only" as const,
      semanticExecutorSelection: false as const,
      workQueueLifecycleMutationAllowed: false as const,
    }));
    const tool = createWorkQueueExecutionEligibilityTool({ readEligibility });

    const result = await tool.execute("call-eligibility", { limit: 5 });

    expect(readEligibility).toHaveBeenCalledWith({ limit: 5 });
    expect(result.content?.[0]?.type).toBe("text");
    const text = firstTextContent(result);
    expect(text).toContain("Eligible (1):");
    expect(text).toContain("work-1: Implement native orchestration");
    expect(text).toContain("description=Use native RuntimeJob sessions instead of legacy routing.");
    expect(text).toContain(
      "sourceDocRefs=docs/projects/execution-platform/specs/native-orchestration.md",
    );
    expect(text).toContain("nextAction=Start the native execution session from this queue item.");
    expect(text).toContain("ranking: db_queue_rank_only");
    expect(text).toContain("semanticExecutorSelection: false");
    expect(text).toContain("workQueueLifecycleMutationAllowed: false");
    expect(text).not.toContain("RequirementMap");
  });

  it("formats empty results without implying semantic executor selection", () => {
    const text = formatWorkQueueExecutionEligibilityResult({
      artifactKind: "work_queue_execution_eligibility_read_model",
      eligible: [],
      excluded: [],
      source: "execution_platform_work_queue_db",
      ranking: "db_queue_rank_only",
      semanticExecutorSelection: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(text).toContain("Eligible (0):");
    expect(text).toContain("- <none>");
    expect(text).toContain("semanticExecutorSelection: false");
    expect(text).not.toContain("executorWorkflowId");
  });
});
