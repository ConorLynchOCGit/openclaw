import { describe, expect, it } from "vitest";
import { PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS } from "./product-spec-planning-plugin.ts";
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
    "kind:context_scout": executor,
    "kind:implementation": executor,
    "kind:validation": executor,
    "kind:test_review": executor,
    "kind:repair": executor,
    "kind:reviewer": executor,
    "kind:observability_readback": executor,
    "kind:human_task": executor,
    "kind:closeout": executor,
    "role:context_scout": executor,
    "role:implementation_engineer": executor,
    "role:test_engineer": executor,
    "role:reviewer": executor,
    "role:observability_scribe": executor,
  };
}

function productSpecExecutors() {
  return Object.fromEntries(
    PRODUCT_SPEC_PLANNING_PLUGIN_EXECUTOR_KEYS.map((key) => [key, executor]),
  );
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
      expect.arrayContaining(["kind:context_scout", "kind:closeout", "role:reviewer"]),
    );
    expect(readiness.missingPluginExecutorKeys).toEqual(
      expect.arrayContaining(["kind:context_scout", "kind:closeout", "role:reviewer"]),
    );
  });

  it("accepts production Product/Spec Planning with scheduler executors and runtime-tool kernel", () => {
    const engine = new RuntimeWorkflowGraphEngine({
      graphs: {} as never,
      runtimeToolKernel: {} as never,
    });

    const readiness = engine.evaluateReadiness({
      workflowId: "agent_team.product_spec_planning",
      executors: productSpecExecutors(),
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.pluginId).toBe("workflow-plugin.agent_team.product_spec_planning.v1");
    expect(readiness.missingExecutorKeys).toEqual([]);
    expect(readiness.missingPluginExecutorKeys).toEqual([]);
    expect(readiness.reasonCodes).toContain("workflow_definition_production_enabled");
    expect(readiness.reasonCodes).toContain("workflow_definition_scheduler_backed");
  });
});
