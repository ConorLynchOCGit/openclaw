import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import "./test-helpers/fast-openclaw-tools-sessions.js";
import { createOpenClawTools } from "./openclaw-tools.js";
import type { NativeTaskForegroundResult } from "./tools/native-task-tool.js";

const callGatewayMock = vi.fn();

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

describe("openclaw-tools native task routing", () => {
  it("routes task through the native child-session runner instead of gateway transport", async () => {
    const runChildTask = vi.fn(
      async (params): Promise<NativeTaskForegroundResult> => ({
        status: "completed",
        foreground: true,
        childSessionKey: `agent:${params.childAgentId}:subagent:child-native`,
        runId: "run-child-native",
        waitStatus: "ok",
        resultText:
          "Direct answer: native task result.\n\nBounded source windows:\n```ts\nexport const routedThroughRunChildTask = true;\n```",
        resultDeliveredToParentContext: true,
      }),
    );
    const tools = createOpenClawTools({
      config: {
        agents: {
          list: [{ id: "execution-coding" }, { id: "execution-context-scout" }],
        },
      } as OpenClawConfig,
      agentSessionKey: "agent:execution-coding:main",
      requesterAgentIdOverride: "execution-coding",
      workspaceDir: "/root/services/openclaw-roles/live",
      disablePluginTools: true,
      nativeTask: {
        enabled: true,
        allowedAgentIds: ["execution-context-scout"],
        runChildTask,
      },
    });
    const task = tools.find((tool) => tool.name === "task");
    expect(task).toBeDefined();

    const result = await task!.execute("tool-call-native-task", {
      agentId: "execution-context-scout",
      task: "Return bounded source context.",
      label: "native route",
      runTimeoutSeconds: 9,
    });

    expect(runChildTask).toHaveBeenCalledWith(
      expect.objectContaining({
        parentSessionKey: "agent:execution-coding:main",
        parentToolCallId: "tool-call-native-task",
        childAgentId: "execution-context-scout",
        task: "Return bounded source context.",
        label: "native route",
        runTimeoutSeconds: 9,
      }),
    );
    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      status: "completed",
      foreground: true,
      nativeChildSessionRuntime: true,
      requestedAgentId: "execution-context-scout",
      resultDeliveredToParentContext: true,
    });
  });
});
