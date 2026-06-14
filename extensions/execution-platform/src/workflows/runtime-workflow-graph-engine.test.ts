import { describe, expect, it } from "vitest";
import { RuntimeWorkflowGraphEngine } from "./runtime-workflow-graph-engine.ts";

const executor = {
  execute: async () => ({
    status: "succeeded" as const,
    outputArtifactRefs: [],
    reasonCodes: [],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    workQueueLifecycleMutated: false as const,
  }),
};

function codingExecutors() {
  return {
    "kind:implementation": executor,
    "kind:validation": executor,
    "kind:test_review": executor,
    "kind:repair": executor,
    "kind:reviewer": executor,
    "kind:observability_readback": executor,
    "kind:human_task": executor,
    "kind:closeout": executor,
    "role:implementation_engineer": executor,
    "role:test_engineer": executor,
    "role:reviewer": executor,
    "role:observability_scribe": executor,
  };
}

describe("RuntimeWorkflowGraphEngine", () => {
  it("accepts production coding only when all canonical executors and runtime-tool kernel are present", () => {
    const engine = new RuntimeWorkflowGraphEngine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    expect(
      engine.evaluateReadiness({
        workflowId: "agent_team.coding",
        executors: codingExecutors(),
      }),
    ).toMatchObject({
      ready: true,
      workflowId: "agent_team.coding",
      pluginId: "workflow-plugin.agent_team.coding.v1",
      pluginReady: true,
      missingExecutorKeys: [],
      missingPluginExecutorKeys: [],
    });
  });

  it("rejects production coding when executor coverage or the runtime-tool kernel is missing", () => {
    const engine = new RuntimeWorkflowGraphEngine({
      graphs: {} as never,
      runtimeToolKernel: null,
    });

    const readiness = engine.evaluateReadiness({
      workflowId: "agent_team.coding",
      executors: {
        "kind:implementation": executor,
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.reasonCodes).toContain(
      "runtime_workflow_graph_engine_runtime_tool_kernel_missing",
    );
    expect(readiness.missingExecutorKeys).toEqual(
      expect.arrayContaining(["kind:closeout", "role:reviewer"]),
    );
    expect(readiness.missingPluginExecutorKeys).toEqual(
      expect.arrayContaining(["kind:closeout", "role:reviewer"]),
    );
  });
});
