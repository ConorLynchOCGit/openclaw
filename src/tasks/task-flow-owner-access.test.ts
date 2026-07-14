// Verifies task-flow owner access checks for parent and child sessions.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildManagedTaskFlowCloseoutHandoffForOwner,
  findLatestActiveManagedTaskFlowForOwner,
  findLatestTaskFlowForOwner,
  findLatestTerminalManagedTaskFlowForOwner,
  getTaskFlowByIdForOwner,
  listTaskFlowsForOwner,
  resolveTaskFlowForLookupTokenForOwner,
  validateManagedTaskFlowCloseoutHandoffForOwner,
} from "./task-flow-owner-access.js";
import {
  createManagedTaskFlow as createManagedTaskFlowOrNull,
  resetTaskFlowRegistryForTests,
} from "./task-flow-registry.js";
import { configureTaskFlowRegistryRuntime } from "./task-flow-registry.store.js";
import type { TaskFlowRecord } from "./task-flow-registry.types.js";

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

describe("task flow owner access", () => {
  it("returns owner-scoped flows for direct and owner-key lookups", () => {
    const older = createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/owner-access",
      goal: "Older flow",
      createdAt: 100,
      updatedAt: 100,
    });
    const latest = createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/owner-access",
      goal: "Latest flow",
      createdAt: 200,
      updatedAt: 200,
    });

    expect(
      getTaskFlowByIdForOwner({
        flowId: older.flowId,
        callerOwnerKey: "agent:main:main",
      })?.flowId,
    ).toBe(older.flowId);
    expect(
      findLatestTaskFlowForOwner({
        callerOwnerKey: "agent:main:main",
      })?.flowId,
    ).toBe(latest.flowId);
    expect(
      resolveTaskFlowForLookupTokenForOwner({
        token: "agent:main:main",
        callerOwnerKey: "agent:main:main",
      })?.flowId,
    ).toBe(latest.flowId);
    expect(
      listTaskFlowsForOwner({
        callerOwnerKey: "agent:main:main",
      }).map((flow) => flow.flowId),
    ).toEqual([latest.flowId, older.flowId]);
  });

  it("denies cross-owner flow reads", () => {
    const flow = createManagedTaskFlow({
      ownerKey: "agent:main:main",
      controllerId: "tests/owner-access",
      goal: "Hidden flow",
    });

    expect(
      getTaskFlowByIdForOwner({
        flowId: flow.flowId,
        callerOwnerKey: "agent:main:other",
      }),
    ).toBeUndefined();
    expect(
      resolveTaskFlowForLookupTokenForOwner({
        token: flow.flowId,
        callerOwnerKey: "agent:main:other",
      }),
    ).toBeUndefined();
    expect(
      resolveTaskFlowForLookupTokenForOwner({
        token: "agent:main:main",
        callerOwnerKey: "agent:main:other",
      }),
    ).toBeUndefined();
    expect(
      listTaskFlowsForOwner({
        callerOwnerKey: "agent:main:other",
      }),
    ).toStrictEqual([]);
  });

  it("selects active and terminal managed flows without changing generic latest lookup", () => {
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

  it("allows an exact closeout handoff only for the same owner key and requester origin", () => {
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
      callerOwnerKey: "agent:business-ops:subagent:owner",
    });
    if (!handoff) {
      throw new Error("expected terminal handoff");
    }
    const stateJson = handoff.stateJson;

    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: "agent:business-ops:subagent:owner",
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson,
      }),
    ).toEqual({ valid: true });
    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: "agent:business-ops:subagent:replacement",
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson,
      }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: "agent:business-ops:subagent:owner",
        requesterOrigin: { channel: "webchat", to: "operator-2" },
        stateJson,
      }),
    ).toEqual({ valid: false, code: "handoff_not_authorized" });
  });

  it("rejects a closeout handoff when its governing artifact set changed", () => {
    const terminal = createManagedTaskFlow({
      ownerKey: "agent:business-ops:subagent:owner",
      controllerId: "tests/owner-access",
      goal: "Closed refinement",
      status: "succeeded",
      requesterOrigin: { channel: "webchat", to: "operator-1" },
      stateJson: { candidateRecord: { ref: "candidate.md", digest: "digest-1" } },
    });

    expect(
      validateManagedTaskFlowCloseoutHandoffForOwner({
        callerOwnerKey: "agent:business-ops:subagent:owner",
        requesterOrigin: { channel: "webchat", to: "operator-1" },
        stateJson: {
          continuitySchema: "openclaw.taskflow.correction.v1",
          priorFlowId: terminal.flowId,
          priorFlowRevision: terminal.revision,
          governingArtifactsDigest: "a".repeat(64),
          governingArtifactCount: 1,
        },
      }),
    ).toEqual({ valid: false, code: "artifact_mismatch" });
  });
});
