import { describe, expect, it } from "vitest";
import type { DynamicCodingTeamModelClient } from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import type { DynamicCodingTeamToolTurnResult } from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import {
  createOpenRouterProviderModelTurnTransport,
  createOpenRouterProviderTextTurnClient,
  executeModelTurn,
  executeModelToolTurn,
  executeModelToolTurnsInParallel,
  ModelTextTurnEmptyResponseError,
  providerSupportsModelToolTransport,
} from "./model-tool-turn-transport.ts";

const toolDefinition = {
  name: "scheduler_open_work_unit",
  description: "Open one scheduler work unit.",
  inputSchema: {
    type: "object",
    additionalProperties: true,
  },
};

function fakeClient(
  executeProviderToolTurn: (
    input: Parameters<NonNullable<DynamicCodingTeamModelClient["executeProviderToolTurn"]>>[0],
  ) => Promise<DynamicCodingTeamToolTurnResult>,
): DynamicCodingTeamModelClient {
  return {
    runJson: async () => ({
      modelRunRef: "model://unused",
      responseText: "{}",
      responseHash: "unused",
      latencyMs: 0,
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    executeProviderToolTurn,
  };
}

describe("model tool turn transport", () => {
  it("treats Codex app-server as a native multi-tool provider", () => {
    expect(
      providerSupportsModelToolTransport({
        providerPath: "codex_app_server",
        requiredTransport: "native_multi_tool_turn",
      }),
    ).toBe(true);
  });

  it("normalizes accepted and rejected native tool calls under runner ownership", async () => {
    const providerInputs: Array<
      Parameters<NonNullable<DynamicCodingTeamModelClient["executeProviderToolTurn"]>>[0]
    > = [];
    const result = await executeModelToolTurn({
      modelClient: fakeClient(async (input) => {
        providerInputs.push(input);
        return {
          modelRunRef: "model://tool-batch",
          responseHash: "tool-batch-hash",
          latencyMs: 12,
          rawPromptStored: false,
          rawResponseStored: false,
          toolCalls: [
            {
              toolName: "scheduler_open_work_unit",
              toolArguments: { workUnitId: "wu-1" },
              callId: "call-1",
            },
            {
              toolName: "scheduler_unknown_tool",
              toolArguments: {},
              callId: "call-2",
            },
          ],
        };
      }),
      request: {
        owner: "scheduler",
        phaseId: "work_unit_coverage_required",
        modelRef: "openai-codex/gpt-5.5",
        providerPath: "codex_app_server",
        systemPrompt: "Use the allowed scheduler tools.",
        userPayload: { requirements: ["req-1"] },
        tools: [toolDefinition],
        allowedToolNames: [toolDefinition.name],
        requiredToolName: null,
        requiredTransport: "native_multi_tool_turn",
        parallelismPolicy: "single_turn_multi_tool",
        maxAcceptedToolCalls: 1,
        maxOutputTokens: 1_000,
        timeoutMs: 10_000,
        maxAttempts: 1,
        modelTaskCallSite: "test.scheduler",
      },
    });

    expect(result.acceptedToolCalls).toEqual([
      {
        toolName: "scheduler_open_work_unit",
        toolArguments: { workUnitId: "wu-1" },
        callId: "call-1",
      },
    ]);
    expect(result.rejectedToolCalls).toEqual([
      {
        toolName: "scheduler_unknown_tool",
        reason: "tool_not_allowed_for_phase",
        callId: "call-2",
      },
    ]);
    expect(result.rawPromptStored).toBe(false);
    expect(result.rawResponseStored).toBe(false);
    expect(providerInputs[0]?.maxAttempts).toBe(1);
  });

  it("adapts OpenRouter callTools clients into the canonical provider tool transport", async () => {
    const callInputs: unknown[] = [];
    const transport = createOpenRouterProviderModelTurnTransport({
      defaultRoleId: "implementation_engineer",
      client: {
        callTools: async (input) => {
          callInputs.push(input);
          return {
            status: "completed",
            responseHash: "transport-hash",
            toolCalls: [
              {
                toolName: "scheduler_open_work_unit",
                toolArguments: { workUnitId: "wu-transport" },
                callId: "call-transport",
              },
            ],
            errorReasonCode: null,
            httpStatus: 200,
            providerResponseDiagnostics: null,
          };
        },
      },
    });

    const result = await transport?.executeProviderToolTurn?.({
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      systemPrompt: "Use the tool.",
      userPayload: { hello: "world" },
      tools: [toolDefinition],
      allowedToolNames: [toolDefinition.name],
      requiredToolName: toolDefinition.name,
      maxAcceptedToolCalls: 1,
      maxOutputTokens: 1_000,
      timeoutMs: 10_000,
      maxAttempts: 1,
      reasoningEffort: "none",
      taskClass: "tool_selection",
      modelTaskCallSite: "test.transport",
    });

    expect(result).toMatchObject({
      modelRunRef: "openrouter-provider-tool-turn://qwen/qwen3-coder-next/transport-hash",
      responseHash: "transport-hash",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(result?.toolCalls).toEqual([
      {
        toolName: "scheduler_open_work_unit",
        toolArguments: { workUnitId: "wu-transport" },
        callId: "call-transport",
      },
    ]);
    expect(callInputs).toEqual([
      expect.objectContaining({
        roleId: "implementation_engineer",
        modelId: "qwen/qwen3-coder-next",
        reasoningEffort: "none",
        taskClass: "tool_selection",
        modelTaskCallSite: "test.transport",
      }),
    ]);
  });

  it("runs prose text turns through the same canonical model turn API without requiring tools", async () => {
    let toolTurnCalled = false;
    const result = await executeModelTurn({
      modelClient: {
        executeProviderToolTurn: async () => {
          toolTurnCalled = true;
          throw new Error("text_turn_must_not_call_tools");
        },
        executeProviderTextTurn: async (input) => {
          expect(input.phaseId).toBe("node_worker_prompt_authoring");
          expect(input.modelTaskCallSite).toBe("node_lifecycle.node_worker_prompt_authoring");
          return {
            modelRunRef: "model://worker-prompt-text-turn",
            responseText:
              "## Worker Prompt\nCreate update_plan, search, edit, validate, and finish with node_finish.",
            responseHash: "worker-prompt-text-hash",
            latencyMs: 15,
            providerDiagnostics: {
              providerKind: "fixture",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        },
      },
      request: {
        owner: "node_lifecycle",
        phaseId: "node_worker_prompt_authoring",
        resultMode: "text",
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        systemPrompt: "Return a prose worker prompt.",
        userPayload: { nodeId: "impl-1" },
        maxOutputTokens: 4_000,
        timeoutMs: 10_000,
        maxAttempts: 1,
        reasoningEffort: "high",
        modelTaskCallSite: "node_lifecycle.node_worker_prompt_authoring",
      },
    });

    expect(toolTurnCalled).toBe(false);
    expect(result).toMatchObject({
      resultMode: "text",
      status: "completed",
      text: expect.stringContaining("## Worker Prompt"),
      modelRunRef: "model://worker-prompt-text-turn",
      responseHash: "worker-prompt-text-hash",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("preserves provider diagnostics when a text turn returns no assistant text", async () => {
    let caught: unknown = null;
    try {
      await executeModelTurn({
        modelClient: {
          executeProviderTextTurn: async () => ({
            modelRunRef: "model://empty-text",
            responseText: null,
            responseHash: "empty-text-hash",
            latencyMs: 44,
            providerDiagnostics: {
              artifactKind: "provider_text_turn_transport_diagnostics",
              httpStatus: 200,
              errorReasonCode: "openrouter_no_content",
              providerResponseDiagnostics: {
                finishReason: "length",
                contentType: "undefined",
                contentLength: 0,
                providerUsage: {
                  promptTokens: 123,
                  completionTokens: 0,
                  totalTokens: 123,
                },
                requestProfileDiagnostics: {
                  maxTokens: 24_000,
                  promptByteLength: 31_000,
                },
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          }),
        },
        request: {
          owner: "node_lifecycle",
          phaseId: "node_worker_prompt_authoring",
          resultMode: "text",
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          systemPrompt: "Return prose.",
          userPayload: { nodeId: "impl-1" },
          maxOutputTokens: 24_000,
          timeoutMs: 10_000,
          maxAttempts: 1,
          reasoningEffort: "xhigh",
          modelTaskCallSite: "node_lifecycle.node_worker_prompt_authoring",
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ModelTextTurnEmptyResponseError);
    expect(caught).toMatchObject({
      message: "model_text_turn_empty_response:node_lifecycle:node_worker_prompt_authoring",
      modelRunRef: "model://empty-text",
      responseHash: "empty-text-hash",
      latencyMs: 44,
      providerDiagnostics: expect.objectContaining({
        httpStatus: 200,
        providerResponseDiagnostics: expect.objectContaining({
          finishReason: "length",
          providerUsage: expect.objectContaining({
            totalTokens: 123,
          }),
        }),
      }),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("adapts regular OpenRouter callRole clients into canonical text turns without callTools", async () => {
    const calls: string[] = [];
    const textClient = createOpenRouterProviderTextTurnClient({
      defaultRoleId: "implementation_engineer",
      client: {
        callRole: async (input) => {
          calls.push(`role:${input.roleId}:${input.modelTaskCallSite}`);
          expect(input.requestProfileOverride).toMatchObject({
            responseFormatMode: "prompt_only",
          });
          return {
            status: "completed",
            responseText:
              "## Worker Prompt\nPatch the assigned source, validate the touched behavior, then node_finish.",
            responseHash: "role-text-hash",
            errorReasonCode: null,
            httpStatus: 200,
            providerResponseDiagnostics: {
              providerKind: "openrouter",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          };
        },
      },
    });

    const result = await textClient?.executeProviderTextTurn?.({
      owner: "node_lifecycle",
      phaseId: "node_worker_prompt_authoring",
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      systemPrompt: "Return prose.",
      userPayload: { nodeId: "impl-1" },
      maxOutputTokens: 4_000,
      timeoutMs: 10_000,
      maxAttempts: 1,
      reasoningEffort: "high",
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "node_lifecycle.node_worker_prompt_authoring",
    });

    expect(calls).toEqual([
      "role:implementation_engineer:node_lifecycle.node_worker_prompt_authoring",
    ]);
    expect(result).toMatchObject({
      modelRunRef: "openrouter-provider-text-turn://moonshotai/kimi-k2.6/role-text-hash",
      responseText: expect.stringContaining("## Worker Prompt"),
      responseHash: "role-text-hash",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("can construct a text-only client when tool calls are unavailable", () => {
    expect(
      createOpenRouterProviderModelTurnTransport({
        client: {
          callTools: async () => ({
            status: "failed",
            toolCalls: [],
            responseText: "",
            responseHash: "no-tool-client",
            errorReasonCode: "tool_calls_unavailable",
            httpStatus: 501,
            providerResponseDiagnostics: null,
          }),
          callRole: async () => ({
            status: "completed",
            responseText: "plain text",
            responseHash: "plain-text-hash",
            errorReasonCode: null,
            httpStatus: 200,
            providerResponseDiagnostics: null,
          }),
        },
      })?.executeProviderTextTurn,
    ).toEqual(expect.any(Function));
  });

  it("fails unsupported provider/transport pairings before model execution", async () => {
    let called = false;
    await expect(
      executeModelToolTurn({
        modelClient: fakeClient(async () => {
          called = true;
          throw new Error("should_not_call_provider");
        }),
        request: {
          owner: "scheduler",
          phaseId: "worker_context",
          modelRef: "openai-codex/gpt-5.5",
          providerPath: "codex_app_server",
          systemPrompt: "noop",
          userPayload: {},
          tools: [toolDefinition],
          allowedToolNames: [toolDefinition.name],
          requiredToolName: null,
          requiredTransport: "long_lived_worker_tools",
          parallelismPolicy: "sequential_repair",
          maxAcceptedToolCalls: 1,
          maxOutputTokens: 1_000,
          timeoutMs: 10_000,
          modelTaskCallSite: "test.scheduler",
        },
      }),
    ).rejects.toThrow(
      "model_tool_turn_provider_unsupported:worker_context:codex_app_server:long_lived_worker_tools",
    );
    expect(called).toBe(false);
  });

  it("runs independent focused tool sessions in parallel through the canonical provider turn", async () => {
    let clientIndex = 0;
    const results = await executeModelToolTurnsInParallel({
      modelClientFactory: () => {
        clientIndex += 1;
        const currentIndex = clientIndex;
        return fakeClient(async () => ({
          modelRunRef: `model://tool-batch-${currentIndex}`,
          responseHash: `tool-batch-hash-${currentIndex}`,
          latencyMs: 10 + currentIndex,
          rawPromptStored: false,
          rawResponseStored: false,
          toolCalls: [
            {
              toolName: "scheduler_open_work_unit",
              toolArguments: { workUnitId: `wu-${currentIndex}` },
              callId: `call-${currentIndex}`,
            },
          ],
        }));
      },
      requests: [1, 2].map((index) => ({
        owner: "scheduler" as const,
        phaseId: `parallel-${index}`,
        modelRef: "qwen/qwen3-coder-next",
        providerPath: "openrouter",
        systemPrompt: "Use the allowed scheduler tools.",
        userPayload: { requirementId: `req-${index}` },
        tools: [toolDefinition],
        allowedToolNames: [toolDefinition.name],
        requiredToolName: null,
        requiredTransport: "parallel_native_tool_sessions" as const,
        parallelismPolicy: "parallel_focused_sessions" as const,
        maxAcceptedToolCalls: 1,
        maxOutputTokens: 1_000,
        timeoutMs: 10_000,
        modelTaskCallSite: "test.scheduler.parallel",
      })),
    });

    expect(results.map((result) => result.acceptedToolCalls[0]?.toolArguments)).toEqual([
      { workUnitId: "wu-1" },
      { workUnitId: "wu-2" },
    ]);
  });
});
