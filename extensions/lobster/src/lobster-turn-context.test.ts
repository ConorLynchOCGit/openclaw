import { describe, expect, it } from "vitest";
import {
  buildManagedTaskFlowTurnContext,
  type TaskFlowTurnContextRecord,
} from "./lobster-turn-context.js";

function flow(overrides: Partial<TaskFlowTurnContextRecord> = {}): TaskFlowTurnContextRecord {
  return {
    flowId: "flow-1",
    syncMode: "managed",
    ownerKey: "agent:business-ops:subagent:owner",
    controllerId: "openclaw.business-ops.collaborative-refinement",
    revision: 39,
    status: "waiting",
    goal: "Refine the current brand platform",
    currentStep: "await_ceo_approval",
    stateJson: {
      proposal: {
        id: "proposal-1",
        ref: "business-ops/candidates/proposal.md",
        digest: "abc123",
      },
    },
    updatedAt: 1_720_000_000_000,
    ...overrides,
  };
}

describe("buildManagedTaskFlowTurnContext", () => {
  it("projects the exact current managed checkpoint", () => {
    const context = buildManagedTaskFlowTurnContext(flow());

    expect(context).toContain("openclaw.taskflow.turn_context.v1");
    expect(context).toContain('"revision": 39');
    expect(context).toContain('"id": "proposal-1"');
    expect(context).toContain('"ref": "business-ops/candidates/proposal.md"');
    expect(context).toContain('"digest": "abc123"');
    expect(context).toContain("older transcript proposals are audit history");
  });

  it("does not project terminal or task-mirrored flows", () => {
    expect(buildManagedTaskFlowTurnContext(flow({ status: "succeeded" }))).toBeUndefined();
    expect(buildManagedTaskFlowTurnContext(flow({ syncMode: "task_mirrored" }))).toBeUndefined();
  });

  it("bounds oversized state without truncating JSON", () => {
    const context = buildManagedTaskFlowTurnContext(
      flow({ stateJson: { payload: "x".repeat(20_000) } }),
    );

    expect(context).toContain('"omitted": true');
    expect(context).toContain('"maxChars": 16000');
    expect(context).not.toContain("x".repeat(1_000));
    expect(() => {
      const json = context?.match(/\{[\s\S]*\}/)?.[0];
      if (!json) {
        throw new Error("missing projected JSON");
      }
      JSON.parse(json);
    }).not.toThrow();
  });
});
