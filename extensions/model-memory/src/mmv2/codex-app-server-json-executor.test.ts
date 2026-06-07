import { describe, expect, it, vi } from "vitest";

const clearSharedCodexAppServerClient = vi.fn();
const getSharedCodexAppServerClient = vi.fn();

vi.mock("../../../codex/runtime-api.ts", () => ({
  clearSharedCodexAppServerClient,
  getSharedCodexAppServerClient,
  resolveCodexAppServerRuntimeOptions: () => ({
    approvalPolicy: "never",
    approvalsReviewer: "never",
    requestTimeoutMs: 1_000,
    sandbox: "danger-full-access",
    start: { command: "codex", args: ["app-server", "--listen", "stdio://"] },
  }),
}));

describe("CodexAppServerJsonExecutor cleanup", () => {
  it("closes the shared Codex app-server client explicitly", async () => {
    const { CodexAppServerJsonExecutor } = await import("./codex-app-server-json-executor.ts");
    const executor = new CodexAppServerJsonExecutor({ requestTimeoutMs: 1_000 });

    executor.close();
    executor.close();

    expect(clearSharedCodexAppServerClient).toHaveBeenCalledTimes(2);
  });

  it("captures multiple allowed Codex app-server dynamic tool calls", async () => {
    const requestHandlers: Array<(request: { method: string; params: unknown }) => unknown> = [];
    const removeRequestHandler = vi.fn();
    const removeNotificationHandler = vi.fn();
    const threadStartParams: unknown[] = [];
    const client = {
      request: vi.fn(async (method: string, params?: unknown) => {
        if (method === "thread/start") {
          threadStartParams.push(params);
          return {
            thread: { id: "thread-1" },
            model: "gpt-5.5-codex",
          };
        }
        if (method === "turn/start") {
          for (const handler of requestHandlers) {
            handler({
              method: "item/tool/call",
              params: {
                threadId: "thread-1",
                turnId: "turn-1",
                callId: "call-1",
                tool: "router_set_route",
                arguments: { route: "workflow_execution" },
              },
            });
            handler({
              method: "item/tool/call",
              params: {
                threadId: "thread-1",
                turnId: "turn-1",
                callId: "call-2",
                tool: "router_select_executor_workflow",
                arguments: { workflowId: "agent_team.coding" },
              },
            });
          }
          return {
            turn: {
              id: "turn-1",
              status: "completed",
              items: [],
            },
          };
        }
        throw new Error(`unexpected request ${method}`);
      }),
      addRequestHandler: vi.fn((handler) => {
        requestHandlers.push(handler);
        return removeRequestHandler;
      }),
      addNotificationHandler: vi.fn(() => removeNotificationHandler),
      close: vi.fn(),
    };
    getSharedCodexAppServerClient.mockResolvedValueOnce(client);
    const { CodexAppServerJsonExecutor } = await import("./codex-app-server-json-executor.ts");
    const executor = new CodexAppServerJsonExecutor({ requestTimeoutMs: 1_000 });

    const result = await executor.executeTools({
      contract: {
        contractName: "router.native_tool_turn",
        contractVersion: "v1",
        modelId: "openai-codex/gpt-5.5",
      },
      systemPrompt: "Route using allowed tools.",
      userPrompt: "{}",
      responseFormat: "json",
      tools: [
        {
          name: "router_set_route",
          description: "Set the route.",
          inputSchema: { type: "object", additionalProperties: true },
        },
        {
          name: "router_select_executor_workflow",
          description: "Select the workflow.",
          inputSchema: { type: "object", additionalProperties: true },
        },
      ],
      allowedToolNames: ["router_set_route", "router_select_executor_workflow"],
      maxAcceptedToolCalls: 2,
      responseOptions: {
        transport: { type: "json_object" },
        maxOutputTokens: 1_000,
      },
    });

    expect(result.toolCalls).toEqual([
      {
        toolName: "router_set_route",
        toolArguments: { route: "workflow_execution" },
        callId: "call-1",
      },
      {
        toolName: "router_select_executor_workflow",
        toolArguments: { workflowId: "agent_team.coding" },
        callId: "call-2",
      },
    ]);
    expect(threadStartParams).toEqual([
      expect.objectContaining({
        dynamicTools: [
          expect.objectContaining({
            name: "router_set_route",
          }),
          expect.objectContaining({
            name: "router_select_executor_workflow",
          }),
        ],
        experimentalRawEvents: true,
      }),
    ]);
    expect(removeRequestHandler).toHaveBeenCalledTimes(1);
    expect(removeNotificationHandler).toHaveBeenCalledTimes(1);
  });
});
