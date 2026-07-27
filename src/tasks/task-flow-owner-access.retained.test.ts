import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildManagedTaskFlowCloseoutHandoffForOwner,
  findLatestActiveManagedTaskFlowForOwner,
  findLatestTaskFlowForOwner,
  findLatestTerminalManagedTaskFlowForOwner,
  validateManagedTaskFlowCloseoutHandoffForOwner,
} from "./task-flow-owner-access.js";
import { createManagedTaskFlow as createManagedTaskFlowOrNull } from "./task-flow-registry.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";
import {
  configureTaskFlowRegistryRuntime,
  resetTaskFlowRegistryForTests,
} from "./task-runtime.test-helpers.js";

function createManagedTaskFlow(
  params: Parameters<typeof createManagedTaskFlowOrNull>[0],
): TaskFlowRecord {
  const flow = createManagedTaskFlowOrNull(params);
  if (!flow) {
    throw new Error("expected managed TaskFlow creation to succeed");
  }
  return flow;
}

beforeEach(() => {
  resetTaskFlowRegistryForTests({ persist: false });
  configureTaskFlowRegistryRuntime({
    store: {
      loadSnapshot: () => ({ flows: new Map() }),
      saveSnapshot: () => {},
      upsertFlow: () => {},
      deleteFlow: () => {},
    },
  });
});

afterEach(() => {
  resetTaskFlowRegistryForTests({ persist: false });
});

describe("retained TaskFlow owner continuity", () => {
  it("selects active continuity separately from a newer terminal closeout", () => {
    const active = createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/owner-access",
      goal: "Current continuity",
      status: "waiting",
      createdAt: 100,
      updatedAt: 100,
    });
    const terminal = createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/owner-access",
      goal: "Newer closeout",
      status: "succeeded",
      createdAt: 200,
      updatedAt: 200,
      endedAt: 200,
    });

    expect(findLatestTaskFlowForOwner({ callerOwnerKey: "agent:main:main" })?.flowId).toBe(
      terminal.flowId,
    );
    expect(
      findLatestActiveManagedTaskFlowForOwner({ callerOwnerKey: "agent:main:main" })?.flowId,
    ).toBe(active.flowId);
    expect(
      findLatestTerminalManagedTaskFlowForOwner({ callerOwnerKey: "agent:main:main" })?.flowId,
    ).toBe(terminal.flowId);
  });

  it("authorizes an exact closeout handoff only for the same owner and requester origin", () => {
    const terminal = createManagedTaskFlow({
      ownerKey: "agent:business-ops:subagent:owner",
      controllerId: "tests/owner-access",
      goal: "Closed refinement",
      status: "succeeded",
      requesterOrigin: { channel: "webchat", to: "operator-1" },
      stateJson: {
        candidateRecord: { ref: "candidate.md", digest: "digest-1" },
        proposal: { ref: "proposal.md", digest: "digest-2" },
      },
    });
    const handoff = buildManagedTaskFlowCloseoutHandoffForOwner({
      flowId: terminal.flowId,
      callerOwnerKey: terminal.ownerKey,
    });
    if (!handoff) {
      throw new Error("expected terminal handoff");
    }

    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: terminal.ownerKey,
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson: handoff.stateJson,
      }),
    ).toEqual({ valid: true });
    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: "agent:business-ops:subagent:replacement",
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson: handoff.stateJson,
      }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: terminal.ownerKey,
        requesterOrigin: { channel: "webchat", to: "operator-2" },
        stateJson: handoff.stateJson,
      }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: terminal.ownerKey,
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson: {
          ...handoff.stateJson,
          governingArtifactsDigest: "a".repeat(64),
        },
      }),
    ).toEqual({ valid: false, code: "artifact_mismatch" });
  });
});
