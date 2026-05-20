import { describe, expect, it } from "vitest";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
} from "./runtime-node-capability-registry.ts";
import {
  deriveRuntimeTaskBudgetPolicy,
  runtimeToolBudgetFromPolicy,
  validateRuntimeTaskBudgetPolicy,
} from "./runtime-task-budget-policy.ts";

describe("runtime task budget policy", () => {
  it("gives Product/Spec-class work a long-running budget instead of the kernel default", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const capability = findRuntimeNodeCapability("implementation_complex", manifest);

    const policy = deriveRuntimeTaskBudgetPolicy({
      workflowId: "agent_team.product_spec_planning",
      nodeKind: "implementation",
      roleId: "implementation_engineer",
      capability,
      missionCommitmentCount: 5,
    });

    expect(policy.budgetClass).toBe("long_running");
    expect(policy.runtimeToolTimeoutMs).toBeGreaterThan(120_000);
    expect(policy.progressEmissionIntervalMs).toBeLessThan(policy.staleProgressAfterMs);
    expect(validateRuntimeTaskBudgetPolicy(policy)).toEqual([]);

    const runtimeToolBudget = runtimeToolBudgetFromPolicy(policy);
    expect(runtimeToolBudget.budgetRef).toContain("runtime-task-budget://");
    expect(runtimeToolBudget.timeoutMs).toBe(policy.runtimeToolTimeoutMs);
    expect(runtimeToolBudget.metadata).toMatchObject({
      budgetClass: "long_running",
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("rejects long-running policies that collapse back to a two-minute timeout", () => {
    const policy = deriveRuntimeTaskBudgetPolicy({
      workflowId: "agent_team.product_spec_planning",
      expectedLongRunning: true,
    });

    expect(
      validateRuntimeTaskBudgetPolicy({
        ...policy,
        runtimeToolTimeoutMs: 120_000,
      }),
    ).toContain("long_running_runtime_tool_timeout_too_short");
  });
});
