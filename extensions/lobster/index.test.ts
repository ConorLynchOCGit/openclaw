import { describe, expect, it, vi } from "vitest";
import { registerLobsterPlugin } from "./index.js";
import type { OpenClawPluginApi } from "./runtime-api.js";
import { createFakeTaskFlow } from "./src/taskflow-test-helpers.js";

describe("registerLobsterPlugin", () => {
  it("projects only the latest flow owned by the current session", () => {
    const taskFlow = createFakeTaskFlow({
      findLatest: vi.fn().mockReturnValue({
        flowId: "flow-1",
        syncMode: "managed",
        ownerKey: "agent:business-ops:subagent:owner",
        controllerId: "openclaw.business-ops.collaborative-refinement",
        revision: 4,
        status: "waiting",
        goal: "Refine brand platform",
        stateJson: { proposal: { ref: "candidate.md", digest: "digest-1" } },
        createdAt: 1,
        updatedAt: 2,
        notifyPolicy: "parent",
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

    expect(bindSession).toHaveBeenCalledWith({
      sessionKey: "agent:business-ops:subagent:owner",
    });
    expect(result?.prependContext).toContain('"revision": 4');
    expect(result?.prependContext).toContain('"ref": "candidate.md"');
  });
});
