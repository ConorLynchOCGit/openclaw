import { describe, expect, it, vi } from "vitest";
import { registerLobsterPlugin } from "./index.js";
import type { OpenClawPluginApi } from "./runtime-api.js";
import { createFakeTaskFlow } from "./src/taskflow-test-helpers.js";

describe("registerLobsterPlugin", () => {
  it("projects the latest active managed flow ahead of a newer terminal flow", () => {
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
    const terminalFlow = {
      ...activeFlow,
      flowId: "flow-terminal",
      revision: 5,
      status: "succeeded" as const,
      createdAt: 3,
      updatedAt: 4,
    };
    const taskFlow = createFakeTaskFlow({
      findLatest: vi.fn().mockReturnValue(terminalFlow),
      findLatestActiveManaged: vi.fn().mockReturnValue(activeFlow),
      findLatestTerminalManaged: vi.fn().mockReturnValue(terminalFlow),
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
    const result = turnPrepare?.({}, { sessionKey: "agent:business-ops:subagent:owner" });

    expect(bindSession).toHaveBeenCalledWith({
      sessionKey: "agent:business-ops:subagent:owner",
    });
    expect(result?.prependContext).toContain('"revision": 4');
    expect(result?.prependContext).toContain('"ref": "candidate.md"');
    expect(result?.prependContext).not.toContain("flow-terminal");
    expect(taskFlow.findLatest).not.toHaveBeenCalled();
    expect(taskFlow.findLatestActiveManaged).toHaveBeenCalledOnce();
    expect(taskFlow.findLatestTerminalManaged).not.toHaveBeenCalled();
  });

  it("falls back to the latest terminal managed flow as a closeout pointer", () => {
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
    const result = turnPrepare?.({}, { sessionKey: "agent:business-ops:subagent:owner" });

    expect(result?.prependContext).toContain("openclaw.taskflow.closeout_pointer.v1");
    expect(result?.prependContext).toContain('"priorFlowId": "flow-terminal"');
    expect(taskFlow.findLatestActiveManaged).toHaveBeenCalledOnce();
    expect(taskFlow.findLatestTerminalManaged).toHaveBeenCalledOnce();
    expect(taskFlow.buildCloseoutHandoff).toHaveBeenCalledWith("flow-terminal");
  });

  it("materializes proposal presentation only for Business Ops with a bound workspace", () => {
    const factories: Array<(ctx: Record<string, unknown>) => { name?: string } | null> = [];
    const taskFlow = createFakeTaskFlow();
    const fromToolContext = vi.fn().mockReturnValue(taskFlow);
    const api = {
      runtime: {
        tasks: {
          managedFlows: {
            bindSession: vi.fn().mockReturnValue(taskFlow),
            fromToolContext,
          },
        },
      },
      on: vi.fn(),
      registerTool: vi.fn((factory) => factories.push(factory)),
    } as unknown as OpenClawPluginApi;

    registerLobsterPlugin(api);

    expect(factories).toHaveLength(2);
    expect(api.registerTool).toHaveBeenNthCalledWith(1, expect.any(Function), {
      name: "lobster",
      optional: true,
    });
    expect(api.registerTool).toHaveBeenNthCalledWith(2, expect.any(Function), {
      name: "business_ops_present_proposal",
      optional: true,
    });
    expect(
      factories[1]?.({
        agentId: "business-ops",
        sessionKey: "agent:business-ops:owner",
        workspaceDir: "/workspace",
      })?.name,
    ).toBe("business_ops_present_proposal");
    expect(
      factories[1]?.({
        agentId: "main",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      }),
    ).toBeNull();
    expect(fromToolContext).toHaveBeenCalledOnce();
  });
});
