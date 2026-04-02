import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginToolContext } from "../../api.js";
import type { ToolResultGetInput, ToolResultGetResult } from "../db/runtime.js";
import type { MemoryMiddlewareRuntime } from "../runtime.js";
import { asJsonToolResult, readRequiredString, type ToolRawParams } from "./common.js";

type MemoryToolResultGetRawParams = ToolRawParams;

const MemoryToolResultGetToolSchema = Type.Object(
  {
    toolResultId: Type.String({
      description: "Persisted tool-result id to retrieve in full.",
      minLength: 1,
    }),
  },
  { additionalProperties: false },
);

export function normalizeMemoryToolResultGetInput(
  rawParams: MemoryToolResultGetRawParams,
): ToolResultGetInput {
  return {
    toolResultId: readRequiredString(rawParams, "toolResultId"),
  };
}

export async function getMemoryToolResultFromTool(params: {
  runtime: MemoryMiddlewareRuntime;
  input: ToolResultGetInput;
}): Promise<ToolResultGetResult> {
  return params.runtime.toolResultStore.get(params.input);
}

export function createMemoryToolResultGetTool(params: {
  runtime: MemoryMiddlewareRuntime;
  context?: OpenClawPluginToolContext;
}): AnyAgentTool {
  return {
    name: "memory_tool_result_get",
    label: "Memory Tool Result Get",
    description: "Retrieve a previously persisted bounded tool result in full.",
    parameters: MemoryToolResultGetToolSchema,
    async execute(_toolCallId: string, rawParams: MemoryToolResultGetRawParams) {
      const input = normalizeMemoryToolResultGetInput(rawParams);
      const result = await getMemoryToolResultFromTool({
        runtime: params.runtime,
        input,
      });
      return asJsonToolResult(result);
    },
  };
}
