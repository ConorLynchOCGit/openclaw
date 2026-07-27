import { describe, expect, it, vi } from "vitest";
import { registerLobsterPlugin } from "./index.js";
import type { OpenClawPluginApi } from "./runtime-api.js";
import { createFakeTaskFlow } from "./src/taskflow-test-helpers.js";

describe("retained Lobster plugin context", () => {
  it("projects active continuity ahead of a newer terminal flow", () => {
    const activeFlow = {
      flowId: "flow-active",
      syncMode: "managed" as const,
      ownerKey: "agent:business-ops:subagent:owner",
      controllerId: "openclaw.business-ops.collaborative-refinement",
      revision: 4,
      status: "waiting" as const,
      goal: "Refine brand platform",
      stateJson: { proposal: { ref: "candidate.md", digest: "digest-1" } },
      createdAt: 1,
      updatedAt: 2,
      notifyPolicy: "parent" as const,
    };
    const taskFlow = createFakeTaskFlow({
      findLatestActiveManaged: vi.fn().mockReturnValue(activeFlow),
      findLatestTerminalManaged: vi.fn(),
    });
    const bindSession = vi.fn().mockReturnValue(taskFlow);
    let turnPrepare:
      | ((event: unknown, ctx: { sessionKey?: string }) => { prependContext?: string } | undefined)
      | undefined;
    const api = {
      runtime: { tasks: { managedFlows: { bindSession } } },
      on: vi.fn((name, handler) => {
        if (name === "agent_turn_prepare") {
          turnPrepare = handler;
        }
      }),
      registerTool: vi.fn(),
    } as unknown as OpenClawPluginApi;

    registerLobsterPlugin(api);
    const result = turnPrepare?.({}, { sessionKey: activeFlow.ownerKey });

    expect(result?.prependContext).toContain('"revision": 4');
    expect(result?.prependContext).toContain('"ref": "candidate.md"');
    expect(taskFlow.findLatestTerminalManaged).not.toHaveBeenCalled();
    expect(api.registerTool).toHaveBeenCalledTimes(1);
  });

  it("projects the exact terminal handoff when no active flow exists", () => {
    const terminalFlow = {
      flowId: "flow-terminal",
      syncMode: "managed" as const,
      ownerKey: "agent:business-ops:subagent:owner",
      controllerId: "openclaw.business-ops.collaborative-refinement",
      revision: 5,
      status: "failed" as const,
      goal: "Refine brand platform",
      stateJson: { proposal: { ref: "candidate.md", digest: "digest-1" } },
      createdAt: 3,
      updatedAt: 4,
      notifyPolicy: "parent" as const,
    };
    const taskFlow = createFakeTaskFlow({
      findLatestActiveManaged: vi.fn(),
      findLatestTerminalManaged: vi.fn().mockReturnValue(terminalFlow),
      buildCloseoutHandoff: vi.fn().mockReturnValue({
        stateJson: {
          continuitySchema: "openclaw.taskflow.correction.v1",
          priorFlowId: "flow-terminal",
          priorFlowRevision: 5,
          governingArtifactsDigest: "a".repeat(64),
          governingArtifactCount: 1,
        },
        governingArtifacts: [{ ref: "candidate.md", digest: "digest-1" }],
      }),
    });
    let turnPrepare:
      | ((event: unknown, ctx: { sessionKey?: string }) => { prependContext?: string } | undefined)
      | undefined;
    const api = {
      runtime: { tasks: { managedFlows: { bindSession: vi.fn().mockReturnValue(taskFlow) } } },
      on: vi.fn((name, handler) => {
        if (name === "agent_turn_prepare") {
          turnPrepare = handler;
        }
      }),
      registerTool: vi.fn(),
    } as unknown as OpenClawPluginApi;

    registerLobsterPlugin(api);
    const result = turnPrepare?.({}, { sessionKey: terminalFlow.ownerKey });
    expect(result?.prependContext).toContain("openclaw.taskflow.closeout_pointer.v1");
    expect(result?.prependContext).toContain('"priorFlowId": "flow-terminal"');
  });
});
