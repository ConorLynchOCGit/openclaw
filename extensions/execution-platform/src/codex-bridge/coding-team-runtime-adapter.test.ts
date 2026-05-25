import { describe, expect, it } from "vitest";
import type { RuntimeWorkGraphNodeExecutor } from "../workflows/runtime-work-graph-scheduler.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import { buildCodingTeamSchedulerExecutorMap } from "./coding-team-runtime-adapter.ts";

const executor = (label: string): RuntimeWorkGraphNodeExecutor => ({
  execute: async () => ({
    status: "succeeded",
    outputArtifactRefs: [`artifact://${label}`],
    reasonCodes: [`${label}_completed`],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  }),
});

describe("coding team runtime adapter", () => {
  it("owns coding-specific scheduler executor registration outside the generic runtime", () => {
    const roleCalls: AgentTeamRoleId[] = [];
    const executors = buildCodingTeamSchedulerExecutorMap({
      roleExecutor: (roleId) => {
        roleCalls.push(roleId);
        return executor(roleId);
      },
      contextSynthesisExecutor: executor("context_synthesis"),
      implementationExecutor: executor("implementation"),
      repairExecutor: executor("repair"),
      validationExecutor: executor("validation"),
      closeoutExecutor: executor("closeout"),
      humanExecutor: executor("human"),
    });

    expect(Object.keys(executors).toSorted()).toEqual(
      [
        "kind:closeout",
        "kind:context_scout",
        "kind:context_synthesis",
        "kind:human_task",
        "kind:implementation",
        "kind:observability_readback",
        "kind:repair",
        "kind:reviewer",
        "kind:test_authoring",
        "kind:test_review",
        "kind:validation",
        "role:context_scout",
        "role:context_synthesis",
        "role:implementation_engineer",
        "role:observability_scribe",
        "role:reviewer",
        "role:test_engineer",
      ].toSorted(),
    );
    expect(roleCalls).toEqual([
      "context_scout",
      "test_engineer",
      "reviewer",
      "observability_scribe",
      "context_scout",
      "reviewer",
      "observability_scribe",
    ]);
  });
});
