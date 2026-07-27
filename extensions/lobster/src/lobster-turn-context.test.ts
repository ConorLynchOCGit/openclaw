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
  it("projects the current managed checkpoint and bounds oversized state", () => {
    const context = buildManagedTaskFlowTurnContext(flow());
    expect(context).toContain("openclaw.taskflow.turn_context.v1");
    expect(context).toContain('"revision": 39');
    expect(context).toContain('"ref": "business-ops/candidates/proposal.md"');
    expect(context).toContain("older transcript proposals are audit history");

    const oversized = buildManagedTaskFlowTurnContext(
      flow({ stateJson: { payload: "x".repeat(20_000) } }),
    );
    expect(oversized).toContain('"omitted": true');
    expect(oversized).not.toContain("x".repeat(1_000));
  });

  it("projects terminal flows only as a bounded exact correction pointer", () => {
    const context = buildManagedTaskFlowTurnContext(flow({ status: "succeeded" }), {
      stateJson: {
        continuitySchema: "openclaw.taskflow.correction.v1",
        priorFlowId: "flow-1",
        priorFlowRevision: 39,
        governingArtifactsDigest: "a".repeat(64),
        governingArtifactCount: 1,
      },
      governingArtifacts: [{ ref: "business-ops/candidates/proposal.md", digest: "abc123" }],
    });

    expect(context).toContain("openclaw.taskflow.closeout_pointer.v1");
    expect(context).toContain('"priorFlowRevision": 39');
    expect(context).toContain('"handoffScope": "same_owner_session_key_and_requester_origin"');
    expect(context).toContain("A different session may not adopt the flow");
    expect(context?.length).toBeLessThan(4_000);
  });

  it("does not project mirrored or terminal flows without an exact handoff", () => {
    expect(buildManagedTaskFlowTurnContext(flow({ syncMode: "task_mirrored" }))).toBeUndefined();
    expect(buildManagedTaskFlowTurnContext(flow({ status: "succeeded" }))).toBeUndefined();
  });
});
