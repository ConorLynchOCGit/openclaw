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

  it("projects terminal flows only as a compact linked correction pointer", () => {
    const context = buildManagedTaskFlowTurnContext(
      flow({
        status: "succeeded",
        stateJson: {
          proposal: {
            ref: "business-ops/candidates/proposal.md",
            digest: "abc123",
            fullSemanticHistory: "x".repeat(20_000),
          },
        },
      }),
      {
        stateJson: {
          continuitySchema: "openclaw.taskflow.correction.v1",
          priorFlowId: "flow-1",
          priorFlowRevision: 39,
          governingArtifactsDigest: "a".repeat(64),
          governingArtifactCount: 1,
        },
        governingArtifacts: [{ ref: "business-ops/candidates/proposal.md", digest: "abc123" }],
      },
    );

    expect(context).toContain("openclaw.taskflow.closeout_pointer.v1");
    expect(context).toContain('"priorFlowId": "flow-1"');
    expect(context).toContain('"priorFlowRevision": 39');
    expect(context).toContain('"handoffScope": "same_owner_session_key_and_requester_origin"');
    expect(context).toContain('"continuitySchema": "openclaw.taskflow.correction.v1"');
    expect(context).toContain('"governingArtifactsDigest":');
    expect(context).toContain('"ref": "business-ops/candidates/proposal.md"');
    expect(context).toContain('"digest": "abc123"');
    expect(context).toContain("A different session may not adopt the flow");
    expect(context).not.toContain("fullSemanticHistory");
    expect(context).not.toContain("x".repeat(1_000));
    expect(context?.length).toBeLessThan(4_000);
  });

  it("keeps exact correction state valid when display pointers exceed the context cap", () => {
    const context = buildManagedTaskFlowTurnContext(flow({ status: "succeeded" }), {
      stateJson: {
        continuitySchema: "openclaw.taskflow.correction.v1",
        priorFlowId: "flow-1",
        priorFlowRevision: 39,
        governingArtifactsDigest: "b".repeat(64),
        governingArtifactCount: 8,
      },
      governingArtifacts: Array.from({ length: 8 }, (_, index) => ({
        ref: `${index}-${"r".repeat(500)}`,
        digest: `${index}-${"d".repeat(500)}`,
      })),
    });

    expect(context).toContain('"governingArtifactsDigest":');
    expect(context).toContain('"governingArtifactsOmitted":');
    expect(context).not.toContain('governingArtifactsOmitted": true');
    expect(context?.length).toBeLessThan(4_000);
  });

  it("does not project task-mirrored flows", () => {
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
